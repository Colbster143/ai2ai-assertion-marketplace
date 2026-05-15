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

export function createAPI(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', marketplace: 'ai2ai-assertion-marketplace' });
  });

  app.get('/stats', (_req, res) => {
    res.json(getMarketplaceStats());
  });

  // --- Attestations ---

  app.get('/attestations', (req, res) => {
    try {
      const validated = AttestationQuerySchema.parse(req.query);
      res.json(queryAttestations(validated));
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
      const attestation = submitAttestation({ ...rest, verifierId });
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
      const result = purchaseAttestation(req.params.id, buyerId);
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

  return app;
}

export function startAPI(port = 3099): void {
  const app = createAPI();
  app.listen(port, () => {
    console.log(`AI2AI Assertion Marketplace API running on http://localhost:${port}`);
    console.log(`  GET  /stats                     Marketplace statistics`);
    console.log(`  GET  /attestations?type=&...    Query attestations`);
    console.log(`  POST /attestations              Submit new attestation`);
    console.log(`  GET  /attestations/:id          Get attestation`);
    console.log(`  POST /attestations/:id/purchase Purchase attestation`);
    console.log(`  POST /attestations/:id/dispute  Dispute attestation`);
    console.log(`  GET  /verifiers                 List verifiers`);
    console.log(`  POST /verifiers                 Register verifier`);
    console.log(`  GET  /verifiers/:id             Get verifier`);
    console.log(`  POST /verifiers/:id/stake       Add stake`);
    console.log(`  POST /verifiers/:id/slash       Slash verifier`);
    console.log(`  GET  /transactions              Recent transactions`);
  });
}
