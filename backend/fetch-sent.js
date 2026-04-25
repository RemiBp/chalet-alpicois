/**
 * Récupère TOUS les emails SENT depuis IMAP et les importe dans SQLite
 * Contourne le bug du sync.js qui partage last_uid entre mailboxs
 */
import 'dotenv/config';
import { ImapFlow } from 'imapflow';
import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '../emails.db';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const client = new ImapFlow({
  host: process.env.IMAP_HOST || 'imap.hostinger.com',
  port: parseInt(process.env.IMAP_PORT || '993'),
  secure: true,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  logger: false,
});

function extractBodyText(source) {
  if (!source) return '';
  try {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let text = decoder.decode(source);
    // Détection et correction des faux UTF-8 (latin1 mal interprété)
    if (/Ã[©¨ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿À-ÿ]/.test(text)) {
      const latinBuf = Buffer.from(text, 'binary');
      text = new TextDecoder('utf-8').decode(latinBuf);
    }
    // Enlever le quoted-printable manuellement si présent
    if (/=\r?\n|=[0-9A-F]{2}/.test(text)) {
      text = text.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    }
    // Enlever les headers jusqu'au premier double saut de ligne
    const bodyMatch = text.match(/\r?\n\r?\n([\s\S]*)/);
    if (bodyMatch) text = bodyMatch[1];
    // Nettoyage HTML si besoin
    if (/<[^>]+>/.test(text) && !text.includes('<http')) {
      text = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
      .replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    return text.trim().substring(0, 50000);
  } catch {
    return '';
  }
}

async function main() {
  console.log('📨 Récupération des emails SENT...\n');

  await client.connect();
  const lock = await client.getMailboxLock('INBOX.Sent');

  // Fetch tous les messages
  const messages = [];
  for await (const msg of client.fetch('1:*', {
    uid: true, envelope: true, flags: true, internalDate: true,
  }, { uid: true })) {
    messages.push(msg);
  }

  console.log(`📧 ${messages.length} messages SENT trouvés\n`);

  const insertEmail = db.prepare(`
    INSERT OR IGNORE INTO emails (uid, message_id, mailbox, sender, sender_name, recipients, date, subject, body_text, seen, flagged)
    VALUES (@uid, @messageId, @mailbox, @sender, @senderName, @recipients, @date, @subject, @bodyText, @seen, @flagged)
  `);

  let count = 0, errors = 0;

  for (let i = 0; i < messages.length; i++) {
    const meta = messages[i];
    try {
      lock.release();
      let sourceBuf = null;
      try {
        const src = await client.fetchOne(meta.uid, { source: true }, { uid: true });
        if (src) sourceBuf = src.source;
      } catch {}

      if (!lock || lock.released) {
        lock = await client.getMailboxLock('INBOX.Sent');
      }

      const envelope = meta.envelope;
      if (!envelope) continue;

      const sender = envelope.from?.[0];
      const senderName = sender?.name || sender?.address || 'Inconnu';
      const senderAddr = sender?.address || '';
      const bodyText = extractBodyText(sourceBuf);
      const isSeen = meta.flags?.has?.('\\Seen') ? 1 : 0;

      // Vérifier si l'email existe déjà par uid + mailbox
      const existing = db.prepare('SELECT id FROM emails WHERE uid = ? AND mailbox = ?').get(meta.uid, 'INBOX.Sent');
      if (existing) {
        count++;
        continue;
      }

      insertEmail.run({
        uid: meta.uid,
        messageId: envelope.messageId || '',
        mailbox: 'INBOX.Sent',
        sender: senderAddr,
        senderName: senderName,
        recipients: (envelope.to || []).map(r => r.address).join(', '),
        date: meta.internalDate?.toISOString() || new Date().toISOString(),
        subject: envelope.subject || '(Pas de sujet)',
        bodyText: bodyText.substring(0, 50000),
        seen: isSeen,
        flagged: 0,
      });
      count++;

      if (count % 20 === 0 || count === messages.length) {
        process.stdout.write(`   ${count}/${messages.length} emails...\r`);
      }
    } catch (err) {
      errors++;
      if (!lock || lock.released) {
        try { lock = await client.getMailboxLock('INBOX.Sent'); } catch {}
      }
      if (errors <= 3) console.error(`\n   ❌ UID ${meta.uid}: ${err.message}`);
    }
  }

  lock.release();
  await client.logout();

  console.log(`\n✅ ${count} emails SENT synchronisés (${errors} erreurs)`);

  const totalSent = db.prepare("SELECT COUNT(*) as c FROM emails WHERE mailbox='INBOX.Sent'").get().c;
  console.log(`📊 Total SENT dans DB : ${totalSent}`);

  // Reset parsed flag pour les nouveaux emails SENT
  db.prepare("UPDATE emails SET parsed = 0 WHERE mailbox = 'INBOX.Sent'").run();
  console.log('🔄 Emails SENT marqués comme non-parsés (prêts pour analyse DeepSeek)');

  db.close();
}

main().catch(err => { console.error('❌', err); process.exit(1); });
