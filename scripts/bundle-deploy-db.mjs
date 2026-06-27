/**
 * Produit backend/deploy/emails.db pour chaque build Vercel.
 * - Local : copie emails.db si présent
 * - CI / sans emails.db : reconstruit depuis public/data/*.json (commité)
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const require = createRequire(join(__dirname, '../backend/package.json'));
const OUT_DIR = join(ROOT, 'backend', 'deploy');

const OUT_DB = join(OUT_DIR, 'emails.db');
const LOCAL_DB = join(ROOT, 'emails.db');
const DATA = join(ROOT, 'public', 'data');

function localDbUsable() {
  if (!existsSync(LOCAL_DB)) return false;
  try {
    const Database = require('better-sqlite3');
    const db = new Database(LOCAL_DB, { readonly: true });
    db.prepare('SELECT COUNT(*) as c FROM contacts').get();
    db.close();
    return true;
  } catch {
    return false;
  }
}

function buildFromJson() {
  const Database = require('better-sqlite3');
  const contacts = JSON.parse(readFileSync(join(DATA, 'contacts.json'), 'utf8'));
  const emailsByContact = JSON.parse(readFileSync(join(DATA, 'emails.json'), 'utf8'));

  if (existsSync(OUT_DB)) unlinkSync(OUT_DB);
  mkdirSync(OUT_DIR, { recursive: true });
  const db = new Database(OUT_DB);

  db.exec(`
    CREATE TABLE contacts (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT DEFAULT '',
      alternate_phones TEXT DEFAULT '[]', origin TEXT DEFAULT 'email', origin_detail TEXT DEFAULT '',
      status TEXT DEFAULT 'prospect', first_contact_date TEXT, last_contact_date TEXT,
      total_stays INTEGER DEFAULT 0, notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      nationality TEXT DEFAULT '', first_name TEXT DEFAULT '', address TEXT DEFAULT '',
      postal_code TEXT DEFAULT '', country TEXT DEFAULT '', alternate_emails TEXT DEFAULT '[]',
      profile_json TEXT DEFAULT '{}', enriched_at TEXT DEFAULT ''
    );
    CREATE TABLE emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER, message_id TEXT, mailbox TEXT DEFAULT 'INBOX',
      sender TEXT NOT NULL, sender_name TEXT DEFAULT '', recipients TEXT DEFAULT '',
      date TEXT NOT NULL, subject TEXT DEFAULT '', body_text TEXT DEFAULT '',
      seen INTEGER DEFAULT 0, flagged INTEGER DEFAULT 0, parsed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')), contact_id TEXT
    );
    CREATE TABLE requested_weeks (
      id TEXT PRIMARY KEY, contact_id TEXT NOT NULL, season TEXT, week_number INTEGER,
      check_in TEXT, check_out TEXT, adults INTEGER DEFAULT 1, children INTEGER DEFAULT 0,
      status TEXT DEFAULT 'asked', notes TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE stays (
      id TEXT PRIMARY KEY, contact_id TEXT NOT NULL, season TEXT, check_in TEXT, check_out TEXT,
      nights INTEGER DEFAULT 0, adults INTEGER DEFAULT 1, children INTEGER DEFAULT 0,
      price_quoted REAL DEFAULT 0, price_confirmed REAL DEFAULT 0, status TEXT DEFAULT 'pending',
      source_email_id INTEGER, notes TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE stay_progress (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      season TEXT DEFAULT '',
      week_price REAL DEFAULT 0,
      contract_number TEXT DEFAULT '',
      contract_signed INTEGER DEFAULT 0,
      deposit_invoice_number TEXT DEFAULT '',
      deposit_amount REAL DEFAULT 0,
      deposit_payment_method TEXT DEFAULT '',
      deposit_paid INTEGER DEFAULT 0,
      balance_invoice_number TEXT DEFAULT '',
      balance_amount REAL DEFAULT 0,
      balance_payment_method TEXT DEFAULT '',
      balance_paid INTEGER DEFAULT 0,
      insurance_received INTEGER DEFAULT 0,
      id_received INTEGER DEFAULT 0,
      deposit_guarantee_paid INTEGER DEFAULT 0,
      deposit_guarantee_returned INTEGER DEFAULT 0,
      mail_steps_json TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(contact_id, check_in, check_out)
    );
  `);

  const insContact = db.prepare(`
    INSERT INTO contacts (id, name, first_name, email, phone, alternate_phones, alternate_emails,
      origin, origin_detail, status, nationality, address, postal_code, country,
      notes, profile_json, enriched_at, first_contact_date, last_contact_date, total_stays, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const insWeek = db.prepare(`
    INSERT OR IGNORE INTO requested_weeks (id, contact_id, season, week_number, check_in, check_out, adults, children, status, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `);

  const insStay = db.prepare(`
    INSERT OR IGNORE INTO stays (id, contact_id, season, check_in, check_out, nights, adults, children,
      price_quoted, price_confirmed, status, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const insEmail = db.prepare(`
    INSERT INTO emails (id, uid, message_id, mailbox, sender, sender_name, recipients, date, subject, body_text, seen, flagged, parsed, contact_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const insProgress = db.prepare(`
    INSERT OR IGNORE INTO stay_progress (
      id, contact_id, check_in, check_out, season, week_price,
      contract_number, contract_signed, deposit_invoice_number, deposit_amount, deposit_payment_method, deposit_paid,
      balance_invoice_number, balance_amount, balance_payment_method, balance_paid,
      insurance_received, id_received, deposit_guarantee_paid, deposit_guarantee_returned, mail_steps_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  const tx = db.transaction(() => {
    for (const c of contacts) {
      insContact.run(
        c.id, c.name || '', c.firstName || '', c.email || '', c.phone || '',
        JSON.stringify(c.alternatePhones || []), JSON.stringify(c.alternateEmails || []),
        c.origin || 'email', c.originDetail || '', c.status || 'prospect',
        c.nationality || '', c.address || '', c.postalCode || '', c.country || '',
        c.notes || '', JSON.stringify(c.profileJson || {}), c.enrichedAt || '',
        c.firstContactDate || '', c.lastContactDate || '', c.totalStays || 0,
        c.createdAt || '', c.updatedAt || '',
      );
      for (const w of c.requestedWeeks || []) {
        insWeek.run(
          w.id || `${c.id}-${w.checkIn}`, c.id, w.season || '', w.weekNumber ?? null,
          w.checkIn || '', w.checkOut || '', w.adults || 1, w.children || 0,
          w.status || 'asked', w.notes || '',
        );
      }
      for (const s of c.stays || []) {
        insStay.run(
          s.id || `${c.id}-${s.checkIn}`, c.id, s.season || '', s.checkIn || '', s.checkOut || '',
          s.nights || 0, s.adults || 1, s.children || 0,
          s.priceQuoted || 0, s.priceConfirmed || 0, s.status || 'pending', s.notes || '',
        );
      }
      for (const p of c.stayProgress || []) {
        insProgress.run(
          p.id || `${c.id}-${p.checkIn}-progress`, c.id, p.checkIn || '', p.checkOut || '', p.season || '', p.weekPrice || 0,
          p.contractNumber || '', p.contractSigned ? 1 : 0, p.depositInvoiceNumber || '', p.depositAmount || 0, p.depositPaymentMethod || '', p.depositPaid ? 1 : 0,
          p.balanceInvoiceNumber || '', p.balanceAmount || 0, p.balancePaymentMethod || '', p.balancePaid ? 1 : 0,
          p.insuranceReceived ? 1 : 0, p.idReceived ? 1 : 0, p.depositGuaranteePaid ? 1 : 0, p.depositGuaranteeReturned ? 1 : 0,
          JSON.stringify(p.mailSteps || {}),
        );
      }
    }

    let emailId = 1;
    for (const [contactId, emails] of Object.entries(emailsByContact)) {
      for (const e of emails) {
        insEmail.run(
          emailId++, e.uid ?? null, e.messageId || '', e.mailbox || e.folder || 'INBOX',
          e.sender || 'unknown', e.senderName || '', e.recipients || '',
          e.date || '', e.subject || '', (e.bodyText || '').slice(0, 5000),
          e.seen ? 1 : 0, e.flagged ? 1 : 0, e.parsed ? 1 : 0, contactId,
        );
      }
    }
  });

  tx();
  db.close();
  console.log(`Built deploy DB from JSON → ${contacts.length} contacts`);
}

mkdirSync(OUT_DIR, { recursive: true });

if (localDbUsable()) {
  copyFileSync(LOCAL_DB, OUT_DB);
  console.log(`Copied emails.db → backend/deploy/emails.db`);
} else if (existsSync(OUT_DB)) {
  console.log(`Keeping existing backend/deploy/emails.db (local emails.db absent or unusable)`);
} else if (existsSync(join(DATA, 'contacts.json')) && existsSync(join(DATA, 'emails.json'))) {
  buildFromJson();
} else {
  console.error('No emails.db and no public/data/ — cannot bundle deploy DB');
  process.exit(1);
}
