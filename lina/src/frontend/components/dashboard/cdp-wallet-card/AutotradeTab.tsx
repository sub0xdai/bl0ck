import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '../../ui/button';
import { useLoadingPanel } from '../../../contexts/LoadingPanelContext';
import { cn } from '../../../lib/utils';
import { Play, Square, RefreshCw, AlertCircle, Clock, DollarSign } from 'lucide-react';

// Auto-refresh interval in milliseconds (30 seconds)
const REFRESH_INTERVAL = 30_000;

// API base URL
const API_BASE = window.location.origin;

interface AutotradeSubscription {
  userId: string;
  status: 'active' | 'inactive';
  expiresAt: number;
  activatedAt: number;
  lastRenewalAt: number;
  totalPaid: number;
  txSignatures: string[];
}

interface AutotradeStatusResponse {
  success: boolean;
  data: {
    active: boolean;
    subscription: AutotradeSubscription | null;
  };
}

interface AutotradeStartResponse {
  success: boolean;
  data?: {
    message: string;
    subscription: AutotradeSubscription;
  };
  accepts?: {
    scheme: string;
    network: string;
    payTo: string;
    amount: string;
    memo: string;
    expiresAt: number;
  };
}

interface AutotradeTabProps {
  userId: string;
  isActive?: boolean;
}

// ASCII art for inactive autotrade
const INACTIVE_ART = `
    ╭──────────╮
    │  ◉  ◯    │
    │ ─────────│
    │ autotrade│
    ╰──────────╯
`;

// Format time remaining
function formatTimeRemaining(expiresAt: number): string {
  const now = Date.now();
  const remaining = expiresAt - now;

  if (remaining <= 0) return 'Expired';

  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  return `${hours}h ${minutes}m`;
}

