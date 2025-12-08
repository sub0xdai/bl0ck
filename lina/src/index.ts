import { logger, type IAgentRuntime, type Project, type ProjectAgent } from '@elizaos/core';
import { character } from './character';
import sqlPlugin from '@elizaos/plugin-sql';
import bootstrapPlugin from './plugins/plugin-bootstrap/src/index.ts';
import openaiPlugin from '@elizaos/plugin-openai';
import cdpPlugin from './plugins/plugin-cdp/index.ts';
import solanaPlugin from './plugins/plugin-solana-core/src/index.ts';
import jupiterPlugin from './plugins/plugin-jupiter/src/index.ts';
import hyperliquidPlugin from './plugins/plugin-hyperliquid/src/index.ts';
import driftPlugin from './plugins/plugin-drift/src/index.ts';
import coingeckoPlugin from './plugins/plugin-coingecko/src/index.ts';
import webSearchPlugin from './plugins/plugin-web-search/src/index.ts';
import defiLlamaPlugin from './plugins/plugin-defillama/src/index.ts';
import relayPlugin from './plugins/plugin-relay/src/index.ts';
import etherscanPlugin from './plugins/plugin-etherscan/src/index.ts';
import clankerPlugin from './plugins/plugin-clanker/src/index.ts';

import analyticsPlugin from '@elizaos/plugin-analytics';
import openrouterPlugin from '@elizaos/plugin-openrouter';
import mcpPlugin from '@elizaos/plugin-mcp';
import morphoPlugin from './plugins/plugin-morpho/src/index.ts';
import strategyCorePlugin from './plugins/plugin-strategy-core/src/index.ts';

// Skip MCP if NANSEN_API_KEY not set (prevents hanging on connection)
const shouldLoadMcp = !!process.env.NANSEN_API_KEY;
if (!shouldLoadMcp) {
  logger.warn('[INIT] NANSEN_API_KEY not set, skipping MCP plugin to prevent connection hang');
}

const initCharacter = ({ runtime }: { runtime: IAgentRuntime }) => {
  logger.info('Initializing character');
  logger.info({ name: character.name }, 'Character loaded:');
};

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
  // Import actual plugin modules instead of using string names
  plugins: [
    sqlPlugin,
    bootstrapPlugin,
    openrouterPlugin,
    openaiPlugin,
    cdpPlugin,
    solanaPlugin,
    jupiterPlugin,
    hyperliquidPlugin,
    driftPlugin,
    coingeckoPlugin,
    webSearchPlugin,
    defiLlamaPlugin,
    relayPlugin,
    etherscanPlugin,
    ...(shouldLoadMcp ? [mcpPlugin] : []), // Skip MCP if no API key
    analyticsPlugin,
    clankerPlugin,
    morphoPlugin,
    strategyCorePlugin,
  ],
};

const project: Project = {
  agents: [projectAgent],
};

export { character } from './character';

export default project;

