#!/usr/bin/env tsx
import { Command } from 'commander';
import { getDatabase, resetDatabase } from '../src/registry/database.js';
import { registerVerifier, listVerifiers, getTopVerifiers } from '../src/registry/verifiers.js';
import { submitAttestation, queryAttestations, getAttestation, purchaseAttestation } from '../src/registry/attestations.js';
import { getMarketplaceStats } from '../src/marketplace/marketplace.js';
import {
  getOrCreateWallet,
  getWallet,
  createDepositInvoice,
  confirmDeposit,
  withdrawFunds,
  fundWalletDirectly,
} from '../src/payments/wallets.js';
import { isLightningConfigured } from '../src/payments/provider.js';
import { v4 as uuid } from 'uuid';

const program = new Command();

program
  .name('ai2ai')
  .description('AI2AI Assertion Marketplace CLI')
  .version('1.0.0');

// --- Database ---

program
  .command('db-init')
  .description('Initialize the database schema')
  .action(() => {
    getDatabase();
    console.log('Database initialized at data/marketplace.db');
  });

program
  .command('db-reset')
  .description('Reset the database (WARNING: deletes all data)')
  .action(() => {
    resetDatabase();
    console.log('Database reset complete');
  });

program
  .command('db-seed')
  .description('Seed the database with demo data')
  .action(() => {
    getDatabase();

    const v1 = registerVerifier({
      name: 'DeepTrust Verify',
      endpoint: 'https://deeptrust.example/verify',
      publicKey: 'ed25519:abc123def456',
      initialStake: 10000,
    });

    const v2 = registerVerifier({
      name: 'FactCheck AI',
      endpoint: 'https://factcheck.example/verify',
      publicKey: 'ed25519:ghi789jkl012',
      initialStake: 5000,
    });

    const v3 = registerVerifier({
      name: 'IdentityGuard',
      endpoint: 'https://idguard.example/verify',
      publicKey: 'ed25519:mno345pqr678',
      initialStake: 25000,
    });

    submitAttestation({
      type: 'deepfake-detection',
      subject: 'https://example.com/video/political-rally.mp4',
      result: JSON.stringify({
        isDeepfake: false,
        manipulationDetected: false,
        analysisMethod: 'ensemble-cnn-transformer',
        frameAnalysis: 'all-frames',
      }),
      resultSummary: 'Video is authentic, no deepfake manipulation detected with 0.97 confidence',
      confidence: 0.97,
      verifierId: v1.id,
      price: 0.50,
      royaltyPerAccess: 0.05,
      expiresInSeconds: 86400 * 30,
      metadata: { fileSize: '250MB', duration: '3m42s', format: 'mp4' },
    });

    submitAttestation({
      type: 'deepfake-detection',
      subject: 'https://example.com/video/celebrity-speech.mp4',
      result: JSON.stringify({
        isDeepfake: true,
        manipulationDetected: true,
        manipulationType: 'face-swap',
        confidenceBreakdown: { faceSwap: 0.94, voiceSynthesis: 0.12 },
      }),
      resultSummary: 'Deepfake detected: face-swap manipulation with 0.94 confidence',
      confidence: 0.94,
      verifierId: v1.id,
      price: 0.75,
      royaltyPerAccess: 0.07,
      expiresInSeconds: null,
      metadata: { fileSize: '180MB', duration: '2m15s', format: 'mp4' },
    });

    submitAttestation({
      type: 'fact-check',
      subject: 'Statement: "Global temperatures have risen 2.5C since 1880"',
      result: JSON.stringify({
        claim: 'Global temperatures have risen 2.5C since 1880',
        verdict: 'mostly-true',
        actualRise: 'approximately 1.2C per NASA/NOAA data',
        sources: ['NASA GISS', 'NOAA GlobalTemp', 'IPCC AR6'],
        correction: 'The rise is approximately 1.2C, not 2.5C',
      }),
      resultSummary: 'Mostly true but overstated: actual rise is ~1.2C, not 2.5C',
      confidence: 0.92,
      verifierId: v2.id,
      price: 0.10,
      royaltyPerAccess: 0.01,
      expiresInSeconds: 86400 * 90,
      metadata: { topic: 'climate', sources: 3 },
    });

    submitAttestation({
      type: 'identity-verification',
      subject: 'email:john.doe@example.com',
      result: JSON.stringify({
        verified: true,
        domainValidated: true,
        mailboxExists: true,
        disposable: false,
        riskScore: 0.02,
      }),
      resultSummary: 'Email identity verified: valid, non-disposable, low risk',
      confidence: 0.99,
      verifierId: v3.id,
      price: 0.05,
      royaltyPerAccess: 0.005,
      expiresInSeconds: null,
      metadata: { provider: 'gmail', verificationMethod: 'smtp-check' },
    });

    submitAttestation({
      type: 'document-validation',
      subject: 'hash:sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      result: JSON.stringify({
        valid: true,
        documentType: 'legal-contract',
        signatureValid: true,
        notarized: true,
        jurisdiction: 'US-GA',
      }),
      resultSummary: 'Legal document validated: signatures authentic, properly notarized in GA',
      confidence: 0.95,
      verifierId: v3.id,
      price: 2.00,
      royaltyPerAccess: 0.20,
      expiresInSeconds: null,
      metadata: { pages: 12, signatories: 3, date: '2025-03-15' },
    });

    console.log('Seeded database with 3 verifiers and 5 attestations');
    console.log(`  Verifiers: ${v1.name}, ${v2.name}, ${v3.name}`);
    console.log('  5 attestations across deepfake-detection, fact-check, identity-verification, document-validation');
  });

