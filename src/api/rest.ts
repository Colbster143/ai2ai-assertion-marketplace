import express from 'express';
import cors from 'cors';
import {
  submitAttestation,
  queryAttestations,
  purchaseAttestation,
  getAttestation,
  disputeAttestation,
  hashSubject,
  getAttestationsByVerifier,
} from '../registry/attestations.js';
import {
  registerVerifier,
  getVerifier,
  listVerifiers,
  stake,
  slash,
  updateReputation,
  getTopVerifiers,
  getStakingHistory,
} from '../registry/verifiers.js';
import {
  getMarketplaceStats,
  getRecentTransactions,
  getBuyerHistory,
} from '../marketplace/marketplace.js';
import {
  AttestationSubmissionSchema,
  VerifierRegistrationSchema,
  AttestationQuerySchema,
  DisputeSchema,
} from '../types/index.js';
import {
  getOrCreateWallet,
  getWallet,
  createDepositInvoice,
  confirmDeposit,
  withdrawFunds,
  fundWalletDirectly,
} from '../payments/wallets.js';
import { isLightningConfigured } from '../payments/provider.js';
import { logApiRequest, logActivity, getUsageReport } from '../monitoring/usage.js';
import { autoSeedDailyIfNeeded } from '../scheduler/auto-seed.js';
import { onboardAgent, getOnboardingMessage } from '../onboarding/agent-onboard.js';
import {
  postBounty,
  getBounty,
  listOpenBounties,
  claimBounty,
  fulfillBounty,
  cancelBounty,
  getBountiesByPoster,
} from '../bounties/bounty-market.js';
import { renderDashboard } from '../dashboard/html.js';

