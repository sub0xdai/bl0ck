/**
 * Position Monitor Tests (TDD - Phase 3)
 *
 * Tests for stop-loss, take-profit, and max hold time triggers.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { PositionMonitor, type ExitTrigger } from '../src/services/position-monitor.service';
import { type AutomationConfig, DEFAULT_AUTOMATION_CONFIG } from '../src/types';

describe('PositionMonitor', () => {
    let monitor: PositionMonitor;

    // Test config with Phase 3 options
    const testConfig: AutomationConfig = {
        ...DEFAULT_AUTOMATION_CONFIG,
        enabled: true,
        stopLossPct: 5,      // 5% stop loss
        takeProfitPct: 10,   // 10% take profit
        maxHoldMinutes: 60,  // 1 hour max hold
    };

    beforeEach(() => {
        monitor = new PositionMonitor();
    });

    describe('PnL Calculation', () => {
        it('should calculate positive PnL for long position with price increase', () => {
            const pnlPct = monitor.calculatePnlPct('long', 100, 110);
            expect(pnlPct).toBe(10); // 10% gain
        });

        it('should calculate negative PnL for long position with price decrease', () => {
            const pnlPct = monitor.calculatePnlPct('long', 100, 95);
            expect(pnlPct).toBe(-5); // 5% loss
        });

        it('should calculate positive PnL for short position with price decrease', () => {
            const pnlPct = monitor.calculatePnlPct('short', 100, 90);
            expect(pnlPct).toBe(10); // 10% gain (shorts profit when price drops)
        });

        it('should calculate negative PnL for short position with price increase', () => {
            const pnlPct = monitor.calculatePnlPct('short', 100, 105);
            expect(pnlPct).toBe(-5); // 5% loss (shorts lose when price rises)
        });

        it('should handle zero entry price', () => {
            const pnlPct = monitor.calculatePnlPct('long', 0, 100);
            expect(pnlPct).toBe(0);
        });
    });

    describe('Stop Loss Trigger', () => {
        it('should trigger stop loss when PnL exceeds threshold', () => {
            const position = {
                marketSymbol: 'SOL-PERP',
                side: 'long' as const,
                entryPrice: 100,
                currentPrice: 94, // 6% loss
                unrealizedPnlPct: -6,
                openedAt: Date.now(),
            };

            const trigger = monitor.checkExitConditions(position, testConfig);

            expect(trigger.triggered).toBe(true);
            expect(trigger.reason).toBe('stop_loss');
            expect(trigger.asset).toBe('SOL-PERP');
            expect(trigger.pnlPct).toBe(-6);
        });

        it('should not trigger stop loss when PnL is within threshold', () => {
            const position = {
                marketSymbol: 'SOL-PERP',
                side: 'long' as const,
                entryPrice: 100,
                currentPrice: 97, // 3% loss
                unrealizedPnlPct: -3,
                openedAt: Date.now(),
            };

            const trigger = monitor.checkExitConditions(position, testConfig);

            expect(trigger.triggered).toBe(false);
        });

        it('should not trigger stop loss when disabled (undefined)', () => {
            const configNoStopLoss = { ...testConfig, stopLossPct: undefined };
            const position = {
                marketSymbol: 'SOL-PERP',
                side: 'long' as const,
                entryPrice: 100,
                currentPrice: 50, // 50% loss
                unrealizedPnlPct: -50,
                openedAt: Date.now(),
            };

            const trigger = monitor.checkExitConditions(position, configNoStopLoss);

            expect(trigger.triggered).toBe(false);
        });
    });

    describe('Take Profit Trigger', () => {
        it('should trigger take profit when PnL exceeds threshold', () => {
            const position = {
                marketSymbol: 'BTC-PERP',
                side: 'long' as const,
                entryPrice: 100,
                currentPrice: 112, // 12% gain
                unrealizedPnlPct: 12,
                openedAt: Date.now(),
            };

            const trigger = monitor.checkExitConditions(position, testConfig);

            expect(trigger.triggered).toBe(true);
            expect(trigger.reason).toBe('take_profit');
            expect(trigger.asset).toBe('BTC-PERP');
            expect(trigger.pnlPct).toBe(12);
        });

        it('should not trigger take profit when PnL is below threshold', () => {
            const position = {
                marketSymbol: 'BTC-PERP',
                side: 'long' as const,
                entryPrice: 100,
                currentPrice: 108, // 8% gain
                unrealizedPnlPct: 8,
                openedAt: Date.now(),
            };

            const trigger = monitor.checkExitConditions(position, testConfig);

            expect(trigger.triggered).toBe(false);
        });
    });

    describe('Max Hold Time Trigger', () => {
        it('should trigger max hold time when exceeded', () => {
            const oneHourAgo = Date.now() - 61 * 60 * 1000; // 61 minutes ago

            const position = {
                marketSymbol: 'ETH-PERP',
                side: 'long' as const,
                entryPrice: 100,
                currentPrice: 100,
                unrealizedPnlPct: 0,
                openedAt: oneHourAgo,
            };

            const trigger = monitor.checkExitConditions(position, testConfig);

            expect(trigger.triggered).toBe(true);
            expect(trigger.reason).toBe('max_hold_time');
            expect(trigger.asset).toBe('ETH-PERP');
            expect(trigger.holdMinutes).toBeGreaterThanOrEqual(60);
        });

        it('should not trigger max hold time when within limit', () => {
            const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;

            const position = {
                marketSymbol: 'ETH-PERP',
                side: 'long' as const,
                entryPrice: 100,
                currentPrice: 100,
                unrealizedPnlPct: 0,
                openedAt: thirtyMinutesAgo,
            };

            const trigger = monitor.checkExitConditions(position, testConfig);

            expect(trigger.triggered).toBe(false);
        });
    });

    describe('Trigger Priority', () => {
        it('should trigger stop loss before take profit if both conditions met', () => {
            // Edge case: shouldn't happen in practice, but test priority
            const position = {
                marketSymbol: 'SOL-PERP',
                side: 'long' as const,
                entryPrice: 100,
                currentPrice: 94,
                unrealizedPnlPct: -6, // Stop loss triggers
                openedAt: Date.now() - 120 * 60 * 1000, // Also exceeds hold time
            };

            const trigger = monitor.checkExitConditions(position, testConfig);

            // Stop loss is checked first
            expect(trigger.triggered).toBe(true);
            expect(trigger.reason).toBe('stop_loss');
        });
    });

    describe('Position Tracking', () => {
        it('should track position open times', () => {
            const now = Date.now();
            monitor.trackPositionOpen('SOL-PERP', now);

            expect(monitor.getPositionOpenTime('SOL-PERP')).toBe(now);
        });

        it('should return undefined for untracked positions', () => {
            expect(monitor.getPositionOpenTime('UNKNOWN-PERP')).toBeUndefined();
        });

        it('should clear position tracking', () => {
            monitor.trackPositionOpen('SOL-PERP');
            monitor.clearPositionTracking('SOL-PERP');

            expect(monitor.getPositionOpenTime('SOL-PERP')).toBeUndefined();
        });

        it('should track multiple positions independently', () => {
            const now = Date.now();
            monitor.trackPositionOpen('SOL-PERP', now);
            monitor.trackPositionOpen('BTC-PERP', now + 1000);

            expect(monitor.getPositionOpenTime('SOL-PERP')).toBe(now);
            expect(monitor.getPositionOpenTime('BTC-PERP')).toBe(now + 1000);
        });
    });

    describe('Monitor Lifecycle', () => {
        it('should not be running initially', () => {
            expect(monitor.running).toBe(false);
        });

        it('should start and stop cleanly', () => {
            const testUserId = 'test-user-123';

            monitor.start(
                testUserId,
                async () => [],
                () => testConfig
            );

            expect(monitor.running).toBe(true);

            monitor.stop();

            expect(monitor.running).toBe(false);
        });
    });
});
