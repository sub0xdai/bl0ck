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
import type { SolanaTransferResult } from "../types";
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
 * Format transfer result for display
 */
function formatTransferResult(
    result: SolanaTransferResult,
    amountSOL: string
): string {
    let text = `✅ **Transfer Successful**\n\n`;
    text += `**From:** \`${result.from}\`\n`;
    text += `**To:** \`${result.to}\`\n`;
    text += `**Amount:** ${amountSOL} SOL\n`;
    text += `**Network:** ${result.network}\n\n`;
    text += `**Transaction:** \`${result.transactionHash}\`\n`;
    text += `**Explorer:** ${result.explorerUrl}\n`;
    return text;
}

/**
 * SOLANA_TRANSFER Action
 * Sends SOL to another Solana address with pre-flight validation
 * Includes balance checks and 0.01 SOL buffer for fees
 */
export const solanaTransfer: Action = {
    name: "SOLANA_TRANSFER",
    similes: ["SEND SOL", "TRANSFER SOLANA", "SEND SOLANA", "SOL_SEND"],
    description: "Send SOL to another Solana address",

    parameters: {
        to: {
            type: "string",
            description: "Recipient Solana address (Base58)",
            required: true,
        },
        amount: {
            type: "string",
            description: 'Amount of SOL to send (e.g., "0.1")',
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
                "[SOLANA_TRANSFER] Validation failed:",
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
            logger.info("[SOLANA_TRANSFER] Processing SOL transfer");

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
            const amountStr = params?.amount as string;

            // Validate parameters
            if (!to) {
                throw new Error("Recipient address required");
            }
            if (!amountStr) {
                throw new Error("Amount required");
            }

            // Validate recipient address format
            validateSolanaAddress(to);

            // Parse and validate amount
            const amount = parseFloat(amountStr);
            if (isNaN(amount) || amount <= 0) {
                throw new Error(`Invalid amount: ${amountStr}`);
            }

            // Convert to lamports (1 SOL = 1e9 lamports)
            const lamports = Math.floor(amount * 1e9).toString();

            // Pre-flight: Check balance
            const balances = await service.getTokenBalances(userId);
            const solBalance = balances.tokens.find((t) => t.symbol === "SOL");

            if (!solBalance) {
                throw new Error("SOL balance not found");
            }

            const balanceSOL = parseFloat(solBalance.balance) / 1e9;
            const requiredSOL = amount + 0.01; // Include 0.01 SOL buffer for fees

            if (balanceSOL < requiredSOL) {
                throw new Error(
                    `Insufficient balance. Have ${balanceSOL.toFixed(4)} SOL, need ${requiredSOL.toFixed(4)} SOL (including 0.01 SOL fee buffer)`
                );
            }

            // Execute transfer
            logger.info(
                `[SOLANA_TRANSFER] Sending ${amount} SOL to ${to}`
            );

            const result = await service.sendToken({
                userId,
                to,
                mint: null, // null = SOL
                amount: lamports,
            });

            // Format response
            const text = formatTransferResult(result, amountStr);

            callback?.({ text, content: result });

            return {
                text,
                success: true,
                data: result,
            };
        } catch (error) {
            const errorMsg =
                error instanceof Error ? error.message : String(error);
            logger.error("[SOLANA_TRANSFER] Failed:", errorMsg);

            const errorText = `❌ SOL transfer failed: ${errorMsg}`;

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
                    text: "send 0.1 SOL to 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
                },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "Sending 0.1 SOL...",
                    action: "SOLANA_TRANSFER",
                },
            },
        ],
        [
            {
                name: "{{user}}",
                content: {
                    text: "transfer 0.5 SOL to my friend at GfK9...xyz",
                },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "Processing SOL transfer...",
                    action: "SOLANA_TRANSFER",
                },
            },
        ],
    ],
};

export default solanaTransfer;
