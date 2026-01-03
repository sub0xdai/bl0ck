# Lina Trading UX Improvements: conversational & Visual Updates

This plan details how to make Lina communicate naturally about auto-trading in chat and display active positions prominently in the UI.

---

## Phase 1: Conversational Intelligence (Backend)

**File:** `lina/src/plugins/plugin-strategy-core/src/services/strategy-loop.service.ts`

### 1.1 Add Market Analysis Formatter
Add this method to the `StrategyLoop` class to parse raw signals into sentences.

```typescript
private formatMarketAnalysis(signals: Signal[]): string {
    if (signals.length === 0) return "Scanning the markets... no clear signals yet.";

    const topSignal = [...signals].sort((a, b) => b.confidence - a.confidence)[0];
    if (!topSignal || topSignal.direction === 'NEUTRAL') {
        return "Scanning the markets... conditions are mixed, looking for clearer setups.";
    }

    const assetName = topSignal.asset.replace('-PERP', '');
    const confidencePct = (topSignal.confidence * 100).toFixed(0);
    const direction = topSignal.direction === 'LONG' ? 'bullish' : 'bearish';
    
    let perfText = "";
    const trendSource = topSignal.sources.find(s => s.name === 'trend');
    if (trendSource?.rawData) {
        const data = trendSource.rawData as any;
        if (data.priceChange7d) {
            perfText = ` - ${data.priceChange7d >= 0 ? 'up' : 'down'} ${Math.abs(data.priceChange7d).toFixed(1)}% this week`;
        }
    }

    return `Scanning the markets... ${assetName} looks ${direction} (${confidencePct}% confidence)${perfText}.`;
}
```

### 1.2 Update Cycle & Open Messages
In `executeCycleForUser`, update the status notifications:

**Cycle Start:**
```typescript
const analysisMsg = this.formatMarketAnalysis(signals);
await this.sendChatMessage(channelId, analysisMsg, "Market Scan", ['CYCLE_START']);
```

**Position Open (Inside Success Block):**
```typescript
const reason = perfText || "momentum is strong"; 
const msg = direction === 'LONG' 
    ? `Going long on ${assetName} with $${size} (${leverage}x) - ${reason}`
    : `Going short on ${assetName} with $${size} (${leverage}x) - ${reason}`;
await this.sendChatMessage(channelId, msg, "Opening Position", ['OPEN_POSITION']);
```

---

## Phase 2: Periodic PnL Updates (Backend)

**File:** `lina/src/plugins/plugin-strategy-core/src/services/position-monitor.service.ts`

### 2.1 Add State Tracking
Add a map to the `PositionMonitor` class to prevent notification spam.

```typescript
private lastNotifiedThresholds: Map<string, number> = new Map(); // Key: userId-asset
```

### 2.2 Update Monitor Loop
Inside the `start()` loop, check for 5% PnL increments:

```typescript
for (const position of positions) {
    const pnl = position.unrealizedPnlPct;
    const absPnl = Math.abs(pnl);
    const threshold = Math.floor(absPnl / 5) * 5;

    const key = `${userId}-${position.marketSymbol}`;
    const lastThreshold = this.lastNotifiedThresholds.get(key) || 0;

    if (threshold >= 5 && threshold > lastThreshold) {
        this.lastNotifiedThresholds.set(key, threshold);
        const icon = pnl >= 0 ? "📈" : "📉";
        const status = pnl >= 0 ? "up" : "down";
        // Trigger onPnlThreshold callback to StrategyLoop
    }
}
```

---

## Phase 3: Visual Intelligence (Frontend)

### 3.1 Create Position Badge
**File:** `lina/src/frontend/components/drift/ActivePositionBadge.tsx`

```tsx
import React, { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { elizaClient } from '@/lib/elizaClient';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function ActivePositionBadge() {
  const [positions, setPositions] = useState([]);
  
  useEffect(() => {
    const fetch = async () => {
      const res = await elizaClient.automation.getStatus();
      if (res.positions) setPositions(res.positions);
    };
    fetch();
    const interval = setInterval(fetch, 10000);
    return () => clearInterval(interval);
  }, []);

  if (positions.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {positions.slice(0, 2).map((pos: any) => (
        <Tooltip key={pos.marketSymbol}>
          <TooltipTrigger asChild>
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono cursor-help",
              parseFloat(pos.unrealizedPnl) >= 0 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" 
                : "bg-red-500/10 border-red-500/20 text-red-500"
            )}>
              {pos.side === 'long' ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}
              {pos.marketSymbol.replace('-PERP', '')} ${parseFloat(pos.unrealizedPnl).toFixed(2)}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs">
              Size: ${parseFloat(pos.notionalValue).toFixed(2)} | Entry: ${parseFloat(pos.entryPrice).toFixed(2)}
            </div>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
```

### 3.2 Header Integration
**File:** `lina/src/frontend/screens/MainApp.tsx`

```tsx
<div className="hidden md:flex flex-1 justify-center items-center gap-3">
  <DriftBalanceBadge />
  <ActivePositionBadge />
</div>
```
