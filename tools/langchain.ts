import { Tool } from '@langchain/core/tools';
import { z } from 'zod';

const MARKETPLACE_API = process.env.AI2AI_MARKETPLACE_URL || 'http://localhost:3099';

export class QueryAttestationTool extends Tool {
  name = 'query_attestation';
  description = 'Search the AI2AI assertion marketplace for existing attestations. Use this BEFORE running expensive verification compute. Returns attestations sorted by confidence and price.';

  schema = z.object({
    type: z.enum(['content-authenticity', 'identity-verification', 'document-validation', 'deepfake-detection', 'code-audit', 'fact-check', 'custom']).optional().describe('Attestation type to filter by'),
    subject: z.string().optional().describe('Subject to search for (URL, hash, text identifier)'),
    subjectHash: z.string().optional().describe('Pre-computed SHA-256 hash of the subject'),
    verifierId: z.string().optional().describe('Filter by specific verifier ID'),
    minConfidence: z.number().min(0).max(1).optional().describe('Minimum confidence score 0-1'),
    maxPrice: z.number().min(0).optional().describe('Maximum price in tokens'),
    limit: z.number().min(1).max(1000).optional().describe('Max results (default 50)'),
  });

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    const params = new URLSearchParams();
    if (input.type) params.set('type', input.type);
    if (input.subject) params.set('subject', input.subject);
    if (input.subjectHash) params.set('subjectHash', input.subjectHash);
    if (input.verifierId) params.set('verifierId', input.verifierId);
    if (input.minConfidence) params.set('minConfidence', String(input.minConfidence));
    if (input.maxPrice) params.set('maxPrice', String(input.maxPrice));
    if (input.limit) params.set('limit', String(input.limit));

    const res = await fetch(`${MARKETPLACE_API}/attestations?${params}`);
    if (!res.ok) throw new Error(`Marketplace query failed: ${res.status}`);
    const data = await res.json();
    return JSON.stringify(data, null, 2);
  }
}

export class BuyAttestationTool extends Tool {
  name = 'buy_attestation';
  description = 'Purchase access to a verified attestation from the AI2AI marketplace. Returns the full attestation data. Transfers payment to the verifier minus a 10% fee.';

  schema = z.object({
    attestationId: z.string().describe('The ID of the attestation to purchase'),
    buyerId: z.string().describe('Your agent/buyer identifier'),
  });

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    const res = await fetch(`${MARKETPLACE_API}/attestations/${input.attestationId}/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buyerId: input.buyerId }),
    });
    if (!res.ok) throw new Error(`Purchase failed: ${res.status}`);
    const data = await res.json();
    return JSON.stringify(data, null, 2);
  }
}

export class SubmitAttestationTool extends Tool {
  name = 'submit_attestation';
  description = 'Submit a new verification result to the AI2AI marketplace. Other agents can then purchase this result instead of re-running the same computation.';

  schema = z.object({
    type: z.enum(['content-authenticity', 'identity-verification', 'document-validation', 'deepfake-detection', 'code-audit', 'fact-check', 'custom']).describe('Attestation type'),
    subject: z.string().describe('What is being attested (URL, hash, text identifier)'),
    result: z.string().describe('The full verification result as a JSON string'),
    resultSummary: z.string().max(500).describe('Short summary of the result'),
    confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
    verifierId: z.string().describe('Your verifier ID'),
    price: z.number().min(0).describe('Price in tokens per access'),
    royaltyPerAccess: z.number().min(0).optional().describe('Ongoing royalty per access'),
    expiresInSeconds: z.number().min(0).nullable().optional().describe('Seconds until expiry'),
    metadata: z.record(z.unknown()).optional().describe('Additional metadata'),
  });

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    const res = await fetch(`${MARKETPLACE_API}/attestations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`Submission failed: ${res.status}`);
    const data = await res.json();
    return JSON.stringify(data, null, 2);
  }
}

export class MarketplaceStatsTool extends Tool {
  name = 'marketplace_stats';
  description = 'Get overall AI2AI marketplace statistics: total attestations, verifiers, transaction volume, fees collected, and top verifiers.';

  schema = z.object({});

  async _call(): Promise<string> {
    const res = await fetch(`${MARKETPLACE_API}/stats`);
    if (!res.ok) throw new Error(`Stats query failed: ${res.status}`);
    const data = await res.json();
    return JSON.stringify(data, null, 2);
  }
}

export class CheckVerifierTool extends Tool {
  name = 'check_verifier';
  description = 'Check the reputation and stake of a verifier on the AI2AI marketplace. Use this to assess trustworthiness before purchasing their attestations.';

  schema = z.object({
    verifierId: z.string().describe('Verifier ID to check'),
  });

  async _call(input: z.infer<typeof this.schema>): Promise<string> {
    const res = await fetch(`${MARKETPLACE_API}/verifiers/${input.verifierId}`);
    if (!res.ok) throw new Error(`Verifier lookup failed: ${res.status}`);
    const data = await res.json();
    return JSON.stringify(data, null, 2);
  }
}

export const ai2aiTools = [
  new QueryAttestationTool(),
  new BuyAttestationTool(),
  new SubmitAttestationTool(),
  new MarketplaceStatsTool(),
  new CheckVerifierTool(),
];
