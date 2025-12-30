/**
 * Execution Tests (TDD - Phase 3)
 *
 * Tests for execution safeguards including:
 * - Slippage protection
 * - Pre-trade price validation
 * - Transaction confirmation
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
    type AutomationConfig,
    type ExecutionParams,
    DEFAULT_AUTOMATION_CONFIG,
    calculateSlippagePrice,
    validatePreTradePrice,
} from '../src/types';

describe('Execution Safeguards', () => {
    describe('Slippage Calculation', () => {
        it('should calculate max price for LONG with slippage', () => {
            const oraclePrice = 100;
            const slippageBps = 50; // 0.5%

            const maxPrice = calculateSlippagePrice(oraclePrice, slippageBps, 'long');

            // 100 + 0.5% = 100.50
            expect(maxPrice).toBeCloseTo(100.50, 2);
        });

        it('should calculate min price for SHORT with slippage', () => {
            const oraclePrice = 100;
            const slippageBps = 50; // 0.5%

            const minPrice = calculateSlippagePrice(oraclePrice, slippageBps, 'short');

            // 100 - 0.5% = 99.50
            expect(minPrice).toBeCloseTo(99.50, 2);
        });

        it('should handle zero slippage', () => {
            const oraclePrice = 100;
            const slippageBps = 0;

            expect(calculateSlippagePrice(oraclePrice, slippageBps, 'long')).toBe(100);
            expect(calculateSlippagePrice(oraclePrice, slippageBps, 'short')).toBe(100);
        });

        it('should handle large slippage values', () => {
            const oraclePrice = 100;
            const slippageBps = 500; // 5%

            expect(calculateSlippagePrice(oraclePrice, slippageBps, 'long')).toBe(105);
            expect(calculateSlippagePrice(oraclePrice, slippageBps, 'short')).toBe(95);
        });
    });

    describe('Pre-Trade Price Validation', () => {
        it('should accept trade when price moved within tolerance', () => {
            const signalPrice = 100;
            const currentPrice = 100.3; // 0.3% move
            const maxDriftBps = 50; // 0.5% tolerance

            const result = validatePreTradePrice(signalPrice, currentPrice, maxDriftBps);

            expect(result.valid).toBe(true);
        });

        it('should reject trade when price moved beyond tolerance', () => {
            const signalPrice = 100;
            const currentPrice = 101; // 1% move
            const maxDriftBps = 50; // 0.5% tolerance

            const result = validatePreTradePrice(signalPrice, currentPrice, maxDriftBps);

            expect(result.valid).toBe(false);
            expect(result.priceDriftBps).toBeCloseTo(100, 0); // ~1%
        });

        it('should handle negative price movements', () => {
            const signalPrice = 100;
            const currentPrice = 99; // -1% move
            const maxDriftBps = 50; // 0.5% tolerance

            const result = validatePreTradePrice(signalPrice, currentPrice, maxDriftBps);

            expect(result.valid).toBe(false);
            expect(result.priceDriftBps).toBeCloseTo(100, 0); // ~1%
        });

        it('should handle exact threshold price', () => {
            const signalPrice = 100;
            const currentPrice = 100.5; // Exactly 0.5% move
            const maxDriftBps = 50; // 0.5% tolerance

            const result = validatePreTradePrice(signalPrice, currentPrice, maxDriftBps);

            // Exactly at threshold should be valid
            expect(result.valid).toBe(true);
        });
    });

    describe('ExecutionParams with Slippage', () => {
        it('should include slippageBps in execution params', () => {
            const config: AutomationConfig = {
                ...DEFAULT_AUTOMATION_CONFIG,
                maxSlippageBps: 75,
            };

            expect(config.maxSlippageBps).toBe(75);
        });

        it('should have default slippage in config', () => {
            expect(DEFAULT_AUTOMATION_CONFIG.maxSlippageBps).toBe(50); // 0.5% default
        });
    });
});
