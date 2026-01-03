/**
 * Signals Service
 *
 * Aggregates trading signals from multiple data sources:
 * - Trend signals (OpenBB technicals or CoinGecko price change)
 * - News signals (CoinDesk/Web Search sentiment)
 * - Volume signals (DeFiLlama TVL changes)
 *
 * Uses weighted scoring to generate final signal per asset.
 */
import { logger, type IAgentRuntime } from '@elizaos/core';
import {
    type Signal,
    type SignalSource,
    type SignalWeights,
    DEFAULT_SIGNAL_WEIGHTS,
    SIGNAL_CONFIDENCE_THRESHOLD,
    TREND_THRESHOLD_PCT,
    aggregateSignals,
    TradingErrors,
} from '../types';
import { OpenBBService, createOpenBBService } from './openbb.service';

/**
 * Asset symbol to base symbol mapping (SOL-PERP -> SOL)
 */
function getBaseSymbol(perpSymbol: string): string {
    return perpSymbol.replace('-PERP', '').replace('1M', '');
}

/**
 * Map Drift symbol to CoinGecko ID
 */
const COINGECKO_IDS: Record<string, string> = {
    'SOL': 'solana',
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'WIF': 'dogwifcoin',
    'BONK': 'bonk',
    'JUP': 'jupiter-exchange-solana',
    'JTO': 'jito-governance-token',
    'PYTH': 'pyth-network',
    'RNDR': 'render-token',
    'INJ': 'injective-protocol',
    'LINK': 'chainlink',
    'PEPE': 'pepe',
    'DOGE': 'dogecoin',
    'AVAX': 'avalanche-2',
    'SUI': 'sui',
    'APT': 'aptos',
    'ARB': 'arbitrum',
    'OP': 'optimism',
    'MATIC': 'matic-network',
};

/**
 * Configuration for signals service
 */
export interface SignalsConfig {
    /** Signal weights */
    weights: SignalWeights;

    /** Confidence threshold for non-neutral signals */
    confidenceThreshold: number;

    /** Trend threshold percentage for bullish/bearish */
    trendThresholdPct: number;

    /** Enable OpenBB integration (requires running API) */
    enableOpenBB: boolean;

    /** OpenBB API URL */
    openBBUrl?: string;

    /** Timeout for data provider calls in ms */
    timeoutMs: number;
}

/**
 * Default signals configuration
 */
export const DEFAULT_SIGNALS_CONFIG: SignalsConfig = {
    weights: DEFAULT_SIGNAL_WEIGHTS,
    confidenceThreshold: SIGNAL_CONFIDENCE_THRESHOLD,
    trendThresholdPct: TREND_THRESHOLD_PCT,
    enableOpenBB: true,
    timeoutMs: 15000,
};

/**
 * Signals Service - Multi-source signal aggregation
 */
export class SignalsService {
    private config: SignalsConfig;
    private openBB: OpenBBService | null = null;
    private runtime: IAgentRuntime | null = null;

    constructor(config: Partial<SignalsConfig> = {}) {
        this.config = { ...DEFAULT_SIGNALS_CONFIG, ...config };
    }

    /**
     * Initialize service with runtime for accessing other services
     */
    async initialize(runtime: IAgentRuntime): Promise<void> {
        this.runtime = runtime;

        // Try to initialize OpenBB if enabled
        if (this.config.enableOpenBB) {
            try {
                this.openBB = await createOpenBBService({
                    baseUrl: this.config.openBBUrl,
                    timeoutMs: this.config.timeoutMs,
                });

                if (this.openBB.isAvailable()) {
                    logger.info('[SIGNALS] OpenBB integration enabled');
                } else {
                    logger.warn('[SIGNALS] OpenBB not available, using fallback providers');
                    this.openBB = null;
                }
            } catch (error) {
                logger.warn(
                    '[SIGNALS] Failed to initialize OpenBB, using fallback:',
                    error instanceof Error ? error.message : String(error)
                );
                this.openBB = null;
            }
        }

        logger.info('[SIGNALS] SignalsService initialized');
    }

