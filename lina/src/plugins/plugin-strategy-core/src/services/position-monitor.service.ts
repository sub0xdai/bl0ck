/**
 * Position Monitor Service (Phase 3)
 *
 * Monitors open positions for stop-loss, take-profit,
 * and max hold time triggers. Runs independently of
 * the main strategy loop.
 */

import { logger } from '@elizaos/core';
import type { AutomationConfig } from '../types/automation-config';

/**
 * Position data from DriftService
 */
interface MonitoredPosition {
    marketSymbol: string;
    side: 'long' | 'short';
    entryPrice: number;
    currentPrice: number;
    unrealizedPnlPct: number;
    openedAt: number;
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
 * Position monitor configuration
 */
export interface PositionMonitorConfig {
    /** Check interval in milliseconds (default: 30000 = 30s) */
    checkIntervalMs: number;
    /** Callback when exit trigger fires */
    onExitTrigger?: (trigger: ExitTrigger) => Promise<void>;
}

const DEFAULT_CHECK_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Monitors positions for exit conditions
 */
export class PositionMonitor {
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning = false;
    private checkIntervalMs: number;
    private onExitTrigger?: (trigger: ExitTrigger) => Promise<void>;

    // Position tracking for hold time
    private positionOpenTimes: Map<string, number> = new Map();

    constructor(config?: Partial<PositionMonitorConfig>) {
        this.checkIntervalMs = config?.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
        this.onExitTrigger = config?.onExitTrigger;
    }

    /**
     * Check if a position should be exited based on config
     */
    checkExitConditions(
        position: MonitoredPosition,
        config: AutomationConfig
    ): ExitTrigger {
        // Check stop loss
        if (config.stopLossPct !== undefined && config.stopLossPct > 0) {
            if (position.unrealizedPnlPct <= -config.stopLossPct) {
                return {
                    triggered: true,
                    reason: 'stop_loss',
                    asset: position.marketSymbol,
                    pnlPct: position.unrealizedPnlPct,
                };
            }
        }

        // Check take profit
        if (config.takeProfitPct !== undefined && config.takeProfitPct > 0) {
            if (position.unrealizedPnlPct >= config.takeProfitPct) {
                return {
                    triggered: true,
                    reason: 'take_profit',
                    asset: position.marketSymbol,
                    pnlPct: position.unrealizedPnlPct,
                };
            }
        }

        // Check max hold time
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
     * Calculate unrealized PnL percentage
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
     */
    start(
        getPositions: () => Promise<MonitoredPosition[]>,
        getConfig: () => AutomationConfig
    ): void {
        if (this.isRunning) {
            logger.warn('[POSITION_MONITOR] Already running');
            return;
        }

        this.isRunning = true;
        logger.info(
            `[POSITION_MONITOR] Started with ${this.checkIntervalMs}ms interval`
        );

        this.intervalId = setInterval(async () => {
            try {
                const positions = await getPositions();
                const config = getConfig();

                for (const position of positions) {
                    const trigger = this.checkExitConditions(position, config);

                    if (trigger.triggered && this.onExitTrigger) {
                        logger.info(
                            `[POSITION_MONITOR] Exit trigger: ${trigger.reason} for ${trigger.asset}`
                        );
                        await this.onExitTrigger(trigger);
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
