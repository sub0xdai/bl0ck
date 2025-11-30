export interface FormatTokenBalanceOptions {
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
}

const normalizeIntegerPart = (integerPart: string): { sign: string; digits: string } => {
  if (integerPart.length === 0) {
    return { sign: '', digits: '0' };
  }

  const hasSign = integerPart.startsWith('-');
  const digits = hasSign ? integerPart.slice(1) : integerPart;
  const trimmedDigits = digits.replace(/^0+(?!$)/, '') || '0';

  return {
    sign: hasSign ? '-' : '',
    digits: trimmedDigits,
  };
};

/**
 * Format USD value with full precision (removes trailing zeros)
 * Shows up to 8 decimal places but trims trailing zeros
 */
export const formatUsdValue = (
  value: number | null | undefined,
  options?: { maximumFractionDigits?: number; minimumFractionDigits?: number }
): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '0.00';
  }

  const maxDecimals = options?.maximumFractionDigits ?? 8;
  const minDecimals = options?.minimumFractionDigits ?? 2;

  // Format with maximum precision
  const formatted = value.toFixed(maxDecimals);
  const [integerPart, fractionPart = ''] = formatted.split('.');

  // Remove trailing zeros but keep minimum decimals
  let trimmedFraction = fractionPart.replace(/0+$/, '');
  if (trimmedFraction.length < minDecimals) {
    trimmedFraction = trimmedFraction.padEnd(minDecimals, '0');
  }

  return `${integerPart}.${trimmedFraction}`;
};

export const formatTokenBalance = (
  balance: string,
  options?: FormatTokenBalanceOptions,
): string => {
  const trimmed = balance?.trim() ?? '';

  if (trimmed.length === 0) {
    const minimumFractionDigits = options?.minimumFractionDigits ?? 0;
    return minimumFractionDigits > 0
      ? `0.${'0'.repeat(minimumFractionDigits)}`
      : '0';
  }

  const numericValue = Number(trimmed);

  if (!Number.isFinite(numericValue)) {
    return trimmed;
  }

  const maximumFractionDigits = options?.maximumFractionDigits ?? 8;
  const minimumFractionDigits = options?.minimumFractionDigits ?? 0;

  const rounded = numericValue.toFixed(maximumFractionDigits);
  const [rawIntegerPart, rawFractionPart = ''] = rounded.split('.');

  const { sign, digits } = normalizeIntegerPart(rawIntegerPart);

  let fractionDigits = rawFractionPart.replace(/0+$/, '');
  if (fractionDigits.length < minimumFractionDigits) {
    fractionDigits = fractionDigits.padEnd(minimumFractionDigits, '0');
  }

  const formatted = fractionDigits.length > 0
    ? `${sign}${digits}.${fractionDigits}`
    : `${sign}${digits}`;

  return formatted === '-0' ? '0' : formatted;
};

