import { v4 as uuid } from 'uuid';
import { getDatabase } from './database.js';
import { getOrCreateWallet } from '../payments/wallets.js';
import type { Verifier, StakingEvent } from '../types/index.js';

interface VerifierRow {
  id: string;
  name: string;
  endpoint: string;
  public_key: string;
  staked_amount: number;
  reputation_score: number;
  total_attestations: number;
  successful_attestations: number;
  disputed_attestations: number;
  registered_at: string;
  active: number;
}

function rowToVerifier(row: VerifierRow): Verifier {
  return {
    id: row.id,
    name: row.name,
    endpoint: row.endpoint,
    publicKey: row.public_key,
    stakedAmount: row.staked_amount,
    reputationScore: row.reputation_score,
    totalAttestations: row.total_attestations,
    successfulAttestations: row.successful_attestations,
    disputedAttestations: row.disputed_attestations,
    registeredAt: row.registered_at,
    active: row.active === 1,
  };
}

export function registerVerifier(params: {
  name: string;
  endpoint: string;
  publicKey: string;
  initialStake: number;
}): Verifier {
  const db = getDatabase();
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO verifiers (id, name, endpoint, public_key, staked_amount,
      registered_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, params.name, params.endpoint, params.publicKey, params.initialStake, now);

  logStakingEvent(id, params.initialStake, 'stake', 'Initial verifier stake');

  getOrCreateWallet(id, 'verifier');

  return getVerifier(id)!;
}

export function getVerifier(id: string): Verifier | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM verifiers WHERE id = ?').get(id) as
    | VerifierRow
    | undefined;
  return row ? rowToVerifier(row) : null;
}

export function listVerifiers(activeOnly = true): Verifier[] {
  const db = getDatabase();
  const query = activeOnly
    ? 'SELECT * FROM verifiers WHERE active = 1 ORDER BY reputation_score DESC'
    : 'SELECT * FROM verifiers ORDER BY reputation_score DESC';
  const rows = db.prepare(query).all() as VerifierRow[];
  return rows.map(rowToVerifier);
}

export function stake(verifierId: string, amount: number): Verifier {
  const db = getDatabase();
  const verifier = getVerifier(verifierId);
  if (!verifier) throw new Error(`Verifier not found: ${verifierId}`);
  if (!verifier.active) throw new Error(`Verifier is inactive: ${verifierId}`);

  db.prepare('UPDATE verifiers SET staked_amount = staked_amount + ? WHERE id = ?').run(
    amount,
    verifierId
  );

  logStakingEvent(verifierId, amount, 'stake', 'Additional stake');
  return getVerifier(verifierId)!;
}

export function unstake(verifierId: string, amount: number): Verifier {
  const db = getDatabase();
  const verifier = getVerifier(verifierId);
  if (!verifier) throw new Error(`Verifier not found: ${verifierId}`);

  if (verifier.stakedAmount - amount < 0) {
    throw new Error(
      `Insufficient stake. Current: ${verifier.stakedAmount}, requested: ${amount}`
    );
  }

  db.prepare('UPDATE verifiers SET staked_amount = staked_amount - ? WHERE id = ?').run(
    amount,
    verifierId
  );

  logStakingEvent(verifierId, amount, 'unstake', 'Unstake requested');
  return getVerifier(verifierId)!;
}

export function slash(verifierId: string, amount: number, reason: string): Verifier {
  const db = getDatabase();
  const verifier = getVerifier(verifierId);
  if (!verifier) throw new Error(`Verifier not found: ${verifierId}`);

  const slashAmount = Math.min(amount, verifier.stakedAmount);

  db.prepare('UPDATE verifiers SET staked_amount = staked_amount - ? WHERE id = ?').run(
    slashAmount,
    verifierId
  );

  db.prepare(`
    UPDATE verifiers
    SET reputation_score = MAX(0, reputation_score - 10.0),
        active = CASE WHEN staked_amount <= 0 THEN 0 ELSE active END
    WHERE id = ?
  `).run(verifierId);

  logStakingEvent(verifierId, slashAmount, 'slash', reason);
  return getVerifier(verifierId)!;
}

export function updateReputation(
  verifierId: string,
  delta: number
): Verifier {
  const db = getDatabase();
  db.prepare(`
    UPDATE verifiers
    SET reputation_score = MAX(0, MIN(1000, reputation_score + ?))
    WHERE id = ?
  `).run(delta, verifierId);

  return getVerifier(verifierId)!;
}

export function deactivateVerifier(verifierId: string): Verifier {
  const db = getDatabase();
  db.prepare('UPDATE verifiers SET active = 0 WHERE id = ?').run(verifierId);
  return getVerifier(verifierId)!;
}

export function activateVerifier(verifierId: string): Verifier {
  const db = getDatabase();
  db.prepare('UPDATE verifiers SET active = 1 WHERE id = ?').run(verifierId);
  return getVerifier(verifierId)!;
}

function logStakingEvent(
  verifierId: string,
  amount: number,
  action: 'stake' | 'unstake' | 'slash',
  reason: string
): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO staking_events (id, verifier_id, amount, action, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuid(), verifierId, amount, action, reason);
}

export function getStakingHistory(verifierId: string): StakingEvent[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      'SELECT * FROM staking_events WHERE verifier_id = ? ORDER BY timestamp DESC'
    )
    .all(verifierId) as {
    id: string;
    verifier_id: string;
    amount: number;
    action: 'stake' | 'unstake' | 'slash';
    reason: string;
    timestamp: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    verifierId: r.verifier_id,
    amount: r.amount,
    action: r.action,
    reason: r.reason,
    timestamp: r.timestamp,
  }));
}

export function getTopVerifiers(limit = 10): Verifier[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      'SELECT * FROM verifiers WHERE active = 1 ORDER BY reputation_score DESC LIMIT ?'
    )
    .all(limit) as VerifierRow[];
  return rows.map(rowToVerifier);
}
