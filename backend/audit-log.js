/**
 * Journal d'audit — modifications admin (calendrier, finance, séjours, sync).
 */

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function ensureAuditTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      contact_id TEXT DEFAULT '',
      payload_json TEXT DEFAULT '{}',
      actor TEXT DEFAULT 'automatic',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  try {
    db.exec('ALTER TABLE audit_log ADD COLUMN actor TEXT DEFAULT \'automatic\'');
  } catch { /* column exists */ }
  try {
    db.exec("ALTER TABLE audit_log ADD COLUMN validation_status TEXT DEFAULT 'none'");
  } catch { /* column exists */ }
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_validation ON audit_log(validation_status)');
}

export function normalizeAuditActor(actor) {
  if (actor === 'gilles' || actor === 'claire') return actor;
  if (actor === 'automatic' || actor === 'system' || actor === 'cron' || actor === 'pipeline') return 'automatic';
  return 'automatic';
}

export function appendAudit(db, {
  action, entityType, entityId, contactId = '', payload = {}, actor = 'automatic',
  validationStatus = 'none',
}) {
  ensureAuditTable(db);
  const resolvedActor = normalizeAuditActor(actor || payload?.actor || payload?.source);
  db.prepare(`
    INSERT INTO audit_log (id, action, entity_type, entity_id, contact_id, payload_json, actor, validation_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    generateId(),
    action,
    entityType,
    entityId,
    contactId || '',
    JSON.stringify({ ...payload, actor: resolvedActor }),
    resolvedActor,
    validationStatus,
  );
}

export function listAuditLog(db, opts = {}) {
  ensureAuditTable(db);
  const limit = Math.min(500, opts.limit ?? 50);
  const source = opts.source;
  const pendingOnly = opts.pendingOnly === true;
  let sql = 'SELECT * FROM audit_log WHERE 1=1';
  const params = [];
  if (source === 'gilles' || source === 'claire' || source === 'automatic') {
    sql += ' AND actor = ?';
    params.push(source);
  }
  if (pendingOnly) {
    sql += " AND validation_status = 'pending'";
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(sql).all(...params);
  return rows.map(r => ({
    id: r.id,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    contactId: r.contact_id,
    actor: normalizeAuditActor(r.actor || JSON.parse(r.payload_json || '{}').source),
    payload: JSON.parse(r.payload_json || '{}'),
    validationStatus: r.validation_status || 'none',
    createdAt: r.created_at,
  }));
}

export function countPendingAudit(db) {
  ensureAuditTable(db);
  const row = db.prepare(`
    SELECT COUNT(*) AS n FROM audit_log WHERE validation_status = 'pending'
  `).get();
  return row?.n ?? 0;
}
