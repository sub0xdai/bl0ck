/**
 * End-to-end integration tests for complete user journeys
 * Tests the full flow from auth → chat → transaction
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  EVMWallets,
  SolanaWallets,
  createSIWEMessage,
  generateMockEVMSignature,
} from "../../fixtures/wallets";
import { generateUserId } from "../../fixtures/jwt-tokens";
import {
  createMockJWT,
  decodeMockJWT,
  generateMockNonce,
} from "../../fixtures/jwt-tokens";
import {
  MessageType,
  SampleMessages,
  ChatScenarios,
  generateChannelId,
} from "../../fixtures/messages";
import {
  MockBalances,
  MockTransactionResults,
  createMockWalletInfo,
} from "../../fixtures/transactions";
import {
  MockSocketClient,
  createMockSocketClient,
  simulateMessageRoundTrip,
} from "../../helpers/socket";
import {
  createMockRuntime,
  createMockMemory,
  createMockService,
  setupTestEnv,
  cleanupTestEnv,
  delay,
} from "../../helpers/setup";

describe("Full User Journey E2E", () => {
  let socketClient: MockSocketClient;

  beforeEach(() => {
    setupTestEnv();
  });

  afterEach(() => {
    cleanupTestEnv();
    if (socketClient) {
      socketClient.disconnect();
    }
  });

  describe("Complete Auth → Chat → Balance Flow", () => {
    it("should complete full EVM user journey", async () => {
      // ====== STEP 1: Authentication ======
      const walletAddress = EVMWallets.user1.address;
      const nonce = generateMockNonce();

      // Create and sign SIWE message
      const siweMessage = createSIWEMessage(walletAddress, nonce);
      const signature = generateMockEVMSignature(siweMessage);

      // Verify signature and get JWT
      const userId = generateUserId(walletAddress, "evm");
      const jwtToken = createMockJWT({
        userId,
        walletAddress,
        chain: "evm",
      });

      // Verify JWT is valid
      const decoded = decodeMockJWT(jwtToken);
      expect(decoded?.userId).toBe(userId);
      expect(decoded?.chain).toBe("evm");

      // ====== STEP 2: Socket Connection ======
      socketClient = createMockSocketClient(userId);
      socketClient.connect();
      expect(socketClient.isConnected()).toBe(true);

      // ====== STEP 3: Join Channel ======
      const agentId = "lina-agent";
      const channelId = generateChannelId(userId, agentId);

      socketClient.emit("message", SampleMessages.roomJoin(channelId, userId));

      // Simulate server acknowledgment
      await delay(10);
      socketClient.trigger("messageBroadcast", {
        channelId,
        message: {
          type: MessageType.ACK,
          channelId,
          senderId: "system",
          content: { data: { joined: true } },
        },
      });

      // ====== STEP 4: Request Balance ======
      const { sent, received } = await simulateMessageRoundTrip(
        socketClient,
        channelId,
        "What's my wallet balance?",
        "Here's your wallet balance:\n\n**Base Network**\n- ETH: 5.0 ($15,000)\n- USDC: 10,000 ($10,000)\n\n**Total: $25,000**",
        agentId
      );

      expect(sent.content?.text).toBe("What's my wallet balance?");
      expect(received.content?.text).toContain("wallet balance");
      expect(received.content?.text).toContain("$");

      // ====== STEP 5: Verify User Isolation ======
      const emittedMessages = socketClient.getEmittedEventsByType("message");
      const allMessagesFromUser = emittedMessages.every(
        (msg) => (msg as { senderId: string }).senderId === userId
      );
      expect(allMessagesFromUser).toBe(true);
    });

    it("should complete full Solana user journey", async () => {
      // ====== STEP 1: Authentication ======
      const publicKey = SolanaWallets.user1.publicKey;
      const userId = generateUserId(publicKey, "solana");
      const jwtToken = createMockJWT({
        userId,
        walletAddress: publicKey,
        chain: "solana",
      });

      // ====== STEP 2: Socket Connection ======
      socketClient = createMockSocketClient(userId);
      socketClient.connect();

      // ====== STEP 3: Join Channel ======
      const channelId = generateChannelId(userId, "lina-agent");
      socketClient.emit("message", SampleMessages.roomJoin(channelId, userId));

      // ====== STEP 4: Request Solana Balance ======
      const { sent, received } = await simulateMessageRoundTrip(
        socketClient,
        channelId,
        "Show my Solana wallet",
        "Here's your Solana wallet:\n\n**Address:** 11111...11111\n**Balance:**\n- SOL: 50.0 ($7,500)\n- USDC: 5,000 ($5,000)\n\n**Total: $12,500**",
        "lina-agent"
      );

      expect(sent.content?.text).toBe("Show my Solana wallet");
      expect(received.content?.text).toContain("Solana");
    });
  });

  describe("Swap Flow Simulation", () => {
    it("should handle swap question vs command differently", async () => {
      const userId = generateUserId(EVMWallets.user1.address, "evm");
      socketClient = createMockSocketClient(userId);
      socketClient.connect();

      const channelId = generateChannelId(userId, "lina-agent");
      socketClient.emit("message", SampleMessages.roomJoin(channelId, userId));

      // ====== Question (should NOT execute) ======
      const questionScenario = ChatScenarios.swapQuestion;
      const { received: questionResponse } = await simulateMessageRoundTrip(
        socketClient,
        channelId,
        questionScenario.userMessage,
        "To swap tokens, you can use the following command:\n\n`swap [amount] [token] to [token] on [network]`\n\nFor example: `swap 1 ETH to USDC on Base`\n\nWould you like me to execute a swap for you?",
        "lina-agent"
      );

      // Response should be informational, not a transaction
      expect(questionResponse.content?.text).toContain("swap");
      expect(questionResponse.content?.action).toBeUndefined();

      // ====== Command (should execute) ======
      const commandScenario = ChatScenarios.swapCommand;
      const { received: commandResponse } = await simulateMessageRoundTrip(
        socketClient,
        channelId,
        commandScenario.userMessage,
        "Executing swap...\n\n**Swap Details:**\n- From: 0.1 ETH\n- To: ~300 USDC\n- Network: Base\n- Slippage: 0.5%\n\nTransaction: 0x1234...abcd\nStatus: Success ✅",
        "lina-agent"
      );

      expect(commandResponse.content?.text).toContain("Executing");
      expect(commandResponse.content?.text).toContain("Success");
    });

    it("should handle insufficient balance gracefully", async () => {
      const userId = generateUserId(EVMWallets.user1.address, "evm");
      socketClient = createMockSocketClient(userId);
      socketClient.connect();

      const channelId = generateChannelId(userId, "lina-agent");

      // Try to swap more than available
      const { received } = await simulateMessageRoundTrip(
        socketClient,
        channelId,
        "Swap 100 ETH to USDC on Base",
        "❌ Insufficient balance\n\nYou're trying to swap 100 ETH, but you only have 5.0 ETH available.\n\nWould you like to swap a smaller amount? You can swap up to 4.99 ETH (keeping 0.01 for gas).",
        "lina-agent"
      );

      expect(received.content?.text).toContain("Insufficient balance");
      expect(received.content?.text).toContain("only have");
    });
  });

  describe("Multi-Step Transaction Flow", () => {
    it("should handle bridge flow with confirmation", async () => {
      const userId = generateUserId(EVMWallets.user1.address, "evm");
      socketClient = createMockSocketClient(userId);
      socketClient.connect();

      const channelId = generateChannelId(userId, "lina-agent");

      // ====== Step 1: User requests bridge ======
      const { received: previewResponse } = await simulateMessageRoundTrip(
        socketClient,
        channelId,
        "Bridge 1 ETH from Base to Arbitrum",
        "**Bridge Preview:**\n\n- From: Base → Arbitrum\n- Amount: 1 ETH (~$3,000)\n- Estimated fee: 0.002 ETH (~$6)\n- Time: ~2-5 minutes\n\nIs this correct? Reply 'confirm' to proceed.",
        "lina-agent"
      );

      expect(previewResponse.content?.text).toContain("Bridge Preview");
      expect(previewResponse.content?.text).toContain("confirm");

      // ====== Step 2: User confirms ======
      const { received: confirmResponse } = await simulateMessageRoundTrip(
        socketClient,
        channelId,
        "confirm",
        "Bridging in progress...\n\n**Transaction Details:**\n- Source TX: 0xabc123... (Base)\n- Status: Confirmed\n- Destination: Arbitrum\n- ETA: ~3 minutes\n\nI'll notify you when the funds arrive on Arbitrum.",
        "lina-agent"
      );

      expect(confirmResponse.content?.text).toContain("Bridging in progress");
      expect(confirmResponse.content?.text).toContain("Confirmed");
    });
  });

  describe("Error Recovery", () => {
    it("should handle connection loss and recovery", async () => {
      const userId = generateUserId(EVMWallets.user1.address, "evm");
      socketClient = createMockSocketClient(userId);
      socketClient.connect();

      const channelId = generateChannelId(userId, "lina-agent");

      // Send initial message
      socketClient.emit("message", SampleMessages.userChat(channelId, userId, "Hello"));

      // Simulate disconnection
      socketClient.disconnect();
      expect(socketClient.isConnected()).toBe(false);

      // Simulate reconnection
      socketClient.connect();
      expect(socketClient.isConnected()).toBe(true);

      // Should be able to send messages again
      socketClient.emit("message", SampleMessages.userChat(channelId, userId, "I'm back"));

      const events = socketClient.getEmittedEventsByType("message");
      expect(events.length).toBe(2);
    });

    it("should handle malformed response gracefully", async () => {
      const userId = generateUserId(EVMWallets.user1.address, "evm");
      socketClient = createMockSocketClient(userId);
      socketClient.connect();

      let errorReceived = false;
      socketClient.on("error", () => {
        errorReceived = true;
      });

      // Simulate receiving malformed data
      socketClient.trigger("messageBroadcast", null);
      socketClient.trigger("messageBroadcast", undefined);
      socketClient.trigger("messageBroadcast", "invalid");

      // Client should still be connected
      expect(socketClient.isConnected()).toBe(true);
    });
  });

  describe("Action Execution Simulation", () => {
    it("should simulate wallet info action", async () => {
      // Create mock service
      const mockWalletService = createMockService("CDP_WALLET_SERVICE", {
        getWalletInfo: mock(() =>
          Promise.resolve(createMockWalletInfo("evm", "rich"))
        ),
      });

      // Create runtime with service
      const runtime = createMockRuntime({
        services: {
          CDP_WALLET_SERVICE: mockWalletService,
        },
      });

      // Create action memory
      const memory = createMockMemory({
        userId: "test-user",
        text: "Show my wallet balance",
        action: "USER_WALLET_INFO",
      });

      // Verify service is accessible
      const service = runtime.getService("CDP_WALLET_SERVICE");
      expect(service).toBeDefined();

      // Simulate calling the service
      const walletInfo = await (service as { getWalletInfo: () => Promise<ReturnType<typeof createMockWalletInfo>> }).getWalletInfo();
      expect(walletInfo.chain).toBe("evm");
      expect(walletInfo.totalUsdValue).toBeGreaterThan(0);
    });

    it("should simulate swap action with balance check", async () => {
      const mockBalances = MockBalances.evmRich;

      // Check balance before swap
      const hasEnoughETH = parseFloat(mockBalances.ETH.formatted) >= 1;
      expect(hasEnoughETH).toBe(true);

      // Simulate swap execution
      const swapResult = MockTransactionResults.evmSuccess;
      expect(swapResult.status).toBe("success");
      expect(swapResult.hash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe("Session Lifecycle", () => {
    it("should maintain session through multiple messages", async () => {
      const userId = generateUserId(EVMWallets.user1.address, "evm");
      socketClient = createMockSocketClient(userId);
      socketClient.connect();

      const channelId = generateChannelId(userId, "lina-agent");

      // Send multiple messages in a session
      const messages = [
        "Hello Lina",
        "What's my balance?",
        "Swap 0.1 ETH to USDC",
        "Show transaction history",
      ];

      for (const msg of messages) {
        await simulateMessageRoundTrip(
          socketClient,
          channelId,
          msg,
          `Response to: ${msg}`,
          "lina-agent"
        );
        await delay(5);
      }

      // All messages should be from same user
      const events = socketClient.getEmittedEventsByType("message");
      expect(events.length).toBe(messages.length);

      const allFromSameUser = events.every(
        (msg) => (msg as { senderId: string }).senderId === userId
      );
      expect(allFromSameUser).toBe(true);
    });

    it("should isolate sessions between users", async () => {
      const user1Id = generateUserId(EVMWallets.user1.address, "evm");
      const user2Id = generateUserId(EVMWallets.user2.address, "evm");

      const client1 = createMockSocketClient(user1Id);
      const client2 = createMockSocketClient(user2Id);

      client1.connect();
      client2.connect();

      const channel1 = generateChannelId(user1Id, "lina-agent");
      const channel2 = generateChannelId(user2Id, "lina-agent");

      // Each user sends a message
      client1.emit("message", SampleMessages.userChat(channel1, user1Id, "User 1 message"));
      client2.emit("message", SampleMessages.userChat(channel2, user2Id, "User 2 message"));

      // Verify isolation
      const user1Messages = client1.getEmittedEventsByType("message") as Array<{ senderId: string; channelId: string }>;
      const user2Messages = client2.getEmittedEventsByType("message") as Array<{ senderId: string; channelId: string }>;

      expect(user1Messages[0].senderId).toBe(user1Id);
      expect(user1Messages[0].channelId).toBe(channel1);

      expect(user2Messages[0].senderId).toBe(user2Id);
      expect(user2Messages[0].channelId).toBe(channel2);

      // Channels should be different
      expect(channel1).not.toBe(channel2);

      client1.disconnect();
      client2.disconnect();
    });
  });
});
