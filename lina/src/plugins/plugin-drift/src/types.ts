/**
 * Drift Protocol Plugin Types
 *
 * Type definitions for Solana perpetual futures trading via Drift Protocol.
 */

// Order types
export type OrderType = 'market' | 'limit';
export type PositionSide = 'long' | 'short';

// Position-related types
export interface DriftPosition {
  marketIndex: number;
  symbol: string;               // 'SOL-PERP', 'BTC-PERP'
  side: PositionSide;
  size: string;                 // Base asset amount (BN string)
  notionalValue: string;        // USD value
  entryPrice: string;
  markPrice: string;
  liquidationPrice: string;
  unrealizedPnl: string;
  leverage: number;
  marginUsed: string;
  timestamp: number;
}

export interface OpenPositionParams {
  userId: string;
  symbol: string;
  side: PositionSide;
  size: number;                 // USD value
  leverage: number;
  orderType: OrderType;
  limitPrice?: number;
  reduceOnly?: boolean;
}

export interface ClosePositionParams {
  userId: string;
  symbol: string;
  percentage: number;           // 1-100
  orderType: OrderType;
  limitPrice?: number;
}

export interface PositionResult {
  success: boolean;
  position?: DriftPosition;
  txSignature?: string;
  message: string;
  error?: string;
}

export interface CloseResult {
  success: boolean;
  txSignature?: string;
  closedSize: string;
  realizedPnl: string;
  message: string;
  error?: string;
}

// Market-related types
export interface DriftMarket {
  marketIndex: number;
  symbol: string;               // 'SOL-PERP'
  baseAsset: string;            // 'SOL'
  price: string;
  volume24h: string;
  openInterest: string;
  fundingRate: string;
  maxLeverage: number;
}

// Account-related types
export interface DriftAccountInfo {
  authority: string;            // User's Solana pubkey
  subAccountId: number;
  equity: string;
  availableBalance: string;
  marginUsed: string;
  unrealizedPnl: string;
  totalPositionValue: string;
  leverage: number;
  marginRatio: string;
}

// Service configuration
export interface DriftConfig {
  testnet: boolean;
  maxLeverage: number;          // Hard cap at 20x
}

// Validation result type
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Action parameter types (for ElizaOS action handlers)
export interface PerpOpenParams {
  symbol: string;
  size: number;
  leverage?: number;
  orderType?: OrderType;
  limitPrice?: number;
}

export interface PerpCloseParams {
  symbol: string;
  percentage?: number;
  orderType?: OrderType;
  limitPrice?: number;
}
