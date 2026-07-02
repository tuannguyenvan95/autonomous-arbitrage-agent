// src/identity.ts
import * as crypto from "crypto";
import { SphereSDK, Wallet } from "./sdk";
import { config } from "./config";
import { logger, retry } from "./utils";

/**
 * Initialize the agent's on-chain identity:
 *  1. Derive or generate a wallet from a private key.
 *  2. Register a human-readable Nametag.
 *  3. Ensure the wallet has sufficient testnet funds via the faucet.
 */
export async function initIdentity(): Promise<{
  sdk: SphereSDK;
  wallet: Wallet;
  nametag: string;
}> {
  const sdk = new SphereSDK({ rpcUrl: config.rpcUrl });

  // Use env key or generate a random one for demo
  const privateKey =
    process.env.AGENT_PRIVATE_KEY || crypto.randomBytes(32).toString("hex");

  const wallet = await sdk.wallet.fromPrivateKey(privateKey);

  // Register a nametag (human-readable identity on Sphere)
  const nametag = process.env.AGENT_NAMETAG || `arb-agent-${Date.now()}`;
  try {
    await sdk.identity.registerNametag({ wallet, nametag });
    logger.info(`Nametag registered: ${nametag}`);
  } catch (e: any) {
    if (e.message?.includes("already registered")) {
      logger.info(`Nametag already owned: ${nametag}`);
    } else {
      throw e;
    }
  }

  // Fund wallet from testnet faucet
  const balance = await sdk.wallet.getBalance({ wallet, token: "UTEST" });
  if (balance < config.initialFunding) {
    logger.info(
      `Balance ${balance} UTEST below threshold, requesting faucet funds…`
    );
    await retry(async () => {
      const result = await sdk.faucet.request(
        wallet.address,
        config.initialFunding
      );
      logger.info(`Faucet tx: ${result.txId}`);
    });
  }

  const newBalance = await sdk.wallet.getBalance({ wallet, token: "UTEST" });
  logger.info(`Wallet ${wallet.address} balance: ${newBalance} UTEST`);

  return { sdk, wallet, nametag };
}
