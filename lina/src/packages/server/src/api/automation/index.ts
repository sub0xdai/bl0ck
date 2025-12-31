import express from 'express';
import { logger } from '@elizaos/core';
import type { ElizaOS } from '@elizaos/core';
import type { AgentServer } from '../../index';
import { sendError, sendSuccess } from '../shared/response-utils';
import { requireAuth, type AuthenticatedRequest } from '../../middleware';
import { AutomationStateStore } from '../../../../../plugins/plugin-strategy-core/src/state/automation-state.store';

// Service name must match the one defined in plugin-drift
const DRIFT_SERVICE_NAME = 'DRIFT_SERVICE';

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

interface DriftServiceInterface {
  getPositions(userId: string): Promise<DriftPosition[]>;
}

/**
 * Get the Drift service from the first agent that has it
 */
function getDriftService(elizaOS: ElizaOS): DriftServiceInterface | null {
  const agents = elizaOS.getAgents();
  for (const agent of agents) {
    const service = agent.getService(DRIFT_SERVICE_NAME);
    if (service) {
      return service as unknown as DriftServiceInterface;
    }
  }
  return null;
}

/**
 * Creates the Automation router for strategy-core status and control
 * All endpoints require JWT authentication
 */
export function automationRouter(elizaOS: ElizaOS, _serverInstance: AgentServer): express.Router {
  const router = express.Router();

  // SECURITY: Require authentication for all Automation operations
  router.use(requireAuth);

  /**
   * GET /api/automation/status
   * Get automation status for the authenticated user
   * Returns current config, state, and positions
   */
  router.get('/status', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      logger.debug(`[Automation API] Fetching status for user: ${userId.substring(0, 8)}...`);

      // Get automation state from store
      const stateStore = AutomationStateStore.getInstance();

      try {
        await stateStore.initialize();
      } catch (initError) {
        // State store may not be available (no WALLET_DB_URL)
        logger.warn('[Automation API] State store not available:', initError instanceof Error ? initError.message : String(initError));
        return sendSuccess(res, {
          automation: null,
          positions: [],
          hasAccount: false,
          storeAvailable: false,
        });
      }

      const automationState = await stateStore.getState(userId);

      // Get positions from Drift service if available
      let positions: DriftPosition[] = [];
      let hasAccount = false;

      const driftService = getDriftService(elizaOS);
      if (driftService) {
        try {
          positions = await driftService.getPositions(userId);
          hasAccount = true;
        } catch (posError) {
          const errorMsg = posError instanceof Error ? posError.message : String(posError);
          if (!errorMsg.includes('not found') && !errorMsg.includes('No user account')) {
            logger.warn('[Automation API] Failed to fetch positions:', errorMsg);
          }
          // User may not have a Drift account yet
        }
      }

      sendSuccess(res, {
        automation: automationState ? {
          userId: automationState.userId,
          config: automationState.config,
          circuitBreakerTripped: automationState.circuitBreakerTripped,
          circuitBreakerTrippedAt: automationState.circuitBreakerTrippedAt,
          sessionPnL: automationState.sessionPnL,
          cycleCount: automationState.cycleCount,
          errors: automationState.errors.slice(-5), // Last 5 errors
          startedAt: automationState.startedAt,
          lastCycleAt: automationState.lastCycleAt,
        } : null,
        positions: positions.map(p => ({
          marketSymbol: p.marketSymbol,
          side: p.side,
          notionalValue: p.notionalValue,
          unrealizedPnl: p.unrealizedPnl,
          entryPrice: p.entryPrice,
          markPrice: p.markPrice,
        })),
        hasAccount,
        storeAvailable: true,
      });
    } catch (error) {
      logger.error(
        '[Automation API] Error fetching status:',
        error instanceof Error ? error.message : String(error)
      );
      sendError(
        res,
        500,
        'FETCH_STATUS_FAILED',
        'Failed to fetch automation status',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  return router;
}
