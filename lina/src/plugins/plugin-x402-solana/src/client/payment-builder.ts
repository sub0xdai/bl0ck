/**
 * Payment Transaction Builder
 *
 * Builds Solana transactions for x402 payments with USDC-SPL transfer + memo.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { USDC_MINT_MAINNET, USDC_MINT_DEVNET, MEMO_PROGRAM_ID } from '../constants';
import { X402ValidationError } from '../errors';

export interface BuildPaymentParams {
  /** Payer's keypair */
  payer: Keypair;
  /** Recipient's USDC token account */
  recipientTokenAccount: PublicKey;
  /** Amount in USDC base units (6 decimals) */
  amount: bigint;
  /** Memo content (should include requestId) */
  memo: string;
  /** RPC endpoint */
  rpcEndpoint: string;
  /** Network (defaults to mainnet) */
  network?: 'mainnet-beta' | 'devnet';
}

/**
 * Build a payment transaction with USDC transfer and memo
 */
export async function buildPaymentTransaction(
  params: BuildPaymentParams
): Promise<Transaction> {
  const {
    payer,
    recipientTokenAccount,
    amount,
    memo,
    rpcEndpoint,
    network = 'mainnet-beta',
  } = params;

  if (amount <= 0n) {
    throw new X402ValidationError('Amount must be greater than 0');
  }

  const connection = new Connection(rpcEndpoint, 'confirmed');
  const usdcMint = network === 'mainnet-beta' ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;

  // Get payer's USDC token account
  const payerTokenAccount = getAssociatedTokenAddressSync(
    usdcMint,
    payer.publicKey
  );

  // Create transfer instruction
  const transferIx = createTransferInstruction(
    payerTokenAccount,
    recipientTokenAccount,
    payer.publicKey,
    amount
  );

  // Create memo instruction
  const memoIx = new TransactionInstruction({
    keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, 'utf-8'),
  });

  // Build transaction
  const tx = new Transaction();
  tx.add(transferIx);
  tx.add(memoIx);

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = payer.publicKey;

  return tx;
}

/**
 * Sign and send a payment transaction
 */
export async function sendPaymentTransaction(
  transaction: Transaction,
  payer: Keypair,
  rpcEndpoint: string
): Promise<string> {
  const connection = new Connection(rpcEndpoint, 'confirmed');

  // Sign transaction
  transaction.sign(payer);

  // Send transaction
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  // Wait for confirmation using non-deprecated API
  const confirmationStrategy = {
    signature,
    blockhash: transaction.recentBlockhash!,
    lastValidBlockHeight: transaction.lastValidBlockHeight!,
  };
  await connection.confirmTransaction(confirmationStrategy, 'confirmed');

  return signature;
}
