/**
 * PERP_GET_POSITIONS Action
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
import { HyperliquidService } from '../services/hyperliquid.service';
import { ACTION_NAMES, SERVICE_NAME } from '../constants';
import { formatPositions } from '../utils/formatters';
import { extractUserId } from '../utils/action-factory';

export const perpGetPositions: Action = {
  name: ACTION_NAMES.PERP_GET_POSITIONS,
  similes: ['POSITIONS', 'MY POSITIONS', 'SHOW POSITIONS', 'LIST POSITIONS', 'OPEN POSITIONS'],
  description: 'List all open perpetual positions with PnL and liquidation prices',

  parameters: {},

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as HyperliquidService;
      return !!service;
    } catch (error) {
      logger.warn(
        `[${ACTION_NAMES.PERP_GET_POSITIONS}] Validation failed:`,
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
      logger.info(`[${ACTION_NAMES.PERP_GET_POSITIONS}] Fetching positions`);

      const service = runtime.getService(SERVICE_NAME) as HyperliquidService;

      if (!service) {
        throw new Error('HyperliquidService not initialized');
      }

      const userId = extractUserId(message);
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
      logger.error(`[${ACTION_NAMES.PERP_GET_POSITIONS}] Failed:`, errorMsg);

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
        content: { text: 'show my open positions' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Fetching your open perpetual positions...',
          action: ACTION_NAMES.PERP_GET_POSITIONS,
        },
      },
    ],
    [
      {
        name: '{{user}}',
        content: { text: 'what perp positions do I have?' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Let me check your positions...',
          action: ACTION_NAMES.PERP_GET_POSITIONS,
        },
      },
    ],
  ],
};

export default perpGetPositions;
