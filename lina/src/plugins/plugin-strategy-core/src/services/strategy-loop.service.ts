import {
    Service,
    type IAgentRuntime,
    logger,
} from '@elizaos/core';
import { BehaviorSubject } from 'rxjs';

export class StrategyLoop extends Service {
    static serviceType = 'strategy-core';
    capabilityDescription = 'Core trading strategy engine (The Conductor) for market analysis and trade execution';

    private intervalId: NodeJS.Timeout | null = null;
    private isRunning = false;
    private readonly LOOP_INTERVAL_MS = 60 * 1000; // 1 minute loop

    // Observable state for market context (to be expanded)
    public marketContext$ = new BehaviorSubject<any>(null);

    async initialize(runtime: IAgentRuntime): Promise<void> {
        logger.info('[STRATEGY_LOOP] Initializing Strategy Core...');

        // Start the loop
        this.startLoop();

        logger.info('[STRATEGY_LOOP] Strategy Core initialized in OBSERVER mode.');
    }

    private startLoop() {
        if (this.isRunning) return;
        this.isRunning = true;

        logger.info(`[STRATEGY_LOOP] Starting analysis loop (${this.LOOP_INTERVAL_MS}ms interval)`);

        this.intervalId = setInterval(async () => {
            await this.executeCycle();
        }, this.LOOP_INTERVAL_MS);

        // Run first cycle immediately
        this.executeCycle();
    }

    private async executeCycle() {
        try {
            logger.info('[STRATEGY_LOOP] --- Starting Analysis Cycle ---');

            // 1. Macro Regime (Placeholder)
            const macroRegime = await this.analyzeMacroRegime();
            logger.info(`[STRATEGY_LOOP] Macro Regime: ${macroRegime}`);

            // 2. Asset Selection (Placeholder)
            logger.info('[STRATEGY_LOOP] Scanning assets...');

            // 3. Update Context
            this.marketContext$.next({
                timestamp: Date.now(),
                macro: macroRegime,
            });

            logger.info('[STRATEGY_LOOP] --- Cycle Complete ---');
        } catch (error) {
            logger.error('[STRATEGY_LOOP] Error in analysis cycle:', error instanceof Error ? error.message : String(error));
        }
    }

    private async analyzeMacroRegime(): Promise<string> {
        // TODO: Implement actual macro analysis (Fear & Greed, BTC trend, etc.)
        return 'NEUTRAL';
    }

    async stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        logger.info('[STRATEGY_LOOP] Stopped.');
    }
}
