# Plugin Development Guide

This guide covers how to create plugins for the Lina AI DeFi agent.

## Quick Start

### 1. Create Plugin Structure

```bash
mkdir -p src/plugins/plugin-myfeature/src/{actions,services,providers}
cd src/plugins/plugin-myfeature
```

### 2. Create package.json

```json
{
  "name": "@elizaos/plugin-myfeature",
  "version": "1.0.0",
  "description": "My feature plugin for Lina",
  "type": "module",
  "main": "dist/index.js",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "bun run build.ts",
    "dev": "bun run build.ts --watch",
    "test": "bun test"
  },
  "dependencies": {
    "@elizaos/core": "alpha"
  },
  "peerDependencies": {
    "@elizaos/core": "alpha"
  },
  "devDependencies": {
    "@types/bun": "^1.2.21",
    "typescript": "^5.6.3"
  }
}
```

### 3. Create build.ts

```typescript
#!/usr/bin/env bun
import { $ } from "bun";

async function build() {
  console.log("Building plugin-myfeature...");

  const result = await Bun.build({
    entrypoints: ["src/index.ts"],
    outdir: "dist",
    target: "node",
    format: "esm",
    external: [
      "@elizaos/core",
      "@elizaos/*",
      // Add your heavy dependencies here
    ],
    sourcemap: true,
    minify: false,
  });

  if (!result.success) {
    console.error("Build failed:", result.logs);
    process.exit(1);
  }

  // Generate type declarations
  await $`tsc --emitDeclarationOnly`.quiet().catch(() => {});

  console.log("Build complete!");
}

build();
```

### 4. Create tsconfig.json

```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "declarationDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "noEmit": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### 5. Register in Root

In `src/index.ts`:

```typescript
import myFeaturePlugin from './plugins/plugin-myfeature/src/index.ts';

export const projectAgent: ProjectAgent = {
  character,
  plugins: [
    sqlPlugin,           // Database (must be first)
    bootstrapPlugin,     // Core ElizaOS (must be second)
    // ... other plugins
    myFeaturePlugin,     // Your plugin
  ],
};
```

---

## Directory Structure

```
src/plugins/plugin-myfeature/
├── package.json
├── tsconfig.json
├── build.ts
├── src/
│   ├── index.ts              # Plugin export
│   ├── types.ts              # Type definitions
│   ├── actions/
│   │   ├── my-action.ts      # Action implementations
│   │   └── index.ts          # Action exports
│   ├── services/
│   │   └── my.service.ts     # Service class
│   └── providers/
│       └── my-provider.ts    # Provider implementation
└── dist/                      # Build output (gitignored)
```

---

## Action Interface

Actions are the primary way users interact with your plugin.

### Required Fields

```typescript
import {
  type Action,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  logger,
} from "@elizaos/core";

