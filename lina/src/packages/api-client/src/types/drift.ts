/**
 * Drift Protocol position side
 */
export type PositionSide = 'long' | 'short';

/**
 * Drift position data
 */
export interface DriftPosition {
  marketIndex: number;
  marketSymbol: string;
  side: PositionSide;
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
 * Drift account information
 */
export interface DriftAccountInfo {
  authority: string;
  subAccountId: number;
  collateral: string;
  freeCollateral: string;
  totalPositionValue: string;
  unrealizedPnl: string;
  marginRatio: string;
  leverage: number;
}

/**
 * Response for GET /api/drift/positions
 */
export interface DriftPositionsResponse {
  positions: DriftPosition[];
  hasAccount: boolean;
}

/**
 * Response for GET /api/drift/account
 */
export interface DriftAccountResponse {
  account: DriftAccountInfo | null;
  hasAccount: boolean;
}
