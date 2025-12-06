/**
 * Drift Protocol Plugin for ElizaOS
 * Enables Solana perpetual futures trading with up to 20x leverage
 */

import type { Plugin } from '@elizaos/core';
import { DriftService } from './services/drift.service';

export const driftPlugin: Plugin = {
  name: 'drift',
  description: 'Solana perpetual futures trading via Drift Protocol with up to 20x leverage',
  evaluators: [],
  providers: [],
  actions: [],
  services: [DriftService],
};

export default driftPlugin;

// Re-export types for external use
export * from './types';
export * from './constants';
export { DriftService } from './services/drift.service';
