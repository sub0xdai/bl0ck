/**
 * Hyperliquid Plugin Formatters
 *
 * Shared formatting utilities for action responses.
 */

import type { Position, AccountInfo, Market, CloseResult, PositionResult, PositionSide } from '../types';

/**
 * Format large numbers for display (K, M, B)
 */
export function formatVolume(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }
  return value.toFixed(2);
}

/**
 * Format USD value with proper formatting
 */
export function formatUsd(value: number, decimals = 2): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/**
 * Format PnL with sign prefix
 */
export function formatPnl(value: number): string {
  const prefix = value >= 0 ? '+' : '';
  return `${prefix}${formatUsd(value)}`;
}

/**
 * Format account info for display
 */
export function formatAccountInfo(info: AccountInfo): string {
  let text = `**Hyperliquid Account**\n\n`;
  text += `**Equity:** ${formatUsd(info.equity)}\n`;
  text += `**Available Balance:** ${formatUsd(info.availableBalance)}\n`;
  text += `**Margin Used:** ${formatUsd(info.marginUsed)}\n`;
  text += `**Position Value:** ${formatUsd(info.totalPositionValue)}\n\n`;
  text += `**Unrealized PnL:** ${formatPnl(info.unrealizedPnl)}\n`;
  text += `**Realized PnL:** ${formatPnl(info.realizedPnl)}\n\n`;
  text += `**Leverage:** ${info.leverage}x\n`;
  text += `**Margin Ratio:** ${(info.marginRatio * 100).toFixed(2)}%`;

  return text;
}

/**
 * Format positions list for display
 */
export function formatPositions(positions: Position[]): string {
  if (positions.length === 0) {
    return '**No open positions**\n\nYou have no open perpetual positions on Hyperliquid.';
  }

  let text = `**Open Positions (${positions.length})**\n\n`;

  for (const pos of positions) {
    const sideEmoji = pos.side === 'long' ? '🟢' : '🔴';

    text += `${sideEmoji} **${pos.symbol}** ${pos.side.toUpperCase()} ${pos.leverage}x\n`;
    text += `**Size:** ${pos.size.toFixed(4)}\n`;
    text += `**Entry:** ${formatUsd(pos.entryPrice)}\n`;
    text += `**Mark:** ${formatUsd(pos.markPrice)}\n`;
    text += `**Unrealized PnL:** ${formatPnl(pos.unrealizedPnl)}\n`;

    if (pos.liquidationPrice !== null) {
      text += `**Liquidation:** ${formatUsd(pos.liquidationPrice)}\n`;
    }

    text += `**Margin Used:** ${formatUsd(pos.marginUsed)}\n`;
    text += '\n';
  }

  return text.trim();
}

/**
 * Format markets list for display
 */
export function formatMarkets(markets: Market[], displayCount: number): string {
  if (markets.length === 0) {
    return '**No markets available**';
  }

  let text = `**Hyperliquid Perpetual Markets (${markets.length})**\n\n`;

  // Sort by 24h volume descending
  const sorted = [...markets].sort((a, b) => b.volume24h - a.volume24h);
  const count = Math.min(sorted.length, displayCount);

  for (let i = 0; i < count; i++) {
    const market = sorted[i];
    const fundingRatePercent = (market.fundingRate * 100).toFixed(4);
    const fundingPrefix = market.fundingRate >= 0 ? '+' : '';

    text += `**${market.symbol}**\n`;
    text += `Price: ${formatUsd(market.markPrice)}\n`;
    text += `24h Vol: $${formatVolume(market.volume24h)}\n`;
    text += `Funding: ${fundingPrefix}${fundingRatePercent}%\n`;
    text += `OI: $${formatVolume(market.openInterest)}\n`;
    text += `Max Leverage: ${market.maxLeverage}x\n\n`;
  }

  if (sorted.length > count) {
    text += `_...and ${sorted.length - count} more markets_`;
  }

  return text.trim();
}

/**
 * Format close result for display
 */
export function formatCloseResult(result: CloseResult, symbol: string, percentage: number): string {
  let text = `**Position Closed**\n\n`;
  text += `**Symbol:** ${symbol}\n`;
  text += `**Closed:** ${percentage}%\n`;
  text += `**Size Closed:** ${result.closedSize.toFixed(4)}\n`;
  text += `**Realized PnL:** ${formatPnl(result.realizedPnl)}\n\n`;

  if (result.orderId) {
    text += `Order ID: \`${result.orderId}\``;
  }

  return text;
}

/**
 * Format position result for display (opening position)
 */
export function formatPositionResult(
  result: PositionResult,
  symbol: string,
  side: PositionSide,
  leverage: number,
  isHighRisk: boolean
): string {
  let text = '';
  const sideLabel = side.toUpperCase();

  // High risk warning for >5x leverage
  if (isHighRisk) {
    text += `**High Leverage Position (${leverage}x)**\n\n`;
  } else {
    text += `**${sideLabel} Position Opened**\n\n`;
  }

  text += `**Symbol:** ${symbol}\n`;

  if (result.position) {
    const pos = result.position;
    text += `**Side:** ${sideLabel}\n`;
    text += `**Size:** ${pos.size.toFixed(4)}\n`;
    text += `**Entry Price:** ${formatUsd(pos.entryPrice)}\n`;
    text += `**Leverage:** ${pos.leverage}x\n`;
    text += `**Margin Used:** ${formatUsd(pos.marginUsed)}\n`;

    if (pos.liquidationPrice !== null) {
      // Calculate distance to liquidation based on side
      const liqDistance = side === 'long'
        ? ((pos.entryPrice - pos.liquidationPrice) / pos.entryPrice * 100)
        : ((pos.liquidationPrice - pos.entryPrice) / pos.entryPrice * 100);
      text += `**Liquidation Price:** ${formatUsd(pos.liquidationPrice)} (${liqDistance.toFixed(1)}% away)\n`;
    }
  }

  text += '\n';

  if (result.orderId) {
    text += `Order ID: \`${result.orderId}\``;
  }

  return text;
}
