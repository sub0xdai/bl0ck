/**
 * Drift Action Factory
 *
 * Creates action handlers using factory pattern to eliminate duplication.
 * Follows the same pattern as Hyperliquid plugin for consistency.
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
import { ACTION_NAMES, SERVICE_NAME, SERVICE_CONFIG } from '../constants';
import type { OrderType, PositionSide } from '../types';
import { formatPositionResult, formatCloseResult } from './formatters';

/**
 * Extract user ID from message with proper null checking
 */
export function extractUserId(message: Memory): string {
  const userId = message.entityId;
  if (!userId) {
    throw new Error('User ID is required');
  }
  return userId as string;
}

/**
 * Extract action parameters from composed state
 */
export async function extractActionParams(
  runtime: IAgentRuntime,
  message: Memory
): Promise<Record<string, unknown>> {
  const composedState = await runtime.composeState(message, ['ACTION_STATE'], true);
  return composedState?.data?.actionParams || {};
}

/**
 * Configuration for open position action
 */
interface OpenPositionConfig {
  side: PositionSide;
  actionName: string;
  similes: string[];
  description: string;
}

/**
 * Create an open position action (long or short)
 */
export function createOpenPositionAction(config: OpenPositionConfig): Action {
  const { side, actionName, similes, description } = config;

  return {
    name: actionName,
    similes,
    description,

    parameters: {
      symbol: {
        type: 'string',
        description: 'Trading pair symbol (e.g., SOL, BTC, ETH, WIF, JUP)',
        required: true,
      },
      size: {
        type: 'number',
        description: 'Position size in USD value',
        required: true,
      },
      leverage: {
        type: 'number',
        description: `Leverage multiplier (1-${SERVICE_CONFIG.MAX_LEVERAGE}x, default: 1)`,
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
        const service = runtime.getService(SERVICE_NAME) as DriftService;
        return !!service;
      } catch (error) {
        logger.warn(
          `[${actionName}] Validation failed:`,
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
        logger.info(`[${actionName}] Processing ${side} position request`);

        const service = runtime.getService(SERVICE_NAME) as DriftService;

        if (!service) {
          throw new Error('DriftService not initialized');
        }

        const userId = extractUserId(message);
        const params = await extractActionParams(runtime, message);

        const symbol = (params?.symbol as string)?.trim()?.toUpperCase();
        const size = params?.size ? Number(params.size) : undefined;
        const leverage = params?.leverage ? Number(params.leverage) : SERVICE_CONFIG.DEFAULT_LEVERAGE;
        const orderType = ((params?.orderType as string) || 'market').toLowerCase() as OrderType;
        const limitPrice = params?.limitPrice ? Number(params.limitPrice) : undefined;

        // Validate required parameters
        if (!symbol) {
          throw new Error('Symbol is required (e.g., SOL, BTC, ETH, WIF)');
        }

        if (!size || size <= 0) {
          throw new Error('Position size is required and must be positive');
        }

        // Validate limit price for limit orders
        if (orderType === 'limit' && !limitPrice) {
          throw new Error('Limit price is required for limit orders');
        }

        // Check if high-risk leverage
        const isHighRisk = service.requiresHighRiskConfirmation(leverage);

        // Validate via service (single source of truth for business rules)
        const validation = service.validatePositionParams({
          userId,
          symbol,
          side,
          size,
          leverage,
          orderType,
          limitPrice,
        });

        if (!validation.valid) {
          throw new Error(validation.errors.join(', '));
        }

        logger.info(
          `[${actionName}] Opening ${symbol} ${side}: $${size} @ ${leverage}x (${orderType})`
        );

        // Execute position opening
        const result = await service.openPosition({
          userId,
          symbol,
          side,
          size,
          leverage,
          orderType,
          limitPrice,
        });

        if (!result.success) {
          throw new Error(result.error || result.message);
        }

        const text = formatPositionResult(result, symbol, side, leverage, isHighRisk);

        callback?.({ text, content: result });

        return {
          text,
          success: true,
          data: result,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`[${actionName}] Failed:`, errorMsg);

        const errorText = `Failed to open ${side} position: ${errorMsg}`;

        callback?.({ text: errorText, content: null });

        return {
          text: errorText,
          success: false,
          error: errorMsg,
        };
      }
    },

    examples: side === 'long'
      ? [
          [
            { name: '{{user}}', content: { text: 'open a $1000 long on SOL with 5x leverage' } },
            { name: '{{agent}}', content: { text: 'Opening SOL long position with 5x leverage...', action: actionName } },
          ],
          [
            { name: '{{user}}', content: { text: 'long BTC $500' } },
            { name: '{{agent}}', content: { text: 'Opening BTC long position...', action: actionName } },
          ],
          [
            { name: '{{user}}', content: { text: 'go long WIF at 2.5 with limit order, $2000, 3x' } },
            { name: '{{agent}}', content: { text: 'Placing limit long order for WIF at $2.50...', action: actionName } },
          ],
        ]
      : [
          [
            { name: '{{user}}', content: { text: 'open a $1000 short on SOL with 5x leverage' } },
            { name: '{{agent}}', content: { text: 'Opening SOL short position with 5x leverage...', action: actionName } },
          ],
          [
            { name: '{{user}}', content: { text: 'short ETH $500' } },
            { name: '{{agent}}', content: { text: 'Opening ETH short position...', action: actionName } },
          ],
          [
            { name: '{{user}}', content: { text: 'short JUP at 1.2 with limit order, $2000, 3x' } },
            { name: '{{agent}}', content: { text: 'Placing limit short order for JUP at $1.20...', action: actionName } },
          ],
        ],
  };
}

/**
 * Create close position action
 */
export function createClosePositionAction(): Action {
  return {
    name: ACTION_NAMES.DRIFT_CLOSE_POSITION,
    similes: ['DRIFT_CLOSE', 'CLOSE_DRIFT_POSITION', 'CLOSE_SOLANA_PERP'],
    description: 'Close a perpetual position on Drift Protocol (Solana)',

    parameters: {
      symbol: {
        type: 'string',
        description: 'Trading pair symbol to close (e.g., SOL, BTC, ETH)',
        required: true,
      },
      percentage: {
        type: 'number',
        description: 'Percentage to close (1-100, default: 100)',
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

        const symbol = (params?.symbol as string)?.trim()?.toUpperCase();
        const percentage = params?.percentage ? Number(params.percentage) : 100;
        const orderType = ((params?.orderType as string) || 'market').toLowerCase() as OrderType;
        const limitPrice = params?.limitPrice ? Number(params.limitPrice) : undefined;

        if (!symbol) {
          throw new Error('Symbol is required');
        }

        // Validate via service
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
        logger.error(`[DRIFT_CLOSE_POSITION] Failed:`, errorMsg);

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
        { name: '{{user}}', content: { text: 'close my SOL position' } },
        { name: '{{agent}}', content: { text: 'Closing SOL position...', action: ACTION_NAMES.DRIFT_CLOSE_POSITION } },
      ],
      [
        { name: '{{user}}', content: { text: 'close 50% of my BTC short' } },
        { name: '{{agent}}', content: { text: 'Closing 50% of BTC position...', action: ACTION_NAMES.DRIFT_CLOSE_POSITION } },
      ],
    ],
  };
}
