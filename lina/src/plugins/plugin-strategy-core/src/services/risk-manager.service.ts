/**
 * Risk Manager Service
 *
 * Manages trading risk through:
 * - Exposure tracking (total notional vs collateral)
 * - Position sizing (% of equity, scaled by confidence)
 * - Circuit breaker integration (stops trading on drawdown)
 * - Trade cooldowns (prevents whipsaw)
 */
import { logger, type IAgentRuntime } from '@elizaos/core';
import {
    type AutomationConfig,
    type Signal,
    type RiskAssessment,
    type ExposureSnapshot,
    REJECTION_REASONS,
    calculateMaxPositionSize,
    scalePositionByConfidence,
    TradingErrors,
} from '../types';
import { CircuitBreaker } from '../utils/circuit-breaker';
import { TradeCooldown } from '../utils/trade-cooldown';

/**
 * Drift position interface (from DriftService)
 */
interface DriftPosition {
    marketSymbol: string;
    side: 'long' | 'short';
    notionalValue: string;
    unrealizedPnl: string;
}

/**
 * Drift account info interface (from DriftService)
 */
interface DriftAccountInfo {
    collateral: string;
    freeCollateral: string;
    leverage: number;
}

/**
 * Risk Manager Service
 */
export class RiskManager {
    private runtime: IAgentRuntime | null = null;
    private circuitBreakers: Map<string, CircuitBreaker> = new Map();
    private cooldowns: Map<string, TradeCooldown> = new Map();

    constructor() {}

    /**
     * Initialize with runtime for accessing DriftService
     */
    async initialize(runtime: IAgentRuntime): Promise<void> {
        this.runtime = runtime;
        logger.info('[RISK_MANAGER] RiskManager initialized');
    }

    /**
     * Assess whether a trade should be executed
     *
     * @param userId User identifier
     * @param signal Trading signal
     * @param config Automation config
     * @returns Risk assessment with trade decision
     */
    async assessTrade(
        userId: string,
        signal: Signal,
        config: AutomationConfig
    ): Promise<RiskAssessment> {
        const asset = signal.asset;

        // 1. Check if automation is enabled
        if (!config.enabled) {
            return this.reject(REJECTION_REASONS.AUTOMATION_DISABLED);
        }

        // 2. Check if asset is in allowed list
        if (!config.assets.includes(asset)) {
            return this.reject(REJECTION_REASONS.ASSET_NOT_ALLOWED);
        }

        // 3. Check if shorts are allowed (if signal is SHORT)
        if (signal.direction === 'SHORT' && !config.allowShorts) {
            return this.reject(REJECTION_REASONS.SHORTS_NOT_ALLOWED);
        }

        // 4. Check signal confidence
        if (signal.confidence < 0.6) {
            return this.reject(REJECTION_REASONS.INSUFFICIENT_CONFIDENCE);
        }

        // 5. Check circuit breaker
        const circuitBreaker = this.getCircuitBreaker(userId);
        if (circuitBreaker.isTripped()) {
            return this.reject(REJECTION_REASONS.CIRCUIT_BREAKER_TRIPPED);
        }

        // 6. Check cooldown
        const cooldown = this.getCooldown(userId, config);
        if (!cooldown.canTrade(asset)) {
            const remaining = cooldown.getRemainingCooldown(asset);
            return {
                canTrade: false,
                reason: `${REJECTION_REASONS.COOLDOWN_ACTIVE} (${Math.ceil(remaining / 1000)}s remaining)`,
                suggestedSizeUsd: 0,
                suggestedLeverage: 0,
                currentExposurePct: 0,
                remainingCapacityUsd: 0,
            };
        }

        // 7. Get current exposure
        const exposure = await this.getExposure(userId);

        // 8. Check if max exposure reached
        if (exposure.exposurePct >= config.maxExposurePct) {
            return {
                canTrade: false,
                reason: REJECTION_REASONS.MAX_EXPOSURE_REACHED,
                suggestedSizeUsd: 0,
                suggestedLeverage: 0,
                currentExposurePct: exposure.exposurePct,
                remainingCapacityUsd: 0,
            };
        }

        // 9. Calculate position size
        const maxSize = calculateMaxPositionSize(
            exposure.totalCollateral,
            exposure.exposurePct,
            config
        );

        // Scale by confidence
        const suggestedSize = scalePositionByConfidence(
            maxSize,
            signal.confidence
        );

        // Minimum position check ($1)
        if (suggestedSize < 1) {
            return this.reject(REJECTION_REASONS.INSUFFICIENT_COLLATERAL);
        }

        // 10. Determine leverage (capped by config)
        const suggestedLeverage = Math.min(config.maxLeverage, 3);

        // Calculate remaining capacity
        const remainingCapacityUsd =
            (exposure.totalCollateral * (config.maxExposurePct - exposure.exposurePct)) / 100;

        logger.info(
            `[RISK_MANAGER] Trade approved for ${asset}: ` +
            `$${suggestedSize.toFixed(2)} @ ${suggestedLeverage}x ` +
            `(exposure: ${exposure.exposurePct.toFixed(1)}%)`
        );

        return {
            canTrade: true,
            suggestedSizeUsd: suggestedSize,
            suggestedLeverage,
            currentExposurePct: exposure.exposurePct,
            remainingCapacityUsd,
        };
    }