    /**
     * Generate aggregated signal for an asset
     *
     * @param asset Drift market symbol (e.g., 'SOL-PERP')
     * @returns Aggregated signal with direction, confidence, and sources
     */
    async getSignalForAsset(asset: string): Promise<Signal> {
        const baseSymbol = getBaseSymbol(asset);
        const sources: SignalSource[] = [];

        // Fetch signals from all sources in parallel (with timeout)
        const [trendSignal, newsSignal, volumeSignal] = await Promise.all([
            this.getTrendSignal(baseSymbol).catch((e) => {
                logger.warn(`[SIGNALS] Trend signal failed for ${asset}: ${e.message}`);
                return null;
            }),
            this.getNewsSignal(baseSymbol).catch((e) => {
                logger.warn(`[SIGNALS] News signal failed for ${asset}: ${e.message}`);
                return null;
            }),
            this.getVolumeSignal(baseSymbol).catch((e) => {
                logger.warn(`[SIGNALS] Volume signal failed for ${asset}: ${e.message}`);
                return null;
            }),
        ]);

        // Add trend signal if available
        if (trendSignal !== null) {
            sources.push({
                name: 'trend',
                value: trendSignal.value,
                weight: this.config.weights.trend,
                rawData: trendSignal.rawData,
            });
        }

        // Add news signal if available
        if (newsSignal !== null) {
            sources.push({
                name: 'news',
                value: newsSignal.value,
                weight: this.config.weights.news,
                rawData: newsSignal.rawData,
            });
        }

        // Add volume signal if available
        if (volumeSignal !== null) {
            sources.push({
                name: 'volume',
                value: volumeSignal.value,
                weight: this.config.weights.volume,
                rawData: volumeSignal.rawData,
            });
        }

        // If no signals available, return neutral
        if (sources.length === 0) {
            logger.warn(`[SIGNALS] No signal sources available for ${asset}`);
            return {
                asset,
                direction: 'NEUTRAL',
                confidence: 0,
                sources: [],
                timestamp: Date.now(),
            };
        }

        // Normalize weights to sum to 1
        const totalWeight = sources.reduce((sum, s) => sum + s.weight, 0);
        const normalizedSources = sources.map((s) => ({
            ...s,
            weight: s.weight / totalWeight,
        }));

        // Aggregate signals
        const signal = aggregateSignals(asset, normalizedSources);

        // Detailed logging for debugging
        const sourceDetails = normalizedSources.map(s =>
            `${s.name}=${s.value.toFixed(2)}(w:${s.weight.toFixed(2)})`
        ).join(', ');
        console.log(`[SIGNALS] ${asset} raw: ${sourceDetails}`);

        logger.info(
            `[SIGNALS] ${asset}: ${signal.direction} (confidence: ${(signal.confidence * 100).toFixed(1)}%) ` +
            `from ${sources.length} sources`
        );

        return signal;
    }

    /**
     * Get trend signal using OpenBB technicals or CoinGecko fallback
     */
    private async getTrendSignal(
        symbol: string
    ): Promise<{ value: number; rawData: unknown } | null> {
        // Try OpenBB first if available
        if (this.openBB?.isAvailable()) {
            try {
                const ohlcv = await this.openBB.fetchOHLCV(symbol, '1d', 30);
                const { value: trendValue, details } = await this.openBB.calculateTrendSignal(ohlcv);

                return {
                    value: trendValue,
                    rawData: { 
                        source: 'openbb', 
                        candleCount: ohlcv.length,
                        ...details
                    },
                };
            } catch (error) {
                logger.debug(`[SIGNALS] OpenBB trend failed, trying CoinGecko fallback`);
            }
        }

        // Fallback to CoinGecko price change
        return this.getTrendSignalFromCoinGecko(symbol);
    }

