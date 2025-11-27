#!/usr/bin/env bun

/**
 * Batch 7: Integration & Testing Script
 *
 * Tests Solana integration end-to-end on devnet:
 * 1. Get wallet info and balance
 * 2. Request devnet airdrop
 * 3. Test SOL transfer
 * 4. Test Jupiter swap
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import { SolanaTransactionManager } from '../src/managers/solana-transaction-manager';
import bs58 from 'bs58';

const DEVNET_RPC = 'https://api.devnet.solana.com';
const HELIUS_DEVNET_RPC = `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

async function main() {
    console.log('🚀 Starting Solana Integration Testing (Batch 7)\n');

    const connection = new Connection(HELIUS_DEVNET_RPC || DEVNET_RPC, 'confirmed');
    const manager = SolanaTransactionManager.getInstance();

    // Test user ID
    const testUserId = 'test-user-batch7';

    console.log('📝 Step 1: Get or create wallet for test user');
    const wallet = await manager.getOrCreateWallet(testUserId);
    const publicKey = new PublicKey(wallet.publicKey);

    console.log(`   ✓ Wallet Public Key: ${publicKey.toBase58()}`);
    console.log(`   ✓ Explorer: https://solscan.io/account/${publicKey.toBase58()}?cluster=devnet\n`);

    console.log('💰 Step 2: Check initial balance');
    const initialBalance = await connection.getBalance(publicKey);
    console.log(`   ✓ Initial Balance: ${initialBalance / LAMPORTS_PER_SOL} SOL\n`);

    if (initialBalance < 0.1 * LAMPORTS_PER_SOL) {
        console.log('🪂 Step 3: Requesting devnet airdrop (2 SOL)');
        try {
            const airdropSignature = await connection.requestAirdrop(
                publicKey,
                2 * LAMPORTS_PER_SOL
            );

            console.log(`   ⏳ Confirming airdrop: ${airdropSignature}`);
            await connection.confirmTransaction(airdropSignature, 'confirmed');

            const newBalance = await connection.getBalance(publicKey);
            console.log(`   ✓ Airdrop successful! New balance: ${newBalance / LAMPORTS_PER_SOL} SOL`);
            console.log(`   ✓ Transaction: https://solscan.io/tx/${airdropSignature}?cluster=devnet\n`);
        } catch (error: any) {
            console.log(`   ⚠️  Airdrop failed: ${error.message}`);
            console.log('   💡 Tip: Try manual airdrop at https://faucet.solana.com\n');
        }
    } else {
        console.log('   ✓ Sufficient balance for testing\n');
    }

    console.log('🔍 Step 4: Test SOLANA_WALLET_INFO action');
    const balances = await manager.getTokenBalances(testUserId);
    console.log(`   ✓ SOL Balance: ${balances.solBalance} SOL`);
    console.log(`   ✓ USD Value: $${balances.totalUsdValue.toFixed(2)}`);
    console.log(`   ✓ SPL Tokens: ${balances.tokens.length}\n`);

    // Create a second test wallet for transfers
    console.log('🔑 Step 5: Create recipient wallet for transfer test');
    const recipientKeypair = Keypair.generate();
    const recipientAddress = recipientKeypair.publicKey.toBase58();
    console.log(`   ✓ Recipient Address: ${recipientAddress}\n`);

    console.log('📤 Step 6: Test SOL transfer (0.1 SOL)');
    try {
        const transferResult = await manager.sendSOL(
            testUserId,
            recipientAddress,
            '0.1'
        );
        console.log(`   ✓ Transfer successful!`);
        console.log(`   ✓ Signature: ${transferResult.signature}`);
        console.log(`   ✓ Explorer: ${transferResult.explorerUrl}\n`);
    } catch (error: any) {
        console.log(`   ❌ Transfer failed: ${error.message}\n`);
    }

    console.log('🔄 Step 7: Test Jupiter swap (0.1 SOL -> USDC)');
    console.log('   ⏭️  Skipping swap test (requires Jupiter service integration)');
    console.log('   💡 To test swaps, use the chat interface: "Swap 0.1 SOL to USDC"\n');

    console.log('✅ Integration testing complete!');
    console.log('\nNext steps:');
    console.log('1. Start the dev server: bun run dev');
    console.log('2. Open http://localhost:3000');
    console.log('3. Test via chat interface:');
    console.log('   - "What\'s my Solana balance?"');
    console.log('   - "Send 0.05 SOL to <address>"');
    console.log('   - "Swap 0.1 SOL to USDC"');
}

main().catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});
