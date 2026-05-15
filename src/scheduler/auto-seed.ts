import { getDatabase } from '../registry/database.js';
import { submitAttestation } from '../registry/attestations.js';
import { listVerifiers } from '../registry/verifiers.js';
import { getTodaysFreshAttestations, incrementSeededFactsCount } from './seed-data.js';

let lastSeedDate: string | null = null;

export function autoSeedDailyIfNeeded(): { seeded: number; skipped: boolean } {
  const db = getDatabase();
  const today = new Date().toISOString().slice(0, 10);

  if (lastSeedDate === today) {
    return { seeded: 0, skipped: true };
  }

  const countRow = db
    .prepare("SELECT COUNT(*) as count FROM attestations WHERE subject LIKE ?")
    .get(`[${today}]%`) as { count: number };

  if (countRow.count > 0) {
    lastSeedDate = today;
    return { seeded: 0, skipped: true };
  }

  const verifiers = listVerifiers(true);
  if (verifiers.length === 0) {
    return { seeded: 0, skipped: true };
  }

  const facts = getTodaysFreshAttestations();
  let seeded = 0;

  for (const fact of facts) {
    try {
      const verifier = verifiers[seeded % verifiers.length];
      submitAttestation({
        type: fact.type,
        subject: fact.subject,
        result: fact.result,
        resultSummary: fact.resultSummary,
        confidence: fact.confidence,
        price: fact.price,
        verifierId: verifier.id,
        royaltyPerAccess: 0,
        expiresInSeconds: 86400 * 7,
        metadata: { autoSeeded: true, date: today },
      });
      seeded++;
      incrementSeededFactsCount();
    } catch {
      // Skip duplicates
    }
  }

  lastSeedDate = today;
  return { seeded, skipped: false };
}
