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

  const clients = contacts.filter(c => c.status === 'client');
  const prospects = contacts.filter(c => c.status === 'prospect');
  const formerClients = contacts.filter(c => c.status === 'former_client');

  // ═══════════════════════════════════════════════════
  //  REVENUS RÉELS : 1 SEUL SÉJOUR PAR SEMAINE
  //  On prend le MAX price_confirmed/price_quoted
  //  par semaine pour éviter les doublons DeepSeek
  // ═══════════════════════════════════════════════════
  const revenueByWeek = db.prepare(`
    WITH week_prices AS (
      SELECT 
        CASE CAST(strftime('%w', s.check_in) AS INTEGER)
          WHEN 0 THEN date(s.check_in, '-' || (6) || ' days')
          ELSE date(s.check_in, '-' || (CAST(strftime('%w', s.check_in) AS INTEGER) - 1) || ' days')
        END as week_start,
        MAX(COALESCE(s.price_confirmed, s.price_quoted, 0)) as best_price,
        s.season
      FROM stays s
      WHERE s.status IN ('confirmed','paid')
      GROUP BY week_start, s.season
      HAVING best_price >= 1000
    )
    SELECT COUNT(*) as weeks, ROUND(SUM(best_price),0) as total_revenue
    FROM week_prices
  `).get();

  const totalRevenue = revenueByWeek.total_revenue || 0;
  const bookedWeeksCount = revenueByWeek.weeks || 0;
  const averagePrice = bookedWeeksCount > 0 ? Math.round(totalRevenue / bookedWeeksCount) : 0;

  // Season summaries — même logique 1 semaine max
  const seasonSummaries = db.prepare(`
    WITH week_prices AS (
      SELECT 
        CASE CAST(strftime('%w', s.check_in) AS INTEGER)
          WHEN 0 THEN date(s.check_in, '-' || (6) || ' days')
          ELSE date(s.check_in, '-' || (CAST(strftime('%w', s.check_in) AS INTEGER) - 1) || ' days')
        END as week_start,
        MAX(COALESCE(s.price_confirmed, s.price_quoted, 0)) as best_price,
        s.season
      FROM stays s
      WHERE s.status IN ('confirmed','paid')
      GROUP BY week_start, s.season
      HAVING best_price >= 1000
    )
    SELECT season, COUNT(*) as weeks, ROUND(SUM(best_price),0) as revenue
    FROM week_prices
    GROUP BY season
    ORDER BY season
  `).all();

  const seasonsMap = new Map();
  for (const w of seasonSummaries) {
    seasonsMap.set(w.season, {
      season: w.season,
      label: w.season.replace('-', ' - '),
      totalStays: w.weeks,
      totalRevenue: w.revenue,
      occupancyWeeks: w.weeks,
      contactsCount: 0,
      newContacts: 0,
    });
  }

  // Séjours à venir : check_in > aujourd'hui, non annulés
  const allStays = db.prepare(`
    SELECT s.*, c.name AS contact_name, c.status AS contact_status
    FROM stays s JOIN contacts c ON c.id = s.contact_id
  `).all();
  const upcoming = allStays.filter(s => s.check_in > now && s.status !== 'cancelled');

  // Emails reçus ce mois-ci
  const currentMonthStart = now.slice(0, 7) + '-01';
  const emailsReceivedThisMonth = db.prepare(
    "SELECT COUNT(*) as c FROM emails WHERE mailbox = 'INBOX' AND date >= ?"
  ).get(currentMonthStart).c;

  // Nouvelles demandes : prospects créés ce mois (last_contact_date >= début du mois)
  const newInquiries = db.prepare(
    "SELECT COUNT(*) as c FROM contacts WHERE status = 'prospect' AND last_contact_date >= ?"
  ).get(currentMonthStart).c;

  // Demandes à confirmer : stays pending avec check_in >= aujourd'hui, triées par check_in ASC
  const pendingStays = db.prepare(`
    SELECT s.*, c.name AS contact_name
    FROM stays s JOIN contacts c ON c.id = s.contact_id
    WHERE s.status = 'pending' AND s.check_in >= ?
    ORDER BY s.check_in ASC
    LIMIT 10
  `).all(now);

  res.json({
    currentSeason: '2025-2026',
    totalContacts: contacts.length,
    prospects: prospects.length,
    clients: clients.length,
    formerClients: formerClients.length,
    totalStays: bookedWeeksCount,
    totalRevenue,
    averagePrice,
    occupancyRate: 72,
    upcomingStays: upcoming.length,
    emailsReceivedThisMonth,
    newInquiries,
    pendingReplies: 0,
    pendingStays: pendingStays.map(s => ({
      id: s.id,
      contactName: s.contact_name,
      checkIn: s.check_in,
      checkOut: s.check_out,
      nights: s.nights || 7,
      price: (s.price_confirmed > 0 ? s.price_confirmed : s.price_quoted) || 0,
    })),
    seasons: Array.from(seasonsMap.values()),
  });
});

