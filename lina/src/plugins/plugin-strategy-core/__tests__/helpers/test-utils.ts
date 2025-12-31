/**
 * Test Utilities for Strategy-Core Integration Tests
 *
 * Provides factories for creating test signals, configs, and states,
 * plus async helpers for timing-sensitive tests.
 */
import {
    type Signal,
    type AutomationConfig,
    type AutomationState,
    DEFAULT_AUTOMATION_CONFIG,
    createInitialState,
} from '../../src/types';

// =========================================================================
// Signal Factories
// =========================================================================

/**
 * Create a test signal with defaults
 */
export function createTestSignal(
    asset: string,
    direction: 'LONG' | 'SHORT' | 'NEUTRAL',
    confidence: number = 0.8
): Signal {
    return {
        asset,
        direction,
        confidence,
        sources: [
            { source: 'test-source', confidence, data: {} },
        ],
        timestamp: Date.now(),
    };
}

/**
 * Create a LONG signal
 */
export function createLongSignal(asset: string, confidence: number = 0.8): Signal {
    return createTestSignal(asset, 'LONG', confidence);
}

/**
 * Create a SHORT signal
 */
export function createShortSignal(asset: string, confidence: number = 0.8): Signal {
    return createTestSignal(asset, 'SHORT', confidence);
}

/**
 * Create a NEUTRAL signal (no trade)
 */
export function createNeutralSignal(asset: string): Signal {
    return createTestSignal(asset, 'NEUTRAL', 0.5);
}

/**
 * Create multiple signals for different assets
 */
export function createSignalsForAssets(
    assets: string[],
    direction: 'LONG' | 'SHORT' | 'NEUTRAL' = 'LONG',
    confidence: number = 0.8
): Signal[] {
    return assets.map(asset => createTestSignal(asset, direction, confidence));
}

// =========================================================================
// Config Factories
// =========================================================================

/**
 * Create a test automation config with overrides
 */
export function createTestConfig(overrides: Partial<AutomationConfig> = {}): AutomationConfig {
    return {
        ...DEFAULT_AUTOMATION_CONFIG,
        enabled: true,
        assets: ['SOL-PERP', 'BTC-PERP', 'ETH-PERP'],
        ...overrides,
    };
}

/**
 * Create a config with stop-loss enabled
 */
export function createConfigWithStopLoss(
    stopLossPct: number,
    overrides: Partial<AutomationConfig> = {}
): AutomationConfig {
    return createTestConfig({
        stopLossPct,
        ...overrides,
    });
}

/**
 * Create a config with take-profit enabled
 */
export function createConfigWithTakeProfit(
    takeProfitPct: number,
    overrides: Partial<AutomationConfig> = {}
): AutomationConfig {
    return createTestConfig({
        takeProfitPct,
        ...overrides,
    });
}

/**
 * Create a config with max hold time enabled
 */
export function createConfigWithMaxHoldTime(
    maxHoldMinutes: number,
    overrides: Partial<AutomationConfig> = {}
): AutomationConfig {
    return createTestConfig({
        maxHoldMinutes,
        ...overrides,
    });
}

/**
 * Create a config with all exit conditions
 */
export function createConfigWithAllExits(
    stopLossPct: number,
    takeProfitPct: number,
    maxHoldMinutes: number,
    overrides: Partial<AutomationConfig> = {}
): AutomationConfig {
    return createTestConfig({
        stopLossPct,
        takeProfitPct,
        maxHoldMinutes,
        ...overrides,
    });
}

/**
 * Create a conservative config (low risk)
 */
export function createConservativeConfig(overrides: Partial<AutomationConfig> = {}): AutomationConfig {
    return createTestConfig({
        maxPositionPct: 2,
        maxExposurePct: 10,
        maxLeverage: 2,
        circuitBreakerPct: 5,
        stopLossPct: 3,
        takeProfitPct: 5,
        ...overrides,
    });
}

/**
 * Create an aggressive config (high risk)
 */
export function createAggressiveConfig(overrides: Partial<AutomationConfig> = {}): AutomationConfig {
    return createTestConfig({
        maxPositionPct: 10,
        maxExposurePct: 50,
        maxLeverage: 10,
        allowShorts: true,
        circuitBreakerPct: 20,
        stopLossPct: 10,
        takeProfitPct: 25,
        ...overrides,
    });
}

// =========================================================================
// State Factories
// =========================================================================

/**
 * Create a test automation state
 */
export function createTestState(
    userId: string,
    configOverrides: Partial<AutomationConfig> = {}
): AutomationState {
    return createInitialState(userId, {
        enabled: true,
        ...configOverrides,
    });
}

/**
 * Create a state with position open times set
 */
export function createStateWithPositions(
    userId: string,
    positionTimes: Record<string, number>,
    configOverrides: Partial<AutomationConfig> = {}
): AutomationState {
    const state = createTestState(userId, configOverrides);
    state.positionOpenTimes = { ...positionTimes };
    return state;
}

/**
 * Create a state with circuit breaker tripped
 */
