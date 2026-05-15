import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  submitAttestation,
  queryAttestations,
  purchaseAttestation,
  getAttestation,
  disputeAttestation,
  hashSubject,
} from '../registry/attestations.js';
import {
  registerVerifier,
  getVerifier,
  listVerifiers,
  stake,
  slash,
  getTopVerifiers,
} from '../registry/verifiers.js';
import { getMarketplaceStats } from '../marketplace/marketplace.js';
import {
  AttestationSubmissionSchema,
  VerifierRegistrationSchema,
  AttestationQuerySchema,
  DisputeSchema,
} from '../types/index.js';
import type { AttestationType } from '../types/index.js';

const TOOLS: Tool[] = [
  {
    name: 'query_attestation',
    description:
      'Search the assertion marketplace for existing attestations. Use this to check if verification work has already been done before re-running expensive compute. Returns attestations sorted by confidence and price.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description:
            'Attestation type: content-authenticity, identity-verification, document-validation, deepfake-detection, code-audit, fact-check, or custom',
        },
        subject: {
          type: 'string',
          description: 'The subject to search for (URL, hash, identifier, content)',
        },
        subjectHash: {
          type: 'string',
          description: 'Pre-computed SHA-256 hash of the subject',
        },
        verifierId: {
          type: 'string',
          description: 'Filter by specific verifier ID',
        },
        minConfidence: {
          type: 'number',
          description: 'Minimum confidence score (0-1)',
        },
        maxPrice: {
          type: 'number',
          description: 'Maximum price in tokens',
        },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
    },
  },
  {
    name: 'buy_attestation',
    description:
      'Purchase access to a verified attestation. Transfers payment to the verifier minus a 10% marketplace fee. Returns the full attestation data.',
    inputSchema: {
      type: 'object',
      properties: {
        attestationId: {
          type: 'string',
          description: 'The ID of the attestation to purchase',
        },
        buyerId: {
          type: 'string',
          description: 'Your agent/buyer identifier',
        },
      },
      required: ['attestationId', 'buyerId'],
    },
  },
  {
    name: 'register_verifier',
    description:
      'Register as a new verifier on the marketplace. Verifiers stake tokens as reputation collateral and earn revenue when their attestations are purchased.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Verifier name' },
        endpoint: {
          type: 'string',
          description: 'Verifier API endpoint for verification requests',
        },
        publicKey: { type: 'string', description: 'Public key for signature verification' },
        initialStake: {
          type: 'number',
          description: 'Initial token stake for reputation collateral',
        },
      },
      required: ['name', 'endpoint', 'publicKey', 'initialStake'],
    },
  },
  {
    name: 'submit_attestation',
    description:
      'Submit a new attestation to the marketplace. Once submitted, other agents can discover and purchase this attestation instead of re-running the verification themselves.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description:
            'Attestation type: content-authenticity, identity-verification, document-validation, deepfake-detection, code-audit, fact-check, or custom',
        },
        subject: {
          type: 'string',
          description: 'What is being attested (URL, hash, text identifier)',
        },
        result: {
          type: 'string',
          description: 'The full verification result (JSON string or structured data)',
        },
        resultSummary: {
          type: 'string',
          description: 'Short summary of the result (max 500 chars)',
        },
        confidence: {
          type: 'number',
          description: 'Confidence score 0-1',
        },
        verifierId: {
          type: 'string',
          description: 'Your verifier ID',
        },
        price: {
          type: 'number',
          description: 'Price in tokens per access',
        },
        royaltyPerAccess: {
          type: 'number',
          description: 'Ongoing royalty per access (default 0, max 10% of price)',
        },
        expiresInSeconds: {
          type: 'number',
          description: 'Seconds until this attestation expires (null = never)',
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata about the attestation',
        },
      },
      required: ['type', 'subject', 'result', 'resultSummary', 'confidence', 'verifierId', 'price'],
    },
  },
  {
    name: 'check_verifier_reputation',
    description:
      'Check the reputation and stake of a verifier. Use this to assess the trustworthiness of attestations from a given verifier before purchasing.',
    inputSchema: {
      type: 'object',
      properties: {
        verifierId: {
          type: 'string',
          description: 'Verifier ID to check',
        },
      },
      required: ['verifierId'],
    },
  },
  {
    name: 'list_verifiers',
    description:
      'List all active verifiers on the marketplace, sorted by reputation score. Use this to discover which verifiers are available and their trust levels.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max results (default 50)',
        },
      },
    },
  },
  {
    name: 'dispute_attestation',
    description:
      'File a dispute against an attestation you believe is incorrect. Successful disputes reduce the verifier reputation and may trigger slashing of their stake.',
    inputSchema: {
      type: 'object',
      properties: {
        attestationId: {
          type: 'string',
          description: 'The ID of the attestation to dispute',
        },
        reason: {
          type: 'string',
          description: 'Reason for the dispute',
        },
        evidence: {
          type: 'string',
          description: 'Supporting evidence for the dispute',
        },
      },
      required: ['attestationId', 'reason'],
    },
  },
  {
    name: 'get_marketplace_stats',
    description:
      'Get overall marketplace statistics: total attestations, verifiers, transaction volume, fees collected, and top verifiers.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export async function startMCPServer(): Promise<void> {
  const server = new Server(
    { name: 'ai2ai-assertion-marketplace', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'query_attestation': {
          const validated = AttestationQuerySchema.parse(args ?? {});
          const result = queryAttestations(validated);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'buy_attestation': {
          const { attestationId, buyerId } = args as {
            attestationId: string;
            buyerId: string;
          };
          const result = purchaseAttestation(attestationId, buyerId);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    transactionId: result.transactionId,
                    attestation: result.attestation,
                    message: `Successfully purchased attestation for ${result.attestation.price} tokens. ${result.attestation.price * 0.1} tokens marketplace fee.`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'register_verifier': {
          const validated = VerifierRegistrationSchema.parse(args ?? {});
          const verifier = registerVerifier(validated);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(verifier, null, 2),
              },
            ],
          };
        }

        case 'submit_attestation': {
          const validated = AttestationSubmissionSchema.parse(args ?? {});
          const { verifierId, ...rest } = validated;
          const verifier = getVerifier(verifierId);
          if (!verifier) {
            throw new Error(`Verifier not found: ${verifierId}`);
          }
          if (!verifier.active) {
            throw new Error(`Verifier is inactive: ${verifierId}`);
          }
          const attestation = submitAttestation({ ...rest, verifierId });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(attestation, null, 2),
              },
            ],
          };
        }

        case 'check_verifier_reputation': {
          const { verifierId } = args as { verifierId: string };
          const verifier = getVerifier(verifierId);
          if (!verifier) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: `Verifier not found: ${verifierId}` }),
                },
              ],
            };
          }
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    id: verifier.id,
                    name: verifier.name,
                    reputationScore: verifier.reputationScore,
                    stakedAmount: verifier.stakedAmount,
                    totalAttestations: verifier.totalAttestations,
                    successfulAttestations: verifier.successfulAttestations,
                    disputedAttestations: verifier.disputedAttestations,
                    disputeRate:
                      verifier.totalAttestations > 0
                        ? (
                            verifier.disputedAttestations /
                            verifier.totalAttestations
                          ).toFixed(4)
                        : '0',
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'list_verifiers': {
          const { limit } = (args ?? {}) as { limit?: number };
          const verifiers = listVerifiers(true).slice(0, limit || 50);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(verifiers, null, 2),
              },
            ],
          };
        }

        case 'dispute_attestation': {
          const validated = DisputeSchema.parse(args ?? {});
          const updated = disputeAttestation(
            validated.attestationId,
            validated.reason
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  { message: 'Dispute filed successfully', attestation: updated },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case 'get_marketplace_stats': {
          const stats = getMarketplaceStats();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(stats, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
