# Lina: Solana Integration - Implementation Tasks

**Project**: Transform Otaku agent into Lina with Solana support
**Approach**: Atomic task execution - one component/class at a time
**Status**: Ready for implementation

---

## Phase 1: Core Infrastructure (MVP)

### Task 1.1: Chain Configuration Extension
**Component**: Chain configuration system
**Files**:
- `/home/m0xu/1-projects/lina/src/constants/chains.ts` (MODIFY)

**Subtasks**:
- [ ] Add `SolanaNetwork` and `SolanaChainConfig` types
- [ ] Extend `SupportedNetwork` union type to include Solana
- [ ] Create `isSolanaNetwork()` type guard function
- [ ] Add Solana mainnet config to `CHAIN_CONFIGS`
- [ ] Add Solana devnet config to `CHAIN_CONFIGS`
- [ ] Add helper functions: `getSolanaConfig()`, `getSolanaExplorerUrl()`

**Completion Criteria**:
- TypeScript compiles without errors
- Type guards correctly identify Solana networks
- Configs return correct RPC/explorer URLs

---

### Task 1.2: Solana Transaction Manager - Part 1 (Core Setup)
**Component**: Solana transaction manager singleton
**Files**:
- `/home/m0xu/1-projects/lina/src/managers/solana-transaction-manager.ts` (CREATE)

**Subtasks**:
- [ ] Create class with singleton pattern (`getInstance()`)
- [ ] Initialize Solana RPC connection (Helius or public)
- [ ] Set up cache structures (wallets, balances) with 5-min TTL
- [ ] Implement `getConnection()` helper
- [ ] Add logging for initialization

**Completion Criteria**:
- Singleton instance created successfully
- RPC connection established to devnet
- Cache structures initialized

---

### Task 1.3: Solana Transaction Manager - Part 2 (Wallet Management)
**Component**: Wallet creation and keypair management
**Files**:
- `/home/m0xu/1-projects/lina/src/managers/solana-transaction-manager.ts` (MODIFY)

**Subtasks**:
- [ ] Implement `encryptSeedPhrase()` with AES-256-GCM
- [ ] Implement `decryptSeedPhrase()` with AES-256-GCM
- [ ] Implement `getOrCreateWallet(userId)` with cache lookup
- [ ] Add database storage for encrypted seed phrases
- [ ] Add wallet restoration from database
- [ ] Generate new keypair if no wallet exists

**Completion Criteria**:
- Wallet created and stored in database
- Seed phrase encrypted and decrypted correctly
- Same public key returned on subsequent calls
- Cache invalidation works

---

### Task 1.4: Solana Transaction Manager - Part 3 (Balance Queries)
**Component**: Token balance fetching
**Files**:
- `/home/m0xu/1-projects/lina/src/managers/solana-transaction-manager.ts` (MODIFY)

**Subtasks**:
- [ ] Implement `getSOLBalance(publicKey)`
- [ ] Implement `getTokenBalances(userId)` for SOL + SPL tokens
- [ ] Integrate with Helius API (if key available) for token metadata
- [ ] Fallback to `getParsedTokenAccountsByOwner()` if no Helius
- [ ] Fetch token prices via CoinGecko integration
- [ ] Calculate total USD value
- [ ] Add 5-minute cache for balances

**Completion Criteria**:
- SOL balance fetched correctly
- SPL tokens listed with metadata
- USD values calculated
- Cache prevents excessive API calls

---

### Task 1.5: Solana Transaction Manager - Part 4 (Transactions)
**Component**: Transaction execution (SOL and SPL tokens)
**Files**:
- `/home/m0xu/1-projects/lina/src/managers/solana-transaction-manager.ts` (MODIFY)

**Subtasks**:
- [ ] Implement `sendSOL(userId, to, amount)` with pre-flight checks
- [ ] Implement `sendToken(userId, to, mintAddress, amount)`
- [ ] Add ATA creation for token recipients (if needed)
- [ ] Implement transaction signing and confirmation
- [ ] Add minimum SOL buffer validation (0.01 SOL for rent/fees)
- [ ] Return transaction signature and explorer URL
- [ ] Add comprehensive error handling

