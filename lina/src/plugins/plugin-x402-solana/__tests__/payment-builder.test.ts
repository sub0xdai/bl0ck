import { describe, it, expect, mock, spyOn } from 'bun:test';
import { Keypair, Connection, Transaction } from '@solana/web3.js';
import { buildPaymentTransaction, sendPaymentTransaction } from '../src/client/payment-builder';

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

describe('sendPaymentTransaction', () => {
  const payer = Keypair.generate();

  it('should sign and send transaction successfully', async () => {
    // Create a mock transaction with necessary properties
    const tx = new Transaction();
    tx.recentBlockhash = 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi';
    tx.lastValidBlockHeight = 12345;
    tx.feePayer = payer.publicKey;

    // Mock the Connection methods
    const mockSignature = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';

    const mockSendRawTransaction = mock(() => Promise.resolve(mockSignature));
    const mockConfirmTransaction = mock(() => Promise.resolve({ value: { err: null } }));

    // Spy on Connection prototype methods
    spyOn(Connection.prototype, 'sendRawTransaction').mockImplementation(mockSendRawTransaction);
    spyOn(Connection.prototype, 'confirmTransaction').mockImplementation(mockConfirmTransaction);

    const signature = await sendPaymentTransaction(
      tx,
      payer,
      'https://api.devnet.solana.com'
    );

    expect(signature).toBe(mockSignature);
    expect(mockSendRawTransaction).toHaveBeenCalled();
    expect(mockConfirmTransaction).toHaveBeenCalled();
  });

  it('should throw if transaction send fails', async () => {
    const tx = new Transaction();
    tx.recentBlockhash = 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi';
    tx.lastValidBlockHeight = 12345;
    tx.feePayer = payer.publicKey;

    const mockSendRawTransaction = mock(() => Promise.reject(new Error('Blockhash expired')));

    spyOn(Connection.prototype, 'sendRawTransaction').mockImplementation(mockSendRawTransaction);

    await expect(
      sendPaymentTransaction(tx, payer, 'https://api.devnet.solana.com')
    ).rejects.toThrow('Blockhash expired');
  });

  it('should throw if confirmation fails', async () => {
    const tx = new Transaction();
    tx.recentBlockhash = 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi';
    tx.lastValidBlockHeight = 12345;
    tx.feePayer = payer.publicKey;

    const mockSignature = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';

    spyOn(Connection.prototype, 'sendRawTransaction').mockImplementation(() =>
      Promise.resolve(mockSignature)
    );
    spyOn(Connection.prototype, 'confirmTransaction').mockImplementation(() =>
      Promise.reject(new Error('Transaction confirmation timeout'))
    );

    await expect(
      sendPaymentTransaction(tx, payer, 'https://api.devnet.solana.com')
    ).rejects.toThrow('Transaction confirmation timeout');
  });

  it('should use correct confirmation strategy', async () => {
    const tx = new Transaction();
    tx.recentBlockhash = 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi';
    tx.lastValidBlockHeight = 12345;
    tx.feePayer = payer.publicKey;

    const mockSignature = '5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW';

    spyOn(Connection.prototype, 'sendRawTransaction').mockImplementation(() =>
      Promise.resolve(mockSignature)
    );

    let capturedStrategy: unknown;
    spyOn(Connection.prototype, 'confirmTransaction').mockImplementation(
      (strategy: unknown) => {
        capturedStrategy = strategy;
        return Promise.resolve({ value: { err: null } });
      }
    );

    await sendPaymentTransaction(tx, payer, 'https://api.devnet.solana.com');

    // Verify the confirmation strategy has correct shape (non-deprecated API)
    expect(capturedStrategy).toMatchObject({
      signature: mockSignature,
      blockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi',
      lastValidBlockHeight: 12345,
    });
  });
});
