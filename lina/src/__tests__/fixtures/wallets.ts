/**
 * Mock wallet fixtures for testing
 * Provides deterministic wallet data for EVM and Solana chains
 */

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

// Deterministic test seed (DO NOT use in production)
const TEST_SEED = new Uint8Array(32).fill(1);

/**
 * EVM Test Wallets
 */
export const EVMWallets = {
  user1: {
    address: "0x1234567890123456789012345678901234567890" as `0x${string}`,
    privateKey: "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" as `0x${string}`,
  },
  user2: {
    address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`,
    privateKey: "0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210" as `0x${string}`,
  },
} as const;

/**
 * Solana Test Wallets
 */
export const SolanaWallets = {
  user1: {
    publicKey: "11111111111111111111111111111111",
    keypair: Keypair.fromSeed(TEST_SEED),
  },
  user2: {
    publicKey: "22222222222222222222222222222222",
    keypair: Keypair.fromSeed(new Uint8Array(32).fill(2)),
  },
} as const;

/**
 * Generate a mock EVM signature for SIWE
 */
export function generateMockEVMSignature(message: string): `0x${string}` {
  // Create deterministic mock signature based on message hash
  const hash = Buffer.from(message).toString("hex").slice(0, 128);
  return `0x${hash.padEnd(130, "0")}` as `0x${string}`;
}

/**
 * Generate a mock Solana signature for SIWS
 */
export function generateMockSolanaSignature(message: Uint8Array): string {
  // Create deterministic mock signature
  const sig = new Uint8Array(64);
  for (let i = 0; i < Math.min(message.length, 64); i++) {
    sig[i] = message[i];
  }
  return bs58.encode(sig);
}

/**
 * Mock wallet address generator
 */
export function mockWalletAddress(chain: "evm" | "solana", userId: string): string {
  if (chain === "evm") {
    // Generate deterministic EVM address from userId
    const hash = Buffer.from(userId).toString("hex").slice(0, 40);
    return `0x${hash.padEnd(40, "0")}`;
  } else {
    // Generate deterministic Solana address from userId
    const seed = new Uint8Array(32);
    const userBytes = Buffer.from(userId);
    for (let i = 0; i < Math.min(userBytes.length, 32); i++) {
      seed[i] = userBytes[i];
    }
    return Keypair.fromSeed(seed).publicKey.toBase58();
  }
}

/**
 * SIWE (Sign-In with Ethereum) message template
 */
export function createSIWEMessage(
  address: string,
  nonce: string,
  domain = "localhost",
  uri = "http://localhost:3000"
): string {
  const now = new Date().toISOString();
  return `${domain} wants you to sign in with your Ethereum account:
${address}

Sign in to Lina DeFi Agent

URI: ${uri}
Version: 1
Chain ID: 1
Nonce: ${nonce}
Issued At: ${now}`;
}

/**
 * SIWS (Sign-In with Solana) message template
 */
export function createSIWSMessage(
  publicKey: string,
  nonce: string,
  domain = "localhost"
): string {
  const now = new Date().toISOString();
  return `${domain} wants you to sign in with your Solana account:
${publicKey}

Sign in to Lina DeFi Agent

Nonce: ${nonce}
Issued At: ${now}`;
}
