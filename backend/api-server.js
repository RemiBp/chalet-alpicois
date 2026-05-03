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
  db = new Database(DB_PATH);
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
    try { camel.alternatePhones = JSON.parse(c.alternate_phones || '[]'); } catch { camel.alternatePhones = []; }
    try { camel.alternateEmails = JSON.parse(c.alternate_emails || '[]'); } catch { camel.alternateEmails = []; }
    const stays = (staysByContact.get(c.id) || []).map(s => {
      try { s.options = JSON.parse(s.options || '{}'); } catch { s.options = {}; }
      return s;
    });
    camel.stays = stays;
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
  try { contact.alternatePhones = JSON.parse(row.alternate_phones || '[]'); } catch { contact.alternatePhones = []; }
  try { contact.alternateEmails = JSON.parse(row.alternate_emails || '[]'); } catch { contact.alternateEmails = []; }
  contact.stays = db.prepare('SELECT * FROM stays WHERE contact_id = ?').all(req.params.id).map(s => {
    const c = toCamel(s);
    try { c.options = JSON.parse(s.options || '{}'); } catch { c.options = {}; }
    return c;
  });
  contact.requestedWeeks = db.prepare('SELECT * FROM requested_weeks WHERE contact_id = ?').all(req.params.id).map(toCamel);
  contact.totalStays = contact.stays.length;

  res.json(contact);
});

// ─── POST /api/contacts ────────────────────────────

app.post('/api/contacts', (req, res) => {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const now = new Date().toISOString();
  const b = req.body;
  db.prepare(`
    INSERT INTO contacts (id, name, first_name, email, alternate_emails, phone, alternate_phones, origin, origin_detail,
      status, nationality, address, postal_code, country, notes, first_contact_date, last_contact_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    id,
    b.name || '',
    b.firstName || b.first_name || '',
    b.email || '',
    JSON.stringify(b.alternateEmails || []),
    b.phone || '',
    JSON.stringify(b.alternatePhones || []),
    b.origin || 'email',
    b.originDetail || b.origin_detail || '',
    b.status || 'prospect',
    b.nationality || '',
    b.address || '',
    b.postalCode || b.postal_code || '',
    b.country || '',
    b.notes || '',
    b.firstContactDate || b.first_contact_date || now,
    b.lastContactDate || b.last_contact_date || now,
  );
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  const camel = toCamel(contact);
  try { camel.alternatePhones = JSON.parse(contact.alternate_phones || '[]'); } catch { camel.alternatePhones = []; }
  camel.stays = [];
  camel.requestedWeeks = [];
  camel.totalStays = 0;
  res.json(camel);
});

// ─── PUT /api/contacts/:id ─────────────────────────

app.put('/api/contacts/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });

  const fieldMap = {
    name: 'name', firstName: 'first_name', first_name: 'first_name',
    email: 'email', phone: 'phone',
    origin: 'origin', originDetail: 'origin_detail', origin_detail: 'origin_detail',
    status: 'status', nationality: 'nationality',
    address: 'address', postalCode: 'postal_code', postal_code: 'postal_code',
    country: 'country', notes: 'notes',
    lastContactDate: 'last_contact_date', last_contact_date: 'last_contact_date',
  };

  const updates = [];
  const vals = [];

  for (const [bodyKey, dbCol] of Object.entries(fieldMap)) {
    if (req.body[bodyKey] !== undefined) {
      updates.push(`${dbCol} = ?`);
      vals.push(req.body[bodyKey]);
    }
  }

  if (req.body.alternatePhones !== undefined) {
    updates.push('alternate_phones = ?');
    vals.push(JSON.stringify(req.body.alternatePhones));
  }

  if (req.body.alternateEmails !== undefined) {
    updates.push('alternate_emails = ?');
    vals.push(JSON.stringify(req.body.alternateEmails));
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    vals.push(id);
    db.prepare(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
  }

  res.json({ success: true });
});

// ─── POST /api/stays ───────────────────────────────

app.post('/api/stays', (req, res) => {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const b = req.body;
  db.prepare(`
    INSERT INTO stays (id, contact_id, season, check_in, check_out, nights, adults, children,
      price_quoted, price_confirmed, status, notes, options, payment_method, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id,
    b.contactId || b.contact_id,
    b.season || '',
    b.checkIn || b.check_in || '',
    b.checkOut || b.check_out || '',
    b.nights || 7,
    b.adults || 1,
    b.children || 0,
    b.priceQuoted || b.price_quoted || 0,
    b.priceConfirmed || b.price_confirmed || 0,
    b.status || 'pending',
    b.notes || '',
    JSON.stringify(b.options || {}),
    b.paymentMethod || b.payment_method || '',
  );
  const stay = db.prepare('SELECT * FROM stays WHERE id = ?').get(id);
  const camel = toCamel(stay);
  try { camel.options = JSON.parse(stay.options || '{}'); } catch { camel.options = {}; }
  res.json(camel);
});

// ─── PUT /api/stays/:id ────────────────────────────

app.put('/api/stays/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM stays WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Stay not found' });

  const fieldMap = {
    season: 'season', checkIn: 'check_in', check_in: 'check_in',
    checkOut: 'check_out', check_out: 'check_out',
    nights: 'nights', adults: 'adults', children: 'children',
    priceQuoted: 'price_quoted', price_quoted: 'price_quoted',
    priceConfirmed: 'price_confirmed', price_confirmed: 'price_confirmed',
    status: 'status', notes: 'notes',
    paymentMethod: 'payment_method', payment_method: 'payment_method',
  };

  const updates = [];
  const vals = [];

  for (const [bodyKey, dbCol] of Object.entries(fieldMap)) {
    if (req.body[bodyKey] !== undefined) {
      updates.push(`${dbCol} = ?`);
      vals.push(req.body[bodyKey]);
    }
  }

  if (req.body.options !== undefined) {
    updates.push('options = ?');
    vals.push(JSON.stringify(req.body.options));
  }

  if (updates.length > 0) {
    vals.push(id);
    db.prepare(`UPDATE stays SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
  }

  res.json({ success: true });
});

// ─── DELETE /api/stays/:id ─────────────────────────

app.delete('/api/stays/:id', (req, res) => {
  db.prepare('DELETE FROM stays WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── GET /api/contacts/:id/interactions ────────────

app.get('/api/contacts/:id/interactions', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM contact_interactions WHERE contact_id = ? ORDER BY date DESC, created_at DESC'
  ).all(req.params.id);
  res.json(rows.map(toCamel));
});

// ─── POST /api/contacts/:id/interactions ───────────

app.post('/api/contacts/:id/interactions', (req, res) => {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const b = req.body;
  db.prepare(`
    INSERT INTO contact_interactions (id, contact_id, date, type, subject, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, b.date || new Date().toISOString().slice(0, 10), b.type || 'other', b.subject || '', b.notes || '');
  const row = db.prepare('SELECT * FROM contact_interactions WHERE id = ?').get(id);
  res.json(toCamel(row));
});

