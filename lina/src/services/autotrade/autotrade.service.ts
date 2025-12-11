// src/services/autotrade/autotrade.service.ts
import { logger } from '@elizaos/core';
import type { AutotradeRepository } from './repository';

export interface X402PaymentRequired {
  accepts: {
    scheme: 'solana';
    network: 'solana-mainnet' | 'solana-devnet';
    payTo: string;
    amount: string;
    memo: string;
    expiresAt: number;
  };
}

/**
 * Interface for Solana operations needed by AutotradeService.
 * This allows mocking in tests while using SolanaTransactionManager in production.
 */
export interface SolanaOperations {
  getTokenBalance(userId: string, mint: string): Promise<{ balance: bigint }>;
  transferToken(params: {
    userId: string;
    to: string;
    amount: string;
    mint: string;
  }): Promise<string>;
}

export interface AutotradeServiceConfig {
  repository: AutotradeRepository;
  solanaManager: SolanaOperations;
  treasuryWallet: string;
  priceUsdc: number;
  durationMs: number;
  network?: 'mainnet-beta' | 'devnet';
  /** USDC mint address - injected to avoid coupling to x402 plugin */
  usdcMint: string;
}

export interface CheckRenewResult {
  renewed: boolean;
  stopped: boolean;
  reason?: string;
}

export class AutotradeService {
  private repo: AutotradeRepository;
  private solanaManager: SolanaOperations;
  private treasuryWallet: string;
  private priceUsdc: number;
  private durationMs: number;
  private network: 'solana-mainnet' | 'solana-devnet';
  private usdcMint: string;

  constructor(config: AutotradeServiceConfig) {
    this.repo = config.repository;
    this.solanaManager = config.solanaManager;
    this.treasuryWallet = config.treasuryWallet;
    this.priceUsdc = config.priceUsdc;
    this.durationMs = config.durationMs;
    this.network = config.network === 'mainnet-beta' ? 'solana-mainnet' : 'solana-devnet';
    this.usdcMint = config.usdcMint;
  }

  async getPaymentRequired(userId: string): Promise<X402PaymentRequired> {
    const amountBaseUnits = Math.floor(this.priceUsdc * 1_000_000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    return {
      accepts: {
        scheme: 'solana',
        network: this.network,
        payTo: this.treasuryWallet,
        amount: amountBaseUnits,
        memo: `autotrade:${userId}:${Date.now()}`,
        expiresAt,
      },
    };
  }

  async activateSubscription(userId: string, txSignature: string): Promise<void> {
    const expiresAt = Date.now() + this.durationMs;

    await this.repo.createSubscription({
      userId,
      expiresAt,
      txSignature,
    });

    logger.info(`[AutotradeService] Activated subscription for ${userId.substring(0, 8)}... expires at ${new Date(expiresAt).toISOString()}`);
  }

  async getStatus(userId: string) {
    return this.repo.getSubscription(userId);
  }

  async isActive(userId: string): Promise<boolean> {
    const sub = await this.repo.getSubscription(userId);
    if (!sub) return false;
    if (sub.status !== 'active') return false;
    if (Date.now() > sub.expiresAt) return false;
    return true;
  }

  async stopAutotrade(userId: string): Promise<void> {
    const sub = await this.repo.getSubscription(userId);
    if (!sub || sub.status !== 'active') {
      throw new Error('No active subscription');
    }

    await this.repo.deactivateSubscription(userId);
    logger.info(`[AutotradeService] Stopped autotrade for ${userId.substring(0, 8)}...`);
  }

  async checkAndRenew(userId: string): Promise<CheckRenewResult> {
    const sub = await this.repo.getSubscription(userId);

    if (!sub || sub.status !== 'active') {
      return { renewed: false, stopped: false, reason: 'No active subscription' };
    }

    // Not expired yet
    if (Date.now() < sub.expiresAt) {
      return { renewed: false, stopped: false };
    }

    // Expired - try to renew
    logger.info(`[AutotradeService] Subscription expired for ${userId.substring(0, 8)}..., attempting renewal`);

    try {
      // Check USDC balance
      const priceBaseUnits = BigInt(Math.floor(this.priceUsdc * 1_000_000));
      const { balance } = await this.solanaManager.getTokenBalance(userId, this.usdcMint);

      if (balance < priceBaseUnits) {
        // Insufficient funds - stop autotrade
        await this.repo.deactivateSubscription(userId);
        logger.warn(`[AutotradeService] Insufficient USDC for renewal, stopping autotrade for ${userId.substring(0, 8)}...`);
        return { renewed: false, stopped: true, reason: 'Insufficient USDC balance' };
      }

      // Transfer payment to treasury
      const txSignature = await this.solanaManager.transferToken({
        userId,
        to: this.treasuryWallet,
        amount: priceBaseUnits.toString(),
        mint: this.usdcMint,
      });

      // Extend subscription
      const newExpiresAt = Date.now() + this.durationMs;
      await this.repo.extendSubscription(userId, newExpiresAt, txSignature);

      logger.info(`[AutotradeService] Renewed subscription for ${userId.substring(0, 8)}..., new expiry: ${new Date(newExpiresAt).toISOString()}`);
      return { renewed: true, stopped: false };

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[AutotradeService] Renewal failed for ${userId.substring(0, 8)}...: ${msg}`);

      // Deactivate on failure
      await this.repo.deactivateSubscription(userId);
      return { renewed: false, stopped: true, reason: msg };
    }
  }
}
