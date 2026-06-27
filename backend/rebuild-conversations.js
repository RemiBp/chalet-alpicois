/**
 * Rebuild contacts from scratch — one person per correspondent email,
 * linked to all INBOX + Sent messages. Clears stays / inferred booking data.
 *
 * Usage: node backend/rebuild-conversations.js
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { formatContactName } from './name-format.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'emails.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const HOST_DOMAINS = ['alpicois-laplagne.fr'];
const IGNORE_EMAIL_PATTERNS = [
  /airbnb/i, /leboncoin/i, /newsletter/i, /noreply/i, /no-reply/i, /donotreply/i,
  /mailer-daemon/i, /postmaster/i, /lerefugeduloueur/i,
  /barbier\.famille@orange\.fr/i,
];
const IGNORE_DOMAIN_PATTERNS = [
  /la-plagne\.(com|fr)/i, /laplagne\./i, /leboncoin\.fr/i, /airbnb\.com/i,
  /hostinger\.com/i, /wordpress\.com/i,
];

function extractEmails(str) {
  if (!str) return [];
  return [...str.matchAll(/[\w.+-]+@[\w.-]+\.\w+/gi)].map(m => m[0].toLowerCase());
}

function isHost(email) {
  return HOST_DOMAINS.some(d => email.includes(d));
}

function shouldIgnore(email) {
  if (!email) return true;
  if (isHost(email)) return true;
  if (IGNORE_EMAIL_PATTERNS.some(p => p.test(email))) return true;
  const domain = email.split('@')[1] || '';
  if (IGNORE_DOMAIN_PATTERNS.some(p => p.test(domain))) return true;
  return false;
}

function guestFromEmail(row) {
  const sender = extractEmails(row.sender)[0];
  const isSent = row.mailbox === 'INBOX.Sent';

  if (isSent) {
    const recipients = extractEmails(row.recipients);
    return recipients.find(e => !shouldIgnore(e)) || null;
  }

  if (shouldIgnore(sender)) return null;
  return sender;
}

function guestNameFromEmail(row, guestEmail) {
  if (row.mailbox === 'INBOX.Sent') {
    const m = row.recipients.match(/^([^<]+)</);
    if (m) return m[1].trim().replace(/"/g, '');
    return guestEmail?.split('@')[0] || 'Contact';
  }
  const name = (row.sender_name || '').trim();
  if (name && !name.includes('@')) return name;
  return guestEmail?.split('@')[0] || 'Contact';
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

console.log('═══════════════════════════════════════');
console.log('  Rebuild conversations from emails');
console.log('═══════════════════════════════════════\n');

// Schema: contact_id on emails
try {
  db.exec('ALTER TABLE emails ADD COLUMN contact_id TEXT');
} catch {
  // already exists
}

// Wipe inferred data — keep raw emails
db.exec(`
  DELETE FROM stays;
  DELETE FROM requested_weeks;
  DELETE FROM contact_interactions;
  DELETE FROM auto_replies;
  UPDATE emails SET contact_id = NULL, parsed = 0;
  DELETE FROM contacts;
`);

const emails = db.prepare('SELECT * FROM emails ORDER BY date ASC').all();
console.log(`📧 ${emails.length} emails to process`);

const byGuest = new Map();

for (const row of emails) {
  const guest = guestFromEmail(row);
  if (!guest) continue;
  if (!byGuest.has(guest)) byGuest.set(guest, { emails: [], names: new Map() });
  const bucket = byGuest.get(guest);
  bucket.emails.push(row);
  const name = guestNameFromEmail(row, guest);
  if (name) bucket.names.set(name, (bucket.names.get(name) || 0) + 1);
}

const insertContact = db.prepare(`
  INSERT INTO contacts (
    id, name, first_name, email, alternate_emails, phone, alternate_phones,
    origin, origin_detail, status, nationality, address, postal_code, country,
    notes, first_contact_date, last_contact_date, total_stays, created_at, updated_at
  ) VALUES (?, ?, ?, ?, '[]', '', '[]', 'email', '', 'prospect', '', '', '', '', '', ?, ?, 0, datetime('now'), datetime('now'))
`);

const linkEmail = db.prepare('UPDATE emails SET contact_id = ? WHERE id = ?');

const tx = db.transaction(() => {
  for (const [guestEmail, { emails: msgs, names }] of byGuest) {
    const bestRaw = [...names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || guestEmail.split('@')[0];
    const formatted = formatContactName(bestRaw, guestEmail);
    const dates = msgs.map(m => m.date).filter(Boolean).sort();
    const contactId = generateId();
    insertContact.run(
      contactId,
      formatted.lastName || formatted.displayName,
      formatted.firstName || '',
      guestEmail,
      dates[0] || new Date().toISOString(),
      dates[dates.length - 1] || dates[0] || new Date().toISOString(),
    );
    for (const m of msgs) linkEmail.run(contactId, m.id);
  }
});

tx();

const contactCount = db.prepare('SELECT COUNT(*) as c FROM contacts').get().c;
const linked = db.prepare('SELECT COUNT(*) as c FROM emails WHERE contact_id IS NOT NULL').get().c;

console.log(`\n✅ ${contactCount} contacts created`);
console.log(`✅ ${linked} emails linked`);
console.log('✅ Stays / bookings cleared — conversations only\n');