// ─── PUT /api/interactions/:id ─────────────────────

app.put('/api/interactions/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM contact_interactions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Interaction not found' });

  const fieldMap = { date: 'date', type: 'type', subject: 'subject', notes: 'notes' };
  const updates = [];
  const vals = [];
  for (const [k, col] of Object.entries(fieldMap)) {
    if (req.body[k] !== undefined) { updates.push(`${col} = ?`); vals.push(req.body[k]); }
  }
  if (updates.length > 0) {
    vals.push(req.params.id);
    db.prepare(`UPDATE contact_interactions SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json({ success: true });
});

// ─── DELETE /api/interactions/:id ──────────────────

app.delete('/api/interactions/:id', (req, res) => {
  db.prepare('DELETE FROM contact_interactions WHERE id = ?').run(req.params.id);
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

// ─── GET /api/client-analysis ─────────────────────

app.get('/api/client-analysis', (req, res) => {
  // Stats par nationalité — UNIQUEMENT les clients
  const byNationality = db.prepare(`
    SELECT 
      CASE WHEN c.nationality = '' OR c.nationality IS NULL THEN 'Non renseignée' ELSE c.nationality END as nationality,
      COUNT(DISTINCT c.id) as contacts,
      COUNT(DISTINCT CASE WHEN c.status = 'client' THEN c.id END) as clients,
      COUNT(DISTINCT CASE WHEN c.status = 'prospect' THEN c.id END) as prospects,
      COALESCE(ROUND(AVG(s.price_avg), 0), 0) as avg_price,
      COALESCE(ROUND(SUM(s.price_avg), 0), 0) as total_revenue
    FROM contacts c
    LEFT JOIN (
      SELECT s.contact_id, 
        AVG(COALESCE(NULLIF(s.price_confirmed,0), s.price_quoted, 0)) as price_avg
      FROM stays s
      JOIN contacts cc ON cc.id = s.contact_id
      WHERE s.status IN ('confirmed','paid')
        AND cc.status = 'client'
      GROUP BY s.contact_id
    ) s ON s.contact_id = c.id
    GROUP BY nationality
    ORDER BY total_revenue DESC
  `).all();

  // Fidélité : nb de séjours par CLIENT (statut client, pas prospect)
  const loyalty = db.prepare(`
    SELECT 
      CASE 
        WHEN stay_count = 1 THEN '1 séjour'
        WHEN stay_count = 2 THEN '2 séjours'
        WHEN stay_count BETWEEN 3 AND 4 THEN '3-4 séjours'
        ELSE '5+ séjours'
      END as category,
      COUNT(*) as contacts,
      SUM(stay_count) as total_stays
    FROM (
      SELECT s.contact_id, COUNT(*) as stay_count
      FROM stays s
      JOIN contacts c ON c.id = s.contact_id
      WHERE s.status IN ('confirmed','paid')
        AND c.status = 'client'
        AND COALESCE(NULLIF(s.price_confirmed,0), s.price_quoted, 0) > 1500
      GROUP BY s.contact_id
    )
    GROUP BY category
    ORDER BY 
      CASE category
        WHEN '1 séjour' THEN 1
        WHEN '2 séjours' THEN 2
        WHEN '3-4 séjours' THEN 3
        ELSE 4
      END
  `).all();

  // Répartition par saison
  const bySeason = db.prepare(`
    WITH week_primaries AS (
      SELECT 
        CASE CAST(strftime('%w', s.check_in) AS INTEGER)
          WHEN 0 THEN date(s.check_in, '-' || (6) || ' days')
          ELSE date(s.check_in, '-' || (CAST(strftime('%w', s.check_in) AS INTEGER) - 1) || ' days')
        END as week_start,
        s.contact_id,
        s.season,
        MAX(COALESCE(NULLIF(s.price_confirmed,0), s.price_quoted, 0)) as best_price
      FROM stays s
      WHERE s.status IN ('confirmed','paid')
        AND COALESCE(NULLIF(s.price_confirmed,0), s.price_quoted, 0) > 1500
      GROUP BY week_start
    )
    SELECT season,
      COUNT(DISTINCT contact_id) as unique_clients,
      COUNT(DISTINCT week_start) as weeks,
      ROUND(SUM(best_price), 0) as revenue
    FROM week_primaries
    GROUP BY season
    ORDER BY season
  `).all();

  // Top clients (revenus cumulés) — UNIQUEMENT les clients
  const topClients = db.prepare(`
    SELECT c.id, c.name, c.nationality, c.email, c.status,
      COUNT(s.id) as stays_count,
      ROUND(SUM(COALESCE(NULLIF(s.price_confirmed,0), s.price_quoted, 0)), 0) as total_paid,
      MAX(s.check_in) as last_stay
    FROM contacts c
    JOIN stays s ON s.contact_id = c.id
    WHERE s.status IN ('confirmed','paid')
      AND c.status = 'client'
      AND COALESCE(NULLIF(s.price_confirmed,0), s.price_quoted, 0) > 1500
    GROUP BY c.id
    ORDER BY total_paid DESC
    LIMIT 20
  `).all();

  res.json({
    byNationality,
    loyalty,
    bySeason,
    topClients: topClients.map(r => ({
      ...toCamel(r),
      lastStay: r.last_stay,
    })),
  });
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log(`  GET http://localhost:${PORT}/api/stats`);
  console.log(`  GET http://localhost:${PORT}/api/client-analysis`);
  console.log(`  GET http://localhost:${PORT}/api/emails`);
  console.log(`  GET http://localhost:${PORT}/api/contacts`);
  console.log(`  GET http://localhost:${PORT}/api/contacts/:id`);
  console.log(`  GET http://localhost:${PORT}/api/stays`);
});
