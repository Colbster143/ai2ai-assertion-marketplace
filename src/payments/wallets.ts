import { v4 as uuid } from 'uuid';
import { getDatabase } from '../registry/database.js';
import { getLNBitsClient, isLightningConfigured } from './lnbits.js';
import type { LightningInvoice, InternalWallet, PaymentResult } from './types.js';

interface WalletRow {
  id: string;
  owner_id: string;
  owner_type: string;
  balance: number;
  lnbits_wallet_id: string | null;
  lnbits_admin_key: string | null;
  lnbits_invoice_key: string | null;
  created_at: string;
}

interface InvoiceRow {
  id: string;
  payment_hash: string;
  payment_request: string;
  amount: number;
  memo: string;
  status: string;
  wallet_id: string;
  metadata: string;
  created_at: string;
  paid_at: string | null;
}

function rowToInternalWallet(row: WalletRow): InternalWallet {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerType: row.owner_type as 'verifier' | 'buyer',
    balance: row.balance,
    lnbitsWalletId: row.lnbits_wallet_id,
    lnbitsAdminKey: row.lnbits_admin_key,
    lnbitsInvoiceKey: row.lnbits_invoice_key,
    createdAt: row.created_at,
  };
}

function initPaymentTables(): void {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_wallets (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL UNIQUE,
      owner_type TEXT NOT NULL CHECK(owner_type IN ('verifier', 'buyer')),
      balance INTEGER NOT NULL DEFAULT 0,
      lnbits_wallet_id TEXT,
      lnbits_admin_key TEXT,
      lnbits_invoice_key TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payment_invoices (
      id TEXT PRIMARY KEY,
      payment_hash TEXT NOT NULL UNIQUE,
      payment_request TEXT NOT NULL,
      amount INTEGER NOT NULL,
      memo TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'expired', 'cancelled')),
      wallet_id TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_payment_invoices_hash ON payment_invoices(payment_hash);
    CREATE INDEX IF NOT EXISTS idx_payment_invoices_status ON payment_invoices(status);
    CREATE INDEX IF NOT EXISTS idx_payment_wallets_owner ON payment_wallets(owner_id);
  `);
}

export function getOrCreateWallet(ownerId: string, ownerType: 'verifier' | 'buyer'): InternalWallet {
  return getOrCreateWalletSync(ownerId, ownerType);
}

export function getOrCreateWalletSync(ownerId: string, ownerType: 'verifier' | 'buyer'): InternalWallet {
  initPaymentTables();
  const db = getDatabase();

  const existing = db
    .prepare('SELECT * FROM payment_wallets WHERE owner_id = ?')
    .get(ownerId) as WalletRow | undefined;

  if (existing) {
    return rowToInternalWallet(existing);
  }

  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO payment_wallets (id, owner_id, owner_type, balance, created_at)
    VALUES (?, ?, ?, 0, ?)
  `).run(id, ownerId, ownerType, now);

  return {
    id,
    ownerId,
    ownerType,
    balance: 0,
    lnbitsWalletId: null,
    lnbitsAdminKey: null,
    lnbitsInvoiceKey: null,
    createdAt: now,
  };
}

export async function provisionLNBitsWallet(ownerId: string): Promise<InternalWallet | null> {
  if (!isLightningConfigured()) return null;

  const wallet = getWallet(ownerId);
  if (!wallet) return null;
  if (wallet.lnbitsWalletId) return wallet;

  try {
    const lnbits = getLNBitsClient();
    const lnWallet = await lnbits.createInternalWallet(
      `${wallet.ownerType}-${ownerId.slice(0, 8)}`
    );

    const db = getDatabase();
    db.prepare(`
      UPDATE payment_wallets
      SET lnbits_wallet_id = ?, lnbits_admin_key = ?, lnbits_invoice_key = ?
      WHERE owner_id = ?
    `).run(lnWallet.id, lnWallet.adminKey, lnWallet.invoiceKey, ownerId);

    return getWallet(ownerId);
  } catch (err) {
    console.error('Failed to provision LNBits wallet:', err);
    return null;
  }
}

