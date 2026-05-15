const dailyFacts = [
  {
    type: 'fact-check' as const,
    subject: 'Claim: "The Great Wall of China is visible from space with the naked eye"',
    result: JSON.stringify({ verdict: 'false', explanation: 'No human-made structure is visible from low Earth orbit with the naked eye.' }),
    resultSummary: 'False: The Great Wall is NOT visible from space with the naked eye.',
    confidence: 0.98,
    price: 5,
  },
  {
    type: 'fact-check' as const,
    subject: 'Claim: "Lightning never strikes the same place twice"',
    result: JSON.stringify({ verdict: 'false', explanation: 'Lightning frequently strikes tall structures repeatedly.' }),
    resultSummary: 'False: Lightning strikes tall structures dozens of times per year.',
    confidence: 0.99,
    price: 5,
  },
  {
    type: 'fact-check' as const,
    subject: 'Claim: "Humans only use 10% of their brain"',
    result: JSON.stringify({ verdict: 'false', explanation: 'Brain imaging shows activity throughout the brain.' }),
    resultSummary: 'False: Brain scans show widespread activity; all regions have functions.',
    confidence: 0.99,
    price: 5,
  },
  {
    type: 'content-authenticity' as const,
    subject: 'Statement: "Drinking eight glasses of water daily is medically necessary"',
    result: JSON.stringify({ verdict: 'misleading', explanation: 'The 8x8 rule lacks strong scientific backing.' }),
    resultSummary: 'Misleading: No strong evidence for the 8x8 rule; needs vary.',
    confidence: 0.91,
    price: 8,
  },
  {
    type: 'content-authenticity' as const,
    subject: 'Statement: "Bats are blind"',
    result: JSON.stringify({ verdict: 'false', explanation: 'All bat species have functional eyes.' }),
    resultSummary: 'False: All bats can see; fruit bats have excellent color vision.',
    confidence: 0.97,
    price: 5,
  },
  {
    type: 'identity-verification' as const,
    subject: 'Domain: ai2ai-marketplace.example — ownership verification',
    result: JSON.stringify({ verified: false, reason: 'Domain does not exist.' }),
    resultSummary: 'Unverifiable: Domain does not resolve to any known server.',
    confidence: 0.99,
    price: 3,
  },
  {
    type: 'document-validation' as const,
    subject: 'Hash check: Common SHA-256 collision test vector',
    result: JSON.stringify({ valid: true, note: 'Test vector matches expected output.' }),
    resultSummary: 'Valid: Test vector cryptographic hash matches expected output.',
    confidence: 1.0,
    price: 2,
  },
  {
    type: 'code-audit' as const,
    subject: 'npm package: left-pad — vulnerability assessment',
    result: JSON.stringify({ audited: true, vulnerabilities: 0 }),
    resultSummary: 'Audited: 0 vulnerabilities. 11-line package with zero dependencies.',
    confidence: 0.95,
    price: 15,
  },
];

let seededFactsToday = 0;

export function getTodaysFreshAttestations(): typeof dailyFacts {
  const today = new Date().toISOString().slice(0, 10);
  return dailyFacts.map((f) => ({
    ...f,
    subject: `[${today}] ${f.subject}`,
    resultSummary: `[${today}] ${f.resultSummary}`,
  }));
}

export function getSeededFactsCount(): number {
  return seededFactsToday;
}

export function incrementSeededFactsCount(): void {
  seededFactsToday++;
}

export function shouldSeedToday(lastSeededDate: string | null): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return lastSeededDate !== today;
}
