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
  channelId?: string; // Chat channel for trading updates
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
 * Response from POST /api/automation/toggle and /api/automation/config
 */
export interface AutomationUpdateResponse {
  automation: AutomationState | null;
  message: string;
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

  /**
   * Toggle automation on/off for the authenticated user
   * @param enabled - Whether to enable or disable automation
   * @param channelId - Optional chat channel ID for trading updates (stored when enabling)
   */
  async toggle(enabled: boolean, channelId?: string): Promise<AutomationUpdateResponse> {
    return this.post<AutomationUpdateResponse>('/api/automation/toggle', { enabled, channelId });
  }

  /**
   * Update automation configuration for the authenticated user
   */
  async updateConfig(config: Partial<AutomationConfig>): Promise<AutomationUpdateResponse> {
    return this.post<AutomationUpdateResponse>('/api/automation/config', config);
  }

  /**
   * Update the channelId for chat trading updates
   * Used when modal opens with existing automation but different/missing channelId
   */
  async updateChannel(channelId: string): Promise<{ message: string; channelId: string }> {
    return this.put<{ message: string; channelId: string }>('/api/automation/channel', { channelId });
  }
}
