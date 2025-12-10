/**
 * DRIFT_CLOSE_ALL_POSITIONS Action
 *
 * Closes all open perpetual positions.
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
import { formatCloseAllResult } from '../utils/formatters';
import { extractUserId } from '../utils/action-factory';

export const driftCloseAllPositions: Action = {
  name: ACTION_NAMES.DRIFT_CLOSE_ALL_POSITIONS,
  similes: [
    'CLOSE ALL',
    'CLOSE ALL POSITIONS',
    'EXIT ALL',
    'EXIT ALL POSITIONS',
    'CLOSE MY POSITIONS',
    'CLOSE POSITIONS',
    'LIQUIDATE ALL',
    'FLATTEN',
    'FLATTEN ALL',
  ],
  description: 'Close all open perpetual positions on Drift Protocol',

  parameters: {},

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as DriftService;
      return !!service;
    } catch (error) {
      logger.warn(
        `[${ACTION_NAMES.DRIFT_CLOSE_ALL_POSITIONS}] Validation failed:`,
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
      logger.info(`[${ACTION_NAMES.DRIFT_CLOSE_ALL_POSITIONS}] Closing all positions`);

      const service = runtime.getService(SERVICE_NAME) as DriftService;

      if (!service) {
        throw new Error('Drift service not initialized');
      }

      const userId = await extractUserId(runtime, message);

      logger.info(`[${ACTION_NAMES.DRIFT_CLOSE_ALL_POSITIONS}] Fetching and closing all positions for user ${userId}`);

      // Execute close all
      const result = await service.closeAllPositions(userId);

      const text = formatCloseAllResult(result);

      callback?.({ text, content: result });

      return {
        text,
        success: result.success,
        data: result,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[${ACTION_NAMES.DRIFT_CLOSE_ALL_POSITIONS}] Failed:`, errorMsg);

      const errorText = `Failed to close positions: ${errorMsg}`;

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
        content: { text: 'close all my positions' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Closing all your Drift positions...',
          action: ACTION_NAMES.DRIFT_CLOSE_ALL_POSITIONS,
        },
      },
    ],
    [
      {
        name: '{{user}}',
        content: { text: 'exit all positions on drift' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Closing all Drift positions...',
          action: ACTION_NAMES.DRIFT_CLOSE_ALL_POSITIONS,
        },
      },
    ],
    [
      {
        name: '{{user}}',
        content: { text: 'flatten my drift account' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Flattening your Drift account - closing all positions...',
          action: ACTION_NAMES.DRIFT_CLOSE_ALL_POSITIONS,
        },
      },
    ],
  ],
};

export default driftCloseAllPositions;
