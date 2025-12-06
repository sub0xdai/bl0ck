/**
 * Phase 4: Actions Layer Tests
 * Validates action structure and integration with service layer
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import type { IAgentRuntime, Memory } from '@elizaos/core';
import { DriftService } from '../src/services/drift.service';
import { ACTION_NAMES } from '../src/constants';

// Import all actions
import driftOpenLong from '../src/actions/drift-open-long';
import driftOpenShort from '../src/actions/drift-open-short';
import driftClosePosition from '../src/actions/drift-close-position';
import driftGetPositions from '../src/actions/drift-get-positions';
import driftGetMarkets from '../src/actions/drift-get-markets';
import driftAccountInfo from '../src/actions/drift-account-info';
import driftDeposit from '../src/actions/drift-deposit';

// Mock runtime
const mockRuntime: Partial<IAgentRuntime> = {
  getSetting: (key: string) => {
    if (key === 'SOLANA_NETWORK') return 'devnet';
    return undefined;
  },
  getService: (name: string) => {
    return mockDriftService as any;
  },
  composeState: async () => ({
    data: {
      actionParams: {},
    },
  }),
} as any;

// Mock DriftService
const mockDriftService = {
  validatePositionParams: () => ({ valid: true, errors: [] }),
  validateCloseParams: () => ({ valid: true, errors: [] }),
  requiresHighRiskConfirmation: () => false,
  openPosition: async () => ({ success: true, position: null }),
  closePosition: async () => ({ success: true }),
  getPositions: async () => [],
  getMarkets: async () => [],
  getAccountInfo: async () => ({
    authority: 'test-pubkey',
    subAccountId: 0,
    collateral: '1000000',
    freeCollateral: '500000',
    totalPositionValue: '0',
    unrealizedPnl: '0',
    marginRatio: '0',
    leverage: 1,
  }),
  deposit: async () => ({ success: true, amount: 100 }),
};

const mockMessage: Memory = {
  entityId: 'test-user',
  roomId: 'test-room',
  userId: 'test-user',
  content: { text: 'test' },
} as any;

describe('Phase 4: Actions Layer', () => {
  describe('Action Structure Validation', () => {
    test('driftOpenLong has correct structure', () => {
      expect(driftOpenLong.name).toBe(ACTION_NAMES.DRIFT_OPEN_LONG);
      expect(driftOpenLong.description).toBeDefined();
      expect(driftOpenLong.similes).toBeInstanceOf(Array);
      expect(driftOpenLong.parameters).toBeDefined();
      expect(driftOpenLong.validate).toBeInstanceOf(Function);
      expect(driftOpenLong.handler).toBeInstanceOf(Function);
      expect(driftOpenLong.examples).toBeInstanceOf(Array);
    });

    test('driftOpenShort has correct structure', () => {
      expect(driftOpenShort.name).toBe(ACTION_NAMES.DRIFT_OPEN_SHORT);
      expect(driftOpenShort.description).toBeDefined();
      expect(driftOpenShort.similes).toBeInstanceOf(Array);
    });

    test('driftClosePosition has correct structure', () => {
      expect(driftClosePosition.name).toBe(ACTION_NAMES.DRIFT_CLOSE_POSITION);
      expect(driftClosePosition.description).toBeDefined();
      expect(driftClosePosition.parameters).toBeDefined();
    });

    test('driftGetPositions has correct structure', () => {
      expect(driftGetPositions.name).toBe(ACTION_NAMES.DRIFT_GET_POSITIONS);
      expect(driftGetPositions.similes).toContain('POSITIONS');
    });

    test('driftGetMarkets has correct structure', () => {
      expect(driftGetMarkets.name).toBe(ACTION_NAMES.DRIFT_GET_MARKETS);
      expect(driftGetMarkets.similes).toContain('MARKETS');
    });

    test('driftAccountInfo has correct structure', () => {
      expect(driftAccountInfo.name).toBe(ACTION_NAMES.DRIFT_ACCOUNT_INFO);
      expect(driftAccountInfo.similes).toContain('ACCOUNT');
    });

    test('driftDeposit has correct structure', () => {
      expect(driftDeposit.name).toBe(ACTION_NAMES.DRIFT_DEPOSIT);
      expect(driftDeposit.similes).toContain('DEPOSIT');
    });
  });

  describe('Action Validation', () => {
    test('actions validate when service is available', async () => {
      const isValid = await driftOpenLong.validate(mockRuntime as IAgentRuntime, mockMessage);
      expect(isValid).toBe(true);
    });

    test('actions fail validation when service is missing', async () => {
      const runtimeNoService: Partial<IAgentRuntime> = {
        getService: () => null,
      } as any;

      const isValid = await driftOpenLong.validate(runtimeNoService as IAgentRuntime, mockMessage);
      expect(isValid).toBe(false);
    });
  });

  describe('Action Handler Execution', () => {
    test('driftGetMarkets handler executes successfully', async () => {
      const result = await driftGetMarkets.handler(
        mockRuntime as IAgentRuntime,
        mockMessage
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.text).toBeDefined();
    });

    test('driftAccountInfo handler executes successfully', async () => {
      const result = await driftAccountInfo.handler(
        mockRuntime as IAgentRuntime,
        mockMessage
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.text).toContain('Drift Account');
    });

    test('driftGetPositions handler executes successfully', async () => {
      const result = await driftGetPositions.handler(
        mockRuntime as IAgentRuntime,
        mockMessage
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.text).toContain('No open positions');
    });
  });

  describe('Parameter Extraction', () => {
    test('actions extract userId from message', async () => {
      // Indirectly verify through handler execution
      const result = await driftGetMarkets.handler(
        mockRuntime as IAgentRuntime,
        mockMessage
      );

      expect(result.success).toBe(true);
    });

    test('actions handle missing userId gracefully', async () => {
      const messageNoUser: Memory = {
        entityId: undefined,
        roomId: 'test-room',
        userId: undefined,
        content: { text: 'test' },
      } as any;

      const result = await driftGetMarkets.handler(
        mockRuntime as IAgentRuntime,
        messageNoUser
      );

      // Should fail gracefully (no crash)
      expect(result).toBeDefined();
    });
  });

  describe('Similes Coverage', () => {
    test('long/short actions have relevant similes', () => {
      expect(driftOpenLong.similes).toContain('LONG');
      expect(driftOpenLong.similes).toContain('GO LONG');
      expect(driftOpenShort.similes).toContain('SHORT');
      expect(driftOpenShort.similes).toContain('GO SHORT');
    });

    test('query actions have relevant similes', () => {
      expect(driftGetPositions.similes).toContain('MY POSITIONS');
      expect(driftGetMarkets.similes).toContain('LIST MARKETS');
      expect(driftAccountInfo.similes).toContain('BALANCE');
    });

    test('deposit action has relevant similes', () => {
      expect(driftDeposit.similes).toContain('ADD COLLATERAL');
      expect(driftDeposit.similes).toContain('DEPOSIT USDC');
    });
  });

  describe('Examples Coverage', () => {
    test('all actions have examples', () => {
      expect(driftOpenLong.examples).toBeDefined();
      expect(driftOpenLong.examples!.length).toBeGreaterThan(0);
      expect(driftOpenShort.examples).toBeDefined();
      expect(driftOpenShort.examples!.length).toBeGreaterThan(0);
      expect(driftClosePosition.examples).toBeDefined();
      expect(driftGetPositions.examples).toBeDefined();
      expect(driftGetMarkets.examples).toBeDefined();
      expect(driftAccountInfo.examples).toBeDefined();
      expect(driftDeposit.examples).toBeDefined();
    });

    test('examples have correct structure', () => {
      const example = driftOpenLong.examples![0];
      expect(example).toBeInstanceOf(Array);
      expect(example.length).toBe(2); // User + Agent
      expect(example[0].name).toBe('{{user}}');
      expect(example[1].name).toBe('{{agent}}');
      expect(example[1].content.action).toBe(ACTION_NAMES.DRIFT_OPEN_LONG);
    });
  });
});
