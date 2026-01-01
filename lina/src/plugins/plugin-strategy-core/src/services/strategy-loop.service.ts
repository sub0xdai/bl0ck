/**
 * Strategy Loop Service (The Conductor)
 *
 * Orchestrates the automated trading cycle:
 * 1. Fetch signals from SignalsService
 * 2. Assess risk via RiskManager
 * 3. Execute trades via DriftService
 *
 * Supports dry-run mode for testing without execution.
 */
import {
    Service,
    type IAgentRuntime,
    logger,
} from '@elizaos/core';
import { BehaviorSubject } from 'rxjs';
import {
    type AutomationConfig,
    type AutomationState,
    type Signal,
    type RiskAssessment,
    DEFAULT_AUTOMATION_CONFIG,
    createInitialState,
} from '../types';
import { SignalsService } from './signals.service';
import { RiskManager } from './risk-manager.service';
import {
    PositionMonitor,
    type MonitoredPosition,
    type ExitTrigger,
    calculateActualPnlPct,
} from './position-monitor.service';
import { AutomationStateStore, getAutomationStateStore } from '../state/automation-state.store';
import { getExecutionCoordinator } from '../utils/execution-coordinator';

/**
 * Cycle result for a single asset
 */
export interface CycleAssetResult {
    asset: string;
    signal: Signal;
    riskAssessment: RiskAssessment;
    executed: boolean;
    executionResult?: {
        success: boolean;
        txSignature?: string;
        error?: string;
    };
}

/**
 * Cycle result summary
 */
export interface CycleResult {
    timestamp: number;
    cycleNumber: number;
    userId: string;
    dryRun: boolean;
    assets: CycleAssetResult[];
    duration: number;
}

/**
 * Market context observable state
 */
export interface MarketContext {
    timestamp: number;
    lastCycleResult?: CycleResult;
    activeUsers: number;
}

/**
 * Strategy Loop Service
 */
export class StrategyLoop extends Service {
    static serviceType = 'strategy-core';
    capabilityDescription = 'Core trading strategy engine (The Conductor) for market analysis and trade execution';

    private intervalId: NodeJS.Timeout | null = null;
    private isRunning = false;
    private loopIntervalMs = 5 * 60 * 1000; // 5 minutes default

    // Services
    private signalsService: SignalsService;
    private riskManager: RiskManager;
    private stateStore: AutomationStateStore;

    // User states (in-memory, synced with database)
    private userStates: Map<string, AutomationState> = new Map();

    // Position monitors per user (for SL/TP/hold time enforcement)
    private positionMonitors: Map<string, PositionMonitor> = new Map();

    // Observable state for external consumers
    public marketContext$ = new BehaviorSubject<MarketContext | null>(null);

    constructor(runtime: IAgentRuntime) {
        super(runtime);
        this.signalsService = new SignalsService();
        this.riskManager = new RiskManager();
        this.stateStore = getAutomationStateStore();
    }

