/**
 * STRATEGY_TOGGLE Action (Phase 4)
 *
 * Enables or disables automation for a user.
 * When enabling, validates configuration first.
 * When disabling, optionally closes all positions.
 */

import {
    type ActionResult,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    type State,
    logger,
    Action,
} from '@elizaos/core';
import { AutomationStateStore } from '../state/automation-state.store';
import { DEFAULT_AUTOMATION_CONFIG } from '../types';

export const strategyToggle: Action = {
    name: 'STRATEGY_TOGGLE',
    similes: [
        'AUTOMATION_TOGGLE',
        'ENABLE_AUTOMATION',
        'DISABLE_AUTOMATION',
        'START_AUTOMATION',
        'STOP_AUTOMATION',
        'TURN_ON_AUTOMATION',
        'TURN_OFF_AUTOMATION',
    ],
    suppressInitialMessage: true,
    description:
        'Enable or disable automated trading. Use "enable" to start automation, "disable" to stop it. ' +
        'When enabling, automation will start trading based on configured strategy. ' +
        'When disabling, you can optionally close all open positions.',

    parameters: {
        action: {
            type: 'string',
            description: 'Action to perform: "enable" to start automation, "disable" to stop it',
            required: true,
        },
        closePositions: {
            type: 'boolean',
            description: 'When disabling, whether to close all open positions (default: false)',
            required: false,
        },
    },

    validate: async (
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<boolean> => {
        try {
            const stateStore = AutomationStateStore.getInstance();
            return !!stateStore;
        } catch (err) {
            logger.warn('[STRATEGY_TOGGLE] StateStore not available:', (err as Error).message);
            return false;
        }
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        _options?: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<ActionResult> => {
        try {
            const stateStore = AutomationStateStore.getInstance();
            await stateStore.initialize();

            const userId = message.userId;
            if (!userId) {
                throw new Error('User ID not found in message');
            }

            // Get params from composed state
            const composedState = await runtime.composeState(message, ['ACTION_STATE'], true);
            const params = composedState?.data?.actionParams || {};

            const action = params.action?.toLowerCase();
            const closePositions = params.closePositions ?? false;

            if (!action || !['enable', 'disable'].includes(action)) {
                const errorMsg = 'Please specify action: "enable" or "disable"';
                if (callback) callback({ text: errorMsg });
                return { text: errorMsg, success: false, error: 'invalid_action' };
            }

            // Get or create state
            let state = await stateStore.getState(userId);
            if (!state) {
                // Create default state if none exists
                state = await stateStore.getOrCreateState(userId, DEFAULT_AUTOMATION_CONFIG);
            }

            const enabling = action === 'enable';
            const wasEnabled = state.config.enabled;

            if (enabling === wasEnabled) {
                const alreadyMsg = `Automation is already ${enabling ? 'enabled' : 'disabled'}.`;
                if (callback) callback({ text: alreadyMsg });
                return { text: alreadyMsg, success: true };
            }

            // Check circuit breaker before enabling
            if (enabling && state.circuitBreakerTripped) {
                const breakerMsg =
                    'Cannot enable automation: Circuit breaker is tripped due to drawdown. ' +
                    'Use STRATEGY_UPDATE to reset the circuit breaker first.';
                if (callback) callback({ text: breakerMsg });
                return { text: breakerMsg, success: false, error: 'circuit_breaker_active' };
            }

            // Update state
            const updatedConfig = { ...state.config, enabled: enabling };
            await stateStore.updateState(userId, { config: updatedConfig });

            // Close positions if disabling and requested
            if (!enabling && closePositions) {
                try {
                    const driftService = runtime.getService('DRIFT_SERVICE') as {
                        closeAllPositions?: (userId: string) => Promise<unknown>;
                    };
                    if (driftService?.closeAllPositions) {
                        await driftService.closeAllPositions(userId);
                        logger.info(`[STRATEGY_TOGGLE] Closed all positions for user ${userId.substring(0, 8)}...`);
                    }
                } catch (err) {
                    logger.warn('[STRATEGY_TOGGLE] Could not close positions:', (err as Error).message);
                }
            }

            const successMsg = enabling
                ? 'Automation **ENABLED**. Trading will begin on the next cycle (every ' +
                  `${state.config.intervalMinutes} minutes). Monitor with STRATEGY_STATUS.`
                : closePositions
                  ? 'Automation **DISABLED** and all positions closed.'
                  : 'Automation **DISABLED**. Open positions remain unchanged.';

            logger.info(`[STRATEGY_TOGGLE] User ${userId.substring(0, 8)}... ${action}d automation`);

            if (callback) callback({ text: successMsg });

            return {
                text: successMsg,
                success: true,
                data: { enabled: enabling, closedPositions: !enabling && closePositions },
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`[STRATEGY_TOGGLE] Failed: ${errorMsg}`);

            if (callback) callback({ text: `Failed to toggle automation: ${errorMsg}` });

            return {
                text: `Failed to toggle automation: ${errorMsg}`,
                success: false,
                error: errorMsg,
            };
        }
    },
};
