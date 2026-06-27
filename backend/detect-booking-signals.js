/**
 * Détection heuristique des signaux de réservation dans les emails.
 * Utilisé par le pipeline refresh (2×/jour) sans appel IA.
 */

import { extractInquiryBest, computeSeason } from './extract-inquiry.js';
import { isNoiseEmail, extractPriceFromEmail } from './price-extract.js';
import { findOverlappingStay, findOverlappingWeek } from './dedupe-bookings.js';

/** @typedef {'deposit_received'|'contract_signed'|'reservation_confirmed'|'contract_finalizing'|'reservation_intent'|'negotiating'|'inquiry'|null} SignalType */

const RULES = [
  {
    type: 'deposit_received',
    label: 'Acompte reçu',
    strength: 100,
    weekStatus: 'booked',
    stayStatus: 'paid',
    patterns: [
      /acompte\s+re[cç]u/i,
      /deposit\s+(?:received|paid)/i,
      /down\s+payment\s+received/i,
      /virement\s+(?:re[cç]u|effectu[eé])/i,
    ],
  },
  {
    type: 'contract_signed',
    label: 'Contrat signé',
    strength: 95,
    weekStatus: 'booked',
    stayStatus: 'confirmed',
    patterns: [
      /contrat\s+sign[eé]/i,
      /contract\s+sign[eéd]/i,
      /signed\s+(?:the\s+)?contract/i,
      /contrat\s+sign[eé]\s+en\s+pj/i,
      /signed\s+contract\s+attached/i,
    ],
  },
  {
    type: 'reservation_confirmed',
    label: 'Réservation confirmée',
    strength: 90,
    weekStatus: 'booked',
    stayStatus: 'confirmed',
    patterns: [
      /r[eé]servation\s+confirm[eé]e/i,
      /booking\s+confirmed/i,
      /(?:je\s+)?confirme\s+(?:la\s+)?(?:r[eé]servation|semaine|s[eé]jour)/i,
      /(?:c['']est\s+)?bon\s+pour\s+(?:la\s+)?semaine/i,
      /(?:arrangement|accord)\s+conclu/i,
      /(?:the\s+)?chalet\s+is\s+(?:now\s+)?(?:booked|reserved)/i,
    ],
  },
  {
    type: 'contract_finalizing',
    label: 'Finalisation contrat',
    strength: 75,
    weekStatus: 'negotiating',
    stayStatus: 'pending',
    patterns: [
      /finalisation\s+(?:du\s+)?contrat/i,
      /finaliz(?:e|ing)\s+(?:the\s+)?contract/i,
      /contrat\s+(?:en\s+cours|à\s+finaliser)/i,
      /(?:envoi|envoie)\s+(?:du\s+)?contrat/i,
    ],
  },
  {
    type: 'reservation_intent',
    label: 'Demande de réservation (en cours)',
    strength: 65,
    weekStatus: 'negotiating',
    stayStatus: 'pending',
    patterns: [
      /(?:would\s+like\s+to\s+)?reserve\s+those\s+dates/i,
      /i\s+would\s+like\s+to\s+reserve/i,
      /(?:je\s+)?(?:souhaite|voudrais)\s+r[eé]server/i,
      /(?:on\s+)?prend\s+(?:la\s+)?semaine/i,
      /(?:we\s+)?(?:take|book)\s+(?:this|those|the)\s+(?:week|dates)/i,
    ],
  },
  {
    type: 'negotiating',
    label: 'En négociation',
    strength: 55,
    weekStatus: 'negotiating',
    stayStatus: 'pending',
    patterns: [
      /en\s+n[eé]gociation/i,
      /(?:still\s+)?negotiat/i,
      /(?:proposition|devis|quote)\s+(?:envoy[eé]|sent)/i,
      /(?:discutons|discuter)\s+(?:du\s+)?prix/i,
    ],
  },
  {
    type: 'inquiry',
    label: 'Demande de disponibilité',
    strength: 40,
    weekStatus: 'asked',
    stayStatus: null,
    patterns: [
      /(?:demande|request).{0,40}(?:r[eé]servation|reservation|booking|disponib)/i,
      /(?:est[- ]ce\s+que|is\s+it).{0,30}disponib/i,
      /(?:available|disponible).{0,40}(?:week|semaine|dates?)/i,
      /demande\s+semaine/i,
    ],
  },
];

/**
 * @param {string} subject
 * @param {string} bodyText
 * @param {string} [mailbox]
 */
