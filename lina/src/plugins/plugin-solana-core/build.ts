#!/usr/bin/env bun
/**
 * Build script for @elizaos/plugin-solana-core using standardized build utilities
 */

import { createBuildRunner } from './utils/build-utils';

// Create and run the standardized build runner
const run = createBuildRunner({
  packageName: '@elizaos/plugin-solana-core',
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
      '@solana/web3.js',
      '@solana/spl-token',
      'bs58',
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