    /**
     * Get trend signal from CoinGecko 7d price change
     */
    private async getTrendSignalFromCoinGecko(
        symbol: string
    ): Promise<{ value: number; rawData: unknown } | null> {
        const coinGeckoId = COINGECKO_IDS[symbol];
        if (!coinGeckoId) {
            logger.warn(`[SIGNALS] No CoinGecko mapping for ${symbol}`);
            return null;
        }

        try {
            // Use CoinGecko service if available
            const coinGeckoService = this.runtime?.getService('COINGECKO_SERVICE') as any;

            if (coinGeckoService?.getTokenPriceChart) {
                const priceData = await this.withTimeout(
                    coinGeckoService.getTokenPriceChart(coinGeckoId, '7d'),
                    this.config.timeoutMs
                );

                const prices = (priceData as { prices?: number[][] })?.prices;
                if (prices && prices.length >= 2) {
                    const firstPrice = prices[0][1];
                    const lastPrice = prices[prices.length - 1][1];
                    const priceChange = ((lastPrice - firstPrice) / firstPrice) * 100;

                    // Convert to -1 to 1 signal
                    let value = 0;
                    if (priceChange > this.config.trendThresholdPct) {
                        value = Math.min(1, priceChange / (this.config.trendThresholdPct * 2));
                    } else if (priceChange < -this.config.trendThresholdPct) {
                        value = Math.max(-1, priceChange / (this.config.trendThresholdPct * 2));
                    }

                    return {
                        value,
                        rawData: { source: 'coingecko', priceChange7d: priceChange },
                    };
                }
            }

            // Direct API fallback if service not available
            const response = await this.withTimeout(
                fetch(
                    `https://api.coingecko.com/api/v3/coins/${coinGeckoId}?localization=false&tickers=false&community_data=false&developer_data=false`
                ),
                this.config.timeoutMs
            );

            if (response.ok) {
                const data = await response.json();
                const priceChange7d = data.market_data?.price_change_percentage_7d || 0;

                let value = 0;
                if (priceChange7d > this.config.trendThresholdPct) {
                    value = Math.min(1, priceChange7d / (this.config.trendThresholdPct * 2));
                } else if (priceChange7d < -this.config.trendThresholdPct) {
                    value = Math.max(-1, priceChange7d / (this.config.trendThresholdPct * 2));
                }

                return {
                    value,
                    rawData: { source: 'coingecko_api', priceChange7d },
                };
            }

            return null;
        } catch (error) {
            logger.warn(
                `[SIGNALS] CoinGecko trend failed for ${symbol}:`,
                error instanceof Error ? error.message : String(error)
            );
            return null;
        }
    }

    /**
     * Get news/sentiment signal
     */
    private async getNewsSignal(
        symbol: string
    ): Promise<{ value: number; rawData: unknown } | null> {
        // Try OpenBB news first
        if (this.openBB?.isAvailable()) {
            try {
                const news = await this.openBB.getNews(symbol, 10, 7);

                if (news.length > 0) {
                    // Simple sentiment: count positive/negative keywords
                    const sentiment = this.analyzeNewsSentiment(news);
                    return {
                        value: sentiment,
                        rawData: { source: 'openbb_news', articleCount: news.length },
                    };
                }
            } catch (error) {
                logger.debug(`[SIGNALS] OpenBB news failed, trying fallback`);
            }
        }

        // Fallback: use web search for recent news
        try {
            const webSearchService = this.runtime?.getService('TAVILY') as any;

            if (webSearchService?.search) {
                const results = await this.withTimeout(
                    webSearchService.search(`${symbol} crypto news`, {
                        topic: 'finance',
                        time_range: 'week',
                        max_results: 5,
                    }),
                    this.config.timeoutMs
                );

                const searchResults = (results as { results?: Array<{ title?: string }> })?.results;
                if (searchResults && searchResults.length > 0) {
                    // Analyze titles for sentiment
                    const titles = searchResults.map((r) => r.title || '').join(' ');
                    const sentiment = this.analyzeSentiment(titles);

                    return {
                        value: sentiment,
                        rawData: { source: 'web_search', resultCount: searchResults.length },
                    };
                }
            }
        } catch (error) {
            logger.debug(
                `[SIGNALS] Web search news failed:`,
                error instanceof Error ? error.message : String(error)
            );
        }

        // News is optional, return neutral
        return { value: 0, rawData: { source: 'none' } };
    }

