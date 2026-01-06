/**
 * Position Monitor Service (Phase 3)
 *
 * Monitors open positions for stop-loss, take-profit,
 * and max hold time triggers. Runs independently of
 * the main strategy loop.
 */

import { logger } from '@elizaos/core';
import type { AutomationConfig } from '../types/automation-config';
import { getExecutionCoordinator, type OperationType } from '../utils/execution-coordinator';

/**
 * Position data from DriftService
 *
 * IMPORTANT: Uses USD-based PnL from DriftService, not price-based calculation.
 * This accounts for funding rates, fees, and other factors that affect actual PnL.
 */
export interface MonitoredPosition {
    marketSymbol: string;
    side: 'long' | 'short';
    entryPrice: number;
    currentPrice: number;
    /** USD value of unrealized PnL (includes funding, fees) */
    unrealizedPnlUsd: number;
    /** Notional value of position in USD */
    notionalValueUsd: number;
    /** Calculated PnL percentage based on actual USD values */
    unrealizedPnlPct: number;
    openedAt: number;

    // === ATR-based risk management fields (optional) ===

    /** Stop-loss price (ATR-based, may be adjusted for break-even) */
    stopLossPrice?: number;

    /** Take-profit target price */
    targetPrice?: number;

    /** Whether break-even has been triggered for this position */
    breakEvenTriggered?: boolean;
}

/**
 * Calculate actual PnL percentage from USD values.
 * This is more accurate than price-based calculation as it includes
 * funding rates, fees, and other factors.
 */
export function calculateActualPnlPct(
    unrealizedPnlUsd: number,
    notionalValueUsd: number
): number {
    if (notionalValueUsd === 0) return 0;
    return (unrealizedPnlUsd / notionalValueUsd) * 100;
}

/**
 * Exit trigger result
 */
export interface ExitTrigger {
    triggered: boolean;
    reason?: 'stop_loss' | 'take_profit' | 'max_hold_time';
    asset?: string;
    pnlPct?: number;
    holdMinutes?: number;
}

/**
 * Break-even trigger result
 */
export interface BreakEvenTrigger {
    triggered: boolean;
    newStopPrice?: number;
}

/**
 * Position monitor configuration
 */
export interface PositionMonitorConfig {
    /** Check interval in milliseconds (default: 30000 = 30s) */
    checkIntervalMs: number;
    /** Callback when exit trigger fires (userId added for coordination) */
    onExitTrigger?: (userId: string, trigger: ExitTrigger) => Promise<void>;
    /** Callback when break-even is triggered (to update state) */
    onBreakEvenTrigger?: (userId: string, asset: string, newStopPrice: number) => Promise<void>;
}

const DEFAULT_CHECK_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Monitors positions for exit conditions
 */
export class PositionMonitor {
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning = false;
    private checkIntervalMs: number;
    private onExitTrigger?: (userId: string, trigger: ExitTrigger) => Promise<void>;
    private onBreakEvenTrigger?: (userId: string, asset: string, newStopPrice: number) => Promise<void>;

    // Position tracking for hold time
    private positionOpenTimes: Map<string, number> = new Map();

    // User ID for coordination (set during start)
    private userId: string | null = null;

    constructor(config?: Partial<PositionMonitorConfig>) {
        this.checkIntervalMs = config?.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
        this.onExitTrigger = config?.onExitTrigger;
        this.onBreakEvenTrigger = config?.onBreakEvenTrigger;
    }

