import { describe, it, expect } from 'bun:test';
import { parseMemo, extractRequestId, createMemo } from '../src/utils/memo';

describe('memo utilities', () => {
  describe('parseMemo', () => {
    it('should return valid memo content unchanged', () => {
      const memo = parseMemo('x402:req-12345');
      expect(memo).toBe('x402:req-12345');
    });

    it('should return empty string for empty input', () => {
      expect(parseMemo('')).toBe('');
    });

    it('should return empty string for non-string input', () => {
      expect(parseMemo(null as any)).toBe('');
      expect(parseMemo(undefined as any)).toBe('');
    });

    it('should return empty string for memo exceeding 566 bytes', () => {
      const longMemo = 'x'.repeat(600);
      expect(parseMemo(longMemo)).toBe('');
    });

    it('should accept memo at exactly 566 bytes', () => {
      const maxMemo = 'x'.repeat(566);
      expect(parseMemo(maxMemo)).toBe(maxMemo);
    });

    it('should handle multi-byte characters correctly', () => {
      // Each emoji is 4 bytes in UTF-8
      const emojiMemo = '🎉'.repeat(141); // 141 * 4 = 564 bytes (under limit)
      expect(parseMemo(emojiMemo)).toBe(emojiMemo);

      const tooManyEmoji = '🎉'.repeat(150); // 150 * 4 = 600 bytes (over limit)
      expect(parseMemo(tooManyEmoji)).toBe('');
    });
  });

  describe('extractRequestId', () => {
    it('should extract requestId from valid memo', () => {
      const requestId = extractRequestId('x402:req-12345');
      expect(requestId).toBe('req-12345');
    });

    it('should handle complex requestIds', () => {
      expect(extractRequestId('x402:abc-123-def-456')).toBe('abc-123-def-456');
      expect(extractRequestId('x402:uuid-v4-style-id')).toBe('uuid-v4-style-id');
    });

    it('should return null for invalid memo format', () => {
      expect(extractRequestId('invalid-memo')).toBeNull();
      expect(extractRequestId('x402:')).toBeNull();
      expect(extractRequestId('')).toBeNull();
    });

    it('should return null for non-x402 prefixes', () => {
      expect(extractRequestId('memo:req-12345')).toBeNull();
      expect(extractRequestId('payment:req-12345')).toBeNull();
    });

    it('should be case-sensitive', () => {
      expect(extractRequestId('X402:req-12345')).toBeNull();
      expect(extractRequestId('x402:req-12345')).toBe('req-12345');
    });
  });

  describe('createMemo', () => {
    it('should create memo with correct prefix', () => {
      const memo = createMemo('req-12345');
      expect(memo).toBe('x402:req-12345');
    });

    it('should handle various requestId formats', () => {
      expect(createMemo('abc')).toBe('x402:abc');
      expect(createMemo('uuid-v4-test')).toBe('x402:uuid-v4-test');
    });

    it('should create memo that extractRequestId can parse', () => {
      const requestId = 'my-unique-request-id';
      const memo = createMemo(requestId);
      const extracted = extractRequestId(memo);
      expect(extracted).toBe(requestId);
    });
  });
});
