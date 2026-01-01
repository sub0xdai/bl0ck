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
export function automationRouter(elizaOS: ElizaOS, serverInstance: AgentServer): express.Router {
  const router = express.Router();

  /**
   * Send an immediate chat message (used for automation status updates)
   */
  async function sendChatMessage(channelId: string, content: string, thought?: string, actions?: string[]): Promise<void> {
    try {
      const agents = elizaOS.getAgents();
      const agentId = agents[0]?.agentId;
      if (!agentId) {
        logger.warn('[Automation API] No agent found to send message');
        return;
      }

      const newRootMessageData = {
        channelId,
        authorId: agentId,
        content,
        rawMessage: {
          thought: thought || content,
          actions: actions || [],
        },
        sourceType: 'agent_response',
        metadata: {
          agentName: 'Lina',
        },
      };

      const createdMessage = await serverInstance.createMessage(newRootMessageData);

      // Emit to SocketIO for real-time GUI updates
      if (serverInstance.socketIO) {
        serverInstance.socketIO.to(channelId).emit('messageBroadcast', {
          senderId: agentId,
          senderName: 'Lina',
          text: content,
          roomId: channelId,
          serverId: '00000000-0000-0000-0000-000000000000',
          createdAt: new Date(createdMessage.createdAt).getTime(),
          source: createdMessage.sourceType,
          id: createdMessage.id,
          thought: thought || content,
          actions: actions || [],
        });
      }
    } catch (error) {
      logger.error('[Automation API] Failed to send chat message:', error instanceof Error ? error.message : String(error));
    }
  }

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
          channelId: automationState.channelId, // For chat trading updates
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

  /**
   * POST /api/automation/toggle
   * Enable or disable automation for the authenticated user
   * Body: { enabled: boolean, channelId?: string }
   */
  router.post('/toggle', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      const { enabled, channelId } = req.body as { enabled: boolean; channelId?: string };

      if (typeof enabled !== 'boolean') {
        return sendError(res, 400, 'INVALID_REQUEST', 'enabled must be a boolean');
      }

      logger.info(`[Automation API] Toggle automation for user ${userId.substring(0, 8)}...: ${enabled ? 'ON' : 'OFF'}${channelId ? ` (channel: ${channelId.substring(0, 8)}...)` : ''}`);

      const stateStore = AutomationStateStore.getInstance();
      await stateStore.initialize();

      // Get or create state
      const state = await stateStore.getOrCreateState(userId);

      // Update enabled flag in config, and channelId if provided (for chat messages)
      const updatedConfig = { ...state.config, enabled };
      const updates: { config: typeof updatedConfig; channelId?: string } = { config: updatedConfig };
      if (channelId && enabled) {
        // Store channelId when enabling (for sending trading updates to chat)
        updates.channelId = channelId;
      }
      await stateStore.updateState(userId, updates);

      // Send immediate status message
      const targetChannelId = channelId || state.channelId;
      if (targetChannelId) {
        if (enabled) {
          const assets = state.config.assets?.map((a: string) => a.replace('-PERP', '')).join(', ') || 'SOL';
          await sendChatMessage(
            targetChannelId,
            `Automation activated. I'll analyze ${assets} every 5 minutes and share trading opportunities here.`,
            'Automation system enabled - beginning market analysis',
            ['AUTOMATION_ENABLED']
          );
        } else {
          await sendChatMessage(
            targetChannelId,
            `Automation deactivated. I'll no longer execute trades automatically.`,
            'Automation system disabled',
            ['AUTOMATION_DISABLED']
          );
        }
      }

      // Return updated state
      const updatedState = await stateStore.getState(userId);

      sendSuccess(res, {
        automation: updatedState ? {
          userId: updatedState.userId,
          config: updatedState.config,
          channelId: updatedState.channelId,
          circuitBreakerTripped: updatedState.circuitBreakerTripped,
          circuitBreakerTrippedAt: updatedState.circuitBreakerTrippedAt,
          sessionPnL: updatedState.sessionPnL,
          cycleCount: updatedState.cycleCount,
          errors: updatedState.errors.slice(-5),
          startedAt: updatedState.startedAt,
          lastCycleAt: updatedState.lastCycleAt,
        } : null,
        message: `Automation ${enabled ? 'enabled' : 'disabled'}`,
      });
    } catch (error) {
      logger.error(
        '[Automation API] Error toggling automation:',
        error instanceof Error ? error.message : String(error)
      );
      sendError(
        res,
        500,
        'TOGGLE_FAILED',
        'Failed to toggle automation',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  /**
   * POST /api/automation/config
   * Update automation configuration for the authenticated user
   * Body: Partial<AutomationConfig>
   */
  router.post('/config', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      const configUpdates = req.body;

      logger.info(`[Automation API] Updating config for user ${userId.substring(0, 8)}...`);

      const stateStore = AutomationStateStore.getInstance();
      await stateStore.initialize();

      // Get or create state
      const state = await stateStore.getOrCreateState(userId);

      // Merge config updates
      const updatedConfig = { ...state.config, ...configUpdates };
      await stateStore.updateState(userId, { config: updatedConfig });

      // Return updated state
      const updatedState = await stateStore.getState(userId);

      sendSuccess(res, {
        automation: updatedState ? {
          userId: updatedState.userId,
          config: updatedState.config,
          circuitBreakerTripped: updatedState.circuitBreakerTripped,
          circuitBreakerTrippedAt: updatedState.circuitBreakerTrippedAt,
          sessionPnL: updatedState.sessionPnL,
          cycleCount: updatedState.cycleCount,
          errors: updatedState.errors.slice(-5),
          startedAt: updatedState.startedAt,
          lastCycleAt: updatedState.lastCycleAt,
        } : null,
        message: 'Configuration updated',
      });
    } catch (error) {
      logger.error(
        '[Automation API] Error updating config:',
        error instanceof Error ? error.message : String(error)
      );
      sendError(
        res,
        500,
        'CONFIG_UPDATE_FAILED',
        'Failed to update configuration',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  /**
   * PUT /api/automation/channel
   * Update the channelId for chat trading updates (used when modal opens with existing automation)
   * Body: { channelId: string }
   */
  router.put('/channel', async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.userId!;
      const { channelId } = req.body as { channelId: string };

      if (!channelId || typeof channelId !== 'string') {
        return sendError(res, 400, 'INVALID_REQUEST', 'channelId must be a non-empty string');
      }

      logger.info(`[Automation API] Updating channelId for user ${userId.substring(0, 8)}... to ${channelId.substring(0, 8)}...`);

      const stateStore = AutomationStateStore.getInstance();
      await stateStore.initialize();

      // Only update if automation state exists
      const state = await stateStore.getState(userId);
      if (!state) {
        return sendError(res, 404, 'NOT_FOUND', 'No automation state found for user');
      }

      // Update channelId
      await stateStore.updateState(userId, { channelId });

      sendSuccess(res, {
        message: 'Channel ID updated',
        channelId,
      });
    } catch (error) {
      logger.error(
        '[Automation API] Error updating channel:',
        error instanceof Error ? error.message : String(error)
      );
      sendError(
        res,
        500,
        'CHANNEL_UPDATE_FAILED',
        'Failed to update channel ID',
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  return router;
}