**Completion Criteria**:
- SOL transfers work on devnet
- SPL token transfers work on devnet
- Pre-flight balance checks prevent failures
- Transaction signatures returned and valid

---

### Task 1.6: Plugin - solana-core (Structure)
**Component**: Core Solana plugin package
**Files**:
- `/home/m0xu/1-projects/lina/src/plugins/plugin-solana-core/package.json` (CREATE)
- `/home/m0xu/1-projects/lina/src/plugins/plugin-solana-core/tsconfig.json` (CREATE)
- `/home/m0xu/1-projects/lina/src/plugins/plugin-solana-core/src/index.ts` (CREATE)

**Subtasks**:
- [ ] Create plugin directory structure
- [ ] Set up package.json with dependencies (@solana/web3.js, @solana/spl-token)
- [ ] Configure tsconfig.json (extends root config)
- [ ] Create index.ts with plugin export skeleton
- [ ] Add build script to package.json

**Completion Criteria**:
- Package structure follows plugin pattern (mirrors plugin-cdp)
- TypeScript compiles
- Package builds successfully

---

### Task 1.7: Plugin - solana-core (Action: SOLANA_WALLET_INFO)
**Component**: Wallet info action
**Files**:
- `/home/m0xu/1-projects/lina/src/plugins/plugin-solana-core/src/actions/solana-wallet-info.ts` (CREATE)
- `/home/m0xu/1-projects/lina/src/plugins/plugin-solana-core/src/index.ts` (MODIFY)

**Subtasks**:
- [ ] Create action file with ElizaOS Action interface
- [ ] Add similes: ["SOLANA_BALANCES", "SOLANA_WALLET", "MY SOLANA WALLET"]
- [ ] Implement validate function
- [ ] Implement handler that calls `SolanaTransactionManager.getTokenBalances()`
- [ ] Format response with public key, SOL balance, SPL tokens, total USD
- [ ] Export action from plugin index

**Completion Criteria**:
- Action registered in plugin
- Returns wallet info when invoked
- Response formatted clearly with balances

---

### Task 1.8: Plugin - solana-core (Action: SOLANA_TRANSFER)
**Component**: SOL transfer action
**Files**:
- `/home/m0xu/1-projects/lina/src/plugins/plugin-solana-core/src/actions/solana-transfer.ts` (CREATE)
- `/home/m0xu/1-projects/lina/src/plugins/plugin-solana-core/src/index.ts` (MODIFY)

**Subtasks**:
- [ ] Create action file with ElizaOS Action interface
- [ ] Add similes: ["SEND SOL", "TRANSFER SOLANA", "SEND SOLANA"]
- [ ] Parse recipient address and amount from message
- [ ] Validate recipient is valid Solana public key
- [ ] Implement handler that calls `SolanaTransactionManager.sendSOL()`
- [ ] Return transaction signature and explorer URL
- [ ] Export action from plugin index

**Completion Criteria**:
- Action parses transfer parameters correctly
- SOL transfers execute successfully
- Transaction signature returned

---

### Task 1.9: Plugin - solana-core (Action: SOLANA_TOKEN_TRANSFER)
**Component**: SPL token transfer action
**Files**:
- `/home/m0xu/1-projects/lina/src/plugins/plugin-solana-core/src/actions/solana-token-transfer.ts` (CREATE)
- `/home/m0xu/1-projects/lina/src/plugins/plugin-solana-core/src/index.ts` (MODIFY)

**Subtasks**:
- [ ] Create action file with ElizaOS Action interface
- [ ] Add similes: ["SEND SPL", "TRANSFER TOKEN", "SEND TOKEN"]
- [ ] Parse mint address, recipient, and amount from message
- [ ] Validate mint address and recipient public keys
- [ ] Implement handler that calls `SolanaTransactionManager.sendToken()`
- [ ] Return transaction signature and explorer URL
- [ ] Export action from plugin index

