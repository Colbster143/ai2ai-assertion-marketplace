import { getDatabase } from '../registry/database.js';
import type { MarketplaceStats, Transaction } from '../types/index.js';

interface TransRow {
  id: string;
  attestation_id: string;
  buyer_id: string;
  verifier_id: string;
  amount: number;
  marketplace_fee: number;
  verifier_payout: number;
  timestamp: string;
}

export function getMarketplaceStats(): MarketplaceStats {
  const db = getDatabase();

  const stats = db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM attestations) as total_attestations,
        (SELECT COUNT(*) FROM verifiers) as total_verifiers,
        (SELECT COUNT(*) FROM transactions) as total_transactions,
        (SELECT COALESCE(SUM(amount), 0) FROM transactions) as total_volume,
        (SELECT COALESCE(SUM(marketplace_fee), 0) FROM transactions) as total_fees,
        (SELECT COUNT(*) FROM attestations WHERE disputed = 0 AND (expires_at IS NULL OR expires_at > datetime('now'))) as active_attestations,
        (SELECT COALESCE(AVG(price), 0) FROM attestations WHERE disputed = 0 AND (expires_at IS NULL OR expires_at > datetime('now'))) as average_price
    `)
    .get() as {
    total_attestations: number;
    total_verifiers: number;
    total_transactions: number;
    total_volume: number;
    total_fees: number;
    active_attestations: number;
    average_price: number;
  };

  const topRows = db
    .prepare(
      'SELECT id, name, reputation_score FROM verifiers WHERE active = 1 ORDER BY reputation_score DESC LIMIT 10'
    )
    .all() as { id: string; name: string; reputation_score: number }[];

  return {
    totalAttestations: stats.total_attestations,
    totalVerifiers: stats.total_verifiers,
    totalTransactions: stats.total_transactions,
    totalVolume: stats.total_volume,
    totalFees: stats.total_fees,
    activeAttestations: stats.active_attestations,
    averagePrice: stats.average_price,
    topVerifiers: topRows.map((r) => ({
      id: r.id,
      name: r.name,
      reputationScore: r.reputation_score,
    })),
  };
}

export function getRecentTransactions(limit = 50): Transaction[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM transactions ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as TransRow[];

  return rows.map((r) => ({
    id: r.id,
    attestationId: r.attestation_id,
    buyerId: r.buyer_id,
    verifierId: r.verifier_id,
    amount: r.amount,
    marketplaceFee: r.marketplace_fee,
    verifierPayout: r.verifier_payout,
    timestamp: r.timestamp,
  }));
}

export function getBuyerHistory(buyerId: string): Transaction[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM transactions WHERE buyer_id = ? ORDER BY timestamp DESC')
    .all(buyerId) as TransRow[];

  return rows.map((r) => ({
    id: r.id,
    attestationId: r.attestation_id,
    buyerId: r.buyer_id,
    verifierId: r.verifier_id,
    amount: r.amount,
    marketplaceFee: r.marketplace_fee,
    verifierPayout: r.verifier_payout,
    timestamp: r.timestamp,
  }));
}

export function calculateDynamicPrice(
  basePrice: number,
  accessCount: number,
  verifierReputation: number,
  daysSinceCreation: number
): number {
  const demandMultiplier = Math.max(1, Math.log10(accessCount + 1) * 0.5 + 1);
  const reputationMultiplier = Math.max(0.5, verifierReputation / 100);
  const ageDiscount = Math.max(0.3, Math.exp(-daysSinceCreation / 90));
  return Math.round(basePrice * demandMultiplier * reputationMultiplier * ageDiscount * 100) / 100;
}
