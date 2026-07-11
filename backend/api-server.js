import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { ensureDb, persistDb, persistDbDetailed, requirePersistDb, reloadDbFromBlob } from './database.js';
import {
  createAdminToken,
  verifyAdminToken,
  decodeAdminToken,
  checkAdminPassword,
  isAdminConfigured,
} from './admin-auth.js';
import {
  previewDocumentFields,
  generateContractPdf,
  generateContractDocx,
  generateInvoicePdf,
  generateInvoiceDocx,
  generateContractPackZip,
} from './generate-documents.js';
import { buildDocumentFilename } from './document-filenames.js';
import { LANDLORD } from './document-fields.js';
import { saveDraftToMailbox } from './mail-draft.js';
import {
  listMailTemplates,
  saveMailTemplateOverride,
  resetMailTemplateOverride,
  getContactMailTracking,
  upsertContactMailTracking,
  renderMailTemplateForContact,
} from './mail-templates.js';
import { buildDocumentDraftPayload, pickThreadReply, listContactThreadCandidates } from './document-email.js';
import { extractInquiryFromEmails, computeSeason } from './extract-inquiry.js';
import { enrichWeekWithAvailability, estimateWeeklyPrice } from './availability.js';
import { buildInquiryDraftPayload, buildInquiryPreview } from './inquiry-email.js';
import { runRefreshPipeline } from './refresh-pipeline.js';
import { refreshBookingStatuses, detectSignalFromEmail } from './detect-booking-signals.js';
import { getCalendarEvents } from './calendar-events.js';
import { reconcileBookingsWithAi } from './ai-booking-verify.js';
import { isDeepSeekConfigured } from './deepseek-client.js';
import { displayNameFromContact } from './name-format.js';
import { confirmRequestedWeek, updateRequestedWeekStatus, assignWeekToContact, removeCalendarBooking, updateCalendarEvent } from './week-booking.js';
import { parseStayEventId, parseWeekEventId } from './finance.js';
import { ensurePersonalContact } from './host-filter.js';
import { cleanStoredBodyText } from './email-body.js';
import { getFinanceSummary } from './finance.js';
import { isInternalEmail } from './host-filter.js';
import { mergeContacts } from './merge-contacts.js';
import { applyExtractedProfile } from './extract-profile.js';
import { listAuditLog, appendAudit } from './audit-log.js';
import { resolveSyncProposals, countPendingProposals } from './sync-proposals.js';
import { getDataDoubts } from './doubts.js';
import { listStayProgressForContact, upsertStayProgress } from './stay-progress.js';

const PORT = process.env.API_PORT || 3001;

function adminTokenFromReq(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
}

function adminActorFromReq(req) {
  return decodeAdminToken(adminTokenFromReq(req))?.actor || 'gilles';
}

async function ensureFreshDb() {
  if (process.env.VERCEL === '1') {
    db = await reloadDbFromBlob();
  }
  return db;
}

function contactFromRow(row) {
  if (!row) return null;
  const contact = toCamel(row);
  try { contact.alternatePhones = JSON.parse(row.alternate_phones || '[]'); } catch { contact.alternatePhones = []; }
  try { contact.alternateEmails = JSON.parse(row.alternate_emails || '[]'); } catch { contact.alternateEmails = []; }
  try { contact.profileJson = JSON.parse(row.profile_json || '{}'); } catch { contact.profileJson = {}; }
  contact.enrichedAt = row.enriched_at || '';
  contact.isPersonal = row.is_personal === 1;
  return formatContactResponse(contact);
}

function auditCtxFromReq(req) {
  const actor = adminActorFromReq(req);
  return { source: actor, actor };
}

async function recordAudit(req, entry) {
  appendAudit(db, {
    actor: adminActorFromReq(req),
    ...entry,
  });
  await requirePersistDb();
}

async function persistAfterWrite() {
  await requirePersistDb();
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

/** @type {import('better-sqlite3').Database | null} */
let db = null;
let refreshInFlight = null;

async function runRefreshOnce(opts, audit) {
  if (refreshInFlight) return { ...(await refreshInFlight), reusedInFlight: true };
  refreshInFlight = (async () => {
    const report = await runRefreshPipeline(db, opts);
    if (audit) {
      appendAudit(db, {
        action: 'data_refresh',
        entityType: 'pipeline',
        entityId: 'refresh',
        payload: {
          mails: report.imap?.totalSynced ?? 0,
          profiles: report.profiles?.filledCoords ?? 0,
          signals: report.signals?.recordsUpdated ?? 0,
          proposals: report.proposals?.proposalsCreated ?? 0,
          ...(audit.payload || {}),
        },
        actor: audit.actor || 'automatic',
      });
    }
    await persistDb();
    return { ...report, pendingCount: countPendingProposals(db) };
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

app.use('/api', async (req, res, next) => {
  try {
    db = await ensureDb();
    next();
  } catch (err) {
    console.error('DB init error:', err);
    res.status(503).json({ error: 'Base de données indisponible', details: err.message });
  }
});

app.use('/api', (req, res, next) => {
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();
  if (req.path === '/admin/login') return next();
  if (req.path === '/documents/preview') return next();
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: 'Mode admin requis — connectez-vous avec le mot de passe admin' });
  }
  next();
});

app.use('/api', (req, res, next) => {
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();
  if (req.path === '/admin/login') return next();
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      persistDb().catch(err => console.error('persistDb:', err.message));
    }
  });
  next();
});

// ─── ADMIN ────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    ok: Boolean(db),
    apiVersion: '2026-06-15-mail-suivi-v2',
    adminConfigured: isAdminConfigured(),
    blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    cronConfigured: Boolean(process.env.CRON_SECRET),
    imapConfigured: Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS),
    vercel: process.env.VERCEL === '1',
    blobKey: 'alpicois-emails.db',
    blobAccess: process.env.BLOB_STORE_ACCESS === 'private' ? 'private' : 'public',
    deepseek: isDeepSeekConfigured(),
    aiReconcileDryRun: process.env.AI_RECONCILE_DRY_RUN === '1',
  });
});

