/**
 * STRATEGY_UPDATE Action (Phase 4)
 *
 * Updates automation configuration parameters.
 * Validates parameters before applying.
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
import { DEFAULT_AUTOMATION_CONFIG, type AutomationConfig } from '../types';

/**
 * Validate configuration parameters
 */
function validateConfig(params: Partial<AutomationConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (params.intervalMinutes !== undefined) {
        if (params.intervalMinutes < 1 || params.intervalMinutes > 60) {
            errors.push('intervalMinutes must be between 1 and 60');
        }
    }

    if (params.maxPositionPct !== undefined) {
        if (params.maxPositionPct < 1 || params.maxPositionPct > 100) {
            errors.push('maxPositionPct must be between 1 and 100');
        }
    }

    if (params.maxExposurePct !== undefined) {
        if (params.maxExposurePct < 1 || params.maxExposurePct > 100) {
            errors.push('maxExposurePct must be between 1 and 100');
        }
    }

    if (params.maxLeverage !== undefined) {
        if (params.maxLeverage < 1 || params.maxLeverage > 20) {
            errors.push('maxLeverage must be between 1 and 20');
        }
    }

    if (params.circuitBreakerPct !== undefined) {
        if (params.circuitBreakerPct < 1 || params.circuitBreakerPct > 50) {
            errors.push('circuitBreakerPct must be between 1 and 50');
        }
    }

    if (params.cooldownMinutes !== undefined) {
        if (params.cooldownMinutes < 1 || params.cooldownMinutes > 60) {
            errors.push('cooldownMinutes must be between 1 and 60');
        }
    }

    if (params.maxSlippageBps !== undefined) {
        if (params.maxSlippageBps < 10 || params.maxSlippageBps > 500) {
            errors.push('maxSlippageBps must be between 10 and 500 (0.1% to 5%)');
        }
    }

    if (params.stopLossPct !== undefined && params.stopLossPct !== null) {
        if (params.stopLossPct < 1 || params.stopLossPct > 50) {
            errors.push('stopLossPct must be between 1 and 50');
        }
    }

    if (params.takeProfitPct !== undefined && params.takeProfitPct !== null) {
        if (params.takeProfitPct < 1 || params.takeProfitPct > 100) {
            errors.push('takeProfitPct must be between 1 and 100');
        }
    }

    if (params.maxHoldMinutes !== undefined && params.maxHoldMinutes !== null) {
        if (params.maxHoldMinutes < 5 || params.maxHoldMinutes > 1440) {
            errors.push('maxHoldMinutes must be between 5 and 1440 (24 hours)');
        }
    }

    if (params.assets !== undefined) {
        if (!Array.isArray(params.assets) || params.assets.length === 0) {
            errors.push('assets must be a non-empty array');
        }
    }

    return { valid: errors.length === 0, errors };
}

