/**
 * BridgeService - Auto-Bridge for Hyperliquid Margin
 *
 * Automatically bridges USDC from EVM chains to Hyperliquid when margin is insufficient.
 * Chain priority: Arbitrum (native) → Base → Ethereum → Polygon
 *
 * Phase 4 of Hyperliquid CDP integration
 */

import { logger } from '@elizaos/core';
import { CdpTransactionManager } from '@/managers/cdp-transaction-manager';
import { RelayService } from '../../../plugin-relay/src/services/relay.service';
import { HyperliquidCdpClient } from './hyperliquid-cdp-client';
import type { BridgeResult, MarginCheck } from '../types';

// USDC contract addresses by chain
const USDC_ADDRESSES = {
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  solana: 'EPjFWaJy47gIdZiGEPVP9Kjm53fcTqkERbzvqYT5d6tp',
} as const;

const USDC_DECIMALS = 6;

// Chain priority for bridging (Arbitrum is Hyperliquid's native chain)
const CHAIN_PRIORITY = ['arbitrum', 'base', 'ethereum', 'polygon'] as const;

export class BridgeService {
  private cdpManager: CdpTransactionManager;
  private relayService: RelayService;
  private clients: Map<string, HyperliquidCdpClient> = new Map();
  private testnet: boolean;

  constructor(testnet: boolean = false) {
    this.testnet = testnet;
    this.cdpManager = CdpTransactionManager.getInstance();
    this.relayService = new RelayService({
      getSetting: (key: string) => {
        if (key === 'RELAY_ENABLE_TESTNET') return testnet ? 'true' : 'false';
        return process.env[key];
      },
    } as any);
  }

  /**
   * Ensure sufficient margin on Hyperliquid for opening a position
   * Automatically bridges USDC if needed
   *
   * @param userId - User identifier
   * @param required - Required margin in USD
   * @returns BridgeResult with success status and bridging details
   */
  async ensureMargin(userId: string, required: number): Promise<BridgeResult> {
    // Handle edge cases
    if (required <= 0) {
      return { success: true, bridged: false, amount: 0 };
    }

    logger.info(
      `[BridgeService] Checking margin for user ${userId.substring(0, 8)}... (required: $${required})`
    );

    // 1. Check current Hyperliquid balance
    const hlBalance = await this.getHyperliquidUsdcBalance(userId);
    logger.info(`[BridgeService] Hyperliquid balance: $${hlBalance}`);

    if (hlBalance >= required) {
      logger.info(`[BridgeService] Sufficient margin on Hyperliquid, no bridge needed`);
      return { success: true, bridged: false, amount: 0 };
    }

    const deficit = required - hlBalance;
    logger.info(`[BridgeService] Margin deficit: $${deficit}`);

    // 2. Try bridging from EVM chains in priority order
    for (const chain of CHAIN_PRIORITY) {
      try {
        const balance = await this.getEvmUsdcBalance(userId, chain);
        logger.info(`[BridgeService] ${chain} USDC balance: $${balance}`);

        if (balance >= deficit) {
          logger.info(`[BridgeService] Bridging $${deficit} from ${chain} to Hyperliquid`);
          return await this.bridgeFromEvm(userId, deficit, chain);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`[BridgeService] Failed to check/bridge from ${chain}: ${errorMessage}`);
        // Continue to next chain
      }
    }

    // TODO: Try Solana as last resort (Phase 4.5)
    const solBalance = await this.getSolanaUsdcBalance(userId);
    if (solBalance >= deficit) {
      logger.info(`[BridgeService] Solana has sufficient USDC but bridging not implemented yet`);
    }

    // No chain has sufficient funds
    const errorMsg = `Insufficient USDC. Need $${deficit}, available across all chains: Arbitrum, Base, Ethereum, Polygon`;
    logger.error(`[BridgeService] ${errorMsg}`);

    return {
      success: false,
      bridged: false,
      amount: 0,
      error: errorMsg,
    };
  }

  /**
   * Get margin status across all available sources
   * Useful for diagnostics and user feedback
   */
  async getMarginStatus(userId: string, required: number): Promise<MarginCheck> {
    const hlBalance = await this.getHyperliquidUsdcBalance(userId);
    const deficit = Math.max(0, required - hlBalance);

    // Check all EVM chains
    const evmBalances: { chain: string; amount: number }[] = [];
    for (const chain of CHAIN_PRIORITY) {
      try {
        const balance = await this.getEvmUsdcBalance(userId, chain);
        evmBalances.push({ chain, amount: balance });
      } catch (error) {
        logger.warn(`[BridgeService] Failed to get ${chain} balance: ${error}`);
        evmBalances.push({ chain, amount: 0 });
      }
    }

    // Solana (not implemented yet)
    const solanaBalance = await this.getSolanaUsdcBalance(userId);

    return {
      hyperliquidBalance: hlBalance,
      required,
      deficit,
      evmBalances,
      solanaBalance,
    };
  }

  // ============================================================
  // PRIVATE: Balance Checking
  // ============================================================

