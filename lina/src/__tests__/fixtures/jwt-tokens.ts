/**
 * JWT token fixtures for testing authentication
 */

/**
 * Mock JWT secret for tests (DO NOT use in production)
 */
export const TEST_JWT_SECRET = "test-jwt-secret-for-testing-only-32chars";

/**
 * JWT payload structure
 */
export interface JWTPayload {
  userId: string;
  walletAddress: string;
  chain: "evm" | "solana";
  iat: number;
  exp: number;
}

/**
 * Create a mock JWT token (base64 encoded, NOT cryptographically signed)
 * For testing purposes only - real JWT validation should use proper signing
 */
export function createMockJWT(payload: Omit<JWTPayload, "iat" | "exp">, expiresIn = 3600): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
  };

  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");

  // Mock signature (not cryptographically valid, but consistent for tests)
  const signatureB64 = Buffer.from(`mock-sig-${payload.userId}`).toString("base64url");

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

/**
 * Decode a mock JWT token (does NOT verify signature)
 */
export function decodeMockJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return payload as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Check if a token is expired
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeMockJWT(token);
  if (!payload) return true;

  const now = Math.floor(Date.now() / 1000);
  return payload.exp < now;
}

/**
 * Sample tokens for different test scenarios
 */
export const SampleTokens = {
  // Valid EVM user token (expires in 1 hour)
  validEVM: () => createMockJWT({
    userId: "user-evm-123",
    walletAddress: "0x1234567890123456789012345678901234567890",
    chain: "evm",
  }),

  // Valid Solana user token (expires in 1 hour)
  validSolana: () => createMockJWT({
    userId: "user-sol-456",
    walletAddress: "11111111111111111111111111111111",
    chain: "solana",
  }),

  // Expired token
  expired: () => createMockJWT({
    userId: "user-expired",
    walletAddress: "0xexpired000000000000000000000000000000000",
    chain: "evm",
  }, -3600), // Expired 1 hour ago

  // Short-lived token (expires in 10 seconds)
  shortLived: () => createMockJWT({
    userId: "user-short",
    walletAddress: "0xshort0000000000000000000000000000000000",
    chain: "evm",
  }, 10),
} as const;

/**
 * Generate a deterministic userId from wallet address
 * Mirrors the pattern used in the actual auth system
 */
export function generateUserId(walletAddress: string, chain: "evm" | "solana"): string {
  // Simple hash-like transformation for deterministic IDs
  const normalized = walletAddress.toLowerCase();
  const hash = Buffer.from(normalized).toString("hex").slice(0, 16);
  return `${chain}-${hash}`;
}

/**
 * Mock nonce for SIWE/SIWS
 */
export function generateMockNonce(): string {
  return `nonce-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Auth request/response mocks
 */
export const AuthMocks = {
  // Nonce request
  nonceRequest: {
    path: "/api/auth/nonce",
    method: "GET",
    response: { nonce: generateMockNonce() },
  },

  // SIWE verify request
  siweVerifyRequest: (address: string, signature: string, message: string) => ({
    path: "/api/auth/verify",
    method: "POST",
    body: { address, signature, message, chain: "evm" },
    response: {
      success: true,
      token: createMockJWT({
        userId: generateUserId(address, "evm"),
        walletAddress: address,
        chain: "evm",
      }),
    },
  }),

  // SIWS verify request
  siwsVerifyRequest: (publicKey: string, signature: string, message: string) => ({
    path: "/api/auth/verify",
    method: "POST",
    body: { publicKey, signature, message, chain: "solana" },
    response: {
      success: true,
      token: createMockJWT({
        userId: generateUserId(publicKey, "solana"),
        walletAddress: publicKey,
        chain: "solana",
      }),
    },
  }),

  // Token refresh request
  refreshRequest: (oldToken: string) => ({
    path: "/api/auth/refresh",
    method: "POST",
    headers: { Authorization: `Bearer ${oldToken}` },
    response: {
      success: true,
      token: createMockJWT({
        userId: decodeMockJWT(oldToken)?.userId || "unknown",
        walletAddress: decodeMockJWT(oldToken)?.walletAddress || "unknown",
        chain: decodeMockJWT(oldToken)?.chain || "evm",
      }),
    },
  }),
} as const;
