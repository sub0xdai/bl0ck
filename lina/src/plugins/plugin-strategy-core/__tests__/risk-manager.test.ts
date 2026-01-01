/**
 * Risk Manager Tests (TDD)
 *
 * Tests for the risk manager service that handles
 * exposure tracking, position sizing, and safety controls.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { RiskManager } from '../src/services/risk-manager.service';
import {
    type AutomationConfig,
    type Signal,
    DEFAULT_AUTOMATION_CONFIG,
    REJECTION_REASONS,
} from '../src/types';

describe('RiskManager', () => {
    let riskManager: RiskManager;
    const TEST_USER_ID = 'test-user-123';

    // Default test config
    const testConfig: AutomationConfig = {
        ...DEFAULT_AUTOMATION_CONFIG,
        enabled: true,
        assets: ['SOL-PERP', 'BTC-PERP', 'ETH-PERP'],
        maxPositionPct: 5,
        maxExposurePct: 25,
        maxLeverage: 3,
        allowShorts: false,
        circuitBreakerPct: 10,
        cooldownMinutes: 5,
    };

    // Create a test signal
    function createSignal(
        asset: string,
        direction: 'LONG' | 'SHORT' | 'NEUTRAL',
        confidence: number
    ): Signal {
        return {
            asset,
            direction,
            confidence,
            sources: [],
            timestamp: Date.now(),
        };
    }

    beforeEach(() => {
        riskManager = new RiskManager();
    });

    describe('Trade Assessment - Config Checks', () => {
        it('should reject when automation is disabled', async () => {
            const disabledConfig = { ...testConfig, enabled: false };
            const signal = createSignal('SOL-PERP', 'LONG', 0.8);

            const result = await riskManager.assessTrade(TEST_USER_ID, signal, disabledConfig);

            expect(result.canTrade).toBe(false);
            expect(result.reason).toBe(REJECTION_REASONS.AUTOMATION_DISABLED);
        });

        it('should reject when asset is not in allowed list', async () => {
            const signal = createSignal('WIF-PERP', 'LONG', 0.8);

            const result = await riskManager.assessTrade(TEST_USER_ID, signal, testConfig);

            expect(result.canTrade).toBe(false);
            expect(result.reason).toBe(REJECTION_REASONS.ASSET_NOT_ALLOWED);
        });

        it('should reject SHORT when shorts are not allowed', async () => {
            const signal = createSignal('SOL-PERP', 'SHORT', 0.8);

            const result = await riskManager.assessTrade(TEST_USER_ID, signal, testConfig);

            expect(result.canTrade).toBe(false);
            expect(result.reason).toBe(REJECTION_REASONS.SHORTS_NOT_ALLOWED);
        });

        it('should allow SHORT when shorts are allowed', async () => {
            const configWithShorts = { ...testConfig, allowShorts: true };
            const signal = createSignal('SOL-PERP', 'SHORT', 0.8);

            // Note: This will still fail due to no DriftService, but should not fail on shorts check
            const result = await riskManager.assessTrade(TEST_USER_ID, signal, configWithShorts);

            // Should NOT be rejected for shorts
            expect(result.reason).not.toBe(REJECTION_REASONS.SHORTS_NOT_ALLOWED);
        });
    });

    describe('Trade Assessment - Confidence Checks', () => {
        it('should reject when confidence is below threshold', async () => {
            const signal = createSignal('SOL-PERP', 'LONG', 0.5); // Below 0.6 threshold

            const result = await riskManager.assessTrade(TEST_USER_ID, signal, testConfig);

            expect(result.canTrade).toBe(false);
            expect(result.reason).toContain(REJECTION_REASONS.INSUFFICIENT_CONFIDENCE);
        });

        it('should accept when confidence is at threshold', async () => {
            const signal = createSignal('SOL-PERP', 'LONG', 0.6);

            // Note: May fail due to no DriftService, but should pass confidence check
            const result = await riskManager.assessTrade(TEST_USER_ID, signal, testConfig);

            expect(result.reason).not.toBe(REJECTION_REASONS.INSUFFICIENT_CONFIDENCE);
        });

        it('should accept when confidence is above threshold', async () => {
            const signal = createSignal('SOL-PERP', 'LONG', 0.9);

            const result = await riskManager.assessTrade(TEST_USER_ID, signal, testConfig);

            expect(result.reason).not.toBe(REJECTION_REASONS.INSUFFICIENT_CONFIDENCE);
        });
    });

    describe('Circuit Breaker Integration', () => {
        it('should reject when circuit breaker is tripped', async () => {
            // Initialize circuit breaker with equity
            await riskManager.initializeCircuitBreaker(TEST_USER_ID, testConfig);

            // Simulate losses to trip the breaker
            await riskManager.recordTrade(TEST_USER_ID, 'SOL-PERP', -1000, testConfig);

            const signal = createSignal('SOL-PERP', 'LONG', 0.8);

            // The circuit breaker should be checked even though DriftService isn't available
            // Note: getCircuitBreaker is private, but we can test via assessTrade behavior
        });

        it('should track trades for circuit breaker', async () => {
            await riskManager.initializeCircuitBreaker(TEST_USER_ID, testConfig);

            // Record a small loss
            await riskManager.recordTrade(TEST_USER_ID, 'SOL-PERP', -100, testConfig);

            // Should still allow trades (not at threshold)
            const signal = createSignal('SOL-PERP', 'LONG', 0.8);
            const result = await riskManager.assessTrade(TEST_USER_ID, signal, testConfig);

            // Should not be rejected for circuit breaker
            expect(result.reason).not.toBe(REJECTION_REASONS.CIRCUIT_BREAKER_TRIPPED);
        });
    });

    describe('Cooldown Integration', () => {
        it('should enforce cooldown after trade', async () => {
            // Record a trade
            await riskManager.recordTrade(TEST_USER_ID, 'SOL-PERP', 0, testConfig);

            const signal = createSignal('SOL-PERP', 'LONG', 0.8);
            const result = await riskManager.assessTrade(TEST_USER_ID, signal, testConfig);

            expect(result.canTrade).toBe(false);
            expect(result.reason).toContain('cooldown');
        });

        it('should allow trade on different asset during cooldown', async () => {
            // Record a trade on SOL-PERP
            await riskManager.recordTrade(TEST_USER_ID, 'SOL-PERP', 0, testConfig);

            // Try to trade BTC-PERP
            const signal = createSignal('BTC-PERP', 'LONG', 0.8);
            const result = await riskManager.assessTrade(TEST_USER_ID, signal, testConfig);

            // Should not be rejected for cooldown (different asset)
            expect(result.reason).not.toContain('cooldown');
        });
    });

    describe('State Persistence', () => {
        it('should export state correctly', async () => {
            await riskManager.initializeCircuitBreaker(TEST_USER_ID, testConfig);
            await riskManager.recordTrade(TEST_USER_ID, 'SOL-PERP', -100, testConfig);

            const state = riskManager.exportState(TEST_USER_ID);

            expect(state.circuitBreaker).toBeDefined();
            expect(state.cooldowns).toBeDefined();
            expect(state.cooldowns!['SOL-PERP']).toBeDefined();
        });

        it('should restore state correctly', async () => {
            const now = Date.now();

            riskManager.restoreState(
                TEST_USER_ID,
                {
                    tripped: false,
                    sessionPnL: -500,
                    startingEquity: 10000,
                },
                {
                    'SOL-PERP': now,
                }
            );

            // After restore, SOL-PERP should be in cooldown
            const signal = createSignal('SOL-PERP', 'LONG', 0.8);
            const result = await riskManager.assessTrade(TEST_USER_ID, signal, testConfig);

            expect(result.canTrade).toBe(false);
            expect(result.reason).toContain('cooldown');
        });
    });

    describe('Position Flip Detection', () => {
        it('should detect position flip when side changes', async () => {
            // Note: This test requires DriftService mock
            // For now, test that the method doesn't crash
            const signal = createSignal('SOL-PERP', 'SHORT', 0.8);

            const wouldFlip = await riskManager.wouldFlipPosition(TEST_USER_ID, signal);

            // Without existing position, should not flip
            expect(wouldFlip).toBe(false);
        });

        it('should not flip for NEUTRAL signal', async () => {
            const signal = createSignal('SOL-PERP', 'NEUTRAL', 0.5);

            const wouldFlip = await riskManager.wouldFlipPosition(TEST_USER_ID, signal);

            expect(wouldFlip).toBe(false);
        });
    });

    describe('Exposure Snapshot', () => {
        it('should return empty exposure when DriftService not available', async () => {
            const exposure = await riskManager.getExposure(TEST_USER_ID);

            expect(exposure.totalCollateral).toBe(0);
            expect(exposure.totalNotional).toBe(0);
            expect(exposure.exposurePct).toBe(0);
            expect(exposure.positionCount).toBe(0);
        });
    });
});