  /**
   * Get USDC balance on Hyperliquid
   */
  private async getHyperliquidUsdcBalance(userId: string): Promise<number> {
    try {
      const client = await this.getClientForUser(userId);
      const state = await client.getAccountState();
      return parseFloat(state.marginSummary.accountValue);
    } catch (error) {
      logger.error(`[BridgeService] Failed to get Hyperliquid balance: ${error}`);
      throw error;
    }
  }

  /**
   * Get USDC balance on an EVM chain
   */
  private async getEvmUsdcBalance(userId: string, chain: string): Promise<number> {
    try {
      const result = await this.cdpManager.getTokenBalances(userId, chain, false);

      // Find USDC token in result
      const usdcToken = result.tokens.find(
        (t) =>
          t.symbol.toUpperCase() === 'USDC' ||
          t.contractAddress?.toLowerCase() ===
            USDC_ADDRESSES[chain as keyof typeof USDC_ADDRESSES]?.toLowerCase()
      );

      if (!usdcToken) {
        logger.debug(`[BridgeService] No USDC found on ${chain} for user ${userId}`);
        return 0;
      }

      return usdcToken.usdValue || 0;
    } catch (error) {
      logger.warn(`[BridgeService] Failed to get ${chain} USDC balance: ${error}`);
      return 0;
    }
  }

  /**
   * Get USDC balance on Solana (placeholder for Phase 4.5)
   */
  private async getSolanaUsdcBalance(userId: string): Promise<number> {
    // TODO: Implement Solana USDC balance check
    logger.debug(`[BridgeService] Solana balance check not implemented yet`);
    return 0;
  }

  // ============================================================
  // PRIVATE: Bridging
  // ============================================================

  /**
   * Bridge USDC from an EVM chain to Hyperliquid (via Arbitrum)
   */
  private async bridgeFromEvm(
    userId: string,
    amount: number,
    sourceChain: string
  ): Promise<BridgeResult> {
    try {
      logger.info(`[BridgeService] Bridging $${amount} USDC from ${sourceChain} to Arbitrum`);

      // Get Hyperliquid address (recipient)
      const client = await this.getClientForUser(userId);
      const hlAddress = client.getAddress();

      // Get CDP wallet for user
      const { address: userAddress, walletClient } =
        await this.cdpManager.getViemClientsForAccount({
          accountName: userId,
          network: sourceChain,
        });

      // Convert amount to USDC decimals (6)
      const amountInSmallestUnit = BigInt(Math.floor(amount * 10 ** USDC_DECIMALS));

      // Get quote from Relay
      const quote = await this.relayService.getQuote({
        user: userAddress,
        chainId: this.getChainId(sourceChain),
        toChainId: this.getChainId('arbitrum'), // Hyperliquid uses Arbitrum
        currency: USDC_ADDRESSES[sourceChain as keyof typeof USDC_ADDRESSES],
        amount: amountInSmallestUnit.toString(),
        recipient: hlAddress as `0x${string}`,
        tradeType: 'EXACT_INPUT',
      });

      logger.info(`[BridgeService] Got quote from Relay, executing bridge...`);

      // Execute bridge
      const txHash = await this.relayService.executeBridge(
        {
          user: userAddress,
          originChainId: this.getChainId(sourceChain),
          destinationChainId: this.getChainId('arbitrum'),
          currency: USDC_ADDRESSES[sourceChain as keyof typeof USDC_ADDRESSES],
          amount: amountInSmallestUnit.toString(),
          recipient: hlAddress,
          useExactInput: true,
        },
        { walletClient }
      );

      logger.info(`[BridgeService] Bridge successful! TxHash: ${txHash}`);

      // TODO: Poll for funds arrival on Hyperliquid (Phase 4.5)

      return {
        success: true,
        bridged: true,
        amount,
        source: sourceChain as any,
        txHash,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[BridgeService] Bridge from ${sourceChain} failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Bridge USDC from Solana to Hyperliquid (placeholder for Phase 4.5)
   */
  private async bridgeFromSolana(userId: string, amount: number): Promise<BridgeResult> {
    // TODO: Implement Hyperliquid's native Solana USDC bridge
    logger.warn(`[BridgeService] Solana bridge not implemented yet`);
    throw new Error('Solana bridge not implemented');
  }

  // ============================================================
  // PRIVATE: Utilities
  // ============================================================

  /**
   * Get or create Hyperliquid CDP client for user
   */
  private async getClientForUser(userId: string): Promise<HyperliquidCdpClient> {
    if (!this.clients.has(userId)) {
      const client = new HyperliquidCdpClient(userId, this.testnet);
      await client.connect();
      this.clients.set(userId, client);
      logger.info(`[BridgeService] Created Hyperliquid client for user ${userId}`);
    }
    return this.clients.get(userId)!;
  }

  /**
   * Map chain name to chain ID
   */
  private getChainId(chain: string): number {
    const chainIds: Record<string, number> = {
      ethereum: 1,
      arbitrum: 42161,
      base: 8453,
      polygon: 137,
      optimism: 10,
    };

    const chainId = chainIds[chain.toLowerCase()];
    if (!chainId) {
      throw new Error(`Unknown chain: ${chain}`);
    }

    return chainId;
  }
}
