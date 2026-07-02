// src/sdk/index.ts
/**
 * Local Sphere SDK Mock – simulates Unicity Sphere SDK for Testnet v2.
 * Provides wallet, identity, intent-market, DEX, escrow, and swap primitives
 * using in-memory state so the agent can run without a live network.
 */

import * as crypto from "crypto";

// ─── Interfaces ──────────────────────────────────────────────────────
export interface Wallet {
  address: string;
  privateKey: string;
  nametag?: string;
}

export interface Intent {
  id: string;
  type: "swap" | "yield";
  tokenIn: string;
  tokenOut: string;
  rate: number;
  makerPubKey: string;
  createdAt: number;
}

export interface DexPool {
  id: string;
  tokenA: string;
  tokenB: string;
  reserveA: number;
  reserveB: number;
  apy?: number;
  providerPubKey: string;
}

export interface EscrowParams {
  initiator: string;
  counterpart: string;
  tokenIn: string;
  tokenOut?: string;
  amountIn: number;
  minAmountOut?: number;
}

export interface SwapParams {
  escrowId: string;
  initiator: string;
}

// ─── In-memory ledger ────────────────────────────────────────────────
const balances: Record<string, Record<string, number>> = {};
const nametags: Record<string, string> = {};
const escrows: Record<string, EscrowParams & { settled: boolean }> = {};

function ensureBalance(address: string, token: string, amount: number) {
  if (!balances[address]) balances[address] = {};
  if (!balances[address][token]) balances[address][token] = 0;
  balances[address][token] += amount;
}

// ─── Mock token pairs and pools ──────────────────────────────────────
const TOKEN_PAIRS = [
  ["UTEST", "ALPHA"],
  ["UTEST", "BETA"],
  ["ALPHA", "BETA"],
];

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function generatePools(): DexPool[] {
  const pools: DexPool[] = [];
  for (const [tokenA, tokenB] of TOKEN_PAIRS) {
    // Generate 2 pools per pair to create arb opportunities
    for (let i = 0; i < 2; i++) {
      const reserveA = randomBetween(5000, 20000);
      const rateVariation = randomBetween(0.9, 1.1);
      pools.push({
        id: `pool-${tokenA}-${tokenB}-${i}`,
        tokenA,
        tokenB,
        reserveA,
        reserveB: reserveA * rateVariation,
        apy: Math.random() > 0.5 ? randomBetween(0.001, 0.05) : undefined,
        providerPubKey: crypto.randomBytes(16).toString("hex"),
      });
    }
  }
  return pools;
}

function generateIntents(): Intent[] {
  const intents: Intent[] = [];
  const count = Math.floor(randomBetween(1, 5));
  for (let i = 0; i < count; i++) {
    const [tokenIn, tokenOut] =
      TOKEN_PAIRS[Math.floor(Math.random() * TOKEN_PAIRS.length)];
    intents.push({
      id: crypto.randomBytes(8).toString("hex"),
      type: "swap",
      tokenIn,
      tokenOut,
      rate: randomBetween(0.8, 1.2),
      makerPubKey: crypto.randomBytes(16).toString("hex"),
      createdAt: Date.now(),
    });
  }
  return intents;
}

// ─── SphereSDK class ─────────────────────────────────────────────────
export class SphereSDK {
  private rpcUrl: string;

  constructor(opts: { rpcUrl: string }) {
    this.rpcUrl = opts.rpcUrl;
  }

  wallet = {
    fromPrivateKey: async (privateKey: string): Promise<Wallet> => {
      const address =
        "0x" + crypto.createHash("sha256").update(privateKey).digest("hex").slice(0, 40);
      ensureBalance(address, "UTEST", 0);
      return { address, privateKey };
    },
    getBalance: async (opts: { wallet: Wallet; token: string }): Promise<number> => {
      return balances[opts.wallet.address]?.[opts.token] ?? 0;
    },
  };

  identity = {
    registerNametag: async (opts: {
      wallet: Wallet;
      nametag: string;
    }): Promise<void> => {
      if (nametags[opts.nametag] && nametags[opts.nametag] !== opts.wallet.address) {
        throw new Error("Nametag already registered by another wallet");
      }
      nametags[opts.nametag] = opts.wallet.address;
      opts.wallet.nametag = opts.nametag;
    },
  };

  faucet = {
    request: async (address: string, amount: number): Promise<{ txId: string }> => {
      ensureBalance(address, "UTEST", amount);
      ensureBalance(address, "ALPHA", amount * 0.5);
      ensureBalance(address, "BETA", amount * 0.3);
      return { txId: crypto.randomBytes(16).toString("hex") };
    },
  };

  intent = {
    getOpenIntents: async (): Promise<Intent[]> => {
      return generateIntents();
    },
  };

  dex = {
    getPools: async (): Promise<DexPool[]> => {
      return generatePools();
    },
  };

  escrow = {
    createEscrow: async (params: EscrowParams): Promise<string> => {
      const id = "escrow-" + crypto.randomBytes(8).toString("hex");
      escrows[id] = { ...params, settled: false };
      // Deduct from initiator
      if (balances[params.initiator]?.[params.tokenIn]) {
        balances[params.initiator][params.tokenIn] -= params.amountIn;
      }
      return id;
    },
  };

  swap = {
    atomicSwap: async (params: SwapParams): Promise<{ txId: string }> => {
      const esc = escrows[params.escrowId];
      if (!esc) throw new Error("Escrow not found");
      if (esc.settled) throw new Error("Escrow already settled");
      // Simulate: credit the output token to initiator
      const outAmount = esc.amountIn * randomBetween(0.95, 1.05);
      if (esc.tokenOut) {
        ensureBalance(esc.initiator, esc.tokenOut, outAmount);
      }
      esc.settled = true;
      return { txId: crypto.randomBytes(16).toString("hex") };
    },
  };

  yieldModule = {
    stake: async (opts: {
      escrowId: string;
      poolId: string;
      amount: number;
    }): Promise<{ txId: string }> => {
      const esc = escrows[opts.escrowId];
      if (!esc) throw new Error("Escrow not found");
      esc.settled = true;
      return { txId: crypto.randomBytes(16).toString("hex") };
    },
  };
}
