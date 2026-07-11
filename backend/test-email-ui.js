/**
 * Test runtime — nettoyage email frontend sans stack overflow.
 * Usage: node backend/test-email-ui.js
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { cleanStoredBodyText } from './email-body.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = join(root, 'emails.db');
const runner = join(root, 'backend', '.test-email-run.mjs');

writeFileSync(runner, `
import { cleanEmailBody, emailBodyPreview, classifyEmailContent } from '../src/lib/cleanEmailBody.ts';

const samples = [
  'Bonjour, je confirme du 3 au 17 janvier 2027 pour 4800 euros.',
  'Content-Type: multipart/mixed\\n\\n--abc\\nContent-Type: text/plain\\n\\nBonjour test',
  'Photo =C3=A9 =0A avec quoted-printable',
  'A'.repeat(5000),
  'ûïôÓßÏGsõóÓ\\x01ÓÞz×ã_z\\x04\\x1eø\\x07\\x00\\x07Ðº\\x03q',
];

for (const [index, s] of samples.entries()) {
  const info = classifyEmailContent(s);
  if (index === samples.length - 1 && info.kind !== 'encrypted') {
    throw new Error('binary body classified as ' + info.kind);
  }
  cleanEmailBody(s);
  emailBodyPreview(s, 2000);
}
console.log('OK');
`);

try {
  execSync(`node --experimental-strip-types ${runner}`, { cwd: root, stdio: 'pipe', encoding: 'utf8' });
  console.log('✅ cleanEmailBody TS — pas de stack overflow (samples)');
} catch (e) {
  console.error('❌ cleanEmailBody TS — stack overflow ou erreur');
  console.error(e.stderr || e.message);
  process.exit(1);
} finally {
  try { unlinkSync(runner); } catch { /* ignore */ }
}

try {
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare(`
    SELECT body_text FROM emails
    WHERE id IN ('9570', '6591') OR body_text LIKE '%Content-Type:%'
    LIMIT 20
  `).all();
  db.close();
  for (const row of rows) {
    cleanStoredBodyText(row.body_text || '');
  }
  console.log(`✅ cleanStoredBodyText backend — ${rows.length} corps DB`);
} catch (e) {
  console.error('❌ cleanStoredBodyText backend:', e.message);
  process.exit(1);
}

console.log('\nEmail UI tests OK\n');
