/**
 * Types for Solana plugin
 */

export interface SolanaTokenBalance {
    symbol: string;
    name: string;
    balance: string;
    balanceFormatted: string;
    usdValue: number;
    usdPrice: number;
    mintAddress: string | null;
    decimals: number;
    icon?: string;
}

export interface SolanaWalletBalances {
    tokens: SolanaTokenBalance[];
    totalUsdValue: number;
    address: string;
    fromCache: boolean;
}

export interface SolanaTransferResult {
    transactionHash: string;
    from: string;
    to: string;
    amount: string;
    token: string;
    network: string;
    explorerUrl: string;
}