const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'Factorium — Attestation Marketplace Protocol',
    description: 'Decentralized marketplace where AI systems buy and sell verified attestations. Eliminate redundant compute. Buyers query pre-computed verification results. Verifiers earn on every query. 10% marketplace fee. 10x stake requirement.',
    version: '1.0.5',
    contact: { name: 'Factorium', url: 'https://factorium.network' },
  },
  servers: [{ url: 'https://factorium.network', description: 'Production' }],
  paths: {
    '/attestations': {
      get: { summary: 'Query attestations', parameters: [{ name: 'type', in: 'query', schema: { type: 'string' } }, { name: 'subject', in: 'query', schema: { type: 'string' } }, { name: 'minConfidence', in: 'query', schema: { type: 'number' } }, { name: 'maxPrice', in: 'query', schema: { type: 'number' } }], responses: { '200': { description: 'Attestation query results' } } },
      post: { summary: 'Submit new attestation', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { '201': { description: 'Attestation created' } } },
    },
    '/bounties': {
      get: { summary: 'List open bounties', parameters: [{ name: 'type', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Open bounties' } } },
      post: { summary: 'Post a funded verification bounty', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { '201': { description: 'Bounty created' } } },
    },
    '/verifiers': { get: { summary: 'List active verifiers', responses: { '200': { description: 'Verifier list' } } }, post: { summary: 'Register as verifier', responses: { '201': { description: 'Verifier created' } } } },
    '/wallets/{ownerId}': { get: { summary: 'Check wallet balance', parameters: [{ name: 'ownerId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Wallet details' } } } },
    '/stats': { get: { summary: 'Marketplace statistics', responses: { '200': { description: 'Stats' } } } },
    '/usage': { get: { summary: 'Usage report and activity feed', responses: { '200': { description: 'Usage report' } } } },
    '/openapi.json': { get: { summary: 'OpenAPI spec for agent discovery', responses: { '200': { description: 'OpenAPI 3.0 spec' } } } },
  },
};

export function createAPI(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use((req, res, next) => {
    res.on('finish', () => {
      logApiRequest(
        req.method,
        req.path,
        req.ip || req.socket.remoteAddress || 'unknown',
        req.headers['user-agent'],
        res.statusCode
      );
    });
    next();
  });

  app.get('/', (_req, res) => {
    autoSeedDailyIfNeeded();
    const stats = getMarketplaceStats();
    const usage = getUsageReport();
    const openBounties = listOpenBounties(undefined, 100);
    res.setHeader('Content-Type', 'text/html');
    res.send(renderDashboard(
      stats as unknown as Record<string, unknown>,
      usage as unknown as Record<string, unknown>,
      openBounties.length
    ));
  });

  app.get('/openapi.json', (_req, res) => {
    res.json(OPENAPI_SPEC);
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', protocol: 'factorium', version: '1.0.6' });
  });

  app.get('/usage', (_req, res) => {
    autoSeedDailyIfNeeded();
    res.json(getUsageReport());
  });

  app.get('/stats', (_req, res) => {
    autoSeedDailyIfNeeded();
    res.json(getMarketplaceStats());
  });

  app.get('/welcome/:agentId', (req, res) => {
    const onboarded = onboardAgent(req.params.agentId, 'buyer');
    const msg = getOnboardingMessage(req.params.agentId);
    res.json({
      ...msg,
      isNew: onboarded.isNew,
      agentId: req.params.agentId,
    });
  });

  // --- Attestations ---

  app.get('/attestations', (req, res) => {
    try {
      const validated = AttestationQuerySchema.parse(req.query);
      autoSeedDailyIfNeeded();

      if (validated.verifierId) {
        onboardAgent(validated.verifierId, 'buyer');
      }

      const result = queryAttestations(validated);

      if (result.total === 0) {
        res.json({
          ...result,
          message: 'No attestations found. Post a bounty to fund verification: POST /bounties',
          openBounties: listOpenBounties(validated.type, 5).length,
        });
        return;
      }

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('/attestations/:id', (req, res) => {
    const a = getAttestation(req.params.id);
    if (!a) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(a);
  });

  app.post('/attestations', (req, res) => {
    try {
      const validated = AttestationSubmissionSchema.parse(req.body);
      const { verifierId, ...rest } = validated;
      const verifier = getVerifier(verifierId);
      if (!verifier) {
        res.status(404).json({ error: `Verifier not found: ${verifierId}` });
        return;
      }
      if (!verifier.active) {
        res.status(403).json({ error: `Verifier is inactive: ${verifierId}` });
        return;
      }
      if (verifier.stakedAmount < validated.price * 10) {
        res.status(403).json({
          error: `Insufficient stake. Need ${validated.price * 10} (10x price). Have ${verifier.stakedAmount}.`,
        });
        return;
      }
      const attestation = submitAttestation({ ...rest, verifierId });
      logActivity('attestation_submitted', `${attestation.type}: ${attestation.resultSummary.slice(0, 80)}`, verifierId);
      res.status(201).json(attestation);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.post('/attestations/:id/purchase', (req, res) => {
    try {
      const { buyerId } = req.body;
      if (!buyerId) {
        res.status(400).json({ error: 'buyerId required' });
        return;
      }
      onboardAgent(buyerId, 'buyer');
      const result = purchaseAttestation(req.params.id, buyerId);
      logActivity('attestation_purchased', `Buyer ${buyerId.slice(0, 8)} paid ${result.attestation.price} sats for ${result.attestation.type}`, buyerId);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.post('/attestations/:id/dispute', (req, res) => {
    try {
      const validated = DisputeSchema.parse({
        attestationId: req.params.id,
        ...req.body,
      });
      const updated = disputeAttestation(validated.attestationId, validated.reason);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // --- Bounties ---

  app.get('/bounties', (req, res) => {
    const type = req.query.type as string | undefined;
    res.json(listOpenBounties(type as any));
  });

  app.post('/bounties', (req, res) => {
    try {
      const { type, subject, reward, postedBy, expiresInSeconds } = req.body;
      if (!type || !subject || !reward || !postedBy) {
        res.status(400).json({ error: 'type, subject, reward, and postedBy required' });
        return;
      }
      onboardAgent(postedBy, 'buyer');
      const subjectHash = hashSubject(subject);
      const bounty = postBounty({ type, subject, subjectHash, reward, postedBy, expiresInSeconds });
      logActivity('bounty_posted', `${type}: ${subject.slice(0, 60)} (${reward} sats)`, postedBy);
      res.status(201).json(bounty);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('/bounties/:id', (req, res) => {
    const b = getBounty(req.params.id);
    if (!b) {
      res.status(404).json({ error: 'Bounty not found' });
      return;
    }
    res.json(b);
  });

  app.post('/bounties/:id/claim', (req, res) => {
    try {
      const { verifierId } = req.body;
      if (!verifierId) {
        res.status(400).json({ error: 'verifierId required' });
        return;
      }
      const bounty = claimBounty(req.params.id, verifierId);
      logActivity('bounty_claimed', `Bounty ${req.params.id.slice(0, 8)} claimed by verifier ${verifierId.slice(0, 8)}`, verifierId);
      res.json(bounty);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.post('/bounties/:id/fulfill', (req, res) => {
    try {
      const { result, resultSummary, confidence } = req.body;
      if (!result || !resultSummary || confidence === undefined) {
        res.status(400).json({ error: 'result, resultSummary, and confidence required' });
        return;
      }
      const fulfilled = fulfillBounty(req.params.id, result, resultSummary, confidence);
      logActivity('bounty_fulfilled', `Bounty fulfilled: ${resultSummary.slice(0, 60)}`, fulfilled.bounty.fulfilledBy ?? undefined);
      res.json(fulfilled);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.post('/bounties/:id/cancel', (req, res) => {
    try {
      const { requestedBy } = req.body;
      if (!requestedBy) {
        res.status(400).json({ error: 'requestedBy required' });
        return;
      }
      const bounty = cancelBounty(req.params.id, requestedBy);
      res.json(bounty);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('/bounties/poster/:posterId', (req, res) => {
    res.json(getBountiesByPoster(req.params.posterId));
  });

  // --- Verifiers ---

  app.get('/verifiers', (_req, res) => {
    res.json(listVerifiers(true));
  });

  app.get('/verifiers/top', (req, res) => {
    const limit = Number(req.query.limit) || 10;
    res.json(getTopVerifiers(limit));
  });

  app.get('/verifiers/:id', (req, res) => {
    const v = getVerifier(req.params.id);
    if (!v) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(v);
  });

  app.post('/verifiers', (req, res) => {
    try {
      const validated = VerifierRegistrationSchema.parse(req.body);
      const verifier = registerVerifier(validated);
      logActivity('verifier_registered', `${validated.name} registered with ${validated.initialStake} stake`, verifier.id);
      res.status(201).json(verifier);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.get('/verifiers/:id/attestations', (req, res) => {
    const v = getVerifier(req.params.id);
    if (!v) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(getAttestationsByVerifier(req.params.id));
  });

  app.get('/verifiers/:id/staking-history', (req, res) => {
    const v = getVerifier(req.params.id);
    if (!v) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(getStakingHistory(req.params.id));
  });

  app.post('/verifiers/:id/stake', (req, res) => {
    try {
      const { amount } = req.body;
      const v = stake(req.params.id, amount);
      res.json(v);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.post('/verifiers/:id/slash', (req, res) => {
    try {
      const { amount, reason } = req.body;
      const v = slash(req.params.id, amount, reason);
      res.json(v);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.post('/verifiers/:id/reputation', (req, res) => {
    try {
      const { delta } = req.body;
      const v = updateReputation(req.params.id, delta);
      res.json(v);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  // --- Transactions ---

  app.get('/transactions', (req, res) => {
    const limit = Number(req.query.limit) || 50;
    res.json(getRecentTransactions(limit));
  });

  app.get('/transactions/:buyerId', (req, res) => {
    res.json(getBuyerHistory(req.params.buyerId));
  });

  // --- Utility ---

  app.post('/hash', (req, res) => {
    const { subject } = req.body;
    if (!subject) {
      res.status(400).json({ error: 'subject required' });
      return;
    }
    res.json({ subject, hash: hashSubject(subject) });
  });

  // --- Payments ---

  app.get('/wallets/:ownerId', (req, res) => {
    const wallet = getWallet(req.params.ownerId);
    if (!wallet) {
      getOrCreateWallet(req.params.ownerId, 'buyer');
      res.json({ ownerId: req.params.ownerId, balance: 0, lightningConfigured: isLightningConfigured() });
      return;
    }
    res.json({
      ownerId: wallet.ownerId,
      ownerType: wallet.ownerType,
      balance: wallet.balance,
      lightningConfigured: isLightningConfigured(),
      hasLNBitsWallet: !!wallet.lnbitsWalletId,
    });
  });

  app.post('/wallets/:ownerId/deposit', async (req, res) => {
    try {
      const { amount, memo, ownerType } = req.body;
      if (!amount || !memo) {
        res.status(400).json({ error: 'amount and memo required' });
        return;
      }
      const invoice = await createDepositInvoice(
        req.params.ownerId,
        ownerType || 'buyer',
        amount,
        memo
      );
      res.json({ invoice, instructions: 'Pay this BOLT11 invoice, then POST /wallets/deposit/confirm' });
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.post('/wallets/deposit/confirm', async (req, res) => {
    try {
      const { paymentHash } = req.body;
      if (!paymentHash) {
        res.status(400).json({ error: 'paymentHash required' });
        return;
      }
      const result = await confirmDeposit(paymentHash);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.post('/wallets/:ownerId/withdraw', async (req, res) => {
    try {
      const { invoice, amount } = req.body;
      if (!invoice || !amount) {
        res.status(400).json({ error: 'invoice and amount required' });
        return;
      }
      const result = await withdrawFunds(req.params.ownerId, invoice, amount);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: String(err) });
    }
  });

  return app;
}

export function startAPI(port = 3099): void {
  const app = createAPI();
  app.listen(port, () => {
    console.log(`Factorium — Attestation Marketplace Protocol`);
    console.log(`Running on http://localhost:${port}`);
    console.log(`  GET  /                           Live dashboard`);
    console.log(`  GET  /openapi.json                OpenAPI spec for agent discovery`);
    console.log(`  GET  /usage                       Usage report & activity`);
    console.log(`  GET  /stats                       Marketplace statistics`);
    console.log(`  GET  /attestations?type=&...      Query attestations`);
    console.log(`  POST /attestations                Submit attestation (10x stake enforced)`);
    console.log(`  POST /attestations/:id/purchase   Buy attestation`);
    console.log(`  POST /attestations/:id/dispute    Dispute attestation`);
    console.log(`  GET  /bounties                    List open bounties`);
    console.log(`  POST /bounties                    Post funded verification bounty`);
    console.log(`  POST /bounties/:id/claim          Claim a bounty`);
    console.log(`  POST /bounties/:id/fulfill        Fulfill a bounty`);
    console.log(`  GET  /verifiers                   List verifiers`);
    console.log(`  POST /verifiers                   Register verifier`);
    console.log(`  GET  /wallets/:ownerId            Check balance`);
    console.log(`  GET  /welcome/:agentId            Agent onboarding + free credits`);
  });
}
