import { IAgentRuntime, Service, logger } from "@elizaos/core";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { SolanaTransactionManager } from "../../../../managers/solana-transaction-manager";
import type {
    JupiterQuoteResponse,
    JupiterSwapParams,
    JupiterSwapResult,
} from "../types";

const JUPITER_QUOTE_API = "https://lite-api.jup.ag/swap/v1";

/**
 * JupiterService provides Jupiter DEX aggregator integration for Solana token swaps
 * Handles quote fetching, transaction building, and swap execution
 */
export class JupiterService extends Service {
    static serviceType = "JUPITER_SERVICE";
    capabilityDescription = "Jupiter DEX aggregator for Solana token swaps";

    private manager: SolanaTransactionManager;
    private connection: Connection;

    constructor(runtime: IAgentRuntime) {
        super(runtime);
        this.manager = SolanaTransactionManager.getInstance();
        this.connection = this.manager.getConnection();
    }

    static async start(runtime: IAgentRuntime): Promise<JupiterService> {
        const svc = new JupiterService(runtime);
        logger.info("[JUPITER_SERVICE] Started with Jupiter API v6");
        return svc;
    }

    async stop(): Promise<void> {
        logger.info("[JUPITER_SERVICE] Stopping");
    }

    /**
     * Get swap quote from Jupiter API
     * @param inputMint - Input token mint address
     * @param outputMint - Output token mint address
     * @param amount - Amount in raw units (base units)
     * @param slippageBps - Slippage tolerance in basis points (default: 50 = 0.5%)
     */
    async getQuote(
        inputMint: string,
        outputMint: string,
        amount: string,
        slippageBps: number = 50
    ): Promise<JupiterQuoteResponse> {
        const url = new URL(`${JUPITER_QUOTE_API}/quote`);
        url.searchParams.append("inputMint", inputMint);
        url.searchParams.append("outputMint", outputMint);
        url.searchParams.append("amount", amount);
        url.searchParams.append("slippageBps", slippageBps.toString());

        logger.info(
            `[JUPITER_SERVICE] Fetching quote: ${amount} ${inputMint} -> ${outputMint} (slippage: ${slippageBps} bps)`
        );

        const response = await fetch(url.toString());

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Jupiter quote failed: ${error}`);
        }

        const quote = (await response.json()) as JupiterQuoteResponse;

        logger.info(
            `[JUPITER_SERVICE] Quote received: ${quote.inAmount} -> ${quote.outAmount} (impact: ${quote.priceImpactPct}%)`
        );

        return quote;
    }

    /**
     * Execute swap using Jupiter
     * @param params - Swap parameters including userId, token mints, amount, and slippage
     * @returns Swap result with transaction hash and explorer URL
     */
    async executeSwap(params: JupiterSwapParams): Promise<JupiterSwapResult> {
        const { userId, inputMint, outputMint, amount, slippageBps = 50 } = params;

        // Get wallet keypair from SolanaTransactionManager
        const wallet = await this.manager.getOrCreateWallet(userId);
        const userPublicKey = wallet.publicKey;

        // Get quote from Jupiter
        const quote = await this.getQuote(
            inputMint,
            outputMint,
            amount,
            slippageBps
        );

        // Get swap transaction from Jupiter
        logger.info("[JUPITER_SERVICE] Requesting swap transaction from Jupiter API");

        const swapResponse = await fetch(`${JUPITER_QUOTE_API}/swap`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                quoteResponse: quote,
                userPublicKey: userPublicKey,
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: "auto",
            }),
        });

        if (!swapResponse.ok) {
            const error = await swapResponse.text();
            throw new Error(`Jupiter swap transaction failed: ${error}`);
        }

        const swapData = await swapResponse.json() as { swapTransaction: string };
        const { swapTransaction } = swapData;

        // Deserialize versioned transaction
        const swapTransactionBuf = Buffer.from(swapTransaction, "base64");
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

        // Sign transaction with user's wallet
        transaction.sign([wallet.keypair]);

        logger.info("[JUPITER_SERVICE] Sending signed transaction to Solana network");

        // Send transaction to Solana network
        const signature = await this.connection.sendRawTransaction(
            transaction.serialize(),
            {
                skipPreflight: false,
                maxRetries: 3,
            }
        );

        // Confirm transaction
        const confirmation = await this.connection.confirmTransaction(
            signature,
            "confirmed"
        );

        if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        logger.info(`[JUPITER_SERVICE] Swap successful: ${signature}`);

        // Get explorer URL
        const network = this.manager.getNetwork();
        const cluster = network === "solana" ? "" : "?cluster=devnet";
        const explorerUrl = `https://solscan.io/tx/${signature}${cluster}`;

        return {
            transactionHash: signature,
            inputToken: inputMint,
            outputToken: outputMint,
            inputAmount: quote.inAmount,
            outputAmount: quote.outAmount,
            priceImpact: quote.priceImpactPct,
            explorerUrl,
        };
    }
}
