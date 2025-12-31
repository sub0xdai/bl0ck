/**
 * STRATEGY_STATUS Action (Phase 4)
 *
 * Shows current automation state including:
 * - Enabled/disabled status
 * - Current configuration
 * - Open positions
 * - Circuit breaker status
 * - Session PnL
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
import type { AutomationState } from '../types';

/**
 * Format automation state for display
 */
function formatStatus(state: AutomationState, positions: unknown[] = []): string {
    const config = state.config;
    const statusIcon = config.enabled ? '🟢' : '🔴';
    const breakerIcon = state.circuitBreakerTripped ? '🛑' : '✅';

    const lines = [
        `**Automation Status** ${statusIcon}`,
        '',
        `**Enabled:** ${config.enabled ? 'Yes' : 'No'}`,
        `**Circuit Breaker:** ${state.circuitBreakerTripped ? 'TRIPPED' : 'OK'} ${breakerIcon}`,
        `**Session PnL:** $${state.sessionPnL.toFixed(2)}`,
        `**Cycles Run:** ${state.cycleCount}`,
        '',
        '**Configuration:**',
        `- Interval: ${config.intervalMinutes}min`,
        `- Max Position: ${config.maxPositionPct}% of equity`,
        `- Max Exposure: ${config.maxExposurePct}% total`,
        `- Max Leverage: ${config.maxLeverage}x`,
        `- Assets: ${config.assets.join(', ')}`,
        `- Shorts Allowed: ${config.allowShorts ? 'Yes' : 'No'}`,
        '',
        '**Safety Settings:**',
        `- Circuit Breaker: ${config.circuitBreakerPct}% drawdown`,
        `- Trade Cooldown: ${config.cooldownMinutes}min`,
        `- Max Slippage: ${config.maxSlippageBps}bps (${(config.maxSlippageBps / 100).toFixed(2)}%)`,
    ];

    // Add optional Phase 3 settings
    if (config.stopLossPct !== undefined) {
        lines.push(`- Stop Loss: ${config.stopLossPct}%`);
    }
    if (config.takeProfitPct !== undefined) {
        lines.push(`- Take Profit: ${config.takeProfitPct}%`);
    }
    if (config.maxHoldMinutes !== undefined) {
        lines.push(`- Max Hold Time: ${config.maxHoldMinutes}min`);
    }

    // Add open positions if any
    if (positions.length > 0) {
        lines.push('', '**Open Positions:**');
        for (const pos of positions as Array<{ marketSymbol: string; side: string; notionalValue: string; unrealizedPnl: string }>) {
            lines.push(`- ${pos.marketSymbol}: ${pos.side.toUpperCase()} $${parseFloat(pos.notionalValue).toFixed(2)} (PnL: $${parseFloat(pos.unrealizedPnl).toFixed(2)})`);
        }
    } else {
        lines.push('', '**Open Positions:** None');
    }

    // Add recent errors if any
    if (state.errors.length > 0) {
        lines.push('', '**Recent Errors:**');
        for (const error of state.errors.slice(-3)) {
            lines.push(`- ${error}`);
        }
    }

    return lines.join('\n');
}

export const strategyStatus: Action = {
    name: 'STRATEGY_STATUS',
    similes: [
        'AUTOMATION_STATUS',
        'CHECK_AUTOMATION',
        'TRADING_STATUS',
        'SHOW_STRATEGY',
        'GET_STRATEGY_STATUS',
    ],
    suppressInitialMessage: true,
    description:
        'Show the current automation status including enabled state, configuration, open positions, ' +
        'circuit breaker status, and session PnL. Use when the user asks about automation status or wants ' +
        'to check if trading is active.',

    validate: async (
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ): Promise<boolean> => {
        try {
            // Check if state store is available
            const stateStore = AutomationStateStore.getInstance();
            return !!stateStore;
        } catch (err) {
            logger.warn('[STRATEGY_STATUS] StateStore not available:', (err as Error).message);
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

            // Get user ID from message (entityId is the user's UUID)
            const userId = message.entityId;
            if (!userId) {
                throw new Error('User ID not found in message');
            }

            // Get automation state
            const automationState = await stateStore.getState(userId);

            if (!automationState) {
                const noStateMsg = 'No automation configuration found. Use STRATEGY_UPDATE to configure automation.';
                if (callback) {
                    callback({ text: noStateMsg });
                }
                return {
                    text: noStateMsg,
                    success: true,
                };
            }

            // Try to get open positions from DriftService
            let positions: unknown[] = [];
            try {
                const driftService = runtime.getService('DRIFT_SERVICE') as { getPositions?: (userId: string) => Promise<unknown[]> };
                if (driftService?.getPositions) {
                    positions = await driftService.getPositions(userId);
                }
            } catch {
                // DriftService may not be available
                logger.debug('[STRATEGY_STATUS] Could not fetch positions from DriftService');
            }

            const statusText = formatStatus(automationState, positions);

            if (callback) {
                callback({ text: statusText });
            }

            return {
                text: statusText,
                success: true,
                data: {
                    state: automationState,
                    positions,
                },
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error(`[STRATEGY_STATUS] Failed: ${errorMsg}`);

            if (callback) {
                callback({ text: `Failed to get automation status: ${errorMsg}` });
            }

            return {
                text: `Failed to get automation status: ${errorMsg}`,
                success: false,
                error: errorMsg,
            };
        }
    },
};