export function getWallet(ownerId: string): InternalWallet | null {
  initPaymentTables();
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM payment_wallets WHERE owner_id = ?')
    .get(ownerId) as WalletRow | undefined;
  return row ? rowToInternalWallet(row) : null;
}

export function getBalance(ownerId: string): number {
  const wallet = getWallet(ownerId);
  return wallet?.balance ?? 0;
}

export async function createDepositInvoice(
  ownerId: string,
  ownerType: 'verifier' | 'buyer',
  amount: number,
  memo: string
): Promise<LightningInvoice> {
  initPaymentTables();

  if (!isLightningConfigured()) {
    throw new Error('Lightning payments not configured. Set LNBITS_ADMIN_KEY.');
  }

  const lnbits = getLNBitsClient();
  const invoice = await lnbits.createInvoice(amount, memo);

  const wallet = getWallet(ownerId);
  const walletId = wallet?.id || 'external';
  const db = getDatabase();

  db.prepare(`
    INSERT INTO payment_invoices (id, payment_hash, payment_request, amount, memo,
      status, wallet_id, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(
    uuid(), invoice.paymentHash, invoice.paymentRequest, amount, memo,
    walletId, JSON.stringify({ ownerId, ownerType }), new Date().toISOString()
  );

  return invoice;
}

export async function confirmDeposit(paymentHash: string): Promise<PaymentResult> {
  initPaymentTables();
  const db = getDatabase();

  const invRow = db
    .prepare("SELECT * FROM payment_invoices WHERE payment_hash = ? AND status = 'pending'")
    .get(paymentHash) as InvoiceRow | undefined;

  if (!invRow) {
    return { success: false, error: 'Invoice not found or already processed' };
  }

  if (!isLightningConfigured()) {
    const metadata = JSON.parse(invRow.metadata);
    const wallet = getOrCreateWalletSync(metadata.ownerId, metadata.ownerType);

    db.prepare(`
      UPDATE payment_wallets SET balance = balance + ? WHERE id = ?
    `).run(invRow.amount, wallet.id);

    db.prepare(`
      UPDATE payment_invoices SET status = 'paid', paid_at = datetime('now')
      WHERE payment_hash = ?
    `).run(paymentHash);

    return {
      success: true,
      transactionId: uuid(),
      newBalance: wallet.balance + invRow.amount,
    };
  }

  const lnbits = getLNBitsClient();
  const paid = await lnbits.checkInvoice(paymentHash);

  if (!paid) {
    return { success: false, error: 'Invoice not yet paid' };
  }

  const metadata = JSON.parse(invRow.metadata);
  const wallet = getOrCreateWalletSync(metadata.ownerId, metadata.ownerType);

  db.prepare(`
    UPDATE payment_wallets SET balance = balance + ? WHERE id = ?
  `).run(invRow.amount, wallet.id);

  db.prepare(`
    UPDATE payment_invoices SET status = 'paid', paid_at = datetime('now')
    WHERE payment_hash = ?
  `).run(paymentHash);

  const newBalance = (getWallet(metadata.ownerId)?.balance ?? 0);

  return {
    success: true,
    transactionId: uuid(),
    newBalance,
  };
}

export async function transferInternally(
  fromOwnerId: string,
  toOwnerId: string,
  amount: number,
  description: string
): Promise<PaymentResult> {
  initPaymentTables();
  const db = getDatabase();

  const fromWallet = getWallet(fromOwnerId);
  if (!fromWallet) {
    return { success: false, error: `Sender wallet not found: ${fromOwnerId}` };
  }

  if (fromWallet.balance < amount) {
    return {
      success: false,
      error: `Insufficient balance. Have ${fromWallet.balance}, need ${amount}.`,
    };
  }

  const toWallet = getOrCreateWalletSync(toOwnerId, 'verifier');

  db.prepare('UPDATE payment_wallets SET balance = balance - ? WHERE owner_id = ?').run(
    amount,
    fromOwnerId
  );

  db.prepare('UPDATE payment_wallets SET balance = balance + ? WHERE owner_id = ?').run(
    amount,
    toOwnerId
  );

  const newBalance = (getWallet(fromOwnerId)?.balance ?? 0);

  return {
    success: true,
    transactionId: uuid(),
    newBalance,
  };
}

export function transferInternal(
  fromOwnerId: string,
  toOwnerId: string,
  amount: number
): PaymentResult {
  initPaymentTables();
  const db = getDatabase();

  const fromWallet = getWallet(fromOwnerId);
  if (!fromWallet) {
    return { success: false, error: `Sender wallet not found: ${fromOwnerId}` };
  }

  if (fromWallet.balance < amount) {
    return {
      success: false,
      error: `Insufficient balance. Have ${fromWallet.balance}, need ${amount}.`,
    };
  }

  const toWallet = getOrCreateWalletSync(toOwnerId, 'verifier');

  const txn = db.transaction(() => {
    db.prepare('UPDATE payment_wallets SET balance = balance - ? WHERE owner_id = ?').run(
      amount,
      fromOwnerId
    );
    db.prepare('UPDATE payment_wallets SET balance = balance + ? WHERE owner_id = ?').run(
      amount,
      toOwnerId
    );
  });

  txn();

  const newBalance = getWallet(fromOwnerId)?.balance ?? 0;

  return {
    success: true,
    transactionId: uuid(),
    newBalance,
  };
}

export async function withdrawFunds(
  ownerId: string,
  invoice: string,
  expectedAmount: number
): Promise<PaymentResult> {
  if (!isLightningConfigured()) {
    return { success: false, error: 'Lightning payments not configured.' };
  }

  const wallet = getWallet(ownerId);
  if (!wallet) {
    return { success: false, error: `Wallet not found: ${ownerId}` };
  }

  if (wallet.balance < expectedAmount) {
    return {
      success: false,
      error: `Insufficient balance. Have ${wallet.balance}, need ${expectedAmount}.`,
    };
  }

  const lnbits = getLNBitsClient();

  try {
    const decoded = await lnbits.decodeInvoice(invoice);
    if (decoded.amount !== expectedAmount) {
      return {
        success: false,
        error: `Invoice amount mismatch. Expected ${expectedAmount}, invoice is for ${decoded.amount}.`,
      };
    }

    await lnbits.payInvoice(invoice);

    const db = getDatabase();
    db.prepare('UPDATE payment_wallets SET balance = balance - ? WHERE owner_id = ?').run(
      expectedAmount,
      ownerId
    );

    return {
      success: true,
      transactionId: uuid(),
      newBalance: (getWallet(ownerId)?.balance ?? 0),
    };
  } catch (err) {
    return {
      success: false,
      error: `Withdrawal failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

export async function syncWalletBalances(): Promise<{ synced: number; errors: number }> {
  if (!isLightningConfigured()) {
    return { synced: 0, errors: 0 };
  }

  const db = getDatabase();
  const wallets = db
    .prepare("SELECT * FROM payment_wallets WHERE lnbits_wallet_id IS NOT NULL")
    .all() as WalletRow[];

  let synced = 0;
  let errors = 0;

  for (const row of wallets) {
    try {
      const lnbits = new (await import('./lnbits.js')).LNBitsClient(
        process.env.LNBITS_URL || 'https://legend.lnbits.com',
        row.lnbits_invoice_key || ''
      );
      const balance = await lnbits.getWalletBalance();

      db.prepare('UPDATE payment_wallets SET balance = ? WHERE id = ?').run(
        balance,
        row.id
      );
      synced++;
    } catch {
      errors++;
    }
  }

  return { synced, errors };
}
