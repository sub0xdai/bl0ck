import {
    type Action,
    type IAgentRuntime,
    type Memory,
    type State,
    type HandlerCallback,
    logger,
} from "@elizaos/core";
import { SolanaService } from "../services/solana.service";
import type { SolanaWalletBalances } from "../types";
import { getEntityUserId } from "../utils";

/**
 * Format wallet balance information for display
 */
function formatWalletInfo(result: SolanaWalletBalances, network: string): string {
    let text = `🔐 **Solana Wallet**\n\n`;
    text += `**Address:** \`${result.address}\`\n`;
    text += `**Network:** ${network === "solana" ? "Mainnet" : "Devnet"}\n`;
    text += `**Total Value:** $${result.totalUsdValue.toFixed(2)}\n`;

    if (result.fromCache) {
        text += `*(From cache - may be up to 5 minutes old)*\n`;
    }

    text += `\n**Tokens:**\n`;

    if (result.tokens.length === 0) {
        text += `  • No tokens found\n`;
    } else {
        for (const token of result.tokens) {
            text += `  • ${token.balanceFormatted} ${token.symbol}`;
            if (token.usdValue > 0) {
                text += ` ($${token.usdValue.toFixed(2)})`;
            }
            text += `\n`;
        }
    }

    return text;
}

/**
 * SOLANA_WALLET_INFO Action
 * Retrieves and displays user's Solana wallet information including:
 * - Wallet address
 * - SOL balance
 * - SPL token balances
 * - Total USD value
 */
export const solanaWalletInfo: Action = {
    name: "SOLANA_WALLET_INFO",
    similes: [
        "SOLANA_BALANCES",
        "SOLANA_WALLET",
        "MY SOLANA WALLET",
        "CHECK SOL",
        "SOLANA_BALANCE",
    ],
    description:
        "Retrieve Solana wallet information including SOL and SPL token balances with USD values",

    parameters: {
        forceSync: {
            type: "boolean",
            description: "Force fresh data fetch (bypass 5-minute cache)",
            required: false,
        },
    },

    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        try {
            const service = runtime.getService(
                SolanaService.serviceType
            ) as SolanaService;
            return !!service;
        } catch (error) {
            logger.warn(
                "[SOLANA_WALLET_INFO] Validation failed:",
                error instanceof Error ? error.message : String(error)
            );
            return false;
        }
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state?: State,
        _options?: Record<string, unknown>,
        callback?: HandlerCallback
    ) => {
        try {
            logger.info("[SOLANA_WALLET_INFO] Fetching wallet information");

            const service = runtime.getService(
                SolanaService.serviceType
            ) as SolanaService;

            if (!service) {
                throw new Error("SolanaService not initialized");
            }

            // Get the correct userId from entity metadata (JWT-authenticated ID)
            const userId = await getEntityUserId(runtime, message);
            const network = service.getNetwork();

            // Get token balances (uses 5-minute cache by default)
            const result = await service.getTokenBalances(userId, false);

            // Format response text
            const text = formatWalletInfo(result, network);

            // Send callback for streaming
            callback?.({ text, content: result });

            // Return structured result
            return {
                text,
                success: true,
                data: result,
            };
        } catch (error) {
            const errorMsg =
                error instanceof Error ? error.message : String(error);
            logger.error("[SOLANA_WALLET_INFO] Failed:", errorMsg);

            const errorText = `❌ Failed to fetch Solana wallet info: ${errorMsg}`;

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
                content: { text: "show my solana wallet" },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "Fetching your Solana wallet information...",
                    action: "SOLANA_WALLET_INFO",
                },
            },
        ],
        [
            {
                name: "{{user}}",
                content: { text: "what's my SOL balance?" },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "Checking your Solana balance...",
                    action: "SOLANA_WALLET_INFO",
                },
            },
        ],
        [
            {
                name: "{{user}}",
                content: { text: "check my solana tokens" },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "Let me fetch your Solana token balances...",
                    action: "SOLANA_WALLET_INFO",
                },
            },
        ],
    ],
};

export default solanaWalletInfo;
