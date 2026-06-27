/**
 * SQLite — local ou Vercel (copie /tmp + persistance Vercel Blob optionnelle).
 */

import Database from 'better-sqlite3';
import { copyFileSync, existsSync, readFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DB = '/tmp/emails.db';
const PERSIST_SNAP = '/tmp/emails-persist-snap.db';
const BLOB_KEY = 'alpicois-emails.db';
/** Vercel Blob store access — use BLOB_STORE_ACCESS=private when the store is private. */
const BLOB_ACCESS = process.env.BLOB_STORE_ACCESS === 'private' ? 'private' : 'public';

let dbInstance = null;
let initPromise = null;

function findBundledDb() {
  for (const p of [
    join(__dirname, 'deploy', 'emails.db'),
    join(process.cwd(), 'backend', 'deploy', 'emails.db'),
    join(process.cwd(), 'emails.db'),
    join(__dirname, '..', 'emails.db'),
    join(process.cwd(), '..', 'emails.db'),
  ]) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function loadFromBlob() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return false;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  try {
    const { head, list } = await import('@vercel/blob');
    let downloadUrl = null;
    try {
      const meta = await head(BLOB_KEY, { token });
      downloadUrl = meta.downloadUrl || meta.url;
    } catch {
      const { blobs } = await list({ prefix: BLOB_KEY, token });
      const hit = blobs.find(b => b.pathname === BLOB_KEY) || blobs[0];
      downloadUrl = hit?.downloadUrl || hit?.url || null;
    }
    if (!downloadUrl) return false;
    const res = await fetch(`${downloadUrl}${downloadUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    const { writeFileSync } = await import('fs');
    writeFileSync(TMP_DB, buf);
    console.log(`Loaded emails.db from Vercel Blob (${buf.length} bytes)`);
    return true;
  } catch (err) {
    console.error('Blob load:', err.message);
    return false;
  }
}

async function initDatabase() {
  if (process.env.VERCEL === '1') {
    if (!existsSync(TMP_DB)) {
      const fromBlob = await loadFromBlob();
      if (!fromBlob) {
        const bundled = findBundledDb();
        if (!bundled) {
          throw new Error('emails.db introuvable dans le bundle Vercel');
        }
        copyFileSync(bundled, TMP_DB);
        console.log(`Copied bundled DB → ${TMP_DB}`);
      }
    }
    dbInstance = new Database(TMP_DB);
  } else {
    const localDb = join(__dirname, '..', 'emails.db');
    const path = existsSync(localDb)
      ? localDb
      : (findBundledDb() || join(process.cwd(), 'emails.db'));
    if (!existsSync(path)) {
      throw new Error(`emails.db introuvable: ${path}`);
    }
    dbInstance = new Database(path);
  }
  if (process.env.VERCEL === '1') {
    try { dbInstance.pragma('journal_mode = DELETE'); } catch { /* ignore */ }
    migrateSchema(dbInstance);
  } else {
    dbInstance.pragma('journal_mode = WAL');
    migrateSchema(dbInstance);
  }
  console.log(`SQLite ready (${process.env.VERCEL === '1' ? TMP_DB : 'local'})`);
  return dbInstance;
}

import { ensureAuditTable } from './audit-log.js';
import { ensureMailTemplateTables } from './mail-templates.js';
import { ensureStayProgressTable, seedProgressFromExcel } from './stay-progress.js';

function migrateSchema(db) {
  ensureAuditTable(db);
  ensureMailTemplateTables(db);
  ensureStayProgressTable(db);
  try { seedProgressFromExcel(db); } catch (err) {
    console.warn('seedProgressFromExcel:', err.message);
  }
  const alters = [
    'ALTER TABLE emails ADD COLUMN contact_id TEXT',
    'ALTER TABLE contacts ADD COLUMN first_name TEXT DEFAULT ""',
    'ALTER TABLE contacts ADD COLUMN alternate_emails TEXT DEFAULT "[]"',
    'ALTER TABLE contacts ADD COLUMN profile_json TEXT DEFAULT "{}"',
    'ALTER TABLE contacts ADD COLUMN enriched_at TEXT DEFAULT ""',
    'ALTER TABLE contacts ADD COLUMN nationality TEXT DEFAULT ""',
    'ALTER TABLE contacts ADD COLUMN address TEXT DEFAULT ""',
    'ALTER TABLE contacts ADD COLUMN postal_code TEXT DEFAULT ""',
    'ALTER TABLE contacts ADD COLUMN country TEXT DEFAULT ""',
    'ALTER TABLE contacts ADD COLUMN is_personal INTEGER DEFAULT 0',
    'ALTER TABLE stays ADD COLUMN is_personal INTEGER DEFAULT 0',
    'ALTER TABLE requested_weeks ADD COLUMN is_personal INTEGER DEFAULT 0',
    'ALTER TABLE stays ADD COLUMN manual_lock INTEGER DEFAULT 0',
    'ALTER TABLE requested_weeks ADD COLUMN manual_lock INTEGER DEFAULT 0',
  ];
  for (const sql of alters) {
    try { db.exec(sql); } catch { /* exists */ }
  }
}

export function ensureDb() {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (!initPromise) {
    initPromise = initDatabase().catch(err => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export function getDbSync() {
  return dbInstance;
}

let persistInFlight = null;

/** @returns {Promise<{ ok: boolean, reason?: string, error?: string, size?: number }>} */
export async function persistDbDetailed() {
  if (process.env.VERCEL !== '1') {
    return { ok: false, reason: 'not_vercel' };
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn('persistDb skipped: BLOB_READ_WRITE_TOKEN missing — connect a Blob store in Vercel Storage');
    return { ok: false, reason: 'no_blob_token' };
  }
  if (!dbInstance && !existsSync(TMP_DB)) {
    return { ok: false, reason: 'no_db_file' };
  }
  if (persistInFlight) return persistInFlight;
  persistInFlight = (async () => {
    try {
      if (existsSync(PERSIST_SNAP)) unlinkSync(PERSIST_SNAP);
      if (dbInstance) {
        await dbInstance.backup(PERSIST_SNAP);
      } else {
        copyFileSync(TMP_DB, PERSIST_SNAP);
      }
      const data = readFileSync(PERSIST_SNAP);
      const { put } = await import('@vercel/blob');
      await put(BLOB_KEY, data, {
        access: BLOB_ACCESS,
        addRandomSuffix: false,
        allowOverwrite: true,
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: 'application/octet-stream',
      });
      console.log(`Persisted emails.db to Vercel Blob (${data.length} bytes)`);
      return { ok: true, size: data.length };
    } catch (err) {
      console.error('Blob persist:', err.message);
      return { ok: false, reason: 'put_failed', error: err.message };
    } finally {
      persistInFlight = null;
    }
  })();
  return persistInFlight;
}

export async function persistDb() {
  const result = await persistDbDetailed();
  return result.ok;
}

export async function requirePersistDb() {
  const result = await persistDbDetailed();
  if (!result.ok) {
    const detail = result.error || result.reason || 'unknown';
    throw new Error(`Sauvegarde Blob échouée (${detail})`);
  }
  return result;
}

/** Recharge la base depuis Blob (lecture historique à jour sur serverless). */
export async function reloadDbFromBlob() {
  if (process.env.VERCEL !== '1') {
    return ensureDb();
  }
  if (dbInstance) {
    try { dbInstance.close(); } catch { /* ignore */ }
    dbInstance = null;
    initPromise = null;
  }
  if (existsSync(TMP_DB)) {
    try { unlinkSync(TMP_DB); } catch { /* ignore */ }
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await loadFromBlob();
  }
  return ensureDb();
}

export { BLOB_KEY, BLOB_ACCESS };
