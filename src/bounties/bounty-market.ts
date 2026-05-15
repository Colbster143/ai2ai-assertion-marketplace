import { v4 as uuid } from 'uuid';
import { getDatabase } from '../registry/database.js';
import { submitAttestation } from '../registry/attestations.js';
import { getVerifier } from '../registry/verifiers.js';
import { getOrCreateWalletSync, transferInternal } from '../payments/wallets.js';
import type { AttestationType } from '../types/index.js';

export interface Bounty {
  id: string;
  type: AttestationType;
  subject: string;
  subjectHash: string;
  reward: number;
  postedBy: string;
  fulfilledBy: string | null;
  attestationId: string | null;
  status: 'open' | 'claimed' | 'fulfilled' | 'expired' | 'cancelled';
  createdAt: string;
  expiresAt: string;
  claimedAt: string | null;
}

interface BountyRow {
  id: string;
  type: string;
  subject: string;
  subject_hash: string;
  reward: number;
  posted_by: string;
  fulfilled_by: string | null;
  attestation_id: string | null;
  status: string;
  created_at: string;
  expires_at: string;
  claimed_at: string | null;
}

function initBountyTables(): void {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS bounties (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      subject TEXT NOT NULL,
      subject_hash TEXT NOT NULL,
      reward INTEGER NOT NULL,
      posted_by TEXT NOT NULL,
      fulfilled_by TEXT,
      attestation_id TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'claimed', 'fulfilled', 'expired', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      claimed_at TEXT,
      FOREIGN KEY (attestation_id) REFERENCES attestations(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bounties_status ON bounties(status);
    CREATE INDEX IF NOT EXISTS idx_bounties_type ON bounties(type);
    CREATE INDEX IF NOT EXISTS idx_bounties_subject_hash ON bounties(subject_hash);
  `);
}

function rowToBounty(row: BountyRow): Bounty {
  return {
    id: row.id,
    type: row.type as AttestationType,
    subject: row.subject,
    subjectHash: row.subject_hash,
    reward: row.reward,
    postedBy: row.posted_by,
    fulfilledBy: row.fulfilled_by,
    attestationId: row.attestation_id,
    status: row.status as Bounty['status'],
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    claimedAt: row.claimed_at,
  };
}

export function postBounty(params: {
  type: AttestationType;
  subject: string;
  subjectHash: string;
  reward: number;
  postedBy: string;
  expiresInSeconds?: number;
}): Bounty {
  initBountyTables();
  const db = getDatabase();

  const posterWallet = getOrCreateWalletSync(params.postedBy, 'buyer');
  if (posterWallet.balance < params.reward) {
    throw new Error(
      `Insufficient balance to fund bounty. Have ${posterWallet.balance}, need ${params.reward}. Deposit via create_deposit_invoice.`
    );
  }

  const escrowResult = transferInternal(params.postedBy, 'marketplace', params.reward);
  if (!escrowResult.success) {
    throw new Error(`Failed to escrow bounty funds: ${escrowResult.error}`);
  }

  const id = uuid();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + (params.expiresInSeconds || 86400 * 7) * 1000).toISOString();

  db.prepare(`
    INSERT INTO bounties (id, type, subject, subject_hash, reward, posted_by,
      status, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)
  `).run(
    id, params.type, params.subject, params.subjectHash, params.reward,
    params.postedBy, now, expiresAt
  );

  return getBounty(id)!;
}

export function getBounty(id: string): Bounty | null {
  initBountyTables();
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM bounties WHERE id = ?').get(id) as BountyRow | undefined;
  return row ? rowToBounty(row) : null;
}

export function listOpenBounties(type?: AttestationType, limit = 50): Bounty[] {
  initBountyTables();
  const db = getDatabase();

  let query = "SELECT * FROM bounties WHERE status = 'open' AND expires_at > datetime('now')";
  const params: unknown[] = [];

  if (type) {
    query += ' AND type = ?';
    params.push(type);
  }

  query += ' ORDER BY reward DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(query).all(...params) as BountyRow[];
  return rows.map(rowToBounty);
}

export function claimBounty(bountyId: string, verifierId: string): Bounty {
  initBountyTables();
  const db = getDatabase();

  const bounty = getBounty(bountyId);
  if (!bounty) throw new Error(`Bounty not found: ${bountyId}`);
  if (bounty.status !== 'open') throw new Error(`Bounty is not open: ${bountyId}`);
  if (new Date(bounty.expiresAt) < new Date()) throw new Error(`Bounty expired: ${bountyId}`);

  const verifier = getVerifier(verifierId);
  if (!verifier) throw new Error(`Verifier not found: ${verifierId}`);
  if (!verifier.active) throw new Error(`Verifier inactive: ${verifierId}`);

  if (verifier.stakedAmount < bounty.reward * 10) {
    throw new Error(
      `Insufficient stake. Need ${bounty.reward * 10} (10x reward). Have ${verifier.stakedAmount}.`
    );
  }

  db.prepare(`
    UPDATE bounties SET status = 'claimed', fulfilled_by = ?, claimed_at = datetime('now')
    WHERE id = ?
  `).run(verifierId, bountyId);

  return getBounty(bountyId)!;
}

export function fulfillBounty(
  bountyId: string,
  result: string,
  resultSummary: string,
  confidence: number
): { bounty: Bounty; attestation: ReturnType<typeof submitAttestation> } {
  initBountyTables();
  const bounty = getBounty(bountyId);
  if (!bounty) throw new Error(`Bounty not found: ${bountyId}`);
  if (bounty.status !== 'claimed') throw new Error(`Bounty must be claimed first: ${bountyId}`);
  if (!bounty.fulfilledBy) throw new Error(`Bounty has no assigned verifier`);

  const attestation = submitAttestation({
    type: bounty.type,
    subject: bounty.subject,
    result,
    resultSummary,
    confidence,
    verifierId: bounty.fulfilledBy,
    price: Math.round(bounty.reward * 0.1),
    royaltyPerAccess: Math.round(bounty.reward * 0.01),
    expiresInSeconds: null,
    metadata: { bountyId: bounty.id, source: 'bounty_fulfillment' },
  });

  const db = getDatabase();
  db.prepare(`
    UPDATE bounties SET status = 'fulfilled', attestation_id = ?, fulfilled_by = ?
    WHERE id = ?
  `).run(attestation.id, bounty.fulfilledBy, bountyId);

  transferInternal('marketplace', bounty.fulfilledBy, bounty.reward);

  return { bounty: getBounty(bountyId)!, attestation };
}

export function cancelBounty(bountyId: string, requestedBy: string): Bounty {
  initBountyTables();
  const bounty = getBounty(bountyId);
  if (!bounty) throw new Error(`Bounty not found: ${bountyId}`);
  if (bounty.status !== 'open') throw new Error(`Only open bounties can be cancelled`);
  if (bounty.postedBy !== requestedBy) throw new Error(`Only the poster can cancel`);

  const db = getDatabase();
  db.prepare("UPDATE bounties SET status = 'cancelled' WHERE id = ?").run(bountyId);

  transferInternal('marketplace', bounty.postedBy, bounty.reward);

  return getBounty(bountyId)!;
}

export function getBountiesByPoster(posterId: string): Bounty[] {
  initBountyTables();
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM bounties WHERE posted_by = ? ORDER BY created_at DESC')
    .all(posterId) as BountyRow[];
  return rows.map(rowToBounty);
}