// ─── GET /api/emails ──────────────────────────────

app.get('/api/emails', (req, res) => {
  const rows = db.prepare('SELECT * FROM emails ORDER BY date DESC').all();
  res.json(rows.map(r => ({
    ...toCamel(r),
    id: String(r.id),
    folder: r.mailbox,
    isFromGuest: !r.sender?.includes('alpicois-laplagne.fr'),
    threadId: null,
  })));
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

// ─── PUT /api/contacts/:id ─────────────────────────

app.put('/api/contacts/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });

  const fields = ['name', 'email', 'phone', 'origin', 'origin_detail', 'status', 'nationality', 'notes'];
  const updates = [];
  const vals = [];

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      vals.push(req.body[f]);
    }
  }

  if (req.body.alternatePhones !== undefined) {
    updates.push('alternate_phones = ?');
    vals.push(JSON.stringify(req.body.alternatePhones));
  }

  if (updates.length > 0) {
    updates.push('updated_at = datetime(\'now\')');
    vals.push(id);
    db.prepare(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
  }

  res.json({ success: true });
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

// ─── GET /api/auto-replies ────────────────────────

app.get('/api/auto-replies', (req, res) => {
  const rows = db.prepare(`
    SELECT ar.*, c.name AS contact_name, c.email AS contact_email
    FROM auto_replies ar JOIN contacts c ON c.id = ar.contact_id
    ORDER BY ar.created_at DESC
  `).all();

  res.json(rows.map(r => ({
    ...toCamel(r),
    id: String(r.id),
    emailId: r.email_id,
    contactId: r.contact_id,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    replyType: r.reply_type,
    replySubject: r.reply_subject,
    replyBody: r.reply_body,
    alternativeWeeks: (() => { try { return JSON.parse(r.alternative_weeks || '[]'); } catch { return []; } })(),
    status: r.status,
    createdAt: r.created_at,
    sentAt: r.sent_at,
  })));
});

// ─── PUT /api/auto-replies/:id/approve ────────────

app.put('/api/auto-replies/:id/approve', (req, res) => {
  const result = db.prepare("UPDATE auto_replies SET status = 'approved' WHERE id = ?").run(req.params.id);
  res.json({ success: result.changes > 0 });
});

// ─── PUT /api/auto-replies/:id/cancel ─────────────

app.put('/api/auto-replies/:id/cancel', (req, res) => {
  const result = db.prepare("UPDATE auto_replies SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  res.json({ success: result.changes > 0 });
});

// ─── PUT /api/auto-replies/:id/send ───────────────

app.put('/api/auto-replies/:id/send', (req, res) => {
  const result = db.prepare("UPDATE auto_replies SET status = 'sent', sent_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ success: result.changes > 0 });
});

// ─── GET /api/auto-reply-rules ────────────────────

app.get('/api/auto-reply-rules', (req, res) => {
  const rows = db.prepare('SELECT * FROM auto_reply_rules ORDER BY created_at DESC').all();
  res.json(rows.map(r => ({
    ...toCamel(r),
    isActive: !!r.is_active,
  })));
});

// ─── POST /api/auto-reply-rules ───────────────────

app.post('/api/auto-reply-rules', (req, res) => {
  const { name, matchKeywords, minPrice, maxPrice, minNights, maxNights, replyTemplate } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  db.prepare(`INSERT INTO auto_reply_rules (id, name, match_keywords, min_price, max_price, min_nights, max_nights, reply_template) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, name, matchKeywords || '', minPrice || 0, maxPrice || 99999, minNights || 1, maxNights || 14, replyTemplate || '');
  res.json({ success: true, id });
});

// ─── PUT /api/auto-reply-rules/:id/toggle ─────────

app.put('/api/auto-reply-rules/:id/toggle', (req, res) => {
  const rule = db.prepare('SELECT is_active FROM auto_reply_rules WHERE id = ?').get(req.params.id);
  if (!rule) return res.status(404).json({ error: 'Rule not found' });
  db.prepare('UPDATE auto_reply_rules SET is_active = ? WHERE id = ?').run(rule.is_active ? 0 : 1, req.params.id);
  res.json({ success: true });
});

// ─── DELETE /api/auto-reply-rules/:id ─────────────

app.delete('/api/auto-reply-rules/:id', (req, res) => {
  db.prepare('DELETE FROM auto_reply_rules WHERE id = ?').run(req.params.id);
  res.json({ success: true });
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
