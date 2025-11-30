/**
 * Unified Balance Provider
 *
 * Phase 5: Aggregates wallet balances across Solana, EVM, and Hyperliquid
 * into a single portfolio view for the agent.
 *
 * Architecture:
 * - Fetches data in parallel from all 3 services using Promise.allSettled
 * - Gracefully handles service failures (partial data)
 * - Calculates portfolio totals: available, in positions, net worth, P&L
 * - Formats human-readable output with all wallet details
 *
 * SOLID Compliance:
 * - Single Responsibility: Portfolio aggregation only
 * - Open/Closed: Extensible via new data sources
 * - Liskov Substitution: Implements Provider interface
 * - Interface Segregation: Clean separation of concerns
 * - Dependency Inversion: Depends on service abstractions
 */

import type { IAgentRuntime, Memory, Provider, State } from '@elizaos/core';
import { getEntityUserId } from '../../../utils/entity';
import type { SolanaWalletBalances, SolanaTokenBalance } from '../../plugin-solana-core/src/types';
import type { Position, AccountInfo } from '../../plugin-hyperliquid/src/types';

// ============================================================
// TYPE DEFINITIONS (Zero `any` types)
// ============================================================

interface WalletToken {
  symbol: string;
  name: string;
  balance: string;
  balanceFormatted: string;
  usdValue: number;
  usdPrice: number;
  contractAddress: string | null;
  chain: string;
  decimals: number;
}

interface WalletInfo {
  address: string;
  tokens: WalletToken[];
  nfts: unknown[];
  totalUsdValue: number;
}

interface SolanaService {
  getTokenBalances(userId: string, forceSync: boolean): Promise<SolanaWalletBalances>;
}

interface CdpService {
  fetchWalletInfo(accountName: string, chain?: string): Promise<WalletInfo>;
}

interface HyperliquidService {
  getAccountInfo(userId: string): Promise<AccountInfo>;
  getPositions(userId: string): Promise<Position[]>;
  getAddress?(userId: string): Promise<string>;
}

interface SolanaData {
  address: string;
  sol: string;
  usdc: string;
  totalUsdValue: number;
  tokens: SolanaTokenBalance[];
}

interface EvmData {
  address: string;
  chains: Map<string, WalletToken[]>;
  totalUsdValue: number;
  tokens: WalletToken[];
}

interface HyperliquidData {
  address: string | null;
  availableMargin: number;
  equity: number;
  unrealizedPnl: number;
  totalPositionValue: number;
  positions: Position[];
}

interface PortfolioSummary {
  totalAvailable: number;
  inPositions: number;
  netWorth: number;
  unrealizedPnl: number;
}

interface UnifiedBalanceData {
  solana: SolanaData | null;
  evm: EvmData | null;
  hyperliquid: HyperliquidData | null;
  portfolio: PortfolioSummary;
}

interface UnifiedBalanceValues {
  netWorth: string;
  totalAvailable: string;
  inPositions: string;
  unrealizedPnl: string;
  positionCount: string;
}

// ============================================================
// HELPER FUNCTIONS (DRY principle)
// ============================================================

/**
 * Find token by symbol in array
 */
function findToken(tokens: SolanaTokenBalance[], symbol: string): SolanaTokenBalance | undefined {
  return tokens.find((t) => t.symbol === symbol);
}

/**
 * Group EVM tokens by chain
 */
function groupByChain(tokens: WalletToken[]): Map<string, WalletToken[]> {
  const chains = new Map<string, WalletToken[]>();

  for (const token of tokens) {
    const existing = chains.get(token.chain) || [];
    existing.push(token);
    chains.set(token.chain, existing);
  }

  return chains;
}

/**
 * Truncate address for display (7 chars)
 */
