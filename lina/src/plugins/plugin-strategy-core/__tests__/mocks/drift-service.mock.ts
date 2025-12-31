/**
 * DriftService Mock for Strategy-Core Integration Tests
 *
 * Provides a stateful mock of DriftService that tracks positions,
 * collateral, and simulates trade execution for testing.
 */
import { mock, type Mock } from 'bun:test';

/**
 * Position data structure (matches DriftService output)
 */
export interface MockPosition {
    marketIndex: number;
    marketSymbol: string;
    side: 'long' | 'short';
    size: string;
    notionalValue: string;
    entryPrice: string;
    markPrice: string;
    liquidationPrice: string;
    unrealizedPnl: string;
    leverage: number;
    marginUsed: string;
}

/**
 * Account info structure (matches DriftService output)
 */
export interface MockAccountInfo {
    authority: string;
    subAccountId: number;
    collateral: string;
    freeCollateral: string;
    totalPositionValue: string;
    unrealizedPnl: string;
    settledPnl: string;
    cumulativeFunding: string;
    marginRatio: string;
    leverage: number;
}

/**
 * Internal state for the mock DriftService
 */
export interface MockDriftState {
    /** Positions per user: Map<userId, positions[]> */
    positions: Map<string, MockPosition[]>;
    /** Collateral per user in USD */
    collateral: Map<string, number>;
    /** Free collateral per user in USD */
    freeCollateral: Map<string, number>;
    /** Track if service is initialized */
    initialized: boolean;
}

/**
 * Create fresh mock state
 */
export function createMockDriftState(): MockDriftState {
    return {
        positions: new Map(),
        collateral: new Map(),
        freeCollateral: new Map(),
        initialized: true,
    };
}

/**
 * Create a test position with sensible defaults
 */
export function createTestPosition(overrides: Partial<MockPosition> = {}): MockPosition {
    return {
        marketIndex: 0,
        marketSymbol: 'SOL-PERP',
        side: 'long',
        size: '1.0',
        notionalValue: '100.00',
        entryPrice: '100.00',
        markPrice: '105.00',
        liquidationPrice: '80.00',
        unrealizedPnl: '5.00',
        leverage: 5,
        marginUsed: '20.00',
        ...overrides,
    };
}

/**
 * Create a position with specific PnL percentage
 */
export function createPositionWithPnl(
    asset: string,
    side: 'long' | 'short',
    notionalValue: number,
    pnlPct: number
): MockPosition {
    const entryPrice = 100;
    const pnlUsd = (pnlPct / 100) * notionalValue;
    const priceChange = side === 'long' ? pnlPct : -pnlPct;
    const markPrice = entryPrice * (1 + priceChange / 100);

    return {
        marketIndex: asset === 'SOL-PERP' ? 0 : asset === 'BTC-PERP' ? 1 : 2,
        marketSymbol: asset,
        side,
        size: (notionalValue / entryPrice).toFixed(4),
        notionalValue: notionalValue.toFixed(2),
        entryPrice: entryPrice.toFixed(2),
        markPrice: markPrice.toFixed(2),
        liquidationPrice: (entryPrice * 0.8).toFixed(2),
        unrealizedPnl: pnlUsd.toFixed(2),
        leverage: 5,
        marginUsed: (notionalValue / 5).toFixed(2),
    };
}

/**
 * Mock DriftService class with stateful position tracking
 */
export class MockDriftService {
    private state: MockDriftState;

    // Mock functions for assertion
    public openPosition: Mock<(userId: string, params: any) => Promise<any>>;
    public closePosition: Mock<(userId: string, params: any) => Promise<any>>;
    public getPositions: Mock<(userId: string) => Promise<MockPosition[]>>;
    public getPosition: Mock<(userId: string, asset: string) => Promise<MockPosition | null>>;
    public getAccountInfo: Mock<(userId: string) => Promise<MockAccountInfo>>;
    public closeAllPositions: Mock<(userId: string) => Promise<void>>;

    constructor(state?: MockDriftState) {
        this.state = state ?? createMockDriftState();

        // Initialize mock functions
        this.openPosition = mock((userId: string, params: any) => {
            return this._openPosition(userId, params);
        });

        this.closePosition = mock((userId: string, params: any) => {
            return this._closePosition(userId, params);
        });

        this.getPositions = mock((userId: string) => {
            return Promise.resolve(this.state.positions.get(userId) || []);
        });

        this.getPosition = mock((userId: string, asset: string) => {
            const positions = this.state.positions.get(userId) || [];
            const position = positions.find(p => p.marketSymbol === asset);
            return Promise.resolve(position || null);
        });

        this.getAccountInfo = mock((userId: string) => {
            return this._getAccountInfo(userId);
        });

        this.closeAllPositions = mock((userId: string) => {
            this.state.positions.set(userId, []);
            return Promise.resolve();
        });
    }

