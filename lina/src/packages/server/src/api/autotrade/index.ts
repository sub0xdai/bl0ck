// src/packages/server/src/api/autotrade/index.ts
import express from 'express';
import { logger } from '@elizaos/core';
import type { AgentServer } from '../../index';
import { sendError, sendSuccess } from '../shared/response-utils';
import { requireAuth, type AuthenticatedRequest } from '../../middleware';
import type { AutotradeService } from '@/services/autotrade';

/**
 * Create autotrade API router
 * Handles subscription start/stop/status with x402 payment flow
 */
export function autotradeRouter(
  _serverInstance: AgentServer,
  autotradeService: AutotradeService
): express.Router {
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

      // TODO: Add on-chain verification in production
      // For now, trust the payment proof (devnet only)
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
