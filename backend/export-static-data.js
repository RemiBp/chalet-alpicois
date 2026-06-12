/**
 * Export SQLite data to public/data/ for static Vercel deployment.
 * Run locally after enrich/rebuild; commit public/data/ for CI builds.
 */
import Database from 'better-sqlite3';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'public', 'data');

function resolveDbPath() {
  for (const p of [join(ROOT, 'emails.db'), join(__dirname, 'emails.db')]) {
    if (existsSync(p)) return p;
  }
  return null;
}

function toCamel(row) {
  if (!row) return null;
  const out = {};
  for (const [key, val] of Object.entries(row)) {
    out[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = val;
  }
  return out;
}

function mapEmail(r) {
  return {
    ...toCamel(r),
    id: String(r.id),
    folder: r.mailbox,
    isFromGuest: !r.sender?.includes('alpicois-laplagne.fr'),
    threadId: r.message_id,
    contactId: r.contact_id,
  };
}

function mapContactRow(c, { full = false } = {}) {
  const camel = toCamel(c);
  try { camel.alternatePhones = JSON.parse(c.alternate_phones || '[]'); } catch { camel.alternatePhones = []; }
  try { camel.alternateEmails = JSON.parse(c.alternate_emails || '[]'); } catch { camel.alternateEmails = []; }
  camel.stays = [];
  camel.totalStays = 0;
  camel.messageCount = c.message_count ?? db.prepare('SELECT COUNT(*) as c FROM emails WHERE contact_id = ?').get(c.id).c;
  if (c.last_subject !== undefined) camel.lastSubject = c.last_subject || '';
  const limit = full ? 999 : 3;
  camel.requestedWeeks = db.prepare(
    'SELECT * FROM requested_weeks WHERE contact_id = ? ORDER BY check_in DESC LIMIT ?'
  ).all(c.id, limit).map(toCamel);
  try { camel.profileJson = JSON.parse(c.profile_json || '{}'); } catch { camel.profileJson = {}; }
  camel.enrichedAt = c.enriched_at || '';
  return camel;
}

const dbPath = resolveDbPath();
if (!dbPath) {
  if (existsSync(join(OUT, 'contacts.json'))) {
    console.log('No emails.db — keeping existing public/data/');
    process.exit(0);
  }
  console.error('emails.db not found and no static data in public/data/');
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
mkdirSync(join(OUT, 'emails'), { recursive: true });

const monthStart = new Date().toISOString().slice(0, 7) + '-01';
const stats = {
  totalContacts: db.prepare('SELECT COUNT(*) as c FROM contacts').get().c,
  totalEmails: db.prepare('SELECT COUNT(*) as c FROM emails WHERE contact_id IS NOT NULL').get().c,
  emailsThisMonth: db.prepare("SELECT COUNT(*) as c FROM emails WHERE mailbox = 'INBOX' AND date >= ?").get(monthStart).c,
  recentContacts: db.prepare("SELECT COUNT(*) as c FROM contacts WHERE last_contact_date >= ?").get(monthStart).c,
};

const contactRows = db.prepare(`
  SELECT c.*,
    (SELECT COUNT(*) FROM emails e WHERE e.contact_id = c.id) AS message_count,
    (SELECT subject FROM emails e WHERE e.contact_id = c.id ORDER BY date DESC LIMIT 1) AS last_subject
  FROM contacts c
  ORDER BY c.last_contact_date DESC
`).all();

const contacts = contactRows.map(c => mapContactRow(c));
const details = {};
const emailsByContact = {};

for (const c of contactRows) {
  details[c.id] = mapContactRow(c, { full: true });
  const rows = db.prepare('SELECT * FROM emails WHERE contact_id = ? ORDER BY date ASC').all(c.id);
  emailsByContact[c.id] = rows.map(mapEmail);
}

writeFileSync(join(OUT, 'stats.json'), JSON.stringify(stats));
writeFileSync(join(OUT, 'contacts.json'), JSON.stringify(contacts));
writeFileSync(join(OUT, 'details.json'), JSON.stringify(details));
writeFileSync(join(OUT, 'emails.json'), JSON.stringify(emailsByContact));

console.log(`Exported ${contacts.length} contacts, ${stats.totalEmails} emails → public/data/`);