    /**
     * Get current exposure snapshot for a user
     */
    async getExposure(userId: string): Promise<ExposureSnapshot> {
        const driftService = this.getDriftService();

        if (!driftService) {
            logger.warn('[RISK_MANAGER] DriftService not available');
            return this.emptyExposure();
        }

        try {
            const [accountInfo, positions] = await Promise.all([
                driftService.getAccountInfo(userId) as Promise<DriftAccountInfo>,
                driftService.getPositions(userId) as Promise<DriftPosition[]>,
            ]);

            const totalCollateral = parseFloat(accountInfo.collateral);
            const freeCollateral = parseFloat(accountInfo.freeCollateral);

            // Sum notional values
            let totalNotional = 0;
            const positionsByAsset: ExposureSnapshot['positionsByAsset'] = {};

            for (const pos of positions) {
                const notional = parseFloat(pos.notionalValue);
                const pnl = parseFloat(pos.unrealizedPnl);
                totalNotional += notional;

                positionsByAsset[pos.marketSymbol] = {
                    notionalValue: notional,
                    side: pos.side,
                    unrealizedPnl: pnl,
                };
            }

            const exposurePct = totalCollateral > 0
                ? (totalNotional / totalCollateral) * 100
                : 0;

            return {
                totalCollateral,
                totalNotional,
                exposurePct,
                freeCollateral,
                accountLeverage: accountInfo.leverage,
                positionCount: positions.length,
                positionsByAsset,
            };
        } catch (error) {
            logger.error(
                '[RISK_MANAGER] Failed to get exposure:',
                error instanceof Error ? error.message : String(error)
            );
            return this.emptyExposure();
        }
    }

    /**
     * Record a trade execution (for cooldown and circuit breaker)
     *
     * @param userId User identifier
     * @param asset Asset traded
     * @param realizedPnL P&L from the trade (for circuit breaker)
     */
    async recordTrade(
        userId: string,
        asset: string,
        realizedPnL: number,
        config: AutomationConfig
    ): Promise<void> {
        // Update cooldown
        const cooldown = this.getCooldown(userId, config);
        cooldown.recordTrade(asset);

        // Update circuit breaker
        const circuitBreaker = this.getCircuitBreaker(userId);
        await circuitBreaker.updatePnL(realizedPnL);

        logger.debug(
            `[RISK_MANAGER] Recorded trade for ${asset}: PnL $${realizedPnL.toFixed(2)}`
        );
    }

    /**
     * Initialize circuit breaker for a user with current equity
     */
    async initializeCircuitBreaker(
        userId: string,
        config: AutomationConfig
    ): Promise<void> {
        const exposure = await this.getExposure(userId);

        const circuitBreaker = new CircuitBreaker(exposure.totalCollateral, {
            thresholdPct: config.circuitBreakerPct,
            onTrip: async (drawdownPct) => {
                logger.error(
                    `[RISK_MANAGER] Circuit breaker tripped for user ${userId.substring(0, 8)}... ` +
                    `at ${drawdownPct.toFixed(2)}% drawdown`
                );
            },
        });

        this.circuitBreakers.set(userId, circuitBreaker);
        logger.info(
            `[RISK_MANAGER] Circuit breaker initialized for user ${userId.substring(0, 8)}... ` +
            `with $${exposure.totalCollateral.toFixed(2)} equity, ${config.circuitBreakerPct}% threshold`
        );
    }

