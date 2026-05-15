import { v4 as uuid } from 'uuid';
import { createHash } from 'crypto';
import { getDatabase } from './database.js';
import type {
  Attestation,
  AttestationQuery,
  AttestationType,
  QueryResult,
} from '../types/index.js';

interface AttestationRow {
  id: string;
  type: string;
  subject: string;
  subject_hash: string;
  result: string;
  result_summary: string;
  confidence: number;
  verifier_id: string;
  verifier_signature: string;
  price: number;
  royalty_per_access: number;
  created_at: string;
  expires_at: string | null;
  access_count: number;
  disputed: number;
  dispute_reason: string | null;
  metadata: string;
}

function rowToAttestation(row: AttestationRow): Attestation {
  return {
    id: row.id,
    type: row.type as AttestationType,
    subject: row.subject,
    subjectHash: row.subject_hash,
    result: row.result,
    resultSummary: row.result_summary,
    confidence: row.confidence,
    verifierId: row.verifier_id,
    verifierSignature: row.verifier_signature,
    price: row.price,
    royaltyPerAccess: row.royalty_per_access,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    accessCount: row.access_count,
    disputed: row.disputed === 1,
    disputeReason: row.dispute_reason,
    metadata: JSON.parse(row.metadata || '{}'),
  };
}

export function hashSubject(subject: string): string {
  return createHash('sha256').update(subject).digest('hex');
}

