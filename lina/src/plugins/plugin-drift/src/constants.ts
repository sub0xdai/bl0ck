/**
 * Drift Protocol Constants
 * Contains configuration, market indices, and action names
 */

// Drift Program ID (same for devnet and mainnet)
export const DRIFT_PROGRAM_ID = 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH';

// Service name for ElizaOS runtime
export const SERVICE_NAME = 'DRIFT_SERVICE';

/**
 * CRITICAL: Devnet has different/fewer markets than mainnet
 * Always use the correct market map based on network
 */
export const DEVNET_MARKETS = {
  'SOL-PERP': 0,
  'BTC-PERP': 1,
  'ETH-PERP': 2,
} as const;

export const MAINNET_MARKETS = {
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
  'LDO-PERP': 19,
  'UNI-PERP': 20,
  'MKR-PERP': 21,
  'AAVE-PERP': 22,
  'CRV-PERP': 23,
  'SNX-PERP': 24,
  'NEAR-PERP': 25,
  'ATOM-PERP': 26,
  'FTM-PERP': 27,
  'SEI-PERP': 28,
  'TIA-PERP': 29,
} as const;

/**
 * Service configuration
 */
export const CONFIG = {
  MAX_LEVERAGE: 20,
  DEFAULT_LEVERAGE: 1,
  DEFAULT_SLIPPAGE: 0.5,         // 0.5%
  MIN_COLLATERAL: 1,             // $1 minimum position size (lowered for testing)
  MIN_SOL_FOR_INIT: 0.02,        // SOL needed for Drift account initialization
  SUBACCOUNT_ID: 0,              // Default subaccount
  HIGH_RISK_LEVERAGE_THRESHOLD: 5, // Warn user above this leverage
  // Jupiter auto-swap configuration
  SWAP_BUFFER_PERCENT: 1.10,     // 10% extra for price movement
  SWAP_SLIPPAGE_BPS: 50,         // 0.5% slippage tolerance (basis points)
  ESTIMATED_SOL_PRICE_USD: 200,  // Approximate SOL price for estimation
  SOL_ESTIMATE_BUFFER: 1.20,     // 20% buffer for SOL estimation
  MAX_PRICE_IMPACT_PERCENT: 2.0, // Maximum acceptable price impact
} as const;

/**
 * Transaction configuration for low-latency trading
 * Priority fees ensure transactions land during network congestion
 */
export const TX_CONFIG = {
  COMPUTE_UNITS: 400_000,              // CU limit for perp orders
  PRIORITY_FEE_MICRO_LAMPORTS: 50_000, // Priority fee (0.00005 SOL per CU)
} as const;

/**
 * WebSocket subscription configuration
 * Separate from TX_CONFIG per Single Responsibility Principle
 */
export const WS_CONFIG = {
  RESUB_TIMEOUT_MS: 30_000,  // WebSocket reconnection timeout
} as const;

/**
 * Pre-built priority fee options for placeAndTakePerpOrder
 * Extracted to avoid DRY violation across open/close operations
 */
export const PRIORITY_FEE_OPTS = {
  computeUnits: TX_CONFIG.COMPUTE_UNITS,
  computeUnitsPrice: TX_CONFIG.PRIORITY_FEE_MICRO_LAMPORTS,
} as const;

/**
 * Action names for ElizaOS action registration
 */
export const ACTION_NAMES = {
  DRIFT_OPEN_LONG: 'DRIFT_OPEN_LONG',
  DRIFT_OPEN_SHORT: 'DRIFT_OPEN_SHORT',
  DRIFT_CLOSE_POSITION: 'DRIFT_CLOSE_POSITION',
  DRIFT_CLOSE_ALL_POSITIONS: 'DRIFT_CLOSE_ALL_POSITIONS',
  DRIFT_GET_POSITIONS: 'DRIFT_GET_POSITIONS',
  DRIFT_GET_MARKETS: 'DRIFT_GET_MARKETS',
  DRIFT_ACCOUNT_INFO: 'DRIFT_ACCOUNT_INFO',
  DRIFT_DEPOSIT: 'DRIFT_DEPOSIT',
  DRIFT_WITHDRAW: 'DRIFT_WITHDRAW',
} as const;

/**
 * Token mint addresses for auto-collateral swaps
 */
export const MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
} as const;

/**
 * Error message builders for consistent error handling
 */
export const ERRORS = {
  unknownMarket: (symbol: string, available: string[]) =>
    'Unknown market: ' + symbol + '. Available: ' + available.join(', '),
  insufficientCollateral: (required: number, available: number) =>
    'Insufficient collateral. Need $' + required.toFixed(2) + ', have $' + available.toFixed(2),
  insufficientSol: (required: number, current: number) =>
    'Need at least ' + required + ' SOL to initialize Drift account. Current: ' + current.toFixed(4) + ' SOL',
  insufficientSolForSwap: (required: number, current: number) =>
    `Insufficient SOL for auto-swap. Need ~${required.toFixed(4)} SOL, have ${current.toFixed(4)} SOL`,
  priceImpactTooHigh: (impact: string, max: number) =>
    `Price impact too high: ${impact}% (max: ${max}%). Try a smaller position or wait for better liquidity.`,
  noPosition: (symbol: string) =>
    'No open position in ' + symbol,
  leverageTooHigh: (requested: number, max: number) =>
    'Leverage ' + requested + 'x exceeds maximum ' + max + 'x',
  sizeTooSmall: (size: number, min: number) =>
    'Position size $' + size + ' is below minimum $' + min,
  SERVICE_NOT_FOUND: 'Drift service not initialized',
  JUPITER_NOT_FOUND: 'Jupiter service not available for auto-collateral swap',
} as const;

/**
 * Helper to get market symbols for current network
 */
export function getMarketSymbols(isDevnet: boolean): string[] {
  return Object.keys(isDevnet ? DEVNET_MARKETS : MAINNET_MARKETS);
}

/**
 * Helper to get market index for a symbol
 */
export function getMarketIndex(symbol: string, isDevnet: boolean): number | undefined {
  const markets = isDevnet ? DEVNET_MARKETS : MAINNET_MARKETS;
  return (markets as Record<string, number>)[symbol];
}
