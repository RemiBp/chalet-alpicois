/**
 * Link existing Blob store to project + upload emails.db
 */
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STORE_ID = 'store_UV4K1Dsbocou34PN';
const PROJECT_ID = 'prj_HIBFqee5AAvnKWUSewZcp4XnmQBo';
const TEAM_ID = 'team_nNq0gthIkTkOPN6fDeS0FiKz';

const authPaths = [
  join(process.env.HOME, '.vercel/auth.json'),
  join(process.env.HOME, '.config/com.vercel.cli/auth.json'),
];
let auth;
for (const p of authPaths) {
  if (existsSync(p)) { auth = JSON.parse(readFileSync(p, 'utf8')); break; }
}
if (!auth?.token) throw new Error('Token Vercel introuvable — lancez vercel login');
const token = auth.token;

async function api(path, opts = {}) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${res.status} ${path}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

console.log('Linking Blob store to project…');
try {
  await api(`/v1/integrations/blob/stores/${STORE_ID}/connections`, {
    method: 'POST',
    body: JSON.stringify({ projectId: PROJECT_ID, environments: ['production'] }),
  });
  console.log('✓ Blob store linked');
} catch (err) {
  console.log('Link attempt:', err.message);
  try {
    await api(`/v9/projects/${PROJECT_ID}/stores`, {
      method: 'POST',
      body: JSON.stringify({ storeId: STORE_ID, type: 'blob' }),
    });
    console.log('✓ Blob store linked (alt endpoint)');
  } catch (err2) {
    console.log('Alt link:', err2.message);
    console.log('→ Liez manuellement : Vercel → chalet-alpicois-dash → Storage → Connect alpicois-emails');
  }
}

console.log('\nUpload emails.db to Blob…');
const dbPath = join(ROOT, 'emails.db');
if (!existsSync(dbPath)) {
  console.log('⚠ emails.db absent — skip upload');
  process.exit(0);
}

execSync('npm run upload-db-blob --prefix backend', {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN || '',
  },
});
