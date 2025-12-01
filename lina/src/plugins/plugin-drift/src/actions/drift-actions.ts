/**
 * Drift Protocol Actions
 *
 * All actions for Drift perpetual futures trading on Solana.
 * Uses factory pattern to reduce code duplication.
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
import { ACTION_NAMES, SERVICE_NAME, SERVICE_CONFIG, POPULAR_MARKETS } from '../constants';
import {
  createOpenPositionAction,
  createClosePositionAction,
  extractUserId,
  extractActionParams,
} from '../utils/action-factory';
import {
  formatPositionsList,
  formatMarketsList,
  formatAccountInfo,
} from '../utils/formatters';

// ============================================================
// POSITION ACTIONS (Factory-generated)
// ============================================================

/**
 * Open Long Position on Drift
 */
export const driftOpenLong = createOpenPositionAction({
  side: 'long',
  actionName: ACTION_NAMES.DRIFT_OPEN_LONG,
  similes: ['DRIFT_LONG', 'SOLANA_PERP_LONG', 'SOL_LONG', 'OPEN_DRIFT_LONG'],
  description: 'Open a leveraged long position on Drift Protocol (Solana perpetuals, up to 20x)',
});

/**
 * Open Short Position on Drift
 */
export const driftOpenShort = createOpenPositionAction({
  side: 'short',
  actionName: ACTION_NAMES.DRIFT_OPEN_SHORT,
  similes: ['DRIFT_SHORT', 'SOLANA_PERP_SHORT', 'SOL_SHORT', 'OPEN_DRIFT_SHORT'],
  description: 'Open a leveraged short position on Drift Protocol (Solana perpetuals, up to 20x)',
});

/**
 * Close Position on Drift
 */
export const driftClosePosition = createClosePositionAction();

// ============================================================
// QUERY ACTIONS (Manually defined)
// ============================================================

/**
 * Get Drift Positions
 */
export const driftGetPositions: Action = {
  name: ACTION_NAMES.DRIFT_GET_POSITIONS,
  similes: ['DRIFT_POSITIONS', 'MY_DRIFT_POSITIONS', 'SHOW_DRIFT_POSITIONS', 'SOLANA_POSITIONS'],
  description: 'View all open positions on Drift Protocol',

  parameters: {},

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as DriftService;
      return !!service;
    } catch {
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
      const service = runtime.getService(SERVICE_NAME) as DriftService;

      if (!service) {
        throw new Error('DriftService not initialized');
      }

      const userId = extractUserId(message);
      const positions = await service.getPositions(userId);

      const text = formatPositionsList(positions);

      callback?.({ text, content: { positions } });

      return {
        text,
        success: true,
        data: { positions },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorText = `Failed to get Drift positions: ${errorMsg}`;
      callback?.({ text: errorText, content: null });
      return { text: errorText, success: false, error: errorMsg };
    }
  },

  examples: [
    [
      { name: '{{user}}', content: { text: 'show my drift positions' } },
      { name: '{{agent}}', content: { text: 'Fetching positions...', action: ACTION_NAMES.DRIFT_GET_POSITIONS } },
    ],
    [
      { name: '{{user}}', content: { text: "what's my solana perp exposure" } },
      { name: '{{agent}}', content: { text: 'Checking Drift positions...', action: ACTION_NAMES.DRIFT_GET_POSITIONS } },
    ],
  ],
};

/**
 * Get Drift Markets
 */
