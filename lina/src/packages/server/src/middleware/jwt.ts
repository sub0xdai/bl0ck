import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '@elizaos/core';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  logger.warn('[Auth] JWT_SECRET not set - authentication will not work. Set JWT_SECRET environment variable.');
}

export interface AuthTokenPayload {
  userId: string;
  email?: string;
  username?: string;
  walletAddress?: string;
  chain?: 'evm' | 'solana';
  isAdmin?: boolean;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  username?: string;
  walletAddress?: string;
  chain?: 'evm' | 'solana';
  isAdmin?: boolean;
  isServerAuthenticated?: boolean;
}

/**
 * Generate JWT authentication token
 * Uses CDP's userId directly (no generation or salting needed)
 */
export function generateAuthToken(userId: string, email: string, username: string, isAdmin?: boolean): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }
  
  // Check if user is admin based on environment variable
  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || [];
  const computedIsAdmin = isAdmin || adminEmails.includes(email.toLowerCase());
  
  const payload: Omit<AuthTokenPayload, 'iat' | 'exp'> = {
    userId,
    email,
    username,
    ...(computedIsAdmin && { isAdmin: true }),
  };
  
  return jwt.sign(
    payload,
    JWT_SECRET,
    { expiresIn: '7d' } // Token expires in 7 days
  );
}

/**
 * Generate JWT authentication token for wallet-based auth
 * Uses wallet address as the primary identifier
 */
export function generateWalletAuthToken(
  userId: string,
  walletAddress: string,
  chain: 'evm' | 'solana',
  isAdmin?: boolean
): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }

  // Check if wallet is admin based on environment variable
  const adminWallets = process.env.ADMIN_WALLETS?.split(',').map(w => w.trim().toLowerCase()) || [];
  const computedIsAdmin = isAdmin || adminWallets.includes(walletAddress.toLowerCase());

  const payload: Omit<AuthTokenPayload, 'iat' | 'exp'> = {
    userId,
    walletAddress,
    chain,
    ...(computedIsAdmin && { isAdmin: true }),
  };

  return jwt.sign(
    payload,
    JWT_SECRET,
    { expiresIn: '7d' } // Token expires in 7 days
  );
}

/**
 * Middleware to verify JWT token and extract user info
 * Requires authentication - returns 401 if no valid token
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!JWT_SECRET) {
    logger.error('[Auth] JWT_SECRET not configured - cannot verify tokens');
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_MISCONFIGURED',
        message: 'Authentication system not properly configured'
      }
    });
  }

  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please provide a valid Bearer token.'
      }
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.username = decoded.username;
    req.walletAddress = decoded.walletAddress;
    req.chain = decoded.chain;
    req.isAdmin = decoded.isAdmin || false;

    // Log successful auth (debug level to avoid spam)
    const identifier = decoded.walletAddress
      ? `wallet: ${decoded.walletAddress.substring(0, 8)}... (${decoded.chain})`
      : `user: ${decoded.username}`;
    logger.debug(`[Auth] Authenticated request from ${identifier} (${decoded.userId.substring(0, 8)}...)${req.isAdmin ? ' [ADMIN]' : ''}`);

    next();
  } catch (error: any) {
    logger.warn(`[Auth] Token verification failed: ${error.message}`);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Authentication token has expired. Please sign in again.'
        }
      });
    }
    
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token.'
      }
    });
  }
}

/**
 * Optional middleware for endpoints that work with or without auth
 * If token is provided and valid, sets userId and userEmail
 * If token is invalid or missing, continues without setting them
 */
export function optionalAuth(req: AuthenticatedRequest, next: NextFunction) {
  if (!JWT_SECRET) {
    return next();
  }

  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.username = decoded.username;
    req.walletAddress = decoded.walletAddress;
    req.chain = decoded.chain;
    req.isAdmin = decoded.isAdmin || false;
  } catch (error) {
    // Ignore invalid tokens for optional auth
    logger.debug('[Auth] Optional auth - invalid token ignored');
  }

  next();
}

/**
 * Middleware to accept either JWT Bearer token or X-API-KEY.
 * - If JWT is valid, sets user fields on request.
 * - If X-API-KEY matches ELIZA_SERVER_AUTH_TOKEN, marks request as server-authenticated.
 * - Otherwise, returns 401.
 */