function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 7)}...`;
}

/**
 * Format USD value with 2 decimals
 */
function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * Format P&L with +/- sign
 * For negative values: -$10.00 (not $-10.00)
 */
function formatPnl(value: number): string {
  if (value >= 0) {
    return `+${formatUsd(value)}`;
  } else {
    return `-${formatUsd(Math.abs(value))}`;
  }
}

// ============================================================
// DATA FETCHING FUNCTIONS
// ============================================================

/**
 * Fetch Solana balance data
 * Returns null if service unavailable or error
 */
async function fetchSolanaBalance(
  runtime: IAgentRuntime,
  userId: string
): Promise<SolanaData | null> {
  const solanaService = runtime.getService('SOLANA_SERVICE') as SolanaService | null;
  if (!solanaService) return null;

  try {
    const data = await solanaService.getTokenBalances(userId, false);

    return {
      address: data.address,
      sol: findToken(data.tokens, 'SOL')?.balanceFormatted || '0',
      usdc: findToken(data.tokens, 'USDC')?.balanceFormatted || '0',
      totalUsdValue: data.totalUsdValue,
      tokens: data.tokens,
    };
  } catch (error) {
    console.error('[UNIFIED_BALANCE] Solana fetch failed:', error);
    return null;
  }
}

/**
 * Fetch EVM balance data (all chains)
 * Returns null if service unavailable or error
 */
async function fetchEvmBalance(runtime: IAgentRuntime, userId: string): Promise<EvmData | null> {
  const cdpService = runtime.getService('CDP_SERVICE') as CdpService | null;
  if (!cdpService) return null;

  try {
    const data = await cdpService.fetchWalletInfo(userId, undefined);

    return {
      address: data.address,
      chains: groupByChain(data.tokens),
      totalUsdValue: data.totalUsdValue,
      tokens: data.tokens,
    };
  } catch (error) {
    console.error('[UNIFIED_BALANCE] EVM fetch failed:', error);
    return null;
  }
}

/**
 * Fetch Hyperliquid account and position data
 * Returns null if service unavailable or error
 */
async function fetchHyperliquidData(
  runtime: IAgentRuntime,
  userId: string
): Promise<HyperliquidData | null> {
  const hlService = runtime.getService('HYPERLIQUID_SERVICE') as HyperliquidService | null;
  if (!hlService) return null;

  try {
    const [accountInfo, positions] = await Promise.all([
      hlService.getAccountInfo(userId),
      hlService.getPositions(userId),
    ]);

    const address = hlService.getAddress ? await hlService.getAddress(userId) : null;

    return {
      address,
      availableMargin: accountInfo.availableBalance,
      equity: accountInfo.equity,
      unrealizedPnl: accountInfo.unrealizedPnl,
      totalPositionValue: accountInfo.totalPositionValue,
      positions,
    };
  } catch (error) {
    console.error('[UNIFIED_BALANCE] Hyperliquid fetch failed:', error);
    return null;
  }
}

// ============================================================
// PORTFOLIO CALCULATION
// ============================================================

/**
 * Calculate portfolio summary from all data sources
 * Implements accurate net worth and P&L calculations
 */
function calculatePortfolio(
  solana: SolanaData | null,
  evm: EvmData | null,
  hl: HyperliquidData | null
): PortfolioSummary {
  const solanaValue = solana?.totalUsdValue || 0;
  const evmValue = evm?.totalUsdValue || 0;
  const hlEquity = hl?.equity || 0;
  const hlAvailable = hl?.availableMargin || 0;
  const hlPnl = hl?.unrealizedPnl || 0;

  // Use totalPositionValue from account info (accurate from Hyperliquid API)
  const inPositions = hl?.totalPositionValue || 0;

  // Total available across all chains (liquid assets)
  const totalAvailable = solanaValue + evmValue + hlAvailable;

  // Net worth = all assets + equity in positions
  const netWorth = solanaValue + evmValue + hlEquity;

  return {
    totalAvailable,
    inPositions,
    netWorth,
    unrealizedPnl: hlPnl,
  };
}

// ============================================================
// TEXT FORMATTING
// ============================================================

/**
 * Format complete portfolio text output
 * Human-readable with proper spacing and formatting
 */
function formatText(
  solana: SolanaData | null,
  evm: EvmData | null,
  hl: HyperliquidData | null,
  portfolio: PortfolioSummary
): string {
  const sections: string[] = ['USER_WALLET_STATE:\n'];

  // Solana section
  if (solana) {
    sections.push(`**Solana Wallet** (${truncateAddress(solana.address)})`);
    const solTokens = solana.tokens
      .filter((t) => t.usdValue > 0.01) // Skip dust
      .map((t) => `• ${t.symbol}: ${t.balanceFormatted} (${formatUsd(t.usdValue)})`)
      .join('\n');
    sections.push(solTokens || '• No tokens');
    sections.push('');
  }

  // EVM section
  if (evm) {
    sections.push(`**EVM Wallet** (${truncateAddress(evm.address)})`);

    for (const [chain, tokens] of evm.chains.entries()) {
      const tokenList = tokens
        .filter((t) => t.usdValue > 0.01) // Skip dust
        .map((t) => `${t.balanceFormatted} ${t.symbol}`)
        .join(', ');

      if (tokenList) {
        sections.push(`• ${chain.charAt(0).toUpperCase() + chain.slice(1)}: ${tokenList}`);
      }
    }

    if (evm.chains.size === 0) {
      sections.push('• No tokens');
    }

    sections.push('');
  }

  // Hyperliquid section
  if (hl) {
    sections.push(`**Hyperliquid** ${hl.address ? `(${truncateAddress(hl.address)})` : ''}`);
    sections.push(`• Available Margin: ${formatUsd(hl.availableMargin)}`);

    if (hl.positions.length > 0) {
      sections.push(`• Positions (${hl.positions.length} open):`);
      for (const pos of hl.positions) {
        const side = pos.side === 'long' ? 'Long' : 'Short';
        sections.push(`  └ ${pos.symbol} ${pos.leverage}x ${side}: ${formatPnl(pos.unrealizedPnl)} P&L`);
      }
      sections.push(`• Unrealized P&L: ${formatPnl(hl.unrealizedPnl)}`);
    } else {
      sections.push('• No open positions');
    }

    sections.push('');
  }

  // Portfolio summary
  sections.push('**Portfolio Summary**');
  sections.push(`• Total Available: ${formatUsd(portfolio.totalAvailable)}`);
  sections.push(`• In Positions: ${formatUsd(portfolio.inPositions)}`);
  sections.push(`• Net Worth: ${formatUsd(portfolio.netWorth)}`);

  // Add error message if all services failed
  if (!solana && !evm && !hl) {
    return 'Unable to fetch wallet information. All services unavailable.';
  }

  return sections.join('\n');
}

/**
 * Extract template values for agent use
 */
function extractValues(portfolio: PortfolioSummary, positionCount: number): UnifiedBalanceValues {
  return {
    netWorth: portfolio.netWorth.toFixed(2),
    totalAvailable: portfolio.totalAvailable.toFixed(2),
    inPositions: portfolio.inPositions.toFixed(2),
    unrealizedPnl: portfolio.unrealizedPnl.toFixed(2),
    positionCount: positionCount.toString(),
  };
}

// ============================================================
// PROVIDER IMPLEMENTATION
// ============================================================

export const unifiedBalanceProvider: Provider = {
  name: 'UNIFIED_WALLET_STATE',
  description: 'Complete portfolio across Solana, EVM chains, and Hyperliquid',
  dynamic: true, // Always fetch fresh data

  get: async (runtime: IAgentRuntime, message: Memory, _state?: State) => {
    const userId = await getEntityUserId(runtime, message);

    // Fetch all sources in parallel with graceful error handling
    const [solanaResult, evmResult, hlResult] = await Promise.allSettled([
      fetchSolanaBalance(runtime, userId),
      fetchEvmBalance(runtime, userId),
      fetchHyperliquidData(runtime, userId),
    ]);

    // Extract successful results (null if failed)
    const solana = solanaResult.status === 'fulfilled' ? solanaResult.value : null;
    const evm = evmResult.status === 'fulfilled' ? evmResult.value : null;
    const hl = hlResult.status === 'fulfilled' ? hlResult.value : null;

    // Calculate portfolio totals
    const portfolio = calculatePortfolio(solana, evm, hl);
    const positionCount = hl?.positions.length || 0;

    const data: UnifiedBalanceData = {
      solana,
      evm,
      hyperliquid: hl,
      portfolio,
    };

    return {
      text: formatText(solana, evm, hl, portfolio),
      data,
      values: extractValues(portfolio, positionCount),
    };
  },
};

export default unifiedBalanceProvider;
