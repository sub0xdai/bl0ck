import { logger, type IAgentRuntime } from '@elizaos/core';
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
  getMint,
} from '@solana/spl-token';
import { getSolanaRpcUrl, getSolanaCluster } from '@/constants/chains';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import bs58 from 'bs58';

// ============================================================================
// Types
// ============================================================================

/**
 * Generic cache entry with 5-minute TTL
 * Matches CDP manager pattern exactly
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Solana wallet data stored in memory cache
 * Contains the Keypair instance for signing transactions
 */
interface SolanaWallet {
  publicKey: string;
  keypair: Keypair;
  network: 'solana' | 'solana-devnet';
}

/**
 * Encrypted wallet data persisted to disk
 * Uses AES-256-GCM encryption with randomized IV
 */
interface EncryptedWalletData {
  userId: string;
  encryptedSeedPhrase: string; // Base64-encoded: IV (12 bytes) + encrypted data + auth tag (16 bytes)
  network: 'solana' | 'solana-devnet';
  createdAt: number;
}

/**
 * Wallet storage file structure
 * Maps userId to encrypted wallet data
 */
interface WalletStorageFile {
  wallets: Record<string, EncryptedWalletData>;
}

/**
 * Token balance info with USD values and metadata
 * Matches CDP TokenBalance pattern
 */
interface SolanaTokenBalance {
  symbol: string;
  name: string;
  balance: string;
  balanceFormatted: string;
  usdValue: number;
  usdPrice: number;
  mintAddress: string | null; // null for SOL
  decimals: number;
  icon?: string; // Optional token icon URL from CoinGecko
}

// ============================================================================
// Solana Transaction Manager Class (Singleton)
// ============================================================================

export class SolanaTransactionManager {
  private static instance: SolanaTransactionManager | null = null;

  private connection: Connection | null = null;
  private network: 'solana' | 'solana-devnet' = 'solana-devnet';

  private walletsCache = new Map<string, CacheEntry<SolanaWallet>>();
  private balancesCache = new Map<string, CacheEntry<any>>();
  private readonly CACHE_TTL = 300 * 1000; // 5 minutes

  // Wallet storage configuration
  private readonly WALLET_STORAGE_PATH: string;
  private readonly ENCRYPTION_ALGORITHM = 'aes-256-gcm' as const;
  private readonly IV_LENGTH = 12; // GCM standard IV length
  private readonly AUTH_TAG_LENGTH = 16; // GCM authentication tag length
  private encryptionKey: Buffer | null = null;

  // Transaction configuration (Task 1.5)
  private readonly MIN_SOL_BUFFER = 0.01 * LAMPORTS_PER_SOL; // 0.01 SOL for fees/rent
  private readonly CONFIRMATION_TIMEOUT = 60000; // 60s timeout

  // Private constructor to prevent direct instantiation
  private constructor() {
    // Set storage path (data/ directory in project root)
    this.WALLET_STORAGE_PATH = join(process.cwd(), 'data', 'solana-wallets.json');

    this.initializeConnection();
    this.initializeEncryption();
  }

