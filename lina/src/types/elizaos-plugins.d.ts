/**
 * Type declarations for ElizaOS external plugins
 * These plugins don't export proper TypeScript declarations
 */

declare module "@elizaos/plugin-sql" {
  import type { Plugin } from "@elizaos/core";
  const plugin: Plugin;
  export default plugin;
}

declare module "@elizaos/plugin-mcp" {
  import type { Plugin } from "@elizaos/core";
  const plugin: Plugin;
  export default plugin;
}

declare module "@elizaos/plugin-analytics" {
  import type { Plugin } from "@elizaos/core";
  const plugin: Plugin;
  export default plugin;
}

declare module "@elizaos/plugin-openai" {
  import type { Plugin } from "@elizaos/core";
  const plugin: Plugin;
  export default plugin;
}

declare module "@elizaos/plugin-openrouter" {
  import type { Plugin } from "@elizaos/core";
  const plugin: Plugin;
  export default plugin;
}

declare module "@elizaos/plugin-anthropic" {
  import type { Plugin } from "@elizaos/core";
  const plugin: Plugin;
  export default plugin;
}
