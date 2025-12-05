import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { SolanaTransactionManager } from '../../../managers/solana-transaction-manager';
import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import { join } from 'path';

// Mock fs module
mock.module('fs', () => ({
    existsSync: mock(() => false),
    mkdirSync: mock(() => { }),
    readFileSync: mock(() => ''),
    writeFileSync: mock(() => { }),
}));

// Mock logger to avoid cluttering test output
mock.module('@elizaos/core', () => ({
    logger: {
        info: () => { },
        warn: () => { },
        error: () => { },
        debug: () => { },
    },
}));

describe('SolanaTransactionManager Persistence', () => {
    let manager: any;
    const TEST_SECRET = '0000000000000000000000000000000000000000000000000000000000000000'; // 32 bytes hex
    const TEST_USER_ID = 'test-user-uuid';

    beforeEach(() => {
        // Reset env var
        process.env.SOLANA_WALLET_SECRET = TEST_SECRET;
        process.env.SOLANA_NETWORK = 'solana-devnet';

        // Reset singleton instance (hacky but needed for testing singleton)
        (SolanaTransactionManager as any).instance = null;
        manager = SolanaTransactionManager.getInstance();

        // Reset mocks
        (fs.existsSync as any).mockClear();
        (fs.readFileSync as any).mockClear();
        (fs.writeFileSync as any).mockClear();
        (fs.existsSync as any).mockImplementation(() => false);
        (fs.readFileSync as any).mockImplementation(() => '');
        (fs.writeFileSync as any).mockImplementation(() => { });
    });

    describe('Encryption', () => {
        it('should encrypt and decrypt a seed phrase correctly', () => {
            const originalKeypair = Keypair.generate();
            const seed = originalKeypair.secretKey;

            // Access private methods via any casting
            const encrypted = manager.encryptSeedPhrase(seed);
            const decrypted = manager.decryptSeedPhrase(encrypted);

            expect(decrypted).toEqual(seed);
        });

        it('should produce different ciphertexts for same input (random IV)', () => {
            const seed = new Uint8Array(32).fill(1);
            const enc1 = manager.encryptSeedPhrase(seed);
            const enc2 = manager.encryptSeedPhrase(seed);

            expect(enc1).not.toEqual(enc2);
            expect(manager.decryptSeedPhrase(enc1)).toEqual(seed);
            expect(manager.decryptSeedPhrase(enc2)).toEqual(seed);
        });

        it('should fail to decrypt with wrong key', () => {
            const seed = new Uint8Array(32).fill(1);
            const encrypted = manager.encryptSeedPhrase(seed);

            // Change key
            manager.encryptionKey = Buffer.from('1111111111111111111111111111111111111111111111111111111111111111', 'hex');

            expect(() => manager.decryptSeedPhrase(encrypted)).toThrow();
        });
    });

    describe('Wallet Persistence', () => {
        it('should generate new wallet if storage is empty', async () => {
            // Mock empty storage
            (fs.existsSync as any).mockImplementation(() => false);

            const { publicKey, keypair } = await manager.getOrCreateWallet(TEST_USER_ID);

            expect(publicKey).toBeDefined();
            expect(keypair).toBeDefined();
            expect(fs.writeFileSync).toHaveBeenCalled(); // Should save to disk
        });

        it('should load existing wallet from storage', async () => {
            // 1. Generate a wallet and encrypt it manually to simulate storage
            const kp = Keypair.generate();
            const encryptedSeed = manager.encryptSeedPhrase(kp.secretKey);

            const mockStorage = {
                wallets: {
                    [TEST_USER_ID]: {
                        userId: TEST_USER_ID,
                        encryptedSeedPhrase: encryptedSeed,
                        network: 'solana-devnet',
                        createdAt: Date.now(),
                    }
                }
            };

            // Mock fs to return this storage
            (fs.existsSync as any).mockImplementation(() => true);
            (fs.readFileSync as any).mockImplementation(() => JSON.stringify(mockStorage));

            // 2. Call getOrCreateWallet
            const { publicKey } = await manager.getOrCreateWallet(TEST_USER_ID);

            // 3. Verify it matches the stored wallet
            expect(publicKey).toBe(kp.publicKey.toBase58());
        });

        it('should THROW if decryption fails (prevent silent regeneration)', async () => {
            // 1. Mock storage with invalid encrypted data
            const mockStorage = {
                wallets: {
                    [TEST_USER_ID]: {
                        userId: TEST_USER_ID,
                        encryptedSeedPhrase: 'invalid-base64-data',
                        network: 'solana-devnet',
                        createdAt: Date.now(),
                    }
                }
            };

            (fs.existsSync as any).mockImplementation(() => true);
            (fs.readFileSync as any).mockImplementation(() => JSON.stringify(mockStorage));

            // 2. Expect getOrCreateWallet to throw
            await expect(manager.getOrCreateWallet(TEST_USER_ID)).rejects.toThrow('Failed to decrypt wallet');

            // 3. Verify NO write occurred (no new wallet generated)
            expect(fs.writeFileSync).not.toHaveBeenCalled();
        });
    });
});
