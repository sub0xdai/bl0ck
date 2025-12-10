/**
 * Drift Protocol Types
 * Adapted from Hyperliquid types for Solana perpetuals
 */

export type OrderType = 'market' | 'limit';
export type PositionSide = 'long' | 'short';

/**
 * Represents an open perpetual position on Drift
 */
export interface DriftPosition {
  marketIndex: number;
  marketSymbol: string;           // 'SOL-PERP', 'BTC-PERP'
  side: PositionSide;
  size: string;                   // Base asset amount
  notionalValue: string;          // USD value
  entryPrice: string;
  markPrice: string;
  liquidationPrice: string;
  unrealizedPnl: string;
  leverage: number;
  marginUsed: string;
}

/**
 * Represents a perpetual market on Drift
 */
export interface DriftMarket {
  marketIndex: number;
  symbol: string;                 // 'SOL-PERP'
  baseAsset: string;              // 'SOL'
  price: string;
  volume24h: string;
  openInterest: string;
  fundingRate: string;            // Current funding rate
  maxLeverage: number;
}

/**
 * User's Drift account information
 */
export interface DriftAccountInfo {
  authority: string;              // User's Solana pubkey
  subAccountId: number;
  collateral: string;             // Total collateral (USDC)
  freeCollateral: string;         // Available for new positions
  totalPositionValue: string;
  unrealizedPnl: string;
  settledPnl: string;             // Realized/settled PnL
  cumulativeFunding: string;      // Cumulative funding payments
  marginRatio: string;            // Current margin ratio
  leverage: number;               // Account-level leverage
}

/**
 * Parameters for opening a new position
 */
export interface OpenPositionParams {
  marketSymbol: string;           // 'SOL-PERP', 'BTC-PERP'
  side: PositionSide;
  size: number;                   // In USD
  leverage?: number;              // Default 1x, max 20x
  orderType?: OrderType;
  limitPrice?: number;            // For limit orders
  reduceOnly?: boolean;
}

/**
 * Parameters for closing a position
 */
export interface ClosePositionParams {
  marketSymbol: string;
  percentage?: number;            // 1-100, default 100 (full close)
}

/**
 * Result of a position operation
 */
export interface PositionResult {
  success: boolean;
  position?: DriftPosition;
  txSignature?: string;
  error?: string;
}

/**
 * Result of a deposit operation
 */
export interface DepositResult {
  success: boolean;
  txSignature?: string;
  amount?: number;
  error?: string;
}

/**
 * Result of a withdrawal operation
 */
export interface WithdrawResult {
  success: boolean;
  txSignature?: string;
  amount?: number;
  newFreeCollateral?: number;
  error?: string;
}

/**
 * Validation result for position parameters
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
