import Database from 'better-sqlite3';
import { ensureAuditTable } from './audit-log.js';
import { autoResolvePendingProposals, countPendingProposals } from './sync-proposals.js';

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE contacts (
    id TEXT PRIMARY KEY,
    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    profile_json TEXT DEFAULT '{}',
    updated_at TEXT DEFAULT ''
  );
`);
ensureAuditTable(db);

db.prepare('INSERT INTO contacts (id, phone) VALUES (?, ?)').run('new-phone', '');
db.prepare('INSERT INTO contacts (id, phone) VALUES (?, ?)').run('conflict', '');
db.prepare('INSERT INTO contacts (id, phone) VALUES (?, ?)').run('already', '06 11 22 33 44');

const insert = db.prepare(`
  INSERT INTO audit_log (
    id, action, entity_type, entity_id, contact_id, payload_json, actor, validation_status, created_at
  ) VALUES (?, 'sync_proposal', ?, ?, ?, ?, 'automatic', 'pending', ?)
`);
const add = (id, entityType, contactId, payload, createdAt) => {
  insert.run(id, entityType, id, contactId, JSON.stringify(payload), createdAt);
};

add('review', 'mail_review', 'new-phone', { field: 'mailReview', proposed: true }, '2026-01-01 00:00:06');
add('phone-new', 'contact_profile', 'new-phone', { field: 'phone', proposed: '06 99 88 77 66' }, '2026-01-01 00:00:05');
add('phone-duplicate', 'contact_profile', 'new-phone', { field: 'phone', proposed: '0699887766' }, '2026-01-01 00:00:04');
add('conflict-short', 'contact_profile', 'conflict', { field: 'phone', proposed: '30 12 55 07' }, '2026-01-01 00:00:03');
add('conflict-full', 'contact_profile', 'conflict', { field: 'phone', proposed: '06 30 12 55 07' }, '2026-01-01 00:00:02');
add('phone-already', 'contact_profile', 'already', { field: 'phone', proposed: '0611223344' }, '2026-01-01 00:00:01');

const report = autoResolvePendingProposals(db, 'gilles');
const expected = {
  total: 6,
  approved: 2,
  archivedReviews: 1,
  rejectedDuplicates: 1,
  rejectedInvalid: 0,
  alreadyApplied: 1,
  heldConflicts: 2,
  pendingCount: 2,
};

for (const [key, value] of Object.entries(expected)) {
  if (report[key] !== value) {
    throw new Error(`${key}: attendu ${value}, reçu ${report[key]}`);
  }
}
if (countPendingProposals(db) !== 2) throw new Error('Les deux conflits doivent rester en attente');
if (db.prepare('SELECT phone FROM contacts WHERE id = ?').get('new-phone')?.phone !== '06 99 88 77 66') {
  throw new Error('La proposition téléphone unique doit être appliquée');
}
if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('Intégrité SQLite invalide');

db.close();
console.log('✅ Validation automatique : revues, doublons, données existantes et conflits');
