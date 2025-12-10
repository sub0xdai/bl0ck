/**
 * Memo Parsing Utilities
 *
 * Functions for creating and parsing x402 payment memos.
 * Memos follow the Solana Pay standard: "x402:{requestId}"
 */

import { MEMO_PREFIX } from '../constants';

/**
 * Parse memo content (identity function for now, can add validation)
 *
 * @param data - Raw memo data
 * @returns Parsed memo string
 */
export function parseMemo(data: string): string {
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
