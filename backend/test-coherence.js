/**
 * Tests de cohérence end-to-end (extractions, finance, cas connus).
 * Usage: node backend/test-coherence.js [--ai]
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import Database from 'better-sqlite3';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { extractInquiryBest } from './extract-inquiry.js';
import { getFinanceSummary } from './finance.js';
import { estimateStayPrice } from './availability.js';
import { isDeepSeekConfigured } from './deepseek-client.js';
import { reconcileBookingsWithAi } from './ai-booking-verify.js';
import { cleanStoredBodyText, isGarbageEmailBody } from './email-body.js';
import { getCalendarEvents } from './calendar-events.js';
import { planDedupeOverlappingBookings } from './dedupe-bookings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  const candidates = [
    join(__dirname, '..', 'emails.db'),
    join(__dirname, 'deploy', 'emails.db'),
  ];
  for (const p of candidates) {
    if (existsSync(p) && dbUsable(p)) return p;
  }
  return candidates.find(p => existsSync(p)) || candidates[1];
}

const DB_PATH = resolveDbPath();

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

test('Michaël Truijen — email 9570 → 2 semaines (3–17 jan 2027)', () => {
  const db = new Database(DB_PATH, { readonly: true });
  const row = db.prepare("SELECT body_text, date FROM emails WHERE id='9570'").get();
  const d = extractInquiryBest(row.body_text, row.date);
  assert(d?.checkIn === '2027-01-03', `checkIn ${d?.checkIn}`);
  assert(d?.checkOut === '2027-01-17', `checkOut ${d?.checkOut}`);
  assert(d?.nights === 14, `nights ${d?.nights}`);
  db.close();
});

test('Prix 2 semaines janvier 2027 = 4800 €', () => {
  const p = estimateStayPrice('2027-01-03', '2027-01-17', '2026-2027');
  assert(p === 4800, `got ${p}`);
});

test('Finance locale — Michaël 2 lignes × 2400 €', () => {
  const db = new Database(DB_PATH, { readonly: true });
  const fin = getFinanceSummary(db, '2026-2027');
  const mLines = fin.lines.filter(l => l.contactId === 'mqb2f5k8bs6z');
  assert(mLines.length === 2, `finance lines ${mLines.length}`);
  assert(mLines.reduce((s, l) => s + l.amount, 0) === 4800, `total ${mLines.reduce((s, l) => s + l.amount, 0)}`);
  db.close();
});

test('Dedupe plan — lecture seule, pas de mutation', () => {
  const db = new Database(DB_PATH, { readonly: true });
  const before = db.prepare("SELECT COUNT(*) AS c FROM stays WHERE contact_id='mqb2f5k8bs6z'").get().c;
  planDedupeOverlappingBookings(db);
  const after = db.prepare("SELECT COUNT(*) AS c FROM stays WHERE contact_id='mqb2f5k8bs6z'").get().c;
  assert(before === after, 'planDedupe ne doit pas modifier la base');
  db.close();
});

test('Email image MIME → pas affiché comme texte brut', () => {
  const raw = 'Content-Disposition: inline; name=IMG_4395.jpg;\n/9j/4AAQSkZJRgABAQAA';
  assert(isGarbageEmailBody(raw, 'P') === false, 'image not garbage');
  const cleaned = cleanStoredBodyText(raw);
  assert(!cleaned.includes('/9j/4AAQ'), 'no base64 jpeg in cleaned');
});

test('Email quoted-printable → accents lisibles', () => {
  const raw = 'Je suis d=C3=A9sol=C3=A9 pour mon retard';
  const cleaned = cleanStoredBodyText(raw);
  assert(cleaned.includes('désolé') || cleaned.includes('desole') || !cleaned.includes('\ufffd'), cleaned);
});

test('Email encodage partiel (U+FFFD) détecté en base', () => {
  const db = new Database(DB_PATH, { readonly: true });
  const row = db.prepare("SELECT body_text FROM emails WHERE id='6589'").get();
  if (!row) {
    console.warn('  ⚠ email 6589 absent');
    db.close();
    return;
  }
  const count = (row.body_text.match(/\ufffd/g) || []).length;
  assert(count >= 8, `fffd count ${count}`);
  db.close();
});

test('Email image 6591 → Photo jointe en base', () => {
  const db = new Database(DB_PATH, { readonly: true });
  const row = db.prepare("SELECT body_text FROM emails WHERE id='6591'").get();
  if (!row) {
    db.close();
    return;
  }
  assert(row.body_text.startsWith('Photo jointe'), row.body_text.slice(0, 40));
  db.close();
});

test('Email image en base → nettoyage fix-bodies', () => {
  const raw = 'Content-Disposition: inline; name=IMG_4395.jpg;\n/9j/4AAQSkZJRgABAQAA';
  const cleaned = cleanStoredBodyText(raw);
  assert(cleaned.startsWith('Photo jointe'), cleaned);
});

test('Finance — byCategoryWeeks cohérent', () => {
  const db = new Database(DB_PATH, { readonly: true });
  const f = getFinanceSummary(db, '2026-2027');
  assert(f.byCategoryWeeks?.totalClient >= f.byCategoryWeeks?.confirmed, 'weeks sum');
  db.close();
});

test('Finance Michaël — 2 lignes (1 par semaine), pas de doublon 3–10', () => {
  const db = new Database(DB_PATH, { readonly: true });
  const fin = getFinanceSummary(db, '2026-2027');
  const m = fin.lines.filter(l => l.contactId === 'mqb2f5k8bs6z');
  assert(m.length === 2, `got ${m.length} lines: ${m.map(l => `${l.checkIn}→${l.checkOut}`).join(', ')}`);
  assert(m.every(l => l.weekCount === 1 && l.label === 'Confirmé'), 'une ligne confirmée par semaine');
  assert(!m.some(l => l.checkOut === '2027-01-10' && m.some(o => o !== l && o.checkIn === '2027-01-03' && o.checkOut === '2027-01-17')), 'pas de chevauchement 1 sem + 2 sem');
  db.close();
});

test('Calendrier — séjour 3–17 jan chevauche semaine 10–17 (prod TZ)', () => {
  const db = new Database(DB_PATH, { readonly: true });
  const cal = getCalendarEvents(db, '2026-2027');
  const jan10 = cal.weeks.find(w => w.checkIn === '2027-01-10' || w.checkIn === '2027-01-09');
  assert(jan10, 'semaine autour du 10 jan introuvable');
  const m = jan10.events.filter(e => e.contactId === 'mqb2f5k8bs6z');
  assert(m.length === 1, `Michaël absent semaine ${jan10.checkIn}–${jan10.checkOut}`);
  assert(jan10.blocked, `semaine ${jan10.checkIn} doit être bloquée`);
  db.close();
});

test('Calendrier — pas de doublon Michaël par semaine', () => {
  const db = new Database(DB_PATH, { readonly: true });
  const cal = getCalendarEvents(db, '2026-2027');
  for (const w of cal.weeks) {
    const m = w.events.filter(e => e.contactId === 'mqb2f5k8bs6z');
    assert(m.length <= 1, `semaine ${w.checkIn}: ${m.length} entrées Michaël`);
  }
  const mWeeks = cal.weeks.filter(w => w.events.some(e => e.contactId === 'mqb2f5k8bs6z'));
  assert(mWeeks.length === 2, `Michaël doit occuper 2 semaines, got ${mWeeks.length} (${mWeeks.map(w => w.checkIn).join(', ')})`);
  db.close();
});

test('Pas de séjour annulé dans finance', () => {
  const db = new Database(DB_PATH, { readonly: true });
  const fin = getFinanceSummary(db, '2026-2027');
  const bad = fin.lines.filter(l => l.status === 'cancelled');
  assert(bad.length === 0, `${bad.length} cancelled in finance`);
  db.close();
});

async function run() {
  console.log('═══════════════════════════════════════');
  console.log('  Tests cohérence Alpicois');
  console.log('═══════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      await t.fn();
      console.log(`✅ ${t.name}`);
      passed++;
    } catch (e) {
      console.log(`❌ ${t.name}`);
      console.log(`   ${e.message}`);
      failed++;
    }
  }

  if (process.argv.includes('--ai') && isDeepSeekConfigured()) {
    console.log('\n── DeepSeek reconcile (dry-run) ──');
    const { ensureDb } = await import('./database.js');
    const db = await ensureDb();
    try {
      const report = await reconcileBookingsWithAi(db, { limit: 8, dryRun: true });
      console.log(`   checked: ${report.checked}, issues: ${report.issues.length}`);
      for (const i of report.issues.slice(0, 5)) {
        if (i.ai) {
          console.log(`   • ${i.contactName}: DB ${i.db.checkIn}→${i.db.checkOut} vs IA ${i.ai.checkIn}→${i.ai.checkOut} (${i.ai.confidence})`);
        }
      }
    } finally {
      db.close?.();
    }
  } else if (process.argv.includes('--ai')) {
    console.log('\n⚠ --ai ignoré : DEEPSEEK_API_KEY absent');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
