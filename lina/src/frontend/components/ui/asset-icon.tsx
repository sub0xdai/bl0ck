import { useState } from 'react';
import { getTokenIconBySymbol } from '../../constants/chains';

interface AssetIconProps {
  /** Primary icon URL (from API) */
  iconUrl?: string | null;
  /** Symbol to use for fallback icon lookup and initial display */
  symbol: string;
  /** Alt text for the image */
  alt?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * AssetIcon - Renders token/asset icons with graceful fallback
 *
 * Priority:
 * 1. iconUrl (from API)
 * 2. getTokenIconBySymbol (local icon mapping)
 * 3. First character of symbol (text fallback)
 *
 * Uses React state for error handling instead of innerHTML (XSS-safe)
 */
export function AssetIcon({ iconUrl, symbol, alt, className = '' }: AssetIconProps) {
  const [hasError, setHasError] = useState(false);

  // Get local icon path as secondary fallback
  const localIconPath = getTokenIconBySymbol(symbol);

  // If primary icon failed, try local icon
  if (hasError && localIconPath) {
    return (
      <img
        src={localIconPath}
        alt={alt || symbol}
        className={`w-full h-full object-contain p-0.5 ${className}`}
      />
    );
  }

  // If both failed or no icon URL, show text fallback
  if (hasError || (!iconUrl && !localIconPath)) {
    // Sanitize: only use first alphanumeric character
    const fallbackChar = symbol.replace(/[^a-zA-Z0-9]/g, '').charAt(0).toUpperCase() || '?';
    return (
      <span className={`text-xs sm:text-sm font-bold text-muted-foreground uppercase ${className}`}>
        {fallbackChar}
      </span>
    );
  }

  // Try local icon if no API icon
  if (!iconUrl && localIconPath) {
    return (
      <img
        src={localIconPath}
        alt={alt || symbol}
        className={`w-full h-full object-contain p-0.5 ${className}`}
      />
    );
  }

  // Primary: API icon with error handling
  return (
    <img
      src={iconUrl!}
      alt={alt || symbol}
      className={`w-full h-full object-contain p-0.5 ${className}`}
      onError={() => setHasError(true)}
    />
  );
}

/**
 * NFTImage - Renders NFT images with graceful fallback
 *
 * Uses React state for error handling instead of innerHTML (XSS-safe)
 */
interface NFTImageProps {
  /** Image URL */
  imageUrl?: string | null;
  /** Alt text */
  alt?: string;
  /** Additional CSS classes */
  className?: string;
  /** Fallback content (defaults to picture emoji) */
  fallback?: React.ReactNode;
}

export function NFTImage({ imageUrl, alt, className = '', fallback }: NFTImageProps) {
  const [hasError, setHasError] = useState(false);

  // Show fallback if no image or error
  if (hasError || !imageUrl) {
    return (
      <span className="text-2xl">
        {fallback || '🖼️'}
      </span>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt || 'NFT'}
      className={`w-full h-full object-cover ${className}`}
      onError={() => setHasError(true)}
    />
  );
}

/**
 * Format address for display (DRY helper)
 */
export function formatAddress(address: string, startChars = 6, endChars = 4): string {
  if (!address || address.length < startChars + endChars + 3) {
    return address || '';
  }
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}
