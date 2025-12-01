#!/usr/bin/env bun
/**
 * Build script for @elizaos/plugin-drift using standardized build utilities
 */

import { createBuildRunner } from './utils/build-utils';

// Create and run the standardized build runner
const run = createBuildRunner({
  packageName: '@elizaos/plugin-drift',
  buildOptions: {
    entrypoints: ['src/index.ts'],
    outdir: 'dist',
    target: 'node',
    format: 'esm',
    external: [
      'dotenv',
      'fs',
      'path',
      '@elizaos/core',
      '@drift-labs/sdk',
      '@coral-xyz/anchor',
      '@solana/web3.js',
    ],
    sourcemap: true,
    minify: false,
    generateDts: true,
  },
});

// Execute the build
run().catch((error) => {
  console.error('Build script error:', error);
  process.exit(1);
});
