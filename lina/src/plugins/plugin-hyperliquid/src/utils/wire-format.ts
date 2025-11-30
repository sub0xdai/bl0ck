/**
 * Wire Format Utilities
 *
 * Shared utilities for formatting Hyperliquid wire protocol messages.
 * Used by both CDP signer and CDP client.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Order grouping types.
 * 'na' = Not Applicable (default for single orders)
 */
export const ORDER_GROUPING = {
  NOT_APPLICABLE: 'na',
  POSITION_TPSL: 'positionTpsl',
} as const;

// ============================================================================
// String Formatting
// ============================================================================

/**
 * Remove trailing zeros from numeric strings.
 * Hyperliquid API requires price ('p') and size ('s') fields without trailing zeros.
 *
 * @example
 * removeTrailingZeros('12345.00') // '12345'
 * removeTrailingZeros('0.12340') // '0.1234'
 * removeTrailingZeros('100') // '100'
 */
export function removeTrailingZeros(value: string): string {
  if (!value.includes('.')) return value;
  const normalized = value.replace(/\.?0+$/, '');
  if (normalized === '-0') return '0';
  return normalized;
}

/**
 * Convert float to wire format (8 decimal precision, no trailing zeros).
 *
 * @throws Error if conversion would cause rounding beyond acceptable precision
 *
 * @example
 * floatToWire(67500) // '67500'
 * floatToWire(0.12345678) // '0.12345678'
 * floatToWire(100.00) // '100'
 */
export function floatToWire(x: number): string {
  const rounded = x.toFixed(8);
  if (Math.abs(parseFloat(rounded) - x) >= 1e-12) {
    throw new Error(`floatToWire causes rounding: ${x}`);
  }
  let normalized = rounded.replace(/\.?0+$/, '');
  if (normalized === '-0') normalized = '0';
  return normalized;
}

// ============================================================================
// Object Normalization
// ============================================================================

/**
 * Recursively normalize an object by removing trailing zeros from 'p' (price) and 's' (size) fields.
 * Used to ensure consistent hashing in signatures.
 *
 * @example
 * normalizeTrailingZeros({ p: '67500.00', s: '0.10000' })
 * // Returns: { p: '67500', s: '0.1' }
 */
export function normalizeTrailingZeros<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeTrailingZeros(item)) as unknown as T;
  }

  const result = { ...obj } as Record<string, unknown>;

  for (const key in result) {
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      const value = result[key];

      if (value && typeof value === 'object') {
        result[key] = normalizeTrailingZeros(value);
      } else if ((key === 'p' || key === 's') && typeof value === 'string') {
        result[key] = removeTrailingZeros(value);
      }
    }
  }

  return result as T;
}
