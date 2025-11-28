/**
 * Request body for login endpoint
 */
export interface LoginRequest {
  email: string;
  username: string; // User's display name from CDP
  cdpUserId: string; // CDP's user identifier (UUID)
}

/**
 * Response from login endpoint
 */
export interface LoginResponse {
  token: string; // JWT authentication token
  userId: string; // Secure user ID generated from email
  username: string; // User's display name
  expiresIn: string; // Token expiration time (e.g., "7d")
}

/**
 * Response from refresh token endpoint
 */
export interface RefreshTokenResponse {
  token: string; // New JWT authentication token
  userId: string;
  username: string; // User's display name
  expiresIn: string;
}

/**
 * Response from /me endpoint (current user info)
 */
export interface CurrentUserResponse {
  userId: string;
  email?: string;
  username?: string;
  walletAddress?: string;
  chain?: 'evm' | 'solana';
}

// ============================================
// WALLET-BASED AUTH TYPES
// ============================================

/**
 * Response from /api/auth/nonce endpoint
 */
export interface NonceResponse {
  nonce: string;
}

/**
 * Request body for wallet signature verification
 */
export interface WalletVerifyRequest {
  message: string;
  signature: string;
  chain: 'evm' | 'solana';
}

/**
 * Response from /api/auth/verify endpoint
 */
export interface WalletVerifyResponse {
  token: string;
  userId: string;
  walletAddress: string;
  chain: 'evm' | 'solana';
  expiresIn: string;
}

