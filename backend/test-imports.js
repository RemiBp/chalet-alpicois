/**
 * Vérifie les imports manquants (ReferenceError en prod) — analyse statique.
 * Usage: node backend/test-imports.js
 */

import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND = __dirname;

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function parseImports(content) {
  const names = new Set();
  for (const m of content.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"]/g)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/)[0].trim();
      if (n) names.add(n);
    }
  }
  for (const m of content.matchAll(/import\s+(\w+)\s+from\s*['"][^'"]+['"]/g)) {
    names.add(m[1]);
  }
  return names;
}

function parseLocalDefs(content) {
  const names = new Set();
  for (const m of content.matchAll(/^function (\w+)/gm)) names.add(m[1]);
  for (const m of content.matchAll(/^const (\w+)\s*=/gm)) names.add(m[1]);
  for (const m of content.matchAll(/^async function (\w+)/gm)) names.add(m[1]);
  return names;
}

/** Symboles exportés par les modules backend (scan léger des export). */
function collectBackendExports() {
  const byModule = {};
  for (const file of readdirSync(BACKEND).filter(f => f.endsWith('.js') && !f.startsWith('test-'))) {
    const content = readFileSync(join(BACKEND, file), 'utf8');
    const exports = [...content.matchAll(/^export (?:async )?function (\w+)/gm)].map(m => m[1]);
    if (exports.length) byModule[file] = exports;
  }
  return byModule;
}

const GLOBALS = new Set([
  'console', 'JSON', 'Math', 'Date', 'parseInt', 'parseFloat', 'String', 'Number',
  'Array', 'Object', 'Promise', 'Set', 'Map', 'Buffer', 'Error', 'RegExp', 'fetch',
  'Boolean', 'encodeURIComponent', 'decodeURIComponent', 'isNaN', 'undefined', 'null',
  'Intl', 'TextDecoder', 'Uint8Array', 'atob', 'btoa', 'process', 'require',
]);

const METHODS = new Set([
  'prepare', 'all', 'get', 'run', 'map', 'filter', 'some', 'find', 'forEach', 'slice',
  'join', 'split', 'includes', 'match', 'replace', 'push', 'set', 'has', 'then', 'catch',
  'finally', 'status', 'json', 'send', 'end', 'on', 'setHeader', 'startsWith', 'endsWith',
  'trim', 'toLowerCase', 'toUpperCase', 'localeCompare', 'sort', 'reduce', 'flat', 'flatMap',
  'substring', 'substr', 'indexOf', 'keys', 'values', 'entries', 'from', 'isArray', 'parse',
  'stringify', 'now', 'max', 'min', 'round', 'floor', 'ceil', 'abs', 'test', 'exec',
  'add', 'delete', 'size', 'length', 'toISOString', 'toString', 'valueOf', 'assign',
  'create', 'defineProperty', 'freeze', 'prototype', 'call', 'apply', 'bind',
]);

test('api-server — detectSignalFromEmail importé (régression 500 /signals/recent)', () => {
  const src = readFileSync(join(BACKEND, 'api-server.js'), 'utf8');
  assert(src.includes('detectSignalFromEmail('), 'utilisé');
  assert(parseImports(src).has('detectSignalFromEmail'), 'doit être importé');
});

test('api-server — pas d\'appel à une export backend sans import', () => {
  const src = readFileSync(join(BACKEND, 'api-server.js'), 'utf8');
  const imports = parseImports(src);
  const local = parseLocalDefs(src);
  const allowed = new Set([...imports, ...local, ...GLOBALS, 'db', 'app', 'express', 'cors', 'res', 'req', 'next']);
  const exportsByModule = collectBackendExports();
  const allExports = new Set(Object.values(exportsByModule).flat());

  const missing = new Set();
  for (const exp of allExports) {
    if (!src.includes(`${exp}(`)) continue;
    if (allowed.has(exp)) continue;
    missing.add(exp);
  }
  assert(missing.size === 0, `imports manquants dans api-server.js: ${[...missing].join(', ')}`);
});

test('calendar-events — chevauchement intervalle standard (pas off-by-one)', () => {
  const src = readFileSync(join(BACKEND, 'calendar-events.js'), 'utf8');
  assert(
    src.includes('event.checkIn < week.checkOut && event.checkOut > week.checkIn'),
    'eventOverlapsWeek doit utiliser le chevauchement intervalle standard',
  );
  assert(
    !src.includes('event.checkOut > week.checkOut'),
    'ancienne logique off-by-one encore présente',
  );
});

test('calendar-events — demande courte : une seule semaine (pas doublon 2–9 jan)', async () => {
  const { eventShownInWeek } = await import('./calendar-events.js');
  const weekDec27 = { checkIn: '2026-12-27', checkOut: '2027-01-03' };
  const weekJan3 = { checkIn: '2027-01-03', checkOut: '2027-01-10' };
  const inquiry = { checkIn: '2027-01-02', checkOut: '2027-01-09', blocksCalendar: false, status: 'asked' };
  assert(eventShownInWeek(inquiry, weekDec27), 'demande visible semaine arrivée');
  assert(!eventShownInWeek(inquiry, weekJan3), 'demande absente semaine suivante');

  const confirmed = { checkIn: '2027-01-03', checkOut: '2027-01-17', blocksCalendar: true, status: 'confirmed' };
  assert(eventShownInWeek(confirmed, weekJan3), 'confirmé semaine 1');
  assert(eventShownInWeek(confirmed, { checkIn: '2027-01-10', checkOut: '2027-01-17' }), 'confirmé semaine 2');
});

test('availability — weeksSpannedByStay utilise rangesOverlap', () => {
  const src = readFileSync(join(BACKEND, 'availability.js'), 'utf8');
  assert(src.includes('rangesOverlap(checkIn, checkOut, w.checkIn, w.checkOut)'));
  assert(!src.includes('checkOut > w.checkOut'), 'ancienne logique off-by-one dans weeksSpannedByStay');
});

test('cleanEmailBody.ts — pas d\'appel récursif classifyEmailContent → cleanEmailBody', () => {
  const src = readFileSync(join(BACKEND, '..', 'src', 'lib', 'cleanEmailBody.ts'), 'utf8');
  const start = src.indexOf('export function classifyEmailContent');
  const end = src.indexOf('export function isGarbageEmailBody');
  const classifyBlock = src.slice(start, end > start ? end : start + 2000);
  assert(
    !classifyBlock.includes('cleanEmailBody('),
    'classifyEmailContent ne doit pas appeler cleanEmailBody (stack overflow)',
  );
  assert(src.includes('processEmailBodyRaw'), 'helper interne attendu');
});

async function run() {
  console.log('═══════════════════════════════════════');
  console.log('  Audit imports / régressions');
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
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

run();
