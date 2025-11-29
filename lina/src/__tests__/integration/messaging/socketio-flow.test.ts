/**
 * Integration tests for Socket.IO messaging flow
 * Tests connection, channel joining, message send/receive, and user isolation
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  MockSocketClient,
  createMockSocketClient,
  createConnectedClient,
  simulateMessageRoundTrip,
  assertMessageEmitted,
  assertMessageContentEmitted,
} from "../../helpers/socket";
import {
  MessageType,
  SampleMessages,
  ChatScenarios,
  generateChannelId,
  createBroadcastPayload,
} from "../../fixtures/messages";
import { setupTestEnv, cleanupTestEnv } from "../../helpers/setup";

describe("Socket.IO Messaging Flow", () => {
  let client: MockSocketClient;

  beforeEach(() => {
    setupTestEnv();
    client = createMockSocketClient("test-user-123");
  });

  afterEach(() => {
    cleanupTestEnv();
    client.disconnect();
  });

  describe("Connection Management", () => {
    it("should create a mock socket client with userId", () => {
      expect(client.userId).toBe("test-user-123");
      expect(client.id).toMatch(/^mock-socket-\d+$/);
    });

    it("should simulate connection", () => {
      expect(client.isConnected()).toBe(false);

      client.connect();

      expect(client.isConnected()).toBe(true);
    });

    it("should trigger connect event on connection", () => {
      let connectCalled = false;
      client.on("connect", () => {
        connectCalled = true;
      });

      client.connect();

      expect(connectCalled).toBe(true);
    });

    it("should simulate disconnection", () => {
      client.connect();
      expect(client.isConnected()).toBe(true);

      client.disconnect();

      expect(client.isConnected()).toBe(false);
    });

    it("should trigger disconnect event on disconnection", () => {
      let disconnectReason: string | undefined;
      client.on("disconnect", (reason) => {
        disconnectReason = reason as string;
      });

      client.connect();
      client.disconnect();

      expect(disconnectReason).toBe("io client disconnect");
    });
  });

  describe("Event Handling", () => {
    it("should register event handlers", () => {
      let messageReceived = false;
      client.on("message", () => {
        messageReceived = true;
      });

      client.trigger("message", { text: "test" });

      expect(messageReceived).toBe(true);
    });

    it("should support multiple handlers for same event", () => {
      let handler1Called = false;
      let handler2Called = false;

      client.on("message", () => {
        handler1Called = true;
      });
      client.on("message", () => {
        handler2Called = true;
      });

      client.trigger("message", { text: "test" });

      expect(handler1Called).toBe(true);
      expect(handler2Called).toBe(true);
    });

    it("should remove specific event handler", () => {
      let handlerCalled = false;
      const handler = () => {
        handlerCalled = true;
      };

      client.on("message", handler);
      client.off("message", handler);
      client.trigger("message", { text: "test" });

      expect(handlerCalled).toBe(false);
    });

    it("should remove all handlers for an event", () => {
      let callCount = 0;

      client.on("message", () => callCount++);
      client.on("message", () => callCount++);
      client.off("message");
      client.trigger("message", { text: "test" });

      expect(callCount).toBe(0);
    });
  });

  describe("Channel Joining", () => {
    it("should emit room joining message", () => {
      const channelId = generateChannelId("user-123", "lina-agent");
      client.connect();

      const joinMessage = SampleMessages.roomJoin(channelId, client.userId);
      client.emit("message", joinMessage);

      const emitted = assertMessageEmitted(client, MessageType.ROOM_JOINING);
      expect(emitted).toBeDefined();
      expect(emitted?.channelId).toBe(channelId);
    });

    it("should create connected client in channel", async () => {
      const channelId = generateChannelId("user-123", "lina-agent");
      const connectedClient = await createConnectedClient("user-123", channelId);

      expect(connectedClient.isConnected()).toBe(true);

      const joinMessage = assertMessageEmitted(connectedClient, MessageType.ROOM_JOINING);
      expect(joinMessage?.channelId).toBe(channelId);

      connectedClient.disconnect();
    });
  });

  describe("Message Sending", () => {
    it("should emit user chat message", () => {
      const channelId = generateChannelId("user-123", "lina-agent");
      client.connect();

      const chatMessage = SampleMessages.userChat(channelId, client.userId, "Hello Lina!");
      client.emit("message", chatMessage);

      const emitted = assertMessageContentEmitted(client, "Hello Lina!");
      expect(emitted).toBeDefined();
      expect(emitted?.type).toBe(MessageType.SEND_MESSAGE);
    });

    it("should track all emitted events", () => {
      const channelId = generateChannelId("user-123", "lina-agent");
      client.connect();

      client.emit("message", SampleMessages.roomJoin(channelId, client.userId));
      client.emit("message", SampleMessages.userChat(channelId, client.userId, "Message 1"));
      client.emit("message", SampleMessages.userChat(channelId, client.userId, "Message 2"));

      const events = client.getEmittedEvents();
      expect(events).toHaveLength(3);
    });

    it("should clear emitted events", () => {
      client.emit("message", { type: MessageType.SEND_MESSAGE });
      expect(client.getEmittedEvents()).toHaveLength(1);

      client.clearEmittedEvents();

      expect(client.getEmittedEvents()).toHaveLength(0);
    });
  });

  describe("Message Receiving", () => {
    it("should receive agent response via messageBroadcast", async () => {
      const channelId = generateChannelId("user-123", "lina-agent");
      client.connect();

      let receivedMessage: unknown;
      client.on("messageBroadcast", (data) => {
        receivedMessage = data;
      });

      const broadcast = createBroadcastPayload(
        channelId,
        "lina-agent",
        "Hey! How can I help you today?"
      );
      client.trigger("messageBroadcast", broadcast);

      expect(receivedMessage).toBeDefined();
      expect((receivedMessage as { channelId: string }).channelId).toBe(channelId);
    });

    it("should wait for specific event with timeout", async () => {
      client.connect();

      // Schedule event to be triggered
      setTimeout(() => {
        client.trigger("testEvent", { data: "test" });
      }, 10);

      const result = await client.waitForEvent("testEvent", 1000);
      expect(result).toEqual({ data: "test" });
    });

    it("should timeout if event not received", async () => {
      client.connect();

      await expect(client.waitForEvent("neverTriggered", 100)).rejects.toThrow(
        "Timeout waiting for event: neverTriggered"
      );
    });
  });

  describe("Message Round Trip", () => {
    it("should simulate complete message round trip", async () => {
      const channelId = generateChannelId("user-123", "lina-agent");
      client.connect();

      const { sent, received } = await simulateMessageRoundTrip(
        client,
        channelId,
        "What's my balance?",
        "Let me check your wallet balance..."
      );

      expect(sent.type).toBe(MessageType.SEND_MESSAGE);
      expect(sent.content?.text).toBe("What's my balance?");

      expect(received.type).toBe(MessageType.MESSAGE);
      expect(received.content?.text).toContain("balance");
    });
  });

  describe("Thinking Indicator", () => {
    it("should emit thinking indicator", () => {
      const channelId = generateChannelId("user-123", "lina-agent");
      client.connect();

      let thinkingState: boolean | undefined;
      client.on("messageBroadcast", (data: unknown) => {
        const msg = data as { message?: { type: number; content?: { data?: { thinking?: boolean } } } };
        if (msg.message?.type === MessageType.THINKING) {
          thinkingState = msg.message.content?.data?.thinking;
        }
      });

      // Simulate agent thinking
      client.trigger("messageBroadcast", {
        channelId,
        message: SampleMessages.thinking(channelId, "lina-agent", true),
      });

      expect(thinkingState).toBe(true);
    });
  });

  describe("Multi-User Isolation", () => {
    it("should isolate users by userId", async () => {
      const user1 = createMockSocketClient("user-1");
      const user2 = createMockSocketClient("user-2");

      user1.connect();
      user2.connect();

      const channel1 = generateChannelId("user-1", "lina-agent");
      const channel2 = generateChannelId("user-2", "lina-agent");

      // Each user joins their own channel
      user1.emit("message", SampleMessages.roomJoin(channel1, "user-1"));
      user2.emit("message", SampleMessages.roomJoin(channel2, "user-2"));

      // Verify channels are different
      expect(channel1).not.toBe(channel2);

      // Verify each user only emitted to their channel
      const user1Events = user1.getEmittedEventsByType("message") as Array<{ channelId: string }>;
      const user2Events = user2.getEmittedEventsByType("message") as Array<{ channelId: string }>;

      expect(user1Events[0].channelId).toBe(channel1);
      expect(user2Events[0].channelId).toBe(channel2);

      user1.disconnect();
      user2.disconnect();
    });
  });

  describe("Chat Scenarios", () => {
    it("should recognize balance check scenario", () => {
      const scenario = ChatScenarios.balanceCheck;
      expect(scenario.userMessage).toBe("What's my wallet balance?");
      expect(scenario.expectedAction).toBe("USER_WALLET_INFO");
    });

    it("should recognize swap question (should NOT execute)", () => {
      const scenario = ChatScenarios.swapQuestion;
      expect(scenario.shouldNotExecute).toBe(true);
      expect(scenario.expectedResponsePattern.test("You can swap tokens using...")).toBe(true);
    });

    it("should recognize Jupiter swap command", () => {
      const scenario = ChatScenarios.jupiterSwap;
      expect(scenario.userMessage).toBe("Swap 1 SOL to USDC on Solana");
      expect(scenario.expectedAction).toBe("JUPITER_SWAP");
    });
  });
});
