/**
 * Crée le profil « Barbier et amis » et fusionne les contacts internes.
 * Usage: node backend/setup-personal-contact.js
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  PERSONAL_CONTACT_ID,
  PERSONAL_CONTACT_EMAIL,
  isInternalEmail,
  isInternalName,
  ensurePersonalContact,
} from './host-filter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'emails.db');

if (!existsSync(DB_PATH)) {
  console.error(`❌ Base introuvable: ${DB_PATH}`);
  process.exit(1);
}

const db = new Database(DB_PATH);

for (const sql of [
  'ALTER TABLE contacts ADD COLUMN is_personal INTEGER DEFAULT 0',
  'ALTER TABLE stays ADD COLUMN is_personal INTEGER DEFAULT 0',
  'ALTER TABLE requested_weeks ADD COLUMN is_personal INTEGER DEFAULT 0',
]) {
  try { db.exec(sql); } catch { /* exists */ }
}

ensurePersonalContact(db);
console.log('✅ Profil « Barbier et amis » prêt');

const internals = db.prepare('SELECT * FROM contacts WHERE id != ?').all(PERSONAL_CONTACT_ID);
let merged = 0;
let deleted = 0;

for (const c of internals) {
  const full = `${c.first_name || ''} ${c.name || ''}`.trim();
  if (!isInternalEmail(c.email) && !isInternalName(full) && !isInternalName(c.name)) continue;

  db.prepare('UPDATE emails SET contact_id = ? WHERE contact_id = ?').run(PERSONAL_CONTACT_ID, c.id);
  db.prepare('UPDATE stays SET contact_id = ?, is_personal = 1, price_quoted = 0, price_confirmed = 0 WHERE contact_id = ?')
    .run(PERSONAL_CONTACT_ID, c.id);
  db.prepare('UPDATE requested_weeks SET contact_id = ?, is_personal = 1 WHERE contact_id = ?')
    .run(PERSONAL_CONTACT_ID, c.id);
  db.prepare('UPDATE auto_replies SET contact_id = ? WHERE contact_id = ?').run(PERSONAL_CONTACT_ID, c.id);

  db.prepare('DELETE FROM contacts WHERE id = ?').run(c.id);
  merged++;
  deleted++;
  console.log(`  🔀 Fusionné: ${full || c.email} → Barbier et amis`);
}

db.prepare(`
  UPDATE stays SET is_personal = 1, price_quoted = 0, price_confirmed = 0
  WHERE contact_id = ?
`).run(PERSONAL_CONTACT_ID);

console.log(`\n✅ ${merged} contact(s) interne(s) fusionné(s)`);
db.close();
