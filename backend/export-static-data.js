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

function dbUsable(path) {
  try {
    const db = new Database(path, { readonly: true });
    db.prepare('SELECT COUNT(*) as c FROM contacts').get();
    db.close();
    return true;
  } catch {
    return false;
  }
}

function resolveDbPath() {
  for (const p of [
    join(__dirname, 'deploy', 'emails.db'),
    join(ROOT, 'emails.db'),
  ]) {
    if (existsSync(p) && dbUsable(p)) return p;
  }
  if (existsSync(join(OUT, 'contacts.json'))) return null;
  for (const p of [join(__dirname, 'deploy', 'emails.db'), join(ROOT, 'emails.db')]) {
    if (existsSync(p) && dbUsable(p)) return p;
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
  const preview = (r.body_text || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  return {
    ...toCamel(r),
    id: String(r.id),
    folder: r.mailbox,
    isFromGuest: !r.sender?.includes('alpicois-laplagne.fr'),
    threadId: r.message_id,
    contactId: r.contact_id,
    bodyText: preview,
    bodyPreview: preview.slice(0, 160),
  };
}

function bool(value) {
  return value === 1 || value === true;
}

function mapStayProgress(row) {
  const progress = toCamel(row);
  progress.contractSigned = bool(row.contract_signed);
  progress.depositPaid = bool(row.deposit_paid);
  progress.balancePaid = bool(row.balance_paid);
  progress.insuranceReceived = bool(row.insurance_received);
  progress.idReceived = bool(row.id_received);
  progress.depositGuaranteePaid = bool(row.deposit_guarantee_paid);
  progress.depositGuaranteeReturned = bool(row.deposit_guarantee_returned);
  try { progress.mailSteps = JSON.parse(row.mail_steps_json || '{}'); } catch { progress.mailSteps = {}; }
  return progress;
}

function mapContactRow(db, c, { full = false } = {}) {
  const camel = toCamel(c);
  try { camel.alternatePhones = JSON.parse(c.alternate_phones || '[]'); } catch { camel.alternatePhones = []; }
  try { camel.alternateEmails = JSON.parse(c.alternate_emails || '[]'); } catch { camel.alternateEmails = []; }
  camel.stays = db.prepare(
    'SELECT * FROM stays WHERE contact_id = ? ORDER BY check_in DESC LIMIT ?'
  ).all(c.id, full ? 999 : 5).map(toCamel);
  camel.totalStays = db.prepare(
    "SELECT COUNT(*) as c FROM stays WHERE contact_id = ? AND status IN ('confirmed','paid')"
  ).get(c.id).c;
  camel.messageCount = c.message_count ?? db.prepare('SELECT COUNT(*) as c FROM emails WHERE contact_id = ?').get(c.id).c;
  if (c.last_subject !== undefined) camel.lastSubject = c.last_subject || '';
  const limit = full ? 999 : 3;
  camel.requestedWeeks = db.prepare(
    'SELECT * FROM requested_weeks WHERE contact_id = ? ORDER BY check_in DESC LIMIT ?'
  ).all(c.id, limit).map(toCamel);
  camel.stayProgress = db.prepare(
    'SELECT * FROM stay_progress WHERE contact_id = ? ORDER BY check_in ASC'
  ).all(c.id).map(mapStayProgress);
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

try {
  runExport(dbPath);
} catch (err) {
  if (existsSync(join(OUT, 'contacts.json'))) {
    console.warn(`Export skipped (${err.message}) — keeping existing public/data/`);
    process.exit(0);
  }
  throw err;
}

function runExport(dbPath) {
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

const contacts = contactRows.map(c => mapContactRow(db, c));
const details = {};
const emailsByContact = {};

for (const c of contactRows) {
  details[c.id] = mapContactRow(db, c, { full: true });
  const rows = db.prepare('SELECT * FROM emails WHERE contact_id = ? ORDER BY date ASC').all(c.id);
  emailsByContact[c.id] = rows.map(mapEmail);
}

writeFileSync(join(OUT, 'stats.json'), JSON.stringify(stats));
writeFileSync(join(OUT, 'contacts.json'), JSON.stringify(contacts));
writeFileSync(join(OUT, 'details.json'), JSON.stringify(details));
writeFileSync(join(OUT, 'emails.json'), JSON.stringify(emailsByContact));
writeFileSync(join(OUT, 'meta.json'), JSON.stringify({
  exportedAt: new Date().toISOString(),
  contactCount: contacts.length,
  emailCount: stats.totalEmails,
}));

console.log(`Exported ${contacts.length} contacts, ${stats.totalEmails} emails → public/data/`);
}