// Format date
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AutotradeTab({ userId, isActive = true }: AutotradeTabProps) {
  const { showLoading, showSuccess, showError, hide } = useLoadingPanel();
  const [subscription, setSubscription] = useState<AutotradeSubscription | null>(null);
  const [isAutotradeActive, setIsAutotradeActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get auth token from localStorage
  const getAuthToken = useCallback(() => {
    return localStorage.getItem('auth-token');
  }, []);

  // Fetch autotrade status
  const fetchStatus = useCallback(async (showLoadingState = true) => {
    if (!userId) return;

    const token = getAuthToken();
    if (!token) {
      setError('Not authenticated');
      setIsLoading(false);
      return;
    }

    if (showLoadingState) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/autotrade/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch status: ${response.status}`);
      }

      const data: AutotradeStatusResponse = await response.json();

      setSubscription(data.data.subscription);
      setIsAutotradeActive(data.data.active);
      setLastUpdated(new Date());
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[AutotradeTab] Error fetching status:', errorMsg);
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [userId, getAuthToken]);

  // Start autotrade - uses server-side payment flow
  const handleStart = async () => {
    const token = getAuthToken();
    if (!token) {
      showError('Authentication Error', 'Please sign in to use autotrade');
      return;
    }

    setIsActionLoading(true);
    const panelId = 'autotrade-start-panel';
    showLoading('Activating Autotrade', 'Processing payment...', panelId);

    try {
      // Use pay-and-activate endpoint - handles payment + activation in one step
      const response = await fetch(`${API_BASE}/api/autotrade/pay-and-activate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle specific error codes
        if (data.error?.code === 'INSUFFICIENT_BALANCE') {
          showError('Insufficient Balance', data.error.message, panelId);
        } else if (data.error?.code === 'ALREADY_ACTIVE') {
          showError('Already Active', 'Your autotrade subscription is already active', panelId);
          await fetchStatus(false);
        } else {
          throw new Error(data.error?.message || 'Failed to start autotrade');
        }
        return;
      }

      showSuccess('Autotrade Activated', data.data?.message || 'Autotrade is now running!', panelId);
      await fetchStatus(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      showError('Start Failed', errorMsg, panelId);
    } finally {
      setIsActionLoading(false);
      setTimeout(() => hide(panelId), 3000);
    }
  };

  // Stop autotrade
  const handleStop = async () => {
    const token = getAuthToken();
    if (!token) {
      showError('Authentication Error', 'Please sign in');
      return;
    }

    setIsActionLoading(true);
    const panelId = 'autotrade-stop-panel';
    showLoading('Stopping Autotrade', 'Deactivating subscription...', panelId);

    try {
      const response = await fetch(`${API_BASE}/api/autotrade/stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to stop autotrade');
      }

      showSuccess('Autotrade Stopped', 'Subscription deactivated successfully', panelId);
      await fetchStatus(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      showError('Stop Failed', errorMsg, panelId);
    } finally {
      setIsActionLoading(false);
      setTimeout(() => hide(panelId), 3000);
    }
  };

  // Initial fetch on mount
  useEffect(() => {
    fetchStatus(true);
  }, [fetchStatus]);

  // Auto-refresh when tab is active
  useEffect(() => {
    if (isActive && isAutotradeActive) {
      intervalRef.current = setInterval(() => {
        fetchStatus(false);
      }, REFRESH_INTERVAL);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isActive, isAutotradeActive, fetchStatus]);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="p-3 rounded-lg bg-muted/30 border border-border/30 animate-pulse">
          <div className="h-4 w-32 bg-muted rounded mb-3"></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="h-8 bg-muted rounded"></div>
            <div className="h-8 bg-muted rounded"></div>
          </div>
        </div>
        <div className="h-10 bg-muted rounded animate-pulse"></div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-3">
        <div className="text-xs text-red-500 bg-red-500/10 p-3 rounded border border-red-500/20 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchStatus(true)}
          className="w-full"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  // Inactive state - no subscription
  if (!isAutotradeActive) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-4 text-muted-foreground/50">
          <pre className="text-[10px] leading-tight font-mono select-none opacity-40">
            {INACTIVE_ART.trim()}
          </pre>
          <p className="text-xs mt-2 text-muted-foreground/70">
            Autotrade is not active
          </p>
          <p className="text-[10px] mt-0.5 text-muted-foreground/40">
            Let Lina manage your portfolio for $1/day
          </p>
        </div>

        <div className="p-3 rounded-lg bg-muted/20 border border-border/20">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-green-400" />
            <span className="text-xs font-medium">Subscription Details</span>
          </div>
          <ul className="text-[11px] text-muted-foreground space-y-1">
            <li>• $1 USDC per day</li>
            <li>• Auto-renews from your wallet</li>
            <li>• Stop anytime, positions closed</li>
            <li>• Lina trades your entire portfolio</li>
          </ul>
        </div>

        <Button
          onClick={handleStart}
          disabled={isActionLoading}
          className="w-full bg-green-600 hover:bg-green-700"
          size="lg"
        >
          {isActionLoading ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Start Autotrade ($1/day)
            </>
          )}
        </Button>
      </div>
    );
  }

  // Active state - show subscription details
  return (
    <div className="space-y-3">
      {/* Status Card */}
      <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-[10px] uppercase tracking-wider text-green-400 font-medium">
              Autotrade Active
            </span>
          </div>
          {lastUpdated && (
            <span className="text-[9px] text-muted-foreground/50 font-mono">
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>

        {subscription && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Expires
              </span>
              <span className="font-mono text-green-400">
                {formatTimeRemaining(subscription.expiresAt)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Started</span>
              <span className="font-mono text-xs">
                {formatDate(subscription.activatedAt)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Paid</span>
              <span className="font-mono">${subscription.totalPaid.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Renewals</span>
              <span className="font-mono">{subscription.txSignatures.length}</span>
            </div>
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="p-3 rounded-lg bg-muted/20 border border-border/20">
        <p className="text-[11px] text-muted-foreground">
          Lina is actively managing your portfolio. She will auto-renew when your subscription expires,
          deducting $1 USDC from your wallet. Stop autotrade to close all positions.
        </p>
      </div>

      {/* Stop Button */}
      <Button
        onClick={handleStop}
        disabled={isActionLoading}
        variant="destructive"
        className="w-full"
        size="default"
      >
        {isActionLoading ? (
          <>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            Stopping...
          </>
        ) : (
          <>
            <Square className="w-4 h-4 mr-2" />
            Stop Autotrade
          </>
        )}
      </Button>
    </div>
  );
}
