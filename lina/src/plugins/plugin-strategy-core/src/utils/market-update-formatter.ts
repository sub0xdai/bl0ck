/**
 * Market Update Formatter
 *
 * Pure functions for generating conversational market update messages.
 * Lina uses these to communicate what she sees and what she's doing.
 *
 * Messages include actual market data from API calls - not vague sentiments.
 */

import type { Signal, SignalSource, RiskAssessment } from '../types';

/**
 * Position data for formatting
 */
export interface FormattedPosition {
    marketSymbol: string;
    side: 'long' | 'short';
    entryPrice: number;
    markPrice: number;
    notionalValue: number;
    unrealizedPnl: number;
    unrealizedPnlPct: number;
    // ATR-based risk management fields (optional)
    stopLossPrice?: number;
    targetPrice?: number;
    breakEvenTriggered?: boolean;
}

/**
 * Context needed to generate a market update message
 */
export interface MarketUpdateContext {
    /** Signals from all tracked assets */
    signals: Signal[];
    /** Current open positions */
    positions: FormattedPosition[];
    /** Account collateral in USD */
    collateral: number;
    /** Total unrealized PnL in USD */
    unrealizedPnl: number;
}

/**
 * Extracted market data from signal sources
 */
interface MarketData {
    priceChange7d?: number;
    priceChange24h?: number;
    volume24h?: number;
    newsSource?: string;
    newsSentiment?: number;
    newsCount?: number;
    rsi?: number;
    macd?: { histogram: number };
}

/**
 * Extract asset name from perp symbol (SOL-PERP -> SOL)
 */
function getAssetName(symbol: string): string {
    return symbol.replace('-PERP', '').replace('1M', '');
}

/**
 * Get the strongest non-neutral signal
 */
function getTopSignal(signals: Signal[]): Signal | null {
    const actionable = signals.filter(s => s.direction !== 'NEUTRAL');
    if (actionable.length === 0) return null;
    return actionable.sort((a, b) => b.confidence - a.confidence)[0];
}

/**
 * Extract market data from signal sources
 */
function extractMarketData(signal: Signal): MarketData {
    const data: MarketData = {};

    for (const source of signal.sources) {
        const raw = source.rawData as Record<string, any> | undefined;
        if (!raw) continue;

        if (source.name === 'trend') {
            if (raw.priceChange7d !== undefined) data.priceChange7d = raw.priceChange7d;
            if (raw.rsi !== undefined) data.rsi = raw.rsi;
            if (raw.macd !== undefined) data.macd = raw.macd;
        }
        if (source.name === 'volume') {
            if (raw.priceChange24h !== undefined) data.priceChange24h = raw.priceChange24h;
            if (raw.volume24h !== undefined) data.volume24h = raw.volume24h;
        }
        if (source.name === 'news') {
            data.newsSource = raw.source;
            data.newsCount = raw.articleCount || raw.resultCount;
        }
    }

    return data;
}

/**
 * Format price change with direction
 */
