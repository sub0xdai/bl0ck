/**
 * Drift Protocol Plugin Constants
 */

// Program ID
export const DRIFT_PROGRAM_ID = 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH';

// Service configuration defaults
export const SERVICE_CONFIG = {
  DEFAULT_LEVERAGE: 1,
  MAX_LEVERAGE: 20,
  MIN_LEVERAGE: 1,
  HIGH_RISK_LEVERAGE_THRESHOLD: 5,
  DEFAULT_SLIPPAGE: 0.5,        // 0.5%
  CACHE_TTL_MS: 5 * 60 * 1000,  // 5 minutes
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
  MARKETS_DISPLAY_COUNT: 15,    // Max markets to show in list
  MIN_COLLATERAL: 10,           // $10 minimum
  SUBACCOUNT_ID: 0,             // Default subaccount
} as const;

// Market indices (Drift mainnet)
export const MARKETS = {
  'SOL-PERP': 0,
  'BTC-PERP': 1,
  'ETH-PERP': 2,
  'APT-PERP': 3,
  'ARB-PERP': 4,
  '1MBONK-PERP': 5,
  'MATIC-PERP': 6,
  'OP-PERP': 7,
  'DOGE-PERP': 8,
  'SUI-PERP': 9,
  'AVAX-PERP': 10,
  'WIF-PERP': 11,
  'JUP-PERP': 12,
  'JTO-PERP': 13,
  'PYTH-PERP': 14,
  'RNDR-PERP': 15,
  'INJ-PERP': 16,
  'LINK-PERP': 17,
  'PEPE-PERP': 18,
  'TIA-PERP': 19,
  'SEI-PERP': 20,
  'ONDO-PERP': 21,
  'W-PERP': 22,
  'WLD-PERP': 23,
  'STRK-PERP': 24,
  'MEME-PERP': 25,
  'ORDI-PERP': 26,
  'DYM-PERP': 27,
  'BONK-PERP': 28,
  'POPCAT-PERP': 29,
} as const;

export const MARKET_SYMBOLS = Object.keys(MARKETS) as (keyof typeof MARKETS)[];

// Popular markets to show first
export const POPULAR_MARKETS = [
  'SOL-PERP',
  'BTC-PERP',
  'ETH-PERP',
  'WIF-PERP',
  'JUP-PERP',
  'BONK-PERP',
  'DOGE-PERP',
  'AVAX-PERP',
  'ARB-PERP',
  'OP-PERP',
] as const;

// Error messages
export const ERROR_MESSAGES = {
  // Validation errors
  INVALID_SYMBOL: 'Invalid trading symbol',
  INVALID_SIZE: 'Invalid position size',
  INVALID_LEVERAGE: 'Leverage must be between 1 and 20',
  INVALID_LIMIT_PRICE: 'Limit price must be positive',
  INVALID_PERCENTAGE: 'Close percentage must be between 1 and 100',
  MIN_COLLATERAL: `Minimum position size is $${SERVICE_CONFIG.MIN_COLLATERAL}`,

  // Execution errors
  INSUFFICIENT_MARGIN: 'Insufficient margin for this position',
  POSITION_NOT_FOUND: 'No open position found for this symbol',
  ORDER_FAILED: 'Order execution failed',
  ACCOUNT_NOT_INITIALIZED: 'Drift account not initialized',

  // Network errors
  API_ERROR: 'Drift API error',
  NETWORK_ERROR: 'Network connection error',
  RPC_ERROR: 'Solana RPC error',
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  POSITION_OPENED: 'Position opened successfully',
  POSITION_CLOSED: 'Position closed successfully',
  ORDER_PLACED: 'Order placed successfully',
  ACCOUNT_INITIALIZED: 'Drift account initialized',
} as const;

// Action names
export const ACTION_NAMES = {
  DRIFT_OPEN_LONG: 'DRIFT_OPEN_LONG',
  DRIFT_OPEN_SHORT: 'DRIFT_OPEN_SHORT',
  DRIFT_CLOSE_POSITION: 'DRIFT_CLOSE_POSITION',
  DRIFT_GET_POSITIONS: 'DRIFT_GET_POSITIONS',
  DRIFT_GET_MARKETS: 'DRIFT_GET_MARKETS',
  DRIFT_ACCOUNT_INFO: 'DRIFT_ACCOUNT_INFO',
  DRIFT_DEPOSIT: 'DRIFT_DEPOSIT',
} as const;

// Service name
export const SERVICE_NAME = 'drift' as const;
