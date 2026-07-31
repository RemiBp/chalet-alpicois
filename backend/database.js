/**
 * SQLite — local ou Vercel (copie /tmp + persistance Vercel Blob optionnelle).
 *
 * On Vercel, multiple warm lambdas can each hold a /tmp copy. Without version
 * checks, a stale instance can overwrite a newer Blob snapshot (lost July mail,
 * vanishing admin edits). We track the Blob fingerprint we loaded and:
 *  - refresh /tmp when the remote fingerprint advances
 *  - refuse persist when our fingerprint is stale
 */

import Database from 'better-sqlite3';
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_DB = '/tmp/emails.db';
const PERSIST_SNAP = '/tmp/emails-persist-snap.db';
const BLOB_KEY = 'alpicois-emails.db';
/** Fail closed: database snapshots contain personal data and must never default to public. */
const BLOB_ACCESS = process.env.BLOB_STORE_ACCESS === 'public' ? 'public' : 'private';

let dbInstance = null;
let initPromise = null;
/** Fingerprint of the Blob snapshot currently opened in this isolate (`uploadedAt:size`). */
let localBlobFp = null;

/** Serializes Blob load/persist so we never close SQLite mid-backup. */
let dbIoChain = Promise.resolve();

function enqueueDbIo(fn) {
  const run = dbIoChain.then(fn, fn);
  dbIoChain = run.then(() => undefined, () => undefined);
  return run;
}

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

function fingerprintFromMeta(meta) {
  if (!meta) return null;
  const uploadedAt = meta.uploadedAt || meta.uploaded_at || '';
  const size = meta.size ?? meta.contentLength ?? '';
  if (!uploadedAt && size === '') return null;
  return `${uploadedAt}:${size}`;
}

async function headBlobMeta() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const { head, list } = await import('@vercel/blob');
  try {
    return await head(BLOB_KEY, { token });
  } catch {
    const { blobs } = await list({ prefix: BLOB_KEY, token });
    const hit = blobs.find(b => b.pathname === BLOB_KEY) || blobs[0];
    return hit || null;
  }
}

