export interface SolanaToken {
  mint: string;
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  usdValue: number | null;
  icon?: string;
}

export interface SolanaWalletResponse {
  publicKey: string;
  solBalance: number;
  tokens: SolanaToken[];
  totalUSD: number;
}
