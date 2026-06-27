/**
 * Vérification IA (DeepSeek) des séjours vs conversation email.
 * Corrige check_in/check_out/prix si manual_lock = 0 et confiance élevée.
 */

import { deepseekChat, parseJsonFromAi, isDeepSeekConfigured } from './deepseek-client.js';
import { computeSeason } from './extract-inquiry.js';
import { appendAudit } from './audit-log.js';
import { isInternalContact } from './host-filter.js';
import { dedupeOverlappingBookings, planDedupeOverlappingBookings } from './dedupe-bookings.js';

const BOOKING_PROMPT = `Tu analyses la conversation email d'un client du Chalet L'Alpicois (location semaine dimanche→dimanche, saison ski).

Extrais UNIQUEMENT ce qui est explicitement dit. N'invente jamais de dates ni de prix.

JSON strict (pas de markdown) :
{
  "checkIn": "YYYY-MM-DD ou null",
  "checkOut": "YYYY-MM-DD ou null",
  "priceEuros": 0,
  "status": "confirmed" | "paid" | "negotiating" | "inquiry" | "none",
  "confidence": "high" | "medium" | "low",
  "reason": "citation courte"
}

Règles :
- confirmed/paid seulement si contrat signé, acompte reçu, ou "je confirme" explicite.
- Si plusieurs plages de dates, prends la plage la PLUS RÉCENTE et la PLUS LONGUE confirmée.
- priceEuros = montant total du séjour si écrit (ex. 4800€ pour 2 semaines), sinon 0.
- confidence high si dates explicites "du X au Y mois année".`;

function diffNights(a, b) {
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
}

function corpusForContact(db, contactId, maxEmails = 12) {
  const rows = db.prepare(`
    SELECT date, subject, body_text, mailbox FROM emails
    WHERE contact_id = ? AND body_text != ''
    ORDER BY date DESC LIMIT ?
  `).all(contactId, maxEmails);
  return rows.reverse().map(e => (
    `[${(e.date || '').slice(0, 10)}] ${e.mailbox} — ${e.subject}\n${(e.body_text || '').slice(0, 3500)}`
  )).join('\n\n---\n\n');
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} contactId
 */
export async function aiExtractBookingForContact(db, contactId) {
  const corpus = corpusForContact(db, contactId);
  if (!corpus.trim()) return null;

  const content = await deepseekChat([
    { role: 'system', content: BOOKING_PROMPT },
    { role: 'user', content: `Contact ID ${contactId}\n\n${corpus.slice(0, 12000)}` },
  ], { maxTokens: 500 });

  const parsed = parseJsonFromAi(content);
  if (!parsed?.checkIn || !parsed?.checkOut) return { ...parsed, applied: false };

  const nights = diffNights(parsed.checkIn, parsed.checkOut);
  if (nights < 1 || nights > 21) return { ...parsed, applied: false, reason: 'nights out of range' };

  return parsed;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ limit?: number, dryRun?: boolean }} opts
 */
export async function reconcileBookingsWithAi(db, opts = {}) {
  if (!isDeepSeekConfigured()) {
    return { ok: false, error: 'DEEPSEEK_API_KEY non configuré', checked: 0, fixed: 0, issues: [] };
  }

  const limit = opts.limit ?? 25;
  const dryRun = opts.dryRun === true;

  const stays = db.prepare(`
    SELECT s.*, c.name AS contact_name, c.first_name, c.email, c.is_personal
    FROM stays s JOIN contacts c ON c.id = s.contact_id
    WHERE s.status IN ('confirmed', 'paid', 'pending')
      AND s.manual_lock = 0
      AND s.check_in >= '2026-12-01'
    ORDER BY s.check_in ASC
    LIMIT ?
  `).all(limit);

  const issues = [];
  let fixed = 0;

  for (const stay of stays) {
    if (isInternalContact(stay) || stay.is_personal === 1) continue;

    try {
      const ai = await aiExtractBookingForContact(db, stay.contact_id);
      if (!ai?.checkIn) continue;

      const dateMismatch = ai.checkIn !== stay.check_in || ai.checkOut !== stay.check_out;
      const priceAi = Number(ai.priceEuros || 0);
      const priceDb = Number(stay.price_confirmed || stay.price_quoted || 0);
      const priceMismatch = priceAi > 0 && priceAi !== priceDb;
      const statusAi = ai.status === 'paid' ? 'paid' : ai.status === 'confirmed' ? 'confirmed' : stay.status;

      if (!dateMismatch && !priceMismatch && statusAi === stay.status) continue;

      const issue = {
        stayId: stay.id,
        contactName: [stay.first_name, stay.contact_name].filter(Boolean).join(' '),
        db: { checkIn: stay.check_in, checkOut: stay.check_out, price: priceDb, status: stay.status },
        ai: { checkIn: ai.checkIn, checkOut: ai.checkOut, price: priceAi, status: statusAi, confidence: ai.confidence, reason: ai.reason },
      };
      issues.push(issue);

      if (ai.confidence !== 'high' || dryRun) continue;

      const nights = diffNights(ai.checkIn, ai.checkOut);
      const season = computeSeason(ai.checkIn);
      const price = priceAi || priceDb;

      db.prepare(`
        UPDATE stays SET check_in = ?, check_out = ?, nights = ?, season = ?,
          price_quoted = CASE WHEN ? > 0 THEN ? ELSE price_quoted END,
          price_confirmed = CASE WHEN ? > 0 THEN ? ELSE price_confirmed END,
          status = ?, notes = COALESCE(notes,'') || ' — Vérifié IA'
        WHERE id = ? AND manual_lock = 0
      `).run(
        ai.checkIn, ai.checkOut, nights, season,
        price, price, price, price,
        statusAi, stay.id,
      );

      db.prepare(`
        UPDATE requested_weeks SET check_in = ?, check_out = ?, season = ?, status = 'booked'
        WHERE contact_id = ? AND check_in = ? AND manual_lock = 0
      `).run(ai.checkIn, ai.checkOut, season, stay.contact_id, stay.check_in);

      appendAudit(db, {
        action: 'ai_reconcile',
        entityType: 'stay',
        entityId: stay.id,
        contactId: stay.contact_id,
        payload: issue,
      });
      fixed++;
    } catch (err) {
      issues.push({ stayId: stay.id, error: err.message });
    }
  }

  const dedupe = dryRun ? planDedupeOverlappingBookings(db) : dedupeOverlappingBookings(db);

  return { ok: true, checked: stays.length, fixed, dryRun, issues, dedupe };
}
