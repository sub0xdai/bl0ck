/**
 * DRIFT_WITHDRAW Action
 *
 * Withdraws USDC collateral from Drift Protocol to user's wallet.
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
import { formatWithdrawResult } from '../utils/formatters';
import { extractUserId, extractActionParams } from '../utils/action-factory';

export const driftWithdraw: Action = {
  name: ACTION_NAMES.DRIFT_WITHDRAW,
  similes: ['WITHDRAW', 'WITHDRAW USDC', 'DRIFT WITHDRAW', 'REMOVE COLLATERAL', 'WITHDRAW FROM DRIFT'],
  description: 'Withdraw USDC collateral from Drift Protocol to your wallet',

  parameters: {
    amount: {
      type: 'number',
      description: 'Amount of USDC to withdraw (minimum: $10)',
      required: true,
    },
  },

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as DriftService;
      return !!service;
    } catch (error) {
      logger.warn(
        `[${ACTION_NAMES.DRIFT_WITHDRAW}] Validation failed:`,
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
      logger.info(`[${ACTION_NAMES.DRIFT_WITHDRAW}] Processing withdrawal`);

      const service = runtime.getService(SERVICE_NAME) as DriftService;

      if (!service) {
        throw new Error('Drift service not initialized');
      }

      const userId = await extractUserId(runtime, message);
      const params = await extractActionParams(runtime, message);

      const amount = params?.amount ? Number(params.amount) : undefined;

      // Validate required parameters
      if (!amount || amount <= 0) {
        throw new Error('Amount is required and must be positive');
      }

      logger.info(`[${ACTION_NAMES.DRIFT_WITHDRAW}] Withdrawing $${amount} USDC`);

      // Execute withdrawal
      const result = await service.withdraw(userId, amount);

      if (!result.success) {
        throw new Error(result.error || 'Failed to withdraw');
      }

      const text = formatWithdrawResult(amount, result.newFreeCollateral || 0, result.txSignature);

      callback?.({ text, content: result });

      return {
        text,
        success: true,
        data: result,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[${ACTION_NAMES.DRIFT_WITHDRAW}] Failed:`, errorMsg);

      const errorText = `Failed to withdraw: ${errorMsg}`;

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
        content: { text: 'withdraw $500 USDC from Drift' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Withdrawing $500 USDC from your Drift account...',
          action: ACTION_NAMES.DRIFT_WITHDRAW,
        },
      },
    ],
    [
      {
        name: '{{user}}',
        content: { text: 'remove $100 collateral from Drift' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Withdrawing $100 collateral from Drift...',
          action: ACTION_NAMES.DRIFT_WITHDRAW,
        },
      },
    ],
  ],
};

export default driftWithdraw;