function formatChange(change: number): string {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}%`;
}

/**
 * Format PnL for display
 */
function formatPnl(usd: number, pct: number): string {
    const sign = usd >= 0 ? '+' : '';
    return `${sign}$${Math.abs(usd).toFixed(2)} (${sign}${pct.toFixed(1)}%)`;
}

/**
 * Build data-rich market analysis string
 */
function buildMarketAnalysis(signal: Signal): string {
    const data = extractMarketData(signal);
    const parts: string[] = [];

    // Technicals first if available
    if (data.rsi !== undefined) {
        const rsiState = data.rsi > 70 ? 'Overbought' : data.rsi < 30 ? 'Oversold' : 'Neutral';
        parts.push(`RSI ${data.rsi.toFixed(0)} (${rsiState})`);
    }

    if (data.macd?.histogram !== undefined) {
        const mom = data.macd.histogram > 0 ? 'Bullish' : 'Bearish';
        parts.push(`MACD ${mom}`);
    }

    // Weekly trend is most important
    if (data.priceChange7d !== undefined) {
        const direction = data.priceChange7d >= 0 ? 'up' : 'down';
        parts.push(`${direction} ${Math.abs(data.priceChange7d).toFixed(1)}% this week`);
    }

    // 24h momentum
    if (data.priceChange24h !== undefined && Math.abs(data.priceChange24h) > 2) {
        const direction = data.priceChange24h >= 0 ? 'up' : 'down';
        parts.push(`${direction} ${Math.abs(data.priceChange24h).toFixed(1)}% today`);
    }

    // News activity
    if (data.newsCount && data.newsCount > 0) {
        const sentiment = signal.sources.find(s => s.name === 'news')?.value || 0;
        if (sentiment > 0.3) {
            parts.push('positive news flow');
        } else if (sentiment < -0.3) {
            parts.push('negative news');
        }
    }

    return parts.length > 0 ? parts.join(', ') : 'no significant moves';
}

/**
 * Format a market scan message when not in a position
 */
function formatMarketScan(topSignal: Signal): string {
    const asset = getAssetName(topSignal.asset);
    const analysis = buildMarketAnalysis(topSignal);
    const confidence = (topSignal.confidence * 100).toFixed(0);
    const direction = topSignal.direction === 'LONG' ? 'bullish' : 'bearish';

    return `${asset}: ${analysis}. Looking ${direction} (${confidence}% confidence).`;
}

/**
 * Calculate progress toward target (0-100%)
 */
function calculateTargetProgress(position: FormattedPosition): number | null {
    if (!position.targetPrice) return null;

    const entry = position.entryPrice;
    const current = position.markPrice;
    const target = position.targetPrice;

    if (position.side === 'long') {
        const totalDistance = target - entry;
        if (totalDistance <= 0) return null;
        return ((current - entry) / totalDistance) * 100;
    } else {
        const totalDistance = entry - target;
        if (totalDistance <= 0) return null;
        return ((entry - current) / totalDistance) * 100;
    }
}

/**
 * Calculate distance to stop (positive = above stop, negative = below)
 */
function calculateStopDistance(position: FormattedPosition): number | null {
    if (!position.stopLossPrice) return null;

    const current = position.markPrice;
    const stop = position.stopLossPrice;

    if (position.side === 'long') {
        return ((current - stop) / current) * 100; // % above stop
    } else {
        return ((stop - current) / current) * 100; // % below stop
    }
}

/**
 * Pick a varied opening phrase based on position state
 */
function pickOpeningPhrase(position: FormattedPosition, targetProgress: number | null): string {
    const asset = getAssetName(position.marketSymbol);
    const side = position.side;
    const pnlPct = position.unrealizedPnlPct;

    // Break-even locked - emphasize protection
    if (position.breakEvenTriggered) {
        const phrases = [
            `${asset} ${side} locked in`,
            `${asset} ${side} protected`,
            `Riding ${asset} ${side}`,
            `${asset} ${side} secured`,
        ];
        return phrases[Math.floor(Math.random() * phrases.length)];
    }

    // Strong profit
    if (pnlPct > 3) {
        const phrases = [
            `${asset} ${side} running`,
            `${asset} ${side} pushing higher`,
            `${asset} ${side} working`,
            `${asset} ${side} in the green`,
        ];
        return phrases[Math.floor(Math.random() * phrases.length)];
    }

    // Small profit
    if (pnlPct > 0) {
        const phrases = [
            `${asset} ${side} grinding`,
            `${asset} ${side} holding`,
            `${asset} ${side} ticking up`,
            `Watching ${asset} ${side}`,
        ];
        return phrases[Math.floor(Math.random() * phrases.length)];
    }

    // Small loss
    if (pnlPct > -2) {
        const phrases = [
            `${asset} ${side} consolidating`,
            `${asset} ${side} ranging`,
            `${asset} ${side} steady`,
            `${asset} ${side} choppy`,
        ];
        return phrases[Math.floor(Math.random() * phrases.length)];
    }

    // Bigger loss
    const phrases = [
        `${asset} ${side} under pressure`,
        `${asset} ${side} pulling back`,
        `${asset} ${side} testing patience`,
        `${asset} ${side} dipping`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Format ATR status (progress to target, stop distance, break-even)
 */
function formatAtrStatus(position: FormattedPosition): string {
    const parts: string[] = [];

    const targetProgress = calculateTargetProgress(position);
    const stopDistance = calculateStopDistance(position);

    // Break-even status first
    if (position.breakEvenTriggered) {
        parts.push(`BE locked @ $${position.stopLossPrice!.toFixed(2)}`);
    } else if (position.stopLossPrice && position.targetPrice) {
        // Show progress toward break-even trigger (50%)
        if (targetProgress !== null && targetProgress > 0) {
            if (targetProgress >= 40 && targetProgress < 50) {
                parts.push(`${targetProgress.toFixed(0)}% to target - BE trigger soon`);
            } else {
                parts.push(`${targetProgress.toFixed(0)}% to target`);
            }
        }

        // Stop distance when in danger zone
        if (stopDistance !== null && stopDistance < 2) {
            parts.push(`${stopDistance.toFixed(1)}% above stop`);
        }
    }

    // Show TP level if close
    if (position.targetPrice && targetProgress !== null && targetProgress >= 70) {
        parts.push(`TP @ $${position.targetPrice.toFixed(2)}`);
    }

    return parts.length > 0 ? parts.join(' · ') : '';
}

/**
 * Format a holding position message with market context and varied phrasing
 */
function formatHoldingMessage(position: FormattedPosition, signal: Signal | null): string {
    const pnl = formatPnl(position.unrealizedPnl, position.unrealizedPnlPct);
    const targetProgress = calculateTargetProgress(position);

    // Pick varied opening
    const opening = pickOpeningPhrase(position, targetProgress);

    // Core message with PnL
    let message = `${opening}: ${pnl}.`;

    // ATR status if available
    const atrStatus = formatAtrStatus(position);
    if (atrStatus) {
        message += ` ${atrStatus}.`;
    }

    // Price info (condensed)
    const priceMove = ((position.markPrice - position.entryPrice) / position.entryPrice * 100);
    message += ` $${position.markPrice.toFixed(2)}`;
    if (Math.abs(priceMove) > 0.5) {
        message += ` (${priceMove >= 0 ? '+' : ''}${priceMove.toFixed(1)}% from entry)`;
    }
    message += '.';

    // Market context from signal (condensed)
    if (signal) {
        const data = extractMarketData(signal);
        const contextParts: string[] = [];

        // Only show significant moves
        if (data.priceChange24h !== undefined && Math.abs(data.priceChange24h) > 1) {
            contextParts.push(`24h ${formatChange(data.priceChange24h)}`);
        }
        if (data.rsi !== undefined) {
            if (data.rsi > 65 || data.rsi < 35) {
                const state = data.rsi > 70 ? 'OB' : data.rsi < 30 ? 'OS' : data.rsi > 60 ? 'warm' : 'cool';
                contextParts.push(`RSI ${data.rsi.toFixed(0)} ${state}`);
            }
        }

        if (contextParts.length > 0) {
            message += ` ${contextParts.join(', ')}.`;
        }

        // Contrarian warning
        const isConflicting = (position.side === 'long' && signal.direction === 'SHORT') ||
                              (position.side === 'short' && signal.direction === 'LONG');
        if (isConflicting && signal.confidence > 0.5) {
            message += ' ⚠️ Signal flipping.';
        }
    }

    return message;
}

/**
 * Format a conversational market update message
 */
export function formatMarketUpdate(context: MarketUpdateContext): string {
    const { signals, positions } = context;

    // Handle empty signals
    if (signals.length === 0) {
        return 'Waiting for market data...';
    }

    // If we have positions, report on them with market context
    if (positions.length > 0) {
        const position = positions[0];
        const signalForAsset = signals.find(s => s.asset === position.marketSymbol) || null;
        return formatHoldingMessage(position, signalForAsset);
    }

    // No positions - report market scan
    const topSignal = getTopSignal(signals);
    if (topSignal) {
        return formatMarketScan(topSignal);
    }

    // All signals neutral - show actual data anyway
    const firstSignal = signals[0];
    if (firstSignal) {
        const asset = getAssetName(firstSignal.asset);
        const analysis = buildMarketAnalysis(firstSignal);
        return `${asset}: ${analysis}. No clear direction.`;
    }

    return 'Waiting for market data...';
}

/**
 * Format a detailed reasoning string for a trade decision
 */
export function formatTradeReasoning(signal: Signal, riskAssessment: RiskAssessment): string {
    const asset = getAssetName(signal.asset);
    const data = extractMarketData(signal);
    const reasoningParts: string[] = [];

    // 1. Technical reasoning
    if (data.rsi !== undefined) {
        const rsiState = data.rsi > 70 ? 'overbought' : data.rsi < 30 ? 'oversold' : 'neutral';
        reasoningParts.push(`RSI is ${data.rsi.toFixed(0)} (${rsiState})`);
    }

    if (data.macd?.histogram !== undefined) {
        const mom = data.macd.histogram > 0 ? 'bullish momentum' : 'bearish momentum';
        reasoningParts.push(`MACD showing ${mom}`);
    }

    if (data.priceChange7d !== undefined) {
        const change = Math.abs(data.priceChange7d).toFixed(1);
        const direction = data.priceChange7d >= 0 ? 'up' : 'down';
        reasoningParts.push(`7d trend is ${direction} ${change}%`);
    }

    // 2. News/Sentiment reasoning
    if (data.newsCount && data.newsCount > 0) {
        const sentiment = signal.sources.find(s => s.name === 'news')?.value || 0;
        const mood = sentiment > 0.3 ? 'positive' : sentiment < -0.3 ? 'negative' : 'neutral';
        reasoningParts.push(`news sentiment is ${mood}`);
    }

    // 3. Risk reasoning
    if (riskAssessment.canTrade) {
        reasoningParts.push(`risk checks passed (size: $${riskAssessment.suggestedSizeUsd.toFixed(0)}, leverage: ${riskAssessment.suggestedLeverage}x)`);
    } else {
        reasoningParts.push(`trade skipped: ${riskAssessment.reason}`);
    }

    const direction = signal.direction === 'LONG' ? 'long' : 'short';
    const confidence = (signal.confidence * 100).toFixed(0);

    return `Reasoning for ${asset} ${direction} (${confidence}% confidence): ${reasoningParts.join('; ')}.`;
}
