import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { X, Zap, AlertTriangle, ChevronDown, ChevronRight, Shield, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { elizaClient } from '@/lib/elizaClient';
import type { AutomationStatusResponse, AutomationPosition } from '@elizaos/api-client';

interface AutomationModalContentProps {
  onClose: () => void;
  /** Optional channel ID for trading updates (stored when enabling automation) */
  channelId?: string | null;
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
  circuitBreakerTrippedAt?: number;
  sessionPnL: number;
  cycleCount: number;
  errors: string[];
  lastCycleAt?: number;
}

const POLL_INTERVAL_MS = 5000;

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

// Persona-driven status messages
const getStatusMessage = (config: AutomationConfig, state: AutomationState | null, isConnecting: boolean): string => {
  if (isConnecting) return "Establishing connection...";
  if (!state) return "Awaiting parameters...";
  if (state.circuitBreakerTripped) return "Circuit breaker triggered. Standing by for reset.";
  if (config.enabled) {
    const assets = config.assets.map(a => a.replace('-PERP', '')).join(', ');
    return `Scanning ${assets} for opportunities...`;
  }
  return "Standing by. Ready to engage.";
};

export function AutomationModalContent({
  onClose,
  channelId,
}: AutomationModalContentProps) {
  const [state, setState] = useState<AutomationState | null>(null);
  const [positions, setPositions] = useState<AutomationPosition[]>([]);
  const [config, setConfig] = useState<AutomationConfig>(DEFAULT_CONFIG);
  const [localEdits, setLocalEdits] = useState<Partial<AutomationConfig>>({}); // Track local modifications
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [storeAvailable, setStoreAvailable] = useState(true);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const localEditsRef = useRef<Partial<AutomationConfig>>({}); // Ref for use in fetchStatus

  const fetchStatus = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      const response = await elizaClient.automation.getStatus();
      setStoreAvailable(response.storeAvailable);
      setPositions(response.positions || []);

      if (response.automation) {
        setState({
          config: response.automation.config,
          circuitBreakerTripped: response.automation.circuitBreakerTripped,
          circuitBreakerTrippedAt: response.automation.circuitBreakerTrippedAt,
          sessionPnL: response.automation.sessionPnL,
          cycleCount: response.automation.cycleCount,
          errors: response.automation.errors,
          lastCycleAt: response.automation.lastCycleAt,
        });
        // Merge server config with local edits (local takes precedence)
        setConfig({
          ...response.automation.config,
          ...localEditsRef.current,
        });
      } else {
        setState(null);
        setConfig({ ...DEFAULT_CONFIG, ...localEditsRef.current });
      }
    } catch (error) {
      console.error('Failed to fetch automation status:', error);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus(true);
    pollIntervalRef.current = setInterval(() => fetchStatus(false), POLL_INTERVAL_MS);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [fetchStatus]);

  const handleToggle = async () => {
    setIsSaving(true);
    const newEnabled = !config.enabled;

    try {
      // First update config if enabling
      if (newEnabled) {
        await elizaClient.automation.updateConfig({
          maxPositionPct: config.maxPositionPct,
          assets: config.assets,
          stopLossPct: config.stopLossPct,
          takeProfitPct: config.takeProfitPct,
          allowShorts: config.allowShorts,
          maxExposurePct: config.maxExposurePct,
          maxLeverage: config.maxLeverage,
          circuitBreakerPct: config.circuitBreakerPct,
          cooldownMinutes: config.cooldownMinutes,
          maxSlippageBps: config.maxSlippageBps,
        });
      }

      // Then toggle (pass channelId when enabling for trading updates)
      const response = await elizaClient.automation.toggle(newEnabled, newEnabled && channelId ? channelId : undefined);

      // Update local state from response
      if (response.automation) {
        setConfig(response.automation.config);
        setState({
          config: response.automation.config,
          circuitBreakerTripped: response.automation.circuitBreakerTripped,
          circuitBreakerTrippedAt: response.automation.circuitBreakerTrippedAt,
          sessionPnL: response.automation.sessionPnL,
          cycleCount: response.automation.cycleCount,
          errors: response.automation.errors,
          lastCycleAt: response.automation.lastCycleAt,
        });
      }

      // Clear local edits after successful toggle
      localEditsRef.current = {};
      setLocalEdits({});
    } catch (error) {
      console.error('Failed to toggle automation:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleHalt = async () => {
    setIsSaving(true);
    try {
      const response = await elizaClient.automation.toggle(false);

      // Update local state from response
      if (response.automation) {
        setConfig(response.automation.config);
        setState({
          config: response.automation.config,
          circuitBreakerTripped: response.automation.circuitBreakerTripped,
          circuitBreakerTrippedAt: response.automation.circuitBreakerTrippedAt,
          sessionPnL: response.automation.sessionPnL,
          cycleCount: response.automation.cycleCount,
          errors: response.automation.errors,
          lastCycleAt: response.automation.lastCycleAt,
        });
      }
    } catch (error) {
      console.error('Failed to halt automation:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetCircuitBreaker = async () => {
    if (!state) return;
    // Optimistic UI update
    setState(prev => prev ? { ...prev, circuitBreakerTripped: false } : null);
    // TODO: Add API endpoint for circuit breaker reset when needed
  };

  // Helper to track local edits
  const trackLocalEdit = <K extends keyof AutomationConfig>(field: K, value: AutomationConfig[K]) => {
    const newEdits = { ...localEditsRef.current, [field]: value };
    localEditsRef.current = newEdits;
    setLocalEdits(newEdits);
  };

  const handleAssetToggle = (asset: string) => {
    setConfig(prev => {
      const newAssets = prev.assets.includes(asset)
        ? prev.assets.filter(a => a !== asset)
        : [...prev.assets, asset];
      const finalAssets = newAssets.length > 0 ? newAssets : [asset];
      trackLocalEdit('assets', finalAssets);
      return { ...prev, assets: finalAssets };
    });
  };

  const handleFieldChange = (field: keyof AutomationConfig, value: number | undefined) => {
    trackLocalEdit(field, value as AutomationConfig[typeof field]);
    setConfig(prev => ({ ...prev, [field]: value }));
    setEditingField(null);
  };

  // Increment/decrement handlers for cyber number input
  const handleIncrement = (
    field: keyof AutomationConfig,
    currentValue: number | undefined,
    min: number,
    max: number,
    step: number = 1
  ) => {
    const current = currentValue ?? min;
    const newValue = Math.min(max, current + step);
    trackLocalEdit(field, newValue as AutomationConfig[typeof field]);
    setConfig(prev => ({ ...prev, [field]: newValue }));
  };

  const handleDecrement = (
    field: keyof AutomationConfig,
    currentValue: number | undefined,
    min: number,
    max: number,
    step: number = 1
  ) => {
    const current = currentValue ?? min;
    const newValue = Math.max(min, current - step);
    trackLocalEdit(field, newValue as AutomationConfig[typeof field]);
    setConfig(prev => ({ ...prev, [field]: newValue }));
  };

  const renderEditableValue = (
    field: keyof AutomationConfig,
    value: number | undefined,
    suffix: string = '%',
    min: number = 0,
    max: number = 100
  ) => {
    return (
      <div className="cyber-number-wrapper">
        <span
          className="editable-value cursor-text"
          onClick={() => setEditingField(field)}
        >
          {value !== undefined ? value : '\u2014'}
        </span>
        <span className="text-primary font-mono ml-0.5">{suffix}</span>
        <div className="cyber-number-spinners">
          <button
            type="button"
            className="cyber-number-btn cyber-number-btn--up"
            onClick={() => handleIncrement(field, value, min, max)}
            tabIndex={-1}
          />
          <button
            type="button"
            className="cyber-number-btn cyber-number-btn--down"
            onClick={() => handleDecrement(field, value, min, max)}
            tabIndex={-1}
          />
        </div>
      </div>
    );
  };

  // PnL calculations
  const pnlDisplay = state?.sessionPnL ?? 0;
  const pnlClass = pnlDisplay > 0 ? 'pnl-positive' : pnlDisplay < 0 ? 'pnl-negative' : 'pnl-neutral';
  const pnlArrow = pnlDisplay > 0 ? '\u25B2' : pnlDisplay < 0 ? '\u25BC' : '\u00B7';

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="relative">
          <Zap className="size-10 text-primary lina-breath" />
        </div>
        <p className="mt-6 text-muted-foreground uppercase text-xs tracking-widest">
          Initializing...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      {/* Header - Seamless with modal */}
      <div className="flex items-center justify-between border-b border-muted/30 pb-4">
        <div className="flex items-center gap-3">
          {/* Lina's Breathing Indicator */}
          <div className="relative">
            <div className={cn(
              "size-2 rounded-full",
              config.enabled ? "bg-primary lina-breath" : "bg-muted-foreground/50"
            )} />
          </div>
          <h2 className="text-2xl font-display uppercase tracking-wide">
            <span className="text-muted-foreground">Automation:</span>{' '}
            <span className="text-primary">Lina</span>
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Status Row - Integrated, no inner box */}
      <div className="flex items-center gap-6 flex-wrap">
        {/* Pill Toggle */}
        <button
          className={cn(
            "toggle-pill",
            config.enabled ? "toggle-pill--active" : "toggle-pill--standby",
            isSaving && "opacity-50 pointer-events-none"
          )}
          onClick={handleToggle}
          disabled={isSaving}
        >
          <span className={cn(
            "toggle-knob",
            config.enabled ? "toggle-knob--on" : "toggle-knob--off"
          )} />
          <span>{config.enabled ? 'ACTIVE' : 'STANDBY'}</span>
        </button>

        {/* PnL Display */}
        <div className={cn("flex items-center gap-1.5 font-mono text-sm", pnlClass)}>
          <span className="text-lg">{pnlArrow}</span>
          <span>${Math.abs(pnlDisplay).toFixed(2)}</span>
        </div>

        {/* Circuit Breaker Status */}
        <div className={cn(
          "flex items-center gap-1.5 text-sm",
          state?.circuitBreakerTripped ? "circuit-tripped" : "circuit-ok"
        )}>
          {state?.circuitBreakerTripped ? (
            <>
              <ShieldAlert className="size-4" />
              <span className="uppercase text-xs tracking-wide">Tripped</span>
              <button
                className="ml-1 text-xs border border-current px-1.5 py-0.5 rounded hover:bg-current/10 transition-colors"
                onClick={handleResetCircuitBreaker}
              >
                Reset
              </button>
            </>
          ) : (
            <>
              <Shield className="size-4" />
              <span className="uppercase text-xs tracking-wide">Protected</span>
            </>
          )}
        </div>

        {/* Halt Button */}
        {config.enabled && (
          <button
            className="halt-btn ml-auto text-xs"
            onClick={handleHalt}
            disabled={isSaving}
          >
            Halt
          </button>
        )}
      </div>

      {/* Lina's Status Message */}
      <p className="text-sm text-muted-foreground/80 italic border-l-2 border-primary/30 pl-3">
        {getStatusMessage(config, state, isLoading)}
      </p>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-muted/50 to-transparent" />

      {/* Configuration Section */}
      <div className="space-y-4">
        {/* Assets */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Assets</span>
          <div className="flex gap-2 flex-wrap">
            {AVAILABLE_ASSETS.map(asset => (
              <button
                key={asset}
                className={cn(
                  "px-3 py-1 rounded-full text-xs uppercase tracking-wide transition-all",
                  config.assets.includes(asset)
                    ? "bg-primary/20 text-primary border border-primary/40"
                    : "bg-muted/30 text-muted-foreground border border-transparent hover:border-muted-foreground/30"
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
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Max Position</span>
          {renderEditableValue('maxPositionPct', config.maxPositionPct, '%', 1, 50)}
        </div>

        {/* Stop Loss */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Stop Loss</span>
          {renderEditableValue('stopLossPct', config.stopLossPct, '%', 1, 50)}
        </div>

        {/* Take Profit */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Take Profit</span>
          {renderEditableValue('takeProfitPct', config.takeProfitPct, '%', 1, 100)}
        </div>
      </div>

      {/* Advanced Settings Toggle */}
      <button
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span>Advanced Parameters</span>
      </button>

      {/* Advanced Settings */}
      {showAdvanced && (
        <div className="space-y-3 pl-4 border-l border-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Max Exposure</span>
            {renderEditableValue('maxExposurePct', config.maxExposurePct, '%', 5, 100)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Max Leverage</span>
            {renderEditableValue('maxLeverage', config.maxLeverage, 'x', 1, 20)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Circuit Breaker</span>
            {renderEditableValue('circuitBreakerPct', config.circuitBreakerPct, '%', 1, 50)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Cooldown</span>
            {renderEditableValue('cooldownMinutes', config.cooldownMinutes, 'min', 1, 60)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Max Slippage</span>
            {renderEditableValue('maxSlippageBps', config.maxSlippageBps, 'bps', 10, 200)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Max Hold Time</span>
            {renderEditableValue('maxHoldMinutes', config.maxHoldMinutes, 'min', 0, 1440)}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Allow Shorts</span>
            <button
              className={cn(
                "px-3 py-1 rounded-full text-xs uppercase tracking-wide transition-all",
                config.allowShorts
                  ? "bg-primary/20 text-primary border border-primary/40"
                  : "bg-muted/30 text-muted-foreground border border-transparent hover:border-muted-foreground/30"
              )}
              onClick={() => {
                const newValue = !config.allowShorts;
                trackLocalEdit('allowShorts', newValue);
                setConfig(prev => ({ ...prev, allowShorts: newValue }));
              }}
            >
              {config.allowShorts ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>
      )}

      {/* Footer Stats */}
      {state && state.cycleCount > 0 && (
        <div className="flex justify-end pt-2 border-t border-muted/20">
          <span className="text-xs text-muted-foreground/60 font-mono">
            {state.cycleCount} cycles · {state.lastCycleAt ? `Last: ${new Date(state.lastCycleAt).toLocaleTimeString()}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
