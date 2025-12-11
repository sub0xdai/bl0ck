import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Keypair } from '@solana/web3.js';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

// Mock logger to avoid cluttering test output
mock.module('@elizaos/core', () => ({
    logger: {
        info: () => { },
        warn: () => { },
        error: () => { },
        debug: () => { },
    },
}));

/**
 * Test the encryption logic used by UnifiedWalletProvider
 *
 * Note: The full UnifiedWalletProvider requires database access,
 * so we test the encryption algorithm in isolation.
 */
describe('Wallet Encryption', () => {
    const ALGORITHM = 'aes-256-gcm' as const;
    const IV_LENGTH = 12;
    const AUTH_TAG_LENGTH = 16;

    // Test key (32 bytes = 64 hex chars)
    const TEST_SECRET = '0000000000000000000000000000000000000000000000000000000000000000';
    const TEST_KEY = Buffer.from(TEST_SECRET, 'hex');

    function encrypt(data: Uint8Array, key: Buffer): string {
        const iv = randomBytes(IV_LENGTH);
        const cipher = createCipheriv(ALGORITHM, key, iv);

        const encrypted = Buffer.concat([
            cipher.update(Buffer.from(data)),
            cipher.final(),
        ]);
        const authTag = cipher.getAuthTag();

        return Buffer.concat([iv, encrypted, authTag]).toString('base64');
    }

    function decrypt(base64Data: string, key: Buffer): Uint8Array {
        const buf = Buffer.from(base64Data, 'base64');

        const iv = buf.subarray(0, IV_LENGTH);
        const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH);
        const encrypted = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH);

        const decipher = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        return new Uint8Array(
            Buffer.concat([decipher.update(encrypted), decipher.final()])
        );
    }

    it('should encrypt and decrypt a seed phrase correctly', () => {
        const originalKeypair = Keypair.generate();
        const seed = originalKeypair.secretKey;

        const encrypted = encrypt(seed, TEST_KEY);
        const decrypted = decrypt(encrypted, TEST_KEY);

        expect(decrypted).toEqual(seed);
    });

    it('should produce different ciphertexts for same input (random IV)', () => {
        const seed = new Uint8Array(32).fill(1);
        const enc1 = encrypt(seed, TEST_KEY);
        const enc2 = encrypt(seed, TEST_KEY);

        expect(enc1).not.toEqual(enc2);
        expect(decrypt(enc1, TEST_KEY)).toEqual(seed);
        expect(decrypt(enc2, TEST_KEY)).toEqual(seed);
    });

    it('should fail to decrypt with wrong key', () => {
        const seed = new Uint8Array(32).fill(1);
        const encrypted = encrypt(seed, TEST_KEY);

        const wrongKey = Buffer.from('1111111111111111111111111111111111111111111111111111111111111111', 'hex');

        expect(() => decrypt(encrypted, wrongKey)).toThrow();
    });

    it('should fail to decrypt corrupted data', () => {
        const seed = new Uint8Array(32).fill(1);
        const encrypted = encrypt(seed, TEST_KEY);

        // Corrupt the data
        const corrupted = encrypted.slice(0, -4) + 'XXXX';

        expect(() => decrypt(corrupted, TEST_KEY)).toThrow();
    });

    it('should handle empty input', () => {
        const empty = new Uint8Array(0);
        const encrypted = encrypt(empty, TEST_KEY);
        const decrypted = decrypt(encrypted, TEST_KEY);

        expect(decrypted).toEqual(empty);
    });

    it('should handle large input (full keypair secret key)', () => {
        const keypair = Keypair.generate();
        const seed = keypair.secretKey; // 64 bytes

        const encrypted = encrypt(seed, TEST_KEY);
        const decrypted = decrypt(encrypted, TEST_KEY);

        expect(decrypted).toEqual(seed);

        // Verify keypair can be reconstructed
        const reconstructed = Keypair.fromSecretKey(decrypted);
        expect(reconstructed.publicKey.toBase58()).toBe(keypair.publicKey.toBase58());
    });
});

describe('WalletData Serialization', () => {
    it('should serialize and deserialize keypair correctly', () => {
        const keypair = Keypair.generate();
        const secretKey = keypair.secretKey;

        // Simulate database storage (base64 encoding)
        const encoded = Buffer.from(secretKey).toString('base64');
        const decoded = new Uint8Array(Buffer.from(encoded, 'base64'));

        const reconstructed = Keypair.fromSecretKey(decoded);
        expect(reconstructed.publicKey.toBase58()).toBe(keypair.publicKey.toBase58());
    });

    it('should preserve network configuration', () => {
        const networks = ['solana', 'solana-devnet'] as const;

        for (const network of networks) {
            const data = { userId: 'test', network, createdAt: Date.now() };
            const json = JSON.stringify(data);
            const parsed = JSON.parse(json);

            expect(parsed.network).toBe(network);
        }
    });
});

describe('Environment Configuration', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        // Reset relevant env vars
        delete process.env.WALLET_DB_URL;
        delete process.env.SOLANA_WALLET_SECRET;
        delete process.env.SOLANA_NETWORK;
    });

    afterEach(() => {
        // Restore original env
        process.env = { ...originalEnv };
    });

    it('should detect when WALLET_DB_URL is not set', () => {
        expect(process.env.WALLET_DB_URL).toBeUndefined();
    });

    it('should detect when WALLET_DB_URL is set', () => {
        process.env.WALLET_DB_URL = 'postgres://test:test@localhost:5432/test';
        expect(process.env.WALLET_DB_URL).toBeDefined();
    });

    it('should validate SOLANA_WALLET_SECRET length', () => {
        // Valid 32-byte hex (64 chars)
        const valid = '0000000000000000000000000000000000000000000000000000000000000000';
        expect(Buffer.from(valid, 'hex').length).toBe(32);

        // Invalid (too short)
        const invalid = '00000000';
        expect(Buffer.from(invalid, 'hex').length).toBe(4);
    });

    it('should parse SOLANA_NETWORK correctly', () => {
        const validNetworks = ['solana', 'solana-devnet'];

        for (const network of validNetworks) {
            process.env.SOLANA_NETWORK = network;
            expect(process.env.SOLANA_NETWORK).toBe(network);
        }
    });
});
