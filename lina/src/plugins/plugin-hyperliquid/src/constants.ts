/**
 * Hyperliquid Plugin Constants
 */

// API endpoints
export const HYPERLIQUID_API = {
  MAINNET: 'https://api.hyperliquid.xyz',
  TESTNET: 'https://api.hyperliquid-testnet.xyz',
} as const;

// Service configuration defaults
export const SERVICE_CONFIG = {
  DEFAULT_LEVERAGE: 1,
  MAX_LEVERAGE: 25,
  MIN_LEVERAGE: 1,
  HIGH_RISK_LEVERAGE_THRESHOLD: 5,
  DEFAULT_SLIPPAGE: 0.5, // 0.5%
  CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
} as const;

// Popular trading pairs
export const POPULAR_MARKETS = [
  'BTC',
  'ETH',
  'SOL',
  'AVAX',
  'ARB',
  'OP',
  'MATIC',
  'DOGE',
  'LINK',
  'UNI',
  'AAVE',
  'CRV',
  'LDO',
  'APT',
  'SUI',
  'SEI',
  'TIA',
  'INJ',
  'ONDO',
  'PYTH',
] as const;

// Error messages
export const ERROR_MESSAGES = {
  // Validation errors
  INVALID_SYMBOL: 'Invalid trading symbol',
  INVALID_SIZE: 'Invalid position size',
  INVALID_LEVERAGE: 'Leverage must be between 1 and 25',
  INVALID_LIMIT_PRICE: 'Limit price must be positive',
  INVALID_PERCENTAGE: 'Close percentage must be between 1 and 100',

  // Execution errors
  INSUFFICIENT_MARGIN: 'Insufficient margin for this position',
  POSITION_NOT_FOUND: 'No open position found for this symbol',
  ORDER_FAILED: 'Order execution failed',

  // Configuration errors
  MISSING_PRIVATE_KEY: 'HYPERLIQUID_PRIVATE_KEY environment variable is required',
  INVALID_PRIVATE_KEY: 'Invalid private key format',

  // Network errors
  API_ERROR: 'Hyperliquid API error',
  NETWORK_ERROR: 'Network connection error',
  RATE_LIMITED: 'Rate limited, please try again later',
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  POSITION_OPENED: 'Position opened successfully',
  POSITION_CLOSED: 'Position closed successfully',
  ORDER_PLACED: 'Order placed successfully',
} as const;

// Action names
export const ACTION_NAMES = {
  PERP_OPEN_LONG: 'PERP_OPEN_LONG',
  PERP_OPEN_SHORT: 'PERP_OPEN_SHORT',
  PERP_CLOSE_POSITION: 'PERP_CLOSE_POSITION',
  PERP_GET_POSITIONS: 'PERP_GET_POSITIONS',
  PERP_GET_MARKETS: 'PERP_GET_MARKETS',
  PERP_ACCOUNT_INFO: 'PERP_ACCOUNT_INFO',
} as const;

// Service name
export const SERVICE_NAME = 'hyperliquid' as const;
