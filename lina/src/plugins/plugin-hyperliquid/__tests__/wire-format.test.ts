import { describe, it, expect } from 'bun:test';
import {
  removeTrailingZeros,
  floatToWire,
  normalizeTrailingZeros,
  ORDER_GROUPING,
} from '../src/utils/wire-format';

describe('Wire Format Utilities', () => {
  describe('removeTrailingZeros', () => {
    it('should remove trailing zeros after decimal', () => {
      expect(removeTrailingZeros('12345.00')).toBe('12345');
      expect(removeTrailingZeros('0.10000')).toBe('0.1');
      expect(removeTrailingZeros('100.50000')).toBe('100.5');
    });

    it('should preserve non-trailing zeros', () => {
      expect(removeTrailingZeros('100')).toBe('100');
      expect(removeTrailingZeros('0.001')).toBe('0.001');
      expect(removeTrailingZeros('10.01')).toBe('10.01');
    });

    it('should handle integers (no decimal)', () => {
      expect(removeTrailingZeros('12345')).toBe('12345');
      expect(removeTrailingZeros('0')).toBe('0');
      expect(removeTrailingZeros('100')).toBe('100');
    });

    it('should remove decimal point when all decimals are zeros', () => {
      expect(removeTrailingZeros('100.000')).toBe('100');
      expect(removeTrailingZeros('1.0')).toBe('1');
    });

    it('should handle negative zero', () => {
      expect(removeTrailingZeros('-0')).toBe('-0'); // No decimal, returns as-is
      expect(removeTrailingZeros('-0.0')).toBe('0'); // Has decimal, normalizes to 0
      expect(removeTrailingZeros('-0.00')).toBe('0');
    });

    it('should handle edge cases', () => {
      expect(removeTrailingZeros('0.0')).toBe('0');
      // Note: '0.' is not a valid numeric string format in Hyperliquid API
      // Real prices/sizes always have digits after decimal if decimal exists
    });
  });

  describe('floatToWire', () => {
    it('should convert integers correctly', () => {
      expect(floatToWire(67500)).toBe('67500');
      expect(floatToWire(100)).toBe('100');
      expect(floatToWire(0)).toBe('0');
    });

    it('should preserve precision up to 8 decimals', () => {
      expect(floatToWire(0.12345678)).toBe('0.12345678');
      expect(floatToWire(100.00000001)).toBe('100.00000001');
    });

    it('should remove trailing zeros', () => {
      expect(floatToWire(100.0)).toBe('100');
      expect(floatToWire(0.1)).toBe('0.1');
      expect(floatToWire(50.5)).toBe('50.5');
    });

    it('should handle negative zero', () => {
      expect(floatToWire(-0)).toBe('0');
    });

    it('should handle small numbers', () => {
      expect(floatToWire(0.00000001)).toBe('0.00000001');
    });

    it('should throw on rounding that exceeds precision threshold', () => {
      // This number has too many decimal places and would cause rounding
      const tooManyDecimals = 0.123456789123456789;
      expect(() => floatToWire(tooManyDecimals)).toThrow('floatToWire causes rounding');
    });
  });

  describe('normalizeTrailingZeros', () => {
    it('should normalize p (price) fields', () => {
      const input = { p: '67500.00', other: 'value' };
      const result = normalizeTrailingZeros(input);
      expect(result.p).toBe('67500');
      expect(result.other).toBe('value');
    });

    it('should normalize s (size) fields', () => {
      const input = { s: '0.10000', other: 'value' };
      const result = normalizeTrailingZeros(input);
      expect(result.s).toBe('0.1');
    });

    it('should handle nested objects', () => {
      const input = {
        orders: [{ p: '67500.00', s: '0.10000' }, { p: '3400.00', s: '1.000' }],
      };
      const result = normalizeTrailingZeros(input);
      expect(result.orders[0].p).toBe('67500');
      expect(result.orders[0].s).toBe('0.1');
      expect(result.orders[1].p).toBe('3400');
      expect(result.orders[1].s).toBe('1');
    });

    it('should handle arrays', () => {
      const input = [{ p: '100.00' }, { p: '200.00' }];
      const result = normalizeTrailingZeros(input);
      expect(result[0].p).toBe('100');
      expect(result[1].p).toBe('200');
    });

    it('should not modify non-p/s fields', () => {
      const input = { name: '100.00', p: '100.00' };
      const result = normalizeTrailingZeros(input);
      expect(result.name).toBe('100.00');
      expect(result.p).toBe('100');
    });

    it('should handle null and undefined', () => {
      expect(normalizeTrailingZeros(null)).toBeNull();
      expect(normalizeTrailingZeros(undefined)).toBeUndefined();
    });

    it('should handle primitives', () => {
      expect(normalizeTrailingZeros('string')).toBe('string');
      expect(normalizeTrailingZeros(123)).toBe(123);
      expect(normalizeTrailingZeros(true)).toBe(true);
    });

    it('should not modify non-string p/s fields', () => {
      const input = { p: 100, s: 0.1 };
      const result = normalizeTrailingZeros(input);
      expect(result.p).toBe(100);
      expect(result.s).toBe(0.1);
    });
  });

  describe('ORDER_GROUPING constant', () => {
    it('should have correct values', () => {
      expect(ORDER_GROUPING.NOT_APPLICABLE).toBe('na');
      expect(ORDER_GROUPING.POSITION_TPSL).toBe('positionTpsl');
    });
  });
});
