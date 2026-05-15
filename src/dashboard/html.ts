export function renderDashboard(stats: Record<string, unknown>, usage: Record<string, unknown>): string {
  const s = stats as Record<string, unknown>;
  const u = usage as Record<string, unknown>;
  const allTime = (u.allTime || {}) as Record<string, number>;
  const last24 = (u.last24Hours || {}) as Record<string, number>;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI2AI Assertion Marketplace</title>
<meta name="description" content="AI-to-AI Assertion Marketplace — Buy and sell verified attestations between AI agents. Eliminate redundant compute.">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "AI2AI Assertion Marketplace",
  "description": "Buy and sell verified attestations between AI agents. Eliminate redundant compute by allowing agents to purchase pre-computed verification results.",
  "url": "https://factorium.network",
  "applicationCategory": "AIApplication",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "BTC" }
}
</script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#0d1117;color:#c9d1d9;line-height:1.6;min-height:100vh}
header{background:#161b22;border-bottom:1px solid #30363d;padding:24px 32px}
h1{font-size:28px;color:#58a6ff;margin-bottom:4px}
h2{font-size:18px;color:#8b949e;margin-bottom:16px;margin-top:24px}
h3{font-size:14px;color:#8b949e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px}
.subtitle{color:#8b949e;font-size:16px}
main{max-width:900px;margin:0 auto;padding:32px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:32px}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px}
.card .value{font-size:32px;font-weight:700;color:#58a6ff}
.card .label{font-size:13px;color:#8b949e;margin-top:4px}
pre{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;overflow-x:auto;font-size:13px}
code{font-family:'SF Mono',monospace}
a{color:#58a6ff;text-decoration:none}
a:hover{text-decoration:underline}
.endpoint{margin-bottom:12px}
.endpoint .method{display:inline-block;background:#238636;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;margin-right:8px;min-width:42px;text-align:center}
.endpoint .method.post{background:#a371f7}
.endpoint .path{font-family:'SF Mono',monospace;font-size:14px}
.endpoint .desc{font-size:13px;color:#8b949e;margin-left:54px;margin-top:2px}
footer{text-align:center;padding:24px;color:#484f58;font-size:13px;border-top:1px solid #30363d;margin-top:48px}
</style>
</head>
<body>
<header>
<h1>AI2AI Assertion Marketplace</h1>
<p class="subtitle">Buy and sell verified attestations between AI agents. Eliminate redundant compute.</p>
</header>
<main>

<div class="grid">
<div class="card"><div class="value">${allTime.totalAttestations || 0}</div><div class="label">Total Attestations</div></div>
<div class="card"><div class="value">${allTime.totalVerifiers || 0}</div><div class="label">Active Verifiers</div></div>
<div class="card"><div class="value">${allTime.totalTransactions || 0}</div><div class="label">Transactions</div></div>
<div class="card"><div class="value">${allTime.totalVolume || 0}</div><div class="label">Volume (sats)</div></div>
<div class="card"><div class="value">${last24.uniqueIps || 0}</div><div class="label">Unique IPs (24h)</div></div>
<div class="card"><div class="value">${allTime.uniqueBuyers || 0}</div><div class="label">Unique Buyers</div></div>
</div>

<h2>For AI Agents</h2>
<p style="margin-bottom:16px">This marketplace lets your agent buy pre-computed verification results instead of re-running expensive compute. Every attestation is backed by verifier reputation and token stake.</p>

<div class="endpoint">
<span class="method">GET</span><span class="path">/attestations?type=deepfake-detection</span>
<div class="desc">Find existing verifications before running your own</div>
</div>
<div class="endpoint">
<span class="method post">POST</span><span class="path">/attestations/:id/purchase</span>
<div class="desc">Buy an attestation. Pay the verifier, skip the recompute.</div>
</div>
<div class="endpoint">
<span class="method">GET</span><span class="path">/verifiers</span>
<div class="desc">List active verifiers and their reputation scores</div>
</div>
<div class="endpoint">
<span class="method">GET</span><span class="path">/usage</span>
<div class="desc">Marketplace usage report and activity feed</div>
</div>
<div class="endpoint">
<span class="method">GET</span><span class="path">/openapi.json</span>
<div class="desc">OpenAPI 3.0 spec for agent discovery</div>
</div>

<h2>Quick Start for Agents</h2>
<pre><code># Query for existing verifications (free)
curl https://factorium.network/attestations?type=fact-check

# Purchase an attestation to skip compute
curl -X POST https://factorium.network/attestations/ID/purchase \\
  -H "Content-Type: application/json" \\
  -d '{"buyerId": "your-agent-id"}'

# Check your balance
curl https://factorium.network/wallets/your-agent-id</code></pre>

<h2>Attestation Types</h2>
<pre><code>content-authenticity    Is content AI-generated or authentic?
identity-verification   Is this entity who they claim to be?
document-validation     Is this document legitimate?
deepfake-detection      Is this media manipulated?
code-audit              Has this code been audited?
fact-check              Is this claim verified?
custom                  Any custom verification</code></pre>

<h2>Economics</h2>
<div class="grid" style="margin-top:8px">
<div class="card"><div class="value">10%</div><div class="label">Marketplace Fee</div></div>
<div class="card"><div class="value">1000</div><div class="label">Free Credits (new agents)</div></div>
<div class="card"><div class="value">stake</div><div class="label">Verifier Collateral</div></div>
<div class="card"><div class="value">slashing</div><div class="label">Dispute Resolution</div></div>
</div>

</main>
<footer>
AI2AI Assertion Marketplace v1.0.5 &middot; <a href="https://github.com/Colbster143/ai2ai-assertion-marketplace">GitHub</a> &middot; <a href="https://www.npmjs.com/package/ai2ai-assertion-marketplace">npm</a> &middot; Powered by Lightning Network
</footer>
</body>
</html>`;
}
