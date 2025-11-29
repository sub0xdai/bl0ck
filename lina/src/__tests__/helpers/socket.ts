/**
 * Socket.IO test utilities
 * Provides mock socket client and helper functions for testing messaging flows
 */

import { MessageType, type SocketMessage } from "../fixtures/messages";

/**
 * Mock Socket.IO client for testing
 */
export class MockSocketClient {
  private eventHandlers: Map<string, Array<(data: unknown) => void>> = new Map();
  private emittedEvents: Array<{ event: string; data: unknown }> = [];
  private connected = false;
  public id = `mock-socket-${Date.now()}`;

  constructor(public userId: string) {}

  /**
   * Simulate connection
   */
  connect(): this {
    this.connected = true;
    this.trigger("connect", undefined);
    return this;
  }

  /**
   * Simulate disconnection
   */
  disconnect(): this {
    this.connected = false;
    this.trigger("disconnect", "io client disconnect");
    return this;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Register event handler (on)
   */
  on(event: string, handler: (data: unknown) => void): this {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
    return this;
  }

  /**
   * Remove event handler (off)
   */
  off(event: string, handler?: (data: unknown) => void): this {
    if (handler) {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) handlers.splice(index, 1);
      }
    } else {
      this.eventHandlers.delete(event);
    }
    return this;
  }

  /**
   * Emit event to server
   */
  emit(event: string, data: unknown): this {
    this.emittedEvents.push({ event, data });
    return this;
  }

  /**
   * Trigger event handlers (simulate server -> client)
   */
  trigger(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach((handler) => handler(data));
  }

  /**
   * Get all emitted events
   */
  getEmittedEvents(): Array<{ event: string; data: unknown }> {
    return [...this.emittedEvents];
  }

  /**
   * Get emitted events of a specific type
   */
  getEmittedEventsByType(event: string): unknown[] {
    return this.emittedEvents
      .filter((e) => e.event === event)
      .map((e) => e.data);
  }

  /**
   * Clear emitted events
   */
  clearEmittedEvents(): void {
    this.emittedEvents = [];
  }

  /**
   * Wait for an event with timeout
   */
  waitForEvent(event: string, timeout = 5000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout);

      this.on(event, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }
}

/**
 * Create a mock socket client for testing
 */
export function createMockSocketClient(userId: string): MockSocketClient {
  return new MockSocketClient(userId);
}

/**
 * Simulate a complete message round-trip
 */
export async function simulateMessageRoundTrip(
  client: MockSocketClient,
  channelId: string,
  userMessage: string,
  agentResponse: string,
  agentId = "lina-agent"
): Promise<{ sent: SocketMessage; received: SocketMessage }> {
  // Create user message
  const sent: SocketMessage = {
    type: MessageType.SEND_MESSAGE,
    channelId,
    senderId: client.userId,
    content: { text: userMessage },
    timestamp: Date.now(),
  };

  // Emit user message
  client.emit("message", sent);

  // Simulate agent processing time
  await new Promise((resolve) => setTimeout(resolve, 10));

  // Create agent response
  const received: SocketMessage = {
    type: MessageType.MESSAGE,
    channelId,
    senderId: agentId,
    content: { text: agentResponse },
    timestamp: Date.now(),
  };

  // Trigger the response
  client.trigger("messageBroadcast", {
    channelId,
    message: received,
  });

  return { sent, received };
}

/**
 * Create a connected client that has joined a channel
 */
export async function createConnectedClient(
  userId: string,
  channelId: string
): Promise<MockSocketClient> {
  const client = createMockSocketClient(userId);
  client.connect();

  // Join the channel
  const joinMessage: SocketMessage = {
    type: MessageType.ROOM_JOINING,
    channelId,
    senderId: userId,
  };

  client.emit("message", joinMessage);

  // Simulate server acknowledgment
  await new Promise((resolve) => setTimeout(resolve, 5));
  client.trigger("messageBroadcast", {
    channelId,
    message: {
      type: MessageType.ACK,
      channelId,
      senderId: "system",
      content: { data: { joined: true } },
    },
  });

  return client;
}

/**
 * Assert that a specific message type was emitted
 */
export function assertMessageEmitted(
  client: MockSocketClient,
  messageType: MessageType
): SocketMessage | undefined {
  const events = client.getEmittedEventsByType("message") as SocketMessage[];
  return events.find((msg) => msg.type === messageType);
}

/**
 * Assert that a message with specific content was emitted
 */
export function assertMessageContentEmitted(
  client: MockSocketClient,
  textPattern: RegExp | string
): SocketMessage | undefined {
  const events = client.getEmittedEventsByType("message") as SocketMessage[];
  return events.find((msg) => {
    const text = msg.content?.text || "";
    return typeof textPattern === "string"
      ? text.includes(textPattern)
      : textPattern.test(text);
  });
}
