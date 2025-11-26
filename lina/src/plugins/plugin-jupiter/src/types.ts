/**
 * Types for Jupiter DEX plugin
 */

export interface JupiterQuoteResponse {
    inputMint: string;
    inAmount: string;
    outputMint: string;
    outAmount: string;
    otherAmountThreshold: string;
    swapMode: "ExactIn" | "ExactOut";
    slippageBps: number;
    platformFee: any;
    priceImpactPct: string;
    routePlan: any[];
    contextSlot?: number;
    timeTaken?: number;
}

export interface JupiterSwapParams {
    userId: string;
    inputMint: string;
    outputMint: string;
    amount: string;
    slippageBps?: number;
}

export interface JupiterSwapResult {
    transactionHash: string;
    inputToken: string;
    outputToken: string;
    inputAmount: string;
    outputAmount: string;
    priceImpact: string;
    explorerUrl: string;
}