export function createTrippedState(
    userId: string,
    sessionPnL: number = -1000,
    configOverrides: Partial<AutomationConfig> = {}
): AutomationState {
    const state = createTestState(userId, configOverrides);
    state.circuitBreakerTripped = true;
    state.circuitBreakerTrippedAt = Date.now();
    state.sessionPnL = sessionPnL;
    return state;
}

// =========================================================================
// Async Helpers
// =========================================================================

/**
 * Wait for a specified number of milliseconds
 */
export function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for a condition to become true
 */
export async function waitForCondition(
    condition: () => boolean | Promise<boolean>,
    options: {
        timeoutMs?: number;
        intervalMs?: number;
        message?: string;
    } = {}
): Promise<void> {
    const {
        timeoutMs = 5000,
        intervalMs = 50,
        message = 'Condition timeout',
    } = options;

    const startTime = Date.now();

    while (true) {
        const result = await condition();
        if (result) return;

        if (Date.now() - startTime > timeoutMs) {
            throw new Error(message);
        }

        await wait(intervalMs);
    }
}

/**
 * Wait for a mock function to be called
 */
export async function waitForMockCall(
    mockFn: { mock: { calls: any[] } },
    options: {
        timeoutMs?: number;
        minCalls?: number;
    } = {}
): Promise<void> {
    const { timeoutMs = 5000, minCalls = 1 } = options;

    await waitForCondition(
        () => mockFn.mock.calls.length >= minCalls,
        {
            timeoutMs,
            message: `Expected mock to be called at least ${minCalls} times, but was called ${mockFn.mock.calls.length} times`,
        }
    );
}

/**
 * Wait for a mock function to be called with specific arguments
 */
export async function waitForMockCallWith(
    mockFn: { mock: { calls: any[][] } },
    predicate: (args: any[]) => boolean,
    options: { timeoutMs?: number } = {}
): Promise<any[]> {
    const { timeoutMs = 5000 } = options;

    await waitForCondition(
        () => mockFn.mock.calls.some(predicate),
        {
            timeoutMs,
            message: 'Expected mock to be called with matching arguments',
        }
    );

    return mockFn.mock.calls.find(predicate)!;
}

// =========================================================================
// Assertion Helpers
// =========================================================================

/**
 * Assert that a position was opened with expected parameters
 */
export function assertPositionOpened(
    mockDriftService: { openPosition: { mock: { calls: any[][] } } },
    expectedUserId: string,
    expectedAsset: string,
    expectedSide: 'long' | 'short'
): void {
    const calls = mockDriftService.openPosition.mock.calls;
    const matchingCall = calls.find(([userId, params]) =>
        userId === expectedUserId &&
        params.marketSymbol === expectedAsset &&
        params.side === expectedSide
    );

    if (!matchingCall) {
        throw new Error(
            `Expected openPosition to be called with userId=${expectedUserId}, ` +
            `asset=${expectedAsset}, side=${expectedSide}. ` +
            `Actual calls: ${JSON.stringify(calls)}`
        );
    }
}

/**
 * Assert that a position was closed
 */
export function assertPositionClosed(
    mockDriftService: { closePosition: { mock: { calls: any[][] } } },
    expectedUserId: string,
    expectedAsset: string
): void {
    const calls = mockDriftService.closePosition.mock.calls;
    const matchingCall = calls.find(([userId, params]) =>
        userId === expectedUserId &&
        params.marketSymbol === expectedAsset
    );

    if (!matchingCall) {
        throw new Error(
            `Expected closePosition to be called with userId=${expectedUserId}, ` +
            `asset=${expectedAsset}. ` +
            `Actual calls: ${JSON.stringify(calls)}`
        );
    }
}

/**
 * Assert no positions were opened
 */
export function assertNoPositionsOpened(
    mockDriftService: { openPosition: { mock: { calls: any[][] } } }
): void {
    if (mockDriftService.openPosition.mock.calls.length > 0) {
        throw new Error(
            `Expected no positions to be opened, but openPosition was called ` +
            `${mockDriftService.openPosition.mock.calls.length} times`
        );
    }
}

/**
 * Assert no positions were closed
 */
export function assertNoPositionsClosed(
    mockDriftService: { closePosition: { mock: { calls: any[][] } } }
): void {
    if (mockDriftService.closePosition.mock.calls.length > 0) {
        throw new Error(
            `Expected no positions to be closed, but closePosition was called ` +
            `${mockDriftService.closePosition.mock.calls.length} times`
        );
    }
}

// =========================================================================
// Test User IDs
// =========================================================================

export const TEST_USER_1 = 'test-user-001';
export const TEST_USER_2 = 'test-user-002';
export const TEST_USER_3 = 'test-user-003';

// =========================================================================
// Test Assets
// =========================================================================

export const TEST_ASSETS = ['SOL-PERP', 'BTC-PERP', 'ETH-PERP'];
export const SOL_PERP = 'SOL-PERP';
export const BTC_PERP = 'BTC-PERP';
export const ETH_PERP = 'ETH-PERP';
