/**
 * Integration tests for wallet authentication flow
 * Tests EVM (SIWE) and Solana (SIWS) authentication
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  EVMWallets,
  SolanaWallets,
  createSIWEMessage,
  createSIWSMessage,
  generateMockEVMSignature,
  generateMockSolanaSignature,
} from "../../fixtures/wallets";
import {
  createMockJWT,
  decodeMockJWT,
  generateUserId,
  generateMockNonce,
  isTokenExpired,
} from "../../fixtures/jwt-tokens";
import { setupTestEnv, cleanupTestEnv, createMockFetch } from "../../helpers/setup";

describe("Wallet Authentication", () => {
  beforeEach(() => {
    setupTestEnv();
  });

  afterEach(() => {
    cleanupTestEnv();
  });

  describe("Nonce Generation", () => {
    it("should generate unique nonces", () => {
      const nonce1 = generateMockNonce();
      const nonce2 = generateMockNonce();

      expect(nonce1).toBeDefined();
      expect(nonce2).toBeDefined();
      expect(nonce1).not.toBe(nonce2);
      expect(nonce1).toMatch(/^nonce-\d+-[a-z0-9]+$/);
    });
  });

  describe("EVM SIWE Authentication", () => {
    it("should create valid SIWE message", () => {
      const address = EVMWallets.user1.address;
      const nonce = generateMockNonce();
      const message = createSIWEMessage(address, nonce);

      expect(message).toContain(address);
      expect(message).toContain(nonce);
      expect(message).toContain("Sign in to Lina DeFi Agent");
      expect(message).toContain("Chain ID: 1");
    });

    it("should generate mock signature for SIWE message", () => {
      const message = createSIWEMessage(EVMWallets.user1.address, generateMockNonce());
      const signature = generateMockEVMSignature(message);

      expect(signature).toMatch(/^0x[a-f0-9]+$/);
      expect(signature.length).toBeGreaterThan(10);
    });

    it("should generate deterministic userId from EVM address", () => {
      const address = EVMWallets.user1.address;
      const userId1 = generateUserId(address, "evm");
      const userId2 = generateUserId(address, "evm");

      expect(userId1).toBe(userId2);
      expect(userId1).toMatch(/^evm-[a-f0-9]+$/);
    });

    it("should generate different userIds for different addresses", () => {
      const userId1 = generateUserId(EVMWallets.user1.address, "evm");
      const userId2 = generateUserId(EVMWallets.user2.address, "evm");

      expect(userId1).not.toBe(userId2);
    });
  });

  describe("Solana SIWS Authentication", () => {
    it("should create valid SIWS message", () => {
      const publicKey = SolanaWallets.user1.publicKey;
      const nonce = generateMockNonce();
      const message = createSIWSMessage(publicKey, nonce);

      expect(message).toContain(publicKey);
      expect(message).toContain(nonce);
      expect(message).toContain("Sign in to Lina DeFi Agent");
    });

    it("should generate mock signature for SIWS message", () => {
      const message = createSIWSMessage(SolanaWallets.user1.publicKey, generateMockNonce());
      const messageBytes = new TextEncoder().encode(message);
      const signature = generateMockSolanaSignature(messageBytes);

      expect(signature).toBeDefined();
      expect(signature.length).toBeGreaterThan(0);
    });

    it("should generate deterministic userId from Solana public key", () => {
      const publicKey = SolanaWallets.user1.publicKey;
      const userId1 = generateUserId(publicKey, "solana");
      const userId2 = generateUserId(publicKey, "solana");

      expect(userId1).toBe(userId2);
      expect(userId1).toMatch(/^solana-[a-f0-9]+$/);
    });
  });

  describe("JWT Token Handling", () => {
    it("should create valid JWT token", () => {
      const token = createMockJWT({
        userId: "test-user",
        walletAddress: EVMWallets.user1.address,
        chain: "evm",
      });

      expect(token).toBeDefined();
      expect(token.split(".")).toHaveLength(3);
    });

    it("should decode JWT token payload", () => {
      const originalPayload = {
        userId: "test-user",
        walletAddress: EVMWallets.user1.address,
        chain: "evm" as const,
      };

      const token = createMockJWT(originalPayload);
      const decoded = decodeMockJWT(token);

      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(originalPayload.userId);
      expect(decoded?.walletAddress).toBe(originalPayload.walletAddress);
      expect(decoded?.chain).toBe(originalPayload.chain);
    });

    it("should include iat and exp claims", () => {
      const token = createMockJWT({
        userId: "test-user",
        walletAddress: EVMWallets.user1.address,
        chain: "evm",
      });

      const decoded = decodeMockJWT(token);

      expect(decoded?.iat).toBeDefined();
      expect(decoded?.exp).toBeDefined();
      expect(decoded?.exp).toBeGreaterThan(decoded!.iat);
    });

    it("should detect expired tokens", () => {
      // Create already expired token
      const expiredToken = createMockJWT(
        {
          userId: "test-user",
          walletAddress: EVMWallets.user1.address,
          chain: "evm",
        },
        -3600 // Expired 1 hour ago
      );

      expect(isTokenExpired(expiredToken)).toBe(true);
    });

    it("should detect valid (non-expired) tokens", () => {
      const validToken = createMockJWT(
        {
          userId: "test-user",
          walletAddress: EVMWallets.user1.address,
          chain: "evm",
        },
        3600 // Expires in 1 hour
      );

      expect(isTokenExpired(validToken)).toBe(false);
    });
  });

  describe("Full Auth Flow Simulation", () => {
    it("should complete EVM auth flow", async () => {
      const address = EVMWallets.user1.address;
      const nonce = generateMockNonce();

      // Step 1: Create SIWE message
      const message = createSIWEMessage(address, nonce);
      expect(message).toContain(address);

      // Step 2: Sign message
      const signature = generateMockEVMSignature(message);
      expect(signature).toMatch(/^0x/);

      // Step 3: Generate JWT (simulating server verification)
      const userId = generateUserId(address, "evm");
      const token = createMockJWT({
        userId,
        walletAddress: address,
        chain: "evm",
      });

      // Step 4: Verify token is valid
      expect(isTokenExpired(token)).toBe(false);

      // Step 5: Decode and verify user info
      const decoded = decodeMockJWT(token);
      expect(decoded?.userId).toBe(userId);
      expect(decoded?.chain).toBe("evm");
    });

    it("should complete Solana auth flow", async () => {
      const publicKey = SolanaWallets.user1.publicKey;
      const nonce = generateMockNonce();

      // Step 1: Create SIWS message
      const message = createSIWSMessage(publicKey, nonce);
      expect(message).toContain(publicKey);

      // Step 2: Sign message
      const messageBytes = new TextEncoder().encode(message);
      const signature = generateMockSolanaSignature(messageBytes);
      expect(signature).toBeDefined();

      // Step 3: Generate JWT (simulating server verification)
      const userId = generateUserId(publicKey, "solana");
      const token = createMockJWT({
        userId,
        walletAddress: publicKey,
        chain: "solana",
      });

      // Step 4: Verify token is valid
      expect(isTokenExpired(token)).toBe(false);

      // Step 5: Decode and verify user info
      const decoded = decodeMockJWT(token);
      expect(decoded?.userId).toBe(userId);
      expect(decoded?.chain).toBe("solana");
    });
  });

  describe("User Isolation", () => {
    it("should generate different userIds for same address on different chains", () => {
      const address = "0x1234567890123456789012345678901234567890";
      const evmUserId = generateUserId(address, "evm");
      const solanaUserId = generateUserId(address, "solana");

      expect(evmUserId).not.toBe(solanaUserId);
      expect(evmUserId).toMatch(/^evm-/);
      expect(solanaUserId).toMatch(/^solana-/);
    });

    it("should maintain user isolation across tokens", () => {
      const user1Token = createMockJWT({
        userId: generateUserId(EVMWallets.user1.address, "evm"),
        walletAddress: EVMWallets.user1.address,
        chain: "evm",
      });

      const user2Token = createMockJWT({
        userId: generateUserId(EVMWallets.user2.address, "evm"),
        walletAddress: EVMWallets.user2.address,
        chain: "evm",
      });

      const decoded1 = decodeMockJWT(user1Token);
      const decoded2 = decodeMockJWT(user2Token);

      expect(decoded1?.userId).not.toBe(decoded2?.userId);
      expect(decoded1?.walletAddress).not.toBe(decoded2?.walletAddress);
    });
  });
});
