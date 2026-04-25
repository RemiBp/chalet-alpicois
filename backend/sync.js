/**
 * AGENT DE SYNCHRONISATION EMAIL → SQLite
 *
 * Se connecte à Hostinger IMAP, récupère TOUS les emails,
 * les stocke dans SQLite. Supporte sync complète et incrémentale.
 *
 * Usage:
 *   node sync.js           # Sync incrémentale
 *   node sync.js --full    # Sync complète (tous les emails)
 */

import 'dotenv/config';
import { ImapFlow } from 'imapflow';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';

// ============ CONFIG ============

const DB_PATH = process.env.DB_PATH || '../emails.db';
const IMAP_CONFIG = {
  host: process.env.IMAP_HOST || 'imap.hostinger.com',
  port: parseInt(process.env.IMAP_PORT || '993'),
  secure: true,
  auth: {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
  },
  logger: false,
};

const FULL_SYNC = process.argv.includes('--full');

// ============ SQLITE SETUP ============

const dbDir = DB_PATH.substring(0, DB_PATH.lastIndexOf('/'));
if (dbDir && !existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS emails (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    uid            INTEGER UNIQUE,
    message_id     TEXT,
    mailbox        TEXT DEFAULT 'INBOX',
    sender         TEXT NOT NULL,
    sender_name    TEXT DEFAULT '',
    recipients     TEXT DEFAULT '',
    date           TEXT NOT NULL,
    subject        TEXT DEFAULT '',
    body_text      TEXT DEFAULT '',
    seen           INTEGER DEFAULT 0,
    flagged        INTEGER DEFAULT 0,
    parsed         INTEGER DEFAULT 0,
    created_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    email            TEXT,
    phone            TEXT DEFAULT '',
    alternate_phones TEXT DEFAULT '[]',
    origin           TEXT DEFAULT 'email',
    origin_detail    TEXT DEFAULT '',
    status           TEXT DEFAULT 'prospect',
    first_contact_date TEXT,
    last_contact_date  TEXT,
    total_stays      INTEGER DEFAULT 0,
    notes            TEXT DEFAULT '',
    created_at       TEXT DEFAULT (datetime('now')),
    updated_at       TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stays (
    id               TEXT PRIMARY KEY,
    contact_id       TEXT NOT NULL,
    season           TEXT,
    check_in         TEXT,
    check_out        TEXT,
    nights           INTEGER DEFAULT 0,
    adults           INTEGER DEFAULT 1,
    children         INTEGER DEFAULT 0,
    price_quoted     REAL DEFAULT 0,
    price_confirmed  REAL DEFAULT 0,
    status           TEXT DEFAULT 'pending',
    source_email_id  INTEGER,
    notes            TEXT DEFAULT '',
    created_at       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id),
    FOREIGN KEY (source_email_id) REFERENCES emails(id)
  );

  CREATE TABLE IF NOT EXISTS requested_weeks (
    id               TEXT PRIMARY KEY,
    contact_id       TEXT NOT NULL,
    season           TEXT,
    week_number      INTEGER,
    check_in         TEXT,
    check_out        TEXT,
    adults           INTEGER DEFAULT 1,
    children         INTEGER DEFAULT 0,
    status           TEXT DEFAULT 'asked',
    notes            TEXT DEFAULT '',
    created_at       TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
  );

  CREATE TABLE IF NOT EXISTS auto_replies (
    id               TEXT PRIMARY KEY,
    email_id         INTEGER,
    contact_id       TEXT,
    reply_type       TEXT DEFAULT 'info',
    reply_subject    TEXT DEFAULT '',
    reply_body       TEXT DEFAULT '',
    alternative_weeks TEXT DEFAULT '[]',
    status           TEXT DEFAULT 'draft',
    created_at       TEXT DEFAULT (datetime('now')),
    sent_at          TEXT,
    FOREIGN KEY (email_id) REFERENCES emails(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
  );

  CREATE TABLE IF NOT EXISTS auto_reply_rules (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    is_active        INTEGER DEFAULT 1,
    match_keywords   TEXT DEFAULT '',
    min_price        REAL DEFAULT 0,
    max_price        REAL DEFAULT 99999,
    min_nights       INTEGER DEFAULT 1,
    max_nights       INTEGER DEFAULT 14,
    reply_template   TEXT DEFAULT '',
    created_at       TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ============ HELPERS ============

/**
 * Extrait le body text/plain d'un email source brut (RFC822).
 * Gère quoted-printable, base64, multipart, etc.
 */
function extractBodyText(sourceBuffer) {
  if (!sourceBuffer) return '';
  try {
    const raw = sourceBuffer.toString('utf-8');
    // Diviser en lignes
    const lines = raw.split(/\r?\n/);

    let boundary = null;
    let inHeaders = true;
    let currentSection = 'headers';
    let textPlainParts = [];
    let textBuffer = [];
    let inTextPart = false;
    let transferEncoding = null;

    // Détecter le boundary
    const boundaryMatch = raw.match(/boundary="?([^"\s;]+)"?/i);
    if (boundaryMatch) boundary = boundaryMatch[1];

    // Détecter content-type et transfer-encoding
    const ctMatch = raw.match(/Content-Type:\s*text\/plain/i);
    const qpMatch = raw.match(/Content-Transfer-Encoding:\s*quoted-printable/i);
    const b64Match = raw.match(/Content-Transfer-Encoding:\s*base64/i);

    // Si pas de multipart et text/plain simple
    if (!boundary && ctMatch) {
      // Extraction simple: tout après les headers
      const parts = raw.split(/\r?\n\r?\n/);
      if (parts.length > 1) {
        let body = parts.slice(1).join('\n\n');
        if (qpMatch) {
          body = decodeQuotedPrintable(body);
        }
        return cleanBody(body);
      }
    }

    // Parsing multipart basique
    if (boundary) {
      const sections = raw.split(new RegExp(`--${escapeRegex(boundary)}`));
      for (const section of sections) {
        if (section.includes('text/plain')) {
          // Extraire le contenu après les headers de cette partie
          const parts = section.split(/\r?\n\r?\n/);
          if (parts.length > 1) {
            let content = parts.slice(1).join('\n\n');
            // Enlever le trailing --
            content = content.replace(/--\s*$/, '').trim();
            if (section.includes('quoted-printable')) {
              content = decodeQuotedPrintable(content);
            }
            textPlainParts.push(content);
          }
        }
      }
    }

    // Si rien trouvé, prendre tout ce qui semble être du texte
    if (textPlainParts.length === 0) {
      const bodyMatch = raw.match(/(?:\r?\n\r?\n)([\s\S]*)/);
      if (bodyMatch) {
        let body = bodyMatch[1];
        // Enlever les signatures de forward/reply
        body = body.replace(/^--\n.*$/gm, '').trim();
        textPlainParts.push(body);
      }
    }

    return cleanBody(textPlainParts.join('\n\n'));
  } catch (err) {
    console.error(`   ⚠️ Body extraction error:`, err.message);
    return '';
  }
}

function decodeQuotedPrintable(str) {
  return str
    .replace(/=\r?\n/g, '')       // Soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); // Remove control chars
}

function cleanBody(str) {
  return str
    .replace(/<[^>]*>/g, '')           // Remove HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============ SYNC ============

async function syncMailbox(client, mailboxPath) {
  console.log(`\n📂 ${mailboxPath}...`);

  // Obtenir les infos du mailbox sans lock
  let totalMessages = 0;
  try {
    const status = await client.status(mailboxPath, { messages: true });
    totalMessages = status.messages;
    console.log(`   ${totalMessages} messages`);
  } catch (err) {
    console.log(`   ⚠️ Impossible d'accéder: ${err.message}`);
    return;
  }

  if (totalMessages === 0) return;

  const lastUidStr = db.prepare("SELECT value FROM sync_state WHERE key = 'last_uid'").get();
  const lastUid = FULL_SYNC ? 0 : (lastUidStr ? parseInt(lastUidStr.value) : 0);
  const sinceUid = lastUid + 1;

  if (!FULL_SYNC && lastUid > 0) {
    console.log(`   Sync incrémentale depuis UID ${sinceUid}`);
  } else {
    console.log(`   Sync complète (tous les emails)`);
  }

  // Lock le mailbox + fetch
  let lock;
  try {
    lock = await client.getMailboxLock(mailboxPath);
  } catch (err) {
    console.log(`   ⚠️ Lock failed: ${err.message}`);
    return;
  }

  const insertEmail = db.prepare(`
    INSERT OR IGNORE INTO emails (uid, message_id, mailbox, sender, sender_name, recipients, date, subject, body_text, seen, flagged)
    VALUES (@uid, @messageId, @mailbox, @sender, @senderName, @recipients, @date, @subject, @bodyText, @seen, @flagged)
  `);
  const updateLastUid = db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_uid', ?)");

  let count = 0;
  let errors = 0;

  try {
    // Étape 1: Fetch les metadata (sans source) en batch
    const messages = [];
    for await (const msg of client.fetch(`${sinceUid}:*`, {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true,
    }, { uid: true })) {
      messages.push(msg);
    }

    console.log(`   ${messages.length} métadonnées récupérées`);

    // Étape 2: Pour chaque message, fetch le source un par un
    // (fetchOne ne bloque pas le fetch loop contrairement à fetch)
    for (let i = 0; i < messages.length; i++) {
      const meta = messages[i];
      try {
        // Release et re-lock entre chaque fetchOne pour éviter les deadlocks
        lock.release();

        let sourceBuf = null;
        try {
          const msgSource = await client.fetchOne(meta.uid, { source: true }, { uid: true });
          if (msgSource) sourceBuf = msgSource.source;
        } catch (srcErr) {
          // Ignorer si on ne peut pas récupérer la source
        }

        // Re-lock pour la suite
        lock = await client.getMailboxLock(mailboxPath);

        const envelope = meta.envelope;
        if (!envelope) continue;

        const sender = envelope.from?.[0];
        const senderName = sender?.name || sender?.address || 'Inconnu';
        const senderAddr = sender?.address || '';
        const bodyText = extractBodyText(sourceBuf);

        // Les flags sont un Set dans imapflow
        const isSeen = meta.flags?.has?.('\\Seen') ? 1 : 0;
        const isFlagged = meta.flags?.has?.('\\Flagged') ? 1 : 0;

        insertEmail.run({
          uid: meta.uid,
          messageId: envelope.messageId || '',
          mailbox: mailboxPath,
          sender: senderAddr,
          senderName: senderName,
          recipients: (envelope.to || []).map(r => r.address).join(', '),
          date: meta.internalDate?.toISOString() || new Date().toISOString(),
          subject: envelope.subject || '(Pas de sujet)',
          bodyText: bodyText.substring(0, 50000),
          seen: isSeen,
          flagged: isFlagged,
        });

        count++;
        updateLastUid.run(meta.uid.toString());

        if (count % 10 === 0 || count === messages.length) {
          process.stdout.write(`   ${count}/${messages.length} emails...\r`);
        }
      } catch (err) {
        errors++;
        // Re-lock si perdu
        if (!lock || lock.released) {
          try { lock = await client.getMailboxLock(mailboxPath); } catch {}
        }
        if (errors <= 5) {
          console.error(`\n   ❌ UID ${meta.uid}: ${err.message}`);
        }
      }
    }

    console.log(`\n   ✅ ${count} emails synchronisés` + (errors > 0 ? ` (${errors} erreurs)` : ''));
  } catch (err) {
    console.error(`   ❌ Erreur: ${err.message}`);
  } finally {
    if (lock && !lock.released) lock.release();
  }
}

// ============ MAIN ============

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  AGENT DE SYNCHRONISATION EMAIL');
  console.log(`  ${FULL_SYNC ? 'SYNC COMPLÈTE' : 'SYNC INCRÉMENTALE'}`);
  console.log('═══════════════════════════════════════\n');

  if (!IMAP_CONFIG.auth.user || !IMAP_CONFIG.auth.pass) {
    console.error('❌ Configurez .env avec EMAIL_USER et EMAIL_PASS');
    process.exit(1);
  }

  const client = new ImapFlow(IMAP_CONFIG);

  try {
    console.log(`🔌 Connexion à ${IMAP_CONFIG.host}:${IMAP_CONFIG.port}...`);
    await client.connect();
    console.log('✅ Connecté\n');

    // Lister les dossiers
    const mailboxes = await client.list();
    console.log('📁 Dossiers:');
    for (const mb of mailboxes) {
      if (!mb.path.includes('[Gmail]') && !mb.path.includes('Drafts') && !mb.path.includes('Trash') && !mb.path.includes('Junk')) {
        try {
          const st = await client.status(mb.path, { messages: true });
          if (st.messages > 0) console.log(`   ${mb.path}: ${st.messages} messages`);
        } catch {}
      }
    }

    // Sync INBOX et INBOX.Sent
    for (const box of ['INBOX', 'INBOX.Sent']) {
      await syncMailbox(client, box);
    }

  } catch (err) {
    console.error('\n❌ Erreur fatale:', err);
    process.exit(1);
  } finally {
    try { await client.logout(); } catch {}
    db.close();
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  ✅ SYNC TERMINÉE');
  console.log('  Prochaine étape : node parse-emails.js');
  console.log('═══════════════════════════════════════\n');
}

main();
