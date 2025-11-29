# UX Bottlenecks & Architectural Recommendations for Lina

This document outlines key User Experience (UX) bottlenecks and proposes architectural improvements for the Lina project, focusing on the frontend and its interaction with the agent's wallet.

---

## 🏗 Architectural & UX Review

**Current Status:**
The application uses a **Two-Wallet Model**:
1.  **Auth Wallet:** User's personal wallet (MetaMask/Phantom) used *only* for signing in.
2.  **Agent Wallet:** A persistent, backend-managed wallet (CDP) that the agent controls.

### 🚨 Critical UX Bottlenecks

**1. The "Empty Wallet" Shock (Onboarding Gap)**
*   **Problem:** Users sign in with their funded personal wallet but land on a dashboard showing **$0.00** in the `CDPWalletCard`. This is technically correct (the *Agent Wallet* is empty), but highly confusing for new users. They expect their funds to be immediately visible.
*   **Impact:** High potential for user confusion and drop-off. Users assume the app failed to connect to their funds or that their funds are lost.
*   **Solution:** Implement a **"First-Run Funding Flow"**.
    *   Detect `balance === 0` on first login (or when the agent wallet is first provisioned).
    *   Trigger a dedicated onboarding modal: *"Initialize your Agent. Deposit funds to start interacting."*
    *   This modal should clearly explain the "Two-Wallet Model" and guide the user through the process of transferring funds from their Auth Wallet to their Agent Wallet.

**2. Tight Coupling of Wallet Logic & State Management**
*   **Problem:** The `CDPWalletCard` component manages its own data fetching and state for tokens, NFTs, and transactions. Updates (e.g., after an agent action) are triggered indirectly via a React `ref` (`walletRef.current.refreshAll()`) from the `ChatInterface` through `MainApp.tsx`.
*   **Impact:**
    *   **Poor maintainability:** Difficult to reason about data flow and state changes.
    *   **Limited reusability:** Wallet data cannot be easily consumed by other components (e.g., the chat input for pre-flight checks).
    *   **Suboptimal UX:** Other parts of the UI (like the chat input) cannot easily access wallet balance to provide real-time feedback (e.g., disabling a "Swap" button if funds are insufficient).
*   **Solution:** Centralize wallet state management using a **Global Context (`AgentWalletProvider`)**.
    *   *Before (Current):* `ChatInterface` calls `MainApp` which calls `CDPWalletCard` (via ref) to refresh.
    *   *After (Proposed):* `ChatInterface` and `CDPWalletCard` both consume `useAgentWallet()`. When an agent action completes, the `AgentWalletContext` updates, and all consuming UI components (including the `CDPWalletCard` and chat input) reflect the change automatically.

**3. Static "Quick Start" Prompts**
*   **Problem:** The `ChatInterface` (when there are no messages) displays generic "Quick Start" prompts (e.g., "Transfer 0.01 ETH to 0x...") even if the Agent Wallet is empty.
*   **Impact:** Users might attempt commands that are guaranteed to fail due to lack of funds, leading to frustration.
*   **Solution:** Implement **Context-Aware Prompts**.
    *   If `AgentWalletContext.totalBalanceUsd === 0`: Show prompts like "How do I deposit funds?", "What is an Agent Wallet?", "Explore available plugins."
    *   If `AgentWalletContext.totalBalanceUsd > 0`: Display action-oriented prompts relevant to a funded wallet, such as "Swap USDC for ETH," or "Check my portfolio."

---

## 🛠 Proposed Action Plan (Read-Only Recommendations)

These recommendations are broken down into phases, with Phase 1 being the most critical for immediate UX improvement.

### Phase 1: The "Bridge" (Immediate UX Clarity)

1.  **Visual Clarity for Agent Wallet:**
    *   **In `CDPWalletCard`:** Add a clear label or tooltip next to the "Total Balance" or wallet address stating: *"This is your Agent-Managed Wallet (Lina will use these funds for transactions)."* This educates users on the "Two-Wallet Model."
    *   **Rename Wallet Toggle:** The current "EVM / SOL" toggle could be more descriptive, e.g., "EVM Agent Wallet / Solana Agent Wallet."
