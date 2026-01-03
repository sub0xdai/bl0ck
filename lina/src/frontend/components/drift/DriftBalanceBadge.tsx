import { useState, useEffect, useCallback } from 'react';
import { elizaClient } from '../../lib/elizaClient';
import { formatUsdValue } from '../../lib/number-format';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import type { DriftAccountInfo, DriftAccountResponse } from '@elizaos/api-client';

// Auto-refresh interval (30 seconds)
const REFRESH_INTERVAL = 30_000;

interface DriftBalanceBadgeProps {
  className?: string;
}

/**
 * Compact Drift balance badge for header display
 * Shows collateral and unrealized PnL with auto-refresh
 */
export function DriftBalanceBadge({ className }: DriftBalanceBadgeProps) {
  const [account, setAccount] = useState<DriftAccountInfo | null>(null);
  const [hasAccount, setHasAccount] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDriftData = useCallback(async () => {
    try {
      const response = await elizaClient.drift.getAccountInfo() as DriftAccountResponse;
      setAccount(response.account);
      setHasAccount(response.hasAccount);
      setError(null);
    } catch (err) {
      console.error('[DriftBalanceBadge] Error fetching data:', err);
      setError('Failed to load');
      setHasAccount(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchDriftData();
  }, [fetchDriftData]);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(fetchDriftData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchDriftData]);

  // Don't show if no account or loading
  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 animate-pulse", className)}>
        <div className="h-3 w-16 bg-muted rounded" />
      </div>
    );
  }

  if (!hasAccount || !account) {
    return null; // Don't show badge if no Drift account
  }

  // Parse values (backend already returns human-readable USD after QUOTE_PRECISION fix)
  const collateral = parseFloat(account.collateral);
  const unrealizedPnl = parseFloat(account.unrealizedPnl);
  const freeCollateral = parseFloat(account.freeCollateral);
  const isPnlPositive = unrealizedPnl >= 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-2 rounded-lg",
            "bg-green-500/15 backdrop-blur-sm",
            "border border-green-400/40",
            "shadow-[0_0_15px_rgba(34,197,94,0.15)]",
            "cursor-default select-none",
            className
          )}
        >
          {/* Drift Label */}
          <span className="text-xs uppercase tracking-wider text-green-400 font-semibold">
            Drift
          </span>

          {/* Collateral */}
          <div className="flex items-center gap-1">
            <span className="text-sm text-green-300/80 font-medium">$</span>
            <span className="text-base font-mono font-bold text-white">
              {formatUsdValue(collateral)}
            </span>
          </div>

          {/* Separator */}
          <span className="text-green-400/50">|</span>

          {/* PnL */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs uppercase text-green-300/70 font-medium">PnL</span>
            <span
              className={cn(
                "text-base font-mono font-bold",
                isPnlPositive ? "text-green-400" : "text-red-400"
              )}
            >
              {isPnlPositive ? '+' : ''}${formatUsdValue(Math.abs(unrealizedPnl))}
            </span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        sideOffset={8}
        className="max-w-xs !bg-zinc-900 !border !border-zinc-700 !text-zinc-100"
      >
        <div className="space-y-1.5">
          <p className="font-medium text-sm text-white">Drift Margin Account</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-zinc-400">Collateral:</span>
            <span className="font-mono text-zinc-100">${formatUsdValue(collateral)}</span>
            <span className="text-zinc-400">Free:</span>
            <span className="font-mono text-zinc-100">${formatUsdValue(freeCollateral)}</span>
            <span className="text-zinc-400">Unrealized PnL:</span>
            <span className={cn("font-mono", isPnlPositive ? "text-green-400" : "text-red-400")}>
              {isPnlPositive ? '+' : ''}${formatUsdValue(Math.abs(unrealizedPnl))}
            </span>
            <span className="text-zinc-400">Leverage:</span>
            <span className="font-mono text-zinc-100">{account.leverage.toFixed(2)}x</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
