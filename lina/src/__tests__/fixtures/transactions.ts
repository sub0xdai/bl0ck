/**
 * Transaction fixtures for testing
 * Covers EVM (CDP) and Solana transaction data
 */

/**
 * Common token addresses
 */
export const TokenAddresses = {
  // EVM (Base chain)
  evm: {
    ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
  },
  // Solana
  solana: {
    SOL: "So11111111111111111111111111111111111111112",
    USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  },
} as const;

/**
 * Token decimals
 */
export const TokenDecimals: Record<string, number> = {
  ETH: 18,
  WETH: 18,
  USDC: 6,
  DAI: 18,
  SOL: 9,
  BONK: 5,
  JUP: 6,
};

/**
 * Mock balance responses
 */
export const MockBalances = {
  evmRich: {
    ETH: { balance: "5000000000000000000", formatted: "5.0", usdValue: 15000 }, // 5 ETH
    USDC: { balance: "10000000000", formatted: "10000.0", usdValue: 10000 }, // 10k USDC
  },
  evmPoor: {
    ETH: { balance: "100000000000000000", formatted: "0.1", usdValue: 300 }, // 0.1 ETH
    USDC: { balance: "50000000", formatted: "50.0", usdValue: 50 }, // 50 USDC
  },
  solanaRich: {
    SOL: { balance: "50000000000", formatted: "50.0", usdValue: 7500 }, // 50 SOL
    USDC: { balance: "5000000000", formatted: "5000.0", usdValue: 5000 }, // 5k USDC
  },
  solanaPoor: {
    SOL: { balance: "500000000", formatted: "0.5", usdValue: 75 }, // 0.5 SOL
    USDC: { balance: "10000000", formatted: "10.0", usdValue: 10 }, // 10 USDC
  },
} as const;

/**
 * Mock swap quotes
 */
export const MockSwapQuotes = {
  ethToUsdc: {
    inputToken: TokenAddresses.evm.ETH,
    outputToken: TokenAddresses.evm.USDC,
    inputAmount: "1000000000000000000", // 1 ETH
    outputAmount: "3000000000", // 3000 USDC
    priceImpact: "0.05",
    route: "ETH -> USDC",
    gas: "150000",
    gasPrice: "1000000000", // 1 gwei
  },
  solToUsdc: {
    inputMint: TokenAddresses.solana.SOL,
    outputMint: TokenAddresses.solana.USDC,
    inAmount: "1000000000", // 1 SOL
    outAmount: "150000000", // 150 USDC
    otherAmountThreshold: "148500000", // 1% slippage
    swapMode: "ExactIn",
    slippageBps: 100,
    priceImpactPct: "0.1",
    routePlan: [],
  },
} as const;

/**
 * Mock transaction results
 */
export const MockTransactionResults = {
  evmSuccess: {
    hash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    status: "success",
    blockNumber: 12345678,
    gasUsed: "120000",
    effectiveGasPrice: "1000000000",
    explorerUrl: "https://basescan.org/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  },
  solanaSuccess: {
    signature: "5UfgJ5vVZxUxefDGqzqkVLHzHFVJwjKHvpDYrMd8q1qVJ8nxJkqZGrSx6xjEJHZqMQN8vZJq3K7Jk2H9s8FJqZqJ",
    slot: 234567890,
    confirmationStatus: "finalized",
    explorerUrl: "https://solscan.io/tx/5UfgJ5vVZxUxefDGqzqkVLHzHFVJwjKHvpDYrMd8q1qVJ8nxJkqZGrSx6xjEJHZqMQN8vZJq3K7Jk2H9s8FJqZqJ",
  },
  evmFailed: {
    hash: "0xfailed00000000000000000000000000000000000000000000000000000000",
    status: "failed",
    error: "execution reverted: insufficient balance",
  },
  solanaFailed: {
    signature: null,
    error: "Transaction simulation failed: Insufficient funds",
  },
} as const;

/**
 * Helper to create a mock wallet balance response
 */
export function createMockWalletInfo(
  chain: "evm" | "solana",
  balanceProfile: "rich" | "poor" = "rich"
): Record<string, unknown> {
  const balances = chain === "evm"
    ? (balanceProfile === "rich" ? MockBalances.evmRich : MockBalances.evmPoor)
    : (balanceProfile === "rich" ? MockBalances.solanaRich : MockBalances.solanaPoor);

  return {
    chain,
    address: chain === "evm"
      ? "0x1234567890123456789012345678901234567890"
      : "11111111111111111111111111111111",
    balances: Object.entries(balances).map(([symbol, data]) => ({
      symbol,
      ...data,
    })),
    totalUsdValue: Object.values(balances).reduce((sum, b) => sum + b.usdValue, 0),
  };
}

/**
 * Helper to create mock Jupiter quote response
 */
export function createMockJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: string,
  slippageBps = 50
): Record<string, unknown> {
  return {
    inputMint,
    outputMint,
    inAmount: amount,
    outAmount: String(Math.floor(Number(amount) * 0.95)), // Mock 5% worse rate
    otherAmountThreshold: String(Math.floor(Number(amount) * 0.95 * (1 - slippageBps / 10000))),
    swapMode: "ExactIn",
    slippageBps,
    priceImpactPct: "0.1",
    routePlan: [
      {
        swapInfo: {
          ammKey: "mock-amm",
          label: "Raydium",
          inputMint,
          outputMint,
          inAmount: amount,
          outAmount: String(Math.floor(Number(amount) * 0.95)),
          feeAmount: String(Math.floor(Number(amount) * 0.003)),
          feeMint: inputMint,
        },
        percent: 100,
      },
    ],
  };
}