    /**
     * Check if a position should be exited based on config
     *
     * Supports both:
     * - Price-based stops (ATR-based, from positionMetadata)
     * - Percentage-based stops (legacy, from config)
     */
    checkExitConditions(
        position: MonitoredPosition,
        config: AutomationConfig
    ): ExitTrigger {
        // === Check stop loss ===
        // Priority 1: Price-based stop (ATR-based)
        if (position.stopLossPrice !== undefined) {
            let stopHit = false;
            if (position.side === 'long') {
                stopHit = position.currentPrice <= position.stopLossPrice;
            } else {
                stopHit = position.currentPrice >= position.stopLossPrice;
            }

            if (stopHit) {
                logger.info(
                    `[POSITION_MONITOR] Price-based stop hit for ${position.marketSymbol}: ` +
                    `current=$${position.currentPrice.toFixed(2)}, stop=$${position.stopLossPrice.toFixed(2)}`
                );
                return {
                    triggered: true,
                    reason: 'stop_loss',
                    asset: position.marketSymbol,
                    pnlPct: position.unrealizedPnlPct,
                };
            }
        }
        // Priority 2: Percentage-based stop (legacy)
        else if (config.stopLossPct !== undefined && config.stopLossPct > 0) {
            if (position.unrealizedPnlPct <= -config.stopLossPct) {
                return {
                    triggered: true,
                    reason: 'stop_loss',
                    asset: position.marketSymbol,
                    pnlPct: position.unrealizedPnlPct,
                };
            }
        }

        // === Check take profit ===
        // Priority 1: Price-based target (ATR-based)
        if (position.targetPrice !== undefined) {
            let targetHit = false;
            if (position.side === 'long') {
                targetHit = position.currentPrice >= position.targetPrice;
            } else {
                targetHit = position.currentPrice <= position.targetPrice;
            }

            if (targetHit) {
                logger.info(
                    `[POSITION_MONITOR] Price-based target hit for ${position.marketSymbol}: ` +
                    `current=$${position.currentPrice.toFixed(2)}, target=$${position.targetPrice.toFixed(2)}`
                );
                return {
                    triggered: true,
                    reason: 'take_profit',
                    asset: position.marketSymbol,
                    pnlPct: position.unrealizedPnlPct,
                };
            }
        }
        // Priority 2: Percentage-based target (legacy)
        else if (config.takeProfitPct !== undefined && config.takeProfitPct > 0) {
            if (position.unrealizedPnlPct >= config.takeProfitPct) {
                return {
                    triggered: true,
                    reason: 'take_profit',
                    asset: position.marketSymbol,
                    pnlPct: position.unrealizedPnlPct,
                };
            }
        }

        // === Check max hold time ===
        if (config.maxHoldMinutes !== undefined && config.maxHoldMinutes > 0) {
            const holdMs = Date.now() - position.openedAt;
            const holdMinutes = holdMs / 60_000;

            if (holdMinutes >= config.maxHoldMinutes) {
                return {
                    triggered: true,
                    reason: 'max_hold_time',
                    asset: position.marketSymbol,
                    holdMinutes,
                };
            }
        }

        return { triggered: false };
    }

    /**
     * Check if break-even should be triggered for a position
     *
     * Break-even triggers when:
     * - Position has ATR-based stop/target prices set
     * - Profit reaches breakEvenTriggerRatio (e.g., 50%) of target distance
     * - Moves stop-loss to entry price (lock in zero loss)
     *
     * @returns Break-even trigger result with new stop price if triggered
     */
    checkBreakEvenTrigger(
        position: MonitoredPosition,
        config: AutomationConfig
    ): BreakEvenTrigger {
        // Skip if already triggered or no ATR sizing data
        if (position.breakEvenTriggered) {
            return { triggered: false };
        }

        if (!position.targetPrice || !position.stopLossPrice) {
            return { triggered: false };
        }

        const triggerRatio = config.breakEvenTriggerRatio ?? 0.5;
        const entryPrice = position.entryPrice;
        const currentPrice = position.currentPrice;
        const targetPrice = position.targetPrice;

        // Calculate profit progress toward target
        let profitProgress: number;

        if (position.side === 'long') {
            // For longs: target is above entry
            const totalTargetDistance = targetPrice - entryPrice;
            if (totalTargetDistance <= 0) return { triggered: false };

            const currentProfit = currentPrice - entryPrice;
            profitProgress = currentProfit / totalTargetDistance;
        } else {
            // For shorts: target is below entry
            const totalTargetDistance = entryPrice - targetPrice;
            if (totalTargetDistance <= 0) return { triggered: false };

            const currentProfit = entryPrice - currentPrice;
            profitProgress = currentProfit / totalTargetDistance;
        }

        // Check if profit has reached trigger threshold
        if (profitProgress >= triggerRatio) {
            logger.info(
                `[POSITION_MONITOR] Break-even triggered for ${position.marketSymbol}: ` +
                `${(profitProgress * 100).toFixed(1)}% of target reached, moving SL to entry $${entryPrice.toFixed(2)}`
            );

            return {
                triggered: true,
                newStopPrice: entryPrice, // Move stop to entry (break-even)
            };
        }

        return { triggered: false };
    }

