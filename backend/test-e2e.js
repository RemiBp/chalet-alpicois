/**
 * Tests E2E HTTP contre l'API (local ou prod) — lecture seule, sans mutation.
 * Usage: node backend/test-e2e.js [baseUrl]
 */

import 'dotenv/config';

const BASE = process.argv[2] || process.env.API_BASE || 'https://chalet-alpicois-dash.vercel.app';
const MICHAEL_ID = 'mqb2f5k8bs6z';
let adminToken = '';

const checks = [];

function check(name, fn) {
  checks.push({ name, fn });
}

async function get(path, headers = {}, authenticated = true) {
  const res = await fetch(`${BASE}${path}`, {
    headers: authenticated && adminToken ? { Authorization: `Bearer ${adminToken}`, ...headers } : headers,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

async function login() {
  const password = process.env.ADMIN_TEST_PASSWORD || process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET;
  if (!password) throw new Error('ADMIN_TEST_PASSWORD ou ADMIN_PASSWORD requis pour les tests E2E privés');
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, actor: 'gilles' }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.token) throw new Error(`connexion admin E2E refusée (${res.status})`);
  adminToken = json.token;
}

check('GET /api/health → ok + config', async () => {
  const { status, json } = await get('/api/health');
  if (status !== 200) throw new Error(`status ${status}`);
  if (!json?.ok) throw new Error('health not ok');
  if (typeof json.adminConfigured !== 'boolean') throw new Error('missing adminConfigured');
  if (typeof json.blob !== 'boolean') throw new Error('missing blob');
  if (typeof json.cronConfigured !== 'boolean') throw new Error('missing cronConfigured');
  if (typeof json.imapConfigured !== 'boolean') throw new Error('missing imapConfigured');
});

check('GET /api/finance → lignes + semaines', async () => {
  const { status, json } = await get('/api/finance?season=2026-2027');
  if (status !== 200) throw new Error(`status ${status}`);
  if (!Array.isArray(json?.lines)) throw new Error('missing lines');
  if (!json?.byCategoryWeeks) throw new Error('missing byCategoryWeeks');
});

check('Finance Michaël — max 2 lignes janvier, 1 par semaine', async () => {
  const { json } = await get('/api/finance?season=2026-2027');
  const m = (json?.lines || []).filter(l => l.contactId === MICHAEL_ID);
  if (m.length === 0) return;
  if (m.length > 2) throw new Error(`${m.length} lignes Michaël (attendu ≤2)`);
  if (!m.every(l => (l.weekCount || 1) === 1)) throw new Error('weekCount doit être 1 par ligne');
  const dupRange = m.some(a => m.some(b => a !== b && a.checkIn === b.checkIn));
  if (dupRange) throw new Error('doublon même checkIn');
});

check('GET /api/contacts → liste', async () => {
  const { status, json } = await get('/api/contacts');
  if (status !== 200) throw new Error(`status ${status}`);
  if (!Array.isArray(json) || json.length < 5) throw new Error(`contacts ${json?.length}`);
});

check('GET /api/doubts sans auth → 401', async () => {
  const { status } = await get('/api/doubts?season=2026-2027', {}, false);
  if (status !== 401) throw new Error(`expected 401, got ${status}`);
});

check('GET /api/stats → chiffres', async () => {
  const { status, json } = await get('/api/stats');
  if (status !== 200) throw new Error(`status ${status}`);
  if (typeof json?.totalContacts !== 'number') throw new Error('missing totalContacts');
});

check('GET /api/calendar → semaines', async () => {
  const { status, json } = await get('/api/calendar?season=2026-2027');
  if (status !== 200) throw new Error(`status ${status}`);
  if (!Array.isArray(json?.weeks)) throw new Error('missing weeks');
});

check('Calendrier Michaël — ≤1 entrée par semaine', async () => {
  const { json } = await get('/api/calendar?season=2026-2027');
  for (const w of json?.weeks || []) {
    const m = w.events?.filter(e => e.contactId === MICHAEL_ID) || [];
    if (m.length > 1) throw new Error(`semaine ${w.checkIn}: ${m.length} Michaël`);
  }
});

check('Calendrier Michaël — 2 semaines bloquées (3–17 jan)', async () => {
  const { json } = await get('/api/calendar?season=2026-2027');
  const mWeeks = (json?.weeks || []).filter(w =>
    w.events?.some(e => e.contactId === MICHAEL_ID),
  );
  if (mWeeks.length === 0) return;
  if (mWeeks.length < 2) {
    throw new Error(`Michaël sur ${mWeeks.length} semaine(s) seulement (${mWeeks.map(w => w.checkIn).join(', ')})`);
  }
  if (!mWeeks.every(w => w.blocked)) {
    throw new Error(`semaines Michaël non bloquées: ${mWeeks.filter(w => !w.blocked).map(w => w.checkIn).join(', ')}`);
  }
});

check('GET /api/emails/recent → liste', async () => {
  const { status, json } = await get('/api/emails/recent?limit=5');
  if (status !== 200) throw new Error(`status ${status}`);
  if (!Array.isArray(json)) throw new Error('expected array');
});

check('GET /api/chalet → config', async () => {
  const { status, json } = await get('/api/chalet');
  if (status !== 200) throw new Error(`status ${status}`);
  if (!json?.name) throw new Error('missing name');
});

check('GET /api/stays → liste', async () => {
  const { status, json } = await get('/api/stays');
  if (status !== 200) throw new Error(`status ${status}`);
  if (!Array.isArray(json)) throw new Error('expected array');
});

check('GET /api/client-analysis → stats', async () => {
  const { status, json } = await get('/api/client-analysis');
  if (status !== 200) throw new Error(`status ${status}`);
  if (!Array.isArray(json?.byNationality)) throw new Error('missing byNationality');
});

check('GET /api/auto-replies → liste', async () => {
  const { status, json } = await get('/api/auto-replies');
  if (status !== 200) throw new Error(`status ${status}`);
  if (!Array.isArray(json)) throw new Error('expected array');
});

check('GET /api/auto-reply-rules → liste', async () => {
  const { status, json } = await get('/api/auto-reply-rules');
  if (status !== 200) throw new Error(`status ${status}`);
  if (!Array.isArray(json)) throw new Error('expected array');
});

check('GET /api/emails → liste', async () => {
  const { status, json } = await get('/api/emails');
  if (status !== 200) throw new Error(`status ${status}`);
  if (!Array.isArray(json)) throw new Error('expected array');
});

check('GET /api/contacts/:id → fiche', async () => {
  const { json: contacts } = await get('/api/contacts');
  const id = contacts?.[0]?.id;
  if (!id) return;
  const { status, json } = await get(`/api/contacts/${id}`);
  if (status !== 200) throw new Error(`status ${status}`);
  if (!json?.id) throw new Error('missing contact id');
});

check('GET /api/signals/recent → liste', async () => {
  const { status, json } = await get('/api/signals/recent?days=45&limit=5');
  if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
  if (!Array.isArray(json?.signals)) throw new Error('missing signals array');
});

check('GET /api/calendar?refresh=1 sans auth → 401', async () => {
  const { status } = await get('/api/calendar?season=2026-2027&refresh=1', {}, false);
  if (status !== 401) throw new Error(`expected 401, got ${status}`);
});

check('GET /api/cron/refresh sans auth → 401', async () => {
  const { status } = await get('/api/cron/refresh', {}, false);
  if (status !== 401) throw new Error(`expected 401, got ${status}`);
});

check('GET /api/coherence/report sans auth → 401', async () => {
  const { status } = await get('/api/coherence/report?season=2026-2027', {}, false);
  if (status !== 401) throw new Error(`expected 401, got ${status}`);
});

check('Finance — pas de ligne cancelled', async () => {
  const { json } = await get('/api/finance?season=2026-2027');
  const bad = (json?.lines || []).filter(l => l.status === 'cancelled');
  if (bad.length) throw new Error(`${bad.length} cancelled in finance`);
});

async function run() {
  console.log(`\nE2E API (readonly) — ${BASE}\n`);
  await login();
  let passed = 0;
  let failed = 0;
  for (const c of checks) {
    try {
      await c.fn();
      console.log(`✅ ${c.name}`);
      passed++;
    } catch (e) {
      console.log(`❌ ${c.name}`);
      console.log(`   ${e.message}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

run();
