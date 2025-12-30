/**
 * Trade Cooldown Tests (TDD)
 *
 * Tests for the trade cooldown utility that prevents
 * whipsaw trades by enforcing per-asset cooldowns.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { TradeCooldown, DEFAULT_COOLDOWN_MS } from '../src/utils/trade-cooldown';
import { TradingErrorCode, isTradingError } from '../src/types';

describe('TradeCooldown', () => {
    const COOLDOWN_MS = 5000; // 5 seconds for faster tests
    let cooldown: TradeCooldown;

    beforeEach(() => {
        cooldown = new TradeCooldown(COOLDOWN_MS);
    });

    describe('Initial State', () => {
        it('should allow trading on any asset initially', () => {
            expect(cooldown.canTrade('SOL-PERP')).toBe(true);
            expect(cooldown.canTrade('BTC-PERP')).toBe(true);
            expect(cooldown.canTrade('ETH-PERP')).toBe(true);
        });

        it('should have zero remaining cooldown initially', () => {
            expect(cooldown.getRemainingCooldown('SOL-PERP')).toBe(0);
        });

        it('should have no active cooldowns initially', () => {
            const active = cooldown.getActiveCooldowns();
            expect(active.size).toBe(0);
        });

        it('should use default cooldown if not specified', () => {
            const defaultCooldown = new TradeCooldown();
            expect(defaultCooldown.getCooldownMs()).toBe(DEFAULT_COOLDOWN_MS);
        });
    });

    describe('Recording Trades', () => {
        it('should block trading after recording a trade', () => {
            cooldown.recordTrade('SOL-PERP');
            expect(cooldown.canTrade('SOL-PERP')).toBe(false);
        });

        it('should not affect other assets', () => {
            cooldown.recordTrade('SOL-PERP');
            expect(cooldown.canTrade('BTC-PERP')).toBe(true);
            expect(cooldown.canTrade('ETH-PERP')).toBe(true);
        });

        it('should report remaining cooldown', () => {
            cooldown.recordTrade('SOL-PERP');
            const remaining = cooldown.getRemainingCooldown('SOL-PERP');
            expect(remaining).toBeGreaterThan(0);
            expect(remaining).toBeLessThanOrEqual(COOLDOWN_MS);
        });

        it('should track multiple assets independently', () => {
            cooldown.recordTrade('SOL-PERP');
            cooldown.recordTrade('BTC-PERP');

            expect(cooldown.canTrade('SOL-PERP')).toBe(false);
            expect(cooldown.canTrade('BTC-PERP')).toBe(false);
            expect(cooldown.canTrade('ETH-PERP')).toBe(true);
        });

        it('should allow custom timestamp', () => {
            const pastTime = Date.now() - COOLDOWN_MS - 1000;
            cooldown.recordTrade('SOL-PERP', pastTime);

            // Should be expired already
            expect(cooldown.canTrade('SOL-PERP')).toBe(true);
        });
    });

    describe('Cooldown Expiration', () => {
        it('should allow trading after cooldown expires', async () => {
            const shortCooldown = new TradeCooldown(100); // 100ms
            shortCooldown.recordTrade('SOL-PERP');

            expect(shortCooldown.canTrade('SOL-PERP')).toBe(false);

            // Wait for cooldown to expire
            await new Promise((r) => setTimeout(r, 150));

            expect(shortCooldown.canTrade('SOL-PERP')).toBe(true);
        });

        it('should return zero remaining cooldown after expiration', async () => {
            const shortCooldown = new TradeCooldown(100);
            shortCooldown.recordTrade('SOL-PERP');

            await new Promise((r) => setTimeout(r, 150));

            expect(shortCooldown.getRemainingCooldown('SOL-PERP')).toBe(0);
        });

        it('should remove expired cooldowns from active list', async () => {
            const shortCooldown = new TradeCooldown(100);
            shortCooldown.recordTrade('SOL-PERP');

            expect(shortCooldown.getActiveCooldowns().size).toBe(1);

            await new Promise((r) => setTimeout(r, 150));

            expect(shortCooldown.getActiveCooldowns().size).toBe(0);
        });
    });

    describe('assertCanTrade', () => {
        it('should not throw when trading is allowed', () => {
            expect(() => cooldown.assertCanTrade('SOL-PERP')).not.toThrow();
        });

        it('should throw TradingError when cooldown is active', () => {
            cooldown.recordTrade('SOL-PERP');

            try {
                cooldown.assertCanTrade('SOL-PERP');
                expect(true).toBe(false); // Should not reach here
            } catch (error) {
                expect(isTradingError(error)).toBe(true);
                if (isTradingError(error)) {
                    expect(error.code).toBe(TradingErrorCode.COOLDOWN_ACTIVE);
                    expect(error.context?.asset).toBe('SOL-PERP');
                    expect(error.context?.remainingMs).toBeGreaterThan(0);
                }
            }
        });
    });

    describe('Clearing Cooldowns', () => {
        it('should clear cooldown for specific asset', () => {
            cooldown.recordTrade('SOL-PERP');
            cooldown.recordTrade('BTC-PERP');

            cooldown.clearCooldown('SOL-PERP');

            expect(cooldown.canTrade('SOL-PERP')).toBe(true);
            expect(cooldown.canTrade('BTC-PERP')).toBe(false);
        });

        it('should clear all cooldowns', () => {
            cooldown.recordTrade('SOL-PERP');
            cooldown.recordTrade('BTC-PERP');
            cooldown.recordTrade('ETH-PERP');

            cooldown.clearAllCooldowns();

            expect(cooldown.canTrade('SOL-PERP')).toBe(true);
            expect(cooldown.canTrade('BTC-PERP')).toBe(true);
            expect(cooldown.canTrade('ETH-PERP')).toBe(true);
        });

        it('should handle clearing non-existent cooldown gracefully', () => {
            expect(() => cooldown.clearCooldown('NONEXISTENT')).not.toThrow();
        });
    });

    describe('State Persistence', () => {
        it('should export state correctly', () => {
            const now = Date.now();
            cooldown.recordTrade('SOL-PERP', now);
            cooldown.recordTrade('BTC-PERP', now + 100);

            const state = cooldown.exportState();

            expect(state['SOL-PERP']).toBe(now);
            expect(state['BTC-PERP']).toBe(now + 100);
        });

        it('should restore state correctly', () => {
            const now = Date.now();
            const state = {
                'SOL-PERP': now,
                'BTC-PERP': now - COOLDOWN_MS - 1000, // Expired
            };

            cooldown.restoreState(state);

            expect(cooldown.canTrade('SOL-PERP')).toBe(false);
            expect(cooldown.canTrade('BTC-PERP')).toBe(true);
        });

        it('should clear existing state before restoring', () => {
            cooldown.recordTrade('ETH-PERP');
            cooldown.restoreState({ 'SOL-PERP': Date.now() });

            expect(cooldown.canTrade('ETH-PERP')).toBe(true);
            expect(cooldown.canTrade('SOL-PERP')).toBe(false);
        });
    });

    describe('Configuration', () => {
        it('should allow updating cooldown duration', () => {
            cooldown.setCooldownMs(10000);
            expect(cooldown.getCooldownMs()).toBe(10000);
        });

        it('should apply new duration to future trades', async () => {
            cooldown.setCooldownMs(100); // 100ms
            cooldown.recordTrade('SOL-PERP');

            expect(cooldown.canTrade('SOL-PERP')).toBe(false);

            await new Promise((r) => setTimeout(r, 150));

            expect(cooldown.canTrade('SOL-PERP')).toBe(true);
        });
    });

    describe('Active Cooldowns Reporting', () => {
        it('should list all active cooldowns', () => {
            const now = Date.now();
            cooldown.recordTrade('SOL-PERP', now);
            cooldown.recordTrade('BTC-PERP', now);

            const active = cooldown.getActiveCooldowns();

            expect(active.size).toBe(2);
            expect(active.has('SOL-PERP')).toBe(true);
            expect(active.has('BTC-PERP')).toBe(true);
        });

        it('should report accurate remaining times', () => {
            cooldown.recordTrade('SOL-PERP');

            const active = cooldown.getActiveCooldowns();
            const remaining = active.get('SOL-PERP');

            expect(remaining).toBeDefined();
            expect(remaining!).toBeGreaterThan(0);
            expect(remaining!).toBeLessThanOrEqual(COOLDOWN_MS);
        });
    });
});