export function submitAttestation(params: {
  type: AttestationType;
  subject: string;
  result: string;
  resultSummary: string;
  confidence: number;
  verifierId: string;
  price: number;
  royaltyPerAccess: number;
  expiresInSeconds: number | null;
  metadata: Record<string, unknown>;
}): Attestation {
  const db = getDatabase();
  const id = uuid();
  const subjectHash = hashSubject(params.subject);
  const now = new Date().toISOString();
  const expiresAt = params.expiresInSeconds
    ? new Date(Date.now() + params.expiresInSeconds * 1000).toISOString()
    : null;
  const signature = createHash('sha256')
    .update(`${params.verifierId}:${subjectHash}:${params.result}:${now}`)
    .digest('hex');

  const existing = db
    .prepare('SELECT id FROM attestations WHERE subject_hash = ? AND verifier_id = ?')
    .get(subjectHash, params.verifierId) as { id: string } | undefined;

  if (existing) {
    throw new Error(
      `Attestation already exists for this subject by this verifier. Existing ID: ${existing.id}`
    );
  }

  db.prepare(`
    INSERT INTO attestations (id, type, subject, subject_hash, result, result_summary,
      confidence, verifier_id, verifier_signature, price, royalty_per_access,
      created_at, expires_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, params.type, params.subject, subjectHash, params.result,
    params.resultSummary, params.confidence, params.verifierId, signature,
    params.price, params.royaltyPerAccess, now, expiresAt,
    JSON.stringify(params.metadata)
  );

  db.prepare(`
    UPDATE verifiers
    SET total_attestations = total_attestations + 1,
        successful_attestations = successful_attestations + 1
    WHERE id = ?
  `).run(params.verifierId);

  return getAttestation(id)!;
}

export function getAttestation(id: string): Attestation | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM attestations WHERE id = ?').get(id) as
    | AttestationRow
    | undefined;
  return row ? rowToAttestation(row) : null;
}

export function queryAttestations(query: AttestationQuery): QueryResult {
  const db = getDatabase();
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];

  if (query.type) {
    conditions.push('a.type = ?');
    params.push(query.type);
  }

  if (query.subjectHash) {
    conditions.push('a.subject_hash = ?');
    params.push(query.subjectHash);
  } else if (query.subject) {
    conditions.push('a.subject_hash = ?');
    params.push(hashSubject(query.subject));
  }

  if (query.verifierId) {
    conditions.push('a.verifier_id = ?');
    params.push(query.verifierId);
  }

  if (query.minConfidence !== undefined) {
    conditions.push('a.confidence >= ?');
    params.push(query.minConfidence);
  }

  if (query.maxPrice !== undefined) {
    conditions.push('a.price <= ?');
    params.push(query.maxPrice);
  }

  conditions.push("(a.expires_at IS NULL OR a.expires_at > datetime('now'))");
  conditions.push('a.disputed = 0');

  const whereClause = conditions.join(' AND ');
  const sortBy = query.sortBy || 'confidence';
  const sortColumn =
    sortBy === 'reputation' ? 'v.reputation_score' : `a.${sortBy}`;
  const sortDir = query.sortOrder === 'asc' ? 'ASC' : 'DESC';
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;

  const countRow = db
    .prepare(
      `SELECT COUNT(*) as total FROM attestations a
       LEFT JOIN verifiers v ON a.verifier_id = v.id
       WHERE ${whereClause}`
    )
    .get(...params) as { total: number };

  const rows = db
    .prepare(
      `SELECT a.* FROM attestations a
       LEFT JOIN verifiers v ON a.verifier_id = v.id
       WHERE ${whereClause}
       ORDER BY ${sortColumn} COLLATE NOCASE ${sortDir}
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as AttestationRow[];

  const attestations = rows.map(rowToAttestation);
  const prices = attestations.map((a) => a.price);

  return {
    attestations,
    total: countRow.total,
    queryCost: 0,
    cheapestPrice: prices.length > 0 ? Math.min(...prices) : null,
    averagePrice:
      prices.length > 0
        ? prices.reduce((sum, p) => sum + p, 0) / prices.length
        : null,
  };
}

export function purchaseAttestation(
  attestationId: string,
  buyerId: string
): { attestation: Attestation; transactionId: string } {
  const db = getDatabase();
  const attestation = getAttestation(attestationId);

  if (!attestation) {
    throw new Error(`Attestation not found: ${attestationId}`);
  }

  if (attestation.disputed) {
    throw new Error(`Attestation is disputed: ${attestationId}`);
  }

  if (attestation.expiresAt && new Date(attestation.expiresAt) < new Date()) {
    throw new Error(`Attestation has expired: ${attestationId}`);
  }

  const transactionId = uuid();
  const marketplaceFee = attestation.price * 0.10;
  const verifierPayout = attestation.price - marketplaceFee;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO transactions (id, attestation_id, buyer_id, verifier_id,
      amount, marketplace_fee, verifier_payout, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    transactionId, attestationId, buyerId, attestation.verifierId,
    attestation.price, marketplaceFee, verifierPayout, now
  );

  db.prepare(`
    UPDATE attestations SET access_count = access_count + 1 WHERE id = ?
  `).run(attestationId);

  db.prepare(`
    INSERT INTO access_log (id, attestation_id, buyer_id, timestamp)
    VALUES (?, ?, ?, ?)
  `).run(uuid(), attestationId, buyerId, now);

  if (attestation.royaltyPerAccess > 0) {
    db.prepare(`
      UPDATE verifiers
      SET staked_amount = staked_amount + ?
      WHERE id = ?
    `).run(attestation.royaltyPerAccess, attestation.verifierId);
  }

  return { attestation, transactionId };
}

export function disputeAttestation(
  attestationId: string,
  reason: string
): Attestation {
  const db = getDatabase();
  const attestation = getAttestation(attestationId);

  if (!attestation) {
    throw new Error(`Attestation not found: ${attestationId}`);
  }

  db.prepare(`
    UPDATE attestations SET disputed = 1, dispute_reason = ? WHERE id = ?
  `).run(reason, attestationId);

  db.prepare(`
    UPDATE verifiers
    SET disputed_attestations = disputed_attestations + 1,
        reputation_score = MAX(0, reputation_score - 5.0)
    WHERE id = ?
  `).run(attestation.verifierId);

  const updated = getAttestation(attestationId)!;
  return updated;
}

export function getAttestationsByVerifier(verifierId: string): Attestation[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM attestations WHERE verifier_id = ? ORDER BY created_at DESC')
    .all(verifierId) as AttestationRow[];
  return rows.map(rowToAttestation);
}

export function getActiveAttestationCount(): number {
  const db = getDatabase();
  const row = db
    .prepare(
      "SELECT COUNT(*) as count FROM attestations WHERE disputed = 0 AND (expires_at IS NULL OR expires_at > datetime('now'))"
    )
    .get() as { count: number };
  return row.count;
}

export function expireOldAttestations(): number {
  const db = getDatabase();
  const result = db
    .prepare(
      "UPDATE attestations SET disputed = 1, dispute_reason = 'expired' WHERE expires_at IS NOT NULL AND expires_at <= datetime('now') AND disputed = 0"
    )
    .run();
  return result.changes;
}
