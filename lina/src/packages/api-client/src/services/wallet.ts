import { BaseApiClient } from '../lib/base-client';
import type { Token, TokensResponse } from './cdp';

// Re-export types for convenience
export type { Token, TokensResponse };

/**
 * Wallet address response
 */
export interface WalletAddressResponse {
  address: string;
  chain: string;
}

/**
 * Service for interacting with unified wallet endpoints
 * Routes to CDP or Solana based on chain parameter
 */
export class WalletService extends BaseApiClient {
  /**
   * Get token balances for a specific chain (or all chains if not specified)
   * Uses unified endpoint that routes to CDP (EVM) or Solana based on chain
   * @param chain Optional chain to fetch (e.g., 'base', 'ethereum', 'solana')
   */
  async getTokens(chain?: string): Promise<TokensResponse> {
    const params = chain ? `?chain=${encodeURIComponent(chain)}` : '';
    const response = await this.get<TokensResponse>(`/api/wallet/tokens${params}`);
    return response;
  }

  /**
   * Force sync token balances (bypasses cache)
   * @param chain Optional chain to sync
   */
  async syncTokens(chain?: string): Promise<TokensResponse> {
    const body = chain ? { chain } : {};
    const response = await this.post<TokensResponse>('/api/wallet/tokens/sync', body);
    return response;
  }

  /**
   * Get wallet address for a specific chain
   * @param chain Chain to get address for (required)
   */
  async getAddress(chain: string): Promise<WalletAddressResponse> {
    const params = `?chain=${encodeURIComponent(chain)}`;
    const response = await this.get<WalletAddressResponse>(`/api/wallet/address${params}`);
    return response;
  }
}
