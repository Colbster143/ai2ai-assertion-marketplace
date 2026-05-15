import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDatabase } from './registry/database.js';
import { registerVerifier } from './registry/verifiers.js';
import { submitAttestation } from './registry/attestations.js';
import { startAPI } from './api/rest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const dbPath = join(dataDir, 'marketplace.db');

if (!existsSync(dbPath)) {
  mkdirSync(dataDir, { recursive: true });
  const db = getDatabase();

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
    result: JSON.stringify({ isDeepfake: false, manipulationDetected: false }),
    resultSummary: 'Video is authentic, no deepfake manipulation detected with 0.97 confidence',
    confidence: 0.97,
    verifierId: v1.id,
    price: 50,
    royaltyPerAccess: 5,
    expiresInSeconds: 86400 * 30,
    metadata: {},
  });

  submitAttestation({
    type: 'deepfake-detection',
    subject: 'https://example.com/video/celebrity-speech.mp4',
    result: JSON.stringify({ isDeepfake: true, manipulationDetected: true }),
    resultSummary: 'Deepfake detected: face-swap manipulation with 0.94 confidence',
    confidence: 0.94,
    verifierId: v1.id,
    price: 75,
    royaltyPerAccess: 7,
    expiresInSeconds: null,
    metadata: {},
  });

  submitAttestation({
    type: 'fact-check',
    subject: 'Statement: "Global temperatures have risen 2.5C since 1880"',
    result: JSON.stringify({ verdict: 'mostly-true', actualRise: '1.2C' }),
    resultSummary: 'Mostly true but overstated: actual rise is ~1.2C, not 2.5C',
    confidence: 0.92,
    verifierId: v2.id,
    price: 10,
    royaltyPerAccess: 1,
    expiresInSeconds: 86400 * 90,
    metadata: {},
  });

  submitAttestation({
    type: 'identity-verification',
    subject: 'email:john.doe@example.com',
    result: JSON.stringify({ verified: true, riskScore: 0.02 }),
    resultSummary: 'Email identity verified: valid, non-disposable, low risk',
    confidence: 0.99,
    verifierId: v3.id,
    price: 5,
    royaltyPerAccess: 0,
    expiresInSeconds: null,
    metadata: {},
  });

  submitAttestation({
    type: 'document-validation',
    subject: 'hash:sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    result: JSON.stringify({ valid: true, documentType: 'legal-contract' }),
    resultSummary: 'Legal document validated: signatures authentic, properly notarized',
    confidence: 0.95,
    verifierId: v3.id,
    price: 200,
    royaltyPerAccess: 20,
    expiresInSeconds: null,
    metadata: {},
  });

  console.log('Database seeded with 3 verifiers and 5 attestations');
}

startAPI(Number(process.env.PORT) || 3099);
