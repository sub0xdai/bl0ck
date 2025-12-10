/**
 * Custom Error Types for x402-solana
 *
 * Hierarchical error types for precise error handling in payment protocol.
 */

/**
 * Base error for all x402 payment errors
 */
export class X402PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'X402PaymentError';
  }
}

/**
 * Validation errors (invalid input, format errors)
 */
export class X402ValidationError extends X402PaymentError {
  constructor(message: string) {
    super(message);
    this.name = 'X402ValidationError';
  }
}

/**
 * Payment expiration errors
 */
export class X402ExpirationError extends X402PaymentError {
  constructor(message: string) {
    super(message);
    this.name = 'X402ExpirationError';
  }
}

/**
 * Payment amount errors (exceeds max, insufficient funds)
 */
export class X402AmountError extends X402PaymentError {
  readonly requestedAmount: bigint;
  readonly maxAmount?: bigint;

  constructor(message: string, requestedAmount: bigint, maxAmount?: bigint) {
    super(message);
    this.name = 'X402AmountError';
    this.requestedAmount = requestedAmount;
    this.maxAmount = maxAmount;
  }
}

/**
 * Network/RPC errors
 */
export class X402NetworkError extends X402PaymentError {
  readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'X402NetworkError';
    this.cause = cause;
  }
}

/**
 * Transaction verification errors
 */
export class X402VerificationError extends X402PaymentError {
  readonly signature?: string;

  constructor(message: string, signature?: string) {
    super(message);
    this.name = 'X402VerificationError';
    this.signature = signature;
  }
}
