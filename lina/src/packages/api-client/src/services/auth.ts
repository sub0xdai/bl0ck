import { BaseApiClient } from '../lib/base-client';
import type {
  LoginRequest,
  LoginResponse,
  RefreshTokenResponse,
  CurrentUserResponse,
  NonceResponse,
  WalletVerifyRequest,
  WalletVerifyResponse,
} from '../types/auth';

/**
 * Service for JWT authentication endpoints
 */
export class AuthService extends BaseApiClient {
  /**
   * Login with email and get JWT token
   * 
   * @param request Login credentials
   * @returns JWT token and user ID
   */
  async login(request: LoginRequest): Promise<LoginResponse> {
    const response = await this.post<LoginResponse>('/api/auth/login', request);
    return response;
  }
  
  /**
   * Refresh authentication token
   * Extends token expiration without requiring re-authentication
   * 
   * @returns New JWT token with extended expiration
   */
  async refreshToken(): Promise<RefreshTokenResponse> {
    const response = await this.post<RefreshTokenResponse>('/api/auth/refresh', {});
    return response;
  }
  
  /**
   * Get current authenticated user info
   * Useful for validating tokens and getting user details
   *
   * @returns Current user information
   */
  async getCurrentUser(): Promise<CurrentUserResponse> {
    const response = await this.get<CurrentUserResponse>('/api/auth/me');
    return response;
  }

  /**
   * Alias for getCurrentUser - shorthand for common use case
   */
  async me(): Promise<CurrentUserResponse> {
    return this.getCurrentUser();
  }

  // ============================================
  // WALLET-BASED AUTH METHODS
  // ============================================

  /**
   * Get a nonce for wallet signature authentication
   * Nonce expires after 5 minutes
   *
   * @returns Random nonce string
   */
  async getNonce(): Promise<NonceResponse> {
    const response = await this.get<NonceResponse>('/api/auth/nonce');
    return response;
  }

  /**
   * Verify wallet signature and get JWT token
   * Supports both EVM (SIWE) and Solana signatures
   *
   * @param request Signed message and signature
   * @returns JWT token and user info
   */
  async verifyWalletSignature(request: WalletVerifyRequest): Promise<WalletVerifyResponse> {
    const response = await this.post<WalletVerifyResponse>('/api/auth/verify', request);
    return response;
  }
}

