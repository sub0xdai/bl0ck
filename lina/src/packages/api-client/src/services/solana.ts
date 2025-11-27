import { BaseApiClient } from '../lib/base-client';
import type { SolanaWalletResponse } from '../types/solana';

export class SolanaService extends BaseApiClient {
  async getWallet(userId: string): Promise<SolanaWalletResponse> {
    return this.get<SolanaWalletResponse>(`/api/solana/wallet/${userId}`);
  }

  async syncWallet(userId: string): Promise<SolanaWalletResponse> {
    return this.post<SolanaWalletResponse>(`/api/solana/wallet/${userId}/sync`, {});
  }
}
