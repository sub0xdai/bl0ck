import { useState, useEffect, useCallback } from 'react';
import { ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
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
 * Compact active position display for header
 * Refactored to "Ticker" style: Text-based, glowing values, minimal icons.
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
    <div className={cn("flex items-center gap-4", className)}>
      {/* Separator from Balance */}
      <div className="w-px h-3 bg-border opacity-50" />
      
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
              <div className="flex items-center gap-2 cursor-default select-none group">
                {/* Direction Indicator */}
                <span className={cn(
                  "flex items-center justify-center size-4 rounded-full bg-opacity-10",
                  pos.side === 'long' ? "bg-success text-success" : "bg-destructive text-destructive"
                )}>
                  {pos.side === 'long' ? (
                    <ArrowUpRight className="size-3" />
                  ) : (
                    <ArrowDownRight className="size-3" />
                  )}
                </span>

                {/* Asset Name */}
                <span className="text-xs font-bold font-mono tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                  {assetName}
                </span>

                {/* PnL Value */}
                <span
                  className={cn(
                    "text-sm font-mono font-bold transition-all",
                    isPnlPositive ? "text-success text-glow" : "text-destructive text-glow"
                  )}
                >
                  {isPnlPositive ? '+' : ''}${pnl.toFixed(2)}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={8}
              className="!bg-black/95 !border-purple-500/30 backdrop-blur-md shadow-lg shadow-purple-500/10"
            >
              <div className="space-y-2 p-1">
                <div className="flex items-center gap-2 border-b border-purple-500/30 pb-2 mb-2">
                  <Activity className="size-3 text-purple-400" />
                  <span className="font-display tracking-widest text-xs text-purple-400 uppercase">
                    {pos.side} POSITION
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
                  <span className="text-gray-400">Asset</span>
                  <span className="text-right text-white font-bold">{assetName}</span>

                  <span className="text-gray-400">Size</span>
                  <span className="text-right text-white">${notional.toFixed(2)}</span>

                  <span className="text-gray-400">Entry Price</span>
                  <span className="text-right text-white">${entry.toFixed(2)}</span>

                  <span className="text-gray-400">Mark Price</span>
                  <span className="text-right text-white">${mark.toFixed(2)}</span>

                  <span className="text-gray-400">PnL</span>
                  <span className={cn("text-right font-bold", isPnlPositive ? "text-green-400" : "text-red-400")}>
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