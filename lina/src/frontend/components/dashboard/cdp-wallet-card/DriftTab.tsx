import { useState, useEffect, useCallback, useRef } from 'react';
import { elizaClient } from '../../../lib/elizaClient';
import { formatUsdValue } from '../../../lib/number-format';
import { cn } from '../../../lib/utils';
import type { DriftPosition, DriftAccountInfo, DriftPositionsResponse, DriftAccountResponse } from '@elizaos/api-client';

// Auto-refresh interval in milliseconds (10 seconds)
const REFRESH_INTERVAL = 10_000;

interface DriftTabProps {
  userId: string;
  isActive?: boolean; // Whether this tab is currently visible
}

// ASCII art for empty perps state
const EMPTY_PERPS_ART = `
    ╭──────────╮
    │  ↑  ↓    │
    │ ─────────│
    │ no perps │
    ╰──────────╯
`;

// Format large numbers with K/M suffix
function formatCompactNumber(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(num)) return '0';

  // For USDC (6 decimals), convert from raw to USD
  const usd = num / 1_000_000;

  if (usd >= 1_000_000) {
    return `${(usd / 1_000_000).toFixed(2)}M`;
  }
  if (usd >= 1_000) {
    return `${(usd / 1_000).toFixed(2)}K`;
  }
  return usd.toFixed(2);
}

// Format oracle price from raw BN string (PRICE_PRECISION = 6)
function formatOraclePrice(value: string): string {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return '0.00';
  // Raw oracle price values from Drift are scaled by 1e6
  const price = num / 1_000_000;
  if (price >= 1000) {
    return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Format USD price that's already in human-readable form (entry, liq)
function formatUsdPrice(value: string): string {
  const num = parseFloat(value);
  if (!Number.isFinite(num) || num === 0) return '0.00';
  if (num >= 1000) {
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Format position size from base asset amount (9 decimals)
function formatSize(value: string): string {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return '0';
  const size = num / 1_000_000_000; // BASE_PRECISION = 9
  if (size >= 1000) {
    return size.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  if (size >= 1) {
    return size.toFixed(4);
  }
  return size.toFixed(6);
}

// Format PnL with color indicator
function formatPnl(value: string): { text: string; isPositive: boolean } {
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return { text: '$0.00', isPositive: true };
  const pnl = num / 1_000_000; // QUOTE_PRECISION = 6
  const isPositive = pnl >= 0;
  const text = `${isPositive ? '+' : ''}$${formatUsdValue(Math.abs(pnl))}`;
  return { text, isPositive };
}

export function DriftTab({ userId, isActive = true }: DriftTabProps) {
  const [positions, setPositions] = useState<DriftPosition[]>([]);
  const [account, setAccount] = useState<DriftAccountInfo | null>(null);
  const [hasAccount, setHasAccount] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDriftData = useCallback(async (showLoading = true) => {
    if (!userId) return;

    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      // Fetch positions and account in parallel
      const [positionsRes, accountRes] = await Promise.all([
        elizaClient.drift.getPositions(),
        elizaClient.drift.getAccountInfo(),
      ]) as [DriftPositionsResponse, DriftAccountResponse];

      setPositions(positionsRes.positions || []);
      setAccount(accountRes.account);
      setHasAccount(positionsRes.hasAccount || accountRes.hasAccount);
      setLastUpdated(new Date());
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[DriftTab] Error fetching data:', errorMsg);
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Initial fetch on mount
  useEffect(() => {
    fetchDriftData(true);
  }, [fetchDriftData]);

  // Auto-refresh when tab is active
  useEffect(() => {
    if (isActive && hasAccount) {
      // Start periodic refresh
      intervalRef.current = setInterval(() => {
        fetchDriftData(false); // Don't show loading spinner on auto-refresh
      }, REFRESH_INTERVAL);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    } else {
      // Clear interval when tab is inactive or no account
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isActive, hasAccount, fetchDriftData]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3">
        {/* Account skeleton */}
        <div className="p-3 rounded-lg bg-muted/30 border border-border/30 animate-pulse">
          <div className="h-4 w-24 bg-muted rounded mb-3"></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="h-8 bg-muted rounded"></div>
            <div className="h-8 bg-muted rounded"></div>
            <div className="h-8 bg-muted rounded"></div>
            <div className="h-8 bg-muted rounded"></div>
          </div>
        </div>
        {/* Position skeleton */}
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="p-3 rounded-lg bg-muted/20 animate-pulse">
              <div className="h-4 w-20 bg-muted rounded mb-2"></div>
              <div className="h-3 w-full bg-muted rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-xs text-red-500 bg-red-500/10 p-3 rounded border border-red-500/20">
        {error}
      </div>
    );
  }

  // No account / empty state
  if (!hasAccount || positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground/50">
        <pre className="text-[10px] leading-tight font-mono select-none opacity-40">
          {EMPTY_PERPS_ART.trim()}
        </pre>
        <p className="text-xs mt-2 text-muted-foreground/70">
          {hasAccount ? 'No open positions' : 'No Drift account'}
        </p>
        <p className="text-[10px] mt-0.5 text-muted-foreground/40">
          {hasAccount ? 'Open a position via chat to get started' : 'Deposit collateral via chat to create account'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Account Info Card */}
      {account && (
        <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Drift Account
            </span>
            {lastUpdated && (
              <span className="text-[9px] text-muted-foreground/50 font-mono">
                {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Collateral</span>
              <span className="font-mono">${formatCompactNumber(account.collateral)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Free</span>
              <span className="font-mono">${formatCompactNumber(account.freeCollateral)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Margin</span>
              <span className="font-mono">{account.marginRatio}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Leverage</span>
              <span className="font-mono">{account.leverage.toFixed(2)}x</span>
            </div>
          </div>
        </div>
      )}

      {/* Positions List */}
      <div className="space-y-2">
        {positions.map((position) => {
          const pnl = formatPnl(position.unrealizedPnl);
          const isLong = position.side === 'long';

          return (
            <div
              key={`${position.marketSymbol}-${position.marketIndex}`}
              className="p-3 rounded-lg bg-muted/20 border border-border/20 hover:bg-muted/30 transition-colors"
            >
              {/* Header: Market + Side + Leverage */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{position.marketSymbol}</span>
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-medium uppercase",
                      isLong
                        ? "bg-green-500/20 text-green-400"
                        : "bg-red-500/20 text-red-400"
                    )}
                  >
                    {position.side}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {position.leverage.toFixed(1)}x
                </span>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Size</span>
                  <span className="font-mono">{formatSize(position.size)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entry</span>
                  <span className="font-mono">${formatUsdPrice(position.entryPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mark</span>
                  <span className="font-mono">${formatOraclePrice(position.markPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Liq</span>
                  <span className="font-mono text-red-400/80">${formatUsdPrice(position.liquidationPrice)}</span>
                </div>
              </div>

              {/* PnL Footer */}
              <div className="mt-2 pt-2 border-t border-border/20 flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground uppercase">Unrealized PnL</span>
                <span
                  className={cn(
                    "text-sm font-mono font-medium",
                    pnl.isPositive ? "text-green-400" : "text-red-400"
                  )}
                >
                  {pnl.text}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
