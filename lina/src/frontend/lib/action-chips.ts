/**
 * Action Chips - Extracts actionable suggestions from bot messages
 * and provides clickable quick-action buttons
 */

export interface ActionChip {
  id: string;
  label: string;
  prompt: string;  // The message to send when clicked
  icon?: string;   // Optional emoji/icon
}

// Pattern matchers for extracting suggestions from message content
const ACTION_PATTERNS: Array<{
  pattern: RegExp;
  chips: ActionChip[];
}> = [
  // Scanning/refreshing patterns
  {
    pattern: /re-?scan|refresh|update|sync/i,
    chips: [
      { id: 'rescan', label: 'Re-scan', prompt: 'Please do a fresh re-scan', icon: '🔄' },
    ],
  },
  // Balance/wallet patterns
  {
    pattern: /balance|wallet|tokens?|holdings/i,
    chips: [
      { id: 'check-balance', label: 'Check balance', prompt: 'What is my current balance?', icon: '💰' },
    ],
  },
  // Swap patterns
  {
    pattern: /swap|exchange|trade|convert/i,
    chips: [
      { id: 'swap-help', label: 'Help me swap', prompt: 'Help me swap tokens', icon: '🔄' },
    ],
  },
  // Bridge patterns
  {
    pattern: /bridge|cross-?chain|transfer.*chain/i,
    chips: [
      { id: 'bridge-help', label: 'Bridge tokens', prompt: 'Help me bridge tokens', icon: '🌉' },
    ],
  },
  // Price/market patterns
  {
    pattern: /price|market|trending|pump|dump/i,
    chips: [
      { id: 'market-update', label: 'Market update', prompt: 'What\'s trending in the market?', icon: '📈' },
    ],
  },
  // Gas patterns
  {
    pattern: /gas|fee|gwei/i,
    chips: [
      { id: 'gas-check', label: 'Check gas', prompt: 'What are current gas prices?', icon: '⛽' },
    ],
  },
  // NFT patterns
  {
    pattern: /nft|collectible|collection/i,
    chips: [
      { id: 'nft-check', label: 'View NFTs', prompt: 'Show me my NFTs', icon: '🖼️' },
    ],
  },
  // Transaction patterns
  {
    pattern: /transaction|tx|sent|received|transfer/i,
    chips: [
      { id: 'tx-history', label: 'View history', prompt: 'Show my recent transactions', icon: '📜' },
    ],
  },
];

// Context-aware chips shown based on conversation state
const CONTEXTUAL_CHIPS: ActionChip[] = [
  { id: 'whats-new', label: "What's new?", prompt: "What's new in crypto today?", icon: '🆕' },
  { id: 'portfolio', label: 'My portfolio', prompt: 'Show me my portfolio overview', icon: '📊' },
];

/**
 * Extract action chips from a bot message
 * @param content - The message content to analyze
 * @param isFirstMessage - Whether this is the first message in conversation
 * @returns Array of action chips to display
 */
export function extractActionChips(content: string, isFirstMessage: boolean = false): ActionChip[] {
  const chips: ActionChip[] = [];
  const seenIds = new Set<string>();

  // Check content against patterns
  for (const { pattern, chips: patternChips } of ACTION_PATTERNS) {
    if (pattern.test(content)) {
      for (const chip of patternChips) {
        if (!seenIds.has(chip.id)) {
          chips.push(chip);
          seenIds.add(chip.id);
        }
      }
    }
  }

  // Add contextual chips for first messages or greetings
  if (isFirstMessage || /hello|hi|hey|welcome|how can i help/i.test(content)) {
    for (const chip of CONTEXTUAL_CHIPS) {
      if (!seenIds.has(chip.id) && chips.length < 4) {
        chips.push(chip);
        seenIds.add(chip.id);
      }
    }
  }

  // Limit to 4 chips max
  return chips.slice(0, 4);
}

/**
 * Check if a message should show action chips
 * Only show on recent agent messages, not user messages
 */
export function shouldShowActionChips(
  isAgent: boolean,
  messageAge: number,
  isLastAgentMessage: boolean
): boolean {
  // Only show on agent messages
  if (!isAgent) return false;

  // Only show on the last agent message
  if (!isLastAgentMessage) return false;

  // Show on messages less than 5 minutes old
  const fiveMinutes = 5 * 60 * 1000;
  if (messageAge > fiveMinutes) return false;

  return true;
}
