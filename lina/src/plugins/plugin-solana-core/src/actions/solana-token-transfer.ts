import {
    type Action,
    type IAgentRuntime,
    type Memory,
    type State,
    type HandlerCallback,
    logger,
} from "@elizaos/core";
import { PublicKey } from "@solana/web3.js";
import { SolanaService } from "../services/solana.service";
import type { SolanaTransferResult, SolanaTokenBalance } from "../types";
import { getEntityUserId } from "../utils";

/**
 * Validate Solana address format
 */
function validateSolanaAddress(address: string): void {
    try {
        new PublicKey(address);
    } catch {
        throw new Error(`Invalid Solana address: ${address}`);
    }
}

/**
 * Convert human-readable amount to raw token units
 */
function convertToRawAmount(amount: string, decimals: number): string {
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
        throw new Error(`Invalid amount: ${amount}`);
    }
    return Math.floor(parsed * Math.pow(10, decimals)).toString();
}

/**
 * Format token transfer result for display
 */
function formatTokenTransferResult(
    result: SolanaTransferResult,
    amount: string,
    tokenSymbol: string
): string {
    let text = `✅ **Token Transfer Successful**\n\n`;
    text += `**From:** \`${result.from}\`\n`;
    text += `**To:** \`${result.to}\`\n`;
    text += `**Amount:** ${amount} ${tokenSymbol}\n`;
    text += `**Network:** ${result.network}\n\n`;
    text += `**Transaction:** \`${result.transactionHash}\`\n`;
    text += `**Explorer:** ${result.explorerUrl}\n`;
    return text;
}

/**
 * SOLANA_TOKEN_TRANSFER Action
 * Sends SPL tokens to another Solana address
 * Handles decimal conversion and ATA creation automatically
 */
export const solanaTokenTransfer: Action = {
    name: "SOLANA_TOKEN_TRANSFER",
    similes: ["SEND SPL", "TRANSFER TOKEN", "SEND TOKEN", "SPL_SEND"],
    description: "Send SPL tokens to another Solana address",

    parameters: {
        to: {
            type: "string",
            description: "Recipient Solana address (Base58)",
            required: true,
        },
        mint: {
            type: "string",
            description: "Token mint address (Base58)",
            required: true,
        },
        amount: {
            type: "string",
            description: 'Amount to send (human-readable, e.g., "100" for 100 USDC)',
            required: true,
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
                "[SOLANA_TOKEN_TRANSFER] Validation failed:",
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
            logger.info("[SOLANA_TOKEN_TRANSFER] Processing token transfer");

            const service = runtime.getService(
                SolanaService.serviceType
            ) as SolanaService;

            if (!service) {
                throw new Error("SolanaService not initialized");
            }

            // Get the correct userId from entity metadata (JWT-authenticated ID)
            const userId = await getEntityUserId(runtime, message);

            // Extract parameters from composed state
            const composedState = await runtime.composeState(
                message,
                ["ACTION_STATE"],
                true
            );
            const params = composedState?.data?.actionParams || {};

            const to = (params?.to as string)?.trim();
            const mint = (params?.mint as string)?.trim();
            const amountStr = params?.amount as string;

            // Validate required parameters
            if (!to || !mint || !amountStr) {
                throw new Error(
                    "Required parameters: recipient address, token mint, and amount"
                );
            }

            // Validate addresses
            validateSolanaAddress(to);
            validateSolanaAddress(mint);

            // Get token info from balances to determine decimals
            const balances = await service.getTokenBalances(userId);
            const token = balances.tokens.find((t) => t.mintAddress === mint);

            if (!token) {
                throw new Error(
                    `Token ${mint} not found in wallet. You must have this token to send it.`
                );
            }

            // Convert to raw amount based on token decimals
            const rawAmount = convertToRawAmount(amountStr, token.decimals);

            // Pre-flight: Check token balance
            const balanceRaw = parseFloat(token.balance);
            const requiredRaw = parseFloat(rawAmount);

            if (balanceRaw < requiredRaw) {
                throw new Error(
                    `Insufficient ${token.symbol} balance. Have ${token.balanceFormatted} ${token.symbol}, trying to send ${amountStr} ${token.symbol}`
                );
            }

            // Execute transfer
            logger.info(
                `[SOLANA_TOKEN_TRANSFER] Sending ${amountStr} ${token.symbol} to ${to}`
            );

            const result = await service.sendToken({
                userId,
                to,
                mint,
                amount: rawAmount,
            });

            // Format response
            const text = formatTokenTransferResult(
                result,
                amountStr,
                token.symbol
            );

            callback?.({ text, content: result });

            return {
                text,
                success: true,
                data: result,
            };
        } catch (error) {
            const errorMsg =
                error instanceof Error ? error.message : String(error);
            logger.error("[SOLANA_TOKEN_TRANSFER] Failed:", errorMsg);

            const errorText = `❌ Token transfer failed: ${errorMsg}`;

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
                content: {
                    text: "send 100 USDC to 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
                },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "Sending 100 USDC...",
                    action: "SOLANA_TOKEN_TRANSFER",
                },
            },
        ],
        [
            {
                name: "{{user}}",
                content: {
                    text: "transfer 50000 BONK to GfK9...xyz",
                },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "Processing BONK transfer...",
                    action: "SOLANA_TOKEN_TRANSFER",
                },
            },
        ],
    ],
};

export default solanaTokenTransfer;
