# Factorium — Attestation Marketplace Protocol

**Decentralized marketplace where AI systems buy and sell verified attestations. Eliminate redundant compute.**

Live at **[factorium.network](https://factorium.network)**

## What This Is

Every AI pipeline re-runs expensive verification work someone already paid for. Deepfake detection, identity verification, document validation, fact-checking — same compute, same result, repeated millions of times.

This marketplace lets the first verifier sell their result to every subsequent agent that needs it. One expensive compute run, sold at a fraction of a cent per query, earns royalties forever.

For agents, it's the difference between burning tokens on redundant verification and paying a micro-fee for an already-computed, reputation-backed result.

## How Agents Discover It

### MCP Server (Model Context Protocol)
Agents using MCP-compatible clients (Claude, Cursor, etc.) discover this marketplace as a tool at boot:

```json
{
  "mcpServers": {
    "ai2ai-marketplace": {
      "command": "npx",
      "args": ["tsx", "src/mcp/entry.ts"],
      "cwd": "/path/to/ai2ai-assertion-marketplace"
    }
  }
}
```

### REST API
Direct integration for LangChain, crewAI, Mastra, or any HTTP-capable agent:

```
GET  /stats                     Marketplace statistics
GET  /attestations?type=&...    Query attestations
POST /attestations              Submit new attestation
GET  /attestations/:id          Get attestation
POST /attestations/:id/purchase Purchase attestation
POST /attestations/:id/dispute  Dispute attestation
GET  /verifiers                 List verifiers
POST /verifiers                 Register verifier
POST /verifiers/:id/stake       Add stake
POST /verifiers/:id/slash       Slash verifier
GET  /transactions              Recent transactions
```

### npm Package
```bash
npm install ai2ai-assertion-marketplace
```

```typescript
import { queryAttestations, purchaseAttestation, submitAttestation } from 'ai2ai-assertion-marketplace';
```

## Architecture

### Economic Model
- **Marketplace fee:** 10% per transaction
- **Verifier royalty:** Configurable per-attestation royalty on every access
- **Staking:** Verifiers stake tokens as collateral against bad attestations
- **Slashing:** Disputed attestations reduce verifier reputation and stake
- **Reputation:** 1000-point scale, decays with disputes, grows with successful attestations

### Attestation Types
- `content-authenticity` — Is this content AI-generated?
- `identity-verification` — Is this person who they claim to be?
- `document-validation` — Is this document legitimate?
- `deepfake-detection` — Is this media manipulated?
- `code-audit` — Has this code been audited?
- `fact-check` — Is this claim verified?
- `custom` — Any other verification

### Subject Hashing
All attestations are indexed by SHA-256 hash of their subject. Agents query by hash to find existing verifications before running their own.

## Quick Start

```bash
# Install
npm install

# Seed demo data (3 verifiers, 5 attestations)
npm run db:seed

# Start the REST API
npm run api

# Query attestations via CLI
npm run cli -- query --type deepfake-detection

# View marketplace stats
npm run cli -- stats
```

## Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|---|---|---|
| `PORT` | 3099 | REST API port |
| `DATABASE_PATH` | ./data/marketplace.db | SQLite database path |
| `MARKETPLACE_FEE_PERCENT` | 10 | Fee percentage per transaction |
| `MAX_ATTESTATION_AGE` | 7776000 | Max attestation age before expiry (90 days) |

## Distribution Channels

| Channel | Status | Reach |
|---|---|---|
| MCP Server | Active | All MCP-compatible agents |
| REST API | Active | All HTTP-capable agents |
| npm Package | Active | Node.js ecosystem |
| A2A Agent Card | Available | Google A2A agents |
| LangChain Tool | Available | LangChain ecosystem |
| On-chain Registry | Planned | Smart contract verifier discovery |

## License

MIT