    /**
     * Reset circuit breaker for a user
     */
    async resetCircuitBreaker(userId: string): Promise<void> {
        const exposure = await this.getExposure(userId);
        const circuitBreaker = this.circuitBreakers.get(userId);

        if (circuitBreaker) {
            await circuitBreaker.reset(exposure.totalCollateral);
            logger.info(
                `[RISK_MANAGER] Circuit breaker reset for user ${userId.substring(0, 8)}...`
            );
        }
    }

    /**
     * Check if existing position exists (for flip detection)
     */
    async hasExistingPosition(userId: string, asset: string): Promise<boolean> {
        const exposure = await this.getExposure(userId);
        return asset in exposure.positionsByAsset;
    }

    /**
     * Get existing position side (for flip detection)
     */
    async getExistingPositionSide(
        userId: string,
        asset: string
    ): Promise<'long' | 'short' | null> {
        const exposure = await this.getExposure(userId);
        const position = exposure.positionsByAsset[asset];
        return position ? position.side : null;
    }

    /**
     * Check if signal would flip existing position
     */
    async wouldFlipPosition(
        userId: string,
        signal: Signal
    ): Promise<boolean> {
        const existingSide = await this.getExistingPositionSide(userId, signal.asset);

        if (!existingSide) return false;

        const signalSide = signal.direction.toLowerCase() as 'long' | 'short';
        return existingSide !== signalSide && signal.direction !== 'NEUTRAL';
    }

    /**
     * Get or create circuit breaker for user
     */
    private getCircuitBreaker(userId: string): CircuitBreaker {
        let circuitBreaker = this.circuitBreakers.get(userId);

        if (!circuitBreaker) {
            // Create with default values, will be properly initialized when automation starts
            circuitBreaker = new CircuitBreaker(0, { thresholdPct: 10 });
            this.circuitBreakers.set(userId, circuitBreaker);
        }

        return circuitBreaker;
    }

    /**
     * Get or create cooldown tracker for user
     */
    private getCooldown(userId: string, config: AutomationConfig): TradeCooldown {
        let cooldown = this.cooldowns.get(userId);

        if (!cooldown) {
            cooldown = new TradeCooldown(config.cooldownMinutes * 60 * 1000);
            this.cooldowns.set(userId, cooldown);
        } else {
            // Update cooldown duration if config changed
            cooldown.setCooldownMs(config.cooldownMinutes * 60 * 1000);
        }

        return cooldown;
    }

    /**
     * Get DriftService from runtime
     */
    private getDriftService(): any | null {
        if (!this.runtime) return null;

        try {
            return this.runtime.getService('DRIFT_SERVICE');
        } catch {
            return null;
        }
    }

    /**
     * Create rejection response
     */
    private reject(reason: string): RiskAssessment {
        return {
            canTrade: false,
            reason,
            suggestedSizeUsd: 0,
            suggestedLeverage: 0,
            currentExposurePct: 0,
            remainingCapacityUsd: 0,
        };
    }

    /**
     * Create empty exposure snapshot
     */
    private emptyExposure(): ExposureSnapshot {
        return {
            totalCollateral: 0,
            totalNotional: 0,
            exposurePct: 0,
            freeCollateral: 0,
            accountLeverage: 0,
            positionCount: 0,
            positionsByAsset: {},
        };
    }

    /**
     * Restore state from persisted storage
     */
    restoreState(
        userId: string,
        circuitBreakerState?: {
            tripped: boolean;
            trippedAt?: number;
            sessionPnL: number;
            startingEquity: number;
        },
        cooldownTimestamps?: Record<string, number>
    ): void {
        if (circuitBreakerState) {
            const circuitBreaker = new CircuitBreaker(circuitBreakerState.startingEquity);
            circuitBreaker.restoreState(circuitBreakerState);
            this.circuitBreakers.set(userId, circuitBreaker);
        }

        if (cooldownTimestamps) {
            const cooldown = new TradeCooldown();
            cooldown.restoreState(cooldownTimestamps);
            this.cooldowns.set(userId, cooldown);
        }
    }

    /**
     * Export state for persistence
     */
    exportState(userId: string): {
        circuitBreaker?: {
            tripped: boolean;
            trippedAt?: number;
            sessionPnL: number;
            startingEquity: number;
        };
        cooldowns?: Record<string, number>;
    } {
        const circuitBreaker = this.circuitBreakers.get(userId);
        const cooldown = this.cooldowns.get(userId);

        return {
            circuitBreaker: circuitBreaker?.getState(),
            cooldowns: cooldown?.exportState(),
        };
    }
}
