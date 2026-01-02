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

  // Parse values (backend returns raw USDC with 6 decimals)
  const collateral = parseFloat(account.collateral) / 1_000_000;
  const unrealizedPnl = parseFloat(account.unrealizedPnl) / 1_000_000;
  const freeCollateral = parseFloat(account.freeCollateral) / 1_000_000;
  const isPnlPositive = unrealizedPnl >= 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-3 px-3 py-1.5 rounded-lg",
            "bg-gradient-to-r from-green-500/10 to-transparent",
            "border border-green-500/20",
            "cursor-default select-none",
            className
          )}
        >
          {/* Drift Label */}
          <span className="text-[10px] uppercase tracking-wider text-green-400/70 font-medium">
            Drift
          </span>

          {/* Collateral */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">$</span>
            <span className="text-sm font-mono font-medium text-foreground">
              {formatUsdValue(collateral)}
            </span>
          </div>

          {/* Separator */}
          <span className="text-muted-foreground/30">|</span>

          {/* PnL */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase text-muted-foreground/70">PnL</span>
            <span
              className={cn(
                "text-sm font-mono font-medium",
                isPnlPositive ? "text-green-400" : "text-red-400"
              )}
            >
              {isPnlPositive ? '+' : ''}{formatUsdValue(unrealizedPnl)}
            </span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8} className="max-w-xs">
        <div className="space-y-1.5">
          <p className="font-medium text-sm">Drift Margin Account</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">Collateral:</span>
            <span className="font-mono">${formatUsdValue(collateral)}</span>
            <span className="text-muted-foreground">Free:</span>
            <span className="font-mono">${formatUsdValue(freeCollateral)}</span>
            <span className="text-muted-foreground">Unrealized PnL:</span>
            <span className={cn("font-mono", isPnlPositive ? "text-green-400" : "text-red-400")}>
              {isPnlPositive ? '+' : ''}${formatUsdValue(Math.abs(unrealizedPnl))}
            </span>
            <span className="text-muted-foreground">Leverage:</span>
            <span className="font-mono">{account.leverage.toFixed(2)}x</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
