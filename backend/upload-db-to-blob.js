/**
 * Upload local emails.db → Vercel Blob (première mise en prod ou reset).
 * Usage: BLOB_READ_WRITE_TOKEN=... node backend/upload-db-to-blob.js
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BLOB_KEY = 'alpicois-emails.db';

function resolveDb() {
  for (const p of [join(ROOT, 'emails.db'), join(__dirname, 'emails.db')]) {
    if (existsSync(p)) return p;
  }
  return null;
}

const dbPath = resolveDb();
if (!dbPath) {
  console.error('emails.db introuvable');
  process.exit(1);
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('BLOB_READ_WRITE_TOKEN requis (Vercel → Storage → Blob → token)');
  process.exit(1);
}

const { put } = await import('@vercel/blob');
const buf = readFileSync(dbPath);
const result = await put(BLOB_KEY, buf, {
  access: process.env.BLOB_STORE_ACCESS === 'private' ? 'private' : 'public',
  addRandomSuffix: false,
  allowOverwrite: true,
  token: process.env.BLOB_READ_WRITE_TOKEN,
});
console.log(`✅ ${dbPath} (${(buf.length / 1024 / 1024).toFixed(1)} Mo) → ${result.url}`);
