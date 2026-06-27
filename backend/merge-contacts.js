/**
 * Fusion de deux profils contacts (même personne, emails différents).
 */

import { isInternalContact, PERSONAL_CONTACT_ID } from './host-filter.js';

/**
 * @param {import('better-sqlite3').Database} db
 */
export function mergeContacts(db, targetId, sourceId) {
  if (targetId === sourceId) {
    return { ok: false, error: 'Impossible de fusionner un contact avec lui-même' };
  }

  const target = db.prepare('SELECT * FROM contacts WHERE id = ?').get(targetId);
  const source = db.prepare('SELECT * FROM contacts WHERE id = ?').get(sourceId);
  if (!target || !source) return { ok: false, error: 'Contact introuvable' };
  if (sourceId === PERSONAL_CONTACT_ID || targetId === PERSONAL_CONTACT_ID) {
    return { ok: false, error: 'Le profil Barbier et amis ne peut pas être fusionné' };
  }
  if (isInternalContact(source) || isInternalContact(target)) {
    return { ok: false, error: 'Fusion interdite avec un profil interne' };
  }

  let altEmails = [];
  try { altEmails = JSON.parse(target.alternate_emails || '[]'); } catch { altEmails = []; }
  if (source.email && source.email !== target.email && !altEmails.includes(source.email)) {
    altEmails.push(source.email);
  }
  let sourceAlts = [];
  try { sourceAlts = JSON.parse(source.alternate_emails || '[]'); } catch { sourceAlts = []; }
  for (const e of sourceAlts) {
    if (e && e !== target.email && !altEmails.includes(e)) altEmails.push(e);
  }

  let altPhones = [];
  try { altPhones = JSON.parse(target.alternate_phones || '[]'); } catch { altPhones = []; }
  if (source.phone && source.phone !== target.phone && !altPhones.includes(source.phone)) {
    altPhones.push(source.phone);
  }

  db.prepare('UPDATE emails SET contact_id = ? WHERE contact_id = ?').run(targetId, sourceId);
  db.prepare('UPDATE stays SET contact_id = ? WHERE contact_id = ?').run(targetId, sourceId);
  db.prepare('UPDATE requested_weeks SET contact_id = ? WHERE contact_id = ?').run(targetId, sourceId);
  db.prepare('UPDATE auto_replies SET contact_id = ? WHERE contact_id = ?').run(targetId, sourceId);

  try {
    db.prepare('UPDATE contact_interactions SET contact_id = ? WHERE contact_id = ?').run(targetId, sourceId);
  } catch { /* table may not exist */ }

  db.prepare(`
    UPDATE contacts SET
      phone = COALESCE(NULLIF(phone, ''), ?),
      address = COALESCE(NULLIF(address, ''), ?),
      postal_code = COALESCE(NULLIF(postal_code, ''), ?),
      country = COALESCE(NULLIF(country, ''), ?),
      nationality = COALESCE(NULLIF(nationality, ''), ?),
      notes = TRIM(COALESCE(notes, '') || CASE WHEN ? != '' THEN char(10) || ? ELSE '' END),
      first_contact_date = CASE WHEN ? < first_contact_date THEN ? ELSE first_contact_date END,
      last_contact_date = CASE WHEN ? > last_contact_date THEN ? ELSE last_contact_date END,
      alternate_emails = ?,
      alternate_phones = ?,
      total_stays = total_stays + ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    source.phone || '',
    source.address || '',
    source.postal_code || '',
    source.country || '',
    source.nationality || '',
    source.notes || '',
    source.notes || '',
    source.first_contact_date || target.first_contact_date,
    source.first_contact_date || target.first_contact_date,
    source.last_contact_date || target.last_contact_date,
    source.last_contact_date || target.last_contact_date,
    JSON.stringify(altEmails),
    JSON.stringify(altPhones),
    source.total_stays || 0,
    targetId,
  );

  db.prepare('DELETE FROM contacts WHERE id = ?').run(sourceId);

  return {
    ok: true,
    targetId,
    sourceId,
    mergedEmail: source.email,
    alternateEmails: altEmails,
  };
}
