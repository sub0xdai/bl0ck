/**
 * PERP_CLOSE_POSITION Action
 *
 * Closes an existing perpetual position (full or partial).
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
import type { OrderType } from '../types';
import { formatCloseResult } from '../utils/formatters';
import { extractUserId, extractActionParams } from '../utils/action-factory';

export const perpClosePosition: Action = {
  name: ACTION_NAMES.PERP_CLOSE_POSITION,
  similes: ['CLOSE', 'EXIT POSITION', 'CLOSE PERP', 'EXIT', 'CLOSE POSITION'],
  description: 'Close an existing perpetual position (full or partial)',

  parameters: {
    symbol: {
      type: 'string',
      description: 'Trading pair symbol (e.g., BTC, ETH)',
      required: true,
    },
    percentage: {
      type: 'number',
      description: 'Percentage of position to close (1-100, default 100 for full close)',
      required: false,
    },
    orderType: {
      type: 'string',
      description: 'Order type: market or limit (default: market)',
      required: false,
    },
    limitPrice: {
      type: 'number',
      description: 'Limit price (required for limit orders)',
      required: false,
    },
  },

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as HyperliquidService;
      return !!service;
    } catch (error) {
      logger.warn(
        `[${ACTION_NAMES.PERP_CLOSE_POSITION}] Validation failed:`,
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
      logger.info(`[${ACTION_NAMES.PERP_CLOSE_POSITION}] Processing close request`);

      const service = runtime.getService(SERVICE_NAME) as HyperliquidService;

      if (!service) {
        throw new Error('HyperliquidService not initialized');
      }

      const userId = extractUserId(message);
      const params = await extractActionParams(runtime, message);

      const symbol = (params?.symbol as string)?.trim()?.toUpperCase();
      const percentage = params?.percentage ? Number(params.percentage) : 100;
      const orderType = ((params?.orderType as string) || 'market').toLowerCase() as OrderType;
      const limitPrice = params?.limitPrice ? Number(params.limitPrice) : undefined;

      // Validate required parameters
      if (!symbol) {
        throw new Error('Symbol is required. Specify which position to close (e.g., BTC, ETH)');
      }

      // Validate limit price for limit orders
      if (orderType === 'limit' && !limitPrice) {
        throw new Error('Limit price is required for limit orders');
      }

      // Validate via service (single source of truth for business rules)
      const validation = service.validateCloseParams({
        userId,
        symbol,
        percentage,
        orderType,
        limitPrice,
      });

      if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
      }

      logger.info(
        `[${ACTION_NAMES.PERP_CLOSE_POSITION}] Closing ${percentage}% of ${symbol} position (${orderType})`
      );

      // Execute close
      const result = await service.closePosition({
        userId,
        symbol,
        percentage,
        orderType,
        limitPrice,
      });

      if (!result.success) {
        throw new Error(result.error || result.message);
      }

      const text = formatCloseResult(result, symbol, percentage);

      callback?.({ text, content: result });

      return {
        text,
        success: true,
        data: result,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[${ACTION_NAMES.PERP_CLOSE_POSITION}] Failed:`, errorMsg);

      const errorText = `Failed to close position: ${errorMsg}`;

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
        content: { text: 'close my BTC position' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Closing your BTC perpetual position...',
          action: ACTION_NAMES.PERP_CLOSE_POSITION,
        },
      },
    ],
    [
      {
        name: '{{user}}',
        content: { text: 'close 50% of my ETH perp' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Closing 50% of your ETH position...',
          action: ACTION_NAMES.PERP_CLOSE_POSITION,
        },
      },
    ],
    [
      {
        name: '{{user}}',
        content: { text: 'close SOL position with limit at 150' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Placing limit order to close your SOL position at $150...',
          action: ACTION_NAMES.PERP_CLOSE_POSITION,
        },
      },
    ],
  ],
};

export default perpClosePosition;
