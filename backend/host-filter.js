/**
 * Emails / contacts internes (famille Barbier) — ne pas créer de fiches clients.
 */

export const PERSONAL_CONTACT_ID = 'barbier-et-amis';
export const PERSONAL_CONTACT_EMAIL = 'famille.barbier@interne.local';

export const HOST_DOMAINS = ['alpicois-laplagne.fr'];

export const INTERNAL_EMAIL_PATTERNS = [
  /barbier\.famille@orange\.fr/i,
  /gilles\.barbier@/i,
  /mre\.barbier@/i,
  /remi\.barbier@/i,
  /maba2000@orange\.fr/i,
  /claire\.phelippeau@/i,
  /michel\.?phelippeau@/i,
  /famille\.barbier@interne\.local/i,
];

export const INTERNAL_NAME_PATTERNS = [
  /^gilles\s+barbier/i,
  /^claire\s+barbier/i,
  /^claire\s+phelippeau/i,
  /barbier\s+phelippeau/i,
  /^barbier\s+gilles/i,
  /^barbier\s+claire/i,
];

export function isHostEmail(email) {
  if (!email) return false;
  const lower = email.toLowerCase();
  return HOST_DOMAINS.some(d => lower.includes(d));
}

export function isInternalEmail(email) {
  if (!email) return false;
  const lower = email.toLowerCase().trim();
  if (isHostEmail(lower)) return true;
  return INTERNAL_EMAIL_PATTERNS.some(p => p.test(lower));
}

/** @param {import('better-sqlite3').Database} db */
export function ensurePersonalContact(db) {
  try { db.exec('ALTER TABLE contacts ADD COLUMN is_personal INTEGER DEFAULT 0'); } catch { /* exists */ }
  const row = db.prepare('SELECT id FROM contacts WHERE id = ?').get(PERSONAL_CONTACT_ID);
  if (row) return PERSONAL_CONTACT_ID;
  db.prepare(`
    INSERT INTO contacts (
      id, name, first_name, email, alternate_emails, phone, alternate_phones,
      origin, origin_detail, status, nationality, address, postal_code, country,
      notes, first_contact_date, last_contact_date, total_stays, is_personal, created_at, updated_at
    ) VALUES (?, 'et amis', 'Barbier', ?, '[]', '', '[]', 'other', 'Usage familial', 'client', 'Française', '', '', 'France',
      'Semaines personnelles — 0 € encaissé', datetime('now'), datetime('now'), 0, 1, datetime('now'), datetime('now'))
  `).run(PERSONAL_CONTACT_ID, PERSONAL_CONTACT_EMAIL);
  return PERSONAL_CONTACT_ID;
}

export function isInternalName(name) {
  if (!name) return false;
  return INTERNAL_NAME_PATTERNS.some(p => p.test(name.trim()));
}

export function isInternalContact(contact) {
  if (!contact) return false;
  if (contact.is_personal || contact.isPersonal) return true;
  if (contact.id === PERSONAL_CONTACT_ID) return true;
  if (isInternalEmail(contact.email)) return true;
  const full = [contact.first_name || contact.firstName, contact.name].filter(Boolean).join(' ');
  return isInternalName(full) || isInternalName(contact.name || '');
}
