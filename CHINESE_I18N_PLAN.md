# Lina Internationalization (i18n) Plan: Chinese Support

This document outlines the strategy for adding Simplified Chinese (zh-CN) support to the Lina trading agent.

## 1. Overview
The goal is to provide a fully localized experience for Chinese-speaking users, covering the UI, the automated strategy messages, and the agent's conversational persona.

## 2. Layer 1: Frontend (React/Vite)
**Location:** `lina/src/frontend/`

- **Library:** Use `i18next` and `react-i18next`.
- **Tasks:**
    - Create `locales/en.json` and `locales/zh-CN.json`.
    - Wrap the application in `I18nextProvider`.
    - Extract static strings from:
        - `DriftBalanceBadge.tsx` (e.g., "Total Collateral", "Unrealized PnL")
        - `ActivePositionBadge.tsx` (e.g., "LONG", "SHORT", "PnL")
        - Navigation and status indicators.
- **Language Toggle:** Add a subtle language switcher in the header or settings.

## 3. Layer 2: Strategy Core (Backend)
**Location:** `lina/src/plugins/plugin-strategy-core/src/utils/market-update-formatter.ts`

- **Current State:** Hardcoded English template literals.
- **Tasks:**
    - **Option A (Scalable):** Modify `formatMarketUpdate` to return a structured "MessageObject" instead of a string.
        ```typescript
        {
          key: 'market_scan',
          params: { asset: 'SOL', direction: 'bullish', confidence: '55' }
        }
        ```
        The frontend then uses `t(message.key, message.params)` to render the string in the user's chosen language.
    - **Option B (Quick):** Add a locale parameter to the formatter and use a localized template dictionary within the backend.

## 4. Layer 3: Character Persona (ElizaOS)
**Location:** `lina/src/character.ts`

- **Tasks:**
    - Create `character-zh.ts` with translated system prompts, bio, and style instructions.
    - **System Prompt Localization:**
        - Ensure "professional and direct" tone is maintained in Chinese.
        - Use appropriate Chinese crypto terminology (e.g., "永续合约" for Perps, "多/空" for Long/Short).
    - **Message Examples:** Localize all 10+ message examples to provide the LLM with high-quality Chinese context.
- **Detection:** Update `character.ts` to include a instruction: "Always respond in the language used by the user."

## 5. Implementation Phases

### Phase 1: Infrastructure
- Install i18n dependencies.
- Setup directory structure for locales.
- Add `LINA_LOCALE` to `.env`.

### Phase 2: UI Localization
- Replace all visible English strings in the frontend components with i18n keys.
- Implement the language switcher.

### Phase 3: Message Localization
- Refactor the strategy loop to send localizable message keys or dual-language payloads.

### Phase 4: Persona Training
- Switch the agent's character profile to the Chinese variant or update the primary character file with multi-lingual message examples.

## 6. Verification
- Verify that numeric formatting (commas vs. periods) remains correct.
- Ensure neon/cyber aesthetics in the UI (like the Ticker) accommodate Chinese characters without breaking layout.
