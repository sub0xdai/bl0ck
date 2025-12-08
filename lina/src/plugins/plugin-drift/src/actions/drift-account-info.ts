/**
 * DRIFT_ACCOUNT_INFO Action
 *
 * Retrieves account information including collateral, margin, and PnL.
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
import { formatAccountInfo } from '../utils/formatters';
import { extractUserId } from '../utils/action-factory';

export const driftAccountInfo: Action = {
  name: ACTION_NAMES.DRIFT_ACCOUNT_INFO,
  similes: ['ACCOUNT', 'BALANCE', 'DRIFT BALANCE', 'MARGIN', 'DRIFT ACCOUNT', 'ACCOUNT INFO'],
  description: 'Get Drift account information including collateral, margin, and PnL',

  parameters: {},

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as DriftService;
      return !!service;
    } catch (error) {
      logger.warn(
        `[${ACTION_NAMES.DRIFT_ACCOUNT_INFO}] Validation failed:`,
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
      logger.info(`[${ACTION_NAMES.DRIFT_ACCOUNT_INFO}] Fetching account info`);

      const service = runtime.getService(SERVICE_NAME) as DriftService;

      if (!service) {
        throw new Error('Drift service not initialized');
      }

      const userId = await extractUserId(runtime, message);
      const accountInfo = await service.getAccountInfo(userId);

      const text = formatAccountInfo(accountInfo);

      callback?.({ text, content: accountInfo });

      return {
        text,
        success: true,
        data: accountInfo,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[${ACTION_NAMES.DRIFT_ACCOUNT_INFO}] Failed:`, errorMsg);

      const errorText = `Failed to fetch account info: ${errorMsg}`;

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
        content: { text: 'show my Drift account balance' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Fetching your Drift account information...',
          action: ACTION_NAMES.DRIFT_ACCOUNT_INFO,
        },
      },
    ],
    [
      {
        name: '{{user}}',
        content: { text: 'what is my Drift margin?' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Let me check your margin details...',
          action: ACTION_NAMES.DRIFT_ACCOUNT_INFO,
        },
      },
    ],
  ],
};

export default driftAccountInfo;
