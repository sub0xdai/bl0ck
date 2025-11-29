/**
 * Hyperliquid Plugin
 *
 * Enables perpetual futures trading on Hyperliquid DEX with leverage up to 25x.
 * Supports market and limit orders for opening/closing positions.
 */

import type { Plugin } from '@elizaos/core';
import { HyperliquidService } from './services/hyperliquid.service';

// Actions will be implemented after service tests pass
// import { perpOpenLong } from './actions/perp-open-long';
// import { perpOpenShort } from './actions/perp-open-short';
// import { perpClosePosition } from './actions/perp-close-position';
// import { perpGetPositions } from './actions/perp-get-positions';
// import { perpGetMarkets } from './actions/perp-get-markets';
// import { perpAccountInfo } from './actions/perp-account-info';

export const hyperliquidPlugin: Plugin = {
  name: 'hyperliquid',
  description: 'Hyperliquid perpetual futures trading with leverage up to 25x',
  evaluators: [],
  providers: [],
  actions: [
    // Will be enabled after TDD GREEN phase for actions
    // perpOpenLong,
    // perpOpenShort,
    // perpClosePosition,
    // perpGetPositions,
    // perpGetMarkets,
    // perpAccountInfo,
  ],
  services: [HyperliquidService],
};

export default hyperliquidPlugin;

// Export types for consumers
export type {
  Position,
  Market,
  AccountInfo,
  OpenPositionParams,
  ClosePositionParams,
  PositionResult,
  CloseResult,
  HyperliquidConfig,
  OrderType,
  PositionSide,
} from './types';

export { HyperliquidService } from './services/hyperliquid.service';
export { SERVICE_CONFIG, ACTION_NAMES, ERROR_MESSAGES } from './constants';
