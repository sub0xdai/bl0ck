/**
 * Market Update Formatter
 *
 * Pure functions for generating conversational market update messages.
 * Lina uses these to communicate what she sees and what she's doing.
 *
 * Messages include actual market data from API calls - not vague sentiments.
 */

import type { Signal, SignalSource } from '../types';

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
 * Format a holding position message with market context
 */
function formatHoldingMessage(position: FormattedPosition, signal: Signal | null): string {
    const asset = getAssetName(position.marketSymbol);
    const pnl = formatPnl(position.unrealizedPnl, position.unrealizedPnlPct);
    const priceMove = ((position.markPrice - position.entryPrice) / position.entryPrice * 100);
    const priceDirection = priceMove >= 0 ? 'up' : 'down';

    // Base position info
    let message = `${asset} ${position.side}: ${pnl}. `;
    message += `Price ${priceDirection} ${Math.abs(priceMove).toFixed(2)}% from entry ($${position.entryPrice.toFixed(2)} → $${position.markPrice.toFixed(2)}). `;

    // Add market context from signal
    if (signal) {
        const data = extractMarketData(signal);
        const contextParts: string[] = [];

        if (data.priceChange7d !== undefined) {
            contextParts.push(`7d: ${formatChange(data.priceChange7d)}`);
        }
        if (data.priceChange24h !== undefined) {
            contextParts.push(`24h: ${formatChange(data.priceChange24h)}`);
        }

        if (contextParts.length > 0) {
            message += `Market: ${contextParts.join(', ')}.`;
        }

        // Position alignment check
        const isAligned = (position.side === 'long' && signal.direction === 'LONG') ||
                          (position.side === 'short' && signal.direction === 'SHORT');
        const isConflicting = (position.side === 'long' && signal.direction === 'SHORT') ||
                              (position.side === 'short' && signal.direction === 'LONG');

        if (isConflicting && signal.confidence > 0.4) {
            message += ' Signal now contrarian - watching closely.';
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
