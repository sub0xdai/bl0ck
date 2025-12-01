/**
 * Drift Response Formatters
 *
 * Utility functions for formatting Drift API responses into user-friendly messages.
 */

import type { PositionResult, CloseResult, DriftPosition, DriftMarket, DriftAccountInfo, PositionSide } from '../types';
import { SERVICE_CONFIG } from '../constants';

/**
 * Format a position result for display
 */
export function formatPositionResult(
  result: PositionResult,
  symbol: string,
  side: PositionSide,
  leverage: number,
  isHighRisk: boolean
): string {
  if (!result.success) {
    return `Failed to open ${side} position: ${result.error || result.message}`;
  }

  const pos = result.position;
  const parts: string[] = [];

  // Opening message
  parts.push(`Opened ${leverage}x ${side} on ${symbol}`);

  // Position details
  if (pos) {
    const entryPrice = parseFloat(pos.entryPrice) / 1e6; // Adjust for QUOTE_PRECISION
    parts.push(`@ $${entryPrice.toFixed(2)}`);

    const notionalValue = parseFloat(pos.notionalValue) / 1e6;
    parts.push(`Size: $${notionalValue.toFixed(2)}`);

    if (pos.liquidationPrice && pos.liquidationPrice !== '0') {
      const liqPrice = parseFloat(pos.liquidationPrice) / 1e6;
      parts.push(`Liq: $${liqPrice.toFixed(2)}`);
    }
  }

  // Transaction signature
  if (result.txSignature) {
    parts.push(`Tx: ${result.txSignature}`);
  }

  // High risk warning
  if (isHighRisk) {
    parts.push(`\n\u26A0\uFE0F High leverage (${leverage}x) - elevated liquidation risk`);
  }

  return parts.join('. ').replace(/\. \n/g, '\n');
}

/**
 * Format a close result for display
 */
export function formatCloseResult(
  result: CloseResult,
  symbol: string,
  percentage: number
): string {
  if (!result.success) {
    return `Failed to close position: ${result.error || result.message}`;
  }

  const parts: string[] = [];

  // Closing message
  if (percentage === 100) {
    parts.push(`Closed ${symbol} position`);
  } else {
    parts.push(`Closed ${percentage}% of ${symbol} position`);
  }

  // PnL if available
  if (result.realizedPnl && result.realizedPnl !== '0') {
    const pnl = parseFloat(result.realizedPnl) / 1e6;
    const sign = pnl >= 0 ? '+' : '';
    parts.push(`PnL: ${sign}$${pnl.toFixed(2)}`);
  }

  // Transaction signature
  if (result.txSignature) {
    parts.push(`Tx: ${result.txSignature}`);
  }

  return parts.join('. ');
}

/**
 * Format a position for display
 */
export function formatPosition(position: DriftPosition): string {
  const size = parseFloat(position.size);
  const entryPrice = parseFloat(position.entryPrice) / 1e6;
  const markPrice = parseFloat(position.markPrice) / 1e6;
  const pnl = parseFloat(position.unrealizedPnl) / 1e6;
  const pnlSign = pnl >= 0 ? '+' : '';

  return [
    `**${position.symbol}** (${position.side.toUpperCase()})`,
    `Entry: $${entryPrice.toFixed(2)} | Mark: $${markPrice.toFixed(2)}`,
    `Size: ${size.toFixed(4)} | Leverage: ${position.leverage.toFixed(1)}x`,
    `PnL: ${pnlSign}$${pnl.toFixed(2)}`,
  ].join('\n');
}

/**
 * Format positions list for display
 */
export function formatPositionsList(positions: DriftPosition[]): string {
  if (positions.length === 0) {
    return 'No open positions on Drift.';
  }

  const formatted = positions.map((pos, i) => `${i + 1}. ${formatPosition(pos)}`);
  return `**Drift Positions (${positions.length})**\n\n${formatted.join('\n\n')}`;
}

/**
 * Format a market for display
 */
export function formatMarket(market: DriftMarket): string {
  const price = parseFloat(market.price) / 1e6;
  const fundingRate = parseFloat(market.fundingRate) * 100;
  const fundingSign = fundingRate >= 0 ? '+' : '';

  return `${market.symbol}: $${price.toFixed(2)} (${fundingSign}${fundingRate.toFixed(4)}% funding)`;
}

/**
 * Format markets list for display
 */
export function formatMarketsList(markets: DriftMarket[], limit: number = SERVICE_CONFIG.MARKETS_DISPLAY_COUNT): string {
  if (markets.length === 0) {
    return 'No markets available.';
  }

  const sorted = markets.sort((a, b) => {
    // Sort by volume descending
    return parseFloat(b.volume24h) - parseFloat(a.volume24h);
  });

  const limited = sorted.slice(0, limit);
  const formatted = limited.map((m) => `\u2022 ${formatMarket(m)}`);

  return `**Drift Markets (Top ${limited.length})**\n\n${formatted.join('\n')}`;
}

/**
 * Format account info for display
 */
export function formatAccountInfo(account: DriftAccountInfo): string {
  const equity = parseFloat(account.equity) / 1e6;
  const available = parseFloat(account.availableBalance) / 1e6;
  const marginUsed = parseFloat(account.marginUsed) / 1e6;
  const pnl = parseFloat(account.unrealizedPnl) / 1e6;
  const pnlSign = pnl >= 0 ? '+' : '';

  return [
    '**Drift Account Summary**',
    `Equity: $${equity.toFixed(2)}`,
    `Available: $${available.toFixed(2)}`,
    `Margin Used: $${marginUsed.toFixed(2)}`,
    `Unrealized PnL: ${pnlSign}$${pnl.toFixed(2)}`,
    `Account Leverage: ${account.leverage.toFixed(2)}x`,
  ].join('\n');
}
