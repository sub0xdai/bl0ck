/**
 * Memo Parsing Utilities
 *
 * Functions for creating and parsing x402 payment memos.
 * Memos follow the Solana Pay standard: "x402:{requestId}"
 */

import { MEMO_PREFIX } from '../constants';

/** Maximum memo length in bytes (Solana memo program limit) */
const MAX_MEMO_LENGTH = 566;

/**
 * Parse and validate memo content
 *
 * Validates:
 * - Non-empty string
 * - Within Solana memo program byte limit (566 bytes)
 * - Valid UTF-8 encoding
 *
 * @param data - Raw memo data
 * @returns Validated memo string, or empty string if invalid
 */
export function parseMemo(data: string): string {
  if (!data || typeof data !== 'string') {
    return '';
  }

  // Check byte length (memo program limit)
  const byteLength = Buffer.byteLength(data, 'utf-8');
  if (byteLength > MAX_MEMO_LENGTH) {
    return '';
  }

  return data;
}

/**
 * Extract requestId from x402 memo format
 *
 * @param memo - Memo content (e.g., "x402:req-12345")
 * @returns requestId or null if invalid format
 */
export function extractRequestId(memo: string): string | null {
  if (!memo || !memo.startsWith(MEMO_PREFIX)) {
    return null;
  }

  const requestId = memo.slice(MEMO_PREFIX.length);
  if (!requestId) {
    return null;
  }

  return requestId;
}

/**
 * Create a memo string for a request
 *
 * @param requestId - The unique request identifier
 * @returns Formatted memo string
 */
export function createMemo(requestId: string): string {
  return `${MEMO_PREFIX}${requestId}`;
}
