import type { Plugin } from '@elizaos/core';
import { StrategyLoop } from './services/strategy-loop.service';
import { strategyStatus, strategyToggle, strategyUpdate, strategyClose } from './actions';

export const strategyCorePlugin: Plugin = {
    name: 'strategy-core',
    description: 'Core trading strategy engine (The Conductor) with automated signal generation and risk management',
    services: [StrategyLoop],
    actions: [strategyStatus, strategyToggle, strategyUpdate, strategyClose],
    evaluators: [],
    providers: [],
};

export default strategyCorePlugin;

// Services
export { StrategyLoop } from './services/strategy-loop.service';
export { SignalsService } from './services/signals.service';
export { RiskManager } from './services/risk-manager.service';
export { OpenBBService, createOpenBBService } from './services/openbb.service';
export { PositionMonitor, calculateActualPnlPct } from './services/position-monitor.service';
export type { MonitoredPosition, ExitTrigger, PositionMonitorConfig } from './services/position-monitor.service';

// Actions (Phase 4)
export { strategyStatus, strategyToggle, strategyUpdate, strategyClose } from './actions';

// State
export { AutomationStateStore, getAutomationStateStore } from './state/automation-state.store';

// Utils
export { CircuitBreaker, AsyncMutex } from './utils/circuit-breaker';
export { TradeCooldown } from './utils/trade-cooldown';
export { ExecutionCoordinator, getExecutionCoordinator } from './utils/execution-coordinator';
export type { OperationType, LockStatus } from './utils/execution-coordinator';

// Types
export * from './types';
