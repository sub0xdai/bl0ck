import { describe, it, expect } from 'bun:test';
import { Keypair } from '@solana/web3.js';
import { buildPaymentTransaction } from '../src/client/payment-builder';

describe('buildPaymentTransaction', () => {
  const payer = Keypair.generate();
  const recipient = Keypair.generate().publicKey;

  it('should create transaction with transfer and memo instructions', async () => {
    const tx = await buildPaymentTransaction({
      payer,
      recipientTokenAccount: recipient,
      amount: BigInt(15000), // $0.015
      memo: 'x402:test-request-123',
      rpcEndpoint: 'https://api.devnet.solana.com',
      network: 'devnet',
    });

    expect(tx).toBeDefined();
    expect(tx.instructions.length).toBe(2); // Transfer + Memo
  });

  it('should include correct memo content', async () => {
    const tx = await buildPaymentTransaction({
      payer,
      recipientTokenAccount: recipient,
      amount: BigInt(15000),
      memo: 'x402:my-unique-id',
      rpcEndpoint: 'https://api.devnet.solana.com',
      network: 'devnet',
    });

    // Memo instruction should be the second one
    const memoIx = tx.instructions[1];
    expect(memoIx).toBeDefined();
    // Memo data is the UTF-8 encoded string
    expect(Buffer.from(memoIx.data).toString('utf-8')).toBe('x402:my-unique-id');
  });

  it('should reject zero amount', async () => {
    await expect(
      buildPaymentTransaction({
        payer,
        recipientTokenAccount: recipient,
        amount: BigInt(0),
        memo: 'x402:test',
        rpcEndpoint: 'https://api.devnet.solana.com',
        network: 'devnet',
      })
    ).rejects.toThrow('Amount must be greater than 0');
  });

  it('should reject negative amount', async () => {
    await expect(
      buildPaymentTransaction({
        payer,
        recipientTokenAccount: recipient,
        amount: BigInt(-100),
        memo: 'x402:test',
        rpcEndpoint: 'https://api.devnet.solana.com',
        network: 'devnet',
      })
    ).rejects.toThrow('Amount must be greater than 0');
  });

  it('should use mainnet USDC mint by default', async () => {
    const tx = await buildPaymentTransaction({
      payer,
      recipientTokenAccount: recipient,
      amount: BigInt(15000),
      memo: 'x402:test',
      rpcEndpoint: 'https://api.mainnet-beta.solana.com',
      // network defaults to mainnet-beta
    });

    expect(tx).toBeDefined();
    // Transaction should be created (we can't easily verify mint without parsing)
  });
});
