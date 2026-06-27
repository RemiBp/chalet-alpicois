/**
 * Normalise les noms de contacts en base (prénom / nom / affichage).
 *
 * Usage:
 *   node format-names.js           # applique
 *   node format-names.js --dry-run # aperçu sans écriture
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { formatContactName } from './name-format.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'emails.db');
const DRY_RUN = process.argv.includes('--dry-run');

if (!existsSync(DB_PATH)) {
  console.error(`❌ Base introuvable: ${DB_PATH}`);
  process.exit(1);
}

const db = new Database(DB_PATH);
const contacts = db.prepare('SELECT id, name, first_name, email FROM contacts ORDER BY last_contact_date DESC').all();

const update = db.prepare(`
  UPDATE contacts SET name = ?, first_name = ?, updated_at = datetime('now') WHERE id = ?
`);

let changed = 0;
let skipped = 0;

console.log(DRY_RUN ? '🔍 Aperçu (dry-run)\n' : '✏️  Normalisation des noms\n');

for (const c of contacts) {
  const before = c.name || '';
  const beforeFirst = c.first_name || '';

  let rawInput = before;
  if (beforeFirst) {
    if (before.toLowerCase().startsWith(beforeFirst.toLowerCase())) {
      rawInput = before;
    } else if (!before.toLowerCase().includes(beforeFirst.toLowerCase())) {
      rawInput = `${beforeFirst} ${before}`.trim();
    } else {
      rawInput = before;
    }
  }

  const formatted = formatContactName(rawInput, c.email);

  const newFirst = formatted.firstName || '';
  const newLast = formatted.lastName || formatted.displayName;

  const alreadyOk = (c.first_name || '') === newFirst && before === newLast;

  if (alreadyOk) {
    skipped++;
    continue;
  }

  changed++;
  if (changed <= 30 || DRY_RUN) {
    const display = newFirst ? `${newFirst} ${newLast}` : newLast;
    console.log(`  ${before.padEnd(42)} → ${display}${newFirst ? `  (prénom: ${newFirst})` : ''}`);
  }

  if (!DRY_RUN) {
    update.run(newLast, newFirst, c.id);
  }
}

if (changed > 25 && !DRY_RUN) {
  console.log(`  … et ${changed - 25} autres`);
}

console.log(`\n✅ ${changed} contact(s) ${DRY_RUN ? 'à mettre à jour' : 'mis à jour'}, ${skipped} déjà OK`);

if (!DRY_RUN && changed > 0) {
  console.log('💡 Relancez: node export-static-data.js pour rafraîchir public/data/');
}

db.close();
