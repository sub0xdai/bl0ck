/**
 * CDP Hyperliquid Signer
 *
 * Adapter that bridges CDP wallet signing to Hyperliquid's EIP-712 requirements.
 * This enables trading on Hyperliquid using the same CDP EVM wallet used for spot trading.
 *
 * Key implementation details:
 * - Replicates the signing logic from hyperliquid SDK's signing.ts
 * - Uses viem's signTypedData instead of ethers
 * - Splits signature into {r, s, v} format required by Hyperliquid API
 */

import { encode } from '@msgpack/msgpack';
import { keccak256, type Hex, type WalletClient } from 'viem';
import { CdpTransactionManager } from '@/managers/cdp-transaction-manager';
import { normalizeTrailingZeros } from '../utils/wire-format';

// ============================================================================
// Types
// ============================================================================

export interface Signature {
  r: Hex;
  s: Hex;
  v: number;
}

interface PayloadType {
  name: string;
  type: string;
}

// ============================================================================
// Constants (from Hyperliquid SDK)
// ============================================================================

const PHANTOM_DOMAIN = {
  name: 'Exchange',
  version: '1',
  chainId: 1337,
  verifyingContract: '0x0000000000000000000000000000000000000000' as const,
} as const;

const AGENT_TYPES = {
  Agent: [
    { name: 'source', type: 'string' },
    { name: 'connectionId', type: 'bytes32' },
  ],
} as const;

/**
 * Convert an address string to Uint8Array bytes.
 * @throws Error if address format is invalid
 */
function addressToBytes(address: string): Uint8Array {
  // Remove 0x prefix and validate format
  const hex = address.startsWith('0x') ? address.slice(2) : address;
  if (!/^[a-fA-F0-9]{40}$/.test(hex)) {
    throw new Error(`Invalid address format: ${address}`);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Compute action hash for L1 signing.
 * Replicates hyperliquid SDK's actionHash function.
 */
function actionHash(action: unknown, vaultAddress: string | null, nonce: number): Hex {
  // Normalize the action to remove trailing zeros from price and size fields
  const normalizedAction = normalizeTrailingZeros(action);

  // Encode with msgpack
  const msgPackBytes = encode(normalizedAction);

  // Calculate additional bytes needed
  const additionalBytesLength = vaultAddress === null ? 9 : 29;
  const data = new Uint8Array(msgPackBytes.length + additionalBytesLength);

  // Set msgpack bytes
  data.set(msgPackBytes);

  // Set nonce as big-endian uint64
  const view = new DataView(data.buffer);
  view.setBigUint64(msgPackBytes.length, BigInt(nonce), false);

  // Set vault address flag and address if provided
  if (vaultAddress === null) {
    view.setUint8(msgPackBytes.length + 8, 0);
  } else {
    view.setUint8(msgPackBytes.length + 8, 1);
    data.set(addressToBytes(vaultAddress), msgPackBytes.length + 9);
  }

  return keccak256(data);
}

/**
 * Construct phantom agent for L1 action signing.
 */
function constructPhantomAgent(
  hash: Hex,
  isMainnet: boolean
): { source: string; connectionId: Hex } {
  return {
    source: isMainnet ? 'a' : 'b',
    connectionId: hash,
  };
}

/**
 * Split a signature string into r, s, v components.
 */
function splitSignature(signature: Hex): Signature {
  // Remove 0x prefix
  const sig = signature.slice(2);

  // r = first 32 bytes (64 hex chars)
  const r = `0x${sig.slice(0, 64)}` as Hex;

  // s = next 32 bytes (64 hex chars)
  const s = `0x${sig.slice(64, 128)}` as Hex;

  // v = last byte (2 hex chars)
  let v = parseInt(sig.slice(128, 130), 16);

  // Normalize v to 27 or 28 if needed
  if (v < 27) {
    v += 27;
  }

  return { r, s, v };
}

// ============================================================================
// CdpHyperliquidSigner Class
// ============================================================================

/**
 * Adapter that provides Hyperliquid-compatible signing using CDP account.
 * Enables users to trade perps with the same EVM wallet used for spot trading.
 */
export class CdpHyperliquidSigner {
  private cdpManager: CdpTransactionManager;
  private userId: string;
  private _address: string | null = null;
  private _walletClient: WalletClient | null = null;

  constructor(userId: string) {
    this.cdpManager = CdpTransactionManager.getInstance();
    this.userId = userId;
  }

  /**
   * Get the wallet address (same as CDP EVM address).
   * Results are cached after first call.
   */
  async getAddress(): Promise<string> {
    if (!this._address) {
      const { address } = await this.cdpManager.getViemClientsForAccount({
        accountName: this.userId,
        network: 'arbitrum', // Hyperliquid uses Arbitrum for signing context
      });
      this._address = address;
    }
    return this._address;
  }

  /**
   * Get the viem wallet client for signing.
   * Results are cached after first call.
   */
  private async getWalletClient(): Promise<WalletClient> {
    if (!this._walletClient) {
      const { walletClient } = await this.cdpManager.getViemClientsForAccount({
        accountName: this.userId,
        network: 'arbitrum',
      });
      this._walletClient = walletClient;
    }
    return this._walletClient;
  }

  /**
   * Sign an L1 action (used for orders, leverage updates, etc.).
   *
   * This replicates the hyperliquid SDK's signL1Action function:
   * 1. Hash the action with msgpack + nonce
   * 2. Create phantom agent with source 'a' (mainnet) or 'b' (testnet)
   * 3. Sign with Exchange domain (chainId 1337)
   */
  async signL1Action(
    action: unknown,
    vaultAddress: string | null,
    nonce: number,
    isMainnet: boolean
  ): Promise<Signature> {
    const hash = actionHash(action, vaultAddress, nonce);
    const phantomAgent = constructPhantomAgent(hash, isMainnet);

    const walletClient = await this.getWalletClient();

    const signature = await walletClient.signTypedData({
      account: walletClient.account!,
      domain: PHANTOM_DOMAIN,
      types: AGENT_TYPES,
      primaryType: 'Agent' as const,
      message: phantomAgent,
    });

    return splitSignature(signature as Hex);
  }

  /**
   * Sign a user-signed action (used for transfers, withdrawals, etc.).
   *
   * This replicates the hyperliquid SDK's signUserSignedAction function:
   * - Uses HyperliquidSignTransaction domain
   * - ChainId: 42161 (mainnet) or 421614 (testnet)
   */
  async signUserSignedAction(
    action: Record<string, unknown>,
    payloadTypes: PayloadType[],
    primaryType: string,
    isMainnet: boolean
  ): Promise<Signature> {
    const domain = {
      name: 'HyperliquidSignTransaction',
      version: '1',
      chainId: isMainnet ? 42161 : 421614,
      verifyingContract: '0x0000000000000000000000000000000000000000' as const,
    };

    const types = {
      [primaryType]: payloadTypes,
    };

    const walletClient = await this.getWalletClient();

    const signature = await walletClient.signTypedData({
      account: walletClient.account!,
      domain,
      types,
      primaryType,
      message: action,
    } as any);

    return splitSignature(signature as Hex);
  }
}
