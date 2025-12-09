/**
 * Drift Action Factory
 *
 * Creates action handlers using factory pattern to eliminate duplication.
 * Adapted from Hyperliquid plugin for Drift-specific logic.
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
import { ACTION_NAMES, SERVICE_NAME, CONFIG } from '../constants';
import type { OrderType, PositionSide } from '../types';
import { formatPositionResult } from './formatters';

/**
 * Extract user ID from message with proper metadata lookup
 * Uses entity.metadata.author_id for JWT-authenticated users
 */
export async function extractUserId(runtime: IAgentRuntime, message: Memory): Promise<string> {
  const entity = await runtime.getEntityById(message.entityId);
  const userId = entity?.metadata?.author_id;

  if (userId) {
    return userId as string;
  }

  // Fallback to entityId if metadata is missing (e.g. non-authenticated local testing)
  if (message.entityId) {
    return message.entityId;
  }

  throw new Error('User ID is required');
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
      marketSymbol: {
        type: 'string',
        description: 'Drift market symbol (e.g., SOL-PERP, BTC-PERP, ETH-PERP)',
        required: true,
      },
      size: {
        type: 'number',
        description: 'Position size in USD value',
        required: true,
      },
      leverage: {
        type: 'number',
        description: 'Leverage multiplier (1-20x, default: 1)',
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
      const handlerStart = Date.now();
      try {
        logger.info(`[${actionName}] === HANDLER START === Processing ${side} position request`);

        const service = runtime.getService(SERVICE_NAME) as DriftService;

        if (!service) {
          throw new Error('Drift service not initialized');
        }

        logger.info(`[${actionName}] [T+${Date.now() - handlerStart}ms] Extracting userId...`);
        const userId = await extractUserId(runtime, message);
        logger.info(`[${actionName}] [T+${Date.now() - handlerStart}ms] Extracting params...`);
        const params = await extractActionParams(runtime, message);
        logger.info(`[${actionName}] [T+${Date.now() - handlerStart}ms] Params extracted`);

        const marketSymbol = (params?.marketSymbol as string)?.trim()?.toUpperCase();
        const size = params?.size ? Number(params.size) : undefined;
        const leverage = params?.leverage ? Number(params.leverage) : CONFIG.DEFAULT_LEVERAGE;
        const orderType = ((params?.orderType as string) || 'market').toLowerCase() as OrderType;
        const limitPrice = params?.limitPrice ? Number(params.limitPrice) : undefined;

        // Validate required parameters
        if (!marketSymbol) {
          throw new Error('Market symbol is required (e.g., SOL-PERP, BTC-PERP, ETH-PERP)');
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
          marketSymbol,
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
          `[${actionName}] [T+${Date.now() - handlerStart}ms] Opening ${marketSymbol} ${side}: $${size} @ ${leverage}x (${orderType})`
        );

        // Execute position opening
        const result = await service.openPosition(userId, {
          marketSymbol,
          side,
          size,
          leverage,
          orderType,
          limitPrice,
        });
        logger.info(`[${actionName}] [T+${Date.now() - handlerStart}ms] openPosition returned`);

        if (!result.success) {
          throw new Error(result.error || 'Failed to open position');
        }

        const text = formatPositionResult(result, marketSymbol, side, leverage, isHighRisk);
        logger.info(`[${actionName}] === HANDLER COMPLETE === Total: ${Date.now() - handlerStart}ms`);

        callback?.({ text, content: result });

        return {
          text,
          success: true,
          data: result,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`[${actionName}] [T+${Date.now() - handlerStart}ms] Failed:`, errorMsg);

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
          { name: '{{user}}', content: { text: 'open a $1000 long on SOL-PERP with 5x leverage' } },
          { name: '{{agent}}', content: { text: 'Opening SOL-PERP long position with 5x leverage...', action: actionName } },
        ],
        [
          { name: '{{user}}', content: { text: 'long BTC-PERP $500' } },
          { name: '{{agent}}', content: { text: 'Opening BTC-PERP long position...', action: actionName } },
        ],
        [
          { name: '{{user}}', content: { text: 'go long ETH-PERP at 3500 with limit order, $2000, 3x' } },
          { name: '{{agent}}', content: { text: 'Placing limit long order for ETH-PERP at $3500...', action: actionName } },
        ],
      ]
      : [
        [
          { name: '{{user}}', content: { text: 'open a $1000 short on SOL-PERP with 5x leverage' } },
          { name: '{{agent}}', content: { text: 'Opening SOL-PERP short position with 5x leverage...', action: actionName } },
        ],
        [
          { name: '{{user}}', content: { text: 'short BTC-PERP $500' } },
          { name: '{{agent}}', content: { text: 'Opening BTC-PERP short position...', action: actionName } },
        ],
        [
          { name: '{{user}}', content: { text: 'short ETH-PERP at 3200 with limit order, $2000, 3x' } },
          { name: '{{agent}}', content: { text: 'Placing limit short order for ETH-PERP at $3200...', action: actionName } },
        ],
      ],
  };
}
