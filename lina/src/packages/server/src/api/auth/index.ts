import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { logger } from '@elizaos/core';
import { SiweMessage } from 'siwe';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { sendError, sendSuccess } from '../shared/response-utils';
import { generateAuthToken, generateWalletAuthToken, type AuthenticatedRequest } from '../../middleware';

// In-memory nonce store (in production, use Redis or database)
const nonceStore = new Map<string, { nonce: string; createdAt: number }>();
const NONCE_TTL = 5 * 60 * 1000; // 5 minutes

// Clean up expired nonces periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of nonceStore.entries()) {
    if (now - value.createdAt > NONCE_TTL) {
      nonceStore.delete(key);
    }
  }
}, 60 * 1000); // Clean every minute

/**
 * Derive deterministic userId from wallet address
 * Returns a valid UUID v4 format (required by ElizaOS entity API)
 */
function deriveUserId(chain: 'evm' | 'solana', walletAddress: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`lina:${chain}:${walletAddress.toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);

  // Format as UUID v4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // Set version (4) and variant bits
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${['8', '9', 'a', 'b'][parseInt(hash[16], 16) % 4]}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function createAuthRouter(): express.Router {
  const router = express.Router();
  
  /**
   * POST /api/auth/login
   * 
   * Authenticates a user and issues a JWT token.
   * Uses CDP's userId as the primary identifier.
   * 
   * Request body:
   * - email: string (user's email from CDP)
   * - username: string (user's display name from CDP)
   * - cdpUserId: string (CDP's user identifier - UUID)
   * 
   * Response:
   * - token: string (JWT token for authenticated requests)
   * - userId: string (same as cdpUserId)
   * - username: string (user's display name)
   * - expiresIn: string (token expiration time)
   */
  router.post('/login', async (req, res) => {
    try {
      const { email, username, cdpUserId } = req.body;
      
      // Validate email
      if (!email || typeof email !== 'string') {
        return sendError(res, 400, 'INVALID_REQUEST', 'Email is required');
      }
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return sendError(res, 400, 'INVALID_EMAIL', 'Invalid email format');
      }
      
      // Validate username
      if (!username || typeof username !== 'string') {
        return sendError(res, 400, 'INVALID_REQUEST', 'Username is required');
      }
      
      // Validate CDP userId
      if (!cdpUserId || typeof cdpUserId !== 'string') {
        return sendError(res, 400, 'INVALID_REQUEST', 'CDP userId is required');
      }
      
      // Validate UUID format (CDP uses UUIDs)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(cdpUserId)) {
        return sendError(res, 400, 'INVALID_CDP_USER_ID', 'CDP userId must be a valid UUID');
      }
      
      // Use CDP's userId directly (no generation needed)
      const userId = cdpUserId;
      
      // Generate JWT token with email and username
      const token = generateAuthToken(userId, email, username);
      
      logger.info(`[Auth] User authenticated: ${username} (${email}) (userId: ${userId.substring(0, 8)}...)`);
      
      return sendSuccess(res, {
        token,
        userId,
        username,
        expiresIn: '7d'
      });
    } catch (error: any) {
      logger.error('[Auth] Login error:', error);
      return sendError(res, 500, 'AUTH_ERROR', error.message);
    }
  });
  
  /**
   * POST /api/auth/refresh
   * 
   * Refreshes an existing JWT token (extends expiration)
   * 
   * Headers:
   * - Authorization: Bearer <token>
   * 
   * Response:
   * - token: string (new JWT token)
   * - userId: string
   * - expiresIn: string
   * 
   * This allows extending user sessions without requiring re-authentication
   */
  router.post('/refresh', async (req: AuthenticatedRequest, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return sendError(res, 401, 'UNAUTHORIZED', 'No token provided');
      }
      
      const oldToken = authHeader.substring(7);
      const JWT_SECRET = process.env.JWT_SECRET;
      
      if (!JWT_SECRET) {
        return sendError(res, 500, 'SERVER_MISCONFIGURED', 'JWT_SECRET not configured');
      }
      
      try {
        const decoded = jwt.verify(oldToken, JWT_SECRET) as any;
        
        // Issue new token with extended expiration
        const newToken = generateAuthToken(decoded.userId, decoded.email, decoded.username);
        
        logger.info(`[Auth] Token refreshed for: ${decoded.username} (userId: ${decoded.userId.substring(0, 8)}...)`);
        
        return sendSuccess(res, {
          token: newToken,
          userId: decoded.userId,
          username: decoded.username,
          expiresIn: '7d'
        });
      } catch (error: any) {
        // Token verification failed
        logger.warn(`[Auth] Token refresh failed: ${error.message}`);
        return sendError(res, 401, 'INVALID_TOKEN', 'Invalid or expired token');
      }
    } catch (error: any) {
      logger.error('[Auth] Refresh error:', error);
      return sendError(res, 500, 'REFRESH_ERROR', error.message);
    }
  });
  
  /**
   * GET /api/auth/me
   * 
   * Get current authenticated user info
   * Useful for validating tokens and getting user details
   * 
   * Headers:
   * - Authorization: Bearer <token>
   * 
   * Response:
   * - userId: string
   * - email: string
   */
  router.get('/me', async (req: AuthenticatedRequest, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return sendError(res, 401, 'UNAUTHORIZED', 'No token provided');
      }
      
      const token = authHeader.substring(7);
      const JWT_SECRET = process.env.JWT_SECRET;
      
      if (!JWT_SECRET) {
        return sendError(res, 500, 'SERVER_MISCONFIGURED', 'JWT_SECRET not configured');
      }
      
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        
        return sendSuccess(res, {
          userId: decoded.userId,
          email: decoded.email,
          username: decoded.username
        });
      } catch (error: any) {
        return sendError(res, 401, 'INVALID_TOKEN', 'Invalid or expired token');
      }
    } catch (error: any) {
      logger.error('[Auth] Get user info error:', error);
      return sendError(res, 500, 'AUTH_ERROR', error.message);
    }
  });
  
  // ============================================
  // WALLET-BASED AUTH (SIWE/SIWS)
  // ============================================

  /**
   * GET /api/auth/nonce
   *
   * Generate a random nonce for wallet signature.
   * Nonce expires after 5 minutes.
   *
   * Response:
   * - nonce: string (random hex string)
   */
  router.get('/nonce', async (req, res) => {
    try {
      const nonce = crypto.randomBytes(32).toString('hex');
      const clientId = req.ip || 'unknown';

      // Store nonce with timestamp
      nonceStore.set(clientId, { nonce, createdAt: Date.now() });

      logger.debug(`[Auth] Generated nonce for client: ${clientId}`);

      return sendSuccess(res, { nonce });
    } catch (error: any) {
      logger.error('[Auth] Nonce generation error:', error);
      return sendError(res, 500, 'NONCE_ERROR', error.message);
    }
  });

  /**
   * POST /api/auth/verify
   *
   * Verify wallet signature and issue JWT token.
   * Supports both EVM (SIWE) and Solana (SIWS) signatures.
   *
   * Request body:
   * - message: string (the signed message)
   * - signature: string (the signature)
   * - chain: 'evm' | 'solana'
   *
   * Response:
   * - token: string (JWT token)
   * - userId: string (derived from wallet address)
   * - walletAddress: string
   * - chain: string
   * - expiresIn: string
   */
  router.post('/verify', async (req, res) => {
    try {
      const { message, signature, chain } = req.body;

      // Validate inputs
      if (!message || typeof message !== 'string') {
        return sendError(res, 400, 'INVALID_REQUEST', 'Message is required');
      }

      if (!signature || typeof signature !== 'string') {
        return sendError(res, 400, 'INVALID_REQUEST', 'Signature is required');
      }

      if (!chain || !['evm', 'solana'].includes(chain)) {
        return sendError(res, 400, 'INVALID_REQUEST', 'Chain must be "evm" or "solana"');
      }

      let walletAddress: string;

      if (chain === 'evm') {
        // Verify EVM signature using SIWE
        try {
          const siweMessage = new SiweMessage(message);
          const { data: fields } = await siweMessage.verify({ signature });
          walletAddress = fields.address;

          // Verify nonce if we stored one
          const clientId = req.ip || 'unknown';
          const storedNonce = nonceStore.get(clientId);
          if (storedNonce && storedNonce.nonce !== fields.nonce) {
            return sendError(res, 401, 'INVALID_NONCE', 'Nonce mismatch');
          }

          // Clear used nonce
          nonceStore.delete(clientId);

        } catch (error: any) {
          logger.warn(`[Auth] SIWE verification failed: ${error.message}`);
          return sendError(res, 401, 'INVALID_SIGNATURE', 'EVM signature verification failed');
        }
      } else {
        // Verify Solana signature
        try {
          // Parse the message to extract wallet address
          // Expected format: "Sign in to Lina\nWallet: <address>\nNonce: <nonce>\nTimestamp: <ts>"
          const addressMatch = message.match(/Wallet:\s*([1-9A-HJ-NP-Za-km-z]{32,44})/);
          if (!addressMatch) {
            return sendError(res, 400, 'INVALID_MESSAGE', 'Could not extract wallet address from message');
          }

          walletAddress = addressMatch[1];

          // Verify the signature
          const publicKey = new PublicKey(walletAddress);
          const messageBytes = new TextEncoder().encode(message);
          const signatureBytes = bs58.decode(signature);

          const isValid = nacl.sign.detached.verify(
            messageBytes,
            signatureBytes,
            publicKey.toBytes()
          );

          if (!isValid) {
            return sendError(res, 401, 'INVALID_SIGNATURE', 'Solana signature verification failed');
          }

          // Verify nonce if present in message
          const nonceMatch = message.match(/Nonce:\s*([a-f0-9]+)/i);
          if (nonceMatch) {
            const clientId = req.ip || 'unknown';
            const storedNonce = nonceStore.get(clientId);
            if (storedNonce && storedNonce.nonce !== nonceMatch[1]) {
              return sendError(res, 401, 'INVALID_NONCE', 'Nonce mismatch');
            }
            nonceStore.delete(clientId);
          }

        } catch (error: any) {
          logger.warn(`[Auth] Solana signature verification failed: ${error.message}`);
          return sendError(res, 401, 'INVALID_SIGNATURE', 'Solana signature verification failed');
        }
      }

      // Derive userId from wallet address
      const userId = deriveUserId(chain, walletAddress);

      // Generate JWT token
      const token = generateWalletAuthToken(userId, walletAddress, chain);

      logger.info(`[Auth] Wallet authenticated: ${walletAddress.substring(0, 8)}... (${chain}) -> userId: ${userId.substring(0, 8)}...`);

      return sendSuccess(res, {
        token,
        userId,
        walletAddress,
        chain,
        expiresIn: '7d'
      });
    } catch (error: any) {
      logger.error('[Auth] Verify error:', error);
      return sendError(res, 500, 'VERIFY_ERROR', error.message);
    }
  });

  return router;
}

