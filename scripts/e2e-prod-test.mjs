/**
 * Tests E2E contre l'API prod (lecture + écritures admin réversibles).
 * Usage:
 *   ADMIN_PASSWORD=xxx node scripts/e2e-prod-test.mjs
 *   ADMIN_TOKEN=eyJ... node scripts/e2e-prod-test.mjs
 */
const BASE = process.env.API_BASE || 'https://chalet-alpicois-dash.vercel.app/api';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
let TOKEN = process.env.ADMIN_TOKEN || '';

const results = [];
let passed = 0;
let failed = 0;

function log(ok, name, detail = '') {
  results.push({ ok, name, detail });
  if (ok) { passed++; console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`); }
  else { failed++; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function req(method, path, { body, auth = false, expectStatus } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
  if (expectStatus !== undefined && res.status !== expectStatus) {
    throw new Error(`${method} ${path} → ${res.status} (attendu ${expectStatus}): ${json?.error || text.slice(0, 120)}`);
  }
  return { status: res.status, json, ok: res.ok };
}

async function login() {
  if (TOKEN) return true;
  if (!PASSWORD) return false;
  const { status, json } = await req('POST', '/admin/login', { body: { password: PASSWORD, actor: 'gilles' } });
  if (status === 200 && json?.token) {
    TOKEN = json.token;
    return true;
  }
  return false;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log(`\n🔍 E2E prod — ${BASE}\n`);

  // ── Public reads ──
  try {
    const { json } = await req('GET', '/health');
    log(json?.ok === true, 'GET /health', `apiVersion=${json?.apiVersion || '?'}`);
    log(json?.blob === true, 'Blob configuré');
  } catch (e) { log(false, 'GET /health', e.message); }

  try {
    const { json } = await req('GET', '/contacts');
    log(Array.isArray(json), 'GET /contacts', `${json?.length ?? 0} contacts`);
  } catch (e) { log(false, 'GET /contacts', e.message); }

  let contactId = 'barbier-et-amis';
  try {
    const { json } = await req('GET', `/contacts/${contactId}`);
    log(json?.id === contactId, 'GET /contacts/:id', contactId);
  } catch (e) { log(false, 'GET /contacts/:id', e.message); }

  try {
    const { json } = await req('GET', '/mail/templates');
    log(Array.isArray(json?.templates) && json.templates.length >= 1, 'GET /mail/templates', `${json?.templates?.length ?? 0} modèles`);
    if (json?.templates?.[0]?.key) contactId = contactId; // keep barbier
  } catch (e) { log(false, 'GET /mail/templates', e.message); }

  try {
    const { status } = await req('POST', '/mail/preview', {
      body: { contactId, templateKey: 'welcome', lang: 'fr' },
      expectStatus: 401,
    });
    log(status === 401, 'POST /mail/preview sans auth → 401');
  } catch (e) { log(false, 'POST /mail/preview sans auth', e.message); }

  try {
    await req('GET', '/audit?limit=5', { auth: false, expectStatus: 401 });
    log(true, 'GET /audit sans token → 401');
  } catch (e) { log(false, 'GET /audit sans token', e.message); }

  // ── Admin auth ──
  const authed = await login();
  if (!authed) {
    log(false, 'Auth admin', 'ADMIN_PASSWORD ou ADMIN_TOKEN requis pour la suite');
    printSummary();
    process.exit(1);
  }
  log(true, 'Auth admin', TOKEN.slice(0, 20) + '…');

  // ── Mail preview (prefill + thread) ──
  let templateKey = 'first_contact';
  let testContactId = contactId;
  try {
    const tpls = await req('GET', '/mail/templates');
    templateKey = tpls.json?.templates?.[0]?.key || templateKey;
    const contacts = await req('GET', '/contacts');
    const withStay = (contacts.json || []).find(c => c.id && c.id !== 'barbier-et-amis' && (c.totalStays > 0 || c.status === 'client'));
    if (withStay?.id) testContactId = withStay.id;

    const { json } = await req('POST', '/mail/preview', {
      auth: true,
      body: { contactId: testContactId, templateKey: 'deposit_reminder_j7', lang: 'fr' },
    });
    const hasDates = Boolean(json?.vars?.checkIn || json?.body?.includes('{{checkIn}}') === false);
    log(Boolean(json?.subject && json?.body), 'POST /mail/preview prefill', `${json?.vars?.checkIn || 'pas de séjour'} · ${json?.threadCandidates?.length ?? 0} msgs fil`);
    log(Array.isArray(json?.threadCandidates), 'Thread candidates dans preview');
  } catch (e) { log(false, 'POST /mail/preview prefill', e.message); }

  try {
    const prev = await req('POST', '/mail/preview', {
      auth: true,
      body: { contactId: testContactId, templateKey: 'first_contact', lang: 'fr', attachToThread: false },
    });
    if (prev.json?.subject && prev.json?.body) {
      const draft = await req('POST', '/mail/draft', {
        auth: true,
        body: {
          contactId: testContactId,
          templateKey: 'first_contact',
          lang: 'fr',
          subject: prev.json.subject,
          text: prev.json.body,
          attachToThread: false,
          markSent: false,
        },
      });
      log(draft.status === 200 && draft.json?.ok, 'POST /mail/draft', draft.json?.folder || draft.json?.error);
    }
  } catch (e) { log(false, 'POST /mail/draft', e.message); }

  // ── Contact CRUD persist ──
  const testEmail = `e2e-${Date.now()}@test.local`;
  let savedAlt = null;
  try {
    const get0 = await req('GET', `/contacts/${contactId}`, { auth: false });
    savedAlt = get0.json?.alternateEmails || [];

    const { json } = await req('PUT', `/contacts/${contactId}`, {
      auth: true,
      body: {
        alternateEmails: [testEmail],
        name: get0.json?.name,
        firstName: get0.json?.firstName,
        email: get0.json?.email,
        status: get0.json?.status,
      },
    });
    log(json?.success === true && json?.persisted === true, 'PUT /contacts/:id persist', json?.contact?.alternateEmails?.[0]);

    let ok = false;
    for (let i = 0; i < 6; i++) {
      await sleep(i === 0 ? 2000 : 1500);
      const get1 = await req('GET', `/contacts/${contactId}`);
      if (get1.json?.alternateEmails?.[0] === testEmail) { ok = true; break; }
    }
    log(ok, 'GET /contacts/:id après PUT (Blob)', ok ? testEmail : 'propagation lente ou échec');

    // restore
    await req('PUT', `/contacts/${contactId}`, {
      auth: true,
      body: {
        alternateEmails: savedAlt,
        name: get0.json?.name,
        firstName: get0.json?.firstName,
        email: get0.json?.email,
        status: get0.json?.status,
      },
    });
    log(true, 'PUT restore contact', 'alternateEmails restaurés');
  } catch (e) { log(false, 'Contact persist cycle', e.message); }

  // ── Audit ──
  try {
    const { json } = await req('GET', '/audit?limit=10&source=gilles', { auth: true });
    log(Array.isArray(json?.entries), 'GET /audit gilles', `${json?.entries?.length ?? 0} entrées`);
    const hasContact = json?.entries?.some(e => e.action === 'contact_updated');
    log(hasContact, 'Audit contact_updated présent');
  } catch (e) { log(false, 'GET /audit', e.message); }

  // ── Mail template edit + audit ──
  try {
    const tpls = await req('GET', '/mail/templates');
    const key = tpls.json?.templates?.[0]?.key;
    if (!key) throw new Error('aucun template');
    const orig = tpls.json.templates[0];
    const marker = ` [e2e-${Date.now()}]`;
    await req('PUT', `/mail/templates/${encodeURIComponent(key)}`, {
      auth: true,
      body: { lang: 'fr', subject: orig.fr.subject + marker, body: orig.fr.body },
    });
    await sleep(4000);
    const audit = await req('GET', '/audit?limit=20&source=gilles', { auth: true });
    const hasTpl = audit.json?.entries?.some(e => e.action === 'mail_template_updated' && (e.payload?.templateKey === key || e.entityId?.startsWith(key)));
    log(hasTpl, 'PUT mail template + audit', key);
    await req('POST', `/mail/templates/${encodeURIComponent(key)}/reset`, { auth: true, body: { lang: 'fr' } });
    log(true, 'Reset mail template', key);
  } catch (e) { log(false, 'Mail template cycle', e.message); }

  // ── Documents preview ──
  try {
    const { json } = await req('POST', '/documents/preview', {
      body: { contactId, overrides: {} },
    });
    log(Boolean(json?.fields), 'POST /documents/preview', Object.keys(json?.fields || {}).length + ' champs');
  } catch (e) { log(false, 'POST /documents/preview', e.message); }

  try {
    const { status, json } = await req('POST', '/documents/preview-file', {
      auth: true,
      body: { contactId, type: 'facture', overrides: { tenantName: 'Test E2E' } },
    });
    log(status === 200 || status === 400, 'POST /documents/preview-file', json?.error || 'ok');
  } catch (e) { log(false, 'POST /documents/preview-file', e.message); }

  // ── Finance / calendar ──
  try {
    const { json } = await req('GET', '/finance?season=2026-2027');
    log(json?.season != null, 'GET /finance', json?.season);
  } catch (e) { log(false, 'GET /finance', e.message); }

  try {
    const { json } = await req('GET', '/calendar');
    log(Array.isArray(json?.events), 'GET /calendar', `${json?.events?.length ?? 0} events`);
  } catch (e) { log(false, 'GET /calendar', e.message); }

  // ── Blob persist ──
  try {
    const { json } = await req('POST', '/admin/persist-db', { auth: true });
    log(json?.ok === true, 'POST /admin/persist-db', json?.size ? `${(json.size / 1024 / 1024).toFixed(1)} Mo` : '');
  } catch (e) { log(false, 'POST /admin/persist-db', e.message); }

  printSummary();
  process.exit(failed > 0 ? 1 : 0);
}

function printSummary() {
  console.log(`\n── Résultat: ${passed} OK, ${failed} échec(s) ──\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