**Completion Criteria**:
- Action parses token transfer parameters
- SPL token transfers execute successfully
- Handles ATA creation for recipients

---

### Task 1.10: Plugin - jupiter (Structure)
**Component**: Jupiter DEX plugin package
**Files**:
- `/home/m0xu/1-projects/lina/src/plugins/plugin-jupiter/package.json` (CREATE)
- `/home/m0xu/1-projects/lina/src/plugins/plugin-jupiter/tsconfig.json` (CREATE)
- `/home/m0xu/1-projects/lina/src/plugins/plugin-jupiter/src/index.ts` (CREATE)

**Subtasks**:
- [ ] Create plugin directory structure
- [ ] Set up package.json with dependencies (@jup-ag/api)
- [ ] Configure tsconfig.json
- [ ] Create index.ts with plugin export skeleton
- [ ] Add build script

**Completion Criteria**:
- Package structure created
- Dependencies installed
- TypeScript compiles

---

### Task 1.11: Plugin - jupiter (Jupiter Service)
**Component**: Jupiter API integration service
**Files**:
- `/home/m0xu/1-projects/lina/src/plugins/plugin-jupiter/src/services/jupiter.service.ts` (CREATE)

**Subtasks**:
- [ ] Create JupiterService class
- [ ] Implement `getQuote(inputMint, outputMint, amount, slippageBps)`
- [ ] Implement `executeSwap(userId, quote)` with transaction building
- [ ] Integrate with Jupiter Quote API v6
- [ ] Sign and send transaction via SolanaTransactionManager
- [ ] Add error handling for failed swaps
- [ ] Add logging

**Completion Criteria**:
- Quote fetching works for SOL/USDC pair
- Swap execution completes successfully on devnet
- Transaction signature returned

---

### Task 1.12: Plugin - jupiter (Action: SOLANA_SWAP)
**Component**: Token swap action
**Files**:
- `/home/m0xu/1-projects/lina/src/plugins/plugin-jupiter/src/actions/jupiter-swap.ts` (CREATE)
- `/home/m0xu/1-projects/lina/src/plugins/plugin-jupiter/src/index.ts` (MODIFY)

**Subtasks**:
- [ ] Create action file with ElizaOS Action interface
- [ ] Add similes: ["JUPITER SWAP", "SWAP SOLANA", "TRADE SOLANA"]
- [ ] Parse swap parameters (fromToken, toToken, amount, slippage)
- [ ] Implement handler that calls JupiterService
- [ ] Display quote to user before execution
- [ ] Execute swap and return transaction signature
- [ ] Export action from plugin index

**Completion Criteria**:
- Action parses swap parameters
- Quote displayed to user
- Swap executes successfully
- Works for common pairs (SOL/USDC, SOL/BONK)

---

### Task 1.13: Character Configuration Update
**Component**: Lina agent character definition
**Files**:
- `/home/m0xu/1-projects/lina/src/character.ts` (MODIFY)

**Subtasks**:
- [ ] Change `name` field from "Otaku" to "Lina"
- [ ] Add Solana topics to `topics` array
- [ ] Add Solana message examples to `messageExamples`
- [ ] Update bio/lore to mention Solana support
- [ ] Extend transaction safety rules for Solana
- [ ] Add rent-exemption warnings to style guide

**Completion Criteria**:
- Character name is "Lina"
- Agent responds to Solana queries
- Safety protocols include Solana rules

---

### Task 1.14: Plugin Registration
**Component**: Agent plugin initialization
**Files**:
- `/home/m0xu/1-projects/lina/src/index.ts` (MODIFY)

**Subtasks**:
- [ ] Import solanaPlugin from plugin-solana-core
- [ ] Import jupiterPlugin from plugin-jupiter
- [ ] Add solanaPlugin to `projectAgent.plugins` array (after cdpPlugin)
- [ ] Add jupiterPlugin to `projectAgent.plugins` array
- [ ] Verify plugin order (SQL → Bootstrap → LLM → Wallets → Data)
- [ ] Update agent name reference to "Lina"

