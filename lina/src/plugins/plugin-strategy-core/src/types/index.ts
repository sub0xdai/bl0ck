// Re-export all types from a single entry point

export {
    type AutomationConfig,
    type AutomationState,
    type PositionMetadata,
    DEFAULT_AUTOMATION_CONFIG,
    createInitialState,
} from './automation-config';

export {
    type ATRResult,
    type ATRPositionSizing,
    type TradeQualification,
    type PositionSizingInput,
} from './atr-risk';

export {
    type SignalDirection,
    type SignalSource,
    type Signal,
    type SignalWeights,
    DEFAULT_SIGNAL_WEIGHTS,
    SIGNAL_CONFIDENCE_THRESHOLD,
    TREND_THRESHOLD_PCT,
    aggregateSignals,
} from './signals';

export {
    type RiskAssessment,
    type PositionSizeParams,
    type ExposureSnapshot,
    type RejectionReason,
    REJECTION_REASONS,
    calculateMaxPositionSize,
    scalePositionByConfidence,
} from './risk';

export {
    TradingErrorCode,
    TradingError,
    TradingErrors,
    isTradingError,
    isRecoverableError,
} from './errors';

export {
    type ExecutionParams,
    type PriceValidationResult,
    calculateSlippagePrice,
    validatePreTradePrice,
    bpsToPercent,
    percentToBps,
} from './execution';
