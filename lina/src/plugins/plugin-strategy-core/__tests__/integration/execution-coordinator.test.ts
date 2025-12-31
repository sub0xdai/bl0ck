/**
 * Integration Test: Execution Coordinator Race Prevention
 *
 * Tests that ExecutionCoordinator correctly prevents race conditions
 * between StrategyLoop and PositionMonitor when operating on the same asset.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import {
    ExecutionCoordinator,
    getExecutionCoordinator,
} from '../../src/utils/execution-coordinator';
import { wait } from '../helpers/test-utils';

describe('Integration: Execution Coordinator', () => {
    let coordinator: ExecutionCoordinator;
    const userId = 'test-user-001';
    const asset = 'SOL-PERP';

    beforeEach(() => {
        // Get coordinator instance (singleton)
        // Note: We use resetInstance for clean tests
        ExecutionCoordinator.resetInstance();
        coordinator = getExecutionCoordinator();
    });

    describe('Basic Locking', () => {
        it('should acquire and release locks', async () => {
            expect(coordinator.isLocked(userId, asset)).toBe(false);

            const release = await coordinator.acquireLock(userId, asset, 'open');
            expect(coordinator.isLocked(userId, asset)).toBe(true);

            release();
            expect(coordinator.isLocked(userId, asset)).toBe(false);
        });

        it('should block concurrent operations on same asset', async () => {
            const executionOrder: string[] = [];

            // First operation acquires lock
            const op1 = coordinator.withLock(userId, asset, 'open', async () => {
                executionOrder.push('op1-start');
                await wait(50);
                executionOrder.push('op1-end');
                return 'op1-result';
            });

            // Give op1 time to acquire lock
            await wait(10);

            // Second operation should wait
            const op2 = coordinator.withLock(userId, asset, 'stop_loss', async () => {
                executionOrder.push('op2-start');
                await wait(10);
                executionOrder.push('op2-end');
                return 'op2-result';
            });

            const [result1, result2] = await Promise.all([op1, op2]);

            expect(result1).toBe('op1-result');
            expect(result2).toBe('op2-result');

            // op1 should complete before op2 starts
            expect(executionOrder).toEqual([
                'op1-start',
                'op1-end',
                'op2-start',
                'op2-end',
            ]);
        });

        it('should allow concurrent operations on different assets', async () => {
            const executionOrder: string[] = [];

            const op1 = coordinator.withLock(userId, 'SOL-PERP', 'open', async () => {
                executionOrder.push('sol-start');
                await wait(50);
                executionOrder.push('sol-end');
            });

            // Give op1 time to start
            await wait(10);

            const op2 = coordinator.withLock(userId, 'BTC-PERP', 'open', async () => {
                executionOrder.push('btc-start');
                await wait(20);
                executionOrder.push('btc-end');
            });

            await Promise.all([op1, op2]);

            // Both should start before either ends (parallel execution)
            expect(executionOrder[0]).toBe('sol-start');
            expect(executionOrder[1]).toBe('btc-start');
        });

        it('should allow concurrent operations for different users', async () => {
            const executionOrder: string[] = [];

            const op1 = coordinator.withLock('user-1', asset, 'open', async () => {
                executionOrder.push('user1-start');
                await wait(50);
                executionOrder.push('user1-end');
            });

            await wait(10);

            const op2 = coordinator.withLock('user-2', asset, 'open', async () => {
                executionOrder.push('user2-start');
                await wait(20);
                executionOrder.push('user2-end');
            });

            await Promise.all([op1, op2]);

            // Both should start before either ends (parallel execution)
            expect(executionOrder[0]).toBe('user1-start');
            expect(executionOrder[1]).toBe('user2-start');
        });
    });

    describe('Operation Type Tracking', () => {
        it('should track operation type in lock status', async () => {
            const release = await coordinator.acquireLock(userId, asset, 'flip');

            const status = coordinator.getLockStatus(userId, asset);
            expect(status.locked).toBe(true);
            expect(status.holder).toBe('flip');

            release();
        });

        it('should track lock acquisition time', async () => {
            const before = Date.now();
            const release = await coordinator.acquireLock(userId, asset, 'open');
            const after = Date.now();

            const status = coordinator.getLockStatus(userId, asset);
            expect(status.acquiredAt).toBeGreaterThanOrEqual(before);
            expect(status.acquiredAt).toBeLessThanOrEqual(after);

            release();
        });

        it('should return unlocked status when no lock held', () => {
            const status = coordinator.getLockStatus(userId, asset);
            expect(status.locked).toBe(false);
            expect(status.holder).toBeUndefined();
        });
    });

    describe('Skip If Locked (PositionMonitor Pattern)', () => {
        it('should skip when already locked', async () => {
            let monitorExecuted = false;

            // StrategyLoop holds lock
            const strategyOp = coordinator.withLock(userId, asset, 'flip', async () => {
                await wait(100);
            });

            await wait(10);

            // PositionMonitor checks if locked
            if (!coordinator.isLocked(userId, asset)) {
                monitorExecuted = true;
            }

            await strategyOp;

            expect(monitorExecuted).toBe(false);
        });

        it('should proceed when not locked', () => {
            let monitorExecuted = false;

            // No lock held
            if (!coordinator.isLocked(userId, asset)) {
                monitorExecuted = true;
            }

            expect(monitorExecuted).toBe(true);
        });
    });

    describe('Race Condition Simulation', () => {
        it('should prevent double-close race condition', async () => {
            let closeCount = 0;

            // Simulate both PositionMonitor and StrategyLoop trying to close
            const monitorClose = coordinator.withLock(userId, asset, 'stop_loss', async () => {
                closeCount++;
                await wait(50);
            });

            await wait(5);

            const strategyClose = coordinator.withLock(userId, asset, 'flip', async () => {
                closeCount++;
                await wait(20);
            });

            await Promise.all([monitorClose, strategyClose]);

            // Both should execute, but sequentially (not simultaneously)
            expect(closeCount).toBe(2);
        });

        it('should handle concurrent signal processing', async () => {
            const results: string[] = [];

            // Simulate rapid signal changes for same asset
            const ops = [
                coordinator.withLock(userId, asset, 'open', async () => {
                    results.push('open');
                    await wait(30);
                }),
                coordinator.withLock(userId, asset, 'flip', async () => {
                    results.push('flip');
                    await wait(20);
                }),
                coordinator.withLock(userId, asset, 'stop_loss', async () => {
                    results.push('stop_loss');
                    await wait(10);
                }),
            ];

            await Promise.all(ops);

            // All should execute sequentially
            expect(results).toHaveLength(3);
            expect(results).toContain('open');
            expect(results).toContain('flip');
            expect(results).toContain('stop_loss');
        });
    });

    describe('Error Handling', () => {
        it('should release lock even if operation throws', async () => {
            try {
                await coordinator.withLock(userId, asset, 'open', async () => {
                    throw new Error('Operation failed');
                });
            } catch (e) {
                // Expected
            }

            // Lock should be released
            expect(coordinator.isLocked(userId, asset)).toBe(false);
        });

        it('should allow next operation after error', async () => {
            // First operation throws
            try {
                await coordinator.withLock(userId, asset, 'open', async () => {
                    throw new Error('First failed');
                });
            } catch (e) {
                // Expected
            }

            // Second operation should succeed
            let secondExecuted = false;
            await coordinator.withLock(userId, asset, 'open', async () => {
                secondExecuted = true;
            });

            expect(secondExecuted).toBe(true);
        });
    });

    describe('Lock Key Isolation', () => {
        it('should use userId:asset as lock key', async () => {
            const user1Asset1 = coordinator.withLock('user1', 'SOL-PERP', 'open', async () => {
                await wait(50);
                return 'u1-sol';
            });

            await wait(5);

            const user1Asset2 = coordinator.withLock('user1', 'BTC-PERP', 'open', async () => {
                return 'u1-btc';
            });

            const user2Asset1 = coordinator.withLock('user2', 'SOL-PERP', 'open', async () => {
                return 'u2-sol';
            });

            const results = await Promise.all([user1Asset1, user1Asset2, user2Asset1]);

            // All should complete (different lock keys)
            expect(results).toContain('u1-sol');
            expect(results).toContain('u1-btc');
            expect(results).toContain('u2-sol');
        });
    });

    describe('Concurrent Stress Test', () => {
        it('should handle many concurrent operations', async () => {
            let executionCount = 0;
            const operations: Promise<void>[] = [];

            // Launch 20 concurrent operations on same asset
            for (let i = 0; i < 20; i++) {
                const op = coordinator.withLock(userId, asset, 'open', async () => {
                    executionCount++;
                    await wait(5);
                });
                operations.push(op);
            }

            await Promise.all(operations);

            // All should execute
            expect(executionCount).toBe(20);
        });
    });
});
