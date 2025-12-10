import { build } from 'bun';

await build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  target: 'bun',
  format: 'esm',
  external: ['@elizaos/core', '@solana/web3.js', '@solana/spl-token'],
});

console.log('@elizaos/plugin-x402-solana build complete!');