    /**
     * Get volume signal from CoinGecko 24h trading volume
     * Uses price momentum as a proxy for volume-backed conviction
     */
    private async getVolumeSignal(
        symbol: string
    ): Promise<{ value: number; rawData: unknown } | null> {
        try {
            const coingeckoService = this.runtime?.getService('COINGECKO_SERVICE') as any;

            if (coingeckoService?.getTokenVolume) {
                const volumeData = await this.withTimeout(
                    coingeckoService.getTokenVolume(symbol),
                    this.config.timeoutMs
                );
                const { volume24h, priceChange24h } = volumeData as { volume24h: number; priceChange24h: number };

                // Use price momentum as volume signal:
                // High positive change = bullish with volume conviction
                // High negative change = bearish with volume conviction
                // Near zero = neutral/consolidation
                let value = 0;
                if (priceChange24h > 10) {
                    value = Math.min(1, priceChange24h / 20); // Strong bullish
                } else if (priceChange24h > 5) {
                    value = 0.5; // Moderate bullish
                } else if (priceChange24h > 0) {
                    value = 0.25; // Slight bullish
                } else if (priceChange24h < -10) {
                    value = Math.max(-1, priceChange24h / 20); // Strong bearish
                } else if (priceChange24h < -5) {
                    value = -0.5; // Moderate bearish
                } else if (priceChange24h < 0) {
                    value = -0.25; // Slight bearish
                }

                logger.debug(
                    `[SIGNALS] Volume signal for ${symbol}: priceChange=${priceChange24h}%, volume=${volume24h}, signal=${value}`
                );

                return {
                    value,
                    rawData: { source: 'coingecko', volume24h, priceChange24h },
                };
            }
        } catch (error) {
            logger.debug(
                `[SIGNALS] CoinGecko volume signal failed:`,
                error instanceof Error ? error.message : String(error)
            );
        }

        // Volume signal is optional, return neutral
        return { value: 0, rawData: { source: 'none' } };
    }

    /**
     * Analyze news articles for sentiment
     */
    private analyzeNewsSentiment(
        news: Array<{ title: string; text?: string }>
    ): number {
        const text = news.map((n) => `${n.title} ${n.text || ''}`).join(' ');
        return this.analyzeSentiment(text);
    }

    /**
     * Simple keyword-based sentiment analysis
     * Returns -1 (bearish) to 1 (bullish)
     */
    private analyzeSentiment(text: string): number {
        const lowerText = text.toLowerCase();

        const bullishWords = [
            'surge', 'soar', 'rally', 'bullish', 'gains', 'highs', 'breakout',
            'positive', 'growth', 'buy', 'long', 'up', 'pump', 'moon', 'boom',
            'adoption', 'partnership', 'launch', 'upgrade', 'success',
        ];

        const bearishWords = [
            'crash', 'plunge', 'bearish', 'losses', 'lows', 'breakdown',
            'negative', 'decline', 'sell', 'short', 'down', 'dump', 'tank',
            'hack', 'exploit', 'lawsuit', 'ban', 'warning', 'risk', 'concern',
        ];

        let bullishCount = 0;
        let bearishCount = 0;

        for (const word of bullishWords) {
            if (lowerText.includes(word)) bullishCount++;
        }

        for (const word of bearishWords) {
            if (lowerText.includes(word)) bearishCount++;
        }

        const total = bullishCount + bearishCount;
        if (total === 0) return 0;

        // Score from -1 to 1
        return (bullishCount - bearishCount) / total;
    }

    /**
     * Map symbol to DeFiLlama protocol name
     */
    private getProtocolName(symbol: string): string | null {
        const mapping: Record<string, string> = {
            'JUP': 'jupiter',
            'JTO': 'jito',
            'PYTH': 'pyth-network',
            'INJ': 'injective',
            'AAVE': 'aave',
            'UNI': 'uniswap',
            'MKR': 'makerdao',
            'CRV': 'curve-dex',
            'LDO': 'lido',
            'SNX': 'synthetix',
        };
        return mapping[symbol] || null;
    }

    /**
     * Utility to add timeout to a promise
     */
    private async withTimeout<T>(
        promise: Promise<T>,
        timeoutMs: number
    ): Promise<T> {
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), timeoutMs);
        });
        return Promise.race([promise, timeoutPromise]);
    }

    /**
     * Get signals for multiple assets
     */
    async getSignalsForAssets(assets: string[]): Promise<Signal[]> {
        const signals = await Promise.all(
            assets.map((asset) => this.getSignalForAsset(asset))
        );
        return signals;
    }

    /**
     * Update configuration
     */
    setConfig(config: Partial<SignalsConfig>): void {
        this.config = { ...this.config, ...config };
    }
}
