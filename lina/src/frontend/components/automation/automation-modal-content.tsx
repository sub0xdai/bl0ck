import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, Zap, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { socketManager } from '@/lib/socketManager';

interface AutomationModalContentProps {
  onClose: () => void;
  userId: string;
  agentId: string;
  channelId: string | null;
}

interface AutomationConfig {
  enabled: boolean;
  assets: string[];
  maxPositionPct: number;
  maxExposurePct: number;
  maxLeverage: number;
  allowShorts: boolean;
  circuitBreakerPct: number;
  cooldownMinutes: number;
  maxSlippageBps: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  maxHoldMinutes?: number;
}

interface AutomationState {
  config: AutomationConfig;
  circuitBreakerTripped: boolean;
  sessionPnL: number;
  cycleCount: number;
  errors: string[];
}

const DEFAULT_CONFIG: AutomationConfig = {
  enabled: false,
  assets: ['SOL-PERP'],
  maxPositionPct: 5,
  maxExposurePct: 25,
  maxLeverage: 3,
  allowShorts: false,
  circuitBreakerPct: 10,
  cooldownMinutes: 5,
  maxSlippageBps: 50,
  stopLossPct: 3,
  takeProfitPct: 10,
};

const AVAILABLE_ASSETS = ['SOL-PERP', 'BTC-PERP', 'ETH-PERP'];