export const myAction: Action = {
  // Unique identifier (UPPERCASE convention)
  name: "MY_ACTION",

  // Alternative triggers
  similes: ["ALTERNATE_NAME", "ANOTHER_TRIGGER", "my action"],

  // Human-readable description
  description: "Performs my action with the given parameters",

  // Parameter schema (optional)
  parameters: {
    targetAddress: {
      type: "string",
      description: "The target wallet address",
      required: true,
    },
    amount: {
      type: "number",
      description: "Amount to transfer",
      required: true,
    },
  },

  // Validation function
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    try {
      const service = runtime.getService("MY_SERVICE");
      return !!service;
    } catch (error) {
      logger.warn("[MY_ACTION] Validation failed:", error);
      return false;
    }
  },

  // Handler function
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    try {
      logger.info("[MY_ACTION] Processing...");

      // Get userId from message
      const userId = message.entityId as string;

      // Get parameters from composed state
      const composedState = await runtime.composeState(
        message,
        ["ACTION_STATE"],
        true
      );
      const params = composedState?.data?.actionParams || {};

      // Get service
      const service = runtime.getService("MY_SERVICE") as MyService;

      // Execute action logic
      const result = await service.doSomething(userId, params);

      // Format response
      const text = `Action completed: ${result.summary}`;

      // Stream response via callback
      callback?.({ text, content: result });

      // Return structured result
      return {
        text,
        success: true,
        data: result,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("[MY_ACTION] Failed:", errorMsg);

      const errorText = `Action failed: ${errorMsg}`;
      callback?.({ text: errorText, content: null });

      return {
        text: errorText,
        success: false,
        error: errorMsg,
      };
    }
  },

  // Example conversations (for LLM training)
  examples: [
    [
      {
        name: "{{user}}",
        content: { text: "Do my action with 100 to 0x123..." },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Action completed successfully",
          action: "MY_ACTION",
        },
      },
    ],
  ],
};
```

### Error Handling

Always return structured errors, never throw from handlers:

```typescript
handler: async (runtime, message, state, options, callback) => {
  try {
    // Action logic
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Log the error
    logger.error("[ACTION_NAME] Failed:", errorMsg);

    // Notify via callback
    callback?.({ text: `Action failed: ${errorMsg}`, content: null });

    // Return failure result
    return {
      text: `Action failed: ${errorMsg}`,
      success: false,
      error: errorMsg,
    };
  }
};
```

---

## Service Interface

Services provide reusable functionality for actions.

```typescript
import { IAgentRuntime, Service, logger } from "@elizaos/core";

export class MyService extends Service {
  // Static service type identifier
  static serviceType = "MY_SERVICE";

  // Capability description
  capabilityDescription = "Performs my feature operations";

  // Private state
  private connection: Connection | null = null;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
  }

  // Factory method (required)
  static async start(runtime: IAgentRuntime): Promise<MyService> {
    const service = new MyService(runtime);
    await service.initialize();
    logger.info("[MY_SERVICE] Started");
    return service;
  }

  // Initialization
  private async initialize(): Promise<void> {
    // Setup connections, load config, etc.
  }

  // Cleanup method (required)
  async stop(): Promise<void> {
    logger.info("[MY_SERVICE] Stopping");
    // Cleanup resources
  }

  // Service methods
  public async doSomething(userId: string, params: unknown): Promise<Result> {
    // Implementation
  }
}
```

---

## Provider Interface

Providers inject data into the LLM context.

```typescript
import type { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";

export const myProvider: Provider = {
  // Provider name (injected into context)
  name: "MY_PROVIDER",

  // Description
  description: "Provides current market data for the conversation",

  // Whether data is dynamic (fetched each time)
  dynamic: true,

  // Data fetching function
  get: async (runtime: IAgentRuntime, message: Memory, state: State) => {
    // Fetch data based on context
    const data = await fetchMarketData();

    return {
      // Text injected into LLM context
      text: `Current market: ${data.summary}`,

      // Structured data for programmatic access
      data: { prices: data.prices },

      // Template variables
      values: { marketStatus: data.status },
    };
  },
};
```

---

## Manager Integration

Use transaction managers for blockchain operations.

### Solana Transaction Manager

```typescript
import { SolanaTransactionManager } from "../../../managers/solana-transaction-manager";

export class MySolanaService extends Service {
  private manager: SolanaTransactionManager;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    this.manager = SolanaTransactionManager.getInstance();
  }

  async getWallet(userId: string) {
    return await this.manager.getOrCreateWallet(userId);
  }

  async sendSOL(userId: string, to: string, amount: number) {
    return await this.manager.sendSOL(userId, to, amount);
  }
}
```

### CDP Transaction Manager (EVM)

```typescript
import { CDPTransactionManager } from "../../../managers/cdp-transaction-manager";

export class MyEVMService extends Service {
  private manager: CDPTransactionManager;

  constructor(runtime: IAgentRuntime) {
    super(runtime);
    this.manager = CDPTransactionManager.getInstance();
  }

  async getWallet(userId: string) {
    return await this.manager.getOrCreateWallet(userId);
  }
}
```

---

## Plugin Export

```typescript
// src/index.ts
import type { Plugin } from "@elizaos/core";
import { MyService } from "./services/my.service";
import { myAction } from "./actions/my-action";
import { myProvider } from "./providers/my-provider";

