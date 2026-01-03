import { useState, useEffect, useCallback } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { elizaClient } from '../../lib/elizaClient';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';

// Auto-refresh interval (10 seconds for positions)
const REFRESH_INTERVAL = 10_000;

interface Position {
  marketSymbol: string;
  side: 'long' | 'short';
  entryPrice: string;
  markPrice: string;
  notionalValue: string;
  unrealizedPnl: string;
}

interface ActivePositionBadgeProps {
  className?: string;
}

/**
 * Compact active position badges for header display
 * Shows current positions with unrealized PnL
 */
export function ActivePositionBadge({ className }: ActivePositionBadgeProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPositions = useCallback(async () => {
    try {
      const response = await elizaClient.automation.getStatus();
      if (response.positions && Array.isArray(response.positions)) {
        // Filter out zero-size positions
        const activePositions = response.positions.filter(
          (p: Position) => parseFloat(p.notionalValue) > 0
        );
        setPositions(activePositions);
      } else {
        setPositions([]);
      }
    } catch (err) {
      console.error('[ActivePositionBadge] Error fetching positions:', err);
      setPositions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(fetchPositions, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchPositions]);

  // Don't show if loading or no positions
  if (isLoading || positions.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {positions.slice(0, 2).map((pos) => {
        const pnl = parseFloat(pos.unrealizedPnl);
        const notional = parseFloat(pos.notionalValue);
        const entry = parseFloat(pos.entryPrice);
        const mark = parseFloat(pos.markPrice);
        const isPnlPositive = pnl >= 0;
        const assetName = pos.marketSymbol.replace('-PERP', '');

        return (
          <Tooltip key={pos.marketSymbol}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-default select-none",
                  "backdrop-blur-sm border",
                  isPnlPositive
                    ? "bg-emerald-500/15 border-emerald-400/40 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                    : "bg-red-500/15 border-red-400/40 shadow-[0_0_10px_rgba(239,68,68,0.15)]"
                )}
              >
                {/* Direction Icon */}
                {pos.side === 'long' ? (
                  <ArrowUpRight className="size-3.5 text-emerald-400" />
                ) : (
                  <ArrowDownRight className="size-3.5 text-red-400" />
                )}

                {/* Asset Name */}
                <span className="text-xs font-semibold text-white uppercase tracking-wide">
                  {assetName}
                </span>

                {/* PnL */}
                <span
                  className={cn(
                    "text-sm font-mono font-bold",
                    isPnlPositive ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {isPnlPositive ? '+' : ''}${pnl.toFixed(2)}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={8}
              className="max-w-xs !bg-zinc-900 !border !border-zinc-700 !text-zinc-100"
            >
              <div className="space-y-1.5">
                <p className="font-medium text-sm text-white">
                  {pos.side.toUpperCase()} {assetName}
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-zinc-400">Size:</span>
                  <span className="font-mono text-zinc-100">${notional.toFixed(2)}</span>
                  <span className="text-zinc-400">Entry:</span>
                  <span className="font-mono text-zinc-100">${entry.toFixed(2)}</span>
                  <span className="text-zinc-400">Mark:</span>
                  <span className="font-mono text-zinc-100">${mark.toFixed(2)}</span>
                  <span className="text-zinc-400">PnL:</span>
                  <span className={cn("font-mono", isPnlPositive ? "text-emerald-400" : "text-red-400")}>
                    {isPnlPositive ? '+' : ''}${pnl.toFixed(2)}
                  </span>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
