/**
 * Lie les emails sans contact_id à un contact existant ou en crée un.
 */

import { formatContactName } from './name-format.js';
import {
  isInternalEmail,
  isHostEmail,
  ensurePersonalContact,
  PERSONAL_CONTACT_ID,
  PERSONAL_CONTACT_EMAIL,
} from './host-filter.js';

const IGNORE_EMAIL_PATTERNS = [
  /airbnb/i, /leboncoin/i, /newsletter/i, /noreply/i, /no-reply/i, /donotreply/i,
  /mailer-daemon/i, /postmaster/i, /lerefugeduloueur/i,
];
const IGNORE_DOMAIN_PATTERNS = [
  /la-plagne\.(com|fr)/i, /laplagne\./i, /leboncoin\.fr/i, /airbnb\.com/i,
  /hostinger\.com/i, /wordpress\.com/i,
];

function extractEmails(str) {
  if (!str) return [];
  return [...str.matchAll(/[\w.+-]+@[\w.-]+\.\w+/gi)].map(m => m[0].toLowerCase());
}

function shouldIgnore(email) {
  if (!email) return true;
  if (isHostEmail(email)) return true;
  if (isInternalEmail(email)) return true;
  if (IGNORE_EMAIL_PATTERNS.some(p => p.test(email))) return true;
  const domain = email.split('@')[1] || '';
  if (IGNORE_DOMAIN_PATTERNS.some(p => p.test(domain))) return true;
  return false;
}

/** Guest email embedded in WPForms / site contact-form bodies (relay via barbier.famille). */
function guestFromContactFormBody(row) {
  const subject = row.subject || '';
  const body = row.body_text || '';
  const sender = extractEmails(row.sender)[0] || '';
  const isForm = /New Entry:\s*Contact Form/i.test(subject)
    || /WPForms|field-value|Votre nom|Your Message/i.test(body)
    || /barbier\.famille@orange\.fr/i.test(sender);
  if (!isForm) return null;

  const mailto = body.match(/mailto:([\w.+-]+@[\w.-]+\.\w+)/i)?.[1];
  if (mailto && !shouldIgnore(mailto.toLowerCase())) return mailto.toLowerCase();

  const labelled = body.match(/(?:^|\n)\s*Email\s*:\s*([\w.+-]+@[\w.-]+\.\w+)/i)?.[1];
  if (labelled && !shouldIgnore(labelled.toLowerCase())) return labelled.toLowerCase();

  const emails = extractEmails(body).filter(e => !shouldIgnore(e) && !isInternalEmail(e));
  return emails[0] || null;
}

function guestNameFromContactFormBody(row) {
  const body = row.body_text || '';
  const labelled = body.match(/(?:Votre nom|Nom|Name)\s*:\s*([^\n]+)/i)?.[1]?.trim();
  if (labelled && labelled.length >= 2 && !labelled.includes('@')) return labelled;
  const name = (row.sender_name || '').trim();
  if (name && !name.includes('@') && !/^barbier/i.test(name)) return name;
  return null;
}

function guestFromEmail(row) {
  const sender = extractEmails(row.sender)[0];
  const isSent = row.mailbox === 'INBOX.Sent';

  if (isSent) {
    const recipients = extractEmails(row.recipients);
    return recipients.find(e => !shouldIgnore(e)) || null;
  }
  // Site form relay: real guest lives in the body, not the From: address.
  const formGuest = guestFromContactFormBody(row);
  if (formGuest) return formGuest;
  if (shouldIgnore(sender)) return null;
  return sender;
}

function guestNameFromEmail(row, guestEmail) {
  if (row.mailbox === 'INBOX.Sent') {
    const m = row.recipients.match(/^([^<]+)</);
    if (m) return m[1].trim().replace(/"/g, '');
    return guestEmail?.split('@')[0] || 'Contact';
  }
  const formName = guestNameFromContactFormBody(row);
  if (formName) return formName;
  const name = (row.sender_name || '').trim();
  if (name && !name.includes('@')) return name;
  return guestEmail?.split('@')[0] || 'Contact';
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * @param {import('better-sqlite3').Database} db
 */
export function linkOrphanEmails(db) {
  try {
    db.exec('ALTER TABLE emails ADD COLUMN contact_id TEXT');
  } catch { /* exists */ }
  db.exec("UPDATE emails SET contact_id = NULL WHERE contact_id = ''");

  ensurePersonalContact(db);

  const orphans = db.prepare(`
    SELECT e.*
    FROM emails e
    LEFT JOIN contacts c ON c.id = e.contact_id
    WHERE e.contact_id IS NULL OR c.id IS NULL
    ORDER BY e.date ASC
  `).all();

  const getByEmail = db.prepare('SELECT id, name FROM contacts WHERE email = ?');
  const getById = db.prepare('SELECT id, name FROM contacts WHERE id = ?');
  const insertContact = db.prepare(`
    INSERT INTO contacts (
      id, name, first_name, email, alternate_emails, phone, alternate_phones,
      origin, origin_detail, status, nationality, address, postal_code, country,
      notes, first_contact_date, last_contact_date, total_stays, created_at, updated_at
    ) VALUES (?, ?, ?, ?, '[]', '', '[]', 'email', '', 'prospect', '', '', '', '', '', ?, ?, 0, datetime('now'), datetime('now'))
  `);
  const linkEmail = db.prepare('UPDATE emails SET contact_id = ? WHERE id = ?');
  const touchContact = db.prepare(`
    UPDATE contacts SET
      last_contact_date = CASE WHEN ? > last_contact_date THEN ? ELSE last_contact_date END,
      updated_at = datetime('now')
    WHERE id = ?
  `);

  let linked = 0;
  let created = 0;

  for (const row of orphans) {
    const guest = guestFromEmail(row);
    if (!guest) continue;

    let contact;
    if (isInternalEmail(guest)) {
      contact = getById.get(PERSONAL_CONTACT_ID) || getByEmail.get(PERSONAL_CONTACT_EMAIL);
    } else {
      contact = getByEmail.get(guest);
    }

    if (!contact) {
      const rawName = guestNameFromEmail(row, guest);
      const formatted = formatContactName(rawName, guest);
      const contactId = generateId();
      insertContact.run(
        contactId,
        formatted.lastName || formatted.displayName,
        formatted.firstName || '',
        guest,
        row.date || new Date().toISOString(),
        row.date || new Date().toISOString(),
      );
      contact = { id: contactId, name: formatted.lastName || formatted.displayName };
      created++;
    } else {
      touchContact.run(row.date, row.date, contact.id);
    }

    linkEmail.run(contact.id, row.id);
    linked++;
  }

  return { linked, created, orphans: orphans.length };
}