    /**
     * Internal: Open a position
     */
    private async _openPosition(userId: string, params: any): Promise<any> {
        const positions = this.state.positions.get(userId) || [];

        const newPosition = createTestPosition({
            marketSymbol: params.marketSymbol,
            side: params.side,
            notionalValue: params.size.toFixed(2),
            entryPrice: '100.00',
            markPrice: '100.00',
            unrealizedPnl: '0.00',
            leverage: params.leverage || 5,
            marginUsed: (params.size / (params.leverage || 5)).toFixed(2),
        });

        // Replace existing position for same asset or add new
        const existingIdx = positions.findIndex(p => p.marketSymbol === params.marketSymbol);
        if (existingIdx >= 0) {
            positions[existingIdx] = newPosition;
        } else {
            positions.push(newPosition);
        }

        this.state.positions.set(userId, positions);

        return {
            success: true,
            txSignature: `mock_open_${Date.now()}`,
            position: newPosition,
        };
    }

    /**
     * Internal: Close a position
     */
    private async _closePosition(userId: string, params: any): Promise<any> {
        const positions = this.state.positions.get(userId) || [];
        const idx = positions.findIndex(p => p.marketSymbol === params.marketSymbol);

        if (idx < 0) {
            return { success: false, error: 'Position not found' };
        }

        const closedPosition = positions[idx];
        const percentage = params.percentage || 100;

        if (percentage >= 100) {
            positions.splice(idx, 1);
        } else {
            // Partial close
            const remaining = parseFloat(closedPosition.size) * (1 - percentage / 100);
            closedPosition.size = remaining.toFixed(4);
            closedPosition.notionalValue = (remaining * parseFloat(closedPosition.markPrice)).toFixed(2);
        }

        this.state.positions.set(userId, positions);

        return {
            success: true,
            txSignature: `mock_close_${Date.now()}`,
            position: closedPosition,
        };
    }

    /**
     * Internal: Get account info
     */
    private async _getAccountInfo(userId: string): Promise<MockAccountInfo> {
        const collateral = this.state.collateral.get(userId) || 10000;
        const freeCollateral = this.state.freeCollateral.get(userId) || collateral;
        const positions = this.state.positions.get(userId) || [];

        const totalPositionValue = positions.reduce(
            (sum, p) => sum + parseFloat(p.notionalValue),
            0
        );
        const unrealizedPnl = positions.reduce(
            (sum, p) => sum + parseFloat(p.unrealizedPnl),
            0
        );

        return {
            authority: 'mockAuthority',
            subAccountId: 0,
            collateral: (collateral * 1_000_000).toString(),
            freeCollateral: (freeCollateral * 1_000_000).toString(),
            totalPositionValue: (totalPositionValue * 1_000_000).toString(),
            unrealizedPnl: (unrealizedPnl * 1_000_000).toString(),
            settledPnl: '0',
            cumulativeFunding: '0',
            marginRatio: '100',
            leverage: totalPositionValue > 0 ? totalPositionValue / collateral : 0,
        };
    }

    // =========================================================================
    // State manipulation for tests
    // =========================================================================

    /**
     * Set a position for a user (overwrites existing for same asset)
     */
    setPosition(userId: string, position: MockPosition): void {
        const positions = this.state.positions.get(userId) || [];
        const idx = positions.findIndex(p => p.marketSymbol === position.marketSymbol);

        if (idx >= 0) {
            positions[idx] = position;
        } else {
            positions.push(position);
        }

        this.state.positions.set(userId, positions);
    }

    /**
     * Set multiple positions for a user
     */
    setPositions(userId: string, positions: MockPosition[]): void {
        this.state.positions.set(userId, [...positions]);
    }

    /**
     * Set collateral for a user
     */
    setCollateral(userId: string, collateral: number, freeCollateral?: number): void {
        this.state.collateral.set(userId, collateral);
        this.state.freeCollateral.set(userId, freeCollateral ?? collateral);
    }

    /**
     * Clear all positions for a user
     */
    clearPositions(userId: string): void {
        this.state.positions.set(userId, []);
    }

    /**
     * Update position's mark price and PnL
     */
    updatePositionPrice(userId: string, asset: string, newMarkPrice: number): void {
        const positions = this.state.positions.get(userId) || [];
        const position = positions.find(p => p.marketSymbol === asset);

        if (position) {
            const entryPrice = parseFloat(position.entryPrice);
            const size = parseFloat(position.size);
            const priceDiff = newMarkPrice - entryPrice;
            const pnl = position.side === 'long' ? priceDiff * size : -priceDiff * size;

            position.markPrice = newMarkPrice.toFixed(2);
            position.unrealizedPnl = pnl.toFixed(2);
            position.notionalValue = (size * newMarkPrice).toFixed(2);
        }
    }

    /**
     * Get current state (for assertions)
     */
    getState(): MockDriftState {
        return this.state;
    }

    /**
     * Reset all mocks and state
     */
    reset(): void {
        this.state = createMockDriftState();
        this.openPosition.mockClear();
        this.closePosition.mockClear();
        this.getPositions.mockClear();
        this.getPosition.mockClear();
        this.getAccountInfo.mockClear();
        this.closeAllPositions.mockClear();
    }
}

/**
 * Create a mock DriftService with optional initial state
 */
export function createMockDriftService(state?: MockDriftState): MockDriftService {
    return new MockDriftService(state);
}
