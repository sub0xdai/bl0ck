import type { Plugin } from "@elizaos/core";
import { JupiterService } from "./services/jupiter.service";
import { jupiterSwap } from "./actions/jupiter-swap";

export const jupiterPlugin: Plugin = {
    name: "jupiter",
    description: "Jupiter DEX aggregator for Solana token swaps",
    evaluators: [],
    providers: [],
    actions: [jupiterSwap],
    services: [JupiterService],
};

export default jupiterPlugin;

// Export types for consumers
export type {
    JupiterQuoteResponse,
    JupiterSwapParams,
    JupiterSwapResult,
} from "./types";
export { JupiterService } from "./services/jupiter.service";
