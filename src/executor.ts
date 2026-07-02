// src/executor.ts
import { SphereSDK, Wallet, EscrowParams, SwapParams } from "./sdk";
import { Opportunity } from "./marketScanner";
import { config } from "./config";
import { logger, retry } from "./utils";

// ─── Statistics ──────────────────────────────────────────────────────
export const stats = {
  totalTrades: 0,
  successfulSwaps: 0,
  failedSwaps: 0,
  yieldDeposits: 0,
  totalVolumeIn: 0,
};

/**
 * Execute a given opportunity – either an arbitrage swap or a yield deposit.
 * All steps are atomic via the SDK escrow primitive.
 */
export async function executeOpportunity(
  sdk: SphereSDK,
  wallet: Wallet,
  opp: Opportunity
): Promise<void> {
  stats.totalTrades++;

  if (opp.type === "arb") {
    await executeArbSwap(sdk, wallet, opp);
  } else if (opp.type === "yield") {
    await executeYieldDeposit(sdk, wallet, opp);
  } else {
    logger.warn(`Unknown opportunity type`);
  }
}

async function executeArbSwap(
  sdk: SphereSDK,
  wallet: Wallet,
  opp: Opportunity
): Promise<void> {
  const treasuryBalance = await sdk.wallet.getBalance({
    wallet,
    token: opp.tokenIn,
  });

  const amountIn = Math.min(
    treasuryBalance * config.maxExposurePct,
    opp.amountIn || treasuryBalance * 0.1
  );

  if (amountIn <= 0) {
    logger.info(`⏭️  Skipping arb – insufficient ${opp.tokenIn} balance`);
    return;
  }

  try {
    await retry(async () => {
      const escrow: EscrowParams = {
        initiator: wallet.address,
        counterpart: opp.counterparty,
        tokenIn: opp.tokenIn,
        tokenOut: opp.tokenOut,
        amountIn,
        minAmountOut: amountIn * (1 - config.maxExposurePct),
      };

      const escrowId = await sdk.escrow.createEscrow(escrow);
      logger.info(`🔒 Escrow created: ${escrowId}`);

      const swap: SwapParams = { escrowId, initiator: wallet.address };
      const result = await sdk.swap.atomicSwap(swap);

      logger.info(
        `💱 Arb swap executed: ${amountIn.toFixed(2)} ${opp.tokenIn} → ${opp.tokenOut} | spread ${(opp.spread * 100).toFixed(2)}% | tx ${result.txId}`
      );

      stats.successfulSwaps++;
      stats.totalVolumeIn += amountIn;
    });
  } catch (e) {
    stats.failedSwaps++;
    logger.error(`Arb swap failed: ${e}`);
  }
}

async function executeYieldDeposit(
  sdk: SphereSDK,
  wallet: Wallet,
  opp: Opportunity
): Promise<void> {
  if (!opp.poolId) {
    logger.warn(`Yield opportunity missing poolId`);
    return;
  }

  const balance = await sdk.wallet.getBalance({
    wallet,
    token: opp.tokenIn,
  });
  const depositAmount = Math.min(balance * config.maxExposurePct, balance);

  if (depositAmount <= 0) {
    logger.info(`⏭️  Skipping yield – no ${opp.tokenIn} to deposit`);
    return;
  }

  try {
    await retry(async () => {
      const escrow: EscrowParams = {
        initiator: wallet.address,
        counterpart: opp.counterparty,
        tokenIn: opp.tokenIn,
        amountIn: depositAmount,
      };

      const escrowId = await sdk.escrow.createEscrow(escrow);
      logger.info(`🔒 Escrow for yield deposit: ${escrowId}`);

      await sdk.yieldModule.stake({
        escrowId,
        poolId: opp.poolId!,
        amount: depositAmount,
      });

      logger.info(
        `🌾 Yield deposited: ${depositAmount.toFixed(2)} ${opp.tokenIn} into ${opp.poolId} (APY ${((opp.apy || 0) * 100).toFixed(2)}%)`
      );

      stats.yieldDeposits++;
      stats.totalVolumeIn += depositAmount;
    });
  } catch (e) {
    logger.error(`Yield deposit failed: ${e}`);
  }
}
