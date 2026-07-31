/**
 * Re-extract suspicious stored bodies from their authoritative IMAP source.
 * Dry-run by default. Usage: DB_PATH=/path/emails.db EMAIL_USER=... EMAIL_PASS=... node repair-email-bodies-imap.js --apply
 */
import Database from 'better-sqlite3';
import { ImapFlow } from 'imapflow';
import { extractBodyText } from './email-body.js';

const dbPath = process.env.DB_PATH;
const apply = process.argv.includes('--apply');
const all = process.argv.includes('--all');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 1) : 1000;
if (!dbPath) throw new Error('DB_PATH requis');
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) throw new Error('EMAIL_USER / EMAIL_PASS requis');

const gluedPattern = /(?:@[\w.+-]+\.[A-Za-z]{2,})(?:Your|Votre|Message)|Votre nom(?=[A-Za-zÀ-ÿ])\S*Email(?=[A-Za-z0-9])|Your Message(?=[A-Za-zÀ-ÿ])/i;
const technicalPattern = /Content-(?:Type|Transfer-Encoding):|WPForms|field-value|@media only screen|\ufffd|Ã.|â€™|[A-Za-zÀ-ÿ]ý|ý[A-Za-zÀ-ÿ]/i;
const issues = text => {
  const body = String(text || '');
  return (gluedPattern.test(body) ? 20 : 0)
    + (technicalPattern.test(body) ? 8 : 0)
    + Math.min(10, (body.match(/\ufffd/g) || []).length)
    + Math.min(40, (body.match(/Ã.|â€™|[A-Za-zÀ-ÿ]ý|ý[A-Za-zÀ-ÿ]/gi) || []).length * 2)
    + (body.length < 20 ? 6 : 0);
};

const db = new Database(dbPath);
const rows = db.prepare(`
  SELECT id, uid, mailbox, subject, body_text
  FROM emails
  WHERE uid IS NOT NULL AND mailbox IS NOT NULL
  ORDER BY date DESC
`).all().filter(row => all || gluedPattern.test(row.body_text || '') || technicalPattern.test(row.body_text || '')).slice(0, limit);

const client = new ImapFlow({
  host: process.env.IMAP_HOST || 'imap.hostinger.com',
  port: Number(process.env.IMAP_PORT || 993),
  secure: true,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  logger: false,
});
const update = db.prepare('UPDATE emails SET body_text = ? WHERE id = ?');
const report = { candidates: rows.length, fetched: 0, improved: 0, unchanged: 0, errors: 0, errorIds: [], applied: apply, all };

await client.connect();
for (const mailbox of [...new Set(rows.map(row => row.mailbox))]) {
  let lock;
  try {
    lock = await client.getMailboxLock(mailbox);
    for (const row of rows.filter(candidate => candidate.mailbox === mailbox)) {
      try {
        const source = (await client.fetchOne(row.uid, { source: true }, { uid: true }))?.source;
        if (!source) throw new Error('source absente');
        report.fetched++;
        const fresh = extractBodyText(source);
        const improved = fresh.length >= 20
          && !gluedPattern.test(fresh)
          && (
            issues(fresh) < issues(row.body_text)
            || fresh.length > String(row.body_text || '').length * 1.2
            || (all && fresh !== row.body_text && issues(fresh) <= issues(row.body_text) && !technicalPattern.test(fresh))
          );
        if (improved) {
          if (apply) update.run(fresh, row.id);
          report.improved++;
        } else {
          report.unchanged++;
        }
      } catch {
        report.errors++;
        report.errorIds.push(String(row.id));
      }
    }
  } finally {
    if (lock && !lock.released) lock.release();
  }
}
try { await client.logout(); } catch { /* ignore */ }

report.integrity = db.pragma('integrity_check', { simple: true });
db.close();
console.log(JSON.stringify(report));
