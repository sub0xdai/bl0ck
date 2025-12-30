/**
 * Circuit Breaker Tests (TDD)
 *
 * Tests for the circuit breaker utility that prevents trading
 * when drawdown exceeds a threshold.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { CircuitBreaker, AsyncMutex } from '../src/utils/circuit-breaker';
import { TradingErrorCode, isTradingError } from '../src/types';

describe('AsyncMutex', () => {
    let mutex: AsyncMutex;

    beforeEach(() => {
        mutex = new AsyncMutex();
    });

    it('should allow immediate acquisition when unlocked', async () => {
        const release = await mutex.acquire();
        expect(typeof release).toBe('function');
        release();
    });

    it('should block second acquisition until first is released', async () => {
        const order: number[] = [];

        const release1 = await mutex.acquire();
        order.push(1);

        // Start second acquisition (will block)
        const acquire2Promise = mutex.acquire().then((release) => {
            order.push(2);
            release();
        });

        // Give time for acquire2 to queue
        await new Promise((r) => setTimeout(r, 10));
        order.push(3);

        // Release first lock
        release1();

        // Wait for second acquisition to complete
        await acquire2Promise;

        // Order should be: 1 (first acquired), 3 (after blocking), 2 (second acquired)
        expect(order).toEqual([1, 3, 2]);
    });

    it('should execute withLock function and release', async () => {
        let executed = false;

        await mutex.withLock(async () => {
            executed = true;
        });

        expect(executed).toBe(true);

        // Should be able to acquire again after withLock completes
        const release = await mutex.acquire();
        release();
    });

    it('should release lock even if function throws', async () => {
        try {
            await mutex.withLock(async () => {
                throw new Error('Test error');
            });
        } catch {
            // Expected
        }

        // Should be able to acquire again
        const release = await mutex.acquire();
        expect(typeof release).toBe('function');
        release();
    });
});

describe('CircuitBreaker', () => {
    const STARTING_EQUITY = 10000;
    let breaker: CircuitBreaker;

    beforeEach(() => {
        breaker = new CircuitBreaker(STARTING_EQUITY, { thresholdPct: 10 });
    });

    describe('Initial State', () => {
        it('should not be tripped initially', () => {
            expect(breaker.isTripped()).toBe(false);
        });

        it('should have zero drawdown initially', () => {
            expect(breaker.getDrawdownPct()).toBe(0);
        });

        it('should allow trading when not tripped', () => {
            expect(breaker.canTrade()).toBe(true);
        });

        it('should have correct initial state', () => {
            const state = breaker.getState();
            expect(state.tripped).toBe(false);
            expect(state.sessionPnL).toBe(0);
            expect(state.startingEquity).toBe(STARTING_EQUITY);
        });

        it('should have full remaining capacity initially', () => {
            // 10% of 10000 = 1000
            expect(breaker.getRemainingCapacity()).toBe(1000);
        });
    });

    describe('PnL Tracking', () => {
        it('should track positive PnL', async () => {
            await breaker.updatePnL(500);
            expect(breaker.getState().sessionPnL).toBe(500);
        });

        it('should track negative PnL', async () => {
            await breaker.updatePnL(-500);
            expect(breaker.getState().sessionPnL).toBe(-500);
        });

        it('should accumulate multiple PnL updates', async () => {
            await breaker.updatePnL(100);
            await breaker.updatePnL(-200);
            await breaker.updatePnL(50);
            expect(breaker.getState().sessionPnL).toBe(-50);
        });

        it('should calculate drawdown percentage correctly', async () => {
            await breaker.updatePnL(-500);
            // 500 / 10000 = 5%
            expect(breaker.getDrawdownPct()).toBe(5);
        });

        it('should not count positive PnL as drawdown', async () => {
            await breaker.updatePnL(500);
            expect(breaker.getDrawdownPct()).toBe(0);
        });
    });

    describe('Trip Threshold', () => {
        it('should trip when drawdown reaches threshold', async () => {
            // 10% of 10000 = 1000
            await breaker.updatePnL(-1000);
            expect(breaker.isTripped()).toBe(true);
        });

        it('should trip when drawdown exceeds threshold', async () => {
            await breaker.updatePnL(-1500);
            expect(breaker.isTripped()).toBe(true);
        });

        it('should not trip below threshold', async () => {
            await breaker.updatePnL(-999);
            expect(breaker.isTripped()).toBe(false);
        });

        it('should record trip timestamp', async () => {
            const before = Date.now();
            await breaker.updatePnL(-1000);
            const after = Date.now();

            const state = breaker.getState();
            expect(state.trippedAt).toBeDefined();
            expect(state.trippedAt).toBeGreaterThanOrEqual(before);
            expect(state.trippedAt).toBeLessThanOrEqual(after);
        });

        it('should call onTrip callback when tripping', async () => {
            let callbackDrawdown: number | null = null;
            const breakerWithCallback = new CircuitBreaker(STARTING_EQUITY, {
                thresholdPct: 10,
                onTrip: (drawdownPct) => {
                    callbackDrawdown = drawdownPct;
                },
            });

            await breakerWithCallback.updatePnL(-1000);
            expect(callbackDrawdown).toBe(10);
        });
    });

    describe('Trade Blocking', () => {
        it('should block trades when tripped', async () => {
            await breaker.updatePnL(-1000); // Trip the breaker

            try {
                await breaker.checkAndExecute(async () => ({
                    result: 'trade',
                    realizedPnL: 0,
                }));
                expect(true).toBe(false); // Should not reach here
            } catch (error) {
                expect(isTradingError(error)).toBe(true);
                if (isTradingError(error)) {
                    expect(error.code).toBe(TradingErrorCode.CIRCUIT_BREAKER_ACTIVE);
                }
            }
        });

        it('should allow trades when not tripped', async () => {
            const result = await breaker.checkAndExecute(async () => ({
                result: 'success',
                realizedPnL: 100,
            }));
            expect(result).toBe('success');
        });

        it('should update PnL after successful trade', async () => {
            await breaker.checkAndExecute(async () => ({
                result: 'success',
                realizedPnL: -500,
            }));
            expect(breaker.getState().sessionPnL).toBe(-500);
        });

        it('should trip during trade if PnL exceeds threshold', async () => {
            await breaker.checkAndExecute(async () => ({
                result: 'success',
                realizedPnL: -1000,
            }));
            expect(breaker.isTripped()).toBe(true);
        });
    });

    describe('Mutex Protection (Race Condition Prevention)', () => {
        it('should serialize concurrent checkAndExecute calls', async () => {
            const order: number[] = [];

            // Start two trades concurrently
            const trade1 = breaker.checkAndExecute(async () => {
                await new Promise((r) => setTimeout(r, 50));
                order.push(1);
                return { result: 'trade1', realizedPnL: 0 };
            });

            const trade2 = breaker.checkAndExecute(async () => {
                order.push(2);
                return { result: 'trade2', realizedPnL: 0 };
            });

            await Promise.all([trade1, trade2]);

            // Trade 1 should complete before trade 2 starts
            expect(order).toEqual([1, 2]);
        });

        it('should prevent trade slipping through during trip check', async () => {
            // Start with PnL just below threshold
            await breaker.updatePnL(-900);

            // Two trades that together would exceed threshold
            const trade1 = breaker.checkAndExecute(async () => ({
                result: 'trade1',
                realizedPnL: -150, // Would trip
            }));

            const trade2 = breaker.checkAndExecute(async () => ({
                result: 'trade2',
                realizedPnL: 0,
            }));

            const results = await Promise.allSettled([trade1, trade2]);

            // First trade succeeds, second should be blocked
            expect(results[0].status).toBe('fulfilled');
            expect(results[1].status).toBe('rejected');
        });
    });

    describe('Reset', () => {
        it('should reset tripped state', async () => {
            await breaker.updatePnL(-1000); // Trip
            expect(breaker.isTripped()).toBe(true);

            await breaker.reset(STARTING_EQUITY);
            expect(breaker.isTripped()).toBe(false);
        });

        it('should reset session PnL', async () => {
            await breaker.updatePnL(-500);
            await breaker.reset(STARTING_EQUITY);
            expect(breaker.getState().sessionPnL).toBe(0);
        });

        it('should update starting equity', async () => {
            await breaker.reset(15000);
            expect(breaker.getState().startingEquity).toBe(15000);
        });

        it('should allow trading after reset', async () => {
            await breaker.updatePnL(-1000); // Trip
            await breaker.reset(STARTING_EQUITY);

            const result = await breaker.checkAndExecute(async () => ({
                result: 'success',
                realizedPnL: 0,
            }));
            expect(result).toBe('success');
        });
    });

    describe('State Restoration', () => {
        it('should restore tripped state', () => {
            breaker.restoreState({ tripped: true, trippedAt: 12345 });
            expect(breaker.isTripped()).toBe(true);
            expect(breaker.getState().trippedAt).toBe(12345);
        });

        it('should restore session PnL', () => {
            breaker.restoreState({ sessionPnL: -500 });
            expect(breaker.getState().sessionPnL).toBe(-500);
        });

        it('should restore starting equity', () => {
            breaker.restoreState({ startingEquity: 20000 });
            expect(breaker.getState().startingEquity).toBe(20000);
        });
    });

    describe('Remaining Capacity', () => {
        it('should decrease remaining capacity as losses accumulate', async () => {
            await breaker.updatePnL(-500);
            // 1000 - 500 = 500
            expect(breaker.getRemainingCapacity()).toBe(500);
        });

        it('should return zero when at or beyond threshold', async () => {
            await breaker.updatePnL(-1500);
            expect(breaker.getRemainingCapacity()).toBe(0);
        });

        it('should not be affected by positive PnL', async () => {
            await breaker.updatePnL(500);
            // Still 10% of 10000 = 1000
            expect(breaker.getRemainingCapacity()).toBe(1000);
        });
    });
});