async function loadFromBlobUnlocked() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return false;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  try {
    const meta = await headBlobMeta();
    const downloadUrl = meta?.downloadUrl || meta?.url || null;
    if (!downloadUrl) return false;
    const res = await fetch(`${downloadUrl}${downloadUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(TMP_DB, buf);
    localBlobFp = fingerprintFromMeta(meta) || `${Date.now()}:${buf.length}`;
    console.log(`Loaded emails.db from Vercel Blob (${buf.length} bytes, fp=${localBlobFp})`);
    return true;
  } catch (err) {
    console.error('Blob load:', err.message);
    return false;
  }
}

async function openTmpDatabase() {
  dbInstance = new Database(TMP_DB);
  try { dbInstance.pragma('journal_mode = DELETE'); } catch { /* ignore */ }
  migrateSchema(dbInstance);
  console.log(`SQLite ready (${TMP_DB}, fp=${localBlobFp || 'none'})`);
  return dbInstance;
}

async function initDatabase() {
  if (process.env.VERCEL === '1') {
    if (!existsSync(TMP_DB)) {
      const fromBlob = await loadFromBlobUnlocked();
      if (!fromBlob) {
        const bundled = findBundledDb();
        if (!bundled) {
          throw new Error('emails.db introuvable dans le bundle Vercel');
        }
        copyFileSync(bundled, TMP_DB);
        localBlobFp = null;
        console.log(`Copied bundled DB → ${TMP_DB}`);
      }
    }
    return openTmpDatabase();
  }

  const localDb = join(__dirname, '..', 'emails.db');
  const path = existsSync(localDb)
    ? localDb
    : (findBundledDb() || join(process.cwd(), 'emails.db'));
  if (!existsSync(path)) {
    throw new Error(`emails.db introuvable: ${path}`);
  }
  dbInstance = new Database(path);
  dbInstance.pragma('journal_mode = WAL');
  migrateSchema(dbInstance);
  console.log('SQLite ready (local)');
  return dbInstance;
}

import { ensureAuditTable } from './audit-log.js';
import { ensureMailTemplateTables } from './mail-templates.js';
import { ensureStayProgressTable, seedProgressFromExcel } from './stay-progress.js';

function ensureMailboxScopedEmailUid(db) {
  const columns = db.prepare("PRAGMA table_info('emails')").all();
  if (!columns.length) return;
  const indexes = db.prepare("PRAGMA index_list('emails')").all();
  const hasGlobalUidUnique = indexes.some(index => {
    if (!index.unique) return false;
    const cols = db.prepare(`PRAGMA index_info('${index.name.replace(/'/g, "''")}')`).all();
    return cols.length === 1 && cols[0].name === 'uid';
  });
  const hasMailboxUidUnique = indexes.some(index => {
    if (!index.unique) return false;
    const cols = db.prepare(`PRAGMA index_info('${index.name.replace(/'/g, "''")}')`).all().map(c => c.name).join(',');
    return cols === 'mailbox,uid';
  });
  if (!hasGlobalUidUnique && hasMailboxUidUnique) return;

  const contactIdColumn = columns.some(c => c.name === 'contact_id') ? ', contact_id' : '';
  const contactIdSelect = columns.some(c => c.name === 'contact_id') ? ', contact_id' : '';

  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE emails_next (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uid INTEGER,
          message_id TEXT,
          mailbox TEXT DEFAULT 'INBOX',
          sender TEXT NOT NULL,
          sender_name TEXT DEFAULT '',
          recipients TEXT DEFAULT '',
          date TEXT NOT NULL,
          subject TEXT DEFAULT '',
          body_text TEXT DEFAULT '',
          seen INTEGER DEFAULT 0,
          flagged INTEGER DEFAULT 0,
          parsed INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
          ${contactIdColumn ? ', contact_id TEXT' : ''}
        );
      `);
      db.exec(`
        INSERT INTO emails_next (
          id, uid, message_id, mailbox, sender, sender_name, recipients, date, subject,
          body_text, seen, flagged, parsed, created_at${contactIdColumn}
        )
        SELECT
          id, uid, message_id, COALESCE(mailbox, 'INBOX'), sender, sender_name, recipients, date, subject,
          body_text, seen, flagged, parsed, created_at${contactIdSelect}
        FROM emails
        ORDER BY id;
      `);
      db.exec('DROP TABLE emails');
      db.exec('ALTER TABLE emails_next RENAME TO emails');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_mailbox_uid ON emails(mailbox, uid)');
      if (contactIdColumn) {
        db.exec('CREATE INDEX IF NOT EXISTS idx_emails_contact ON emails(contact_id)');
      }
      db.exec('CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date DESC)');
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
  }
}

function migrateSchema(db) {
  ensureMailboxScopedEmailUid(db);
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
  try { db.exec("UPDATE emails SET contact_id = NULL WHERE contact_id = ''"); } catch { /* column may not exist yet */ }
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

async function closeDbUnlocked() {
  if (dbInstance) {
    try { dbInstance.close(); } catch { /* ignore */ }
    dbInstance = null;
    initPromise = null;
  }
}

async function reloadDbFromBlobUnlocked() {
  await closeDbUnlocked();
  if (existsSync(TMP_DB)) {
    try { unlinkSync(TMP_DB); } catch { /* ignore */ }
  }
  localBlobFp = null;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await loadFromBlobUnlocked();
  }
  return openTmpDatabase();
}

/**
 * Keep this isolate's /tmp SQLite aligned with the latest Blob snapshot.
 * Cheap no-op when the remote fingerprint matches what we already loaded.
 */
export async function ensureDbCurrent() {
  if (process.env.VERCEL !== '1') {
    return ensureDb();
  }

  return enqueueDbIo(async () => {
    if (!dbInstance) {
      await ensureDb();
    }
    try {
      const meta = await headBlobMeta();
      const remoteFp = fingerprintFromMeta(meta);
      if (remoteFp && localBlobFp && remoteFp !== localBlobFp) {
        console.log(`Blob fingerprint advanced (${localBlobFp} → ${remoteFp}); reloading`);
        return reloadDbFromBlobUnlocked();
      }
      if (remoteFp && !localBlobFp && existsSync(TMP_DB)) {
        // Opened from bundled/empty fingerprint — adopt remote if present by reloading.
        console.log(`Adopting Blob fingerprint ${remoteFp}`);
        return reloadDbFromBlobUnlocked();
      }
      if (remoteFp && !localBlobFp) {
        localBlobFp = remoteFp;
      }
    } catch (err) {
      console.warn('ensureDbCurrent head:', err.message);
    }
    return dbInstance || ensureDb();
  });
}

async function snapshotOpenDb(db) {
  if (existsSync(PERSIST_SNAP)) unlinkSync(PERSIST_SNAP);
  try {
    if (db && db.open) {
      await db.backup(PERSIST_SNAP);
      return;
    }
  } catch (err) {
    console.warn('db.backup failed, falling back to file copy:', err.message);
  }
  if (!existsSync(TMP_DB)) {
    throw new Error('no_db_file');
  }
  copyFileSync(TMP_DB, PERSIST_SNAP);
}

async function persistDbDetailedUnlocked() {
  if (!dbInstance && !existsSync(TMP_DB)) {
    return { ok: false, reason: 'no_db_file' };
  }

  try {
    const remoteMeta = await headBlobMeta().catch(() => null);
    const remoteFp = fingerprintFromMeta(remoteMeta);
    if (remoteFp && localBlobFp && remoteFp !== localBlobFp) {
      console.error(`Blob persist refused: stale isolate (local=${localBlobFp} remote=${remoteFp})`);
      return {
        ok: false,
        reason: 'stale_instance',
        error: `Instance obsolète (local ${localBlobFp} ≠ remote ${remoteFp}) — recharger puis réessayer`,
      };
    }

    await snapshotOpenDb(dbInstance);
    const data = readFileSync(PERSIST_SNAP);
    const { put } = await import('@vercel/blob');
    const putResult = await put(BLOB_KEY, data, {
      access: BLOB_ACCESS,
      addRandomSuffix: false,
      allowOverwrite: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: 'application/octet-stream',
    });
    // Prefer fresh head; fall back to put response fields.
    const afterMeta = await headBlobMeta().catch(() => putResult);
    localBlobFp = fingerprintFromMeta(afterMeta) || `${Date.now()}:${data.length}`;
    console.log(`Persisted emails.db to Vercel Blob (${data.length} bytes, fp=${localBlobFp})`);
    return { ok: true, size: data.length, fingerprint: localBlobFp };
  } catch (err) {
    console.error('Blob persist:', err.message);
    return { ok: false, reason: 'put_failed', error: err.message };
  }
}

/** @returns {Promise<{ ok: boolean, reason?: string, error?: string, size?: number, fingerprint?: string }>} */
export async function persistDbDetailed() {
  if (process.env.VERCEL !== '1') {
    return { ok: false, reason: 'not_vercel' };
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn('persistDb skipped: BLOB_READ_WRITE_TOKEN missing — connect a Blob store in Vercel Storage');
    return { ok: false, reason: 'no_blob_token' };
  }
  return enqueueDbIo(persistDbDetailedUnlocked);
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
  return enqueueDbIo(reloadDbFromBlobUnlocked);
}

export { BLOB_KEY, BLOB_ACCESS };
