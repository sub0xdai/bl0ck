#!/usr/bin/env bun
/**
 * Custom server start script that uses our custom UI
 */

// CRITICAL: Load .env FIRST before any module imports that use process.env
import 'dotenv/config';

import { AgentServer, loadCharacters } from '@elizaos/server';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const server = new AgentServer();

  // Debug: Log database configuration
  const postgresUrl = process.env.POSTGRES_URL;
  console.log(`[DEBUG] POSTGRES_URL set: ${postgresUrl ? 'YES (length: ' + postgresUrl.length + ')' : 'NO'}`);
  console.log(`[DEBUG] POSTGRES_URL starts with: ${postgresUrl ? postgresUrl.substring(0, 30) + '...' : 'N/A'}`);

  // Initialize server with custom client path
  await server.initialize({
    clientPath: path.resolve(__dirname, 'dist/frontend'), //  Point to OUR custom UI
    dataDir: process.env.PGLITE_DATA_DIR || path.resolve(__dirname, '.eliza/.elizadb'),
    postgresUrl: postgresUrl,
  });

  // Load characters from project
  const projectPath = path.resolve(__dirname, 'dist/index.js');
  console.log(`Loading project from: ${projectPath}`);
  
  const project = await import(projectPath);
  const projectModule = project.default || project;
  
  if (projectModule.agents && Array.isArray(projectModule.agents)) {
    const characters = projectModule.agents.map((agent: any) => agent.character);
    // Flatten plugin arrays from all agents
    const allPlugins = projectModule.agents.flatMap((agent: any) => agent.plugins || []);
    await server.startAgents(characters, allPlugins);
    console.log(` Started ${characters.length} agent(s)`);
  } else {
    throw new Error('No agents found in project');
  }

  // Start server
  const port = parseInt(process.env.SERVER_PORT || '3000');
  await server.start(port);

  console.log(`\n Server with custom UI running on http://localhost:${port}\n`);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