export function AutomationModalContent({
  onClose,
  userId,
  agentId,
  channelId
}: AutomationModalContentProps) {
  const [state, setState] = useState<AutomationState | null>(null);
  const [config, setConfig] = useState<AutomationConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Lina is idle.');

  // Fetch current status on mount
  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      // Send a status request through the socket
      if (channelId) {
        socketManager.sendMessage(channelId, 'Show strategy status', userId, agentId);
        // We'll update state when we receive the response
        // For now, simulate with default state after a delay
        setTimeout(() => {
          setState({
            config: DEFAULT_CONFIG,
            circuitBreakerTripped: false,
            sessionPnL: 0,
            cycleCount: 0,
            errors: [],
          });
          setConfig(DEFAULT_CONFIG);
          setIsLoading(false);
        }, 500);
      } else {
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Failed to fetch automation status:', error);
      setIsLoading(false);
    }
  };

  const handleToggle = async () => {
    if (!channelId) return;

    setIsSaving(true);
    const newEnabled = !config.enabled;

    try {
      if (newEnabled) {
        // Build the enable command with current config
        const configStr = [
          `maxPositionPct ${config.maxPositionPct}`,
          `assets ${config.assets.join(',')}`,
          config.stopLossPct ? `stopLossPct ${config.stopLossPct}` : '',
          config.takeProfitPct ? `takeProfitPct ${config.takeProfitPct}` : '',
        ].filter(Boolean).join(', ');

        socketManager.sendMessage(
          channelId,
          `Update automation config: ${configStr}`,
          userId,
          agentId
        );

        // Small delay then enable
        setTimeout(() => {
          socketManager.sendMessage(channelId, 'Enable automation', userId, agentId);
        }, 500);

        setStatusMessage('Lina is starting up...');
      } else {
        socketManager.sendMessage(channelId, 'Disable automation', userId, agentId);
        setStatusMessage('Lina is idle.');
      }

      setConfig(prev => ({ ...prev, enabled: newEnabled }));
    } catch (error) {
      console.error('Failed to toggle automation:', error);
    } finally {
      setTimeout(() => setIsSaving(false), 1000);
    }
  };

  const handleHalt = async () => {
    if (!channelId) return;

    setIsSaving(true);
    try {
      socketManager.sendMessage(channelId, 'Disable automation', userId, agentId);
      setConfig(prev => ({ ...prev, enabled: false }));
      setStatusMessage('Lina halted.');
    } catch (error) {
      console.error('Failed to halt automation:', error);
    } finally {
      setTimeout(() => setIsSaving(false), 1000);
    }
  };

  const handleResetCircuitBreaker = async () => {
    if (!channelId || !state) return;

    // For now, just update local state
    // In real implementation, this would call an API
    setState(prev => prev ? { ...prev, circuitBreakerTripped: false } : null);
  };

  const handleAssetToggle = (asset: string) => {
    setConfig(prev => {
      const newAssets = prev.assets.includes(asset)
        ? prev.assets.filter(a => a !== asset)
        : [...prev.assets, asset];
      return { ...prev, assets: newAssets.length > 0 ? newAssets : [asset] };
    });
  };

  const handleFieldChange = (field: keyof AutomationConfig, value: number | undefined) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setEditingField(null);
  };

  const renderEditableValue = (
    field: keyof AutomationConfig,
    value: number | undefined,
    suffix: string = '%',
    min: number = 0,
    max: number = 100
  ) => {
    if (editingField === field) {
      return (
        <input
          type="number"
          className="w-16 bg-card border border-primary rounded px-2 py-0.5 text-foreground text-right"
          defaultValue={value ?? ''}
          min={min}
          max={max}
          autoFocus
          onBlur={(e) => handleFieldChange(field, e.target.value ? Number(e.target.value) : undefined)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleFieldChange(field, e.currentTarget.value ? Number(e.currentTarget.value) : undefined);
            }
            if (e.key === 'Escape') {
              setEditingField(null);
            }
          }}
        />
      );
    }

    return (
      <button
        className="text-primary hover:underline cursor-pointer"
        onClick={() => setEditingField(field)}
      >
        {value !== undefined ? `${value}${suffix}` : '—'}
      </button>
    );
  };

  const pnlDisplay = state?.sessionPnL ?? 0;
  const pnlPrefix = pnlDisplay > 0 ? '▲' : pnlDisplay < 0 ? '▼' : '──';
  const pnlColor = pnlDisplay > 0 ? 'text-success' : pnlDisplay < 0 ? 'text-destructive' : 'text-muted-foreground';

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Zap className="size-8 text-primary animate-pulse" />
        <p className="mt-4 text-muted-foreground uppercase text-sm">Loading automation status...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display uppercase flex items-center gap-2">
          <Zap className="size-5 text-primary" />
          Automation: Lina
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Status Row */}
      <div className="ring-2 ring-pop rounded-lg p-4 bg-card">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Toggle */}
          <button
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all",
              config.enabled
                ? "border-success bg-success/10 text-success"
                : "border-muted-foreground bg-muted/10 text-muted-foreground",
              isSaving && "opacity-50 pointer-events-none"
            )}
            onClick={handleToggle}
            disabled={isSaving}
          >
            <span className="text-xs font-mono">
              {config.enabled ? '[────●]' : '[○────]'}
            </span>
            <span className="uppercase text-sm font-bold">
              {config.enabled ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* PnL */}
          <div className={cn("flex items-center gap-1", pnlColor)}>
            <span>{pnlPrefix}</span>
            <span className="font-mono">${Math.abs(pnlDisplay).toFixed(2)}</span>
          </div>

          {/* Circuit Breaker */}
          <div className={cn(
            "flex items-center gap-1 text-sm",
            state?.circuitBreakerTripped ? "text-destructive" : "text-success"
          )}>
            {state?.circuitBreakerTripped ? (
              <>
                <AlertTriangle className="size-4" />
                <span>TRIPPED</span>
                <button
                  className="ml-1 text-xs underline hover:no-underline"
                  onClick={handleResetCircuitBreaker}
                >
                  [RESET]
                </button>
              </>
            ) : (
              <>
                <span>✓</span>
                <span>Circuit: OK</span>
              </>
            )}
          </div>

          {/* Halt Button (only when enabled) */}
          {config.enabled && (
            <button
              className="ml-auto px-3 py-1 rounded bg-destructive text-destructive-foreground text-sm uppercase font-bold hover:bg-destructive/80 transition-colors"
              onClick={handleHalt}
              disabled={isSaving}
            >
              HALT
            </button>
          )}
        </div>

        {/* Status Message */}
        <p className="mt-3 text-sm text-muted-foreground italic">
          {config.enabled
            ? `Monitoring ${config.assets.join(', ')}...`
            : statusMessage}
        </p>
      </div>

      {/* Essential Settings */}
      <div className="space-y-3">
        {/* Assets */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground uppercase">Assets</span>
          <div className="flex gap-1.5 flex-wrap">
            {AVAILABLE_ASSETS.map(asset => (
              <button
                key={asset}
                className={cn(
                  "px-2 py-0.5 rounded text-xs uppercase transition-colors",
                  config.assets.includes(asset)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
                onClick={() => handleAssetToggle(asset)}
              >
                {asset.replace('-PERP', '')}
              </button>
            ))}
          </div>
        </div>

        {/* Max Position */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground uppercase">Max Position</span>
          {renderEditableValue('maxPositionPct', config.maxPositionPct, '%', 1, 50)}
        </div>

        {/* Stop Loss */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground uppercase">Stop Loss</span>
          {renderEditableValue('stopLossPct', config.stopLossPct, '%', 1, 50)}
        </div>

        {/* Take Profit */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground uppercase">Take Profit</span>
          {renderEditableValue('takeProfitPct', config.takeProfitPct, '%', 1, 100)}
        </div>
      </div>

      {/* Advanced Settings Toggle */}
      <button
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <span className="uppercase">Advanced</span>
      </button>

      {/* Advanced Settings */}
      {showAdvanced && (
        <div className="space-y-3 pl-4 border-l-2 border-muted">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground uppercase">Max Exposure</span>
            {renderEditableValue('maxExposurePct', config.maxExposurePct, '%', 5, 100)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground uppercase">Max Leverage</span>
            {renderEditableValue('maxLeverage', config.maxLeverage, 'x', 1, 20)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground uppercase">Circuit Breaker</span>
            {renderEditableValue('circuitBreakerPct', config.circuitBreakerPct, '%', 1, 50)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground uppercase">Cooldown</span>
            {renderEditableValue('cooldownMinutes', config.cooldownMinutes, 'min', 1, 60)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground uppercase">Max Slippage</span>
            {renderEditableValue('maxSlippageBps', config.maxSlippageBps, 'bps', 10, 200)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground uppercase">Max Hold Time</span>
            {renderEditableValue('maxHoldMinutes', config.maxHoldMinutes, 'min', 0, 1440)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground uppercase">Allow Shorts</span>
            <button
              className={cn(
                "px-2 py-0.5 rounded text-xs uppercase transition-colors",
                config.allowShorts
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
              onClick={() => setConfig(prev => ({ ...prev, allowShorts: !prev.allowShorts }))}
            >
              {config.allowShorts ? 'Yes' : 'No'}
            </button>
          </div>
        </div>
      )}

      {/* Cycle Count */}
      {state && state.cycleCount > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {state.cycleCount} cycles completed
        </p>
      )}
    </div>
  );
}