app.get('/api/coherence/report', async (req, res) => {
  if (!verifyAdminToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    const { getFinanceSummary } = await import('./finance.js');
    const finance = getFinanceSummary(db, req.query.season || '2026-2027');
    const estimated = finance.lines.filter(l => l.estimatedAmount && !l.personal);
    const multiWeek = finance.lines.filter(l => (l.weekCount || 1) > 1);
    let aiPreview = null;
    if (isDeepSeekConfigured()) {
      aiPreview = await reconcileBookingsWithAi(db, {
        limit: parseInt(req.query.aiLimit || '10', 10),
        dryRun: true,
      });
    }
    res.json({
      finance: {
        season: finance.season,
        collected: finance.collected,
        confirmedPending: finance.confirmedPending,
        forecast: finance.forecast,
        bookedWeeks: finance.bookedWeeks,
        occupancyRate: finance.occupancyRate,
      },
      estimatedLines: estimated.length,
      multiWeekLines: multiWeek.map(l => ({
        contactName: l.contactName, checkIn: l.checkIn, checkOut: l.checkOut, amount: l.amount, weekCount: l.weekCount,
      })),
      aiReconcile: aiPreview,
      blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/persist-db', async (req, res) => {
  if (!verifyAdminToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    const result = await persistDbDetailed();
    res.json({
      ok: result.ok,
      blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      vercel: process.env.VERCEL === '1',
      size: result.size,
      reason: result.reason,
      error: result.error,
      message: result.ok ? 'Base persistée sur Blob' : (result.error || result.reason || 'Échec persistance'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/reconcile-ai', async (req, res) => {
  if (!verifyAdminToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  if (!isDeepSeekConfigured()) {
    return res.status(503).json({ error: 'DEEPSEEK_API_KEY non configuré sur le serveur' });
  }
  try {
    const dryRun = req.body?.dryRun !== false && req.query.dryRun !== '0';
    const report = await reconcileBookingsWithAi(db, {
      limit: parseInt(req.body?.limit || req.query.limit || '20', 10),
      dryRun,
    });
    if (!dryRun && process.env.VERCEL === '1') await persistDb();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/doubts', async (req, res) => {
  if (!verifyAdminToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    const season = req.query.season || '2026-2027';
    res.json(await getDataDoubts(db, season));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/audit', async (req, res) => {
  if (!verifyAdminToken(adminTokenFromReq(req))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    if (process.env.VERCEL === '1') {
      db = await reloadDbFromBlob();
    }
    const limit = parseInt(req.query.limit || '100', 10);
    const source = req.query.source;
    const pendingOnly = req.query.pending === '1';
    const entries = listAuditLog(db, { limit, source, pendingOnly });
    res.json({ entries, pendingCount: countPendingProposals(db) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/audit/resolve', async (req, res) => {
  if (!verifyAdminToken(adminTokenFromReq(req))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    const decisions = req.body?.decisions;
    if (!Array.isArray(decisions) || decisions.length === 0) {
      return res.status(400).json({ error: 'decisions[] requis' });
    }
    const results = resolveSyncProposals(db, decisions, adminActorFromReq(req));
    if (process.env.VERCEL === '1') await persistDb().catch(() => {});
    res.json({ ok: true, results, pendingCount: countPendingProposals(db) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/login', (req, res) => {
  if (!isAdminConfigured()) {
    return res.status(503).json({ error: 'ADMIN_PASSWORD non configuré sur le serveur' });
  }
  const { password, actor = 'gilles' } = req.body || {};
  if (!checkAdminPassword(password)) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  const safeActor = actor === 'claire' ? 'claire' : 'gilles';
  res.json({ token: createAdminToken(safeActor), expiresIn: '7d', actor: safeActor });
});

app.get('/api/admin/status', (req, res) => {
  const token = adminTokenFromReq(req);
  const decoded = decodeAdminToken(token);
  res.json({
    authenticated: Boolean(decoded),
    adminConfigured: isAdminConfigured(),
    actor: decoded?.actor || null,
  });
});

// ─── CRON / REFRESH ───────────────────────────────

function verifyCronAuth(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.VERCEL !== '1';
  const header = req.headers.authorization || '';
  const bearer = header.replace(/^Bearer\s+/i, '');
  const query = req.query?.secret;
  return bearer === secret || query === secret;
}

app.get('/api/cron/refresh', async (req, res) => {
  if (!verifyCronAuth(req)) {
    return res.status(401).json({ error: 'CRON_SECRET requis' });
  }
  try {
    // Vercel Hobby hard-caps at 60s — default to a lean sync so daily cron does not time out.
    // Full/AI passes remain available via query flags or admin POST.
    const report = await runRefreshOnce({
      skipImap: req.query?.skipImap === '1',
      fullSync: req.query?.fullSync === '1',
      skipAi: req.query?.skipAi === '1' || req.query?.fullSync !== '1',
      quick: req.query?.quick === '1' || req.query?.fullSync !== '1',
      maxMessagesPerMailbox: req.query?.maxMessagesPerMailbox
        ? Number(req.query.maxMessagesPerMailbox)
        : (req.query?.fullSync === '1' ? undefined : 40),
    }, {
      actor: 'automatic',
      payload: {
        source: 'cron',
      }
    });
    res.json(report);
  } catch (err) {
    console.error('Cron refresh:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cron/refresh', async (req, res) => {
  if (!verifyCronAuth(req) && !verifyAdminToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'CRON_SECRET ou admin requis' });
  }
  try {
    const actor = verifyAdminToken(adminTokenFromReq(req)) ? adminActorFromReq(req) : 'automatic';
    const report = await runRefreshOnce({
      skipImap: req.body?.skipImap === true,
      fullSync: req.body?.fullSync === true,
      skipAi: req.body?.skipAi === true,
      quick: req.body?.quick === true,
      maxMessagesPerMailbox: Number.isFinite(req.body?.maxMessagesPerMailbox) ? Number(req.body.maxMessagesPerMailbox) : undefined,
    }, {
      actor: actor === 'automatic' ? 'automatic' : actor,
    });
    res.json(report);
  } catch (err) {
    console.error('Refresh:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── CALENDAR & SIGNALS ───────────────────────────

let lastCalendarRefreshAt = 0;

app.get('/api/calendar', async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    if (force) {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!verifyCronAuth(req) && !verifyAdminToken(token)) {
        return res.status(401).json({ error: 'refresh=1 requiert auth admin ou CRON_SECRET' });
      }
      refreshBookingStatuses(db, { sinceDays: 120, limit: 800 });
      lastCalendarRefreshAt = Date.now();
      if (process.env.VERCEL === '1') {
        await persistDb().catch(err => console.error('calendar persistDb:', err.message));
      }
    }
    const season = req.query.season || '2026-2027';
    res.json(getCalendarEvents(db, season));
  } catch (err) {
    console.error('GET /api/calendar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/finance', (req, res) => {
  try {
    const season = req.query.season || '2026-2027';
    res.json(getFinanceSummary(db, season));
  } catch (err) {
    console.error('GET /api/finance:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/emails/recent', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '25', 10), 50);
    const rows = db.prepare(`
      SELECT e.*, c.name AS contact_name, c.email AS contact_email
      FROM emails e
      LEFT JOIN contacts c ON c.id = e.contact_id
      WHERE (e.mailbox = 'INBOX' OR e.mailbox LIKE 'INBOX.%')
        AND e.sender NOT LIKE '%alpicois-laplagne.fr%'
      ORDER BY e.date DESC
      LIMIT ?
    `).all(limit);

    res.json(rows.map(r => ({
      ...toCamel(r),
      id: String(r.id),
      folder: r.mailbox,
      isFromGuest: true,
      threadId: r.message_id,
      contactId: r.contact_id,
      contactName: r.contact_name
        ? displayNameFromContact({ name: r.contact_name, email: r.contact_email })
        : (r.sender_name || r.sender || ''),
    })));
  } catch (err) {
    console.error('GET /api/emails/recent:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/signals/recent', (req, res) => {
  try {
    const sinceDays = parseInt(req.query.days || '45', 10);
    const limit = parseInt(req.query.limit || '15', 10);
    const since = new Date();
    since.setDate(since.getDate() - sinceDays);

    const emails = db.prepare(`
      SELECT e.id, e.subject, e.body_text, e.date, e.mailbox, e.contact_id, c.name AS contact_name, c.email AS contact_email
      FROM emails e
      JOIN contacts c ON c.id = e.contact_id
      WHERE e.contact_id IS NOT NULL AND e.date >= ?
      ORDER BY e.date DESC
      LIMIT 300
    `).all(since.toISOString());

    const seen = new Set();
    const signals = [];

    for (const email of emails) {
      if (seen.has(email.contact_id)) continue;
      const signal = detectSignalFromEmail(email.subject, email.body_text, email.mailbox);
      if (!signal) continue;
      seen.add(email.contact_id);
      signals.push({
        contactId: email.contact_id,
        contactName: displayNameFromContact({ name: email.contact_name, email: email.contact_email }),
        contactEmail: email.contact_email,
        label: signal.label,
        type: signal.type,
        strength: signal.strength,
        confidence: signal.strength >= 90 ? 'high' : signal.strength >= 70 ? 'medium' : 'low',
        emailDate: email.date,
        subject: email.subject,
      });
      if (signals.length >= limit) break;
    }

    res.json({ sinceDays, signals });
  } catch (err) {
    console.error('GET /api/signals/recent:', err.message);
    res.status(500).json({ error: err.message });
  }
});

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

function formatContactResponse(contact) {
  if (!contact) return contact;
  return { ...contact, displayName: displayNameFromContact(contact) };
}

function nullableInt(val) {
  return val === null || val === undefined ? null : Number(val);
}

// ─── GET /api/stats ───────────────────────────────

app.get('/api/stats', (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Base de données indisponible' });
    const totalContacts = db.prepare('SELECT COUNT(*) as c FROM contacts').get().c;
    const totalEmails = db.prepare('SELECT COUNT(*) as c FROM emails WHERE contact_id IS NOT NULL').get().c;
    const monthStart = new Date().toISOString().slice(0, 7) + '-01';
    const emailsThisMonth = db.prepare(
      "SELECT COUNT(*) as c FROM emails WHERE mailbox = 'INBOX' AND date >= ?"
    ).get(monthStart).c;
    const recentContacts = db.prepare(
      "SELECT COUNT(*) as c FROM contacts WHERE last_contact_date >= ?"
    ).get(monthStart).c;

    res.json({
      totalContacts,
      totalEmails,
      emailsThisMonth,
      recentContacts,
    });
  } catch (err) {
    console.error('GET /api/stats:', err.message);
    res.status(500).json({ error: 'Erreur stats', details: err.message });
  }
});

// ─── GET /api/chalet ──────────────────────────────

app.get('/api/chalet', (_req, res) => {
  res.json({
    name: "Chalet L'Alpicois",
    location: 'La Plagne · Plagne Centre · 2050 m',
    website: 'https://alpicois-laplagne.fr',
    email: 'contact@alpicois-laplagne.fr',
    capacity: 10,
    surfaceM2: 130,
    bedrooms: 4,
    distancePistes: '200 m',
    distanceCentre: '500 m',
    domain: 'Paradiski',
    rentalFormula: {
      checkInDay: 'dimanche',
      checkOutDay: 'dimanche',
      cleaningIncluded: true,
      note: 'Locations du dimanche au dimanche — ménage de fin de séjour inclus (hiver 2026-2027).',
    },
    amenities: [
      'Salon avec cheminée', '4 chambres avec salle d\'eau', 'Local ski + sèche-chaussures',
      'Wifi · 4G', 'Parking', 'Lave-linge', 'Agence partenaire',
    ],
    seasons: [
      {
        season: '2025-2026',
        label: 'Hiver 2025-2026',
        highSeason: { min: 3000, typical: 3800, note: 'Noël · Nouvel An · Février' },
        midSeason: { min: 2200, typical: 2800, note: 'Mars · Avril · Été' },
        lowSeason: { min: 1600, typical: 2200, note: 'Janvier' },
      },
      {
        season: '2026-2027',
        label: 'Hiver 2026-2027',
        highSeason: { min: 3200, typical: 4000, note: 'Noël · Nouvel An · Février' },
        midSeason: { min: 2400, typical: 3000, note: 'Mars · Avril · Été' },
        lowSeason: { min: 1800, typical: 2400, note: 'Janvier' },
      },
    ],
  });
});

// ─── GET /api/emails ──────────────────────────────

app.get('/api/emails', (req, res) => {
  try {
    const { contactId, threadId } = req.query;
    let rows;
    if (contactId) {
      rows = db.prepare('SELECT * FROM emails WHERE contact_id = ? ORDER BY date ASC').all(contactId);
    } else if (threadId) {
      rows = db.prepare('SELECT * FROM emails WHERE message_id = ? OR subject LIKE ? ORDER BY date ASC').all(threadId, `%${threadId}%`);
    } else {
      rows = db.prepare('SELECT * FROM emails ORDER BY date DESC').all();
    }
    res.json(rows.map(r => ({
      ...toCamel(r),
      id: String(r.id),
      folder: r.mailbox,
      isFromGuest: !r.sender?.includes('alpicois-laplagne.fr'),
      threadId: r.message_id,
      contactId: r.contact_id,
    })));
  } catch (err) {
    console.error('GET /api/emails:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/contacts ────────────────────────────

app.get('/api/contacts', (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Base de données indisponible' });
    const lite = req.query.lite !== '0';

    const contactRows = db.prepare(`
      WITH email_stats AS (
        SELECT contact_id, COUNT(*) AS message_count, MAX(date) AS last_date
        FROM emails
        WHERE contact_id IS NOT NULL
        GROUP BY contact_id
      ),
      last_emails AS (
        SELECT e.contact_id, e.subject AS last_subject
        FROM emails e
        INNER JOIN email_stats es ON es.contact_id = e.contact_id AND e.date = es.last_date
        GROUP BY e.contact_id
      ),
      week_counts AS (
        SELECT contact_id, COUNT(*) AS requested_week_count
        FROM requested_weeks
        GROUP BY contact_id
      )
      SELECT c.*,
        COALESCE(es.message_count, 0) AS message_count,
        le.last_subject,
        COALESCE(wc.requested_week_count, 0) AS requested_week_count
      FROM contacts c
      LEFT JOIN email_stats es ON es.contact_id = c.id
      LEFT JOIN last_emails le ON le.contact_id = c.id
      LEFT JOIN week_counts wc ON wc.contact_id = c.id
      ORDER BY c.last_contact_date DESC
    `).all();

    const weekStmt = db.prepare(
      'SELECT * FROM requested_weeks WHERE contact_id = ? ORDER BY check_in DESC LIMIT 6',
    );
    const stayStmt = db.prepare(
      'SELECT * FROM stays WHERE contact_id = ? ORDER BY check_in DESC LIMIT 6',
    );

    const contacts = contactRows.map(c => {
      const camel = toCamel(c);
      try { camel.alternatePhones = JSON.parse(c.alternate_phones || '[]'); } catch { camel.alternatePhones = []; }
      try { camel.alternateEmails = JSON.parse(c.alternate_emails || '[]'); } catch { camel.alternateEmails = []; }
      camel.stays = lite ? stayStmt.all(c.id).map(toCamel) : [];
      camel.totalStays = 0;
      camel.messageCount = c.message_count || 0;
      camel.lastSubject = c.last_subject || '';
      camel.requestedWeekCount = c.requested_week_count || 0;
      if (lite) {
        camel.requestedWeeks = weekStmt.all(c.id).map(toCamel);
        camel.profileJson = {};
      } else {
        camel.requestedWeeks = weekStmt.all(c.id).map(toCamel);
        camel.stays = stayStmt.all(c.id).map(toCamel);
        try { camel.profileJson = JSON.parse(c.profile_json || '{}'); } catch { camel.profileJson = {}; }
      }
      camel.enrichedAt = c.enriched_at || '';
      return formatContactResponse(camel);
    });

    if (lite) {
      res.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    }
    res.json(contacts);
  } catch (err) {
    console.error('GET /api/contacts:', err.message);
    res.status(500).json({ error: 'Erreur contacts', details: err.message });
  }
});

// ─── GET /api/contacts/:id ────────────────────────

app.get('/api/contacts/:id', async (req, res) => {
  try {
    await ensureFreshDb();
    const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Contact not found' });

    const contact = contactFromRow(row);
    contact.stays = db.prepare('SELECT * FROM stays WHERE contact_id = ? ORDER BY check_in DESC').all(req.params.id).map(toCamel);
    contact.requestedWeeks = db.prepare('SELECT * FROM requested_weeks WHERE contact_id = ? ORDER BY check_in DESC').all(req.params.id).map(toCamel);
    contact.stayProgress = listStayProgressForContact(db, req.params.id);
    contact.totalStays = db.prepare("SELECT COUNT(*) as c FROM stays WHERE contact_id = ? AND status IN ('confirmed','paid')").get(req.params.id).c;
    contact.messageCount = db.prepare('SELECT COUNT(*) as c FROM emails WHERE contact_id = ?').get(req.params.id).c;

    res.set('Cache-Control', 'no-store');
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/contacts/:id/emails ─────────────────

app.get('/api/contacts/:id/emails', (req, res) => {
  const rows = db.prepare('SELECT * FROM emails WHERE contact_id = ? ORDER BY date ASC').all(req.params.id);
  res.json(rows.map(r => ({
    ...toCamel(r),
    id: String(r.id),
    folder: r.mailbox,
    isFromGuest: !r.sender?.includes('alpicois-laplagne.fr'),
    threadId: r.message_id,
    contactId: r.contact_id,
  })));
});

app.put('/api/contacts/:id/stay-progress', async (req, res) => {
  if (!verifyAdminToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    const { checkIn, checkOut, patch = {} } = req.body || {};
    if (!checkIn || !checkOut) return res.status(400).json({ error: 'checkIn/checkOut requis' });
    const row = db.prepare('SELECT id FROM contacts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Contact introuvable' });
    const progress = upsertStayProgress(db, req.params.id, checkIn, checkOut, patch);
    await recordAudit(req, {
      action: 'stay_progress_updated',
      entityType: 'stay_progress',
      entityId: `${req.params.id}:${checkIn}`,
      contactId: req.params.id,
      payload: { checkIn, checkOut, patch },
    });
    res.json({ ok: true, progress });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/contacts ────────────────────────────

app.post('/api/contacts', (req, res) => {
  if (!verifyAdminToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const now = new Date().toISOString();
  const b = req.body;
  if (isInternalEmail(b.email || '')) {
    return res.status(400).json({
      error: 'Adresse interne — utilisez le profil « Barbier et amis » pour les semaines personnelles.',
    });
  }
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

app.post('/api/contacts/:id/merge', (req, res) => {
  if (!verifyAdminToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    const sourceId = req.params.id;
    const targetId = req.body?.targetId;
    if (!targetId) {
      return res.status(400).json({ error: 'targetId requis (profil à conserver)' });
    }
    const result = mergeContacts(db, targetId, sourceId);
    if (!result.ok) return res.status(400).json({ error: result.error });
    if (process.env.VERCEL === '1') persistDb().catch(() => {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contacts/:id/extract-profile', (req, res) => {
  if (!verifyAdminToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    const result = applyExtractedProfile(db, req.params.id);
    if (!result.ok) return res.status(400).json({ error: result.error });
    if (process.env.VERCEL === '1') persistDb().catch(() => {});
    const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
    const camel = toCamel(row);
    try { camel.alternateEmails = JSON.parse(row.alternate_emails || '[]'); } catch { camel.alternateEmails = []; }
    try { camel.alternatePhones = JSON.parse(row.alternate_phones || '[]'); } catch { camel.alternatePhones = []; }
    try { camel.profileJson = JSON.parse(row.profile_json || '{}'); } catch { camel.profileJson = {}; }
    res.json({ ...result, contact: formatContactResponse(camel) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/contacts/:id ─────────────────────────

app.put('/api/contacts/:id', async (req, res) => {
  try {
    await ensureFreshDb();
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
      firstContactDate: 'first_contact_date', first_contact_date: 'first_contact_date',
    };

    const updates = [];
    const vals = [];
    const changedFields = [];

    for (const [bodyKey, dbCol] of Object.entries(fieldMap)) {
      if (req.body[bodyKey] !== undefined) {
        updates.push(`${dbCol} = ?`);
        vals.push(req.body[bodyKey]);
        changedFields.push(bodyKey);
      }
    }

    if (req.body.alternatePhones !== undefined) {
      updates.push('alternate_phones = ?');
      vals.push(JSON.stringify(req.body.alternatePhones));
      changedFields.push('alternatePhones');
    }

    if (req.body.alternateEmails !== undefined) {
      updates.push('alternate_emails = ?');
      vals.push(JSON.stringify(req.body.alternateEmails));
      changedFields.push('alternateEmails');
    }

    if (updates.length === 0) {
      return res.json({ success: true, contact: contactFromRow(existing) });
    }

    updates.push("updated_at = datetime('now')");
    vals.push(id);
    db.prepare(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`).run(...vals);

    await requirePersistDb();

    try {
      await recordAudit(req, {
        action: 'contact_updated',
        entityType: 'contact',
        entityId: id,
        contactId: id,
        payload: {
          fields: changedFields,
          name: req.body.name ?? existing.name,
          email: req.body.email ?? existing.email,
          alternateEmails: req.body.alternateEmails,
        },
      });
    } catch (auditErr) {
      console.error('contact audit:', auditErr.message);
    }

    const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    res.json({ success: true, contact: contactFromRow(row), persisted: true });
  } catch (err) {
    console.error('PUT /api/contacts/:id', err);
    res.status(500).json({ error: err.message || 'Erreur enregistrement contact' });
  }
});

// ─── INQUIRY / DISPONIBILITÉ ─────────────────────

function getInquiriesForContact(contactId, { persistExtract = false } = {}) {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
  if (!contact) return null;

  const emails = db.prepare('SELECT * FROM emails WHERE contact_id = ? ORDER BY date DESC').all(contactId);
  const extracted = extractInquiryFromEmails(emails);

  let weeks = db.prepare(
    'SELECT * FROM requested_weeks WHERE contact_id = ? ORDER BY check_in DESC',
  ).all(contactId).map(toCamel);

  if (extracted && persistExtract) {
    const exists = weeks.some(w => w.checkIn === extracted.checkIn && w.checkOut === extracted.checkOut);
    if (!exists) {
      const rwId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      db.prepare(`
        INSERT INTO requested_weeks (id, contact_id, season, check_in, check_out, adults, children, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'asked', ?)
      `).run(
        rwId,
        contactId,
        computeSeason(extracted.checkIn),
        extracted.checkIn,
        extracted.checkOut,
        extracted.adults || 0,
        extracted.children || 0,
        extracted.notes || 'Extrait automatiquement des emails',
      );
      weeks = db.prepare(
        'SELECT * FROM requested_weeks WHERE contact_id = ? ORDER BY check_in DESC',
      ).all(contactId).map(toCamel);
    }
  }

  if (extracted && !weeks.some(w => w.checkIn === extracted.checkIn && w.checkOut === extracted.checkOut)) {
    weeks = [{
      id: 'extracted-preview',
      contactId,
      season: computeSeason(extracted.checkIn),
      checkIn: extracted.checkIn,
      checkOut: extracted.checkOut,
      adults: extracted.adults || 0,
      children: extracted.children || 0,
      status: 'asked',
      notes: extracted.notes || '',
      extractedFromEmail: true,
    }, ...weeks];
  }

  const enriched = weeks.map(w => {
    const extra = enrichWeekWithAvailability(db, w, w.season);
    return {
      ...w,
      availability: extra.availability,
      availabilityLabel: extra.availabilityLabel,
      suggestedPrice: extra.suggestedPrice,
      alternatives: extra.alternatives,
      extractedFromEmail: w.extractedFromEmail
        || (extracted && extracted.checkIn === w.checkIn && extracted.checkOut === w.checkOut),
    };
  });

  return { synced: persistExtract && !!extracted, extracted, weeks: enriched };
}

app.get('/api/contacts/:id/inquiries', (req, res) => {
  try {
    const result = getInquiriesForContact(req.params.id, { persistExtract: false });
    if (!result) return res.status(404).json({ error: 'Contact introuvable' });
    res.json(result);
  } catch (err) {
    console.error('Inquiries read error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contacts/:id/sync-inquiry', (req, res) => {
  try {
    const result = getInquiriesForContact(req.params.id, { persistExtract: true });
    if (!result) return res.status(404).json({ error: 'Contact introuvable' });
    res.json(result);
  } catch (err) {
    console.error('Sync inquiry error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contacts/:id/inquiry-draft', async (req, res) => {
  try {
    const contactId = req.params.id;
    const {
      type,
      checkIn,
      checkOut,
      price,
      adults,
      alternativeWeeks = [],
    } = req.body || {};

    if (!['available', 'alternative'].includes(type)) {
      return res.status(400).json({ error: 'type invalide (available | alternative)' });
    }
    if (!checkIn || !checkOut) {
      return res.status(400).json({ error: 'checkIn et checkOut requis' });
    }

    const contact = loadContactForDocs(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

    const season = computeSeason(checkIn);
    const resolvedPrice = price || estimateWeeklyPrice(checkIn, season);

    const payload = buildInquiryDraftPayload(db, contactId, contact, {
      type,
      checkIn,
      checkOut,
      price: resolvedPrice,
      adults,
      alternativeWeeks,
      lang: req.body?.lang,
    });

    const draft = await saveDraftToMailbox({
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      inReplyTo: payload.inReplyTo,
      references: payload.references,
    });

    if (type === 'available') {
      db.prepare(`
        UPDATE requested_weeks SET status = 'negotiating'
        WHERE contact_id = ? AND check_in = ? AND check_out = ?
      `).run(contactId, checkIn, checkOut);
    }

    res.json({ ok: true, ...draft, price: resolvedPrice });
  } catch (err) {
    console.error('Inquiry draft error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contacts/:id/inquiry-preview', (req, res) => {
  try {
    const contactId = req.params.id;
    const { type, checkIn, checkOut, price, adults, alternativeWeeks = [], lang } = req.body || {};
    if (!['available', 'alternative'].includes(type)) {
      return res.status(400).json({ error: 'type invalide (available | alternative)' });
    }
    const contact = loadContactForDocs(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

    const emails = db.prepare('SELECT body_text FROM emails WHERE contact_id = ? ORDER BY date DESC LIMIT 8').all(contactId);
    const corpus = emails.map(e => cleanStoredBodyText(e.body_text || '')).join('\n');
    const season = computeSeason(checkIn);
    const resolvedPrice = price || estimateWeeklyPrice(checkIn, season);

    const preview = buildInquiryPreview(contact, {
      type,
      checkIn,
      checkOut,
      price: resolvedPrice,
      adults,
      alternativeWeeks,
      lang,
    }, corpus);

    res.json({ ok: true, price: resolvedPrice, ...preview });
  } catch (err) {
    console.error('Inquiry preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/requested-weeks/:id', async (req, res) => {
  if (!verifyAdminToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    const { status, notes, price } = req.body || {};
    let result;
    let wroteViaRecordAudit = false;
    if (status === 'abandoned' || status === 'cancelled') {
      result = removeCalendarBooking(db, { weekId: req.params.id }, auditCtxFromReq(req));
    } else if (status === 'booked') {
      result = confirmRequestedWeek(db, req.params.id, { price, notes });
      if (result.ok) {
        await recordAudit(req, {
          action: 'week_confirmed',
          entityType: 'week',
          entityId: req.params.id,
          contactId: result.contactId || '',
          payload: { status, price: result.price, checkIn: result.checkIn, checkOut: result.checkOut },
        });
        wroteViaRecordAudit = true;
      }
    } else if (status) {
      result = updateRequestedWeekStatus(db, req.params.id, status, notes);
      if (result.ok) {
        await recordAudit(req, {
          action: 'week_status_updated',
          entityType: 'week',
          entityId: req.params.id,
          payload: { status, notes },
        });
        wroteViaRecordAudit = true;
      }
    } else if (price != null) {
      result = updateCalendarEvent(db, { weekId: req.params.id, price, notes }, auditCtxFromReq(req));
    } else {
      return res.status(400).json({ error: 'status ou price requis' });
    }
    if (!result.ok) return res.status(404).json({ error: result.error });
    if (!wroteViaRecordAudit) await persistAfterWrite();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/requested-weeks/:id', async (req, res) => {
  if (!verifyAdminToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    const result = removeCalendarBooking(db, { weekId: req.params.id }, auditCtxFromReq(req));
    if (!result.ok) return res.status(404).json({ error: result.error });
    await persistAfterWrite();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/calendar/events', async (req, res) => {
  if (!verifyAdminToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    const { eventId, status, price, notes, checkIn, checkOut } = req.body || {};
    if (!eventId) return res.status(400).json({ error: 'eventId requis' });
    const weekId = parseWeekEventId(eventId);
    const stayId = parseStayEventId(eventId);
    const result = updateCalendarEvent(db, { weekId, stayId, status, price, notes, checkIn, checkOut }, auditCtxFromReq(req));
    if (!result.ok) return res.status(400).json({ error: result.error });
    await persistAfterWrite();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/calendar/events/:eventId', async (req, res) => {
  if (!verifyAdminToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    const { eventId } = req.params;
    const weekId = parseWeekEventId(eventId);
    const stayId = parseStayEventId(eventId);
    const result = removeCalendarBooking(db, { weekId, stayId }, auditCtxFromReq(req));
    if (!result.ok) return res.status(404).json({ error: result.error });
    await persistAfterWrite();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/requested-weeks', (req, res) => {
  if (!verifyAdminToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    ensurePersonalContact(db);
    const { contactId, checkIn, checkOut, adults, children, status, notes, price } = req.body || {};
    if (!contactId || !checkIn || !checkOut) {
      return res.status(400).json({ error: 'contactId, checkIn, checkOut requis' });
    }
    const result = assignWeekToContact(db, { contactId, checkIn, checkOut, adults, children, status, notes, price });
    if (!result.ok) return res.status(400).json({ error: result.error });
    if (process.env.VERCEL === '1') persistDb().catch(() => {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/stays ───────────────────────────────

app.post('/api/stays', (req, res) => {
  if (!verifyAdminToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
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
  if (process.env.VERCEL === '1') persistDb().catch(() => {});
  res.json(camel);
});

// ─── PUT /api/stays/:id ────────────────────────────

app.put('/api/stays/:id', (req, res) => {
  if (!verifyAdminToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
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

  if (process.env.VERCEL === '1') persistDb().catch(() => {});
  res.json({ success: true });
});

// ─── DELETE /api/stays/:id ─────────────────────────

app.delete('/api/stays/:id', (req, res) => {
  if (!verifyAdminToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  db.prepare('DELETE FROM stays WHERE id = ?').run(req.params.id);
  if (process.env.VERCEL === '1') persistDb().catch(() => {});
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
    topClients: topClients.map(r => formatContactResponse({
      ...toCamel(r),
      lastStay: r.last_stay,
    })),
  });
});

// ─── MAIL TEMPLATES & SUIVI ─────────────────────

app.get('/api/mail/templates', (req, res) => {
  try {
    res.json({ templates: listMailTemplates(db) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/mail/templates/:key', async (req, res) => {
  if (!verifyAdminToken(adminTokenFromReq(req))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    const { lang, subject, body } = req.body || {};
    if (!lang || !subject || !body) return res.status(400).json({ error: 'lang, subject, body requis' });
    saveMailTemplateOverride(db, {
      templateKey: req.params.key,
      lang,
      subject,
      body,
      actor: adminActorFromReq(req),
    });
    await recordAudit(req, {
      action: 'mail_template_updated',
      entityType: 'mail_template',
      entityId: `${req.params.key}:${lang}`,
      payload: { subject, templateKey: req.params.key, lang },
    });
    res.json({ ok: true, templates: listMailTemplates(db) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mail/templates/:key/reset', async (req, res) => {
  if (!verifyAdminToken(adminTokenFromReq(req))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    const { lang } = req.body || {};
    if (!lang) return res.status(400).json({ error: 'lang requis' });
    resetMailTemplateOverride(db, req.params.key, lang);
    await recordAudit(req, {
      action: 'mail_template_reset',
      entityType: 'mail_template',
      entityId: `${req.params.key}:${lang}`,
      payload: { templateKey: req.params.key, lang },
    });
    res.json({ ok: true, templates: listMailTemplates(db) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mail/tracking/:contactId', (req, res) => {
  try {
    res.json({ tracking: getContactMailTracking(db, req.params.contactId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/mail/tracking/:contactId/:templateKey', async (req, res) => {
  if (!verifyAdminToken(adminTokenFromReq(req))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    const { status, lang, notes } = req.body || {};
    upsertContactMailTracking(db, {
      contactId: req.params.contactId,
      templateKey: req.params.templateKey,
      status: status || 'pending',
      lang,
      notes,
      actor: adminActorFromReq(req),
    });
    await recordAudit(req, {
      action: 'mail_tracking_updated',
      entityType: 'mail_tracking',
      entityId: `${req.params.contactId}:${req.params.templateKey}`,
      contactId: req.params.contactId,
      payload: { status, templateKey: req.params.templateKey, lang },
    });
    res.json({ ok: true, tracking: getContactMailTracking(db, req.params.contactId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mail/preview', async (req, res) => {
  if (!verifyAdminToken(adminTokenFromReq(req))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    if (process.env.VERCEL === '1') await ensureFreshDb();
    const { contactId, templateKey, lang = 'fr', attachToThread = true, replyToEmailId = null } = req.body || {};
    if (!contactId || !templateKey) return res.status(400).json({ error: 'contactId et templateKey requis' });
    const contact = loadContactForDocs(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    const rendered = renderMailTemplateForContact(db, contact, templateKey, lang);
    if (!rendered) return res.status(404).json({ error: 'Modèle introuvable' });

    const threadCandidates = listContactThreadCandidates(db, contactId, 8);
    const defaultInbox = threadCandidates.find(c => c.isInbox && c.messageId);
    const useThread = attachToThread !== false && (replyToEmailId || defaultInbox);
    const thread = useThread
      ? pickThreadReply(db, contactId, rendered.subject, replyToEmailId || defaultInbox?.id || null)
      : { subject: rendered.subject };

    res.json({
      ...rendered,
      to: contact.email || '',
      subject: thread.subject,
      body: rendered.body,
      attachToThread: Boolean(useThread && thread.inReplyTo),
      replyToEmailId: replyToEmailId || (useThread ? defaultInbox?.id || null : null),
      threadCandidates,
      from: LANDLORD.email,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mail/draft', async (req, res) => {
  if (!verifyAdminToken(adminTokenFromReq(req))) {
    return res.status(401).json({ error: 'Authentification admin requise' });
  }
  try {
    await ensureFreshDb();
    const {
      contactId,
      templateKey,
      lang = 'fr',
      subject,
      text,
      attachToThread = true,
      replyToEmailId = null,
      markSent = false,
    } = req.body || {};
    if (!contactId || !templateKey) return res.status(400).json({ error: 'contactId et templateKey requis' });
    if (!subject || !text) return res.status(400).json({ error: 'subject et text requis' });

    const contact = loadContactForDocs(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });
    const to = contact.email;
    if (!to) return res.status(400).json({ error: 'Email locataire manquant sur la fiche contact' });

    const thread = attachToThread
      ? pickThreadReply(db, contactId, subject, replyToEmailId || null)
      : { subject };

    const draft = await saveDraftToMailbox({
      to,
      subject: thread.subject,
      text,
      inReplyTo: thread.inReplyTo,
      references: thread.references,
    });

    if (markSent) {
      upsertContactMailTracking(db, {
        contactId,
        templateKey,
        status: 'sent',
        lang,
        actor: adminActorFromReq(req),
      });
    }

    await requirePersistDb();
    try {
      await recordAudit(req, {
        action: 'mail_draft_created',
        entityType: 'mail_template',
        entityId: `${contactId}:${templateKey}`,
        contactId,
        payload: { templateKey, lang, attachToThread: Boolean(thread.inReplyTo), subject: thread.subject },
      });
    } catch (auditErr) {
      console.error('mail draft audit:', auditErr.message);
    }

    res.json({
      ok: true,
      ...draft,
      text,
      attachmentName: '',
      tracking: markSent ? getContactMailTracking(db, contactId) : undefined,
    });
  } catch (err) {
    console.error('POST /api/mail/draft', err);
    res.status(500).json({ error: err.message || 'Erreur création brouillon' });
  }
});

// ─── DOCUMENTS ADMINISTRATIFS ─────────────────────

function loadContactForDocs(contactId) {
  const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
  if (!row) return null;
  const contact = toCamel(row);
  try { contact.alternatePhones = JSON.parse(row.alternate_phones || '[]'); } catch { contact.alternatePhones = []; }
  try { contact.alternateEmails = JSON.parse(row.alternate_emails || '[]'); } catch { contact.alternateEmails = []; }
  contact.stays = db.prepare('SELECT * FROM stays WHERE contact_id = ? ORDER BY check_in DESC').all(contactId).map(toCamel);
  contact.requestedWeeks = db.prepare('SELECT * FROM requested_weeks WHERE contact_id = ? ORDER BY check_in DESC').all(contactId).map(toCamel);
  contact.stayProgress = listStayProgressForContact(db, contactId);
  try { contact.profileJson = JSON.parse(row.profile_json || '{}'); } catch { contact.profileJson = {}; }
  return contact;
}

app.post('/api/documents/preview', (req, res) => {
  try {
    const { contactId, overrides = {} } = req.body || {};
    const contact = contactId ? loadContactForDocs(contactId) : {};
    const fields = previewDocumentFields(contact || {}, overrides);
    res.json({
      fields,
      contact: contact ? {
        id: contact.id,
        name: displayNameFromContact(contact),
        email: contact.email,
      } : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/documents/generate', async (req, res) => {
  try {
    const { contactId, type, overrides = {} } = req.body || {};
    if (!contactId) return res.status(400).json({ error: 'contactId requis' });
    const contact = loadContactForDocs(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

    const filename = buildDocumentFilename(type, contact, overrides);

    if (type === 'facture' || type === 'facture_acompte' || type === 'facture_solde') {
      const docOverrides = {
        ...overrides,
        invoiceKind: type === 'facture_solde' ? 'solde' : type === 'facture_acompte' ? 'acompte' : overrides.invoiceKind,
      };
      const buf = generateInvoiceDocx(contact, docOverrides);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buf);
    }

    if (type === 'contrat') {
      const buf = generateContractDocx(contact, overrides);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buf);
    }

    if (type === 'pack') {
      const buf = await generateContractPackZip(contact, overrides);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buf);
    }

    res.status(400).json({ error: 'type invalide (facture | facture_acompte | facture_solde | contrat | pack)' });
  } catch (err) {
    console.error('Document generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/documents/preview-file', async (req, res) => {
  try {
    const { contactId, type, overrides = {} } = req.body || {};
    if (!contactId) return res.status(400).json({ error: 'contactId requis' });
    if (!['facture', 'facture_acompte', 'facture_solde', 'contrat', 'pack'].includes(type)) {
      return res.status(400).json({ error: 'type invalide (facture | facture_acompte | facture_solde | contrat | pack)' });
    }

    const contact = loadContactForDocs(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

    const filename = buildDocumentFilename(type === 'pack' ? 'contrat' : type, contact, overrides);

    if (type === 'facture' || type === 'facture_acompte' || type === 'facture_solde') {
      const docOverrides = {
        ...overrides,
        invoiceKind: type === 'facture_solde' ? 'solde' : type === 'facture_acompte' ? 'acompte' : overrides.invoiceKind,
      };
      const buf = await generateInvoicePdf(contact, docOverrides);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      return res.send(buf);
    }

    if (type === 'contrat' || type === 'pack') {
      const buf = await generateContractPdf(contact, overrides);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      if (type === 'pack') {
        res.setHeader('X-Preview-Note', 'Aperçu du contrat — le pack ZIP inclut aussi les annexes CGL et FDC');
      }
      return res.send(buf);
    }
  } catch (err) {
    console.error('Document preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/documents/preview-email', async (req, res) => {
  try {
    const { contactId, type, overrides = {} } = req.body || {};
    if (!contactId) return res.status(400).json({ error: 'contactId requis' });
    if (!['facture', 'facture_acompte', 'facture_solde', 'contrat', 'pack'].includes(type)) {
      return res.status(400).json({ error: 'type invalide (facture | facture_acompte | facture_solde | contrat | pack)' });
    }

    const contact = loadContactForDocs(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

    const payload = await buildDocumentDraftPayload(contact, type, overrides);
    const thread = pickThreadReply(db, contactId, payload.subject);

    res.json({
      to: payload.to,
      subject: thread.subject,
      text: payload.text,
      attachmentName: payload.attachmentName,
      from: LANDLORD.email,
    });
  } catch (err) {
    console.error('Document email preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/documents/draft-email', async (req, res) => {
  try {
    const { contactId, type, overrides = {} } = req.body || {};
    if (!contactId) return res.status(400).json({ error: 'contactId requis' });
    if (!['facture', 'facture_acompte', 'facture_solde', 'contrat', 'pack'].includes(type)) {
      return res.status(400).json({ error: 'type invalide (facture | facture_acompte | facture_solde | contrat | pack)' });
    }

    const contact = loadContactForDocs(contactId);
    if (!contact) return res.status(404).json({ error: 'Contact introuvable' });

    const payload = await buildDocumentDraftPayload(contact, type, overrides);
    const thread = pickThreadReply(db, contactId, payload.subject);

    const draft = await saveDraftToMailbox({
      to: payload.to,
      subject: thread.subject,
      text: payload.text,
      attachments: payload.attachments,
      inReplyTo: thread.inReplyTo,
      references: thread.references,
    });

    res.json({
      ok: true,
      ...draft,
      to: payload.to,
      subject: thread.subject,
      text: payload.text,
      attachmentName: payload.attachmentName,
      from: LANDLORD.email,
    });
  } catch (err) {
    console.error('Draft email error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Erreurs non gérées → JSON (évite HTML 500 opaque côté Safari)
app.use((err, _req, res, _next) => {
  console.error('Unhandled API error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

export default app;

if (process.env.VERCEL !== '1') {
  ensureDb().then(() => {
    app.listen(PORT, () => {
      console.log(`API server running on http://localhost:${PORT}`);
    });
  }).catch(err => {
    console.error('Failed to start API:', err);
    process.exit(1);
  });
}
