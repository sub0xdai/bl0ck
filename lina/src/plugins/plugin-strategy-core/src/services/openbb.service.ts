/**
 * OpenBB Platform Service
 *
 * Integrates with OpenBB REST API for:
 * - Historical crypto OHLCV data
 * - Technical indicators (RSI, MACD, SMA)
 * - News aggregation
 *
 * Requires OpenBB Platform running locally or remotely.
 * Default: http://localhost:6900
 */
import { logger } from '@elizaos/core';
import { TradingErrors } from '../types';

/**
 * OHLCV candlestick data
 */
export interface OHLCVData {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

/**
 * Technical indicator result
 */
export interface TechnicalResult {
    date: string;
    value: number;
}

/**
 * RSI indicator result
 */
export interface RSIResult {
    date: string;
    rsi: number;
}

/**
 * MACD indicator result
 */
export interface MACDResult {
    date: string;
    macd: number;
    signal: number;
    histogram: number;
}

/**
 * ATR (Average True Range) indicator result
 */
export interface ATRResult {
    date: string;
    atr: number;
}

/**
 * News article from OpenBB
 */
export interface NewsArticle {
    date: string;
    title: string;
    text?: string;
    url?: string;
    source?: string;
    symbols?: string[];
}

/**
 * OpenBB API response wrapper
 */
interface OpenBBResponse<T> {
    results: T[];
    provider?: string;
    warnings?: string[];
    error?: string;
}

/**
 * Configuration for OpenBB service
 */
export interface OpenBBConfig {
    /** Base URL for OpenBB API (default: http://localhost:6900) */
    baseUrl: string;

    /** Request timeout in ms (default: 30000) */
    timeoutMs: number;

    /** Provider for crypto data (default: coingecko) */
    cryptoProvider: string;

    /** Provider for news (default: benzinga) */
    newsProvider: string;
}

/**
 * Default OpenBB configuration
 */
export const DEFAULT_OPENBB_CONFIG: OpenBBConfig = {
    baseUrl: process.env.OPENBB_API_URL || 'http://localhost:6900',
    timeoutMs: 30000,
    cryptoProvider: 'coingecko',
    newsProvider: 'benzinga',
};

/**
 * OpenBB Platform Service
 */
export class OpenBBService {
    private config: OpenBBConfig;
    private isHealthy: boolean = false;

    constructor(config: Partial<OpenBBConfig> = {}) {
        this.config = { ...DEFAULT_OPENBB_CONFIG, ...config };
    }

    /**
     * Check if OpenBB API is available
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.fetch('/api/v1/system/health', {
                method: 'GET',
            });

            this.isHealthy = response.ok;

            if (!response.ok) {
                logger.warn('[OPENBB] Health check failed - API not available');
            }

            return this.isHealthy;
        } catch (error) {
            logger.warn(
                '[OPENBB] Health check failed:',
                error instanceof Error ? error.message : String(error)
            );
            this.isHealthy = false;
            return false;
        }
    }

    /**
     * Check if service is available
     */
    isAvailable(): boolean {
        return this.isHealthy;
    }

    /**
     * Fetch historical OHLCV data for a crypto asset
     *
     * @param symbol Crypto symbol (e.g., 'BTC', 'SOL', 'ETH')
     * @param interval Candle interval (e.g., '1d', '4h', '1h')
     * @param days Number of days of history
     */
    async fetchOHLCV(
        symbol: string,
        interval: string = '1d',
        days: number = 30
    ): Promise<OHLCVData[]> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const params = new URLSearchParams({
            symbol: symbol.toUpperCase(),
            provider: this.config.cryptoProvider,
            interval,
            start_date: startDate.toISOString().split('T')[0],
        });

        try {
            const response = await this.fetch(
                `/api/v1/crypto/price/historical?${params}`,
                { method: 'GET' }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data: OpenBBResponse<OHLCVData> = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            logger.debug(`[OPENBB] Fetched ${data.results?.length || 0} candles for ${symbol}`);
            return data.results || [];
        } catch (error) {
            logger.error(
                `[OPENBB] Failed to fetch OHLCV for ${symbol}:`,
                error instanceof Error ? error.message : String(error)
            );
            throw TradingErrors.dataProviderError('OpenBB', error);
        }
    }

