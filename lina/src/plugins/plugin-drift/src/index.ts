/**
 * Drift Protocol Plugin for ElizaOS
 * Enables Solana perpetual futures trading with up to 20x leverage
 */

import type { Plugin } from '@elizaos/core';
import { DriftService } from './services/drift.service';

// Import all actions
import driftOpenLong from './actions/drift-open-long';
import driftOpenShort from './actions/drift-open-short';
import driftClosePosition from './actions/drift-close-position';
import driftCloseAllPositions from './actions/drift-close-all-positions';
import driftGetPositions from './actions/drift-get-positions';
import driftGetMarkets from './actions/drift-get-markets';
import driftAccountInfo from './actions/drift-account-info';
import driftDeposit from './actions/drift-deposit';
import driftWithdraw from './actions/drift-withdraw';

export const driftPlugin: Plugin = {
  name: 'drift',
  description: 'Solana perpetual futures trading via Drift Protocol with up to 20x leverage',
  evaluators: [],
  providers: [],
  actions: [
    driftOpenLong,
    driftOpenShort,
    driftClosePosition,
    driftCloseAllPositions,
    driftGetPositions,
    driftGetMarkets,
    driftAccountInfo,
    driftDeposit,
    driftWithdraw,
  ],
  services: [DriftService],
};

export default driftPlugin;

// Re-export types for external use
export * from './types';
export * from './constants';
export { DriftService } from './services/drift.service';
