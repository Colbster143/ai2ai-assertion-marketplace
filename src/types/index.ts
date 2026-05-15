import { z } from 'zod';

export const AttestationTypeEnum = z.enum([
  'content-authenticity',
  'identity-verification',
  'document-validation',
  'deepfake-detection',
  'code-audit',
  'fact-check',
  'custom',
]);

export type AttestationType = z.infer<typeof AttestationTypeEnum>;

export interface Verifier {
  id: string;
  name: string;
  endpoint: string;
  publicKey: string;
  stakedAmount: number;
  reputationScore: number;
  totalAttestations: number;
  successfulAttestations: number;
  disputedAttestations: number;
  registeredAt: string;
  active: boolean;
}

export interface Attestation {
  id: string;
  type: AttestationType;
  subject: string;
  subjectHash: string;
  result: string;
  resultSummary: string;
  confidence: number;
  verifierId: string;
  verifierSignature: string;
  price: number;
  royaltyPerAccess: number;
  createdAt: string;
  expiresAt: string | null;
  accessCount: number;
  disputed: boolean;
  disputeReason: string | null;
  metadata: Record<string, unknown>;
}

export const AttestationQuerySchema = z.object({
  type: AttestationTypeEnum.optional(),
  subjectHash: z.string().optional(),
  subject: z.string().optional(),
  verifierId: z.string().optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  maxPrice: z.number().min(0).optional(),
  limit: z.number().min(1).max(1000).optional(),
  offset: z.number().min(0).optional(),
  sortBy: z.enum(['price', 'confidence', 'createdAt', 'reputation']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export interface AttestationQuery {
  type?: AttestationType;
  subjectHash?: string;
  subject?: string;
  verifierId?: string;
  minConfidence?: number;
  maxPrice?: number;
  limit?: number;
  offset?: number;
  sortBy?: 'price' | 'confidence' | 'createdAt' | 'reputation';
  sortOrder?: 'asc' | 'desc';
}

export interface QueryResult {
  attestations: Attestation[];
  total: number;
  queryCost: number;
  cheapestPrice: number | null;
  averagePrice: number | null;
}

export interface StakingEvent {
  id: string;
  verifierId: string;
  amount: number;
  action: 'stake' | 'unstake' | 'slash';
  reason: string;
  timestamp: string;
}

export interface Transaction {
  id: string;
  attestationId: string;
  buyerId: string;
  verifierId: string;
  amount: number;
  marketplaceFee: number;
  verifierPayout: number;
  timestamp: string;
}

export interface MarketplaceStats {
  totalAttestations: number;
  totalVerifiers: number;
  totalTransactions: number;
  totalVolume: number;
  totalFees: number;
  activeAttestations: number;
  averagePrice: number;
  topVerifiers: { id: string; name: string; reputationScore: number }[];
}

export const VerifierRegistrationSchema = z.object({
  name: z.string().min(1).max(100),
  endpoint: z.string().url(),
  publicKey: z.string().min(1),
  initialStake: z.number().min(1),
});

export const AttestationSubmissionSchema = z.object({
  type: AttestationTypeEnum,
  subject: z.string().min(1),
  result: z.string().min(1),
  resultSummary: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  verifierId: z.string().min(1),
  price: z.number().min(0),
  royaltyPerAccess: z.number().min(0).default(0),
  expiresInSeconds: z.number().min(0).nullable().default(null),
  metadata: z.record(z.unknown()).default({}),
});

export const DisputeSchema = z.object({
  attestationId: z.string().min(1),
  reason: z.string().min(1).max(1000),
  evidence: z.string().optional(),
});
