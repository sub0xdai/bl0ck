/**
 * TradeCooldown - Prevents whipsaw trades by enforcing per-asset cooldowns
 *
 * After trading an asset, a cooldown period must pass before trading
 * that same asset again. This prevents rapid flip-flopping between
 * LONG and SHORT positions.
 */
import { logger } from '@elizaos/core';
import { TradingErrors } from '../types';

/**
 * Options for trade cooldown
 */
export interface TradeCooldownOptions {
    /** Cooldown duration in milliseconds */
    cooldownMs: number;
}

/**
 * Default cooldown: 5 minutes
 */
export const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * TradeCooldown implementation
 */
export class TradeCooldown {
    private lastTradeTimestamps: Map<string, number> = new Map();
    private cooldownMs: number;

    constructor(cooldownMs: number = DEFAULT_COOLDOWN_MS) {
        this.cooldownMs = cooldownMs;
    }

    /**
     * Check if trading is allowed for an asset
     *
     * @param asset Asset symbol (e.g., 'SOL-PERP')
     * @returns True if trading is allowed
     */
    canTrade(asset: string): boolean {
        const lastTrade = this.lastTradeTimestamps.get(asset);
        if (!lastTrade) return true;

        const elapsed = Date.now() - lastTrade;
        return elapsed >= this.cooldownMs;
    }

    /**
     * Get remaining cooldown time for an asset
     *
     * @param asset Asset symbol
     * @returns Remaining cooldown in milliseconds (0 if no cooldown active)
     */
    getRemainingCooldown(asset: string): number {
        const lastTrade = this.lastTradeTimestamps.get(asset);
        if (!lastTrade) return 0;

        const elapsed = Date.now() - lastTrade;
        return Math.max(0, this.cooldownMs - elapsed);
    }

    /**
     * Check if trade is allowed, throw if not
     *
     * @param asset Asset symbol
     * @throws TradingError if cooldown is active
     */
    assertCanTrade(asset: string): void {
        if (!this.canTrade(asset)) {
            const remainingMs = this.getRemainingCooldown(asset);
            throw TradingErrors.cooldownActive(asset, remainingMs);
        }
    }

    /**
     * Record a trade for an asset (starts cooldown)
     *
     * @param asset Asset symbol
     * @param timestamp Optional timestamp (defaults to now)
     */
    recordTrade(asset: string, timestamp?: number): void {
        const ts = timestamp ?? Date.now();
        this.lastTradeTimestamps.set(asset, ts);
        logger.debug(
            `[TRADE_COOLDOWN] Recorded trade for ${asset}, ` +
            `cooldown until ${new Date(ts + this.cooldownMs).toISOString()}`
        );
    }

    /**
     * Clear cooldown for a specific asset
     *
     * @param asset Asset symbol
     */
    clearCooldown(asset: string): void {
        this.lastTradeTimestamps.delete(asset);
        logger.debug(`[TRADE_COOLDOWN] Cleared cooldown for ${asset}`);
    }

    /**
     * Clear all cooldowns
     */
    clearAllCooldowns(): void {
        this.lastTradeTimestamps.clear();
        logger.debug('[TRADE_COOLDOWN] Cleared all cooldowns');
    }

    /**
     * Get all active cooldowns
     *
     * @returns Map of asset -> remaining cooldown in ms
     */
    getActiveCooldowns(): Map<string, number> {
        const result = new Map<string, number>();
        const now = Date.now();

        for (const [asset, timestamp] of this.lastTradeTimestamps.entries()) {
            const remaining = this.cooldownMs - (now - timestamp);
            if (remaining > 0) {
                result.set(asset, remaining);
            }
        }

        return result;
    }

    /**
     * Restore state from persisted storage
     *
     * @param timestamps Map of asset -> last trade timestamp
     */
    restoreState(timestamps: Record<string, number>): void {
        this.lastTradeTimestamps.clear();
        for (const [asset, timestamp] of Object.entries(timestamps)) {
            this.lastTradeTimestamps.set(asset, timestamp);
        }
        logger.debug(`[TRADE_COOLDOWN] Restored ${Object.keys(timestamps).length} cooldown states`);
    }

    /**
     * Export state for persistence
     *
     * @returns Record of asset -> last trade timestamp
     */
    exportState(): Record<string, number> {
        const result: Record<string, number> = {};
        for (const [asset, timestamp] of this.lastTradeTimestamps.entries()) {
            result[asset] = timestamp;
        }
        return result;
    }

    /**
     * Update cooldown duration
     *
     * @param cooldownMs New cooldown in milliseconds
     */
    setCooldownMs(cooldownMs: number): void {
        this.cooldownMs = cooldownMs;
        logger.debug(`[TRADE_COOLDOWN] Cooldown duration set to ${cooldownMs}ms`);
    }

    /**
     * Get current cooldown duration
     */
    getCooldownMs(): number {
        return this.cooldownMs;
    }
}
