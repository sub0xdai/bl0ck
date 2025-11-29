/**
 * Socket.IO message fixtures for testing
 * Based on message types from socketManager.ts
 */

/**
 * Message types from ElizaOS Socket.IO protocol
 */
export enum MessageType {
  ROOM_JOINING = 1,
  SEND_MESSAGE = 2,
  MESSAGE = 3,
  ACK = 4,
  THINKING = 5,
  CONTROL = 6,
}

/**
 * Base message structure
 */
export interface SocketMessage {
  type: MessageType;
  channelId: string;
  senderId: string;
  content?: {
    text?: string;
    action?: string;
    data?: Record<string, unknown>;
  };
  timestamp?: number;
}

/**
 * Sample messages for different scenarios
 */
export const SampleMessages = {
  // Room joining
  roomJoin: (channelId: string, userId: string): SocketMessage => ({
    type: MessageType.ROOM_JOINING,
    channelId,
    senderId: userId,
  }),

  // User sends a chat message
  userChat: (channelId: string, userId: string, text: string): SocketMessage => ({
    type: MessageType.SEND_MESSAGE,
    channelId,
    senderId: userId,
    content: { text },
    timestamp: Date.now(),
  }),

  // Agent response
  agentResponse: (channelId: string, agentId: string, text: string, action?: string): SocketMessage => ({
    type: MessageType.MESSAGE,
    channelId,
    senderId: agentId,
    content: { text, action },
    timestamp: Date.now(),
  }),

  // Acknowledgment
  ack: (channelId: string, messageId: string): SocketMessage => ({
    type: MessageType.ACK,
    channelId,
    senderId: "system",
    content: { data: { messageId } },
    timestamp: Date.now(),
  }),

  // Thinking indicator
  thinking: (channelId: string, agentId: string, isThinking: boolean): SocketMessage => ({
    type: MessageType.THINKING,
    channelId,
    senderId: agentId,
    content: { data: { thinking: isThinking } },
    timestamp: Date.now(),
  }),
} as const;

/**
 * Sample chat scenarios for integration tests
 */
export const ChatScenarios = {
  // Simple greeting
  greeting: {
    userMessage: "Hey Lina, how are you?",
    expectedResponsePattern: /hey|hi|hello|what's up/i,
  },

  // Balance check
  balanceCheck: {
    userMessage: "What's my wallet balance?",
    expectedAction: "USER_WALLET_INFO",
  },

  // Swap request (question - should NOT execute)
  swapQuestion: {
    userMessage: "How do I swap ETH to USDC?",
    expectedResponsePattern: /swap|exchange|trade/i,
    shouldNotExecute: true,
  },

  // Swap command (should execute after confirmation)
  swapCommand: {
    userMessage: "Swap 0.1 ETH to USDC on Base",
    expectedAction: "SWAP_TOKEN",
  },

  // Solana balance check
  solanaBalance: {
    userMessage: "Show my Solana wallet",
    expectedAction: "SOLANA_WALLET_INFO",
  },

  // Jupiter swap
  jupiterSwap: {
    userMessage: "Swap 1 SOL to USDC on Solana",
    expectedAction: "JUPITER_SWAP",
  },
} as const;

/**
 * Generate a unique channel ID for tests
 */
export function generateChannelId(userId: string, agentId: string): string {
  return `${userId}-${agentId}-${Date.now()}`;
}

/**
 * Create a mock message broadcast event payload
 */
export function createBroadcastPayload(
  channelId: string,
  senderId: string,
  text: string,
  action?: string
): Record<string, unknown> {
  return {
    channelId,
    message: {
      id: `msg-${Date.now()}`,
      senderId,
      text,
      action,
      createdAt: new Date().toISOString(),
    },
  };
}
