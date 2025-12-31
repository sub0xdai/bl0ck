/**
 * Integration Test: Position Monitor Exit Triggers
 *
 * Tests that PositionMonitor correctly triggers stop-loss, take-profit,
 * and max hold time exits, and that positions are closed via DriftService.
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
    PositionMonitor,
    type MonitoredPosition,
    type ExitTrigger,
    calculateActualPnlPct,
} from '../../src/services/position-monitor.service';
import {
    createMockDriftService,
    createPositionWithPnl,
    type MockDriftService,
} from '../mocks/drift-service.mock';
import {
    createTestConfig,
    createConfigWithStopLoss,
    createConfigWithTakeProfit,
    createConfigWithMaxHoldTime,
    createConfigWithAllExits,
    wait,
    waitForCondition,
    TEST_USER_1,
    SOL_PERP,
    BTC_PERP,
} from '../helpers/test-utils';
import type { AutomationConfig } from '../../src/types';

describe('Integration: Position Monitor Exit Triggers', () => {
    let monitor: PositionMonitor;
    let driftService: MockDriftService;
    let triggeredExits: ExitTrigger[];
    let config: AutomationConfig;

    // Helper to convert DriftService positions to MonitoredPositions
    const getMonitoredPositions = async (): Promise<MonitoredPosition[]> => {
        const positions = await driftService.getPositions(TEST_USER_1);
        return positions.map(pos => ({
            marketSymbol: pos.marketSymbol,
            side: pos.side,
            entryPrice: parseFloat(pos.entryPrice),
            currentPrice: parseFloat(pos.markPrice),
            unrealizedPnlUsd: parseFloat(pos.unrealizedPnl),
            notionalValueUsd: parseFloat(pos.notionalValue),
            unrealizedPnlPct: calculateActualPnlPct(
                parseFloat(pos.unrealizedPnl),
                parseFloat(pos.notionalValue)
            ),
            openedAt: Date.now() - 60000, // 1 minute ago by default
        }));
    };

    beforeEach(() => {
        triggeredExits = [];
        driftService = createMockDriftService();
        config = createConfigWithStopLoss(5); // 5% stop loss

        monitor = new PositionMonitor({
            checkIntervalMs: 50, // Fast interval for testing
            onExitTrigger: async (_userId: string, trigger: ExitTrigger) => {
                triggeredExits.push(trigger);
                // Simulate closing position via DriftService
                if (trigger.asset) {
                    await driftService.closePosition(TEST_USER_1, {
                        marketSymbol: trigger.asset,
                        percentage: 100,
                    });
                }
            },
        });
    });

    afterEach(() => {
        if (monitor.running) {
            monitor.stop();
        }
    });

    describe('Stop Loss Triggers', () => {
        it('should trigger stop loss when PnL drops below threshold', async () => {
            // Position with -6% PnL (below -5% stop loss)
            const position = createPositionWithPnl(SOL_PERP, 'long', 1000, -6);
            driftService.setPosition(TEST_USER_1, position);

            monitor.start(
                TEST_USER_1,
                getMonitoredPositions,
                () => config
            );

            await waitForCondition(
                () => triggeredExits.length > 0,
                { timeoutMs: 500 }
            );

            expect(triggeredExits).toHaveLength(1);
            expect(triggeredExits[0].reason).toBe('stop_loss');
            expect(triggeredExits[0].asset).toBe(SOL_PERP);
            expect(triggeredExits[0].pnlPct).toBeLessThan(-5);
        });

        it('should NOT trigger stop loss when PnL is above threshold', async () => {
            // Position with -3% PnL (above -5% stop loss)
            const position = createPositionWithPnl(SOL_PERP, 'long', 1000, -3);
            driftService.setPosition(TEST_USER_1, position);

            monitor.start(
                TEST_USER_1,
                getMonitoredPositions,
                () => config
            );

            await wait(150); // Wait for a few check cycles

            expect(triggeredExits).toHaveLength(0);
        });

        it('should close position when stop loss triggers', async () => {
            const position = createPositionWithPnl(SOL_PERP, 'long', 1000, -6);
            driftService.setPosition(TEST_USER_1, position);

            monitor.start(
                TEST_USER_1,
                getMonitoredPositions,
                () => config
            );

            await waitForCondition(
                () => driftService.closePosition.mock.calls.length > 0,
                { timeoutMs: 500 }
            );

            expect(driftService.closePosition).toHaveBeenCalledTimes(1);
            expect(driftService.closePosition.mock.calls[0][1].marketSymbol).toBe(SOL_PERP);
        });

        it('should handle short position stop loss correctly', async () => {
            // Short position with -7% PnL (price went up, bad for short)
            const position = createPositionWithPnl(SOL_PERP, 'short', 1000, -7);
            driftService.setPosition(TEST_USER_1, position);

            monitor.start(
                TEST_USER_1,
                getMonitoredPositions,
                () => config
            );

            await waitForCondition(
                () => triggeredExits.length > 0,
                { timeoutMs: 500 }
            );

            expect(triggeredExits[0].reason).toBe('stop_loss');
        });
    });

    describe('Take Profit Triggers', () => {
        beforeEach(() => {
            config = createConfigWithTakeProfit(10); // 10% take profit
        });

        it('should trigger take profit when PnL exceeds threshold', async () => {
            // Position with +12% PnL (above 10% take profit)
            const position = createPositionWithPnl(SOL_PERP, 'long', 1000, 12);
            driftService.setPosition(TEST_USER_1, position);

            monitor.start(
                TEST_USER_1,
                getMonitoredPositions,
                () => config
            );

            await waitForCondition(
                () => triggeredExits.length > 0,
                { timeoutMs: 500 }
            );

            expect(triggeredExits).toHaveLength(1);
            expect(triggeredExits[0].reason).toBe('take_profit');
            expect(triggeredExits[0].pnlPct).toBeGreaterThan(10);
        });

        it('should NOT trigger take profit when PnL is below threshold', async () => {
            // Position with +7% PnL (below 10% take profit)
            const position = createPositionWithPnl(SOL_PERP, 'long', 1000, 7);
            driftService.setPosition(TEST_USER_1, position);

            monitor.start(
                TEST_USER_1,
                getMonitoredPositions,
                () => config
            );

            await wait(150);

            expect(triggeredExits).toHaveLength(0);
        });
    });

    describe('Max Hold Time Triggers', () => {
        beforeEach(() => {
            config = createConfigWithMaxHoldTime(1); // 1 minute max hold
        });

        it('should trigger max hold time when position is too old', async () => {
            const position = createPositionWithPnl(SOL_PERP, 'long', 1000, 2);
            driftService.setPosition(TEST_USER_1, position);

            // Override getMonitoredPositions to return old position
            const oldPositionTime = Date.now() - 2 * 60 * 1000; // 2 minutes ago
            const getOldPositions = async (): Promise<MonitoredPosition[]> => {
                const positions = await driftService.getPositions(TEST_USER_1);
                return positions.map(pos => ({
                    marketSymbol: pos.marketSymbol,
                    side: pos.side,
                    entryPrice: parseFloat(pos.entryPrice),
                    currentPrice: parseFloat(pos.markPrice),
                    unrealizedPnlUsd: parseFloat(pos.unrealizedPnl),
                    notionalValueUsd: parseFloat(pos.notionalValue),
                    unrealizedPnlPct: calculateActualPnlPct(
                        parseFloat(pos.unrealizedPnl),
                        parseFloat(pos.notionalValue)
                    ),
                    openedAt: oldPositionTime,
                }));
            };

            monitor.start(
                TEST_USER_1,
                getOldPositions,
                () => config
            );

            await waitForCondition(
                () => triggeredExits.length > 0,
                { timeoutMs: 500 }
            );

            expect(triggeredExits[0].reason).toBe('max_hold_time');
            expect(triggeredExits[0].holdMinutes).toBeGreaterThanOrEqual(1);
        });

        it('should NOT trigger max hold time for recent positions', async () => {
            const position = createPositionWithPnl(SOL_PERP, 'long', 1000, 2);
            driftService.setPosition(TEST_USER_1, position);

            // Position opened 30 seconds ago (below 1 minute threshold)
            const recentPositionTime = Date.now() - 30 * 1000;
            const getRecentPositions = async (): Promise<MonitoredPosition[]> => {
                const positions = await driftService.getPositions(TEST_USER_1);
                return positions.map(pos => ({
                    marketSymbol: pos.marketSymbol,
                    side: pos.side,
                    entryPrice: parseFloat(pos.entryPrice),
                    currentPrice: parseFloat(pos.markPrice),
                    unrealizedPnlUsd: parseFloat(pos.unrealizedPnl),
                    notionalValueUsd: parseFloat(pos.notionalValue),
                    unrealizedPnlPct: calculateActualPnlPct(
                        parseFloat(pos.unrealizedPnl),
                        parseFloat(pos.notionalValue)
                    ),
                    openedAt: recentPositionTime,
                }));
            };

            monitor.start(
                TEST_USER_1,
                getRecentPositions,
                () => config
            );

            await wait(150);

            expect(triggeredExits).toHaveLength(0);
        });
    });

    describe('Trigger Priority', () => {
        it('should prioritize stop loss over take profit', async () => {
            // This shouldn't happen in practice, but test priority anyway
            config = createConfigWithAllExits(5, 10, 60);

            // Position at exactly -5% (stop loss boundary)
            const position = createPositionWithPnl(SOL_PERP, 'long', 1000, -5);
            driftService.setPosition(TEST_USER_1, position);

            monitor.start(
                TEST_USER_1,
                getMonitoredPositions,
                () => config
            );

            await waitForCondition(
                () => triggeredExits.length > 0,
                { timeoutMs: 500 }
            );

            expect(triggeredExits[0].reason).toBe('stop_loss');
        });
    });

    describe('Multiple Positions', () => {
        it('should monitor multiple positions independently', async () => {
            config = createConfigWithStopLoss(5);

            // SOL position at -6% (should trigger)
            const solPosition = createPositionWithPnl(SOL_PERP, 'long', 1000, -6);
            // BTC position at -3% (should NOT trigger)
            const btcPosition = createPositionWithPnl(BTC_PERP, 'long', 1000, -3);

            driftService.setPosition(TEST_USER_1, solPosition);
            driftService.setPosition(TEST_USER_1, btcPosition);

            monitor.start(
                TEST_USER_1,
                getMonitoredPositions,
                () => config
            );

            await waitForCondition(
                () => triggeredExits.length > 0,
                { timeoutMs: 500 }
            );

            // Only SOL should trigger
            expect(triggeredExits).toHaveLength(1);
            expect(triggeredExits[0].asset).toBe(SOL_PERP);

            // BTC should still be open
            const positions = await driftService.getPositions(TEST_USER_1);
            expect(positions).toHaveLength(1);
            expect(positions[0].marketSymbol).toBe(BTC_PERP);
        });

        it('should trigger multiple exits in sequence', async () => {
            config = createConfigWithStopLoss(5);

            // Both positions at -6% (should trigger)
            const solPosition = createPositionWithPnl(SOL_PERP, 'long', 1000, -6);
            const btcPosition = createPositionWithPnl(BTC_PERP, 'long', 1000, -7);

            driftService.setPosition(TEST_USER_1, solPosition);
            driftService.setPosition(TEST_USER_1, btcPosition);

            monitor.start(
                TEST_USER_1,
                getMonitoredPositions,
                () => config
            );

            await waitForCondition(
                () => triggeredExits.length >= 2,
                { timeoutMs: 500 }
            );

            expect(triggeredExits).toHaveLength(2);
            const assets = triggeredExits.map(t => t.asset);
            expect(assets).toContain(SOL_PERP);
            expect(assets).toContain(BTC_PERP);
        });
    });

    describe('Config Changes', () => {
        it('should respect config changes between checks', async () => {
            let currentConfig = createTestConfig({ stopLossPct: undefined }); // No SL initially

            // Position at -6% (no SL configured, shouldn't trigger)
            const position = createPositionWithPnl(SOL_PERP, 'long', 1000, -6);
            driftService.setPosition(TEST_USER_1, position);

            monitor.start(
                TEST_USER_1,
                getMonitoredPositions,
                () => currentConfig
            );

            await wait(100);
            expect(triggeredExits).toHaveLength(0);

            // Now enable stop loss
            currentConfig = createConfigWithStopLoss(5);

            await waitForCondition(
                () => triggeredExits.length > 0,
                { timeoutMs: 500 }
            );

            expect(triggeredExits[0].reason).toBe('stop_loss');
        });
    });

    describe('No Exit Conditions Configured', () => {
        it('should not trigger exits when no conditions are set', async () => {
            config = createTestConfig({
                stopLossPct: undefined,
                takeProfitPct: undefined,
                maxHoldMinutes: undefined,
            });

            // Position at -50% (massive loss, but no SL configured)
            const position = createPositionWithPnl(SOL_PERP, 'long', 1000, -50);
            driftService.setPosition(TEST_USER_1, position);

            monitor.start(
                TEST_USER_1,
                getMonitoredPositions,
                () => config
            );

            await wait(150);

            expect(triggeredExits).toHaveLength(0);
        });
    });

    describe('USD-Based PnL Calculation', () => {
        it('should use USD values not price-based calculation', () => {
            // Position with $50 PnL on $1000 notional = 5%
            const pnlPct = calculateActualPnlPct(50, 1000);
            expect(pnlPct).toBe(5);

            // Negative PnL
            const negPnlPct = calculateActualPnlPct(-75, 1000);
            expect(negPnlPct).toBe(-7.5);
        });

        it('should handle zero notional value', () => {
            const pnlPct = calculateActualPnlPct(50, 0);
            expect(pnlPct).toBe(0);
        });
    });
});
