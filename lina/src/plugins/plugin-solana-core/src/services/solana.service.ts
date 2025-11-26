import { IAgentRuntime, Service, logger } from "@elizaos/core";
import { SolanaTransactionManager } from "../../../../managers/solana-transaction-manager";
import type { SolanaWalletBalances, SolanaTransferResult } from "../types";

/**
 * SolanaService provides ElizaOS service-pattern access to SolanaTransactionManager
 * Handles Solana wallet operations, balance queries, and token transfers
 */
export class SolanaService extends Service {
    static serviceType = "SOLANA_SERVICE";
    capabilityDescription =
        "Solana blockchain integration via SolanaTransactionManager";

    private manager: SolanaTransactionManager;

    constructor(runtime: IAgentRuntime) {
        super(runtime);
        this.manager = SolanaTransactionManager.getInstance();
    }

    static async start(runtime: IAgentRuntime): Promise<SolanaService> {
        const svc = new SolanaService(runtime);
        logger.info("[SOLANA_SERVICE] Started with SolanaTransactionManager");
        return svc;
    }

    async stop(): Promise<void> {
        logger.info("[SOLANA_SERVICE] Stopping");
    }

    /**
     * Get token balances for a user's Solana wallet
     * @param userId - User identifier
     * @param forceSync - Force fresh data fetch (bypass 5-min cache)
     * @returns Wallet balances with SOL and SPL tokens
     */
    async getTokenBalances(
        userId: string,
        forceSync = false
    ): Promise<SolanaWalletBalances> {
        return this.manager.getTokenBalances(userId, this.runtime, forceSync);
    }

    /**
     * Send SOL or SPL tokens to another address
     * @param params - Transfer parameters
     * @param params.userId - User identifier
     * @param params.to - Recipient Solana address (Base58)
     * @param params.mint - Token mint address (null for SOL)
     * @param params.amount - Amount in raw units (lamports for SOL, token base units for SPL)
     * @returns Transaction result with hash and explorer URL
     */
    async sendToken(params: {
        userId: string;
        to: string;
        mint: string | null;
        amount: string;
    }): Promise<SolanaTransferResult> {
        return this.manager.sendToken(params);
    }

    /**
     * Get the current Solana network
     * @returns Network identifier
     */
    getNetwork(): "solana" | "solana-devnet" {
        return this.manager.getNetwork();
    }
}
