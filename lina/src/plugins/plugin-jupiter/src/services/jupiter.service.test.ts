import { describe, it, expect, beforeEach, mock } from "bun:test";
import { JupiterService } from "./jupiter.service";
import type { IAgentRuntime } from "@elizaos/core";
import type { JupiterQuoteResponse } from "../types";

describe("JupiterService", () => {
    let service: JupiterService;
    let mockRuntime: IAgentRuntime;
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
        mockRuntime = {} as IAgentRuntime;
        service = new JupiterService(mockRuntime);
        originalFetch = global.fetch;
    });

    describe("getQuote", () => {
        it("should fetch quote from Jupiter API", async () => {
            const mockQuoteResponse: JupiterQuoteResponse = {
                inputMint: "So11111111111111111111111111111111111111112",
                outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                inAmount: "1000000000",
                outAmount: "50000000",
                otherAmountThreshold: "49500000",
                swapMode: "ExactIn",
                slippageBps: 50,
                priceImpactPct: "0.1",
                routePlan: [],
            };

            // Mock fetch
            const mockFetch = mock(() => Promise.resolve({
                ok: true,
                json: async () => mockQuoteResponse,
            } as Response));
            global.fetch = mockFetch;

            const quote = await service.getQuote(
                "So11111111111111111111111111111111111111112",
                "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                "1000000000",
                50
            );

            expect(quote).toEqual(mockQuoteResponse);
            expect(mockFetch).toHaveBeenCalled();

            // Restore original fetch
            global.fetch = originalFetch;
        });

        it("should throw error on failed quote", async () => {
            const mockFetch = mock(() => Promise.resolve({
                ok: false,
                text: async () => "API Error",
            } as Response));
            global.fetch = mockFetch;

            await expect(
                service.getQuote(
                    "So11111111111111111111111111111111111111112",
                    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                    "1000000000",
                    50
                )
            ).rejects.toThrow("Jupiter quote failed");

            // Restore original fetch
            global.fetch = originalFetch;
        });
    });

    describe("decimals handling", () => {
        it("should handle SOL with 9 decimals", () => {
            // SOL uses 9 decimals
            const amountSOL = 1.0; // 1 SOL
            const expectedLamports = 1000000000; // 1e9 lamports
            const result = Math.floor(amountSOL * 1e9);
            expect(result).toBe(expectedLamports);
        });

        it("should handle USDC with 6 decimals", () => {
            // USDC uses 6 decimals
            const amountUSDC = 100.0; // 100 USDC
            const expectedBaseUnits = 100000000; // 100 * 1e6
            const result = Math.floor(amountUSDC * 1e6);
            expect(result).toBe(expectedBaseUnits);
        });

        it("should handle BONK with 5 decimals", () => {
            // BONK uses 5 decimals
            const amountBONK = 1000.0; // 1000 BONK
            const expectedBaseUnits = 100000000; // 1000 * 1e5
            const result = Math.floor(amountBONK * 1e5);
            expect(result).toBe(expectedBaseUnits);
        });
    });
});