export function detectSignalFromEmail(subject, bodyText, mailbox = 'INBOX') {
  const text = `${subject || ''}\n${bodyText || ''}`.trim();
  if (!text || isNoiseEmail(subject, bodyText)) return null;

  let best = null;
  for (const rule of RULES) {
    if (rule.patterns.some(p => p.test(text))) {
      if (!best || rule.strength > best.strength) {
        best = {
          type: rule.type,
          label: rule.label,
          strength: rule.strength,
          weekStatus: rule.weekStatus,
          stayStatus: rule.stayStatus,
        };
      }
    }
  }

  if (!best) return null;

  // Contrat signé + acompte dans le même mail
  if (/contrat\s+sign/i.test(text) && /acompte\s+re[cç]u/i.test(text)) {
    best = { ...best, type: 'deposit_received', label: 'Contrat signé + acompte reçu', strength: 100, stayStatus: 'paid', weekStatus: 'booked' };
  }

  return best;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {object} email row with contact_id
 */
export function applySignalToContact(db, email, signal, dates) {
  const contactId = email.contact_id;
  if (!contactId || !signal) return { updated: false };

  const checkIn = dates?.checkIn;
  const checkOut = dates?.checkOut;
  if (!checkIn || !checkOut) return { updated: false };

  const season = computeSeason(checkIn);
  const nights = Math.max(1, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
  const adults = dates.adults || 1;

  let weekUpdated = false;
  let stayUpdated = false;

  const existingWeek = findOverlappingWeek(db, contactId, checkIn, checkOut)
    || db.prepare(`
      SELECT * FROM requested_weeks WHERE contact_id = ? AND check_in = ? AND check_out = ?
    `).get(contactId, checkIn, checkOut);

  const weekStatus = signal.weekStatus || 'asked';
  if (existingWeek) {
    if (existingWeek.manual_lock === 1) return { updated: false, skipped: 'manual_lock' };
    const curStrength = statusStrength(existingWeek.status);
    if (signal.strength >= curStrength) {
      db.prepare(`
        UPDATE requested_weeks SET status = ?, notes = ?, season = ?,
          check_in = MIN(check_in, ?), check_out = MAX(check_out, ?)
        WHERE id = ?
      `).run(weekStatus, `${signal.label} — ${email.date?.slice(0, 10) || ''}`, season, checkIn, checkOut, existingWeek.id);
      weekUpdated = true;
    }
  } else {
    const weekId = generateId();
    db.prepare(`
      INSERT INTO requested_weeks (id, contact_id, season, check_in, check_out, adults, children, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(weekId, contactId, season, checkIn, checkOut, adults, weekStatus, `${signal.label} — auto`);
    weekUpdated = true;
  }

  if (signal.stayStatus) {
    const existingStay = findOverlappingStay(db, contactId, checkIn, checkOut)
      || db.prepare(`
        SELECT * FROM stays WHERE contact_id = ? AND check_in = ? AND check_out = ?
      `).get(contactId, checkIn, checkOut);

    const stayStatus = signal.stayStatus;
    const extractedPrice = extractPriceFromEmail(email.subject, email.body_text);

    if (existingStay) {
      if (existingStay.manual_lock === 1) {
        return { updated: weekUpdated, skipped: 'manual_lock' };
      }
      const cur = stayRank(existingStay.status);
      const next = stayRank(stayStatus);
      if (next >= cur) {
        const hasPrice = Number(existingStay.price_confirmed || existingStay.price_quoted || 0) > 0;
        const priceQuoted = hasPrice ? existingStay.price_quoted : (extractedPrice || existingStay.price_quoted || 0);
        const priceConfirmed = hasPrice ? existingStay.price_confirmed : (extractedPrice || existingStay.price_confirmed || 0);
        db.prepare(`
          UPDATE stays SET status = ?, notes = ?, season = ?, nights = ?, adults = ?,
            check_in = MIN(check_in, ?), check_out = MAX(check_out, ?),
            price_quoted = CASE WHEN ? > 0 THEN ? ELSE price_quoted END,
            price_confirmed = CASE WHEN ? > 0 THEN ? ELSE price_confirmed END
          WHERE id = ?
        `).run(
          stayStatus,
          `${signal.label} (${email.date?.slice(0, 10) || ''})`,
          season,
          nights,
          adults,
          checkIn, checkOut,
          extractedPrice || 0, priceQuoted,
          extractedPrice || 0, priceConfirmed,
          existingStay.id,
        );
        stayUpdated = true;
      }
    } else {
      const stayId = generateId();
      db.prepare(`
        INSERT INTO stays (id, contact_id, season, check_in, check_out, nights, adults, children,
          price_quoted, price_confirmed, status, source_email_id, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
      `).run(
        stayId, contactId, season, checkIn, checkOut, nights, adults,
        extractedPrice || 0, extractedPrice || 0,
        stayStatus, email.id, `${signal.label} — auto`,
      );
      stayUpdated = true;
    }
  }

  if (signal.stayStatus === 'confirmed' || signal.stayStatus === 'paid') {
    db.prepare(`UPDATE contacts SET status = 'client', updated_at = datetime('now') WHERE id = ?`).run(contactId);
  }

  return { updated: weekUpdated || stayUpdated, weekUpdated, stayUpdated };
}

function findDatesForContact(db, contactId, email) {
  const texts = [
    `${email.subject || ''}\n${email.body_text || ''}`,
    email.body_text,
  ];

  let best = null;

  function consider(text, refDate) {
    if (!text) return;
    const dates = extractInquiryBest(text, refDate);
    if (!dates?.checkIn) return;
    if (!best || (dates.nights || 0) > (best.nights || 0)) best = dates;
  }

  for (const text of texts) consider(text, email.date);

  const others = db.prepare(`
    SELECT subject, body_text, date FROM emails
    WHERE contact_id = ?
    ORDER BY date DESC LIMIT 50
  `).all(contactId);

  for (const row of others) {
    consider(`${row.subject || ''}\n${row.body_text || ''}`, row.date);
  }

  if (best) return best;

  const week = db.prepare(`
    SELECT check_in, check_out, adults FROM requested_weeks
    WHERE contact_id = ? ORDER BY check_in DESC LIMIT 1
  `).get(contactId);
  if (week) {
    return { checkIn: week.check_in, checkOut: week.check_out, adults: week.adults };
  }

  const stay = db.prepare(`
    SELECT check_in, check_out, adults FROM stays
    WHERE contact_id = ? ORDER BY check_in DESC LIMIT 1
  `).get(contactId);
  if (stay) {
    return { checkIn: stay.check_in, checkOut: stay.check_out, adults: stay.adults };
  }

  return null;
}

/**
 * Scan recent emails and apply booking signals.
 * @param {import('better-sqlite3').Database} db
 * @param {{ sinceDays?: number, limit?: number }} opts
 */
export function refreshBookingStatuses(db, opts = {}) {
  const sinceDays = opts.sinceDays ?? 120;
  const limit = opts.limit ?? 500;
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const sinceIso = since.toISOString();

  const emails = db.prepare(`
    SELECT e.*, c.name AS contact_name
    FROM emails e
    JOIN contacts c ON c.id = e.contact_id
    WHERE e.contact_id IS NOT NULL
      AND e.date >= ?
      AND e.body_text != ''
    ORDER BY e.date ASC
    LIMIT ?
  `).all(sinceIso, limit);

  let signals = 0;
  let applied = 0;
  const recent = [];

  for (const email of emails) {
    const signal = detectSignalFromEmail(email.subject, email.body_text, email.mailbox);
    if (!signal) continue;
    signals++;

    let dates = findDatesForContact(db, email.contact_id, email);
    if (!dates?.checkIn) continue;

    const result = applySignalToContact(db, email, signal, dates);
    if (result.updated) applied++;

    recent.push({
      contactId: email.contact_id,
      contactName: email.contact_name,
      label: signal.label,
      type: signal.type,
      strength: signal.strength,
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
      emailDate: email.date,
      emailId: email.id,
    });
  }

  // total_stays + statuts contacts
  db.prepare(`
    UPDATE contacts SET total_stays = (
      SELECT COUNT(*) FROM stays WHERE stays.contact_id = contacts.id
        AND status IN ('confirmed', 'paid')
    )
  `).run();

  db.prepare(`
    UPDATE contacts SET status = 'client' WHERE id IN (
      SELECT DISTINCT contact_id FROM stays WHERE status IN ('confirmed', 'paid')
    )
  `).run();

  // Dédupliquer recent (dernier signal par contact)
  const byContact = new Map();
  for (const s of recent) byContact.set(s.contactId, s);

  return {
    emailsScanned: emails.length,
    signalsDetected: signals,
    recordsUpdated: applied,
    recentSignals: [...byContact.values()].sort((a, b) => (b.emailDate || '').localeCompare(a.emailDate || '')),
  };
}

function statusStrength(status) {
  const m = { booked: 100, negotiating: 60, asked: 40, abandoned: 10 };
  return m[status] ?? 0;
}

function stayRank(status) {
  const m = { paid: 4, confirmed: 3, pending: 2, cancelled: 0, no_show: 0 };
  return m[status] ?? 1;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export { computeSeason };
