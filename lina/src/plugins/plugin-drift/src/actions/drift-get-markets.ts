/**
 * DRIFT_GET_MARKETS Action
 *
 * Retrieves available perpetual markets on Drift Protocol.
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
import { formatMarkets } from '../utils/formatters';

export const driftGetMarkets: Action = {
  name: ACTION_NAMES.DRIFT_GET_MARKETS,
  similes: ['MARKETS', 'LIST MARKETS', 'AVAILABLE MARKETS', 'DRIFT MARKETS', 'SHOW MARKETS'],
  description: 'List all available perpetual markets on Drift Protocol',

  parameters: {},

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as DriftService;
      return !!service;
    } catch (error) {
      logger.warn(
        `[${ACTION_NAMES.DRIFT_GET_MARKETS}] Validation failed:`,
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    try {
      logger.info(`[${ACTION_NAMES.DRIFT_GET_MARKETS}] Fetching markets`);

      const service = runtime.getService(SERVICE_NAME) as DriftService;

      if (!service) {
        throw new Error('Drift service not initialized');
      }

      const markets = await service.getMarkets();

      const text = formatMarkets(markets);

      callback?.({ text, content: markets });

      return {
        text,
        success: true,
        data: markets,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[${ACTION_NAMES.DRIFT_GET_MARKETS}] Failed:`, errorMsg);

      const errorText = `Failed to fetch markets: ${errorMsg}`;

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
        content: { text: 'what markets are available on Drift?' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Fetching available Drift markets...',
          action: ACTION_NAMES.DRIFT_GET_MARKETS,
        },
      },
    ],
    [
      {
        name: '{{user}}',
        content: { text: 'show me Drift perpetual markets' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Let me get the list of markets...',
          action: ACTION_NAMES.DRIFT_GET_MARKETS,
        },
      },
    ],
  ],
};

export default driftGetMarkets;
