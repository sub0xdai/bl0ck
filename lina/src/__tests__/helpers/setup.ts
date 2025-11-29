/**
 * Test environment setup utilities
 * Provides helpers for initializing test environments and mocking dependencies
 */

import type { IAgentRuntime, Memory, Plugin, Service } from "@elizaos/core";

/**
 * Environment variables required for tests
 */
export const TEST_ENV = {
  JWT_SECRET: "test-jwt-secret-for-testing-only-32chars",
  SOLANA_NETWORK: "solana-devnet",
  SOLANA_WALLET_SECRET: "test-wallet-secret",
  NODE_ENV: "test",
} as const;

/**
 * Setup test environment variables
 */
export function setupTestEnv(): void {
  Object.entries(TEST_ENV).forEach(([key, value]) => {
    process.env[key] = value;
  });
}

/**
 * Cleanup test environment
 */
export function cleanupTestEnv(): void {
  Object.keys(TEST_ENV).forEach((key) => {
    delete process.env[key];
  });
}

/**
 * Create a mock IAgentRuntime for testing
 */
export function createMockRuntime(options?: {
  services?: Record<string, Service>;
  plugins?: Plugin[];
  userId?: string;
}): IAgentRuntime {
  const services = options?.services || {};

  return {
    agentId: "test-agent-id",
    character: {
      name: "Lina",
      bio: "Test agent",
      topics: [],
      style: { all: [], chat: [] },
      messageExamples: [],
    },

    // Service management
    getService: (serviceType: string) => {
      return services[serviceType] || null;
    },
    registerService: (service: Service) => {
      services[service.constructor.name] = service;
    },

    // State composition
    composeState: async (message: Memory, additionalKeys?: string[]) => {
      return {
        data: {
          actionParams: {},
          ...message.content,
        },
        additionalKeys,
      };
    },

    // Memory operations (simplified mocks)
    getMemory: async () => null,
    createMemory: async () => {},
    updateMemory: async () => {},
    deleteMemory: async () => {},

    // Plugin access
    plugins: options?.plugins || [],

    // Simplified evaluate
    evaluate: async () => [],
  } as unknown as IAgentRuntime;
}

/**
 * Create a mock Memory object for testing actions
 */
export function createMockMemory(options?: {
  userId?: string;
  text?: string;
  action?: string;
  data?: Record<string, unknown>;
}): Memory {
  return {
    id: `memory-${Date.now()}`,
    entityId: options?.userId || "test-user-id",
    roomId: "test-room-id",
    agentId: "test-agent-id",
    content: {
      text: options?.text || "",
      action: options?.action,
      ...options?.data,
    },
    createdAt: Date.now(),
    embedding: [],
  } as Memory;
}

/**
 * Create a mock Service for testing
 */
export function createMockService<T extends object>(
  serviceType: string,
  methods: T
): Service & T {
  return {
    capabilityDescription: `Mock ${serviceType}`,
    stop: async () => {},
    ...methods,
  } as Service & T;
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error("Timeout waiting for condition");
}

/**
 * Delay utility
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mock fetch for API testing
 */
export function createMockFetch(responses: Map<string, unknown>): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method || "GET";
    const key = `${method}:${url}`;

    const response = responses.get(key) || responses.get(url);

    if (!response) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

/**
 * Assert that an action result is successful
 */
export function assertActionSuccess(result: unknown): asserts result is { success: true; text: string; data?: unknown } {
  if (typeof result !== "object" || result === null) {
    throw new Error("Result is not an object");
  }
  if (!("success" in result) || result.success !== true) {
    const error = "error" in result ? (result as { error: string }).error : "Unknown error";
    throw new Error(`Action failed: ${error}`);
  }
}

/**
 * Assert that an action result is a failure
 */
export function assertActionFailure(result: unknown): asserts result is { success: false; error: string } {
  if (typeof result !== "object" || result === null) {
    throw new Error("Result is not an object");
  }
  if (!("success" in result) || result.success !== false) {
    throw new Error("Expected action to fail but it succeeded");
  }
}

/**
 * Test context manager for setup/teardown
 */
export class TestContext {
  private cleanupFns: Array<() => void | Promise<void>> = [];

  /**
   * Register a cleanup function
   */
  onCleanup(fn: () => void | Promise<void>): void {
    this.cleanupFns.push(fn);
  }

  /**
   * Run all cleanup functions
   */
  async cleanup(): Promise<void> {
    for (const fn of this.cleanupFns.reverse()) {
      await fn();
    }
    this.cleanupFns = [];
  }
}

/**
 * Create a test context with automatic cleanup
 */
export function createTestContext(): TestContext {
  return new TestContext();
}