**Completion Criteria**:
- Plugins registered successfully
- Server starts without errors
- Solana actions available in agent

---

### Task 1.15: Environment Configuration
**Component**: Environment variables setup
**Files**:
- `/home/m0xu/1-projects/lina/.env.sample` (MODIFY)

**Subtasks**:
- [ ] Add `SOLANA_NETWORK` variable (devnet/mainnet-beta)
- [ ] Add `SOLANA_WALLET_SECRET` variable (with generation instructions)
- [ ] Add `HELIUS_API_KEY` variable (optional)
- [ ] Add comments explaining each variable
- [ ] Document security requirements

**Completion Criteria**:
- All Solana env vars documented
- Clear instructions for setup
- Security warnings included

---

### Task 1.16: Frontend - Chain Selector Component
**Component**: Multi-chain selector UI
**Files**:
- `/home/m0xu/1-projects/lina/src/frontend/components/dashboard/ChainSelector.tsx` (CREATE)

**Subtasks**:
- [ ] Create React component with Radix UI Select
- [ ] Add EVM chains section (Base, Ethereum, Polygon, etc.)
- [ ] Add Solana section (Mainnet, Devnet)
- [ ] Integrate with global state (Zustand/Context)
- [ ] Add chain icons
- [ ] Style with Tailwind

**Completion Criteria**:
- Dropdown displays all chains
- Selection updates global state
- Visually matches existing UI design

---

### Task 1.17: Frontend - Solana Wallet Hook
**Component**: Solana wallet state management
**Files**:
- `/home/m0xu/1-projects/lina/src/frontend/hooks/useSolanaWallet.ts` (CREATE)

**Subtasks**:
- [ ] Create React hook
- [ ] Fetch agent-managed wallet from API
- [ ] Return: `{ publicKey, balance, isConnected, disconnect }`
- [ ] Add React Query for caching
- [ ] Handle loading and error states

**Completion Criteria**:
- Hook returns Solana wallet info
- Balance updates on refetch
- Integrates with existing auth system

---

### Task 1.18: Frontend - Dashboard Integration
**Component**: Add chain selector to dashboard
**Files**:
- `/home/m0xu/1-projects/lina/src/frontend/components/dashboard/Dashboard.tsx` (MODIFY)

**Subtasks**:
- [ ] Import ChainSelector component
- [ ] Add to sidebar or header
- [ ] Wire up to wallet display
- [ ] Show Solana balance when Solana selected
- [ ] Test chain switching

**Completion Criteria**:
- Chain selector visible in dashboard
- Switching chains updates displayed wallet
- UI responsive and intuitive

---

### Task 1.19: Dependencies Installation
**Component**: NPM package management
**Files**:
- `/home/m0xu/1-projects/lina/package.json` (MODIFY)

**Subtasks**:
- [ ] Add `@solana/web3.js: ^1.95.8`
- [ ] Add `@solana/spl-token: ^0.4.9`
- [ ] Add `@jup-ag/api: ^6.0.0`
- [ ] Add `bs58: ^5.0.0`
- [ ] Run `bun install`
- [ ] Verify no dependency conflicts

**Completion Criteria**:
- All packages installed
- Build succeeds
- No version conflicts

---

### Task 1.20: Integration Testing - MVP
**Component**: End-to-end testing of Phase 1
**Files**:
- Test scripts (manual or automated)

**Subtasks**:
- [ ] Start server with Solana plugins
- [ ] Request devnet airdrop to test wallet
- [ ] Test: "What's my Solana balance?" (SOLANA_WALLET_INFO)
- [ ] Test: "Send 0.1 SOL to [address]" (SOLANA_TRANSFER)
- [ ] Test: "Swap 0.5 SOL to USDC" (SOLANA_SWAP)
- [ ] Verify all transactions on Solscan
- [ ] Document any bugs or issues

**Completion Criteria**:
- All Phase 1 actions work end-to-end
- Transactions confirm on devnet
- No crashes or errors
- Agent responds accurately

