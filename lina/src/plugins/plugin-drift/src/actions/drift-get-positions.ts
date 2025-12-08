/**
 * DRIFT_GET_POSITIONS Action
 *
 * Retrieves all open perpetual positions with PnL and liquidation info.
 */

import {
  type Action,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  logger,
} from '@elizaos/core';
import { DriftService } from '../services/drift.service';
import { ACTION_NAMES, SERVICE_NAME } from '../constants';
import { formatPositions } from '../utils/formatters';
import { extractUserId } from '../utils/action-factory';

export const driftGetPositions: Action = {
  name: ACTION_NAMES.DRIFT_GET_POSITIONS,
  similes: ['POSITIONS', 'MY POSITIONS', 'SHOW POSITIONS', 'LIST POSITIONS', 'OPEN POSITIONS', 'DRIFT POSITIONS'],
  description: 'List all open perpetual positions on Drift Protocol with PnL and liquidation prices',

  parameters: {},

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as DriftService;
      return !!service;
    } catch (error) {
      logger.warn(
        `[${ACTION_NAMES.DRIFT_GET_POSITIONS}] Validation failed:`,
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    try {
      logger.info(`[${ACTION_NAMES.DRIFT_GET_POSITIONS}] Fetching positions`);

      const service = runtime.getService(SERVICE_NAME) as DriftService;

      if (!service) {
        throw new Error('Drift service not initialized');
      }

      const userId = await extractUserId(runtime, message);
      const positions = await service.getPositions(userId);

      const text = formatPositions(positions);

      callback?.({ text, content: positions });

      return {
        text,
        success: true,
        data: positions,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[${ACTION_NAMES.DRIFT_GET_POSITIONS}] Failed:`, errorMsg);

      const errorText = `Failed to fetch positions: ${errorMsg}`;

      callback?.({ text: errorText, content: null });

      return {
        text: errorText,
        success: false,
        error: errorMsg,
      };
    }
  },

  examples: [
    [
      {
        name: '{{user}}',
        content: { text: 'show my open positions on Drift' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Fetching your open perpetual positions...',
          action: ACTION_NAMES.DRIFT_GET_POSITIONS,
        },
      },
    ],
    [
      {
        name: '{{user}}',
        content: { text: 'what Drift positions do I have?' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Let me check your positions...',
          action: ACTION_NAMES.DRIFT_GET_POSITIONS,
        },
      },
    ],
  ],
};

export default driftGetPositions;
