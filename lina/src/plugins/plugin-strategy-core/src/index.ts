import type { Plugin } from '@elizaos/core';
import { StrategyLoop } from './services/strategy-loop.service';

export const strategyCorePlugin: Plugin = {
    name: 'strategy-core',
    description: 'Core trading strategy engine (The Conductor) with automated signal generation and risk management',
    services: [StrategyLoop],
    actions: [],
    evaluators: [],
    providers: [],
};

export default strategyCorePlugin;

// Services
export { StrategyLoop } from './services/strategy-loop.service';
export { SignalsService } from './services/signals.service';
export { RiskManager } from './services/risk-manager.service';
export { OpenBBService, createOpenBBService } from './services/openbb.service';

// State
export { AutomationStateStore, getAutomationStateStore } from './state/automation-state.store';

// Utils
export { CircuitBreaker, AsyncMutex } from './utils/circuit-breaker';
export { TradeCooldown } from './utils/trade-cooldown';

// Types
export * from './types';