    /**
     * Calculate RSI (Relative Strength Index)
     *
     * @param ohlcv OHLCV data array
     * @param period RSI period (default: 14)
     */
    async getRSI(ohlcv: OHLCVData[], period: number = 14): Promise<RSIResult[]> {
        if (ohlcv.length < period) {
            logger.warn(`[OPENBB] Insufficient data for RSI (need ${period}, have ${ohlcv.length})`);
            return [];
        }

        try {
            const response = await this.fetch('/api/v1/technical/rsi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: ohlcv,
                    target: 'close',
                    length: period,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data: OpenBBResponse<RSIResult> = await response.json();
            return data.results || [];
        } catch (error) {
            logger.error(
                '[OPENBB] Failed to calculate RSI:',
                error instanceof Error ? error.message : String(error)
            );
            throw TradingErrors.dataProviderError('OpenBB RSI', error);
        }
    }

    /**
     * Calculate MACD (Moving Average Convergence Divergence)
     *
     * @param ohlcv OHLCV data array
     * @param fastPeriod Fast EMA period (default: 12)
     * @param slowPeriod Slow EMA period (default: 26)
     * @param signalPeriod Signal line period (default: 9)
     */
    async getMACD(
        ohlcv: OHLCVData[],
        fastPeriod: number = 12,
        slowPeriod: number = 26,
        signalPeriod: number = 9
    ): Promise<MACDResult[]> {
        if (ohlcv.length < slowPeriod + signalPeriod) {
            logger.warn(`[OPENBB] Insufficient data for MACD`);
            return [];
        }

        try {
            const response = await this.fetch('/api/v1/technical/macd', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: ohlcv,
                    target: 'close',
                    fast: fastPeriod,
                    slow: slowPeriod,
                    signal: signalPeriod,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data: OpenBBResponse<MACDResult> = await response.json();
            return data.results || [];
        } catch (error) {
            logger.error(
                '[OPENBB] Failed to calculate MACD:',
                error instanceof Error ? error.message : String(error)
            );
            throw TradingErrors.dataProviderError('OpenBB MACD', error);
        }
    }

    /**
     * Calculate Simple Moving Average
     *
     * @param ohlcv OHLCV data array
     * @param period SMA period (default: 20)
     */
    async getSMA(ohlcv: OHLCVData[], period: number = 20): Promise<TechnicalResult[]> {
        if (ohlcv.length < period) {
            logger.warn(`[OPENBB] Insufficient data for SMA`);
            return [];
        }

        try {
            const response = await this.fetch('/api/v1/technical/sma', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: ohlcv,
                    target: 'close',
                    length: period,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data: OpenBBResponse<TechnicalResult> = await response.json();
            return data.results || [];
        } catch (error) {
            logger.error(
                '[OPENBB] Failed to calculate SMA:',
                error instanceof Error ? error.message : String(error)
            );
            throw TradingErrors.dataProviderError('OpenBB SMA', error);
        }
    }

    /**
     * Calculate ATR (Average True Range)
     *
     * ATR = Average of True Range over N periods
     * True Range = max(high-low, abs(high-prev_close), abs(low-prev_close))
     *
     * @param ohlcv OHLCV data array
     * @param period ATR period (default: 14)
     */
    async getATR(ohlcv: OHLCVData[], period: number = 14): Promise<ATRResult[]> {
        if (ohlcv.length < period + 1) {
            logger.warn(`[OPENBB] Insufficient data for ATR (need ${period + 1}, have ${ohlcv.length})`);
            return [];
        }

        try {
            const response = await this.fetch('/api/v1/technical/atr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: ohlcv,
                    length: period,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data: OpenBBResponse<ATRResult> = await response.json();
            return data.results || [];
        } catch (error) {
            logger.error(
                '[OPENBB] Failed to calculate ATR:',
                error instanceof Error ? error.message : String(error)
            );
            throw TradingErrors.dataProviderError('OpenBB ATR', error);
        }
    }

    /**
     * Calculate ATR locally (fallback when OpenBB ATR endpoint unavailable)
     *
     * @param ohlcv OHLCV data array
     * @param period ATR period (default: 14)
     * @returns ATR value or null if insufficient data
     */
    calculateATRLocally(ohlcv: OHLCVData[], period: number = 14): number | null {
        if (ohlcv.length < period + 1) {
            return null;
        }

        // Calculate True Range for each candle (starting from index 1)
        const trueRanges: number[] = [];
        for (let i = 1; i < ohlcv.length; i++) {
            const high = ohlcv[i].high;
            const low = ohlcv[i].low;
            const prevClose = ohlcv[i - 1].close;

            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            );
            trueRanges.push(tr);
        }

        // Calculate ATR as simple moving average of last N true ranges
        const recentTR = trueRanges.slice(-period);
        const atr = recentTR.reduce((sum, tr) => sum + tr, 0) / period;

        return atr;
    }

    /**
     * Get ATR with local fallback
     *
     * Tries OpenBB API first, falls back to local calculation if unavailable.
     *
     * @param ohlcv OHLCV data array
     * @param period ATR period (default: 14)
     * @returns Latest ATR value or null if unavailable
     */
    async getATRValue(ohlcv: OHLCVData[], period: number = 14): Promise<number | null> {
        // Try OpenBB API first
        if (this.isHealthy) {
            try {
                const atrResults = await this.getATR(ohlcv, period);
                if (atrResults.length > 0) {
                    return atrResults[atrResults.length - 1].atr;
                }
            } catch {
                logger.debug('[OPENBB] ATR API failed, falling back to local calculation');
            }
        }

        // Fallback to local calculation
        return this.calculateATRLocally(ohlcv, period);
    }

    /**
     * Fetch news articles for a symbol
     *
     * @param symbol Symbol to search for
     * @param limit Max number of articles (default: 10)
     * @param days Days of history (default: 7)
     */
    async getNews(
        symbol: string,
        limit: number = 10,
        days: number = 7
    ): Promise<NewsArticle[]> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const params = new URLSearchParams({
            symbols: symbol.toUpperCase(),
            provider: this.config.newsProvider,
            limit: String(limit),
            start_date: startDate.toISOString().split('T')[0],
        });

        try {
            const response = await this.fetch(
                `/api/v1/news/company?${params}`,
                { method: 'GET' }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data: OpenBBResponse<NewsArticle> = await response.json();
            logger.debug(`[OPENBB] Fetched ${data.results?.length || 0} news articles for ${symbol}`);
            return data.results || [];
        } catch (error) {
            logger.error(
                `[OPENBB] Failed to fetch news for ${symbol}:`,
                error instanceof Error ? error.message : String(error)
            );
            // News is optional, return empty array instead of throwing
            return [];
        }
    }

    /**
     * Calculate trend signal from technicals
     *
     * Returns a value from -1 (bearish) to 1 (bullish) plus details
     *
     * @param ohlcv OHLCV data
     */
    async calculateTrendSignal(ohlcv: OHLCVData[]): Promise<{ 
        value: number; 
        details?: { 
            rsi?: number; 
            macd?: { histogram: number; signal: number; macd: number } 
        } 
    }> {
        if (ohlcv.length < 30) {
            return { value: 0 }; // Neutral if insufficient data
        }

        try {
            // Get RSI and MACD in parallel
            const [rsiData, macdData] = await Promise.all([
                this.getRSI(ohlcv, 14),
                this.getMACD(ohlcv),
            ]);

            let signal = 0;
            let weight = 0;
            const details: any = {};

            // RSI signal (weight: 0.4)
            if (rsiData.length > 0) {
                const latestRSI = rsiData[rsiData.length - 1].rsi;
                details.rsi = latestRSI;
                
                // RSI: 30-70 neutral, <30 oversold (bullish), >70 overbought (bearish)
                if (latestRSI < 30) {
                    signal += 0.4 * 1; // Bullish
                } else if (latestRSI > 70) {
                    signal += 0.4 * -1; // Bearish
                } else {
                    // Scale between 30-70 to -0.5 to 0.5
                    const normalized = (latestRSI - 50) / 40; // -0.5 to 0.5
                    signal += 0.4 * -normalized; // Inverted: high RSI = bearish
                }
                weight += 0.4;
            }

            // MACD signal (weight: 0.6)
            if (macdData.length > 0) {
                const latest = macdData[macdData.length - 1];
                details.macd = {
                    histogram: latest.histogram,
                    signal: latest.signal,
                    macd: latest.macd
                };

                // MACD histogram: positive = bullish, negative = bearish
                const histogramSignal = Math.tanh(latest.histogram / 100); // Normalize to -1 to 1
                signal += 0.6 * histogramSignal;
                weight += 0.6;
            }

            // Normalize by actual weight used
            const finalValue = weight > 0 ? signal / weight * weight : 0;
            
            return { value: finalValue, details };
        } catch (error) {
            logger.warn(
                '[OPENBB] Failed to calculate trend signal, returning neutral:',
                error instanceof Error ? error.message : String(error)
            );
            return { value: 0 };
        }
    }

    /**
     * Internal fetch wrapper with timeout
     */
    private async fetch(
        path: string,
        options: RequestInit
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

        try {
            const response = await fetch(`${this.config.baseUrl}${path}`, {
                ...options,
                signal: controller.signal,
            });
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

/**
 * Create OpenBB service with health check
 */
export async function createOpenBBService(
    config: Partial<OpenBBConfig> = {}
): Promise<OpenBBService> {
    const service = new OpenBBService(config);
    await service.healthCheck();
    return service;
}