// --- Query ---

program
  .command('query')
  .description('Query attestations')
  .option('--type <type>', 'Attestation type')
  .option('--subject <subject>', 'Subject to search')
  .option('--hash <hash>', 'Subject hash')
  .option('--verifier <id>', 'Verifier ID')
  .option('--min-confidence <n>', 'Minimum confidence')
  .option('--max-price <n>', 'Maximum price')
  .option('--limit <n>', 'Result limit', '50')
  .action((opts) => {
    const limit = parseInt(opts.limit) || 50;
    const minConf = opts.minConfidence ? parseFloat(opts.minConfidence) : undefined;
    const maxPr = opts.maxPrice ? parseFloat(opts.maxPrice) : undefined;
    const result = queryAttestations({
      type: opts.type as any,
      subject: opts.subject,
      subjectHash: opts.hash,
      verifierId: opts.verifier,
      minConfidence: minConf,
      maxPrice: maxPr,
      limit,
    });
    console.log(JSON.stringify(result, null, 2));
  });

// --- Verifiers ---

program
  .command('verifiers')
  .description('List active verifiers')
  .action(() => {
    const verifiers = listVerifiers(true);
    if (verifiers.length === 0) {
      console.log('No verifiers registered. Run `ai2ai db-seed` to add demo data.');
      return;
    }
    console.log(`\nActive Verifiers (${verifiers.length}):\n`);
    verifiers.forEach((v) => {
      console.log(`  ${v.name} (${v.id.slice(0, 8)}...)`);
      console.log(`    Reputation: ${v.reputationScore.toFixed(1)}  |  Stake: ${v.stakedAmount}`);
      console.log(`    Attestations: ${v.totalAttestations}  |  Disputes: ${v.disputedAttestations}`);
      console.log(`    Registered: ${v.registeredAt}\n`);
    });
  });

// --- Stats ---

program
  .command('stats')
  .description('Show marketplace statistics')
  .action(() => {
    const stats = getMarketplaceStats();
    console.log(JSON.stringify(stats, null, 2));
  });

// --- Get attestation ---

program
  .command('get <id>')
  .description('Get an attestation by ID')
  .action((id) => {
    const a = getAttestation(id);
    if (!a) {
      console.log('Attestation not found');
      return;
    }
    console.log(JSON.stringify(a, null, 2));
  });

// --- Wallet ---

program
  .command('fund <ownerId> <amount>')
  .description('Credit a wallet directly (no Lightning required)')
  .option('--type <type>', 'Owner type (verifier/buyer)', 'buyer')
  .action((ownerId, amount, opts) => {
    const result = fundWalletDirectly(ownerId, opts.type as 'verifier' | 'buyer', parseInt(amount));
    if (result.success) {
      console.log(`Credited ${amount} sats to ${ownerId}. New balance: ${result.newBalance} sats.`);
    } else {
      console.error('Failed:', result.error);
    }
  });

program
  .command('balance <ownerId>')
  .description('Check wallet balance')
  .action((ownerId) => {
    const wallet = getWallet(ownerId);
    if (!wallet) {
      const newWallet = getOrCreateWallet(ownerId, 'buyer');
      console.log(`Wallet created. Balance: ${newWallet.balance} sats`);
      return;
    }
    console.log(`Owner: ${wallet.ownerId}`);
    console.log(`Type: ${wallet.ownerType}`);
    console.log(`Balance: ${wallet.balance} sats`);
    console.log(`Lightning configured: ${isLightningConfigured()}`);
    console.log(`LNBits wallet: ${wallet.lnbitsWalletId || 'internal-only'}`);
  });

program
  .command('deposit <ownerId> <amount>')
  .description('Create a Lightning deposit invoice')
  .option('--memo <memo>', 'Payment description', 'Marketplace deposit')
  .option('--type <type>', 'Owner type (verifier/buyer)', 'buyer')
  .action(async (ownerId, amount, opts) => {
    try {
      const invoice = await createDepositInvoice(
        ownerId,
        opts.type as 'verifier' | 'buyer',
        parseInt(amount),
        opts.memo
      );
      console.log(`Lightning Invoice (${amount} sats):`);
      console.log(`  Payment Hash: ${invoice.paymentHash}`);
      console.log(`  BOLT11: ${invoice.paymentRequest}`);
      console.log(`  Expires: ${invoice.expiresAt}`);
      console.log(`\nPay this invoice, then run:`);
      console.log(`  npx tsx cli/cli.ts confirm-deposit ${invoice.paymentHash}`);
    } catch (err) {
      console.error('Error:', String(err));
    }
  });

program
  .command('confirm-deposit <paymentHash>')
  .description('Confirm a Lightning deposit was paid')
  .action(async (paymentHash) => {
    const result = await confirmDeposit(paymentHash);
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command('withdraw <ownerId> <invoice> <amount>')
  .description('Withdraw funds via Lightning')
  .action(async (ownerId, invoice, amount) => {
    try {
      const result = await withdrawFunds(ownerId, invoice, parseInt(amount));
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Error:', String(err));
    }
  });

program
  .command('buy <attestationId> <buyerId>')
  .description('Purchase an attestation')
  .action((attestationId, buyerId) => {
    try {
      const result = purchaseAttestation(attestationId, buyerId);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Error:', String(err));
    }
  });

program.parse();
