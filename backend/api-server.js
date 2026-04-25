import express from 'express';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'emails.db');
const PORT = process.env.API_PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

let db;
try {
  db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = WAL');
  console.log(`Connected to SQLite DB: ${DB_PATH}`);
} catch (err) {
  console.error(`Failed to open database at ${DB_PATH}:`, err.message);
  process.exit(1);
}

// ─── HELPERS ──────────────────────────────────────

/** Convert snake_case DB row to camelCase object */
function toCamel(row) {
  if (!row) return null;
  const out = {};
  for (const [key, val] of Object.entries(row)) {
    out[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = val;
  }
  return out;
}

function nullableInt(val) {
  return val === null || val === undefined ? null : Number(val);
}

// ─── GET /api/stats ───────────────────────────────

app.get('/api/stats', (req, res) => {
  const now = new Date().toISOString().split('T')[0];

  const contacts = db.prepare('SELECT * FROM contacts').all();
  const allStays = db.prepare(`
    SELECT s.*, c.name AS contact_name, c.status AS contact_status
    FROM stays s JOIN contacts c ON c.id = s.contact_id
  `).all();

  const clients = contacts.filter(c => c.status === 'client');
  const prospects = contacts.filter(c => c.status === 'prospect');
  const formerClients = contacts.filter(c => c.status === 'former_client');

  const paidConfirmed = allStays.filter(s => s.status === 'paid' || s.status === 'confirmed');
  const totalRevenue = paidConfirmed.reduce((sum, s) => sum + (s.price_confirmed || 0), 0);
  const upcoming = allStays.filter(s => s.check_in > now && s.status !== 'cancelled');

  // Season summaries
  const seasonsMap = new Map();
  for (const stay of allStays) {
    const season = stay.season;
    if (!seasonsMap.has(season)) {
      seasonsMap.set(season, {
        season,
        label: season.replace('-', ' - '),
        totalStays: 0,
        totalRevenue: 0,
        occupancyWeeks: 0,
        contactsCount: 0,
        newContacts: 0,
      });
    }
    const s = seasonsMap.get(season);
    s.totalStays++;
    s.totalRevenue += stay.price_confirmed || 0;
    s.occupancyWeeks += (stay.nights || 0) / 7;
  }

  res.json({
    currentSeason: '2025-2026',
    totalContacts: contacts.length,
    prospects: prospects.length,
    clients: clients.length,
    formerClients: formerClients.length,
    totalStays: allStays.length,
    totalRevenue,
    averagePrice: paidConfirmed.length > 0 ? Math.round(totalRevenue / paidConfirmed.length) : 0,
    occupancyRate: 72,
    upcomingStays: upcoming.length,
    newInquiries: prospects.length,
    pendingReplies: 0,
    seasons: Array.from(seasonsMap.values()),
  });
});

// ─── GET /api/emails ──────────────────────────────

app.get('/api/emails', (req, res) => {
  const rows = db.prepare('SELECT * FROM emails ORDER BY date DESC').all();
  res.json(rows.map(toCamel));
});

// ─── GET /api/contacts ────────────────────────────

app.get('/api/contacts', (req, res) => {
  const contactRows = db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all();
  const stayRows = db.prepare('SELECT * FROM stays').all();
  const rwRows = db.prepare('SELECT * FROM requested_weeks').all();

  const staysByContact = new Map();
  const rwByContact = new Map();

  for (const stay of stayRows) {
    if (!staysByContact.has(stay.contact_id)) staysByContact.set(stay.contact_id, []);
    staysByContact.get(stay.contact_id).push(toCamel(stay));
  }

  for (const rw of rwRows) {
    if (!rwByContact.has(rw.contact_id)) rwByContact.set(rw.contact_id, []);
    rwByContact.get(rw.contact_id).push(toCamel(rw));
  }

  const contacts = contactRows.map(c => {
    const camel = toCamel(c);
    // Parse alternate_phones (stored as JSON array string)
    try {
      camel.alternatePhones = JSON.parse(c.alternatePhones || '[]');
    } catch {
      camel.alternatePhones = [];
    }
    camel.stays = staysByContact.get(c.id) || [];
    camel.requestedWeeks = rwByContact.get(c.id) || [];
    camel.totalStays = camel.stays.length;
    return camel;
  });

  res.json(contacts);
});

// ─── GET /api/contacts/:id ────────────────────────

app.get('/api/contacts/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Contact not found' });

  const contact = toCamel(row);
  try {
    contact.alternatePhones = JSON.parse(contact.alternatePhones || '[]');
  } catch {
    contact.alternatePhones = [];
  }
  contact.stays = db.prepare('SELECT * FROM stays WHERE contact_id = ?').all(req.params.id).map(toCamel);
  contact.requestedWeeks = db.prepare('SELECT * FROM requested_weeks WHERE contact_id = ?').all(req.params.id).map(toCamel);
  contact.totalStays = contact.stays.length;

  res.json(contact);
});

// ─── GET /api/stays ───────────────────────────────

app.get('/api/stays', (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, c.name AS contact_name, c.email AS contact_email
    FROM stays s JOIN contacts c ON c.id = s.contact_id
    ORDER BY s.check_in DESC
  `).all();

  res.json(rows.map(r => ({
    ...toCamel(r),
    contactName: r.contact_name,
    contactEmail: r.contact_email,
  })));
});

// ─── START ────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log(`  GET http://localhost:${PORT}/api/stats`);
  console.log(`  GET http://localhost:${PORT}/api/emails`);
  console.log(`  GET http://localhost:${PORT}/api/contacts`);
  console.log(`  GET http://localhost:${PORT}/api/contacts/:id`);
  console.log(`  GET http://localhost:${PORT}/api/stays`);
});
