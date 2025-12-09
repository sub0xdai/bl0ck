import express from 'express';
import { logger } from '@elizaos/core';
import type { ElizaOS } from '@elizaos/core';
import type { AgentServer } from '../../index';
import { sendError, sendSuccess } from '../shared/response-utils';
import { requireAuth, type AuthenticatedRequest } from '../../middleware';

// Service name must match the one defined in plugin-drift constants
const DRIFT_SERVICE_NAME = 'DRIFT_SERVICE';

/**
 * Type for the Drift service from plugin-drift
 * We define this here to avoid importing from the plugin
 */
interface DriftServiceInterface {
  getPositions(userId: string): Promise<DriftPosition[]>;
  getAccountInfo(userId: string): Promise<DriftAccountInfo>;
}

interface DriftPosition {
  marketIndex: number;
  marketSymbol: string;
  side: 'long' | 'short';
  size: string;
  notionalValue: string;
  entryPrice: string;
  markPrice: string;
  liquidationPrice: string;
  unrealizedPnl: string;
  leverage: number;
  marginUsed: string;
}

interface DriftAccountInfo {
  authority: string;
  subAccountId: number;
  collateral: string;
  freeCollateral: string;
  totalPositionValue: string;
  unrealizedPnl: string;
  marginRatio: string;
  leverage: number;
}

/**
 * Get the Drift service from the first agent that has it
 */
function getDriftService(elizaOS: ElizaOS): DriftServiceInterface | null {
  const agents = elizaOS.getAgents();

  for (const agent of agents) {
    const service = agent.getService(DRIFT_SERVICE_NAME);
    if (service) {
      // Cast via unknown to satisfy TypeScript (Service is a generic base type)
      return service as unknown as DriftServiceInterface;
    }
  }

  return null;
}

/**
 * Creates the Drift router for perpetual trading data
 * All endpoints require JWT authentication
 */
export function driftRouter(elizaOS: ElizaOS, _serverInstance: AgentServer): express.Router {
  const router = express.Router();

  // SECURITY: Require authentication for all Drift operations
  router.use(requireAuth);

  /**
   * GET /api/drift/positions
   * Get all open perpetual positions for the authenticated user
   * Returns live data from Drift Protocol via WebSocket subscriptions
   */
  router.get('/positions', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      logger.info(`[Drift API] Fetching positions for user: ${userId.substring(0, 8)}...`);

      const driftService = getDriftService(elizaOS);

      if (!driftService) {
        return sendError(
          res,
          503,
          'SERVICE_UNAVAILABLE',
          'Drift service is not available',
          'Drift plugin may not be loaded or initialized'
        );
      }

      try {
        const positions = await driftService.getPositions(userId);

        sendSuccess(res, {
          positions,
          hasAccount: true,
        });
      } catch (posError) {
        // If user has no drift account, return empty positions
        const errorMsg = posError instanceof Error ? posError.message : String(posError);

        if (errorMsg.includes('not found') || errorMsg.includes('No user account')) {
          sendSuccess(res, {
            positions: [],
            hasAccount: false,
          });
        } else {
          throw posError;
        }
      }
    } catch (error) {
      logger.error(
        '[Drift API] Error fetching positions:',
        error instanceof Error ? error.message : String(error)
      );
      sendError(
        res,
        500,
        'FETCH_POSITIONS_FAILED',
        'Failed to fetch Drift positions',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  /**
   * GET /api/drift/account
   * Get account information (collateral, margin, leverage)
   * Returns live data from Drift Protocol via WebSocket subscriptions
   */
  router.get('/account', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      logger.info(`[Drift API] Fetching account info for user: ${userId.substring(0, 8)}...`);

      const driftService = getDriftService(elizaOS);

      if (!driftService) {
        return sendError(
          res,
          503,
          'SERVICE_UNAVAILABLE',
          'Drift service is not available',
          'Drift plugin may not be loaded or initialized'
        );
      }

      try {
        const account = await driftService.getAccountInfo(userId);

        sendSuccess(res, {
          account,
          hasAccount: true,
        });
      } catch (accError) {
        // If user has no drift account, return null
        const errorMsg = accError instanceof Error ? accError.message : String(accError);

        if (errorMsg.includes('not found') || errorMsg.includes('No user account')) {
          sendSuccess(res, {
            account: null,
            hasAccount: false,
          });
        } else {
          throw accError;
        }
      }
    } catch (error) {
      logger.error(
        '[Drift API] Error fetching account info:',
        error instanceof Error ? error.message : String(error)
      );
      sendError(
        res,
        500,
        'FETCH_ACCOUNT_FAILED',
        'Failed to fetch Drift account info',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  return router;
}
