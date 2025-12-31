/**
 * Integration Test: Mock Infrastructure Verification
 *
 * Verifies that the mock DriftService, runtime, and test utilities
 * work correctly before using them in actual integration tests.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import {
    MockDriftService,
    createMockDriftService,
    createTestPosition,
    createPositionWithPnl,
} from '../mocks/drift-service.mock';
import { createMockRuntime, createMinimalMockRuntime } from '../mocks/runtime.mock';
import {
    createTestSignal,
    createLongSignal,
    createShortSignal,
    createTestConfig,
    createConfigWithStopLoss,
    createTestState,
    wait,
    waitForCondition,
    TEST_USER_1,
    SOL_PERP,
    BTC_PERP,
} from '../helpers/test-utils';

describe('Mock Infrastructure', () => {
    describe('MockDriftService', () => {
        let driftService: MockDriftService;

        beforeEach(() => {
            driftService = createMockDriftService();
        });

        it('should start with no positions', async () => {
            const positions = await driftService.getPositions(TEST_USER_1);
            expect(positions).toEqual([]);
        });

        it('should allow setting positions', async () => {
            const position = createTestPosition({ marketSymbol: SOL_PERP });
            driftService.setPosition(TEST_USER_1, position);

            const positions = await driftService.getPositions(TEST_USER_1);
            expect(positions).toHaveLength(1);
            expect(positions[0].marketSymbol).toBe(SOL_PERP);
        });

        it('should open a position', async () => {
            const result = await driftService.openPosition(TEST_USER_1, {
                marketSymbol: SOL_PERP,
                side: 'long',
                size: 100,
                leverage: 5,
            });

            expect(result.success).toBe(true);
            expect(result.txSignature).toContain('mock_open_');

            const positions = await driftService.getPositions(TEST_USER_1);
            expect(positions).toHaveLength(1);
            expect(positions[0].side).toBe('long');
        });

        it('should close a position', async () => {
            driftService.setPosition(TEST_USER_1, createTestPosition({ marketSymbol: SOL_PERP }));

            const result = await driftService.closePosition(TEST_USER_1, {
                marketSymbol: SOL_PERP,
                percentage: 100,
            });

            expect(result.success).toBe(true);

            const positions = await driftService.getPositions(TEST_USER_1);
            expect(positions).toHaveLength(0);
        });

        it('should track mock calls', async () => {
            await driftService.openPosition(TEST_USER_1, {
                marketSymbol: SOL_PERP,
                side: 'long',
                size: 100,
            });

            expect(driftService.openPosition).toHaveBeenCalledTimes(1);
            expect(driftService.openPosition.mock.calls[0][0]).toBe(TEST_USER_1);
        });

        it('should create position with specific PnL', () => {
            // Position worth $1000 with 5% profit = $50 PnL
            const position = createPositionWithPnl(SOL_PERP, 'long', 1000, 5);

            expect(position.marketSymbol).toBe(SOL_PERP);
            expect(position.side).toBe('long');
            expect(parseFloat(position.notionalValue)).toBe(1000);
            expect(parseFloat(position.unrealizedPnl)).toBeCloseTo(50, 1);
        });

        it('should create position with negative PnL', () => {
            // Position worth $1000 with -10% loss = -$100 PnL
            const position = createPositionWithPnl(SOL_PERP, 'long', 1000, -10);

            expect(parseFloat(position.unrealizedPnl)).toBeCloseTo(-100, 1);
        });

        it('should update position price and PnL', async () => {
            const position = createTestPosition({
                marketSymbol: SOL_PERP,
                side: 'long',
                entryPrice: '100.00',
                size: '10',
            });
            driftService.setPosition(TEST_USER_1, position);

            // Price goes up 10%
            driftService.updatePositionPrice(TEST_USER_1, SOL_PERP, 110);

            const updated = await driftService.getPosition(TEST_USER_1, SOL_PERP);
            expect(updated).not.toBeNull();
            expect(parseFloat(updated!.markPrice)).toBe(110);
            expect(parseFloat(updated!.unrealizedPnl)).toBe(100); // 10 units * $10 profit
        });

        it('should isolate users', async () => {
            driftService.setPosition(TEST_USER_1, createTestPosition({ marketSymbol: SOL_PERP }));
            driftService.setPosition('other-user', createTestPosition({ marketSymbol: BTC_PERP }));

            const user1Positions = await driftService.getPositions(TEST_USER_1);
            const user2Positions = await driftService.getPositions('other-user');

            expect(user1Positions).toHaveLength(1);
            expect(user1Positions[0].marketSymbol).toBe(SOL_PERP);

            expect(user2Positions).toHaveLength(1);
            expect(user2Positions[0].marketSymbol).toBe(BTC_PERP);
        });

        it('should return account info with collateral', async () => {
            driftService.setCollateral(TEST_USER_1, 10000, 8000);

            const info = await driftService.getAccountInfo(TEST_USER_1);

            expect(parseFloat(info.collateral) / 1_000_000).toBe(10000);
            expect(parseFloat(info.freeCollateral) / 1_000_000).toBe(8000);
        });

        it('should reset state and mocks', async () => {
            driftService.setPosition(TEST_USER_1, createTestPosition());
            await driftService.openPosition(TEST_USER_1, { marketSymbol: BTC_PERP, side: 'long', size: 100 });

            driftService.reset();

            const positions = await driftService.getPositions(TEST_USER_1);
            expect(positions).toHaveLength(0);
            expect(driftService.openPosition.mock.calls).toHaveLength(0);
        });
    });

    describe('Mock Runtime', () => {
        it('should create runtime with drift service', () => {
            const driftService = createMockDriftService();
            const runtime = createMockRuntime({ driftService });

            const service = runtime.getService('DRIFT_SERVICE');
            expect(service).toBe(driftService);
        });

        it('should create minimal runtime', () => {
            const runtime = createMinimalMockRuntime();

            expect(runtime.agentId).toBe('test-agent-123');
            expect(runtime.getService('DRIFT_SERVICE')).toBeNull();
        });

        it('should return null for unknown services', () => {
            const runtime = createMockRuntime();

            expect(runtime.getService('UNKNOWN_SERVICE')).toBeNull();
        });

        it('should return configured settings', () => {
            const runtime = createMockRuntime({
                settings: {
                    CUSTOM_SETTING: 'custom-value',
                },
            });

            expect(runtime.getSetting('CUSTOM_SETTING')).toBe('custom-value');
            expect(runtime.getSetting('UNKNOWN')).toBeUndefined();
        });
    });

    describe('Test Utilities', () => {
        describe('Signal Factories', () => {
            it('should create long signal', () => {
                const signal = createLongSignal(SOL_PERP, 0.9);

                expect(signal.asset).toBe(SOL_PERP);
                expect(signal.direction).toBe('LONG');
                expect(signal.confidence).toBe(0.9);
            });

            it('should create short signal', () => {
                const signal = createShortSignal(BTC_PERP);

                expect(signal.direction).toBe('SHORT');
            });

            it('should create signal with timestamp', () => {
                const before = Date.now();
                const signal = createTestSignal(SOL_PERP, 'NEUTRAL', 0.5);
                const after = Date.now();

                expect(signal.timestamp).toBeGreaterThanOrEqual(before);
                expect(signal.timestamp).toBeLessThanOrEqual(after);
            });
        });

        describe('Config Factories', () => {
            it('should create test config with defaults', () => {
                const config = createTestConfig();

                expect(config.enabled).toBe(true);
                expect(config.assets).toContain(SOL_PERP);
            });

            it('should create config with stop loss', () => {
                const config = createConfigWithStopLoss(5);

                expect(config.stopLossPct).toBe(5);
            });

            it('should allow overrides', () => {
                const config = createTestConfig({
                    maxLeverage: 10,
                    allowShorts: true,
                });

                expect(config.maxLeverage).toBe(10);
                expect(config.allowShorts).toBe(true);
            });
        });

        describe('State Factories', () => {
            it('should create initial state', () => {
                const state = createTestState(TEST_USER_1);

                expect(state.userId).toBe(TEST_USER_1);
                expect(state.config.enabled).toBe(true);
                expect(state.circuitBreakerTripped).toBe(false);
            });
        });

        describe('Async Helpers', () => {
            it('should wait for specified time', async () => {
                const start = Date.now();
                await wait(50);
                const elapsed = Date.now() - start;

                expect(elapsed).toBeGreaterThanOrEqual(45);
            });

            it('should wait for condition', async () => {
                let value = false;
                setTimeout(() => { value = true; }, 50);

                await waitForCondition(() => value, { timeoutMs: 200 });

                expect(value).toBe(true);
            });

            it('should timeout if condition never true', async () => {
                await expect(
                    waitForCondition(() => false, { timeoutMs: 50, message: 'Test timeout' })
                ).rejects.toThrow('Test timeout');
            });
        });
    });
});
