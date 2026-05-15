import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', '..', 'data', 'marketplace.db');

let db: Database.Database;

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    initializeSchema(db);
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
  }
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS verifiers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      public_key TEXT NOT NULL,
      staked_amount REAL NOT NULL DEFAULT 0,
      reputation_score REAL NOT NULL DEFAULT 100.0,
      total_attestations INTEGER NOT NULL DEFAULT 0,
      successful_attestations INTEGER NOT NULL DEFAULT 0,
      disputed_attestations INTEGER NOT NULL DEFAULT 0,
      registered_at TEXT NOT NULL DEFAULT (datetime('now')),
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS attestations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      subject TEXT NOT NULL,
      subject_hash TEXT NOT NULL,
      result TEXT NOT NULL,
      result_summary TEXT NOT NULL,
      confidence REAL NOT NULL,
      verifier_id TEXT NOT NULL,
      verifier_signature TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      royalty_per_access REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      access_count INTEGER NOT NULL DEFAULT 0,
      disputed INTEGER NOT NULL DEFAULT 0,
      dispute_reason TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      UNIQUE(subject_hash, verifier_id),
      FOREIGN KEY (verifier_id) REFERENCES verifiers(id)
    );

    CREATE INDEX IF NOT EXISTS idx_attestations_type ON attestations(type);
    CREATE INDEX IF NOT EXISTS idx_attestations_subject_hash ON attestations(subject_hash);
    CREATE INDEX IF NOT EXISTS idx_attestations_verifier ON attestations(verifier_id);
    CREATE INDEX IF NOT EXISTS idx_attestations_confidence ON attestations(confidence);
    CREATE INDEX IF NOT EXISTS idx_attestations_price ON attestations(price);
    CREATE INDEX IF NOT EXISTS idx_attestations_created ON attestations(created_at);

    CREATE TABLE IF NOT EXISTS staking_events (
      id TEXT PRIMARY KEY,
      verifier_id TEXT NOT NULL,
      amount REAL NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('stake', 'unstake', 'slash')),
      reason TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (verifier_id) REFERENCES verifiers(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      attestation_id TEXT NOT NULL,
      buyer_id TEXT NOT NULL,
      verifier_id TEXT NOT NULL,
      amount REAL NOT NULL,
      marketplace_fee REAL NOT NULL,
      verifier_payout REAL NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (attestation_id) REFERENCES attestations(id),
      FOREIGN KEY (verifier_id) REFERENCES verifiers(id)
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_buyer ON transactions(buyer_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);

    CREATE TABLE IF NOT EXISTS access_log (
      id TEXT PRIMARY KEY,
      attestation_id TEXT NOT NULL,
      buyer_id TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (attestation_id) REFERENCES attestations(id)
    );
  `);
}

export function resetDatabase(): void {
  const database = getDatabase();
  database.exec(`
    DELETE FROM access_log;
    DELETE FROM transactions;
    DELETE FROM staking_events;
    DELETE FROM attestations;
    DELETE FROM verifiers;
  `);
}
