/**
 * AGENT DE SYNCHRONISATION EMAIL → SQLite
 *
 * Ce script se connecte à la boîte Hostinger via IMAP,
 * récupère TOUS les emails depuis le début, les parse,
 * et les stocke dans une base SQLite.
 *
 * Usage:
 *   node sync.js           # Sync incrémentale (nouveaux emails seulement)
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
if (dbDir && !existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS emails (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    uid          INTEGER UNIQUE,
    message_id   TEXT,
    mailbox      TEXT DEFAULT 'INBOX',
    sender       TEXT NOT NULL,
    sender_name  TEXT DEFAULT '',
    recipients   TEXT DEFAULT '',
    date         TEXT NOT NULL,
    subject      TEXT DEFAULT '',
    body_text    TEXT DEFAULT '',
    body_html    TEXT DEFAULT '',
    is_from_guest INTEGER DEFAULT 1,
    thread_id    TEXT,
    seen         INTEGER DEFAULT 0,
    flagged      INTEGER DEFAULT 0,
    parsed       INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now'))
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

  CREATE TABLE IF NOT EXISTS sync_state (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ============ IMAP SYNC ============

async function syncMailbox(client, mailboxPath = 'INBOX') {
  console.log(`\n📂 Ouverture de ${mailboxPath}...`);
  const mailbox = await client.mailboxOpen(mailboxPath);
  console.log(`   ${mailbox.exists} messages trouvés`);

  // Récupérer le dernier UID synchronisé
  const lastUidStr = db.prepare("SELECT value FROM sync_state WHERE key = 'last_uid'").get();
  const lastUid = FULL_SYNC ? 0 : (lastUidStr ? parseInt(lastUidStr.value) : 0);
  const sinceUid = lastUid + 1;

  if (sinceUid > 1 && !FULL_SYNC) {
    console.log(`   Sync incrémentale depuis UID ${sinceUid}`);
  } else {
    console.log(`   Sync ${FULL_SYNC ? 'COMPLÈTE' : 'initiale'} — tous les emails`);
  }

  let count = 0;
  const insertEmail = db.prepare(`
    INSERT OR IGNORE INTO emails (uid, message_id, mailbox, sender, sender_name, recipients, date, subject, body_text, body_html, seen, flagged)
    VALUES (@uid, @messageId, @mailbox, @sender, @senderName, @recipients, @date, @subject, @bodyText, @bodyHtml, @seen, @flagged)
  `);

  const updateLastUid = db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_uid', ?)");

  // Fetch all emails since last sync
  const fetchOptions = {
    since: new Date(0), // depuis le début des temps
    uid: true,
  };

  if (sinceUid > 1) {
    // metadata: false = on ne cherche que les nouveaux
  }

  try {
    // On fetch en batch
    for await (let msg of client.fetch(`${sinceUid}:*`, {
      uid: true,
      envelope: true,
      bodyStructure: true,
      source: true,
      flags: true,
      internalDate: true,
    })) {
      try {
        const envelope = msg.envelope;
        if (!envelope) continue;

        // Extraire le body text
        let bodyText = '';
        let bodyHtml = '';

        // Try to get text from the message
        try {
          const textParts = await client.download(msg.uid, 'TEXT', { uid: true });
          if (textParts?.content) {
            bodyText = textParts.content.toString('utf-8');
          }
        } catch (e) {
          // Fallback: try to get body parts
          try {
            const parts = msg.bodyStructure?.childNodes || [];
            for (const part of parts) {
              if (part.type === 'text/plain' || part.subtype === 'PLAIN') {
                const data = await client.download(msg.uid, part.part, { uid: true });
                if (data?.content) bodyText = data.content.toString('utf-8');
              }
              if (part.type === 'text/html' || part.subtype === 'HTML') {
                const data = await client.download(msg.uid, part.part, { uid: true });
                if (data?.content) bodyHtml = data.content.toString('utf-8');
              }
            }
          } catch (e2) {
            // Can't get body, that's ok
          }
        }

        const sender = envelope.from?.[0];
        const senderName = sender?.name || sender?.address || 'Inconnu';
        const senderAddr = sender?.address || '';

        const isFromGuest = !senderAddr?.includes('alpicois-laplagne.fr');

        insertEmail.run({
          uid: msg.uid,
          messageId: envelope.messageId || '',
          mailbox: mailboxPath,
          sender: senderAddr,
          senderName: senderName,
          recipients: (envelope.to || []).map(r => r.address).join(', '),
          date: msg.internalDate?.toISOString() || new Date().toISOString(),
          subject: envelope.subject || '(Pas de sujet)',
          bodyText: bodyText.substring(0, 50000),  // limite 50KB
          bodyHtml: bodyHtml.substring(0, 100000),
          seen: msg.flags?.includes('\\Seen') ? 1 : 0,
          flagged: msg.flags?.includes('\\Flagged') ? 1 : 0,
        });

        count++;
        if (count % 10 === 0) {
          process.stdout.write(`   ${count} emails synchronisés...\r`);
        }

        // Mettre à jour le dernier UID
        updateLastUid.run(msg.uid.toString());

      } catch (err) {
        console.error(`   ❌ Erreur sur UID ${msg.uid}:`, err.message);
      }
    }

    console.log(`\n   ✅ ${count} nouveaux emails synchronisés`);
  } catch (err) {
    console.error(`   ❌ Erreur de fetch:`, err.message);
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

    // Lister tous les dossiers/mailboxes
    const mailboxes = await client.list();
    const boxNames = mailboxes.map(m => m.path).filter(p => !p.includes('[Gmail]'));

    console.log('📁 Dossiers disponibles:');
    for (const name of boxNames) {
      const stats = await client.mailboxOpen(name);
      console.log(`   - ${name} (${stats.exists} messages)`);
      await client.mailboxClose();
    }

    // Sync INBOX et SENT
    for (const box of ['INBOX', 'SENT']) {
      try {
        await syncMailbox(client, box);
      } catch (err) {
        console.log(`   ⚠️ Impossible d'ouvrir ${box}, on essaie les équivalents...`);
        // Hostinger utilise parfois "Sent" au lieu de "SENT"
        for (const alt of ['Sent', 'Sent Messages', 'Sent Mail', 'INBOX.Sent']) {
          try {
            await syncMailbox(client, alt);
            break;
          } catch {}
        }
      }
    }

  } catch (err) {
    console.error('\n❌ Erreur:', err.message);
    process.exit(1);
  } finally {
    await client.logout();
    db.close();
  }

  console.log('\n═══════════════════════════════════════');
  console.log('  ✅ SYNC TERMINÉE');
  console.log('  Prochaine étape : lancer le parsing IA');
  console.log('  → node parse-emails.js');
  console.log('═══════════════════════════════════════\n');
}

main();
