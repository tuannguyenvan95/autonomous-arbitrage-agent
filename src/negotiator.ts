// src/negotiator.ts
import { EventEmitter } from "events";
import { logger } from "./utils";

/**
 * Simulates P2P negotiation between agents via Nostr-style DMs.
 *
 * In production this would connect to a Nostr relay and exchange
 * signed encrypted messages. For the testnet prototype we simulate
 * the accept/reject flow with random outcomes.
 */
export class Negotiator extends EventEmitter {
  private pendingProposals: Map<
    string,
    { counterparty: string; payload: any; timestamp: number }
  > = new Map();

  constructor() {
    super();
  }

  /**
   * Send a swap/yield proposal to a counterparty.
   * In production: publish a kind-4 Nostr DM.
   */
  async propose(counterpartyPubKey: string, payload: any): Promise<string> {
    const proposalId = `prop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    this.pendingProposals.set(proposalId, {
      counterparty: counterpartyPubKey,
      payload,
      timestamp: Date.now(),
    });

    logger.info(
      `📤 Proposal ${proposalId} sent to ${counterpartyPubKey.slice(0, 12)}…`
    );

    return proposalId;
  }

  /**
   * Listen for replies from a specific counterparty.
   * Simulates a random accept/reject after a short delay.
   */
  listen(counterpartyPubKey: string, proposalId: string): void {
    // Simulate network latency (500–2000 ms)
    const latency = 500 + Math.random() * 1500;

    setTimeout(() => {
      // 70% acceptance rate for demo purposes
      const accepted = Math.random() < 0.7;
      const proposal = this.pendingProposals.get(proposalId);

      if (accepted) {
        logger.info(
          `✅ Counterparty ${counterpartyPubKey.slice(0, 12)}… accepted proposal ${proposalId}`
        );
        this.emit("accepted", proposalId, proposal?.payload);
      } else {
        logger.info(
          `❌ Counterparty ${counterpartyPubKey.slice(0, 12)}… rejected proposal ${proposalId}`
        );
        this.emit("rejected", proposalId, proposal?.payload);
      }

      this.pendingProposals.delete(proposalId);
    }, latency);
  }

  /**
   * Get count of pending proposals.
   */
  get pendingCount(): number {
    return this.pendingProposals.size;
  }
}
