import { describe, it, expect, beforeEach, mock } from "bun:test";
import { jupiterSwap } from "./jupiter-swap";
import type { IAgentRuntime, Memory } from "@elizaos/core";
import type { JupiterService } from "../services/jupiter.service";
import type { SolanaService } from "../../../plugin-solana-core/src/services/solana.service";

// Create mock functions
const mockExecuteSwap = mock(() => Promise.resolve({}));
const mockGetQuote = mock(() => Promise.resolve({}));
const mockGetTokenBalances = mock(() => Promise.resolve({ tokens: [] }));
const mockComposeState = mock(() => Promise.resolve({ data: { actionParams: {} } }));
const mockGetSetting = mock((key: string) => {
    if (key === "SOLANA_NETWORK") return "solana"; // Default mainnet
    return null;
});
const mockGetService = mock((serviceType: string) => {
    if (serviceType === "JUPITER_SERVICE") return mockJupiterService;
    if (serviceType === "SOLANA_SERVICE") return mockSolanaService;
    return null;
});
const mockGetEntityById = mock(() => Promise.resolve({
    metadata: { author_id: "test-user-id-123" }
}));

// Mock services
const mockJupiterService = {
    executeSwap: mockExecuteSwap,
    getQuote: mockGetQuote,
} as unknown as JupiterService;

const mockSolanaService = {
    getTokenBalances: mockGetTokenBalances,
} as unknown as SolanaService;

const mockRuntime = {
    getService: mockGetService,
    composeState: mockComposeState,
    getSetting: mockGetSetting,
    getEntityById: mockGetEntityById,
} as unknown as IAgentRuntime;