    /**
     * Calculate unrealized PnL percentage from price change.
     *
     * @deprecated Use calculateActualPnlPct() with USD values from DriftService instead.
     * Price-based calculation doesn't account for funding rates, fees, or slippage.
     * This method is kept for backwards compatibility with tests.
     */
    calculatePnlPct(
        side: 'long' | 'short',
        entryPrice: number,
        currentPrice: number
    ): number {
        if (entryPrice === 0) return 0;

        const priceDiff = currentPrice - entryPrice;
        const pnlPct = (priceDiff / entryPrice) * 100;

        // For shorts, PnL is inverted
        return side === 'long' ? pnlPct : -pnlPct;
    }

    /**
     * Track when a position was opened
     */
    trackPositionOpen(asset: string, timestamp?: number): void {
        this.positionOpenTimes.set(asset, timestamp ?? Date.now());
    }

    /**
     * Get position open time
     */
    getPositionOpenTime(asset: string): number | undefined {
        return this.positionOpenTimes.get(asset);
    }

    /**
     * Clear position tracking when closed
     */
    clearPositionTracking(asset: string): void {
        this.positionOpenTimes.delete(asset);
    }

    /**
     * Start the monitor loop
     *
     * @param userId User identifier for coordination
     * @param getPositions Function to fetch current positions
     * @param getConfig Function to get current config
     */
    start(
        userId: string,
        getPositions: () => Promise<MonitoredPosition[]>,
        getConfig: () => AutomationConfig
    ): void {
        if (this.isRunning) {
            logger.warn('[POSITION_MONITOR] Already running');
            return;
        }

        this.userId = userId;
        this.isRunning = true;
        logger.info(
            `[POSITION_MONITOR] Started with ${this.checkIntervalMs}ms interval`
        );

        this.intervalId = setInterval(async () => {
            try {
                const positions = await getPositions();
                const config = getConfig();
                const coordinator = getExecutionCoordinator();

                for (const position of positions) {
                    // === Check for break-even trigger first ===
                    if (!position.breakEvenTriggered && position.targetPrice && position.stopLossPrice) {
                        const breakEvenResult = this.checkBreakEvenTrigger(position, config);

                        if (breakEvenResult.triggered && breakEvenResult.newStopPrice !== undefined) {
                            // Update state via callback
                            if (this.onBreakEvenTrigger) {
                                await this.onBreakEvenTrigger(
                                    userId,
                                    position.marketSymbol,
                                    breakEvenResult.newStopPrice
                                );
                            }

                            // Update position for this check cycle
                            position.stopLossPrice = breakEvenResult.newStopPrice;
                            position.breakEvenTriggered = true;
                        }
                    }

                    // === Check exit conditions ===
                    const trigger = this.checkExitConditions(position, config);

                    if (trigger.triggered && this.onExitTrigger && trigger.asset) {
                        // Check if position is already locked by StrategyLoop
                        if (coordinator.isLocked(userId, trigger.asset)) {
                            logger.debug(
                                `[POSITION_MONITOR] Skipping ${trigger.asset} - already locked by another operation`
                            );
                            continue;
                        }

                        // Map trigger reason to operation type
                        const operationType: OperationType = trigger.reason === 'stop_loss'
                            ? 'stop_loss'
                            : trigger.reason === 'take_profit'
                                ? 'take_profit'
                                : 'max_hold';

                        // Acquire lock and execute exit
                        await coordinator.withLock(userId, trigger.asset, operationType, async () => {
                            logger.info(
                                `[POSITION_MONITOR] Exit trigger: ${trigger.reason} for ${trigger.asset}`
                            );
                            await this.onExitTrigger!(userId, trigger);
                        });
                    }
                }
            } catch (error) {
                logger.error(
                    '[POSITION_MONITOR] Check failed:',
                    error instanceof Error ? error.message : String(error)
                );
            }
        }, this.checkIntervalMs);
    }

    /**
     * Stop the monitor loop
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        logger.info('[POSITION_MONITOR] Stopped');
    }

    /**
     * Check if monitor is running
     */
    get running(): boolean {
        return this.isRunning;
    }

    /**
     * Set check interval (for testing)
     */
    setCheckIntervalMs(intervalMs: number): void {
        this.checkIntervalMs = intervalMs;

        if (this.isRunning && this.intervalId) {
            // Restart with new interval
            clearInterval(this.intervalId);
            // Note: start() would need the callbacks again, so this is mainly for testing
        }
    }
}