---

## Phase 2: NFT Integration

### Task 2.1: Plugin - metaplex (Structure)
**Component**: Metaplex NFT plugin
**Files**:
- `/home/m0xu/1-projects/lina/src/plugins/plugin-metaplex/` (CREATE entire plugin)

**Subtasks**:
- [ ] Create plugin directory structure
- [ ] Set up package.json with @metaplex-foundation/js
- [ ] Create plugin index and actions skeleton
- [ ] Build script

**Completion Criteria**:
- Plugin structure created
- Dependencies installed

---

### Task 2.2: Metaplex NFT Actions
**Component**: NFT buy/sell/transfer actions
**Files**:
- `/home/m0xu/1-projects/lina/src/plugins/plugin-metaplex/src/actions/` (CREATE)

**Subtasks**:
- [ ] Implement SOLANA_NFT_BUY action
- [ ] Implement SOLANA_NFT_SELL action
- [ ] Implement SOLANA_NFT_TRANSFER action
- [ ] Implement SOLANA_NFT_CANCEL action
- [ ] Integrate with Tensor/Magic Eden APIs

**Completion Criteria**:
- NFT actions registered
- Can buy/sell NFTs on devnet

---

### Task 2.3: Frontend - NFT Gallery
**Component**: NFT display UI
**Files**:
- `/home/m0xu/1-projects/lina/src/frontend/components/dashboard/SolanaNFTGallery.tsx` (CREATE)

**Subtasks**:
- [ ] Create NFT gallery component
- [ ] Fetch NFTs from Helius or Metaplex
- [ ] Display NFT grid with images
- [ ] Add quick actions (transfer, list)

**Completion Criteria**:
- NFTs displayed in UI
- Clicking NFT shows details

---

## Phase 3: Token Launches & DeFi

### Task 3.1: Plugin - pump-fun
**Component**: Token launch platform integration
**Files**:
- `/home/m0xu/1-projects/lina/src/plugins/plugin-pump-fun/` (CREATE)

**Subtasks**:
- [ ] Create plugin structure
- [ ] Implement PUMP_FUN_LAUNCH action
- [ ] Implement PUMP_FUN_BUY action
- [ ] Implement PUMP_FUN_SELL action

**Completion Criteria**:
- Can launch tokens on pump.fun
- Can buy/sell launched tokens

---

### Task 3.2: Plugin - solana-defi
**Component**: DeFi protocol integrations
**Files**:
- `/home/m0xu/1-projects/lina/src/plugins/plugin-solana-defi/` (CREATE)

**Subtasks**:
- [ ] Create plugin structure
- [ ] Implement Marinade staking actions
- [ ] Implement Jito staking actions
- [ ] Implement MarginFi lending actions
- [ ] Implement Drift trading actions

**Completion Criteria**:
- Can stake SOL on Marinade/Jito
- Can lend on MarginFi
- Can trade on Drift

---

## Phase 4: External Wallet Support

### Task 4.1: Wallet Adapter Integration
**Component**: External wallet connection
**Files**:
- `/home/m0xu/1-projects/lina/src/frontend/App.tsx` (MODIFY)
- Multiple wallet hook files

**Subtasks**:
- [ ] Add wallet adapter dependencies to package.json
- [ ] Wrap app with WalletProvider
- [ ] Add wallet connection UI (Phantom, Solflare, Backpack)
- [ ] Implement dual wallet mode (agent-managed vs external)
- [ ] Update useSolanaWallet hook for external wallets

**Completion Criteria**:
- Users can connect Phantom wallet
- Agent uses connected wallet for transactions
- Fallback to agent wallet if not connected

---

## Notes

- **Atomic Execution**: Feed one task at a time for focused implementation
- **Testing**: Test each task on devnet before moving to next
- **Dependencies**: Ensure previous tasks complete before dependent tasks
- **Rollback**: If task fails, debug before proceeding

**Current Status**: Ready to begin Task 1.1
