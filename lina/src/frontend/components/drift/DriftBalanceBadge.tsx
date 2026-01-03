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
 * Refactored to "Ticker" style: Text-based, glowing values, no boxy background.
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
      <div className={cn("flex items-center gap-2 px-3 py-1.5 animate-pulse opacity-50", className)}>
         <span className="text-xs font-mono text-muted-foreground">SYNCING DRIFT...</span>
      </div>
    );
  }

  if (!hasAccount || !account) {
    return null; // Don't show badge if no Drift account
  }

  // Parse values
  const collateral = parseFloat(account.collateral);
  const unrealizedPnl = parseFloat(account.unrealizedPnl);
  const freeCollateral = parseFloat(account.freeCollateral);
  const isPnlPositive = unrealizedPnl >= 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-4 px-2 py-1",
            "cursor-default select-none transition-opacity hover:opacity-80",
            className
          )}
        >
          {/* Label */}
          <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase font-display font-bold">
            DRIFT
          </span>

          {/* Collateral */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-mono">BAL:</span>
            <span className="text-sm font-mono font-bold text-foreground text-glow-subtle">
              ${formatUsdValue(collateral)}
            </span>
          </div>

          {/* Separator - subtle vertical line */}
          <div className="w-px h-3 bg-border" />

          {/* PnL */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-mono">PNL:</span>
            <span
              className={cn(
                "text-sm font-mono font-bold",
                isPnlPositive ? "text-success text-glow" : "text-destructive text-glow"
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
        className="glass-panel text-foreground border-border"
      >
        <div className="space-y-2">
          <p className="font-display tracking-widest text-xs text-primary">DRIFT MARGIN ACCOUNT</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
            <span className="text-muted-foreground">Collateral</span>
            <span className="text-right text-foreground">${formatUsdValue(collateral)}</span>
            
            <span className="text-muted-foreground">Free</span>
            <span className="text-right text-foreground">${formatUsdValue(freeCollateral)}</span>
            
            <span className="text-muted-foreground">Unrealized PnL</span>
            <span className={cn("text-right", isPnlPositive ? "text-success" : "text-destructive")}>
              {isPnlPositive ? '+' : ''}${formatUsdValue(Math.abs(unrealizedPnl))}
            </span>
            
            <span className="text-muted-foreground">Leverage</span>
            <span className="text-right text-primary">{account.leverage.toFixed(2)}x</span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}