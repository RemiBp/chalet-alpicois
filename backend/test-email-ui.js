/**
 * Test runtime — nettoyage email frontend sans stack overflow.
 * Usage: node backend/test-email-ui.js
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { cleanStoredBodyText, extractBodyText } from './email-body.js';

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
const glued = 'Email: clemencepanet@yahoo.frYour Message: Réponse utile. Le 28 juil. 2026 à 13:00, Panet a écrit : Votre nomPanetEmailclemencepanet@yahoo.fr';
const cleanedGlued = cleanEmailBody(glued);
if (!cleanedGlued.includes('yahoo.fr\\nYour Message:') || cleanedGlued.includes('Votre nomPanet')) {
  throw new Error('form fields / quoted history not formatted');
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

const nestedFormReply = Buffer.from([
  'Content-Type: multipart/mixed; boundary="abc"',
  '',
  '--abc',
  'Content-Type: text/html; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  '<p>Bonsoir Madame Panet,</p><p>Voici le vrai message avec les documents.</p>',
  '<div class="hmail-quote-container"><blockquote><table><tr><td class="field-name"><strong>Email</strong></td><td class="field-value">old@example.com</td></tr></table></blockquote></div>',
  '--abc--',
].join('\r\n'));
const extractedReply = extractBodyText(nestedFormReply);
if (!extractedReply.includes('Voici le vrai message') || extractedReply.includes('old@example.com')) {
  console.error('❌ extractBodyText a préféré le formulaire cité au message frais');
  process.exit(1);
}
console.log('✅ extractBodyText — message frais prioritaire sur formulaire cité');

const nestedMultipart = Buffer.from([
  'Content-Type: multipart/mixed; boundary="outer"', '', '--outer',
  'Content-Type: multipart/alternative; boundary="inner"', '', '--inner',
  'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: quoted-printable', '',
  'Bonjour, voici le message imbriqu=C3=A9.', '--inner',
  'Content-Type: text/html; charset=utf-8', '', '<p>Version HTML</p>', '--inner--',
  '--outer', 'Content-Type: application/pdf', 'Content-Transfer-Encoding: base64', '', 'JVBERi0xLjQ=',
  '--outer--',
].join('\r\n'));
const extractedNested = extractBodyText(nestedMultipart);
if (extractedNested !== 'Bonjour, voici le message imbriqué.') {
  console.error(`❌ multipart imbriqué mal extrait: ${extractedNested}`);
  process.exit(1);
}
console.log('✅ extractBodyText — multipart imbriqué sans pièce jointe brute');

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
