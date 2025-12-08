/**
 * DRIFT_DEPOSIT Action
 *
 * Deposits USDC collateral to Drift Protocol.
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
import { formatDepositResult } from '../utils/formatters';
import { extractUserId, extractActionParams } from '../utils/action-factory';

export const driftDeposit: Action = {
  name: ACTION_NAMES.DRIFT_DEPOSIT,
  similes: ['DEPOSIT', 'ADD COLLATERAL', 'DEPOSIT USDC', 'DRIFT DEPOSIT', 'ADD MARGIN'],
  description: 'Deposit USDC collateral to Drift Protocol',

  parameters: {
    amount: {
      type: 'number',
      description: 'Amount of USDC to deposit (minimum: $10)',
      required: true,
    },
  },

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as DriftService;
      return !!service;
    } catch (error) {
      logger.warn(
        `[${ACTION_NAMES.DRIFT_DEPOSIT}] Validation failed:`,
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
      logger.info(`[${ACTION_NAMES.DRIFT_DEPOSIT}] Processing deposit`);

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

      logger.info(`[${ACTION_NAMES.DRIFT_DEPOSIT}] Depositing $${amount} USDC`);

      // Execute deposit
      const result = await service.deposit(userId, amount);

      if (!result.success) {
        throw new Error(result.error || 'Failed to deposit');
      }

      const text = formatDepositResult(amount, result.txSignature);

      callback?.({ text, content: result });

      return {
        text,
        success: true,
        data: result,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[${ACTION_NAMES.DRIFT_DEPOSIT}] Failed:`, errorMsg);

      const errorText = `Failed to deposit: ${errorMsg}`;

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
        content: { text: 'deposit $500 USDC to Drift' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Depositing $500 USDC to your Drift account...',
          action: ACTION_NAMES.DRIFT_DEPOSIT,
        },
      },
    ],
    [
      {
        name: '{{user}}',
        content: { text: 'add $1000 margin to Drift' },
      },
      {
        name: '{{agent}}',
        content: {
          text: 'Adding $1000 collateral to your Drift account...',
          action: ACTION_NAMES.DRIFT_DEPOSIT,
        },
      },
    ],
  ],
};

export default driftDeposit;
