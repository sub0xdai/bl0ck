/**
 * Integration Test: RiskManager with DriftService
 *
 * Tests that RiskManager correctly validates config and signals.
 * Note: Exposure tracking requires DriftService data format matching,
 * which is tested at the unit level.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { RiskManager } from '../../src/services/risk-manager.service';
import {
    createMockDriftService,
    createTestPosition,
    type MockDriftService,
} from '../mocks/drift-service.mock';
import { createMockRuntime } from '../mocks/runtime.mock';
import {
    createTestConfig,
    createLongSignal,
    createShortSignal,
    TEST_USER_1,
    SOL_PERP,
    BTC_PERP,
} from '../helpers/test-utils';
import type { IAgentRuntime } from '@elizaos/core';
import type { AutomationConfig } from '../../src/types';

describe('Integration: RiskManager with DriftService', () => {
    let riskManager: RiskManager;
    let driftService: MockDriftService;
    let runtime: IAgentRuntime;
    let config: AutomationConfig;

    beforeEach(async () => {
        driftService = createMockDriftService();
        runtime = createMockRuntime({ driftService });
        riskManager = new RiskManager();
        await riskManager.initialize(runtime);

        config = createTestConfig({
            maxPositionPct: 10,
            maxExposurePct: 30,
            maxLeverage: 5,
            circuitBreakerPct: 10,
        });

        driftService.setCollateral(TEST_USER_1, 10000, 10000);
    });

    describe('Position Flip Detection', () => {
        it('should detect when trade would flip position', async () => {
            // Existing LONG position
            driftService.setPosition(TEST_USER_1, createTestPosition({
                marketSymbol: SOL_PERP,
                side: 'long',
            }));

            // SHORT signal would flip
            const signal = createShortSignal(SOL_PERP);
            const wouldFlip = await riskManager.wouldFlipPosition(TEST_USER_1, signal);

            expect(wouldFlip).toBe(true);
        });

        it('should not detect flip when same direction', async () => {
            // Existing LONG position
            driftService.setPosition(TEST_USER_1, createTestPosition({
                marketSymbol: SOL_PERP,
                side: 'long',
            }));

            // LONG signal - same direction
            const signal = createLongSignal(SOL_PERP);
            const wouldFlip = await riskManager.wouldFlipPosition(TEST_USER_1, signal);

            expect(wouldFlip).toBe(false);
        });

        it('should not detect flip when no existing position', async () => {
            const signal = createLongSignal(SOL_PERP);
            const wouldFlip = await riskManager.wouldFlipPosition(TEST_USER_1, signal);

            expect(wouldFlip).toBe(false);
        });

        it('should detect flip for short to long', async () => {
            // Existing SHORT position
            driftService.setPosition(TEST_USER_1, createTestPosition({
                marketSymbol: SOL_PERP,
                side: 'short',
            }));

            // LONG signal would flip
            const signal = createLongSignal(SOL_PERP);
            const wouldFlip = await riskManager.wouldFlipPosition(TEST_USER_1, signal);

            expect(wouldFlip).toBe(true);
        });
    });

    describe('Config Validation', () => {
        it('should reject trades when automation disabled', async () => {
            config = createTestConfig({ enabled: false });

            const signal = createLongSignal(SOL_PERP);
            const assessment = await riskManager.assessTrade(TEST_USER_1, signal, config);

            expect(assessment.canTrade).toBe(false);
            expect(assessment.reason).toBeDefined();
        });

        it('should reject shorts when not allowed', async () => {
            config = createTestConfig({ allowShorts: false });

            const signal = createShortSignal(SOL_PERP);
            const assessment = await riskManager.assessTrade(TEST_USER_1, signal, config);

            expect(assessment.canTrade).toBe(false);
            expect(assessment.reason?.toLowerCase()).toContain('short');
        });

        it('should reject trades on non-allowed assets', async () => {
            config = createTestConfig({ assets: ['BTC-PERP'] });

            const signal = createLongSignal(SOL_PERP);
            const assessment = await riskManager.assessTrade(TEST_USER_1, signal, config);

            expect(assessment.canTrade).toBe(false);
            expect(assessment.reason?.toLowerCase()).toContain('allowed');
        });

        it('should reject low confidence signals', async () => {
            const signal = createLongSignal(SOL_PERP, 0.5); // 50% confidence
            const assessment = await riskManager.assessTrade(TEST_USER_1, signal, config);

            expect(assessment.canTrade).toBe(false);
            expect(assessment.reason?.toLowerCase()).toContain('confidence');
        });

        it('should allow high confidence signals on allowed assets', async () => {
            config = createTestConfig({ enabled: true, assets: [SOL_PERP] });

            const signal = createLongSignal(SOL_PERP, 0.9);
            const assessment = await riskManager.assessTrade(TEST_USER_1, signal, config);

            expect(assessment.canTrade).toBe(true);
            expect(assessment.suggestedSizeUsd).toBeGreaterThan(0);
        });

        it('should allow shorts when configured', async () => {
            config = createTestConfig({ allowShorts: true, assets: [SOL_PERP] });

            const signal = createShortSignal(SOL_PERP, 0.9);
            const assessment = await riskManager.assessTrade(TEST_USER_1, signal, config);

            expect(assessment.canTrade).toBe(true);
        });
    });

    describe('Cooldown Integration', () => {
        it('should block rapid trades on same asset', async () => {
            config = createTestConfig({ cooldownMinutes: 5, assets: [SOL_PERP, BTC_PERP] });

            // First trade
            await riskManager.recordTrade(TEST_USER_1, SOL_PERP, 0, config);

            // Immediate second trade should be blocked
            const signal = createLongSignal(SOL_PERP);
            const assessment = await riskManager.assessTrade(TEST_USER_1, signal, config);

            expect(assessment.canTrade).toBe(false);
            expect(assessment.reason?.toLowerCase()).toContain('cooldown');
        });

        it('should allow trades on different assets during cooldown', async () => {
            config = createTestConfig({ cooldownMinutes: 5, assets: [SOL_PERP, BTC_PERP] });

            // Trade SOL
            await riskManager.recordTrade(TEST_USER_1, SOL_PERP, 0, config);

            // BTC should still be allowed
            const signal = createLongSignal(BTC_PERP, 0.9);
            const assessment = await riskManager.assessTrade(TEST_USER_1, signal, config);

            expect(assessment.canTrade).toBe(true);
        });
    });

    describe('No DriftService Fallback', () => {
        it('should handle missing DriftService gracefully', async () => {
            const noDriftRuntime = createMockRuntime({ driftService: null });
            const fallbackManager = new RiskManager();
            await fallbackManager.initialize(noDriftRuntime);

            const signal = createLongSignal(SOL_PERP, 0.9);
            const assessment = await fallbackManager.assessTrade(TEST_USER_1, signal, config);

            // Should still return an assessment (with zero exposure)
            expect(assessment.currentExposurePct).toBe(0);
            // Trade may or may not be allowed depending on implementation
            expect(assessment.suggestedSizeUsd).toBeDefined();
        });

        it('should return false for flip detection without DriftService', async () => {
            const noDriftRuntime = createMockRuntime({ driftService: null });
            const fallbackManager = new RiskManager();
            await fallbackManager.initialize(noDriftRuntime);

            const signal = createShortSignal(SOL_PERP);
            const wouldFlip = await fallbackManager.wouldFlipPosition(TEST_USER_1, signal);

            // No positions to flip
            expect(wouldFlip).toBe(false);
        });
    });

    describe('Risk Assessment Response', () => {
        it('should return all required fields in assessment', async () => {
            config = createTestConfig({ enabled: true, assets: [SOL_PERP] });

            const signal = createLongSignal(SOL_PERP, 0.9);
            const assessment = await riskManager.assessTrade(TEST_USER_1, signal, config);

            expect(assessment).toHaveProperty('canTrade');
            expect(assessment).toHaveProperty('suggestedSizeUsd');
            expect(assessment).toHaveProperty('suggestedLeverage');
            expect(assessment).toHaveProperty('currentExposurePct');
            expect(assessment).toHaveProperty('remainingCapacityUsd');
        });

        it('should respect max leverage config', async () => {
            config = createTestConfig({ enabled: true, assets: [SOL_PERP], maxLeverage: 3 });

            const signal = createLongSignal(SOL_PERP, 0.9);
            const assessment = await riskManager.assessTrade(TEST_USER_1, signal, config);

            expect(assessment.suggestedLeverage).toBeLessThanOrEqual(3);
        });
    });
});
