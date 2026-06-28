/**
 * Sync IMAP incrémentale — clés last_uid par mailbox.
 */

import { ImapFlow } from 'imapflow';
import { extractBodyText } from './email-body.js';

function uidKey(mailbox) {
  return `last_uid_${mailbox.replace(/\./g, '_')}`;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ full?: boolean, maxMessages?: number }} opts
 */
async function syncMailbox(db, client, mailboxPath, opts = {}) {
  const full = opts.full === true;
  const maxMessages = Number.isFinite(opts.maxMessages) ? Math.max(1, opts.maxMessages) : Infinity;
  let totalMessages = 0;
  let uidNext = null;
  try {
    const status = await client.status(mailboxPath, { messages: true, uidNext: true });
    totalMessages = status.messages;
    uidNext = status.uidNext;
  } catch {
    return { mailbox: mailboxPath, synced: 0, errors: 0, skipped: true };
  }

  if (totalMessages === 0) return { mailbox: mailboxPath, synced: 0, errors: 0 };

  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT)
  `);

  const key = uidKey(mailboxPath);
  const lastUidStr = db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key);
  const lastUid = full ? 0 : (lastUidStr ? parseInt(lastUidStr.value, 10) : 0);
  const sinceUid = lastUid + 1;
  if (!full && uidNext && sinceUid >= uidNext) {
    return { mailbox: mailboxPath, synced: 0, errors: 0, alreadyCurrent: true, lastUid, uidNext };
  }

  let lock;
  try {
    lock = await client.getMailboxLock(mailboxPath);
  } catch {
    return { mailbox: mailboxPath, synced: 0, errors: 0, skipped: true };
  }

  const insertEmail = db.prepare(`
    INSERT OR IGNORE INTO emails (uid, message_id, mailbox, sender, sender_name, recipients, date, subject, body_text, seen, flagged)
    VALUES (@uid, @messageId, @mailbox, @sender, @senderName, @recipients, @date, @subject, @bodyText, @seen, @flagged)
  `);
  const updateLastUid = db.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)');

  let count = 0;
  let errors = 0;

  try {
    const messages = [];
    for await (const msg of client.fetch(`${sinceUid}:*`, {
      uid: true, envelope: true, flags: true, internalDate: true,
    }, { uid: true })) {
      messages.push(msg);
      if (messages.length >= maxMessages) break;
    }

    for (const meta of messages) {
      try {
        if (lock.released) lock = await client.getMailboxLock(mailboxPath);
        else lock.release();

        let sourceBuf = null;
        try {
          const msgSource = await client.fetchOne(meta.uid, { source: true }, { uid: true });
          if (msgSource) sourceBuf = msgSource.source;
        } catch { /* ignore */ }

        lock = await client.getMailboxLock(mailboxPath);

        const envelope = meta.envelope;
        if (!envelope) continue;

        const sender = envelope.from?.[0];
        const senderName = sender?.name || sender?.address || 'Inconnu';
        const senderAddr = sender?.address || '';
        const bodyText = extractBodyText(sourceBuf);

        const inserted = insertEmail.run({
          uid: meta.uid,
          messageId: envelope.messageId || '',
          mailbox: mailboxPath,
          sender: senderAddr,
          senderName,
          recipients: (envelope.to || []).map(r => r.address).join(', '),
          date: meta.internalDate?.toISOString() || new Date().toISOString(),
          subject: envelope.subject || '(Pas de sujet)',
          bodyText,
          seen: meta.flags?.has?.('\\Seen') ? 1 : 0,
          flagged: meta.flags?.has?.('\\Flagged') ? 1 : 0,
        });

        count += inserted.changes;
        updateLastUid.run(key, String(meta.uid));
      } catch {
        errors++;
        if (!lock || lock.released) {
          try { lock = await client.getMailboxLock(mailboxPath); } catch { /* ignore */ }
        }
      }
    }
  } finally {
    if (lock && !lock.released) lock.release();
  }

  return { mailbox: mailboxPath, synced: count, errors };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ full?: boolean, mailboxes?: string[], maxMessagesPerMailbox?: number }} opts
 */
export async function runImapSync(db, opts = {}) {
  const user = process.env.EMAIL_USER || '';
  const pass = process.env.EMAIL_PASS || '';
  if (!user || !pass) {
    return { skipped: true, reason: 'EMAIL_USER/EMAIL_PASS non configurés', mailboxes: [] };
  }

  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.hostinger.com',
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const results = [];

  try {
    await client.connect();
    let boxes = opts.mailboxes;
    if (!boxes) {
      boxes = ['INBOX', 'INBOX.Sent'];
      try {
        const listed = await client.list();
        for (const mb of listed) {
          const path = mb.path || '';
          const lower = path.toLowerCase();
          if (/junk|spam|ind[eé]sirable|bulk/.test(lower) && !boxes.includes(path)) {
            boxes.push(path);
          }
        }
      } catch { /* ignore list failure */ }
    }
    for (const box of boxes) {
      results.push(await syncMailbox(db, client, box, {
        full: opts.full,
        maxMessages: opts.maxMessagesPerMailbox,
      }));
    }
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }

  const totalSynced = results.reduce((s, r) => s + (r.synced || 0), 0);
  return { skipped: false, totalSynced, mailboxes: results };
}
