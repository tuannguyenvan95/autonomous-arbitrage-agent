// src/agent.ts
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Autonomous Yield & Liquidity Arbitrage Agent                   ║
 * ║  Unicity Testnet v2 — Autonomous Agents Track                   ║
 * ║                                                                 ║
 * ║  Zero-human-in-the-loop agent that:                             ║
 * ║   • Initializes its own wallet & identity                       ║
 * ║   • Scans intent markets & DEX pools for opportunities          ║
 * ║   • Negotiates P2P swaps via Nostr-style messaging              ║
 * ║   • Executes atomic swaps & yield deposits                      ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { initIdentity } from "./identity";
import { startMarketScanner, Opportunity } from "./marketScanner";
import { Negotiator } from "./negotiator";
import { executeOpportunity, stats } from "./executor";
import { config } from "./config";
import { logger } from "./utils";

async function main(): Promise<void> {
  logger.info("═══════════════════════════════════════════════════════");
  logger.info("  Autonomous Arbitrage Agent starting…");
  logger.info("═══════════════════════════════════════════════════════");

  // ── Step 1: Initialize identity & wallet ──────────────────────────
  const { sdk, wallet, nametag } = await initIdentity();
  logger.info(`🤖 Agent "${nametag}" online | address: ${wallet.address}`);

  // ── Step 2: Set up negotiator ─────────────────────────────────────
  const negotiator = new Negotiator();

  let opportunitiesFound = 0;
  let opportunitiesActedOn = 0;

  // ── Step 3: Opportunity handler ───────────────────────────────────
  const handleOpportunity = async (opp: Opportunity): Promise<void> => {
    opportunitiesFound++;

    try {
      const typeLabel = opp.type === "arb" ? "⚡ ARBITRAGE" : "🌾 YIELD";
      logger.info(
        `${typeLabel} detected: ${opp.tokenIn} → ${opp.tokenOut} | spread ${(opp.spread * 100).toFixed(2)}%${opp.apy ? ` | APY ${(opp.apy * 100).toFixed(2)}%` : ""}`
      );

      // 1️⃣ Send proposal to counterparty
      const proposalId = await negotiator.propose(opp.counterparty, {
        type: opp.type,
        tokenIn: opp.tokenIn,
        tokenOut: opp.tokenOut,
        amountIn: opp.amountIn,
      });

      // 2️⃣ Listen for acceptance (one-shot per proposal)
      negotiator.once("accepted", async (propId: string) => {
        if (propId === proposalId) {
          opportunitiesActedOn++;
          await executeOpportunity(sdk, wallet, opp);
        }
      });

      negotiator.once("rejected", (propId: string) => {
        if (propId === proposalId) {
          logger.info(`⏭️  Proposal ${proposalId} rejected, moving on`);
        }
      });

      // Start listening for this counterparty's reply
      negotiator.listen(opp.counterparty, proposalId);
    } catch (e) {
      logger.error(`Error handling opportunity: ${e}`);
    }
  };

  // ── Step 4: Start market scanner loop ─────────────────────────────
  logger.info(
    `🔍 Starting market scanner (poll every ${config.marketPollInterval / 1000}s)…`
  );
  startMarketScanner(sdk, handleOpportunity);

  // ── Step 5: Periodic stats report ─────────────────────────────────
  setInterval(() => {
    logger.info("── Agent Stats ──────────────────────────────────────");
    logger.info(`  Opportunities found:   ${opportunitiesFound}`);
    logger.info(`  Opportunities acted:   ${opportunitiesActedOn}`);
    logger.info(`  Successful swaps:      ${stats.successfulSwaps}`);
    logger.info(`  Failed swaps:          ${stats.failedSwaps}`);
    logger.info(`  Yield deposits:        ${stats.yieldDeposits}`);
    logger.info(`  Total volume:          ${stats.totalVolumeIn.toFixed(2)}`);
    logger.info(`  Pending negotiations:  ${negotiator.pendingCount}`);
    logger.info("─────────────────────────────────────────────────────");
  }, 30_000);

  // Keep process alive
  logger.info("🚀 Agent loop is running. Press Ctrl+C to stop.");
}

// Execute and handle top-level errors
main().catch((err) => {
  logger.error(`Fatal error: ${err}`);
  process.exit(1);
});
