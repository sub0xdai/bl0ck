import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { X, Zap, ChevronRight, Shield, ShieldAlert, MessageSquare, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { elizaClient } from '@/lib/elizaClient';
import { ConfirmationDialog } from './confirmation-dialog';

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
  channelId?: string; // Chat channel for trading updates
  circuitBreakerTripped: boolean;
  circuitBreakerTrippedAt?: number;
  sessionPnL: number;
  cycleCount: number;
  errors: string[];
  lastCycleAt?: number;
}

interface AutomationPosition {
  marketSymbol: string;
  side: 'long' | 'short';
  notionalValue: string;
  unrealizedPnl: string;
  entryPrice: string;
  markPrice: string;
}

const POLL_INTERVAL_MS = 5000;
const FIRST_TIME_HINT_KEY = 'lina-automation-seen';

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
  if (!state) return "Configure your parameters and activate to begin.";
  if (state.circuitBreakerTripped) return "Circuit breaker triggered. Review and reset to resume.";
  if (config.enabled) {
    const assets = config.assets.map(a => a.replace('-PERP', '')).join(', ');
    return `Monitoring ${assets}. I'll share my analysis in chat.`;
  }
  return "Ready to trade. Activate when you want me to begin.";
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
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showFirstTimeHint, setShowFirstTimeHint] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const localEditsRef = useRef<Partial<AutomationConfig>>({}); // Ref for use in fetchStatus
  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);

  const fetchStatus = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      const response = await elizaClient.automation.getStatus();
      setStoreAvailable(response.storeAvailable);
      // Filter out ghost positions (size = 0 or near-zero notional value)
      const activePositions = (response.positions || []).filter(p => {
        const notional = parseFloat(p.notionalValue);
        return Number.isFinite(notional) && Math.abs(notional) > 0.01;
      });
      setPositions(activePositions);

      if (response.automation) {
        setState({
          config: response.automation.config,
          channelId: response.automation.channelId,
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

  // Focus trap and keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showConfirmation) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showConfirmation]);

  useEffect(() => {
    fetchStatus(true);
    pollIntervalRef.current = setInterval(() => fetchStatus(false), POLL_INTERVAL_MS);
    
    // Focus first element on mount
    setTimeout(() => firstFocusableRef.current?.focus(), 100);
    
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [fetchStatus]);

  // Check for first-time user
  useEffect(() => {
    if (!localStorage.getItem(FIRST_TIME_HINT_KEY)) {
      setShowFirstTimeHint(true);
    }
  }, []);

  // Sync channelId when modal opens if automation is enabled but channelId is missing/different
  useEffect(() => {
    if (
      !isLoading &&
      state?.config.enabled &&
      channelId &&
      state.channelId !== channelId
    ) {
      console.log('[Automation] Syncing channelId:', {
        current: state.channelId,
        new: channelId,
      });
      elizaClient.automation.updateChannel(channelId).catch((err) => {
        console.error('[Automation] Failed to sync channelId:', err);
      });
      // Update local state immediately
      setState((prev) => prev ? { ...prev, channelId } : null);
    }
  }, [isLoading, state?.config.enabled, state?.channelId, channelId]);

  const dismissFirstTimeHint = () => {
    localStorage.setItem(FIRST_TIME_HINT_KEY, 'true');
    setShowFirstTimeHint(false);
  };

  const handleToggle = async () => {
    const newEnabled = !config.enabled;

    // If turning OFF and has open positions, show confirmation
    if (!newEnabled && positions.length > 0) {
      setShowConfirmation(true);
      return;
    }

    // Otherwise proceed directly
    await performToggle(newEnabled);
  };

  const performToggle = async (newEnabled: boolean) => {
    setIsSaving(true);
    setShowConfirmation(false);

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
    _min: number = 0,
    _max: number = 100
  ) => {
    return (
      <div className="inline-flex items-center gap-1">
        <span
          className="editable-value cursor-text hover:text-primary transition-colors"
          onClick={() => setEditingField(field)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setEditingField(field);
            }
          }}
          aria-label={`${field}: ${value !== undefined ? value : 'not set'} ${suffix}. Click to edit.`}
        >
          {value !== undefined ? value : '\u2014'}
        </span>
        <span className="text-primary font-mono" aria-hidden="true">{suffix}</span>
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
    <>
      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showConfirmation}
        onConfirm={() => performToggle(false)}
        onCancel={() => setShowConfirmation(false)}
        positionCount={positions.length}
      />

      <div className="flex flex-col gap-6 max-w-lg" ref={modalRef} role="dialog" aria-labelledby="automation-title">
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
            <h2 id="automation-title" className="text-2xl font-display uppercase tracking-wide">
              <span className="text-muted-foreground">Trading:</span>{' '}
              <span className="text-primary">Lina</span>
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={onClose}
            aria-label="Close automation modal"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* First-Time User Hint */}
        {showFirstTimeHint && !config.enabled && (
          <div className="automation-hint relative bg-primary/5 border border-primary/20 rounded-lg p-4">
            <button
              onClick={dismissFirstTimeHint}
              className="absolute top-2 right-2 text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted/50 transition-colors"
              aria-label="Dismiss hint"
            >
              <X className="size-3.5" />
            </button>
            <div className="flex items-start gap-3">
              <Sparkles className="size-5 text-primary shrink-0 mt-0.5" />
              <div className="space-y-2 pr-6">
                <p className="text-sm text-foreground font-medium">
                  How Lina's trading works
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  When active, I'll analyze the markets and share my trading reasoning
                  directly in our chat. You'll see my thought process before I execute
                  any trades, keeping you informed every step of the way.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Chat Integration Notice */}
        {channelId && (
          <div className="chat-integration-notice flex items-center gap-2.5 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2.5">
            <MessageSquare className="size-4 text-primary shrink-0" />
            <span>
              {config.enabled
                ? "Trading updates are appearing in this chat"
                : "Trading updates will appear in this chat when active"
              }
            </span>
          </div>
        )}

        {/* Status Row - Integrated, no inner box */}
        <div className="flex items-center gap-6 flex-wrap">
          {/* Enhanced Toggle Pill */}
          <button
            ref={firstFocusableRef}
            className={cn(
              "toggle-pill",
              config.enabled ? "toggle-pill--active" : "toggle-pill--standby",
              isSaving && "toggle-pill--loading"
            )}
            onClick={handleToggle}
            disabled={isSaving}
            aria-label={`Automation is ${config.enabled ? 'active' : 'on standby'}. Click to ${config.enabled ? 'stop' : 'start'}.`}
            aria-pressed={config.enabled}
          >
            {isSaving ? (
              <span className="toggle-pill__spinner" />
            ) : (
              <span className={cn(
                "toggle-knob",
                config.enabled ? "toggle-knob--on" : "toggle-knob--off"
              )} />
            )}
            <span>{isSaving ? 'SAVING...' : config.enabled ? 'ACTIVE' : 'STANDBY'}</span>
          </button>

          {/* PnL Display - Only show when there's activity */}
          {(state?.cycleCount ?? 0) > 0 && (
            <div className={cn("flex items-center gap-1.5 font-mono text-sm", pnlClass)} aria-label={`Profit and Loss: ${pnlDisplay > 0 ? 'positive' : pnlDisplay < 0 ? 'negative' : 'neutral'} $${Math.abs(pnlDisplay).toFixed(2)}`}>
              <span className="text-lg" aria-hidden="true">{pnlArrow}</span>
              <span>${Math.abs(pnlDisplay).toFixed(2)}</span>
            </div>
          )}

          {/* Circuit Breaker Status */}
          <div className={cn(
            "flex items-center gap-1.5 text-sm",
            state?.circuitBreakerTripped ? "circuit-tripped" : "circuit-ok"
          )} aria-label={`Circuit breaker ${state?.circuitBreakerTripped ? 'tripped' : 'protected'}`}>
            {state?.circuitBreakerTripped ? (
              <>
                <ShieldAlert className="size-4" aria-hidden="true" />
                <span className="uppercase text-xs tracking-wide">Tripped</span>
                <button
                  className="ml-1 text-xs border border-current px-1.5 py-0.5 rounded hover:bg-current/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  onClick={handleResetCircuitBreaker}
                  aria-label="Reset circuit breaker"
                >
                  Reset
                </button>
              </>
            ) : (
              <>
                <Shield className="size-4" aria-hidden="true" />
                <span className="uppercase text-xs tracking-wide">Protected</span>
              </>
            )}
          </div>
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
          <div className="flex gap-2 flex-wrap" role="group" aria-label="Trading assets">
            {AVAILABLE_ASSETS.map(asset => {
              const isSelected = config.assets.includes(asset);
              const isLastSelected = config.assets.length === 1 && isSelected;
              return (
                <button
                  key={asset}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs uppercase tracking-wide transition-all",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                    isSelected
                      ? "bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30"
                      : "bg-muted/30 text-muted-foreground border border-transparent hover:border-muted-foreground/30 hover:bg-muted/40",
                    isLastSelected && "opacity-60 cursor-not-allowed"
                  )}
                  onClick={() => !isLastSelected && handleAssetToggle(asset)}
                  disabled={isLastSelected}
                  aria-pressed={isSelected}
                  aria-label={`${asset.replace('-PERP', '')} perpetual trading ${isSelected ? 'selected' : 'not selected'}${isLastSelected ? ' (cannot deselect last asset)' : ''}`}
                  title={isLastSelected ? 'At least one asset must be selected' : undefined}
                >
                  {asset.replace('-PERP', '')}
                </button>
              );
            })}
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
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-all uppercase tracking-wider focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/50"
        onClick={() => setShowAdvanced(!showAdvanced)}
        aria-expanded={showAdvanced}
        aria-controls="advanced-settings"
        aria-label={`${showAdvanced ? 'Hide' : 'Show'} advanced parameters`}
      >
        <ChevronRight className={cn("size-3 transition-transform duration-200", showAdvanced && "rotate-90")} aria-hidden="true" />
        <span>Advanced Parameters</span>
      </button>

      {/* Advanced Settings */}
      {showAdvanced && (
        <div 
          id="advanced-settings" 
          className="animate-in fade-in slide-in-from-top-2 duration-200"
        >
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
    </>
  );
}
