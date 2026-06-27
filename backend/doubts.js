/**
 * Points de doute — montants estimés, écarts IA, signaux faibles.
 */

import { getFinanceSummary } from './finance.js';
import { reconcileBookingsWithAi } from './ai-booking-verify.js';
import { isDeepSeekConfigured } from './deepseek-client.js';

/**
 * @param {import('better-sqlite3').Database} db
 */
export async function getDataDoubts(db, season = '2026-2027') {
  const finance = getFinanceSummary(db, season);
  const estimatedLines = finance.lines
    .filter(l => l.estimatedAmount && !l.personal)
    .map(l => ({
      id: l.id,
      type: 'estimated_price',
      contactName: l.contactName,
      contactId: l.contactId,
      checkIn: l.checkIn,
      checkOut: l.checkOut,
      amount: l.amount,
      weekCount: l.weekCount || 1,
      label: l.label,
      message: `Montant estimé (${l.amount} €) — saisir le prix réel en Finance`,
    }));

  let aiIssues = [];
  if (isDeepSeekConfigured()) {
    try {
      const report = await reconcileBookingsWithAi(db, { limit: 30, dryRun: true });
      aiIssues = (report.issues || [])
        .filter(i => i.ai && (i.db?.checkIn !== i.ai?.checkIn || i.db?.checkOut !== i.ai?.checkOut || (i.ai?.priceEuros > 0 && i.db?.price !== i.ai?.priceEuros)))
        .map(i => ({
          id: i.stayId,
          type: 'ai_mismatch',
          contactName: i.contactName,
          db: i.db,
          ai: i.ai,
          message: i.ai?.reason || 'Écart détecté par l\'IA — vérifier dates ou montant',
        }));
    } catch { /* ignore */ }
  }

  return {
    season,
    count: estimatedLines.length + aiIssues.length,
    estimatedLines,
    aiIssues,
    canReconcile: isDeepSeekConfigured(),
  };
}
