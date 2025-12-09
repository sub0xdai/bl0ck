import { BaseApiClient } from '../lib/base-client';
import type { DriftPositionsResponse, DriftAccountResponse } from '../types/drift';

/**
 * Service for interacting with Drift Protocol endpoints
 * Fetches real-time position and account data from Drift via backend
 */
export class DriftService extends BaseApiClient {
  /**
   * Get all open positions for the authenticated user
   * Returns live data from Drift Protocol WebSocket subscriptions
   */
  async getPositions(): Promise<DriftPositionsResponse> {
    return this.get<DriftPositionsResponse>('/api/drift/positions');
  }

  /**
   * Get account information (collateral, margin, leverage)
   * Returns live data from Drift Protocol WebSocket subscriptions
   */
  async getAccountInfo(): Promise<DriftAccountResponse> {
    return this.get<DriftAccountResponse>('/api/drift/account');
  }
}
