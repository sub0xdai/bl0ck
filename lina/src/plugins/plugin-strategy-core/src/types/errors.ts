/**
 * Error codes for trading operations.
 */
export enum TradingErrorCode {
    // Risk management errors
    CIRCUIT_BREAKER_ACTIVE = 'CIRCUIT_BREAKER_ACTIVE',
    RISK_LIMIT_EXCEEDED = 'RISK_LIMIT_EXCEEDED',
    COOLDOWN_ACTIVE = 'COOLDOWN_ACTIVE',

    // Data provider errors
    DATA_PROVIDER_TIMEOUT = 'DATA_PROVIDER_TIMEOUT',
    DATA_PROVIDER_ERROR = 'DATA_PROVIDER_ERROR',
    STALE_PRICE_DATA = 'STALE_PRICE_DATA',

    // Execution errors
    EXECUTION_FAILED = 'EXECUTION_FAILED',
    INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
    POSITION_NOT_FOUND = 'POSITION_NOT_FOUND',

    // Phase 3: Transaction errors
    TX_CONFIRMATION_TIMEOUT = 'TX_CONFIRMATION_TIMEOUT',
    TX_SIMULATION_FAILED = 'TX_SIMULATION_FAILED',
    SLIPPAGE_EXCEEDED = 'SLIPPAGE_EXCEEDED',
    PRICE_DRIFT_EXCEEDED = 'PRICE_DRIFT_EXCEEDED',
    RPC_ERROR = 'RPC_ERROR',
    ORACLE_STALE = 'ORACLE_STALE',

    // Configuration errors
    INVALID_CONFIG = 'INVALID_CONFIG',
    AUTOMATION_DISABLED = 'AUTOMATION_DISABLED',

    // State errors
    STATE_LOAD_FAILED = 'STATE_LOAD_FAILED',
    STATE_SAVE_FAILED = 'STATE_SAVE_FAILED',
}

/**
 * Custom error class for trading operations.
 * Includes error code, recoverability flag, and context.
 */
export class TradingError extends Error {
    constructor(
        message: string,
        public readonly code: TradingErrorCode,
        public readonly recoverable: boolean,
        public readonly context?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'TradingError';

        // Maintain proper stack trace in V8 environments
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, TradingError);
        }
    }

    /**
     * Create a string representation for logging.
     */
    toLogString(): string {
        const contextStr = this.context
            ? ` | Context: ${JSON.stringify(this.context)}`
            : '';
        return `[${this.code}] ${this.message} (recoverable: ${this.recoverable})${contextStr}`;
    }
}

/**
 * Helper to create common trading errors.
 */
