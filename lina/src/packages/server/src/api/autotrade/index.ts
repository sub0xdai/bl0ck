// src/packages/server/src/api/autotrade/index.ts
import express from 'express';
import { logger } from '@elizaos/core';
import { PublicKey } from '@solana/web3.js';
import type { AgentServer } from '../../index';
import { sendError, sendSuccess } from '../shared/response-utils';
import { requireAuth, type AuthenticatedRequest } from '../../middleware';
import type { AutotradeService, PaymentVerifier } from '../../../../../services/autotrade';
import { SolanaTransactionManager } from '../../../../../managers/solana-transaction-manager';

// USDC mint addresses
const USDC_MINT_MAINNET = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_MINT_DEVNET = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

export interface AutotradeRouterConfig {
  autotradeService: AutotradeService;
  paymentVerifier: PaymentVerifier;
  treasuryWallet: string;
  priceBaseUnits: string;
}

/**
 * Create autotrade API router
 * Handles subscription start/stop/status with x402 payment flow
 */
export function autotradeRouter(
  _serverInstance: AgentServer,
  config: AutotradeRouterConfig
): express.Router {
  const { autotradeService, paymentVerifier, treasuryWallet, priceBaseUnits } = config;
  const router = express.Router();

  // SECURITY: Require authentication for all autotrade operations
  router.use(requireAuth);

  /**
   * POST /api/autotrade/start
   * Returns 402 if not paid, activates subscription on valid payment proof
   */
  router.post('/start', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;

      // Check for payment proof header
      const paymentProof = req.headers['x-payment-proof'] as string;

      if (!paymentProof) {
        // Return 402 Payment Required with x402 format
        const paymentRequired = await autotradeService.getPaymentRequired(userId);
        return res.status(402).json(paymentRequired);
      }

      // Parse and verify payment proof
      let proof: { signature: string };
      try {
        proof = JSON.parse(Buffer.from(paymentProof, 'base64').toString());
      } catch (parseError) {
        return sendError(res, 400, 'INVALID_PAYMENT_PROOF', 'Failed to parse payment proof');
      }

      if (!proof.signature) {
        return sendError(res, 400, 'MISSING_SIGNATURE', 'Payment proof missing signature');
      }

      // Verify the payment on-chain
      const verification = await paymentVerifier.verify({
        signature: proof.signature,
        expectedAmount: priceBaseUnits,
        expectedRecipient: treasuryWallet,
      });

      if (!verification.valid) {
        logger.warn(`[Autotrade API] Payment verification failed: ${verification.error}`);
        return sendError(res, 402, 'PAYMENT_INVALID', verification.error || 'Payment verification failed');
      }

      await autotradeService.activateSubscription(userId, proof.signature);

      const status = await autotradeService.getStatus(userId);
      return sendSuccess(res, {
        message: 'Autotrade activated',
        subscription: status,
      });

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('[Autotrade API] /start error:', msg);
      return sendError(res, 500, 'START_FAILED', 'Failed to start autotrade', msg);
    }
  });

  /**
   * POST /api/autotrade/stop
   * Deactivates subscription (position closure should be handled separately)
   */
  router.post('/stop', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;

      await autotradeService.stopAutotrade(userId);

      return sendSuccess(res, {
        message: 'Autotrade stopped',
      });

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('[Autotrade API] /stop error:', msg);

      // Return 400 for "No active subscription" errors, 500 for others
      const statusCode = msg.includes('No active subscription') ? 400 : 500;
      return sendError(res, statusCode, 'STOP_FAILED', msg);
    }
  });

  /**
   * GET /api/autotrade/status
   * Returns current subscription status
   */
  router.get('/status', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;

      const subscription = await autotradeService.getStatus(userId);
      const isActive = subscription?.status === 'active' && Date.now() < subscription.expiresAt;

      return sendSuccess(res, {
        active: isActive,
        subscription,
      });

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('[Autotrade API] /status error:', msg);
      return sendError(res, 500, 'STATUS_FAILED', 'Failed to get autotrade status', msg);
    }
  });

  /**
   * POST /api/autotrade/pay-and-activate
   * Server-side payment flow for users with agent-managed wallets
   * 1. Checks USDC balance
   * 2. Transfers USDC from user's wallet to treasury
   * 3. Activates subscription
   */
  router.post('/pay-and-activate', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;

      // Check if already active
      const existingStatus = await autotradeService.getStatus(userId);
      if (existingStatus?.status === 'active' && Date.now() < existingStatus.expiresAt) {
        return sendError(res, 400, 'ALREADY_ACTIVE', 'Autotrade subscription is already active');
      }

      // Get Solana manager and determine network
      const solanaManager = SolanaTransactionManager.getInstance();
      const network = process.env.SOLANA_NETWORK === 'solana' ? 'mainnet-beta' : 'devnet';
      const usdcMint = network === 'mainnet-beta'
        ? USDC_MINT_MAINNET.toBase58()
        : USDC_MINT_DEVNET.toBase58();

      // Check USDC balance using getSplTokenBalance
      const priceAmount = BigInt(priceBaseUnits);
      let balance: bigint;
      try {
        const balanceResult = await solanaManager.getSplTokenBalance(userId, usdcMint);
        balance = balanceResult.balance;
      } catch (balanceError) {
        const msg = balanceError instanceof Error ? balanceError.message : String(balanceError);
        logger.error('[Autotrade API] Failed to get USDC balance:', msg);
        return sendError(res, 400, 'BALANCE_CHECK_FAILED', 'Failed to check USDC balance', msg);
      }

      if (balance < priceAmount) {
        const needed = Number(priceAmount) / 1_000_000;
        const have = Number(balance) / 1_000_000;
        return sendError(
          res,
          400,
          'INSUFFICIENT_BALANCE',
          `Insufficient USDC balance. Need $${needed.toFixed(2)}, have $${have.toFixed(2)}`
        );
      }

      // Transfer USDC to treasury using sendToken
      let txSignature: string;
      try {
        const result = await solanaManager.sendToken({
          userId,
          to: treasuryWallet,
          amount: priceBaseUnits,
          mint: usdcMint,
        });
        txSignature = result.transactionHash;
        logger.info(`[Autotrade API] Payment sent: ${txSignature}`);
      } catch (transferError) {
        const msg = transferError instanceof Error ? transferError.message : String(transferError);
        logger.error('[Autotrade API] Payment transfer failed:', msg);
        return sendError(res, 500, 'PAYMENT_FAILED', 'Failed to send payment', msg);
      }

      // Activate subscription
      await autotradeService.activateSubscription(userId, txSignature);

      const status = await autotradeService.getStatus(userId);
      return sendSuccess(res, {
        message: 'Autotrade activated',
        txSignature,
        subscription: status,
      });

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('[Autotrade API] /pay-and-activate error:', msg);
      return sendError(res, 500, 'ACTIVATION_FAILED', 'Failed to activate autotrade', msg);
    }
  });

  /**
   * POST /api/autotrade/renew
   * Manually trigger renewal check (normally done automatically)
   */
  router.post('/renew', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;

      const result = await autotradeService.checkAndRenew(userId);

      if (result.stopped) {
        return sendSuccess(res, {
          renewed: false,
          stopped: true,
          message: result.reason || 'Subscription stopped',
        });
      }

      if (result.renewed) {
        const status = await autotradeService.getStatus(userId);
        return sendSuccess(res, {
          renewed: true,
          stopped: false,
          subscription: status,
        });
      }

      return sendSuccess(res, {
        renewed: false,
        stopped: false,
        message: 'Subscription not yet expired',
      });

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('[Autotrade API] /renew error:', msg);
      return sendError(res, 500, 'RENEW_FAILED', 'Failed to renew autotrade', msg);
    }
  });

  return router;
}
