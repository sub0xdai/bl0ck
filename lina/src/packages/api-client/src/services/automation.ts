import { BaseApiClient } from '../lib/base-client';

/**
 * Automation configuration as stored in strategy-core
 */
export interface AutomationConfig {
  enabled: boolean;
  intervalMinutes: number;
  maxPositionPct: number;
  maxExposurePct: number;
  maxLeverage: number;
  assets: string[];
  allowShorts: boolean;
  circuitBreakerPct: number;
  cooldownMinutes: number;
  maxSlippageBps: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  maxHoldMinutes?: number;
}

/**
 * Automation state returned by the API
 */
export interface AutomationState {
  userId: string;
  config: AutomationConfig;
  circuitBreakerTripped: boolean;
  circuitBreakerTrippedAt?: number;
  sessionPnL: number;
  cycleCount: number;
  errors: string[];
  startedAt: number;
  lastCycleAt?: number;
}

/**
 * Position info for display
 */
export interface AutomationPosition {
  marketSymbol: string;
  side: 'long' | 'short';
  notionalValue: string;
  unrealizedPnl: string;
  entryPrice: string;
  markPrice: string;
}

/**
 * Response from GET /api/automation/status
 */
export interface AutomationStatusResponse {
  automation: AutomationState | null;
  positions: AutomationPosition[];
  hasAccount: boolean;
  storeAvailable: boolean;
}

/**
 * Service for interacting with Automation endpoints
 * Fetches strategy-core automation status and configuration
 */
export class AutomationService extends BaseApiClient {
  /**
   * Get automation status for the authenticated user
   * Returns current config, state, and positions
   */
  async getStatus(): Promise<AutomationStatusResponse> {
    return this.get<AutomationStatusResponse>('/api/automation/status');
  }
}
