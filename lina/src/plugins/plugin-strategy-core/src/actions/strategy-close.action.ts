/**
 * STRATEGY_CLOSE Action (Phase 4)
 *
 * Manually close positions opened by automation.
 * Supports closing specific positions or all positions.
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

export const strategyClose: Action = {
    name: 'STRATEGY_CLOSE',
    similes: [
        'CLOSE_AUTOMATION_POSITIONS',
        'CLOSE_STRATEGY_POSITIONS',
        'EXIT_POSITIONS',
        'CLOSE_ALL_POSITIONS',
        'EMERGENCY_CLOSE',
    ],
    suppressInitialMessage: true,
    description:
        'Manually close positions. Use asset parameter to close a specific position, ' +
        'or closeAll=true to close all open positions. This is a manual override that works ' +
        'regardless of automation status.',

    parameters: {
        asset: {
            type: 'string',
            description: 'Specific asset to close (e.g., "SOL-PERP")',
            required: false,
        },
        closeAll: {
            type: 'boolean',
            description: 'Close all open positions',
            required: false,
        },
        percentage: {
            type: 'number',
            description: 'Percentage of position to close (1-100, default 100)',
            required: false,
        },
    },

    validate: async (
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<boolean> => {
        try {
            // Check if DriftService is available
            const driftService = runtime.getService('DRIFT_SERVICE');
            return !!driftService;
        } catch (err) {
            logger.warn('[STRATEGY_CLOSE] DriftService not available:', (err as Error).message);
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
            const userId = message.entityId;
            if (!userId) {
                throw new Error('User ID not found in message');
            }

            // Get params from composed state
            const composedState = await runtime.composeState(message, ['ACTION_STATE'], true);
            const params = composedState?.data?.actionParams || {};

            const asset = params.asset?.toUpperCase();
            const closeAll = params.closeAll ?? false;
            const percentage = Math.min(100, Math.max(1, params.percentage ?? 100));

            if (!asset && !closeAll) {
                const errorMsg = 'Please specify asset to close or use closeAll=true to close all positions.';
                if (callback) callback({ text: errorMsg });
                return { text: errorMsg, success: false, error: 'missing_parameter' };
            }

            // Get DriftService
            const driftService = runtime.getService('DRIFT_SERVICE') as {
                closePosition?: (userId: string, params: { marketSymbol: string; percentage?: number }) => Promise<{ success: boolean; txSignature?: string; error?: string }>;
                closeAllPositions?: (userId: string) => Promise<{ success: boolean; closedCount?: number; error?: string }>;
                getPositions?: (userId: string) => Promise<Array<{ marketSymbol: string }>>;
            };

            if (!driftService) {
                throw new Error('DriftService not available');
            }

            // Initialize state store for position tracking cleanup
            const stateStore = AutomationStateStore.getInstance();
            await stateStore.initialize();

            let resultText: string;
            let success = true;
            const closedPositions: string[] = [];

            if (closeAll) {
                // Close all positions
                if (!driftService.closeAllPositions) {
                    throw new Error('closeAllPositions not available on DriftService');
                }

                // Get current positions for cleanup
                let positions: Array<{ marketSymbol: string }> = [];
                if (driftService.getPositions) {
                    positions = await driftService.getPositions(userId);
                }

                const result = await driftService.closeAllPositions(userId);
                success = result.success;

                if (success) {
                    resultText = `Closed all positions (${result.closedCount ?? positions.length} position(s))`;
                    closedPositions.push(...positions.map((p) => p.marketSymbol));

                    // Clear position open times for closed positions
                    for (const pos of positions) {
                        await stateStore.clearPositionOpen(userId, pos.marketSymbol);
                    }
                } else {
                    resultText = `Failed to close all positions: ${result.error}`;
                }
            } else {
                // Close specific position
                if (!driftService.closePosition) {
                    throw new Error('closePosition not available on DriftService');
                }

                const result = await driftService.closePosition(userId, {
                    marketSymbol: asset,
                    percentage,
                });

                success = result.success;

                if (success) {
                    resultText =
                        percentage === 100
                            ? `Closed ${asset} position. TX: ${result.txSignature?.substring(0, 16)}...`
                            : `Closed ${percentage}% of ${asset} position. TX: ${result.txSignature?.substring(0, 16)}...`;
                    closedPositions.push(asset);

                    // Clear position open time if fully closed
                    if (percentage === 100) {
                        await stateStore.clearPositionOpen(userId, asset);
                    }
                } else {
                    resultText = `Failed to close ${asset}: ${result.error}`;
                }
            }

            logger.info(`[STRATEGY_CLOSE] User ${userId.substring(0, 8)}...: ${resultText}`);

            if (callback) callback({ text: resultText });

            return {
                text: resultText,
                success,
                data: { closedPositions },
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`[STRATEGY_CLOSE] Failed: ${errorMsg}`);

            if (callback) callback({ text: `Failed to close positions: ${errorMsg}` });

            return {
                text: `Failed to close positions: ${errorMsg}`,
                success: false,
                error: errorMsg,
            };
        }
    },
};
