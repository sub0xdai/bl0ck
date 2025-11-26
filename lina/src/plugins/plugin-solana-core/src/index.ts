import type { Plugin } from "@elizaos/core";
import { SolanaService } from "./services/solana.service";
import {
    solanaWalletInfo,
    solanaTransfer,
    solanaTokenTransfer,
} from "./actions";

export const solanaPlugin: Plugin = {
    name: "solana-core",
    description:
        "Solana blockchain integration: wallet management, SOL/SPL token transfers, balance queries",
    evaluators: [],
    providers: [],
    actions: [solanaWalletInfo, solanaTransfer, solanaTokenTransfer],
    services: [SolanaService],
};

export default solanaPlugin;

// Export types for consumers
export type {
    SolanaTokenBalance,
    SolanaWalletBalances,
    SolanaTransferResult,
} from "./types";
export { SolanaService } from "./services/solana.service";