2.  **Highlight "Fund" Button:**
    *   **In `CDPWalletCard`:** If `totalUsdValue === 0`, make the "Fund" button visually prominent (e.g., a pulsing animation, a distinct background color, or an outline with a subtle glow) to guide new users.
3.  **Context-Aware Quick Prompts:**
    *   **In `ChatInterface`:** Modify the logic for displaying `PLUGIN_ACTIONS` prompts. If the `AgentWalletContext` indicates `totalBalanceUsd === 0`, filter the prompts to show only "informational" ones (e.g., related to funding, wallet explanation) and hide action-oriented ones that require funds.

### Phase 2: Architectural Refactor (Centralized Wallet State)

1.  **Create `AgentWalletContext`:**
    *   Create a new React Context (`src/frontend/contexts/AgentWalletContext.tsx`).
    *   Move the state (`tokens`, `totalUsdValue`, `nfts`, `transactions`, `isLoadingTokens`, etc.) and the data fetching/syncing functions (`fetchTokens`, `syncTokens`, `fetchNfts`, `syncNfts`, `fetchHistory`) from `CDPWalletCard` into this context.
    *   Provide a `useAgentWallet` hook to consume this context.
2.  **Integrate `AgentWalletContext`:**
    *   **`CDPWalletCard`:** Rework `CDPWalletCard` to consume state and functions from `useAgentWallet`. Remove all internal data fetching logic.
    *   **`ChatInterface`:** Modify `onActionCompleted` to call `useAgentWallet().refresh()`, removing the `ref` dependency on `CDPWalletCard`.
    *   **Other components:** Any other component needing wallet info can now easily use `useAgentWallet()`.

### Phase 3: Dedicated Interactive Onboarding Flow

1.  **Implement `DepositOnboardingModal`:**
    *   Create a new modal component for guiding the user through the first deposit.
    *   This modal should explain *why* funds are needed, *how* to deposit, and potentially show a QR code or address for easy transfer from their Auth Wallet.
2.  **Integrate Onboarding Logic into `MainApp.tsx`:**
    *   Add state in `MainApp` (or `App.tsx`'s `AuthGate`) to track if a user has completed initial funding (e.g., `hasFundedAgentWallet`). This could be a persistent flag stored in local storage or fetched from a user profile endpoint.
    *   If `hasFundedAgentWallet` is `false` AND `useAgentWallet().totalBalanceUsd === 0`, display the `DepositOnboardingModal`.
    *   After a successful deposit, set `hasFundedAgentWallet` to `true`.
3.  **Refine "Fund" Modal:**
    *   The existing `FundModalContent` is a good starting point but would need to be enhanced for this first-time onboarding experience (e.g., emphasizing the security implications of depositing to an agent-managed wallet).

---

### Current Codebase Observations

*   **File:** `src/frontend/components/dashboard/cdp-wallet-card/index.tsx`
    *   **Line 77:** The component uses `forwardRef` to expose `refreshTokens`, `refreshNFTs`, etc. This highlights the current "heavy component" pattern and the need for a more centralized state management approach.
    *   **Line 116:** The `sortTokensByUsdValueDesc` helper function, along with `getChainSortOrder`, is embedded within the component. Extracting such utility functions into shared `lib/utils` or `hooks` would improve modularity and testability.

*   **File:** `src/frontend/screens/MainApp.tsx`
    *   **Line 55:** `const walletRef = useRef<CDPWalletCardRef>(null);`
    *   **Line 611:** `await walletRef.current?.refreshAll();` This clearly demonstrates the manual, ref-based data synchronization between the chat interface and the wallet display, reinforcing the need for a global state management solution.
    *   **Line 214:** The `syncUserEntity` function, which `MainApp` depends on, fetches the user's `agentWalletAddress` from `elizaClient.cdp.getOrCreateWallet`. This is the perfect place to check if the agent wallet needs initial funding.
    *   The overall structure of `MainApp` (using `LoadingPanelProvider` and `ModalProvider`) already supports the kind of modal-driven onboarding flow recommended.

---
This document provides a comprehensive overview of architectural considerations and actionable steps for improving the Lina UX.