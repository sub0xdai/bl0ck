/**
 * Market Update Formatter Tests (TDD)
 *
 * Tests for conversational market update messages.
 * Lina communicates what she sees and what she's doing each cycle.
 */

import { describe, it, expect } from 'bun:test';
import {
    formatMarketUpdate,
    type MarketUpdateContext,
} from '../src/utils/market-update-formatter';
import type { Signal } from '../src/types';

describe('formatMarketUpdate', () => {
    describe('Market Scan Messages', () => {
        it('should describe bullish signal with trend data', () => {
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
            expect(message).toContain('bullish');
            expect(message).toMatch(/up.*8\.5%|8\.5%.*up/i);
        });

        it('should describe bearish signal', () => {
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
            expect(message).toContain('bearish');
        });

        it('should indicate neutral/quiet markets when no strong signals', () => {
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

            expect(message).toMatch(/quiet|mixed|neutral|no clear/i);
        });
    });

    describe('Holding Position Messages', () => {
        it('should report holding status with current PnL', () => {
            const context: MarketUpdateContext = {
                signals: [{
                    asset: 'SOL-PERP',
                    direction: 'LONG',
                    confidence: 0.40,
                    sources: [],
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
            expect(message).toMatch(/holding|position/i);
            expect(message).toMatch(/\+.*4%|4%.*up|\+\$2/i);
        });

        it('should report negative PnL on losing position', () => {
            const context: MarketUpdateContext = {
                signals: [{
                    asset: 'SOL-PERP',
                    direction: 'NEUTRAL',
                    confidence: 0.20,
                    sources: [],
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
            expect(message).toMatch(/-.*3%|3%.*down|-\$1\.5/i);
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

            // Should lead with SOL (strongest signal)
            expect(message).toContain('SOL');
            expect(message).toContain('bullish');
        });
    });

    describe('No Signals Available', () => {
        it('should handle empty signals gracefully', () => {
            const context: MarketUpdateContext = {
                signals: [],
                positions: [],
                collateral: 100,
                unrealizedPnl: 0,
            };

            const message = formatMarketUpdate(context);

            expect(message).toMatch(/scanning|checking|looking/i);
        });
    });
});
