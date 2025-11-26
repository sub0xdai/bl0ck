import {
    type Action,
    type IAgentRuntime,
    type Memory,
    type State,
    type HandlerCallback,
    logger,
} from "@elizaos/core";
import { PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { JupiterService } from "../services/jupiter.service";
import { SolanaService } from "../../../plugin-solana-core/src/services/solana.service";
import type { JupiterSwapResult } from "../types";

// Common token mints (mainnet addresses)
const TOKEN_MINTS: Record<string, string> = {
    SOL: "So11111111111111111111111111111111111111112",
    USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    WIF: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
};

/**
 * Resolve token symbol to mint address
 */
function getMintAddress(symbol: string): string {
    const upper = symbol.toUpperCase();
    return TOKEN_MINTS[upper] || symbol; // Fallback to raw address if not found
}

/**
 * Get token decimals from mint address
 * SOL (wrapped) uses 9 decimals
 * Other tokens: fetch from on-chain mint metadata
 */
async function getTokenDecimals(
    mintAddress: string,
    service: JupiterService
): Promise<number> {
    // SOL wrapped mint uses 9 decimals
    if (mintAddress === TOKEN_MINTS.SOL) {
        return 9;
    }

    try {
        const connection = (service as any).connection;
        const mintPubkey = new PublicKey(mintAddress);
        const mintInfo = await getMint(connection, mintPubkey);
        return mintInfo.decimals;
    } catch (error) {
        logger.warn(
            `[SOLANA_SWAP] Failed to fetch decimals for ${mintAddress}, defaulting to 9:`,
            error instanceof Error ? error.message : String(error)
        );
        // Fallback to 9 decimals (common for SOL ecosystem)
        return 9;
    }
}

/**
 * Format swap result for display
 */
function formatSwapResult(result: JupiterSwapResult): string {
    let text = `✅ **Swap Successful**\n\n`;
    text += `**Input:** ${result.inputAmount} lamports\n`;
    text += `**Output:** ${result.outputAmount} base units\n`;
    text += `**Price Impact:** ${parseFloat(result.priceImpact).toFixed(2)}%\n`;
    text += `**Network:** ${result.explorerUrl.includes("devnet") ? "Devnet" : "Mainnet"}\n\n`;
    text += `**Transaction:** \`${result.transactionHash}\`\n`;
    text += `**Explorer:** ${result.explorerUrl}\n`;
    return text;
}

/**
 * SOLANA_SWAP Action
 * Swaps Solana tokens using Jupiter DEX aggregator
 * Supports common token symbols (SOL, USDC, etc.) and raw mint addresses
 */
export const jupiterSwap: Action = {
    name: "SOLANA_SWAP",
    similes: ["JUPITER SWAP", "SWAP SOLANA", "TRADE SOLANA", "SWAP TOKENS"],
    description: "Swap Solana tokens using Jupiter DEX aggregator",

    parameters: {
        inputToken: {
            type: "string",
            description: "Input token symbol or mint address (e.g., 'SOL', 'USDC')",
            required: true,
        },
        outputToken: {
            type: "string",
            description: "Output token symbol or mint address",
            required: true,
        },
        amount: {
            type: "string",
            description: "Amount of input token to swap (in token units, e.g., '0.1' for 0.1 SOL)",
            required: true,
        },
        slippage: {
            type: "number",
            description: "Slippage tolerance in basis points (default: 50 = 0.5%)",
            required: false,
        },
    },

    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        try {
            const service = runtime.getService(
                JupiterService.serviceType
            ) as JupiterService;
            return !!service;
        } catch (error) {
            logger.warn(
                "[SOLANA_SWAP] Validation failed:",
                error instanceof Error ? error.message : String(error)
            );
            return false;
        }
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State,
        _options?: Record<string, unknown>,
        callback?: HandlerCallback
    ) => {
        try {
            logger.info("[SOLANA_SWAP] Processing token swap");

            const jupiterService = runtime.getService(
                JupiterService.serviceType
            ) as JupiterService;
            const solanaService = runtime.getService(
                SolanaService.serviceType
            ) as SolanaService;

            if (!jupiterService) {
                throw new Error("JupiterService not initialized");
            }
            if (!solanaService) {
                throw new Error("SolanaService not initialized");
            }

            const userId = message.entityId as string;

            // Extract parameters from composed state
            const composedState = await runtime.composeState(
                message,
                ["ACTION_STATE"],
                true
            );
            const params = composedState?.data?.actionParams || {};

            const inputToken = (params?.inputToken as string)?.trim();
            const outputToken = (params?.outputToken as string)?.trim();
            const amountStr = params?.amount as string;
            const slippageBps = params?.slippage
                ? parseInt(params.slippage as string)
                : 50;

            // Validate parameters
            if (!inputToken || !outputToken || !amountStr) {
                throw new Error(
                    "Required parameters: inputToken, outputToken, amount"
                );
            }

            // Resolve token mints (convert symbols to addresses)
            const inputMint = getMintAddress(inputToken);
            const outputMint = getMintAddress(outputToken);

            // Convert amount to raw units
            // NOTE: This assumes 9 decimals for all tokens (typical for SOL)
            // For production, fetch actual decimals from token metadata
            const amount = Math.floor(parseFloat(amountStr) * 1e9).toString();

            if (isNaN(parseFloat(amountStr)) || parseFloat(amountStr) <= 0) {
                throw new Error(`Invalid amount: ${amountStr}`);
            }

            // Execute swap
            logger.info(
                `[SOLANA_SWAP] Swapping ${amountStr} ${inputToken} -> ${outputToken} (${slippageBps} bps slippage)`
            );

            const result = await service.executeSwap({
                userId,
                inputMint,
                outputMint,
                amount,
                slippageBps,
            });

            const text = formatSwapResult(result);

            callback?.({ text, content: result });

            return {
                text,
                success: true,
                data: result,
            };
        } catch (error) {
            const errorMsg =
                error instanceof Error ? error.message : String(error);
            logger.error("[SOLANA_SWAP] Failed:", errorMsg);

            const errorText = `❌ Swap failed: ${errorMsg}`;

            callback?.({ text: errorText, content: null });

            return {
                text: errorText,
                success: false,
                error: errorMsg,
            };
        }
    },

    examples: [
        [
            {
                name: "{{user}}",
                content: { text: "swap 0.5 SOL to USDC" },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "Fetching quote and executing swap via Jupiter...",
                    action: "SOLANA_SWAP",
                },
            },
        ],
        [
            {
                name: "{{user}}",
                content: { text: "trade 100 USDC for BONK" },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "Processing swap on Jupiter aggregator...",
                    action: "SOLANA_SWAP",
                },
            },
        ],
        [
            {
                name: "{{user}}",
                content: { text: "swap 1 SOL for WIF with 1% slippage" },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "Executing swap with custom slippage...",
                    action: "SOLANA_SWAP",
                },
            },
        ],
    ],
};

export default jupiterSwap;
