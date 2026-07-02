// src/marketScanner.ts
import { SphereSDK, Intent, DexPool } from "./sdk";
import { config } from "./config";
import { logger } from "./utils";

/**
 * Represents a detected trading opportunity.
 */
export interface Opportunity {
  type: "arb" | "yield";
  tokenIn: string;
  tokenOut: string;
  amountIn: number;
  expectedOut: number;
  spread: number;
  poolId?: string;
  apy?: number;
  counterparty: string;
  timestamp: number;
}

/**
 * Start continuous market scanning.
 * Polls the Intent Market and DEX pools at a configurable interval
 * and invokes `onOpportunity` for every viable candidate.
 */
export function startMarketScanner(
  sdk: SphereSDK,
  onOpportunity: (opp: Opportunity) => void
): void {
  let scanCount = 0;

  // ── Intent market polling ────────────────────────────────────────
  setInterval(async () => {
    scanCount++;
    try {
      const intents = await sdk.intent.getOpenIntents();
      logger.info(
        `[Scan #${scanCount}] Intent market: ${intents.length} open intents`
      );
      for (const intent of intents) {
        const opp = evaluateIntent(intent);
        if (opp) onOpportunity(opp);
      }
    } catch (e) {
      logger.error(`Intent market scan failed: ${e}`);
    }
  }, config.marketPollInterval);

  // ── DEX pool polling ─────────────────────────────────────────────
  setInterval(async () => {
    try {
      const pools = await sdk.dex.getPools();
      logger.info(`[Scan #${scanCount}] DEX pools: ${pools.length} pools`);

      const arbOpps = findArbitrage(pools);
      for (const opp of arbOpps) onOpportunity(opp);

      const yieldOpps = findYield(pools);
      for (const opp of yieldOpps) onOpportunity(opp);
    } catch (e) {
      logger.error(`DEX pool scan failed: ${e}`);
    }
  }, config.marketPollInterval);
}

// ─── Helpers ───────────────────────────────────────────────────────

function evaluateIntent(intent: Intent): Opportunity | null {
  if (intent.type !== "swap") return null;

  const marketRate = 1.0; // baseline reference rate
  const spread = Math.abs(intent.rate - marketRate) / marketRate;

  if (spread >= config.minArbSpread) {
    const amountIn = 100; // demo sizing
    return {
      type: "arb",
      tokenIn: intent.tokenIn,
      tokenOut: intent.tokenOut,
      amountIn,
      expectedOut: amountIn * intent.rate,
      spread,
      counterparty: intent.makerPubKey,
      timestamp: Date.now(),
    };
  }
  return null;
}

function findArbitrage(pools: DexPool[]): Opportunity[] {
  const opps: Opportunity[] = [];
  for (let i = 0; i < pools.length; i++) {
    for (let j = i + 1; j < pools.length; j++) {
      const pA = pools[i];
      const pB = pools[j];
      if (pA.tokenA === pB.tokenA && pA.tokenB === pB.tokenB) {
        const rateA = pA.reserveB / pA.reserveA;
        const rateB = pB.reserveB / pB.reserveA;
        const spread = Math.abs(rateA - rateB) / Math.min(rateA, rateB);
        if (spread >= config.minArbSpread) {
          const amountIn = 50; // demo sizing
          opps.push({
            type: "arb",
            tokenIn: pA.tokenA,
            tokenOut: pA.tokenB,
            amountIn,
            expectedOut: amountIn * Math.max(rateA, rateB),
            spread,
            counterparty: pB.providerPubKey,
            timestamp: Date.now(),
          });
        }
      }
    }
  }
  return opps;
}

function findYield(pools: DexPool[]): Opportunity[] {
  const opps: Opportunity[] = [];
  for (const pool of pools) {
    if (pool.apy && pool.apy >= config.minYield) {
      opps.push({
        type: "yield",
        tokenIn: pool.tokenA,
        tokenOut: pool.tokenA,
        amountIn: 0,
        expectedOut: 0,
        spread: 0,
        poolId: pool.id,
        apy: pool.apy,
        counterparty: pool.providerPubKey,
        timestamp: Date.now(),
      });
    }
  }
  return opps;
}
