/**
 * Récupère TOUS les emails SENT avec body complet depuis IMAP
 * et synchronise dans SQLite
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
    if (/Ã[©¨ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿À-ÿ]/.test(text)) {
      const latinBuf = Buffer.from(text, 'binary');
      text = new TextDecoder('utf-8').decode(latinBuf);
    }
    if (/=\r?\n|=[0-9A-F]{2}/.test(text)) {
      text = text.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    }
    const bodyMatch = text.match(/\r?\n\r?\n([\s\S]*)/);
    if (bodyMatch) text = bodyMatch[1];
    if (/<[^>]+>/.test(text) && !text.includes('<http')) {
      text = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
      .replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    return text.trim();
  } catch {
    return '';
  }
}

async function main() {
  console.log('📨 Synchronisation des emails SENT avec body...\n');

  await client.connect();
  console.log('✅ Connecté\n');

  const lock = await client.getMailboxLock('INBOX.Sent');

  const messages = [];
  for await (const msg of client.fetch('1:*', {
    uid: true, envelope: true, flags: true, internalDate: true,
  }, { uid: true })) {
    messages.push(msg);
  }

  console.log(`📧 ${messages.length} messages SENT trouvés\n`);

  const upsert = db.prepare(`
    INSERT INTO emails (uid, message_id, mailbox, sender, sender_name, recipients, date, subject, body_text, seen, flagged)
    VALUES (@uid, @messageId, @mailbox, @sender, @senderName, @recipients, @date, @subject, @bodyText, @seen, @flagged)
    ON CONFLICT(uid) DO UPDATE SET
      body_text = CASE WHEN @bodyText != '' THEN @bodyText ELSE body_text END,
      sender = @sender,
      sender_name = @senderName,
      recipients = @recipients,
      subject = @subject,
      date = @date,
      seen = @seen,
      parsed = 0
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

      upsert.run({
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

      if (count % 10 === 0 || count === messages.length) {
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

  console.log(`\n✅ ${count} emails SENT synchronisés avec body (${errors} erreurs)`);

  const stats = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN body_text != '' THEN 1 ELSE 0 END) as with_body FROM emails WHERE mailbox='INBOX.Sent'").get();
  console.log(`📊 SENT dans DB : ${stats.total} (${stats.with_body} avec body)`);
  console.log('🔄 Prêts pour analyse DeepSeek');

  db.close();
}

main().catch(err => { console.error('❌', err); process.exit(1); });
