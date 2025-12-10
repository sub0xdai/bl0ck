/**
 * Drift Plugin Formatters
 *
 * Shared formatting utilities for action responses.
 */

import type { DriftPosition, DriftAccountInfo, DriftMarket, PositionResult, PositionSide } from '../types';

/**
 * Format large numbers for display (K, M, B)
 */
export function formatVolume(value: string): string {
  const num = parseFloat(value);
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`;
  }
  return num.toFixed(2);
}

/**
 * Format USD value with proper formatting
 */
export function formatUsd(value: string | number, decimals = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  const absNum = Math.abs(num);
  const formatted = absNum.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return num < 0 ? `-$${formatted}` : `$${formatted}`;
}

/**
 * Format PnL with sign prefix
 */
export function formatPnl(value: string): string {
  const num = parseFloat(value);
  const prefix = num >= 0 ? '+' : '';
  return `${prefix}${formatUsd(num)}`;
}

/**
 * Format account info for display
 */
export function formatAccountInfo(info: DriftAccountInfo): string {
  let text = `**Drift Account**\n\n`;
  text += `**Authority:** \`${info.authority}\`\n`;
  text += `**Subaccount ID:** ${info.subAccountId}\n\n`;

  // Collateral section
  text += `**Collateral:** ${formatUsd(parseFloat(info.collateral) / 1_000_000)}\n`;
  text += `**Free Collateral:** ${formatUsd(parseFloat(info.freeCollateral) / 1_000_000)}\n`;
  text += `**Position Value:** ${formatUsd(parseFloat(info.totalPositionValue) / 1_000_000)}\n\n`;

  // PnL section
  text += `**Unrealized PnL:** ${formatPnl((parseFloat(info.unrealizedPnl) / 1_000_000).toString())}\n`;
  text += `**Settled PnL:** ${formatPnl((parseFloat(info.settledPnl) / 1_000_000).toString())}\n`;
  text += `**Cumulative Funding:** ${formatPnl((parseFloat(info.cumulativeFunding) / 1_000_000).toString())}\n\n`;

  // Risk metrics
  text += `**Leverage:** ${info.leverage.toFixed(2)}x\n`;
  text += `**Margin Ratio:** ${info.marginRatio}%`;

  return text;
}

/**
 * Format positions list for display
 */
export function formatPositions(positions: DriftPosition[]): string {
  if (positions.length === 0) {
    return '**No open positions**\n\nYou have no open perpetual positions on Drift.';
  }

  let text = `**Open Positions (${positions.length})**\n\n`;

  for (const pos of positions) {
    const sideEmoji = pos.side === 'long' ? '🟢' : '🔴';

    text += `${sideEmoji} **${pos.marketSymbol}** ${pos.side.toUpperCase()} ${pos.leverage.toFixed(2)}x\n`;
    text += `**Size:** ${formatVolume(pos.size)}\n`;
    text += `**Notional:** ${formatUsd(pos.notionalValue)}\n`;
    text += `**Entry:** ${formatUsd(pos.entryPrice)}\n`;
    text += `**Mark:** ${formatUsd(pos.markPrice)}\n`;
    text += `**Unrealized PnL:** ${formatPnl(pos.unrealizedPnl)}\n`;
    text += `**Liquidation:** ${formatUsd(pos.liquidationPrice)}\n`;
    text += `**Margin Used:** ${formatUsd(pos.marginUsed)}\n`;
    text += '\n';
  }

  return text.trim();
}

/**
 * Format markets list for display
 */
export function formatMarkets(markets: DriftMarket[]): string {
  if (markets.length === 0) {
    return '**No markets available**';
  }

  let text = `**Drift Perpetual Markets (${markets.length})**\n\n`;

  for (const market of markets) {
    text += `**${market.symbol}**\n`;
    text += `Index: ${market.marketIndex}\n`;
    text += `Base Asset: ${market.baseAsset}\n`;
    text += `Max Leverage: ${market.maxLeverage}x\n\n`;
  }

  return text.trim();
}

/**
 * Format position result for display (opening position)
 */
export function formatPositionResult(
  result: PositionResult,
  marketSymbol: string,
  side: PositionSide,
  leverage: number,
  isHighRisk: boolean
): string {
  let text = '';
  const sideLabel = side.toUpperCase();

  // High risk warning for >5x leverage
  if (isHighRisk) {
    text += `**⚠️ High Leverage Position (${leverage}x)**\n\n`;
  } else {
    text += `**${sideLabel} Position Opened**\n\n`;
  }

  text += `**Market:** ${marketSymbol}\n`;

  if (result.position) {
    const pos = result.position;
    text += `**Side:** ${sideLabel}\n`;
    text += `**Size:** ${formatVolume(pos.size)}\n`;
    text += `**Notional Value:** ${formatUsd(pos.notionalValue)}\n`;
    text += `**Entry Price:** ${formatUsd(pos.entryPrice)}\n`;
    text += `**Leverage:** ${pos.leverage.toFixed(2)}x\n`;
    text += `**Margin Used:** ${formatUsd(pos.marginUsed)}\n`;

    // Calculate distance to liquidation based on side
    const entryPrice = parseFloat(pos.entryPrice);
    const liqPrice = parseFloat(pos.liquidationPrice);
    const liqDistance = side === 'long'
      ? ((entryPrice - liqPrice) / entryPrice * 100)
      : ((liqPrice - entryPrice) / entryPrice * 100);
    text += `**Liquidation Price:** ${formatUsd(pos.liquidationPrice)} (${liqDistance.toFixed(1)}% away)\n`;
  }

  text += '\n';

  if (result.txSignature) {
    text += `Transaction: \`${result.txSignature}\``;
  }

  return text;
}

/**
 * Format close result for display
 */
export function formatCloseResult(marketSymbol: string, percentage: number, txSignature?: string): string {
  let text = `**Position Closed**\n\n`;
  text += `**Market:** ${marketSymbol}\n`;
  text += `**Closed:** ${percentage}%\n\n`;

  if (txSignature) {
    text += `Transaction: \`${txSignature}\``;
  }

  return text;
}

/**
 * Format deposit result for display
 */
export function formatDepositResult(amount: number, txSignature?: string): string {
  let text = `**USDC Deposited to Drift**\n\n`;
  text += `**Amount:** ${formatUsd(amount)}\n\n`;

  if (txSignature) {
    text += `Transaction: \`${txSignature}\``;
  }

  return text;
}

/**
 * Format withdrawal result for display
 */
export function formatWithdrawResult(amount: number, newFreeCollateral: number, txSignature?: string): string {
  let text = `**USDC Withdrawn from Drift**\n\n`;
  text += `**Amount:** ${formatUsd(amount)}\n`;
  text += `**Remaining Free Collateral:** ${formatUsd(newFreeCollateral)}\n\n`;

  if (txSignature) {
    text += `Transaction: \`${txSignature}\``;
  }

  return text;
}