export function requireAuthOrApiKey(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // First try standard JWT auth
  const authHeader = req.headers.authorization;
  const serverAuthToken = process.env.ELIZA_SERVER_AUTH_TOKEN;

  // Try JWT path if present
  if (authHeader && authHeader.startsWith('Bearer ')) {
    if (!JWT_SECRET) {
      logger.error('[Auth] JWT_SECRET not configured - cannot verify tokens');
      return res.status(500).json({
        success: false,
        error: { code: 'SERVER_MISCONFIGURED', message: 'Authentication system not properly configured' },
      });
    }

    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
      req.userId = decoded.userId;
      req.userEmail = decoded.email;
      req.username = decoded.username;
      req.walletAddress = decoded.walletAddress;
      req.chain = decoded.chain;
      req.isAdmin = decoded.isAdmin || false;
      const identifier = decoded.walletAddress
        ? `wallet: ${decoded.walletAddress.substring(0, 8)}... (${decoded.chain})`
        : `user: ${decoded.username}`;
      logger.debug(`[Auth] Authenticated via JWT: ${identifier} (${decoded.userId.substring(0, 8)}...)${req.isAdmin ? ' [ADMIN]' : ''}`);
      return next();
    } catch (error: any) {
      logger.warn(`[Auth] JWT verification failed in requireAuthOrApiKey: ${error.message}`);
      // Fall through to API key check
    }
  }

  // Try API key path
  const apiKey = (req.headers?.['x-api-key'] as string | undefined) || undefined;
  if (serverAuthToken && apiKey && apiKey === serverAuthToken) {
    req.isServerAuthenticated = true;
    logger.debug('[Auth] Authenticated via X-API-KEY (server)');
    return next();
  }

  // Neither JWT nor API key valid
  return res.status(401).json({
    success: false,
    error: { code: 'UNAUTHORIZED', message: 'Authentication required (Bearer token or X-API-KEY).' },
  });
}

/**
 * Middleware to require admin access
 * Must be used after requireAuth middleware
 */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.isAdmin) {
    logger.warn(`[Auth] Non-admin user ${req.username} (${req.userId?.substring(0, 8)}...) attempted admin operation`);
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Administrator privileges required for this operation'
      }
    });
  }

  next();
}

/**
 * Socket.IO authentication result
 */
export interface SocketAuthResult {
  success: boolean;
  userId?: string;
  error?: string;
}

/**
 * Verify JWT token from Socket.IO handshake
 * Extracts token from socket.handshake.auth.token or Authorization header
 * Sets socket.data.userId if valid
 */
export function verifySocketToken(socket: any): SocketAuthResult {
  if (!JWT_SECRET) {
    return { success: false, error: 'JWT_SECRET not configured' };
  }

  // Try to get token from handshake auth object (preferred)
  let token = socket.handshake?.auth?.token;

  // Fallback to Authorization header
  if (!token) {
    const authHeader = socket.handshake?.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return { success: false, error: 'No authentication token provided' };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;

    // Store userId on socket.data for later validation
    socket.data = socket.data || {};
    socket.data.userId = decoded.userId;
    socket.data.walletAddress = decoded.walletAddress;
    socket.data.chain = decoded.chain;
    socket.data.isAdmin = decoded.isAdmin || false;

    logger.debug(
      `[SocketIO Auth] Authenticated socket ${socket.id}: userId=${decoded.userId.substring(0, 8)}...`
    );

    return { success: true, userId: decoded.userId };
  } catch (error: any) {
    logger.warn(
      `[SocketIO Auth] Invalid token for socket ${socket.id}: ${error.message}`
    );
    return { success: false, error: error.message };
  }
}

/**
 * Validate that the senderId in a message matches the authenticated socket user
 * Returns the validated userId or null if validation fails
 */
export function validateSocketSenderId(socket: any, senderId: string): { valid: boolean; userId: string | null; error?: string } {
  const authenticatedUserId = socket.data?.userId;

  // If socket is not authenticated, log warning but allow (for dev/testing)
  // In production, you may want to reject unauthenticated messages
  if (!authenticatedUserId) {
    logger.warn(
      `[SocketIO Auth] Message from unauthenticated socket ${socket.id}. ` +
      `senderId="${senderId.substring(0, 8)}..." - SECURITY: Enable auth in production!`
    );
    // Allow but return the provided senderId (legacy behavior)
    return { valid: true, userId: senderId };
  }

  // Validate senderId matches authenticated user
  if (senderId !== authenticatedUserId) {
    logger.error(
      `[SocketIO Auth] SECURITY VIOLATION: Socket ${socket.id} authenticated as ` +
      `"${authenticatedUserId.substring(0, 8)}..." but claimed senderId="${senderId.substring(0, 8)}..."`
    );
    return {
      valid: false,
      userId: null,
      error: 'senderId does not match authenticated user'
    };
  }

  return { valid: true, userId: authenticatedUserId };
}