export const driftGetMarkets: Action = {
  name: ACTION_NAMES.DRIFT_GET_MARKETS,
  similes: ['DRIFT_MARKETS', 'LIST_DRIFT_MARKETS', 'SOLANA_PERP_MARKETS', 'WHAT_CAN_I_TRADE_ON_DRIFT'],
  description: 'List available perpetual markets on Drift Protocol',

  parameters: {},

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as DriftService;
      return !!service;
    } catch {
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
      const service = runtime.getService(SERVICE_NAME) as DriftService;

      if (!service) {
        throw new Error('DriftService not initialized');
      }

      const markets = await service.getMarkets();

      const text = formatMarketsList(markets);

      callback?.({ text, content: { markets } });

      return {
        text,
        success: true,
        data: { markets },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorText = `Failed to get Drift markets: ${errorMsg}`;
      callback?.({ text: errorText, content: null });
      return { text: errorText, success: false, error: errorMsg };
    }
  },

  examples: [
    [
      { name: '{{user}}', content: { text: 'what markets are on drift' } },
      { name: '{{agent}}', content: { text: 'Fetching markets...', action: ACTION_NAMES.DRIFT_GET_MARKETS } },
    ],
    [
      { name: '{{user}}', content: { text: 'show me solana perp markets' } },
      { name: '{{agent}}', content: { text: 'Listing Drift markets...', action: ACTION_NAMES.DRIFT_GET_MARKETS } },
    ],
  ],
};

/**
 * Get Drift Account Info
 */
export const driftAccountInfo: Action = {
  name: ACTION_NAMES.DRIFT_ACCOUNT_INFO,
  similes: ['DRIFT_ACCOUNT', 'MY_DRIFT_ACCOUNT', 'DRIFT_BALANCE', 'SOLANA_PERP_ACCOUNT'],
  description: 'View Drift account summary including collateral and margin',

  parameters: {},

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as DriftService;
      return !!service;
    } catch {
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
      const service = runtime.getService(SERVICE_NAME) as DriftService;

      if (!service) {
        throw new Error('DriftService not initialized');
      }

      const userId = extractUserId(message);
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
      const errorText = `Failed to get Drift account info: ${errorMsg}`;
      callback?.({ text: errorText, content: null });
      return { text: errorText, success: false, error: errorMsg };
    }
  },

  examples: [
    [
      { name: '{{user}}', content: { text: 'show my drift account' } },
      { name: '{{agent}}', content: { text: 'Fetching account info...', action: ACTION_NAMES.DRIFT_ACCOUNT_INFO } },
    ],
    [
      { name: '{{user}}', content: { text: "what's my drift margin" } },
      { name: '{{agent}}', content: { text: 'Checking Drift account...', action: ACTION_NAMES.DRIFT_ACCOUNT_INFO } },
    ],
  ],
};

/**
 * Deposit to Drift
 */
export const driftDeposit: Action = {
  name: ACTION_NAMES.DRIFT_DEPOSIT,
  similes: ['DEPOSIT_TO_DRIFT', 'ADD_DRIFT_MARGIN', 'FUND_DRIFT'],
  description: 'Deposit USDC to Drift as collateral',

  parameters: {
    amount: {
      type: 'number',
      description: 'Amount of USDC to deposit',
      required: true,
    },
  },

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    try {
      const service = runtime.getService(SERVICE_NAME) as DriftService;
      return !!service;
    } catch {
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
      const service = runtime.getService(SERVICE_NAME) as DriftService;

      if (!service) {
        throw new Error('DriftService not initialized');
      }

      const userId = extractUserId(message);
      const params = await extractActionParams(runtime, message);

      const amount = params?.amount ? Number(params.amount) : undefined;

      if (!amount || amount <= 0) {
        throw new Error('Deposit amount is required and must be positive');
      }

      const result = await service.deposit(userId, amount);

      if (!result.success) {
        throw new Error(result.error);
      }

      const text = `Deposited $${amount} USDC to Drift. Tx: ${result.txSignature}`;

      callback?.({ text, content: result });

      return {
        text,
        success: true,
        data: result,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorText = `Failed to deposit to Drift: ${errorMsg}`;
      callback?.({ text: errorText, content: null });
      return { text: errorText, success: false, error: errorMsg };
    }
  },

  examples: [
    [
      { name: '{{user}}', content: { text: 'deposit $100 to drift' } },
      { name: '{{agent}}', content: { text: 'Depositing USDC to Drift...', action: ACTION_NAMES.DRIFT_DEPOSIT } },
    ],
  ],
};