export const TradingErrors = {
    circuitBreakerActive: (drawdownPct: number) =>
        new TradingError(
            `Circuit breaker triggered at ${drawdownPct.toFixed(2)}% drawdown`,
            TradingErrorCode.CIRCUIT_BREAKER_ACTIVE,
            false,
            { drawdownPct }
        ),

    riskLimitExceeded: (reason: string, context?: Record<string, unknown>) =>
        new TradingError(
            `Risk limit exceeded: ${reason}`,
            TradingErrorCode.RISK_LIMIT_EXCEEDED,
            true,
            context
        ),

    cooldownActive: (asset: string, remainingMs: number) =>
        new TradingError(
            `Asset ${asset} is in cooldown for ${Math.ceil(remainingMs / 1000)}s`,
            TradingErrorCode.COOLDOWN_ACTIVE,
            true,
            { asset, remainingMs }
        ),

    dataProviderTimeout: (provider: string, timeoutMs: number) =>
        new TradingError(
            `Data provider ${provider} timed out after ${timeoutMs}ms`,
            TradingErrorCode.DATA_PROVIDER_TIMEOUT,
            true,
            { provider, timeoutMs }
        ),

    dataProviderError: (provider: string, originalError: unknown) =>
        new TradingError(
            `Data provider ${provider} error: ${originalError instanceof Error ? originalError.message : String(originalError)}`,
            TradingErrorCode.DATA_PROVIDER_ERROR,
            true,
            { provider, originalError: String(originalError) }
        ),

    stalePriceData: (asset: string, ageMs: number, maxAgeMs: number) =>
        new TradingError(
            `Price data for ${asset} is stale (${ageMs}ms old, max ${maxAgeMs}ms)`,
            TradingErrorCode.STALE_PRICE_DATA,
            true,
            { asset, ageMs, maxAgeMs }
        ),

    executionFailed: (reason: string, context?: Record<string, unknown>) =>
        new TradingError(
            `Trade execution failed: ${reason}`,
            TradingErrorCode.EXECUTION_FAILED,
            true,
            context
        ),

    // Phase 3: Transaction errors
    txConfirmationTimeout: (txSig: string, timeoutMs: number) =>
        new TradingError(
            `Transaction ${txSig.substring(0, 16)}... confirmation timed out after ${timeoutMs}ms`,
            TradingErrorCode.TX_CONFIRMATION_TIMEOUT,
            true, // Recoverable - tx may still land
            { txSig, timeoutMs }
        ),

    txSimulationFailed: (reason: string, txSig?: string) =>
        new TradingError(
            `Transaction simulation failed: ${reason}`,
            TradingErrorCode.TX_SIMULATION_FAILED,
            false, // Non-recoverable - fix the issue
            { txSig, reason }
        ),

    slippageExceeded: (expectedPrice: number, actualPrice: number, slippageBps: number) =>
        new TradingError(
            `Slippage exceeded: expected ${expectedPrice.toFixed(4)}, got ${actualPrice.toFixed(4)} (${slippageBps}bps limit)`,
            TradingErrorCode.SLIPPAGE_EXCEEDED,
            true, // Recoverable - wait for better price
            { expectedPrice, actualPrice, slippageBps }
        ),

    priceDriftExceeded: (signalPrice: number, currentPrice: number, driftBps: number, maxDriftBps: number) =>
        new TradingError(
            `Price drifted ${driftBps.toFixed(0)}bps since signal (max: ${maxDriftBps}bps)`,
            TradingErrorCode.PRICE_DRIFT_EXCEEDED,
            true, // Recoverable - regenerate signal
            { signalPrice, currentPrice, driftBps, maxDriftBps }
        ),

    rpcError: (endpoint: string, originalError: unknown) =>
        new TradingError(
            `RPC error from ${endpoint}: ${originalError instanceof Error ? originalError.message : String(originalError)}`,
            TradingErrorCode.RPC_ERROR,
            true, // Recoverable - retry with backoff
            { endpoint, originalError: String(originalError) }
        ),

    oracleStale: (asset: string, lastUpdateMs: number, maxAgeMs: number) =>
        new TradingError(
            `Oracle for ${asset} is stale (${lastUpdateMs}ms old, max ${maxAgeMs}ms)`,
            TradingErrorCode.ORACLE_STALE,
            false, // Non-recoverable until oracle updates
            { asset, lastUpdateMs, maxAgeMs }
        ),

    insufficientBalance: (required: number, available: number, asset: string) =>
        new TradingError(
            `Insufficient ${asset}: required ${required}, available ${available}`,
            TradingErrorCode.INSUFFICIENT_BALANCE,
            true,
            { required, available, asset }
        ),

    invalidConfig: (field: string, reason: string) =>
        new TradingError(
            `Invalid config: ${field} - ${reason}`,
            TradingErrorCode.INVALID_CONFIG,
            false,
            { field, reason }
        ),

    automationDisabled: () =>
        new TradingError(
            'Automation is disabled for this user',
            TradingErrorCode.AUTOMATION_DISABLED,
            false
        ),

    stateLoadFailed: (userId: string, originalError: unknown) =>
        new TradingError(
            `Failed to load automation state for user ${userId}`,
            TradingErrorCode.STATE_LOAD_FAILED,
            true,
            { userId, originalError: String(originalError) }
        ),

    stateSaveFailed: (userId: string, originalError: unknown) =>
        new TradingError(
            `Failed to save automation state for user ${userId}`,
            TradingErrorCode.STATE_SAVE_FAILED,
            true,
            { userId, originalError: String(originalError) }
        ),
};

/**
 * Type guard for TradingError.
 */
export function isTradingError(error: unknown): error is TradingError {
    return error instanceof TradingError;
}

/**
 * Check if an error is recoverable (should retry or skip).
 */
export function isRecoverableError(error: unknown): boolean {
    if (isTradingError(error)) {
        return error.recoverable;
    }
    // Unknown errors are assumed recoverable (transient)
    return true;
}
