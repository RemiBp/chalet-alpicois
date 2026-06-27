/**
 * Retrouve le mail justificatif d'une confirmation calendrier.
 */

import { detectSignalFromEmail } from './detect-booking-signals.js';
import { cleanStoredBodyText } from './email-body.js';

const STRONG_SIGNALS = new Set([
  'deposit_received',
  'contract_signed',
  'reservation_confirmed',
]);

function formatEvidence(row, signalLabel) {
  const body = cleanStoredBodyText(row.body_text || '');
  return {
    id: String(row.id),
    subject: row.subject || '(sans objet)',
    date: row.date,
    senderName: row.sender_name || '',
    mailbox: row.mailbox,
    signalLabel: signalLabel || '',
    bodyPreview: body.slice(0, 320),
    bodyText: body.slice(0, 6000),
  };
}

function datesMentioned(text, checkIn, checkOut) {
  if (!text || !checkIn) return false;
  const t = text.toLowerCase();
  if (t.includes(checkIn) || t.includes(checkIn.slice(0, 7))) return true;
  if (checkOut && t.includes(checkOut)) return true;
  const y = checkIn.slice(0, 4);
  const m = checkIn.slice(5, 7);
  return t.includes(`${m}/${y}`) || t.includes(`${m}-${y}`);
}

/**
 * @param {import('better-sqlite3').Database} db
 */
export function findEventEvidenceEmail(db, { contactId, checkIn, checkOut, sourceEmailId, notes }) {
  if (sourceEmailId) {
    const row = db.prepare(`
      SELECT id, subject, date, body_text, sender_name, mailbox FROM emails WHERE id = ?
    `).get(sourceEmailId);
    if (row) {
      const signal = detectSignalFromEmail(row.subject, row.body_text, row.mailbox);
      return formatEvidence(row, signal?.label || 'Mail source du séjour');
    }
  }

  if (!contactId) return null;

  const emails = db.prepare(`
    SELECT id, subject, date, body_text, sender_name, mailbox FROM emails
    WHERE contact_id = ? ORDER BY date DESC LIMIT 100
  `).all(contactId);

  const noteDate = notes?.match(/\d{4}-\d{2}-\d{2}/)?.[0];

  for (const email of emails) {
    const signal = detectSignalFromEmail(email.subject, email.body_text, email.mailbox);
    if (!signal || signal.strength < 85) continue;
    if (datesMentioned(`${email.subject}\n${email.body_text}`, checkIn, checkOut)) {
      return formatEvidence(email, signal.label);
    }
    if (noteDate && email.date?.startsWith(noteDate)) {
      return formatEvidence(email, signal.label);
    }
  }

  for (const email of emails) {
    const signal = detectSignalFromEmail(email.subject, email.body_text, email.mailbox);
    if (signal && STRONG_SIGNALS.has(signal.type)) {
      return formatEvidence(email, signal.label);
    }
  }

  for (const email of emails) {
    if (email.mailbox === 'INBOX.Sent' || email.mailbox === 'SENT') continue;
    const signal = detectSignalFromEmail(email.subject, email.body_text, email.mailbox);
    if (signal && signal.strength >= 65) {
      return formatEvidence(email, signal.label);
    }
  }

  const latestGuest = emails.find(e => e.mailbox !== 'INBOX.Sent' && e.mailbox !== 'SENT');
  return latestGuest ? formatEvidence(latestGuest, 'Conversation') : null;
}