export const strategyUpdate: Action = {
    name: 'STRATEGY_UPDATE',
    similes: [
        'AUTOMATION_UPDATE',
        'UPDATE_STRATEGY',
        'CONFIGURE_AUTOMATION',
        'SET_STRATEGY',
        'CHANGE_STRATEGY_CONFIG',
    ],
    suppressInitialMessage: true,
    description:
        'Update automation configuration. Supports: intervalMinutes, maxPositionPct, maxExposurePct, ' +
        'maxLeverage, assets, allowShorts, circuitBreakerPct, cooldownMinutes, maxSlippageBps, ' +
        'stopLossPct, takeProfitPct, maxHoldMinutes. Use resetCircuitBreaker=true to reset the circuit breaker.',

    parameters: {
        intervalMinutes: {
            type: 'number',
            description: 'Polling interval in minutes (1-60)',
            required: false,
        },
        maxPositionPct: {
            type: 'number',
            description: 'Max single position size as % of equity (1-100)',
            required: false,
        },
        maxExposurePct: {
            type: 'number',
            description: 'Max total exposure as % of equity (1-100)',
            required: false,
        },
        maxLeverage: {
            type: 'number',
            description: 'Max leverage per position (1-20)',
            required: false,
        },
        assets: {
            type: 'array',
            description: 'Assets to trade (e.g., ["SOL-PERP", "BTC-PERP"])',
            required: false,
        },
        allowShorts: {
            type: 'boolean',
            description: 'Allow short positions',
            required: false,
        },
        circuitBreakerPct: {
            type: 'number',
            description: 'Circuit breaker drawdown threshold (1-50)',
            required: false,
        },
        cooldownMinutes: {
            type: 'number',
            description: 'Minutes between trades on same asset (1-60)',
            required: false,
        },
        maxSlippageBps: {
            type: 'number',
            description: 'Max slippage in basis points (10-500)',
            required: false,
        },
        stopLossPct: {
            type: 'number',
            description: 'Stop loss percentage (1-50, or null to disable)',
            required: false,
        },
        takeProfitPct: {
            type: 'number',
            description: 'Take profit percentage (1-100, or null to disable)',
            required: false,
        },
        maxHoldMinutes: {
            type: 'number',
            description: 'Max position hold time in minutes (5-1440, or null to disable)',
            required: false,
        },
        resetCircuitBreaker: {
            type: 'boolean',
            description: 'Reset the circuit breaker (required after it trips)',
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
            logger.warn('[STRATEGY_UPDATE] StateStore not available:', (err as Error).message);
            return false;
        }
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state?: State,
        _options?: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<ActionResult> => {
        try {
            const stateStore = AutomationStateStore.getInstance();
            await stateStore.initialize();

            const userId = message.entityId;
            if (!userId) {
                throw new Error('User ID not found in message');
            }

            // Get params from composed state
            const composedState = await runtime.composeState(message, ['ACTION_STATE'], true);
            const params = (composedState?.data?.actionParams || {}) as Partial<AutomationConfig> & { resetCircuitBreaker?: boolean };

            // Get or create state
            let state = await stateStore.getState(userId);
            if (!state) {
                state = await stateStore.getOrCreateState(userId, DEFAULT_AUTOMATION_CONFIG);
            }

            // Handle circuit breaker reset
            if (params.resetCircuitBreaker === true) {
                await stateStore.resetCircuitBreaker(userId);
                logger.info(`[STRATEGY_UPDATE] Reset circuit breaker for user ${userId.substring(0, 8)}...`);
            }

            // Build config updates (exclude non-config params)
            const { resetCircuitBreaker: _, ...configUpdates } = params;

            // Only update if there are config changes
            if (Object.keys(configUpdates).length > 0) {
                // Validate configuration
                const validation = validateConfig(configUpdates as Partial<AutomationConfig>);
                if (!validation.valid) {
                    const errorMsg = `Invalid configuration: ${validation.errors.join(', ')}`;
                    if (callback) callback({ text: errorMsg });
                    return { text: errorMsg, success: false, error: 'validation_failed' };
                }

                // Merge with existing config
                const updatedConfig = { ...state.config, ...configUpdates };
                await stateStore.updateState(userId, { config: updatedConfig });

                logger.info(
                    `[STRATEGY_UPDATE] Updated config for user ${userId.substring(0, 8)}...: ` +
                        JSON.stringify(configUpdates)
                );
            }

            // Build response
            const changes: string[] = [];
            for (const [key, value] of Object.entries(configUpdates)) {
                changes.push(`- ${key}: ${JSON.stringify(value)}`);
            }
            if (params.resetCircuitBreaker) {
                changes.push('- Circuit breaker: RESET');
            }

            const successMsg =
                changes.length > 0
                    ? `Configuration updated:\n${changes.join('\n')}`
                    : 'No changes specified. Use parameters to update configuration.';

            if (callback) callback({ text: successMsg });

            return {
                text: successMsg,
                success: true,
                data: { updatedFields: Object.keys(configUpdates) },
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`[STRATEGY_UPDATE] Failed: ${errorMsg}`);

            if (callback) callback({ text: `Failed to update configuration: ${errorMsg}` });

            return {
                text: `Failed to update configuration: ${errorMsg}`,
                success: false,
                error: errorMsg,
            };
        }
    },
};
