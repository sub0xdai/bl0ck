/**
 * Drift Protocol Plugin
 *
 * Enables perpetual futures trading on Solana via Drift Protocol with up to 20x leverage.
 * Supports market and limit orders for opening/closing positions across 30+ markets.
 *
 * Features:
 * - SOL, BTC, ETH, WIF, JUP, BONK, and 25+ more markets
 * - Up to 20x leverage
 * - Market and limit orders
 * - Cross-margin support
 * - Integration with SolanaTransactionManager for wallet management
 */

import type { Plugin } from '@elizaos/core';
import { DriftService } from './services/drift.service';

// Actions
import {
  driftOpenLong,
  driftOpenShort,
  driftClosePosition,
  driftGetPositions,
  driftGetMarkets,
  driftAccountInfo,
  driftDeposit,
} from './actions/drift-actions';

export const driftPlugin: Plugin = {
  name: 'drift',
  description: 'Solana perpetual futures trading via Drift Protocol with up to 20x leverage',
  evaluators: [],
  providers: [],
  actions: [
    driftOpenLong,
    driftOpenShort,
    driftClosePosition,
    driftGetPositions,
    driftGetMarkets,
    driftAccountInfo,
    driftDeposit,
  ],
  services: [DriftService],
};

export default driftPlugin;

// Export types for consumers
export type {
  DriftPosition,
  DriftMarket,
  DriftAccountInfo,
  OpenPositionParams,
  ClosePositionParams,
  PositionResult,
  CloseResult,
  DriftConfig,
  OrderType,
  PositionSide,
  ValidationResult,
} from './types';

export { DriftService } from './services/drift.service';
export { SERVICE_CONFIG, ACTION_NAMES, ERROR_MESSAGES, MARKETS, MARKET_SYMBOLS } from './constants';
