/**
 * Market Update Formatter Tests (TDD)
 *
 * Tests for conversational market update messages with real data.
 * Lina communicates actual market metrics, not vague sentiments.
 */

import { describe, it, expect } from 'bun:test';
import {
    formatMarketUpdate,
    type MarketUpdateContext,
} from '../src/utils/market-update-formatter';
import type { Signal } from '../src/types';

describe('formatMarketUpdate', () => {
    describe('Market Scan Messages', () => {
        it('should include actual price change data for bullish signal', () => {
            const context: MarketUpdateContext = {
                signals: [{
                    asset: 'SOL-PERP',
                    direction: 'LONG',
                    confidence: 0.55,
                    sources: [{
                        name: 'trend',
                        value: 0.6,
                        weight: 0.5,
                        rawData: { priceChange7d: 8.5 },
                    }],
                    timestamp: Date.now(),
                }],
                positions: [],
                collateral: 100,
                unrealizedPnl: 0,
            };

            const message = formatMarketUpdate(context);

            expect(message).toContain('SOL');
            expect(message).toContain('8.5%');
            expect(message).toContain('week');
            expect(message).toMatch(/bullish/i);
        });

        it('should describe bearish signal with data', () => {
            const context: MarketUpdateContext = {
                signals: [{
                    asset: 'ETH-PERP',
                    direction: 'SHORT',
                    confidence: 0.45,
                    sources: [{
                        name: 'trend',
                        value: -0.5,
                        weight: 0.5,
                        rawData: { priceChange7d: -6.2 },
                    }],
                    timestamp: Date.now(),
                }],
                positions: [],
                collateral: 100,
                unrealizedPnl: 0,
            };

            const message = formatMarketUpdate(context);

            expect(message).toContain('ETH');
            expect(message).toContain('6.2%');
            expect(message).toMatch(/bearish/i);
        });

        it('should show no significant moves when data is flat', () => {
            const context: MarketUpdateContext = {
                signals: [{
                    asset: 'SOL-PERP',
                    direction: 'NEUTRAL',
                    confidence: 0.15,
                    sources: [],
                    timestamp: Date.now(),
                }],
                positions: [],
                collateral: 100,
                unrealizedPnl: 0,
            };

            const message = formatMarketUpdate(context);

            expect(message).toMatch(/no significant moves|no clear direction/i);
        });
    });

    describe('Holding Position Messages', () => {
        it('should report position with entry/mark prices and PnL', () => {
            const context: MarketUpdateContext = {
                signals: [{
                    asset: 'SOL-PERP',
                    direction: 'LONG',
                    confidence: 0.40,
                    sources: [{
                        name: 'trend',
                        value: 0.3,
                        weight: 0.5,
                        rawData: { priceChange7d: 5.2 },
                    }],
                    timestamp: Date.now(),
                }],
                positions: [{
                    marketSymbol: 'SOL-PERP',
                    side: 'long',
                    entryPrice: 100,
                    markPrice: 104,
                    notionalValue: 50,
                    unrealizedPnl: 2.0,
                    unrealizedPnlPct: 4.0,
                }],
                collateral: 100,
                unrealizedPnl: 2.0,
            };

            const message = formatMarketUpdate(context);

            expect(message).toContain('SOL');
            expect(message).toContain('long');
            expect(message).toContain('$2.00');
            expect(message).toContain('4.0%');
            expect(message).toContain('$100.00');
            expect(message).toContain('$104.00');
            expect(message).toContain('7d:'); // Market context
        });

        it('should show negative PnL correctly', () => {
            const context: MarketUpdateContext = {
                signals: [{
                    asset: 'SOL-PERP',
                    direction: 'NEUTRAL',
                    confidence: 0.20,
                    sources: [{
                        name: 'trend',
                        value: -0.2,
                        weight: 0.5,
                        rawData: { priceChange7d: -2.1 },
                    }],
                    timestamp: Date.now(),
                }],
                positions: [{
                    marketSymbol: 'SOL-PERP',
                    side: 'long',
                    entryPrice: 100,
                    markPrice: 97,
                    notionalValue: 50,
                    unrealizedPnl: -1.5,
                    unrealizedPnlPct: -3.0,
                }],
                collateral: 100,
                unrealizedPnl: -1.5,
            };

            const message = formatMarketUpdate(context);

            expect(message).toContain('SOL');
            expect(message).toContain('$1.50');
            expect(message).toContain('-3.0%');
            expect(message).toContain('down');
        });

        it('should warn when signal conflicts with position', () => {
            const context: MarketUpdateContext = {
                signals: [{
                    asset: 'SOL-PERP',
                    direction: 'SHORT', // Conflicting with long position
                    confidence: 0.55,
                    sources: [{
                        name: 'trend',
                        value: -0.6,
                        weight: 0.5,
                        rawData: { priceChange7d: -8.0 },
                    }],
                    timestamp: Date.now(),
                }],
                positions: [{
                    marketSymbol: 'SOL-PERP',
                    side: 'long',
                    entryPrice: 100,
                    markPrice: 95,
                    notionalValue: 50,
                    unrealizedPnl: -2.5,
                    unrealizedPnlPct: -5.0,
                }],
                collateral: 100,
                unrealizedPnl: -2.5,
            };

            const message = formatMarketUpdate(context);

            expect(message).toContain('contrarian');
        });
    });

    describe('Multiple Assets', () => {
        it('should focus on strongest signal when multiple assets', () => {
            const context: MarketUpdateContext = {
                signals: [
                    {
                        asset: 'SOL-PERP',
                        direction: 'LONG',
                        confidence: 0.65,
                        sources: [{ name: 'trend', value: 0.7, weight: 0.5, rawData: { priceChange7d: 12.0 } }],
                        timestamp: Date.now(),
                    },
                    {
                        asset: 'ETH-PERP',
                        direction: 'NEUTRAL',
                        confidence: 0.20,
                        sources: [],
                        timestamp: Date.now(),
                    },
                ],
                positions: [],
                collateral: 100,
                unrealizedPnl: 0,
            };

            const message = formatMarketUpdate(context);

            expect(message).toContain('SOL');
            expect(message).toContain('12.0%');
        });
    });

    describe('No Signals Available', () => {
        it('should indicate waiting for data when no signals', () => {
            const context: MarketUpdateContext = {
                signals: [],
                positions: [],
                collateral: 100,
                unrealizedPnl: 0,
            };

            const message = formatMarketUpdate(context);

            expect(message).toMatch(/waiting|market data/i);
        });
    });

    describe('24h Data Integration', () => {
        it('should include 24h change when significant', () => {
            const context: MarketUpdateContext = {
                signals: [{
                    asset: 'SOL-PERP',
                    direction: 'LONG',
                    confidence: 0.50,
                    sources: [
                        { name: 'trend', value: 0.5, weight: 0.5, rawData: { priceChange7d: 5.0 } },
                        { name: 'volume', value: 0.4, weight: 0.3, rawData: { priceChange24h: 4.5, volume24h: 1000000 } },
                    ],
                    timestamp: Date.now(),
                }],
                positions: [],
                collateral: 100,
                unrealizedPnl: 0,
            };

            const message = formatMarketUpdate(context);

            expect(message).toContain('4.5%');
            expect(message).toContain('today');
        });
    });
});
