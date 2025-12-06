/**
 * DRIFT_CLOSE_POSITION Action
 *
 * Closes an open perpetual position (full or partial).
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
import { formatCloseResult } from '../utils/formatters';
import { extractUserId, extractActionParams } from '../utils/action-factory';

export const driftClosePosition: Action = {
  name: ACTION_NAMES.DRIFT_CLOSE_POSITION,
  similes: ['CLOSE', 'EXIT', 'CLOSE POSITION', 'EXIT POSITION', 'CLOSE PERP', 'DRIFT CLOSE'],
  description: 'Close an open perpetual position (full or partial)',

  parameters: {
    marketSymbol: {
      type: 'string',
      description: 'Drift market symbol (e.g., SOL-PERP, BTC-PERP, ETH-PERP)',
      required: true,
    },
    percentage: {
      type: 'number',
      description: 'Percentage to close (1-100, default: 100)',
      required: false,
    },
  },

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as DriftService;
      return !!service;
    } catch (error) {
      logger.warn(
        `[${ACTION_NAMES.DRIFT_CLOSE_POSITION}] Validation failed:`,
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
      logger.info(`[${ACTION_NAMES.DRIFT_CLOSE_POSITION}] Closing position`);

      const service = runtime.getService(SERVICE_NAME) as DriftService;

      if (!service) {
        throw new Error('Drift service not initialized');
      }

      const userId = extractUserId(message);
      const params = await extractActionParams(runtime, message);

      const marketSymbol = (params?.marketSymbol as string)?.trim()?.toUpperCase();
      const percentage = params?.percentage ? Number(params.percentage) : 100;

      // Validate required parameters
      if (!marketSymbol) {
        throw new Error('Market symbol is required (e.g., SOL-PERP, BTC-PERP, ETH-PERP)');
      }

      // Validate via service
      const validation = service.validateCloseParams({
        marketSymbol,
        percentage,
      });

      if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
      }

      logger.info(
        `[${ACTION_NAMES.DRIFT_CLOSE_POSITION}] Closing ${percentage}% of ${marketSymbol} position`
      );

      // Execute position closing
      const result = await service.closePosition(userId, {
        marketSymbol,
        percentage,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to close position');
      }

      const text = formatCloseResult(marketSymbol, percentage, result.txSignature);

      callback?.({ text, content: result });

      return {
        text,
        success: true,
        data: result,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[${ACTION_NAMES.DRIFT_CLOSE_POSITION}] Failed:`, errorMsg);

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
        content: { text: 'close my SOL-PERP position' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Closing your SOL-PERP position...',
          action: ACTION_NAMES.DRIFT_CLOSE_POSITION,
        },
      },
    ],
    [
      {
        name: '{{user}}',
        content: { text: 'exit 50% of my BTC-PERP position' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Closing 50% of your BTC-PERP position...',
          action: ACTION_NAMES.DRIFT_CLOSE_POSITION,
        },
      },
    ],
  ],
};

export default driftClosePosition;
