// src/config.ts
import dotenv from "dotenv";
dotenv.config();

/**
 * Central configuration for the Autonomous Arbitrage Agent.
 * Values can be overridden via environment variables.
 */
export const config = {
  // Network endpoints (Testnet v2 URLs)
  rpcUrl: process.env.RPC_URL || "https://testnet.unicity.network/rpc",
  faucetUrl: process.env.FAUCET_URL || "https://testnet.unicity.network/faucet",

  // Scanning intervals (in milliseconds)
  marketPollInterval: Number(process.env.POLL_INTERVAL) || 8_000,

  // Economic thresholds
  minArbSpread: Number(process.env.MIN_ARB_SPREAD) || 0.005, // 0.5%
  minYield: Number(process.env.MIN_YIELD) || 0.001, // 0.1% APY
  maxExposurePct: Number(process.env.MAX_EXPOSURE) || 0.2, // 20% of treasury per trade

  // Initial faucet funding
  initialFunding: 10_000,

  // Logging
  logLevel: (process.env.LOG_LEVEL || "info") as "info" | "warn" | "error" | "debug",
};