export const myPlugin: Plugin = {
  name: "plugin-myfeature",
  description: "My feature plugin",
  evaluators: [],
  providers: [myProvider],
  actions: [myAction],
  services: [MyService],
};

export default myPlugin;

// Export types for consumers
export type { MyResult } from "./types";
export { MyService } from "./services/my.service";
```

---

## Undocumented Conventions

### UserId Extraction

Always use `message.entityId` (not `message.userId`):

```typescript
const userId = message.entityId as string;
```

### Parameter Extraction

Use `runtime.composeState()` with action state:

```typescript
const composedState = await runtime.composeState(
  message,
  ["ACTION_STATE"],
  true
);
const params = composedState?.data?.actionParams || {};
```

### Logging Convention

Prefix all logs with action/service name:

```typescript
logger.info("[MY_ACTION] Processing request...");
logger.error("[MY_SERVICE] Failed to connect:", error);
```

### Callback Usage

Always call callback for streaming responses:

```typescript
// Stream progress
callback?.({ text: "Processing...", content: null });

// Stream result
callback?.({ text: finalResult, content: data });
```

### Error Return Format

Consistent error structure:

```typescript
return {
  text: `Error: ${errorMessage}`,
  success: false,
  error: errorMessage,
};
```

---

## Testing

### Setup

Use Bun Test (not Vitest):

```typescript
import { describe, it, expect, beforeEach, mock } from "bun:test";

describe("MyAction", () => {
  beforeEach(() => {
    // Reset mocks
  });

  it("should validate when service is available", async () => {
    const mockRuntime = {
      getService: mock(() => mockService),
    };

    const result = await myAction.validate(mockRuntime, {});
    expect(result).toBe(true);
  });
});
```

### Mocking Services

```typescript
const mockService = {
  doSomething: mock(() => Promise.resolve({ success: true })),
};

const mockRuntime = {
  getService: mock((type: string) => {
    if (type === "MY_SERVICE") return mockService;
    return null;
  }),
  composeState: mock(() => Promise.resolve({
    data: { actionParams: { amount: "100" } }
  })),
};
```

---

## Build & Deploy

### Build Plugin

```bash
cd src/plugins/plugin-myfeature
bun run build
```

### Build Full Project

```bash
# From root
bun run build
```

### Production Build

```bash
NODE_ENV=production bun run build
```

---

## Plugin Registration Order

Order matters for initialization:

1. `sqlPlugin` - Database (required first)
2. `bootstrapPlugin` - Core ElizaOS behaviors (required second)
3. LLM providers (`openrouterPlugin`, `openaiPlugin`)
4. Wallet plugins (`cdpPlugin`, `solanaPlugin`)
5. Data plugins (`coingeckoPlugin`, `webSearchPlugin`)
6. DeFi plugins (`jupiterPlugin`, `relayPlugin`, etc.)
7. Utility plugins (`mcpPlugin`, `analyticsPlugin`)

---

## Common Patterns

### Balance Check Before Transaction

```typescript
const balance = await service.getBalance(userId, token);
if (balance < requiredAmount) {
  return {
    success: false,
    error: `Insufficient ${token} balance. Have: ${balance}, Need: ${requiredAmount}`,
  };
}
```

### Gas Buffer for Native Tokens

```typescript
const GAS_BUFFER = 0.01; // Keep 0.01 SOL/ETH for fees
const maxSwapAmount = balance - GAS_BUFFER;
if (requestedAmount > maxSwapAmount) {
  callback?.({
    text: `Maximum swap amount is ${maxSwapAmount} (keeping ${GAS_BUFFER} for gas)`,
  });
}
```

### Transaction Confirmation

```typescript
// Return full transaction hash (never truncate!)
return {
  success: true,
  text: `Transaction confirmed!\n\nHash: ${txHash}\nExplorer: ${explorerUrl}`,
  data: { txHash, explorerUrl },
};
```