describe("jupiterSwap", () => {
    beforeEach(() => {
        // Reset mocks
        mockExecuteSwap.mockReset();
        mockGetQuote.mockReset();
        mockGetTokenBalances.mockReset();
        mockComposeState.mockReset();
        mockGetService.mockReset();
        mockGetSetting.mockReset();
        mockGetEntityById.mockReset();

        // Restore default implementations
        mockGetService.mockImplementation((serviceType: string) => {
            if (serviceType === "JUPITER_SERVICE") return mockJupiterService;
            if (serviceType === "SOLANA_SERVICE") return mockSolanaService;
            return null;
        });

        // Default to mainnet
        mockGetSetting.mockImplementation((key: string) => {
            if (key === "SOLANA_NETWORK") return "solana";
            return null;
        });

        // Default entity with author_id
        mockGetEntityById.mockImplementation(() => Promise.resolve({
            metadata: { author_id: "test-user-id-123" }
        }));
    });

    describe("validation", () => {
        it("should validate when JupiterService is available on mainnet", async () => {
            const message = {} as Memory;
            const result = await jupiterSwap.validate(mockRuntime, message);
            expect(result).toBe(true);
        });

        it("should fail validation when JupiterService is missing", async () => {
            const badGetService = mock(() => null);
            const badRuntime = {
                getService: badGetService,
                getSetting: mockGetSetting,
            } as unknown as IAgentRuntime;

            const message = {} as Memory;
            const result = await jupiterSwap.validate(badRuntime, message);
            expect(result).toBe(false);
        });

        it("should fail validation on devnet network", async () => {
            const devnetGetSetting = mock((key: string) => {
                if (key === "SOLANA_NETWORK") return "solana-devnet";
                return null;
            });

            const devnetRuntime = {
                getService: mockGetService,
                getSetting: devnetGetSetting,
            } as unknown as IAgentRuntime;

            const message = {} as Memory;
            const result = await jupiterSwap.validate(devnetRuntime, message);
            expect(result).toBe(false);
        });

        it("should validate on mainnet network (using 'solana' identifier)", async () => {
            const mainnetGetSetting = mock((key: string) => {
                if (key === "SOLANA_NETWORK") return "solana";
                return null;
            });

            const mainnetRuntime = {
                getService: mockGetService,
                getSetting: mainnetGetSetting,
            } as unknown as IAgentRuntime;

            const message = {} as Memory;
            const result = await jupiterSwap.validate(mainnetRuntime, message);
            expect(result).toBe(true);
        });
    });

    describe("balance validation", () => {
        it("should reject swap when insufficient balance", async () => {
            const message = {
                entityId: "user-123",
            } as Memory;

            // Mock runtime.composeState to return swap parameters
            mockComposeState.mockResolvedValue({
                data: {
                    actionParams: {
                        inputToken: "SOL",
                        outputToken: "USDC",
                        amount: "10", // User wants to swap 10 SOL
                        slippage: 50,
                    },
                },
            });

            // Mock getTokenBalances to return insufficient balance
            mockGetTokenBalances.mockResolvedValue({
                tokens: [
                    {
                        symbol: "SOL",
                        balance: "5000000000", // Only 5 SOL (5 * 1e9 lamports)
                        mint: "So11111111111111111111111111111111111111112",
                    },
                ],
            });

            const result = await jupiterSwap.handler(mockRuntime, message);

            expect(result.success).toBe(false);
            expect(result.error).toContain("Insufficient SOL balance");
        });

        it("should proceed when sufficient balance", async () => {
            const message = {
                entityId: "user-123",
            } as Memory;

            mockComposeState.mockResolvedValue({
                data: {
                    actionParams: {
                        inputToken: "SOL",
                        outputToken: "USDC",
                        amount: "1", // User wants to swap 1 SOL
                        slippage: 50,
                    },
                },
            });

            // Mock getTokenBalances to return sufficient balance
            mockGetTokenBalances.mockResolvedValue({
                tokens: [
                    {
                        symbol: "SOL",
                        balance: "10000000000", // 10 SOL (10 * 1e9 lamports)
                        mint: "So11111111111111111111111111111111111111112",
                    },
                ],
            });

            // Mock executeSwap to return success
            mockExecuteSwap.mockResolvedValue({
                transactionHash: "abc123",
                inputToken: "So11111111111111111111111111111111111111112",
                outputToken: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
                inputAmount: "1000000000",
                outputAmount: "50000000",
                priceImpact: "0.1",
                explorerUrl: "https://solscan.io/tx/abc123",
            });

            const result = await jupiterSwap.handler(mockRuntime, message);

            expect(result.success).toBe(true);
            expect(mockExecuteSwap).toHaveBeenCalled();
        });
    });

    describe("decimal handling", () => {
        it("should correctly calculate SOL amount (9 decimals)", () => {
            const amountSOL = 0.5; // 0.5 SOL
            const decimals = 9;
            const expectedLamports = 500000000; // 0.5 * 1e9

            const result = Math.floor(amountSOL * Math.pow(10, decimals));
            expect(result).toBe(expectedLamports);
        });

        it("should correctly calculate USDC amount (6 decimals)", () => {
            const amountUSDC = 100; // 100 USDC
            const decimals = 6;
            const expectedBaseUnits = 100000000; // 100 * 1e6

            const result = Math.floor(amountUSDC * Math.pow(10, decimals));
            expect(result).toBe(expectedBaseUnits);
        });

        it("should correctly calculate BONK amount (5 decimals)", () => {
            const amountBONK = 1000; // 1000 BONK
            const decimals = 5;
            const expectedBaseUnits = 100000000; // 1000 * 1e5

            const result = Math.floor(amountBONK * Math.pow(10, decimals));
            expect(result).toBe(expectedBaseUnits);
        });
    });

    describe("error handling", () => {
        it("should handle invalid amount", async () => {
            const message = {
                entityId: "user-123",
            } as Memory;

            mockComposeState.mockResolvedValue({
                data: {
                    actionParams: {
                        inputToken: "SOL",
                        outputToken: "USDC",
                        amount: "invalid", // Invalid amount
                        slippage: 50,
                    },
                },
            });

            const result = await jupiterSwap.handler(mockRuntime, message);

            expect(result.success).toBe(false);
            expect(result.error).toContain("Invalid amount");
        });

        it("should handle missing parameters", async () => {
            const message = {
                entityId: "user-123",
            } as Memory;

            mockComposeState.mockResolvedValue({
                data: {
                    actionParams: {
                        // Missing required params
                    },
                },
            });

            const result = await jupiterSwap.handler(mockRuntime, message);

            expect(result.success).toBe(false);
            expect(result.error).toContain("Required parameters");
        });
    });

    describe("network validation", () => {
        it("should reject swap on devnet network in handler", async () => {
            const devnetGetSetting = mock((key: string) => {
                if (key === "SOLANA_NETWORK") return "solana-devnet";
                return null;
            });

            const devnetRuntime = {
                getService: mockGetService,
                getSetting: devnetGetSetting,
                composeState: mockComposeState,
            } as unknown as IAgentRuntime;

            const message = {
                entityId: "user-123",
            } as Memory;

            mockComposeState.mockResolvedValue({
                data: {
                    actionParams: {
                        inputToken: "SOL",
                        outputToken: "USDC",
                        amount: "1",
                        slippage: 50,
                    },
                },
            });

            const result = await jupiterSwap.handler(devnetRuntime, message);

            expect(result.success).toBe(false);
            expect(result.error).toContain("Jupiter swaps are only available on Solana Mainnet");
        });
    });
});