    /**
     * Send a chat message to the user's channel for trading updates
     */
    private async sendChatMessage(
        channelId: string,
        content: string,
        thought?: string,
        actions?: string[]
    ): Promise<void> {
        try {
            const serverPort = process.env.SERVER_PORT || '3000';
            const serverUrl = `http://localhost:${serverPort}`;
            const agentId = this.runtime.agentId;

            const response = await fetch(`${serverUrl}/api/messaging/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    channel_id: channelId,
                    server_id: '00000000-0000-0000-0000-000000000000',
                    author_id: agentId,
                    content,
                    source_type: 'agent_response',
                    raw_message: {
                        thought: thought || content,
                        actions: actions || [],
                    },
                    metadata: {
                        agentName: 'Lina',
                    },
                }),
            });

            if (!response.ok) {
                logger.warn(`[STRATEGY_LOOP] Failed to send chat message: ${response.status}`);
            }
        } catch (error) {
            logger.error(
                '[STRATEGY_LOOP] Error sending chat message:',
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    static async start(runtime: IAgentRuntime): Promise<StrategyLoop> {
        logger.info('[STRATEGY_LOOP] === SERVICE START CALLED ===');
        try {
            const svc = new StrategyLoop(runtime);
            await svc.initialize();
            logger.info('[STRATEGY_LOOP] === SERVICE STARTED SUCCESSFULLY ===');
            return svc;
        } catch (error) {
            logger.error('[STRATEGY_LOOP] === SERVICE START FAILED ===', error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    async initialize(_runtime?: IAgentRuntime): Promise<void> {
        logger.info('[STRATEGY_LOOP] Initializing Strategy Core...');

        // Initialize state store
        try {
            await this.stateStore.initialize();
        } catch (error) {
            logger.warn(
                '[STRATEGY_LOOP] State store initialization failed, running without persistence:',
                error instanceof Error ? error.message : String(error)
            );
        }

        // Initialize services
        await this.signalsService.initialize(this.runtime);
        await this.riskManager.initialize(this.runtime);

        // Load enabled users from database
        await this.loadEnabledUsers();

        // Start position monitors for enabled users
        for (const [userId, state] of this.userStates.entries()) {
            if (state.config.enabled) {
                this.startMonitoringForUser(userId);
            }
        }

        // Start the loop
        this.startLoop();

        const enabledCount = this.getEnabledUserCount();
        const monitorCount = this.positionMonitors.size;
        logger.info(
            `[STRATEGY_LOOP] Strategy Core initialized. ` +
            `${enabledCount} users with automation enabled, ` +
            `${monitorCount} position monitors active.`
        );
    }

    /**
     * Load users with automation enabled from database
     */
    private async loadEnabledUsers(): Promise<void> {
        try {
            const enabledStates = await this.stateStore.getEnabledUsers();

            for (const state of enabledStates) {
                this.userStates.set(state.userId, state);

                // Restore risk manager state
                this.riskManager.restoreState(
                    state.userId,
                    {
                        tripped: state.circuitBreakerTripped,
                        trippedAt: state.circuitBreakerTrippedAt,
                        sessionPnL: state.sessionPnL,
                        startingEquity: 0, // Will be re-initialized
                    },
                    state.lastTradeTimestamps
                );
            }

            logger.info(`[STRATEGY_LOOP] Loaded ${enabledStates.length} enabled user states`);
        } catch (error) {
            logger.warn(
                '[STRATEGY_LOOP] Failed to load enabled users:',
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    /**
     * Enable automation for a user
     */
    async enableAutomation(
        userId: string,
        config: Partial<AutomationConfig> = {}
    ): Promise<AutomationState> {
        const fullConfig: AutomationConfig = {
            ...DEFAULT_AUTOMATION_CONFIG,
            ...config,
            enabled: true,
        };

        const state = createInitialState(userId, fullConfig);
        this.userStates.set(userId, state);

        // Initialize circuit breaker with current equity
        await this.riskManager.initializeCircuitBreaker(userId, fullConfig);

        // Persist
        await this.stateStore.saveState(state);

        // Start position monitoring if exit conditions are configured
        this.startMonitoringForUser(userId);

        logger.info(
            `[STRATEGY_LOOP] Automation enabled for user ${userId.substring(0, 8)}... ` +
            `Assets: ${fullConfig.assets.join(', ')}`
        );

        return state;
    }

    /**
     * Disable automation for a user
     */
    async disableAutomation(
        userId: string,
        closePositions: boolean = false
    ): Promise<void> {
        const state = this.userStates.get(userId);

        if (state) {
            state.config.enabled = false;
            await this.stateStore.saveState(state);
        }

        // Stop position monitoring
        this.stopMonitoringForUser(userId);

        if (closePositions) {
            await this.closeAllPositions(userId);
        }

        logger.info(
            `[STRATEGY_LOOP] Automation disabled for user ${userId.substring(0, 8)}...` +
            (closePositions ? ' (positions closed)' : '')
        );
    }

    /**
     * Get automation status for a user
     */
    getStatus(userId: string): AutomationState | null {
        return this.userStates.get(userId) || null;
    }

    /**
     * Update automation config for a user
     */
    async updateConfig(
        userId: string,
        config: Partial<AutomationConfig>
    ): Promise<AutomationState | null> {
        const state = this.userStates.get(userId);
        if (!state) return null;

        state.config = { ...state.config, ...config };
        await this.stateStore.saveState(state);

        return state;
    }

    /**
     * Get count of enabled users
     */
    getEnabledUserCount(): number {
        let count = 0;
        for (const state of this.userStates.values()) {
            if (state.config.enabled) count++;
        }
        return count;
    }

    // =========================================================================
    // Position Monitoring (SL/TP/Hold Time)
    // =========================================================================

    /**
     * Start position monitoring for a user
     */
    private startMonitoringForUser(userId: string): void {
        // Stop existing monitor if any
        const existing = this.positionMonitors.get(userId);
        if (existing?.running) {
            existing.stop();
        }

        const state = this.userStates.get(userId);
        if (!state) return;

        // Only start if SL, TP, or hold time is configured
        const config = state.config;
        const hasExitConditions =
            (config.stopLossPct !== undefined && config.stopLossPct > 0) ||
            (config.takeProfitPct !== undefined && config.takeProfitPct > 0) ||
            (config.maxHoldMinutes !== undefined && config.maxHoldMinutes > 0);

        if (!hasExitConditions) {
            logger.debug(
                `[STRATEGY_LOOP] No exit conditions configured for user ${userId.substring(0, 8)}..., skipping monitor`
            );
            return;
        }

        const monitor = new PositionMonitor({
            checkIntervalMs: 30_000, // 30 second checks
            onExitTrigger: this.handleExitTrigger.bind(this),
        });

        monitor.start(
            userId,
            () => this.getMonitoredPositions(userId),
            () => state.config
        );

        this.positionMonitors.set(userId, monitor);
        logger.info(
            `[STRATEGY_LOOP] Started position monitoring for user ${userId.substring(0, 8)}...`
        );
    }

    /**
     * Stop position monitoring for a user
     */
    private stopMonitoringForUser(userId: string): void {
        const monitor = this.positionMonitors.get(userId);
        if (monitor?.running) {
            monitor.stop();
            this.positionMonitors.delete(userId);
            logger.info(
                `[STRATEGY_LOOP] Stopped position monitoring for user ${userId.substring(0, 8)}...`
            );
        }
    }

    /**
     * Fetch positions from DriftService and convert to MonitoredPosition format
     */
    private async getMonitoredPositions(userId: string): Promise<MonitoredPosition[]> {
        const driftService = this.runtime.getService('DRIFT_SERVICE') as any;
        if (!driftService) return [];

        const state = this.userStates.get(userId);
        if (!state) return [];

        try {
            const positions = await driftService.getPositions(userId);
            if (!positions || !Array.isArray(positions)) return [];

            return positions.map((pos: any) => {
                const unrealizedPnlUsd = parseFloat(pos.unrealizedPnl) || 0;
                const notionalValueUsd = parseFloat(pos.notionalValue) || 0;

                return {
                    marketSymbol: pos.marketSymbol,
                    side: pos.side as 'long' | 'short',
                    entryPrice: parseFloat(pos.entryPrice) || 0,
                    currentPrice: parseFloat(pos.markPrice) || 0,
                    unrealizedPnlUsd,
                    notionalValueUsd,
                    unrealizedPnlPct: calculateActualPnlPct(unrealizedPnlUsd, notionalValueUsd),
                    openedAt: state.positionOpenTimes[pos.marketSymbol] || Date.now(),
                };
            });
        } catch (error) {
            logger.error(
                '[STRATEGY_LOOP] Failed to fetch positions for monitoring:',
                error instanceof Error ? error.message : String(error)
            );
            return [];
        }
    }

    /**
     * Handle exit triggers from PositionMonitor (SL/TP/max hold time)
     */
    private async handleExitTrigger(userId: string, trigger: ExitTrigger): Promise<void> {
        if (!trigger.asset) return;

        const driftService = this.runtime.getService('DRIFT_SERVICE') as any;
        if (!driftService) {
            logger.error('[STRATEGY_LOOP] Cannot close position - DriftService not available');
            return;
        }

        const state = this.userStates.get(userId);
        const config = state?.config;

        try {
            const reasonLabel =
                trigger.reason === 'stop_loss' ? 'STOP-LOSS' :
                trigger.reason === 'take_profit' ? 'TAKE-PROFIT' : 'MAX-HOLD-TIME';

            logger.info(
                `[STRATEGY_LOOP] [${reasonLabel}] Closing ${trigger.asset} for user ${userId.substring(0, 8)}... ` +
                `(PnL: ${trigger.pnlPct !== undefined ? trigger.pnlPct.toFixed(2) + '%' : 'N/A'})`
            );

            // Get position PnL before closing
            const position = await driftService.getPosition(userId, trigger.asset);
            const realizedPnL = position ? parseFloat(position.unrealizedPnl) || 0 : 0;

            // Close the position
            const result = await driftService.closePosition(userId, {
                marketSymbol: trigger.asset,
                percentage: 100,
            });

            if (result.success) {
                // Check if circuit breaker was NOT tripped before this trade
                const wasTrippedBefore = this.riskManager.isCircuitBreakerTripped(userId);

                // Record realized PnL for circuit breaker tracking
                if (config) {
                    await this.riskManager.recordTrade(userId, trigger.asset, realizedPnL, config);
                }

                // Check if circuit breaker tripped after this trade
                const isTrippedNow = this.riskManager.isCircuitBreakerTripped(userId);
                if (!wasTrippedBefore && isTrippedNow && state?.channelId) {
                    const sessionPnL = this.riskManager.getSessionPnL(userId);
                    await this.sendChatMessage(
                        state.channelId,
                        `⚠️ Circuit breaker triggered · Session PnL: $${sessionPnL.toFixed(2)} · Trading paused`,
                        `Circuit breaker tripped at ${config?.circuitBreakerPct || 10}% drawdown threshold`,
                        ['CIRCUIT_BREAKER', 'TRADING_PAUSED']
                    );
                }

                // Clear position tracking
                if (state) {
                    delete state.positionOpenTimes[trigger.asset];
                    await this.stateStore.saveState(state);
                }

                // Notify user of position close
                if (state?.channelId) {
                    const assetName = trigger.asset.replace('-PERP', '');
                    const pnlSign = realizedPnL >= 0 ? '+' : '';
                    const pnlIcon = realizedPnL >= 0 ? '✅' : '🔴';

                    await this.sendChatMessage(
                        state.channelId,
                        `${pnlIcon} Closed ${assetName} · ${pnlSign}$${realizedPnL.toFixed(2)} (${reasonLabel})`,
                        `Position closed due to ${trigger.reason === 'stop_loss' ? 'stop-loss limit' : trigger.reason === 'take_profit' ? 'take-profit target' : 'max hold time'}`,
                        ['CLOSE_POSITION', (trigger.reason || 'exit').toUpperCase()]
                    );
                }

                logger.info(
                    `[STRATEGY_LOOP] [${reasonLabel}] ${trigger.asset} closed successfully ` +
                    `(realized PnL: $${realizedPnL.toFixed(2)})`
                );
            } else {
                logger.error(`[STRATEGY_LOOP] Failed to close position: ${result.error}`);

                // Notify user of failed close
                if (state?.channelId) {
                    await this.sendChatMessage(
                        state.channelId,
                        `⚠️ Failed to close ${trigger.asset.replace('-PERP', '')}: ${result.error || 'Unknown error'}`,
                        'Position close failed',
                        ['CLOSE_FAILED']
                    );
                }
            }
        } catch (error) {
            logger.error(
                `[STRATEGY_LOOP] Exception closing position ${trigger.asset}:`,
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    /**
     * Start the analysis loop
     */
    private startLoop(): void {
        if (this.isRunning) return;
        this.isRunning = true;

        logger.info(`[STRATEGY_LOOP] Starting analysis loop (${this.loopIntervalMs / 1000}s interval)`);

        this.intervalId = setInterval(async () => {
            await this.executeCycleForAllUsers();
        }, this.loopIntervalMs);

        // Run first cycle after a short delay
        setTimeout(() => this.executeCycleForAllUsers(), 5000);
    }

    /**
     * Execute cycle for all enabled users
     */
    private async executeCycleForAllUsers(): Promise<void> {
        // Refresh enabled users from database to pick up REST API changes
        await this.loadEnabledUsers();

        const enabledUsers = Array.from(this.userStates.entries())
            .filter(([_, state]) => state.config.enabled);

        if (enabledUsers.length === 0) {
            logger.debug('[STRATEGY_LOOP] No enabled users, skipping cycle');
            return;
        }

        logger.info(`[STRATEGY_LOOP] --- Starting Cycle for ${enabledUsers.length} users ---`);

        for (const [userId, state] of enabledUsers) {
            try {
                await this.executeCycleForUser(userId, state);
            } catch (error) {
                logger.error(
                    `[STRATEGY_LOOP] Cycle failed for user ${userId.substring(0, 8)}...:`,
                    error instanceof Error ? error.message : String(error)
                );

                // Record error but don't stop other users
                state.errors.push(
                    `Cycle error: ${error instanceof Error ? error.message : String(error)}`
                );
                if (state.errors.length > 10) state.errors.shift(); // Keep last 10 errors
            }
        }

        // Update market context
        this.marketContext$.next({
            timestamp: Date.now(),
            activeUsers: enabledUsers.length,
        });

        logger.info('[STRATEGY_LOOP] --- Cycle Complete ---');
    }

    /**
     * Execute trading cycle for a single user
     */
    private async executeCycleForUser(
        userId: string,
        state: AutomationState
    ): Promise<CycleResult> {
        const startTime = Date.now();
        state.cycleCount++;
        state.lastCycleAt = startTime;

        const config = state.config;
        const assets = config.assets;
        const dryRun = !config.enabled; // Safety: treat disabled as dry-run

        // Log execution mode for observability
        logger.info(
            `[STRATEGY_LOOP] Cycle ${state.cycleCount} for ${userId.substring(0, 8)}... | ` +
            `mode: ${dryRun ? 'DRY-RUN' : 'LIVE'} | enabled: ${config.enabled}`
        );

        const results: CycleAssetResult[] = [];
        const channelId = state.channelId;

        // Get signals for all assets
        const signals = await this.signalsService.getSignalsForAssets(assets);

        // Notify user of cycle start (only if not dry-run and channelId exists)
        if (!dryRun && channelId) {
            const assetNames = assets.map(a => a.replace('-PERP', '')).join(', ');
            await this.sendChatMessage(
                channelId,
                `Analyzing ${assetNames} for trading opportunities...`,
                `Starting cycle ${state.cycleCount} - scanning market signals`,
                ['CYCLE_START']
            );
        }

        for (const signal of signals) {
            // Skip neutral signals
            if (signal.direction === 'NEUTRAL') {
                results.push({
                    asset: signal.asset,
                    signal,
                    riskAssessment: { canTrade: false, reason: 'Neutral signal', suggestedSizeUsd: 0, suggestedLeverage: 0, currentExposurePct: 0, remainingCapacityUsd: 0 },
                    executed: false,
                });
                continue;
            }

            // Assess risk
            const riskAssessment = await this.riskManager.assessTrade(
                userId,
                signal,
                config
            );

            if (!riskAssessment.canTrade) {
                logger.info(
                    `[STRATEGY_LOOP] ${signal.asset}: Skipped - ${riskAssessment.reason}`
                );
                results.push({
                    asset: signal.asset,
                    signal,
                    riskAssessment,
                    executed: false,
                });
                continue;
            }

            // Execute trade (or simulate in dry-run)
            if (dryRun) {
                logger.info(
                    `[STRATEGY_LOOP] [DRY-RUN] ${signal.asset}: Would ${signal.direction} ` +
                    `$${riskAssessment.suggestedSizeUsd.toFixed(2)} @ ${riskAssessment.suggestedLeverage}x`
                );
                results.push({
                    asset: signal.asset,
                    signal,
                    riskAssessment,
                    executed: false,
                    executionResult: { success: true, txSignature: 'DRY_RUN' },
                });
            } else {
                // Real execution
                const executionResult = await this.executeSignal(
                    userId,
                    signal,
                    riskAssessment,
                    config
                );

                // Notify user of trade execution
                if (channelId && executionResult.success) {
                    const direction = signal.direction;
                    const assetName = signal.asset.replace('-PERP', '');
                    const size = riskAssessment.suggestedSizeUsd.toFixed(0);
                    const leverage = riskAssessment.suggestedLeverage;
                    const icon = direction === 'LONG' ? '🔵' : '🔴';

                    await this.sendChatMessage(
                        channelId,
                        `${icon} Opened ${direction} ${assetName} · $${size} @ ${leverage}x leverage`,
                        `Signal confidence: ${(signal.confidence * 100).toFixed(0)}%`,
                        ['OPEN_POSITION', direction]
                    );
                } else if (channelId && !executionResult.success) {
                    await this.sendChatMessage(
                        channelId,
                        `Failed to execute ${signal.direction} on ${signal.asset.replace('-PERP', '')}: ${executionResult.error || 'Unknown error'}`,
                        'Trade execution failed',
                        ['EXECUTION_FAILED']
                    );
                }

                results.push({
                    asset: signal.asset,
                    signal,
                    riskAssessment,
                    executed: executionResult.success,
                    executionResult,
                });
            }
        }

        // Save updated state
        await this.stateStore.saveState(state);

        const cycleResult: CycleResult = {
            timestamp: startTime,
            cycleNumber: state.cycleCount,
            userId,
            dryRun,
            assets: results,
            duration: Date.now() - startTime,
        };

        return cycleResult;
    }

    /**
     * Execute a trading signal via DriftService
     */
    private async executeSignal(
        userId: string,
        signal: Signal,
        riskAssessment: RiskAssessment,
        config: AutomationConfig
    ): Promise<{ success: boolean; txSignature?: string; error?: string }> {
        const driftService = this.runtime.getService('DRIFT_SERVICE') as any;

        if (!driftService) {
            return { success: false, error: 'DriftService not available' };
        }

        // Acquire execution lock to prevent race conditions with PositionMonitor
        const coordinator = getExecutionCoordinator();
        const wouldFlip = await this.riskManager.wouldFlipPosition(userId, signal);
        const operationType = wouldFlip ? 'flip' : 'open';

        return coordinator.withLock(userId, signal.asset, operationType, async () => {
            try {
                let realizedPnL = 0;

                if (wouldFlip) {
                    logger.info(`[STRATEGY_LOOP] Flipping position for ${signal.asset}`);

                    // Get current position's unrealized PnL before closing
                    const existingPosition = await driftService.getPosition(userId, signal.asset);
                    if (existingPosition) {
                        realizedPnL = parseFloat(existingPosition.unrealizedPnl) || 0;
                        logger.info(
                            `[STRATEGY_LOOP] Closing ${signal.asset} position with PnL: $${realizedPnL.toFixed(2)}`
                        );
                    }

                    // Close existing position
                    await driftService.closePosition(userId, {
                        marketSymbol: signal.asset,
                        percentage: 100,
                    });

                    // Record the realized PnL from closing (Phase 3: proper PnL tracking)
                    await this.riskManager.recordTrade(userId, signal.asset, realizedPnL, config);
                }

                // Open new position with slippage protection
                const result = await driftService.openPosition(userId, {
                    marketSymbol: signal.asset,
                    side: signal.direction.toLowerCase() as 'long' | 'short',
                    size: riskAssessment.suggestedSizeUsd,
                    leverage: riskAssessment.suggestedLeverage,
                    orderType: 'market',
                    slippageBps: config.maxSlippageBps, // Phase 3: slippage protection
                });

                // Record cooldown for new position (no PnL for opening)
                if (!wouldFlip) {
                    // Only record if we didn't already record during flip
                    await this.riskManager.recordTrade(userId, signal.asset, 0, config);
                }

                // Track position open time for maxHoldMinutes enforcement
                const state = this.userStates.get(userId);
                if (state) {
                    state.positionOpenTimes[signal.asset] = Date.now();
                    await this.stateStore.saveState(state);
                }

                logger.info(
                    `[STRATEGY_LOOP] ${signal.asset}: ${signal.direction} executed - ` +
                    `$${riskAssessment.suggestedSizeUsd.toFixed(2)} | tx: ${result.txSignature?.substring(0, 16)}...`
                );

                return {
                    success: true,
                    txSignature: result.txSignature,
                };
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.error(`[STRATEGY_LOOP] Execution failed for ${signal.asset}: ${errorMsg}`);

                return {
                    success: false,
                    error: errorMsg,
                };
            }
        });
    }

    /**
     * Close all positions for a user
     */
    private async closeAllPositions(userId: string): Promise<void> {
        const driftService = this.runtime.getService('DRIFT_SERVICE') as any;

        if (!driftService) {
            logger.warn('[STRATEGY_LOOP] Cannot close positions - DriftService not available');
            return;
        }

        try {
            await driftService.closeAllPositions(userId);
            logger.info(`[STRATEGY_LOOP] All positions closed for user ${userId.substring(0, 8)}...`);
        } catch (error) {
            logger.error(
                '[STRATEGY_LOOP] Failed to close all positions:',
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    /**
     * Stop the strategy loop
     */
    async stop(): Promise<void> {
        // Stop all position monitors
        const monitorCount = this.positionMonitors.size;
        for (const [_userId, monitor] of this.positionMonitors.entries()) {
            if (monitor.running) {
                monitor.stop();
            }
        }
        this.positionMonitors.clear();
        if (monitorCount > 0) {
            logger.info(`[STRATEGY_LOOP] Stopped ${monitorCount} position monitors.`);
        }

        // Stop the main loop
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        logger.info('[STRATEGY_LOOP] Stopped.');
    }

    /**
     * Set loop interval (for testing)
     */
    setLoopIntervalMs(intervalMs: number): void {
        this.loopIntervalMs = intervalMs;

        if (this.isRunning && this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = setInterval(async () => {
                await this.executeCycleForAllUsers();
            }, this.loopIntervalMs);
        }
    }
}
