 # Lina
 _This is still in beta_

  Multi-chain AI trading agent built on ElizaOS. Trade across EVM + Solana from a single chat interface.

  ## What It Does

  **Spot Trading**
  - EVM swaps via Uniswap (Base, Ethereum, Polygon, Arbitrum, Optimism)
  - Solana swaps via Jupiter aggregator
  - Cross-chain bridging via Relay Protocol

  **Perpetuals**
  - Hyperliquid (EVM) - up to 25x leverage
  - Drift Protocol (Solana) - up to 20x leverage
  - Position management, P&L tracking, liquidation alerts

  **Analytics**
  - Token prices (CoinGecko)
  - Protocol TVL (DeFiLlama)
  - On-chain flows (Nansen MCP)
  - Crypto news (CoinDesk)

  **Wallets**
  - CDP wallet for all EVM chains
  - Agent-managed Solana wallet with encrypted seed storage
  - Unified dashboard across chains

  ## x402 Micropayments

  Lina can pay for premium APIs automatically using the [x402 protocol](https://x402.org).

  **How it works:**
  1. You ask Lina to fetch from a paid API
  2. If the API returns `402 Payment Required`, Lina reads the price
  3. Signs a USDC payment on Base from your CDP wallet
  4. Retries the request with proof of payment
  5. Returns the data + transaction hash

  **Example:**
  fetch https://premium-api.com/data with payment

  **Limits:** Default max 1 USDC per request. Configurable via `maxPayment` parameter.

  **Requires:** CDP wallet with USDC balance on Base

  ## Tech Stack

  | Layer | Stack |
  |-------|-------|
  | Runtime | Bun 1.2.21 |
  | Frontend | React 18, Vite, Tailwind 4, Radix UI |
  | Backend | ElizaOS server, Socket.IO |
  | Build | Turbo (monorepo) |
  | State | Zustand, React Query |

  ## Roadmap

  ### Now
  - Drift Protocol integration (Solana perps)
  - Solana → EVM bridge

  ### Next
  - Jupiter Perps as Drift alternative
  - Unified position view across chains
  - Auto-margin bridging (USDC)

  ### Future: bl0ck Integration
  Lina will integrate bl0ck's privacy features via WASM:

  - **Shadow Pass** - Prove wallet wealth without revealing addresses. Users can verify tier status (Ghost/Leviathan/Apex) for gated features without doxxing holdings.
  - **Phantom Wrapper** - Anonymous token wrapping. Wrap SOL/SPL into private commitments, unwrap to any address without linkability.
  - **Nullifier System** - Anti-replay protection for trades using zero-knowledge proofs.

  Privacy layer ships after bl0ck circuit (monerochan-rs zkVM) hits mainnet.
