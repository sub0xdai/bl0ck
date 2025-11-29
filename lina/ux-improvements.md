# UI/UX Improvement Backlog: Agentic DeFi Dashboard

## 1. Chat Interface (Core Interaction)
- [x] **Action Chips:** Convert text-based suggestions (e.g., "Fresh re-scan") into clickable pills/buttons below the bot message to reduce typing friction.
- [x] **Rich Markdown Parsing:** - [x] Render "Notes/Warnings" with distinct borders/colors (e.g., amber for minimum balance warnings).
    - [x] Render data lists as mini-tables or grids instead of plain text blocks.
- [ ] **Streaming Typography:** Implement a typewriter effect for bot responses to reinforce the "AI" persona.

## 2. Right Panel (Wallet & State)
- [x] **Empty States:** Replace plain text "No EVM tokens found" with low-contrast ASCII art or a faded vector graphic.
- [x] **Network Toggle:** Increase visual weight or add a glow effect to the `EVM | SOL` toggle to clearly indicate active chain context.

## 3. Visual Hierarchy & Vibe
- [x] **Smart Indicators:** - [x] Make the `FUND` button pulse gently if the wallet balance is below a safe threshold.
    - [ ] Color-code balance changes (Green/Red) for PnL visibility.
- [x] **Input Enhancements:** - [x] Add a `/` (slash) command menu for power users (e.g., `/swap`, `/bridge`).
    - [ ] (Optional) Add a microphone icon for voice-to-text input.
- [ ] **Context-Aware ASCII:** Make the ASCII clock/header reactive (e.g., turns red/glitches on market dumps, glows green on pumps).

## 4. Sidebar & Navigation
- [ ] **Smart History:** Use LLM summarization to auto-title chat sessions (e.g., "SOL Bridge Debugging") instead of generic timestamps like "Yesterday".
- [ ] **Connection State:** Add a status dot (Green/Red) next to the user avatar to indicate WebSocket/Node connection health.
