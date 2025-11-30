/**
 * PERP_GET_MARKETS Action
 *
 * Retrieves available perpetual markets with pricing and funding rate info.
 */

import {
  type Action,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  logger,
} from '@elizaos/core';
import { HyperliquidService } from '../services/hyperliquid.service';
import { ACTION_NAMES, SERVICE_NAME, SERVICE_CONFIG } from '../constants';
import { formatMarkets } from '../utils/formatters';

export const perpGetMarkets: Action = {
  name: ACTION_NAMES.PERP_GET_MARKETS,
  similes: ['MARKETS', 'PERP MARKETS', 'SHOW MARKETS', 'LIST MARKETS', 'AVAILABLE MARKETS'],
  description: 'List available perpetual markets with pricing and funding rates',

  parameters: {},

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as HyperliquidService;
      return !!service;
    } catch (error) {
      logger.warn(
        `[${ACTION_NAMES.PERP_GET_MARKETS}] Validation failed:`,
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
      logger.info(`[${ACTION_NAMES.PERP_GET_MARKETS}] Fetching markets`);

      const service = runtime.getService(SERVICE_NAME) as HyperliquidService;

      if (!service) {
        throw new Error('HyperliquidService not initialized');
      }

      const markets = await service.getMarkets();

      const text = formatMarkets(markets, SERVICE_CONFIG.MARKETS_DISPLAY_COUNT);

      callback?.({ text, content: markets });

      return {
        text,
        success: true,
        data: markets,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[${ACTION_NAMES.PERP_GET_MARKETS}] Failed:`, errorMsg);

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
        content: { text: 'show perp markets' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Fetching available perpetual markets...',
          action: ACTION_NAMES.PERP_GET_MARKETS,
        },
      },
    ],
    [
      {
        name: '{{user}}',
        content: { text: 'what perps can I trade on hyperliquid?' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Let me show you the available markets...',
          action: ACTION_NAMES.PERP_GET_MARKETS,
        },
      },
    ],
  ],
};

export default perpGetMarkets;
