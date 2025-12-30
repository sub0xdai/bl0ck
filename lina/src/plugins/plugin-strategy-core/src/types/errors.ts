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
