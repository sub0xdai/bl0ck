import { describe, it, expect, beforeEach, mock, afterEach } from 'bun:test';
import { SolanaTransactionManager } from '../../../managers/solana-transaction-manager';
import { WalletRepository } from '../../../repositories/wallet-repository';
import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';

// Mock fs module (for file fallback tests)
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
        // No database by default (tests file fallback)
        delete process.env.WALLET_DB_URL;

        // Reset singleton instances
        (SolanaTransactionManager as any).instance = null;
        WalletRepository.resetInstance();
        manager = SolanaTransactionManager.getInstance();

        // Reset mocks
        (fs.existsSync as any).mockClear();
        (fs.readFileSync as any).mockClear();
        (fs.writeFileSync as any).mockClear();
        (fs.existsSync as any).mockImplementation(() => false);
        (fs.readFileSync as any).mockImplementation(() => '');
        (fs.writeFileSync as any).mockImplementation(() => { });
    });

    afterEach(() => {
        // Clean up
        delete process.env.WALLET_DB_URL;
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

    describe('Wallet Persistence (File Fallback)', () => {
        it('should generate new wallet if storage is empty', async () => {
            // Mock empty storage
            (fs.existsSync as any).mockImplementation(() => false);

            const { publicKey, keypair } = await manager.getOrCreateWallet(TEST_USER_ID);

            expect(publicKey).toBeDefined();
            expect(keypair).toBeDefined();
            expect(fs.writeFileSync).toHaveBeenCalled(); // Should save to disk
        });

        it('should load existing wallet from file storage', async () => {
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

    describe('WalletRepository', () => {
        it('should return not configured when WALLET_DB_URL is not set', () => {
            delete process.env.WALLET_DB_URL;
            WalletRepository.resetInstance();
            const repo = WalletRepository.getInstance();
            expect(repo.isConfigured()).toBe(false);
        });

        it('should return configured when WALLET_DB_URL is set', () => {
            process.env.WALLET_DB_URL = 'postgres://test:test@localhost:5432/test';
            WalletRepository.resetInstance();
            const repo = WalletRepository.getInstance();
            expect(repo.isConfigured()).toBe(true);
        });

        it('should be a singleton', () => {
            const repo1 = WalletRepository.getInstance();
            const repo2 = WalletRepository.getInstance();
            expect(repo1).toBe(repo2);
        });
    });

    describe('Database Priority', () => {
        it('should prefer database over file storage when configured', async () => {
            // This test verifies the logic flow - actual DB calls would need integration tests
            process.env.WALLET_DB_URL = 'postgres://test:test@localhost:5432/test';
            WalletRepository.resetInstance();
            (SolanaTransactionManager as any).instance = null;

            const newManager = SolanaTransactionManager.getInstance();

            // Verify repository is configured
            expect((newManager as any).walletRepository.isConfigured()).toBe(true);
        });

        it('should fall back to file storage when database not configured', async () => {
            delete process.env.WALLET_DB_URL;
            WalletRepository.resetInstance();
            (SolanaTransactionManager as any).instance = null;

            const newManager = SolanaTransactionManager.getInstance();

            // Verify repository is NOT configured
            expect((newManager as any).walletRepository.isConfigured()).toBe(false);

            // Mock empty file storage
            (fs.existsSync as any).mockImplementation(() => false);

            // Generate wallet - should use file fallback
            const { publicKey } = await newManager.getOrCreateWallet(TEST_USER_ID);

            expect(publicKey).toBeDefined();
            expect(fs.writeFileSync).toHaveBeenCalled(); // File fallback used
        });
    });
});
