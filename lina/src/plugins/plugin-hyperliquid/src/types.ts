/**
 * Hyperliquid Plugin Types
 */

// Order types
export type OrderType = 'market' | 'limit';
export type PositionSide = 'long' | 'short';

// Position-related types
export interface Position {
  symbol: string;
  side: PositionSide;
  size: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number | null;
  unrealizedPnl: number;
  realizedPnl: number;
  leverage: number;
  marginUsed: number;
  timestamp: number;
}

export interface OpenPositionParams {
  userId: string;
  symbol: string;
  side: PositionSide;
  size: number;
  leverage: number;
  orderType: OrderType;
  limitPrice?: number;
  reduceOnly?: boolean;
}

export interface ClosePositionParams {
  userId: string;
  symbol: string;
  percentage: number; // 1-100
  orderType: OrderType;
  limitPrice?: number;
}

export interface PositionResult {
  success: boolean;
  orderId?: string;
  position?: Position;
  message: string;
  error?: string;
}

export interface CloseResult {
  success: boolean;
  orderId?: string;
  closedSize: number;
  realizedPnl: number;
  message: string;
  error?: string;
}

// Market-related types
export interface Market {
  symbol: string;
  name: string;
  baseCurrency: string;
  quoteCurrency: string;
  minSize: number;
  tickSize: number;
  maxLeverage: number;
  fundingRate: number;
  markPrice: number;
  indexPrice: number;
  volume24h: number;
  openInterest: number;
}

// Account-related types
export interface AccountInfo {
  equity: number;
  availableBalance: number;
  marginUsed: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPositionValue: number;
  leverage: number;
  marginRatio: number;
}

// Service configuration (CDP mode - no private key required)
export interface HyperliquidConfig {
  testnet: boolean;
  maxLeverage: number; // Hard cap at 25x
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

// Validation result type
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================================
// PHASE 4: Auto-Bridge Types
// ============================================================

/**
 * Result of a bridge operation
 */
export interface BridgeResult {
  success: boolean;
  bridged: boolean;
  amount: number;
  source?: 'arbitrum' | 'base' | 'ethereum' | 'polygon' | 'solana';
  txHash?: string;
  error?: string;
}

/**
 * Margin status across all available sources
 */
export interface MarginCheck {
  hyperliquidBalance: number;
  required: number;
  deficit: number;
  evmBalances: { chain: string; amount: number }[];
  solanaBalance: number;
}