  /**
   * Get the singleton instance of SolanaTransactionManager
   * Matches CDP pattern
   */
  public static getInstance(): SolanaTransactionManager {
    if (!SolanaTransactionManager.instance) {
      SolanaTransactionManager.instance = new SolanaTransactionManager();
    }
    return SolanaTransactionManager.instance;
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize Solana RPC connection
   * Uses Helius if API key available, falls back to public RPC
   * Matches CDP's graceful degradation pattern
   */
  private initializeConnection(): void {
    if (this.connection) {
      return; // Already initialized
    }

    const heliusKey = process.env.HELIUS_API_KEY;
    const networkEnv = process.env.SOLANA_NETWORK as 'solana' | 'solana-devnet' | undefined;

    // Use env var if set, otherwise default to devnet
    if (networkEnv && (networkEnv === 'solana' || networkEnv === 'solana-devnet')) {
      this.network = networkEnv;
    }

    try {
      // Get RPC URL using chains.ts helper (completed in Task 1.1)
      const rpcUrl = getSolanaRpcUrl(this.network, heliusKey);

      if (!rpcUrl) {
        logger.warn('[SolanaTransactionManager] Failed to get RPC URL, using public fallback');
        // Public fallback
        const fallbackUrl = this.network === 'solana'
          ? 'https://api.mainnet-beta.solana.com'
          : 'https://api.devnet.solana.com';

        this.connection = new Connection(fallbackUrl, {
          commitment: 'finalized', // Safety: wait for finality
          confirmTransactionInitialTimeout: 60000, // 60s timeout
        });

        logger.info(`[SolanaTransactionManager] Connection initialized (public RPC): ${this.network}`);
        return;
      }

      // Initialize with Helius or config RPC
      this.connection = new Connection(rpcUrl, {
        commitment: 'finalized', // Matches CDP's safety-first mindset
        confirmTransactionInitialTimeout: 60000,
      });

      const rpcType = heliusKey ? 'Helius' : 'public';
      logger.info(`[SolanaTransactionManager] Connection initialized (${rpcType}): ${this.network}`);
    } catch (error) {
      logger.error(
        '[SolanaTransactionManager] Failed to initialize connection:',
        error instanceof Error ? error.message : String(error)
      );
      // Don't throw - allow manager to exist but fail on usage
      // Matches CDP pattern
    }
  }

  /**
   * Initialize encryption key from environment variable
   * Uses SOLANA_WALLET_SECRET for AES-256-GCM encryption
   * Matches CDP's wallet encryption pattern
   */
  private initializeEncryption(): void {
    const secret = process.env.SOLANA_WALLET_SECRET;

    if (!secret) {
      logger.warn(
        '[SolanaTransactionManager] SOLANA_WALLET_SECRET not set. Wallet creation will fail. Generate with: openssl rand -hex 32'
      );
      return;
    }

    try {
      // Convert hex string to 32-byte buffer for AES-256
      this.encryptionKey = Buffer.from(secret, 'hex');

      if (this.encryptionKey.length !== 32) {
        logger.error(
          `[SolanaTransactionManager] Invalid SOLANA_WALLET_SECRET length: ${this.encryptionKey.length} bytes (expected 32)`
        );
        this.encryptionKey = null;
        return;
      }

      logger.info('[SolanaTransactionManager] Encryption initialized successfully');
    } catch (error) {
      logger.error(
        '[SolanaTransactionManager] Failed to initialize encryption:',
        error instanceof Error ? error.message : String(error)
      );
      this.encryptionKey = null;
    }
  }

  /**
   * Get the initialized Solana connection
   * Throws if not initialized (matches CDP pattern)
   * @throws Error if connection not initialized
   * @returns Solana Connection instance
   */
  public getConnection(): Connection {
    if (!this.connection) {
      throw new Error(
        'Solana connection not initialized. Check HELIUS_API_KEY or SOLANA_NETWORK environment variables.'
      );
    }
    return this.connection;
  }

  /**
   * Get current network
   * @returns Current Solana network identifier
   */
  public getNetwork(): 'solana' | 'solana-devnet' {
    return this.network;
  }

  // ============================================================================
  // Cache Helpers
  // ============================================================================

  /**
   * Check if cache entry is still valid
   * @param entry Cache entry to check
   * @returns True if entry exists and is within TTL
   */
  private isCacheValid<T>(entry: CacheEntry<T> | undefined): boolean {
    if (!entry) return false;
    return (Date.now() - entry.timestamp) < this.CACHE_TTL;
  }

  /**
   * Get cached data if valid
   * Similar to CDP's cache check pattern
   */
  private getCachedData<T>(
    cacheKey: string,
    cache: Map<string, CacheEntry<T>>
  ): T | undefined {
    const entry = cache.get(cacheKey);
    if (this.isCacheValid(entry)) {
      return entry?.data;
    }
    return undefined;
  }

  /**
   * Store data in cache with current timestamp
   * Similar to CDP's cache update
   */
  private setCacheData<T>(
    cacheKey: string,
    data: T,
    cache: Map<string, CacheEntry<T>>
  ): void {
    cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });
  }

  // ============================================================================
  // Encryption Methods (AES-256-GCM)
  // ============================================================================

  /**
   * Encrypt a seed phrase using AES-256-GCM
   * Format: IV (12 bytes) + encrypted data + auth tag (16 bytes)
   * @param seedPhrase Seed phrase bytes to encrypt
   * @returns Base64-encoded encrypted data
   * @throws Error if encryption key not initialized
   */
  private encryptSeedPhrase(seedPhrase: Uint8Array): string {
    if (!this.encryptionKey) {
      throw new Error(
        'Encryption key not initialized. Set SOLANA_WALLET_SECRET environment variable.'
      );
    }

    // Generate random IV (12 bytes for GCM)
    const iv = randomBytes(this.IV_LENGTH);

    // Create cipher
    const cipher = createCipheriv(this.ENCRYPTION_ALGORITHM, this.encryptionKey, iv);

    // Encrypt seed phrase
    const encryptedData = Buffer.concat([
      cipher.update(Buffer.from(seedPhrase)),
      cipher.final(),
    ]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Combine: IV + encrypted data + auth tag
    const combined = Buffer.concat([iv, encryptedData, authTag]);

    // Return base64-encoded result
    return combined.toString('base64');
  }

  /**
   * Decrypt a seed phrase using AES-256-GCM
   * @param encryptedData Base64-encoded encrypted seed phrase
   * @returns Decrypted seed phrase bytes
   * @throws Error if decryption fails or encryption key not initialized
   */
  private decryptSeedPhrase(encryptedData: string): Uint8Array {
    if (!this.encryptionKey) {
      throw new Error(
        'Encryption key not initialized. Set SOLANA_WALLET_SECRET environment variable.'
      );
    }

    try {
      // Decode base64
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract components
      const iv = combined.subarray(0, this.IV_LENGTH);
      const authTag = combined.subarray(combined.length - this.AUTH_TAG_LENGTH);
      const encrypted = combined.subarray(this.IV_LENGTH, combined.length - this.AUTH_TAG_LENGTH);

      // Create decipher
      const decipher = createDecipheriv(this.ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return new Uint8Array(decrypted);
    } catch (error) {
      throw new Error(
        `Failed to decrypt seed phrase: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ============================================================================
  // Wallet Storage Methods
  // ============================================================================

  /**
   * Load wallet storage file from disk
   * Creates file if it doesn't exist
   * @returns Wallet storage data
   */
  private loadWalletStorage(): WalletStorageFile {
    try {
      // Ensure data directory exists
      const dataDir = join(process.cwd(), 'data');
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }

      // Load storage file
      if (existsSync(this.WALLET_STORAGE_PATH)) {
        const fileContent = readFileSync(this.WALLET_STORAGE_PATH, 'utf-8');
        return JSON.parse(fileContent);
      }

      // Create empty storage if file doesn't exist
      return { wallets: {} };
    } catch (error) {
      logger.error(
        '[SolanaTransactionManager] Failed to load wallet storage:',
        error instanceof Error ? error.message : String(error)
      );
      return { wallets: {} };
    }
  }

  /**
   * Save wallet storage file to disk
   * @param storage Wallet storage data to save
   */
  private saveWalletStorage(storage: WalletStorageFile): void {
    try {
      writeFileSync(
        this.WALLET_STORAGE_PATH,
        JSON.stringify(storage, null, 2),
        'utf-8'
      );
    } catch (error) {
      logger.error(
        '[SolanaTransactionManager] Failed to save wallet storage:',
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  }

  // ============================================================================
  // Wallet Operations
  // ============================================================================

  /**
   * Get or create a Solana wallet for a user
   * - Checks cache first (5-min TTL)
   * - Loads from encrypted storage if exists
   * - Generates new keypair if no wallet found
   * - Stores encrypted seed phrase to disk
   *
   * Matches CDP's getOrCreateWallet pattern with encryption
   *
   * @param userId Unique user identifier
   * @returns Wallet public key and keypair
   * @throws Error if encryption not initialized or storage fails
   */
  async getOrCreateWallet(userId: string): Promise<{
    publicKey: string;
    keypair: Keypair;
  }> {
    logger.info(`[SolanaTransactionManager] Getting/creating wallet for user: ${userId.substring(0, 8)}...`);

    // Check cache first
    const cached = this.getCachedData(userId, this.walletsCache);
    if (cached) {
      logger.info(`[SolanaTransactionManager] Returning cached wallet: ${cached.publicKey.substring(0, 8)}...`);
      return {
        publicKey: cached.publicKey,
        keypair: cached.keypair,
      };
    }

    // Load storage
    const storage = this.loadWalletStorage();
    const storedWallet = storage.wallets[userId];

    let keypair: Keypair;

    if (storedWallet && storedWallet.network === this.network) {
      // Restore wallet from encrypted storage
      try {
        logger.info(`[SolanaTransactionManager] Restoring wallet from storage for user: ${userId.substring(0, 8)}...`);

        const decryptedSeed = this.decryptSeedPhrase(storedWallet.encryptedSeedPhrase);
        keypair = Keypair.fromSecretKey(decryptedSeed);

        logger.info(`[SolanaTransactionManager] Wallet restored: ${keypair.publicKey.toBase58().substring(0, 8)}...`);
      } catch (error) {
        // Decryption failed - regenerate wallet
        logger.warn(
          `[SolanaTransactionManager] Failed to decrypt wallet, generating new one:`,
          error instanceof Error ? error.message : String(error)
        );
        keypair = Keypair.generate();

        // Update storage with new wallet
        this.saveWalletWithEncryption(userId, keypair, storage);
      }
    } else {
      // Generate new wallet
      logger.info(`[SolanaTransactionManager] Generating new wallet for user: ${userId.substring(0, 8)}...`);
      keypair = Keypair.generate();

      // Save to encrypted storage
      this.saveWalletWithEncryption(userId, keypair, storage);
    }

    const publicKey = keypair.publicKey.toBase58();
    logger.info(`[SolanaTransactionManager] Wallet ready: ${publicKey.substring(0, 8)}... on ${this.network}`);

    // Cache wallet
    this.setCacheData(
      userId,
      {
        publicKey,
        keypair,
        network: this.network,
      },
      this.walletsCache
    );

    return { publicKey, keypair };
  }

  /**
   * Helper method to encrypt and save wallet to storage
   * @param userId User identifier
   * @param keypair Keypair to encrypt and save
   * @param storage Current storage object (will be mutated)
   */
  private saveWalletWithEncryption(
    userId: string,
    keypair: Keypair,
    storage: WalletStorageFile
  ): void {
    const encryptedSeedPhrase = this.encryptSeedPhrase(keypair.secretKey);

    storage.wallets[userId] = {
      userId,
      encryptedSeedPhrase,
      network: this.network,
      createdAt: Date.now(),
    };

    this.saveWalletStorage(storage);
    logger.info(`[SolanaTransactionManager] Wallet saved to encrypted storage`);
  }

  // ============================================================================
  // Balance Query Methods (Task 1.4)
  // ============================================================================

  /**
   * Get token balances for a user (SOL + SPL tokens)
   * - Checks cache first (5-min TTL)
   * - Fetches SOL balance + SPL token accounts
   * - Enriches with prices from CoinGecko
   * - Returns USD values for all tokens
   *
   * @param userId User identifier
   * @param runtime Agent runtime for CoinGecko service access
   * @param forceSync Bypass cache and fetch fresh data
   * @returns Token balances with USD values
   */
  public async getTokenBalances(
    userId: string,
    runtime: IAgentRuntime,
    forceSync: boolean = false
  ): Promise<{
    tokens: SolanaTokenBalance[];
    totalUsdValue: number;
    address: string;
    fromCache: boolean;
  }> {
    logger.info(
      `[SolanaTransactionManager] Getting token balances for user: ${userId.substring(0, 8)}...${forceSync ? ' (force sync)' : ''}`
    );

    // Check cache first (unless force sync)
    if (!forceSync) {
      const cached = this.getCachedData(userId, this.balancesCache);
      if (cached) {
        logger.info(`[SolanaTransactionManager] Returning cached token balances`);
        return { ...cached, fromCache: true };
      }
    }

    // Get wallet
    const { publicKey, keypair } = await this.getOrCreateWallet(userId);
    const pubkey = keypair.publicKey;

    const allTokens: SolanaTokenBalance[] = [];
    let totalUsdValue = 0;

    try {
      // Get SOL balance
      const { balance: solBalance, usdValue: solUsdValue, usdPrice: solUsdPrice } =
        await this.getSOLBalance(pubkey, runtime);

      // Add SOL to tokens list (only if balance > 0)
      if (solBalance > 0n) {
        const balanceFormatted = this.formatTokenBalance(solBalance, 9);
        allTokens.push({
          symbol: 'SOL',
          name: 'Solana',
          balance: solBalance.toString(),
          balanceFormatted: this.formatBalanceForDisplay(balanceFormatted),
          usdValue: solUsdValue,
          usdPrice: solUsdPrice,
          mintAddress: null,
          decimals: 9,
        });
        totalUsdValue += solUsdValue;
      }

      // Get SPL tokens
      const splAccounts = await this.getSPLTokenAccounts(pubkey);

      // Enrich with prices (parallel)
      const enrichmentPromises = splAccounts.map((account) =>
        this.enrichTokenWithPrice(account.mint, account.balance, account.decimals, runtime)
      );
      const splTokens = await Promise.all(enrichmentPromises);

      // Add SPL tokens to list and calculate total value
      for (const token of splTokens) {
        allTokens.push(token);
        totalUsdValue += token.usdValue;
      }

      const finalTotalUsdValue = isNaN(totalUsdValue) ? 0 : totalUsdValue;

      logger.info(
        `[SolanaTransactionManager] Found ${allTokens.length} tokens, total value: $${finalTotalUsdValue.toFixed(2)}`
      );

      // Prepare result
      const result = {
        tokens: allTokens,
        totalUsdValue: finalTotalUsdValue,
        address: publicKey,
      };

      // Cache result
      this.setCacheData(userId, result, this.balancesCache);

      return { ...result, fromCache: false };
    } catch (error) {
      logger.error(
        '[SolanaTransactionManager] Failed to fetch token balances:',
        error instanceof Error ? error.message : String(error)
      );
      return {
        tokens: [],
        totalUsdValue: 0,
        address: publicKey,
        fromCache: false,
      };
    }
  }

  /**
   * Get SOL balance for a public key
   * @param publicKey Solana public key
   * @param runtime Agent runtime for CoinGecko service
   * @returns SOL balance in lamports with USD value
   */
  private async getSOLBalance(
    publicKey: PublicKey,
    runtime: IAgentRuntime
  ): Promise<{ balance: bigint; usdValue: number; usdPrice: number }> {
    try {
      const connection = this.getConnection();
      const lamports = await connection.getBalance(publicKey);
      const balance = BigInt(lamports);

      logger.debug(`[SolanaTransactionManager] SOL balance: ${lamports} lamports`);

      // Fetch SOL price from CoinGecko
      let usdPrice = 0;
      try {
        const coingeckoService = runtime.getService('CoinGeckoService' as any);
        if (coingeckoService) {
          const metadata = await (coingeckoService as any).getTokenMetadata('solana');
          if (metadata && metadata.length > 0 && metadata[0].success) {
            const marketData = metadata[0].data as any;
            usdPrice = marketData?.market_data?.current_price?.usd || 0;
          }
        }
      } catch (priceError) {
        logger.warn(
          '[SolanaTransactionManager] Failed to fetch SOL price:',
          priceError instanceof Error ? priceError.message : String(priceError)
        );
      }

      // Calculate USD value
      const balanceNum = parseFloat(this.formatTokenBalance(balance, 9));
      const usdValue = balanceNum * usdPrice;

      return {
        balance,
        usdValue: isNaN(usdValue) ? 0 : usdValue,
        usdPrice: isNaN(usdPrice) ? 0 : usdPrice,
      };
    } catch (error) {
      logger.error(
        '[SolanaTransactionManager] Failed to get SOL balance:',
        error instanceof Error ? error.message : String(error)
      );
      return { balance: 0n, usdValue: 0, usdPrice: 0 };
    }
  }

  /**
   * Get SPL token accounts for a public key
   * @param publicKey Solana public key
   * @returns Array of SPL token accounts with non-zero balances
   */
  private async getSPLTokenAccounts(
    publicKey: PublicKey
  ): Promise<Array<{ mint: string; balance: bigint; decimals: number }>> {
    try {
      const connection = this.getConnection();

      logger.debug('[SolanaTransactionManager] Fetching SPL token accounts...');

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        programId: TOKEN_PROGRAM_ID,
      });

      const accounts: Array<{ mint: string; balance: bigint; decimals: number }> = [];

      for (const accountInfo of tokenAccounts.value) {
        try {
          const parsedData = accountInfo.account.data.parsed;
          const tokenAmount = parsedData?.info?.tokenAmount;

          if (!tokenAmount) continue;

          const balance = BigInt(tokenAmount.amount);
          if (balance === 0n) continue; // Skip zero-balance tokens

          accounts.push({
            mint: parsedData.info.mint,
            balance,
            decimals: tokenAmount.decimals,
          });
        } catch (parseError) {
          logger.warn(
            '[SolanaTransactionManager] Failed to parse token account:',
            parseError instanceof Error ? parseError.message : String(parseError)
          );
        }
      }

      logger.info(`[SolanaTransactionManager] Found ${accounts.length} SPL tokens`);
      return accounts;
    } catch (error) {
      logger.error(
        '[SolanaTransactionManager] Failed to get SPL token accounts:',
        error instanceof Error ? error.message : String(error)
      );
      return [];
    }
  }

  /**
   * Enrich token with price data from CoinGecko
   * @param mint Token mint address
   * @param balance Raw balance
   * @param decimals Token decimals
   * @param runtime Agent runtime for CoinGecko service
   * @returns Complete token balance object
   */
  private async enrichTokenWithPrice(
    mint: string,
    balance: bigint,
    decimals: number,
    runtime: IAgentRuntime
  ): Promise<SolanaTokenBalance> {
    let symbol = 'UNKNOWN';
    let name = 'Unknown Token';
    let usdPrice = 0;
    let icon: string | undefined = undefined;

    try {
      const coingeckoService = runtime.getService('CoinGeckoService' as any);

      if (coingeckoService) {
        const metadata = await (coingeckoService as any).getTokenMetadata(mint);

        if (metadata && metadata.length > 0 && metadata[0].success) {
          const tokenData = metadata[0].data as any;
          symbol = tokenData.symbol?.toUpperCase() || 'UNKNOWN';
          name = tokenData.name || 'Unknown Token';
          usdPrice = tokenData.market_data?.current_price?.usd || 0;
          icon = tokenData.image?.small || tokenData.image?.thumb;
        }
      }
    } catch (error) {
      logger.warn(
        `[SolanaTransactionManager] Failed to fetch metadata for ${mint}:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    // Format balance
    const balanceFormatted = this.formatTokenBalance(balance, decimals);
    const balanceNum = parseFloat(balanceFormatted);
    const usdValue = balanceNum * usdPrice;

    return {
      symbol,
      name,
      balance: balance.toString(),
      balanceFormatted: this.formatBalanceForDisplay(balanceFormatted),
      usdValue: isNaN(usdValue) ? 0 : usdValue,
      usdPrice: isNaN(usdPrice) ? 0 : usdPrice,
      mintAddress: mint,
      decimals,
      icon,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Format token balance from raw to human-readable
   * Handles very small balances with leading zeros
   * @param balance Raw balance as BigInt
   * @param decimals Token decimals
   * @returns Formatted string (e.g., "1.234567")
   */
  private formatTokenBalance(balance: bigint, decimals: number): string {
    try {
      const balanceStr = balance.toString();
      const decimalPoint = balanceStr.length - decimals;

      if (decimalPoint <= 0) {
        // Very small amounts: "0.00000123"
        const zeros = '0'.repeat(Math.abs(decimalPoint));
        return `0.${zeros}${balanceStr}`;
      } else {
        // Normal amounts: "123.456"
        const intPart = balanceStr.slice(0, decimalPoint);
        const fracPart = balanceStr.slice(decimalPoint);
        return `${intPart}.${fracPart}`;
      }
    } catch (error) {
      logger.warn(
        `[SolanaTransactionManager] Error formatting balance:`,
        error instanceof Error ? error.message : String(error)
      );
      return '0';
    }
  }

  /**
   * Remove trailing zeros for display
   * @param balance Formatted balance string
   * @returns Display-friendly balance (e.g., "1.000000" → "1")
   */
  private formatBalanceForDisplay(balance: string): string {
    return balance.replace(/\.?0+$/, '');
  }

  /**
   * Calculate total USD value from token array
   * @param tokens Array of token balances
   * @returns Total USD value with NaN safety
   */
  private calculateTotalUsdValue(tokens: SolanaTokenBalance[]): number {
    const total = tokens.reduce((sum, token) => {
      const value = token.usdValue || 0;
      return sum + (isNaN(value) ? 0 : value);
    }, 0);
    return isNaN(total) ? 0 : total;
  }

  // ============================================================================
  // Transaction Methods (Task 1.5)
  // ============================================================================

  /**
   * Send SOL or SPL tokens to a recipient
   * - Auto-creates ATAs for SPL token recipients if needed
   * - Validates balances before sending
   * - Waits for finalized confirmation
   * - Returns transaction signature and explorer URL
   *
   * @param params Transaction parameters
   * @returns Transaction result with signature and explorer URL
   */
  public async sendToken(params: {
    userId: string;
    to: string; // Base58 recipient address
    mint: string | null; // null = SOL, otherwise SPL token mint
    amount: string; // Raw amount (lamports for SOL, base units for SPL)
  }): Promise<{
    transactionHash: string;
    from: string;
    to: string;
    amount: string;
    token: string;
    network: string;
    explorerUrl: string;
  }> {
    logger.info(
      `[SolanaTransactionManager] User ${params.userId.substring(0, 8)}... sending ${params.mint || 'SOL'}...`
    );

    try {
      // Step 1: Validate and prepare
      const { senderKeypair, recipientPubkey, amountBigInt } =
        await this.validateAndPrepareSend(params);

      const connection = this.getConnection();

      // Step 2: Build transaction (SOL or SPL)
      let transaction: Transaction;
      if (params.mint === null) {
        logger.info('[SolanaTransactionManager] Building SOL transfer...');
        transaction = await this.buildSOLTransferTransaction(
          senderKeypair.publicKey,
          recipientPubkey,
          amountBigInt,
          connection
        );
      } else {
        logger.info(`[SolanaTransactionManager] Building SPL transfer for ${params.mint}...`);
        transaction = await this.buildSPLTransferTransaction(
          senderKeypair,
          recipientPubkey,
          new PublicKey(params.mint),
          amountBigInt,
          connection
        );
      }

      // Step 3: Send and confirm
      logger.info('[SolanaTransactionManager] Sending transaction...');
      const signature = await this.sendAndConfirmTransactionWithRetry(
        connection,
        transaction,
        [senderKeypair]
      );

      logger.info(`[SolanaTransactionManager] Transaction confirmed: ${signature}`);

      // Step 4: Return structured result
      return {
        transactionHash: signature,
        from: senderKeypair.publicKey.toBase58(),
        to: params.to,
        amount: params.amount,
        token: params.mint || 'SOL',
        network: this.network,
        explorerUrl: this.buildExplorerUrl(signature, this.network),
      };
    } catch (error) {
      logger.error(
        '[SolanaTransactionManager] Transaction failed:',
        error instanceof Error ? error.message : String(error)
      );
      throw error; // Re-throw for action layer handling
    }
  }

  /**
   * Validate transaction parameters and prepare for sending
   * @param params Transaction parameters
   * @returns Validated sender keypair, recipient pubkey, and amount
   */
  private async validateAndPrepareSend(params: {
    userId: string;
    to: string;
    mint: string | null;
    amount: string;
  }): Promise<{
    senderKeypair: Keypair;
    recipientPubkey: PublicKey;
    amountBigInt: bigint;
  }> {
    // Get sender wallet
    const { keypair: senderKeypair } = await this.getOrCreateWallet(params.userId);

    // Validate recipient address
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(params.to);
    } catch (error) {
      throw new Error(`Invalid Solana address: ${params.to}`);
    }

    // Validate amount
    const amountBigInt = BigInt(params.amount);
    if (amountBigInt <= 0n) {
      throw new Error('Amount must be greater than 0');
    }

    // Check balances
    const connection = this.getConnection();

    if (params.mint === null) {
      // SOL transfer - check SOL balance with buffer
      const balance = await connection.getBalance(senderKeypair.publicKey);
      const required = Number(amountBigInt) + this.MIN_SOL_BUFFER;

      if (balance < required) {
        throw new Error(
          `Insufficient SOL. Have: ${balance / LAMPORTS_PER_SOL} SOL, Need: ${required / LAMPORTS_PER_SOL} SOL (includes 0.01 SOL buffer for fees)`
        );
      }
    } else {
      // SPL transfer - check token balance and SOL for potential ATA creation
      const mintPubkey = new PublicKey(params.mint);

      try {
        const senderATA = await getOrCreateAssociatedTokenAccount(
          connection,
          senderKeypair,
          mintPubkey,
          senderKeypair.publicKey
        );

        if (BigInt(senderATA.amount.toString()) < amountBigInt) {
          throw new Error(
            `Insufficient token balance. Have: ${senderATA.amount.toString()}, Need: ${params.amount}`
          );
        }

        // Check SOL for potential ATA creation fee
        const solBalance = await connection.getBalance(senderKeypair.publicKey);
        if (solBalance < this.MIN_SOL_BUFFER) {
          throw new Error(
            `Insufficient SOL for transaction fees. Need at least 0.01 SOL, have: ${solBalance / LAMPORTS_PER_SOL} SOL`
          );
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('Insufficient')) {
          throw error;
        }
        throw new Error(
          `Failed to validate token balance: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return { senderKeypair, recipientPubkey, amountBigInt };
  }

  /**
   * Build SOL transfer transaction
   * @param from Sender public key
   * @param to Recipient public key
   * @param amount Amount in lamports
   * @param connection Solana connection
   * @returns Built transaction
   */
  private async buildSOLTransferTransaction(
    from: PublicKey,
    to: PublicKey,
    amount: bigint,
    connection: Connection
  ): Promise<Transaction> {
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports: Number(amount),
    });

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('finalized');

    const transaction = new Transaction({
      recentBlockhash: blockhash,
      lastValidBlockHeight,
      feePayer: from,
    }).add(transferInstruction);

    return transaction;
  }

  /**
   * Build SPL token transfer transaction
   * @param senderKeypair Sender keypair
   * @param recipient Recipient public key
   * @param mint Token mint address
   * @param amount Amount in base units
   * @param connection Solana connection
   * @returns Built transaction
   */
  private async buildSPLTransferTransaction(
    senderKeypair: Keypair,
    recipient: PublicKey,
    mint: PublicKey,
    amount: bigint,
    connection: Connection
  ): Promise<Transaction> {
    // Get or create sender ATA (should already exist from validation)
    const senderATA = await getOrCreateAssociatedTokenAccount(
      connection,
      senderKeypair,
      mint,
      senderKeypair.publicKey
    );

    // Get or create recipient ATA (may not exist - auto-create)
    logger.info('[SolanaTransactionManager] Checking recipient ATA...');
    const recipientATA = await getOrCreateAssociatedTokenAccount(
      connection,
      senderKeypair, // Payer (sender pays for recipient's ATA)
      mint,
      recipient // Owner
    );

    logger.info(
      `[SolanaTransactionManager] Recipient ATA: ${recipientATA.address.toBase58()}`
    );

    // Get mint info for decimals
    const mintInfo = await getMint(connection, mint);

    // Create transfer instruction
    const transferInstruction = createTransferCheckedInstruction(
      senderATA.address, // Source ATA
      mint, // Mint
      recipientATA.address, // Destination ATA
      senderKeypair.publicKey, // Owner (signer)
      Number(amount), // Amount
      mintInfo.decimals // Decimals (validation)
    );

    // Build transaction
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('finalized');

    const transaction = new Transaction({
      recentBlockhash: blockhash,
      lastValidBlockHeight,
      feePayer: senderKeypair.publicKey,
    }).add(transferInstruction);

    return transaction;
  }

  /**
   * Send and confirm transaction with retry on blockhash expiration
   * @param connection Solana connection
   * @param transaction Transaction to send
   * @param signers Signers for the transaction
   * @returns Transaction signature
   */
  private async sendAndConfirmTransactionWithRetry(
    connection: Connection,
    transaction: Transaction,
    signers: Keypair[]
  ): Promise<string> {
    try {
      // Send and confirm (built-in method with finalized commitment)
      const signature = await sendAndConfirmTransaction(connection, transaction, signers, {
        commitment: 'finalized',
        preflightCommitment: 'finalized',
      });

      return signature;
    } catch (error) {
      // Handle blockhash expiration
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Blockhash not found') || errorMessage.includes('block height exceeded')) {
        logger.warn('[SolanaTransactionManager] Blockhash expired, retrying...');

        // Refresh blockhash and retry once
        const { blockhash } = await connection.getLatestBlockhash('finalized');
        transaction.recentBlockhash = blockhash;

        const signature = await sendAndConfirmTransaction(connection, transaction, signers, {
          commitment: 'finalized',
          preflightCommitment: 'finalized',
        });

        return signature;
      }

      throw error;
    }
  }

  /**
   * Build explorer URL for transaction
   * @param signature Transaction signature
   * @param network Network identifier
   * @returns Explorer URL
   */
  private buildExplorerUrl(signature: string, network: string): string {
    if (network === 'solana') {
      return `https://solscan.io/tx/${signature}`;
    } else {
      return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
    }
  }
}
