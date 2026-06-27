/**
 * Nettoie les corps d'emails (MIME, base64, quoted-printable) et supprime les notifications WPForms inutiles.
 *
 * Usage: node backend/fix-email-bodies.js
 */

import 'dotenv/config';
import { existsSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { cleanStoredBodyText, isGarbageEmailBody } from './email-body.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'emails.db');

if (!existsSync(DB_PATH)) {
  console.error(`❌ Base introuvable: ${DB_PATH}`);
  process.exit(1);
}

const db = new Database(DB_PATH);

const deletedWp = db.prepare(`
  DELETE FROM emails
  WHERE subject = 'New Entry: Contact Form 1'
    AND (body_text LIKE '%WPForms%' OR body_text LIKE '%@media only screen%')
`).run();

const rows = db.prepare(`
  SELECT id, subject, body_text FROM emails
  WHERE body_text LIKE '%Content-Transfer-Encoding%'
     OR body_text LIKE '%Content-Type:%'
     OR body_text LIKE '--=_%'
     OR body_text LIKE '%=0A%'
     OR body_text LIKE '%=C3=%'
     OR body_text LIKE '%/9j/%'
     OR body_text LIKE '%Content-Disposition:%'
     OR instr(body_text, char(65533)) > 0
     OR (length(body_text) > 80 AND body_text GLOB '[A-Za-z0-9+/=]*')
`).all();

const update = db.prepare('UPDATE emails SET body_text = ? WHERE id = ?');
const del = db.prepare('DELETE FROM emails WHERE id = ?');
let fixed = 0;
let removed = 0;

for (const row of rows) {
  const cleaned = cleanStoredBodyText(row.body_text || '');
  if (isGarbageEmailBody(cleaned, row.subject) && isGarbageEmailBody(row.body_text, row.subject)) {
    del.run(row.id);
    removed++;
    continue;
  }
  const isImage = cleaned.startsWith('Photo jointe');
  const improved = cleaned && cleaned !== row.body_text && (
    isImage
    || ((cleaned.match(/\ufffd/g) || []).length < (row.body_text.match(/\ufffd/g) || []).length)
    || (cleaned.length > 10 && !row.body_text.includes('Content-Disposition'))
  );
  if (improved) {
    update.run(cleaned, row.id);
    fixed++;
  }
}

console.log(`✅ ${fixed} corps nettoyés · ${removed} messages inutiles supprimés · ${deletedWp.changes} notifications WPForms supprimées`);

const deployPath = join(__dirname, 'deploy', 'emails.db');
try {
  copyFileSync(DB_PATH, deployPath);
  console.log(`✅ Copié vers ${deployPath}`);
} catch { /* ignore */ }

db.close();
