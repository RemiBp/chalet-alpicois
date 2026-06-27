/**
 * Confirmation manuelle d'une semaine demandée → calendrier + profil client.
 */

import { estimateWeeklyPrice } from './availability.js';
import { computeSeason } from './extract-inquiry.js';
import { isInternalContact, PERSONAL_CONTACT_ID } from './host-filter.js';
import { appendAudit } from './audit-log.js';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function diffNights(checkIn, checkOut) {
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  return Math.max(0, Math.round((b - a) / 86400000));
}

function contactIsPersonal(db, contactId) {
  const c = db.prepare('SELECT id, name, first_name, email, is_personal FROM contacts WHERE id = ?').get(contactId);
  return contactId === PERSONAL_CONTACT_ID || isInternalContact(c);
}

/**
 * @param {import('better-sqlite3').Database} db
 */
export function confirmRequestedWeek(db, weekId, { price, notes } = {}) {
  const week = db.prepare('SELECT * FROM requested_weeks WHERE id = ?').get(weekId);
  if (!week) return { ok: false, error: 'Semaine introuvable' };

  const personal = contactIsPersonal(db, week.contact_id) || week.is_personal === 1;
  const season = week.season || computeSeason(week.check_in);
  const nights = diffNights(week.check_in, week.check_out) || 7;
  const resolvedPrice = personal ? 0 : (price || estimateWeeklyPrice(week.check_in, season));

  db.prepare(`
    UPDATE requested_weeks SET status = 'booked', is_personal = ?, manual_lock = 1, notes = COALESCE(NULLIF(?, ''), notes)
    WHERE id = ?
  `).run(personal ? 1 : 0, notes || 'Confirmé manuellement', weekId);

  const existingStay = db.prepare(`
    SELECT id FROM stays WHERE contact_id = ? AND check_in = ? AND check_out = ?
  `).get(week.contact_id, week.check_in, week.check_out);

  if (existingStay) {
    db.prepare(`
      UPDATE stays SET status = 'confirmed', is_personal = ?, manual_lock = 1, price_quoted = ?, price_confirmed = ?,
        adults = ?, season = ?, nights = ?, notes = COALESCE(NULLIF(?, ''), notes)
      WHERE id = ?
    `).run(
      personal ? 1 : 0, resolvedPrice, resolvedPrice, week.adults || 1, season, nights,
      notes || 'Confirmé manuellement', existingStay.id,
    );
  } else {
    db.prepare(`
      INSERT INTO stays (id, contact_id, season, check_in, check_out, nights, adults, children,
        price_quoted, price_confirmed, status, is_personal, manual_lock, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, 1, ?, datetime('now'))
    `).run(
      generateId(), week.contact_id, season, week.check_in, week.check_out,
      nights, week.adults || 1, week.children || 0,
      resolvedPrice, resolvedPrice, personal ? 1 : 0, notes || 'Confirmé manuellement',
    );
  }

  if (!personal) {
    db.prepare(`
      UPDATE contacts SET status = 'client', total_stays = total_stays + 1, updated_at = datetime('now')
      WHERE id = ? AND status = 'prospect'
    `).run(week.contact_id);
  }

  db.prepare(`UPDATE contacts SET updated_at = datetime('now') WHERE id = ?`).run(week.contact_id);

  return {
    ok: true,
    weekId,
    contactId: week.contact_id,
    checkIn: week.check_in,
    checkOut: week.check_out,
    price: resolvedPrice,
    personal,
  };
}

/**
 * @param {import('better-sqlite3').Database} db
 */
export function updateRequestedWeekStatus(db, weekId, status, notes) {
  const allowed = ['asked', 'negotiating', 'booked', 'abandoned'];
  if (!allowed.includes(status)) return { ok: false, error: 'Statut invalide' };

  const week = db.prepare('SELECT * FROM requested_weeks WHERE id = ?').get(weekId);
  if (!week) return { ok: false, error: 'Semaine introuvable' };

  if (status === 'booked') {
    return confirmRequestedWeek(db, weekId, { notes });
  }

  db.prepare('UPDATE requested_weeks SET status = ?, manual_lock = 1, notes = COALESCE(NULLIF(?, ""), notes) WHERE id = ?')
    .run(status, notes || '', weekId);

  return { ok: true, weekId, status };
}

/**
 * @param {import('better-sqlite3').Database} db
 */
export function removeCalendarBooking(db, { weekId, stayId } = {}, auditCtx = {}) {
  let stay = stayId ? db.prepare('SELECT * FROM stays WHERE id = ?').get(stayId) : null;
  let week = weekId ? db.prepare('SELECT * FROM requested_weeks WHERE id = ?').get(weekId) : null;

  if (stay && !week) {
    week = db.prepare(`
      SELECT * FROM requested_weeks WHERE contact_id = ? AND check_in = ? AND check_out = ?
    `).get(stay.contact_id, stay.check_in, stay.check_out);
  }
  if (week && !stay) {
    stay = db.prepare(`
      SELECT * FROM stays WHERE contact_id = ? AND check_in = ? AND check_out = ?
    `).get(week.contact_id, week.check_in, week.check_out);
  }

  const snapshot = {
    week: week ? { id: week.id, checkIn: week.check_in, checkOut: week.check_out, status: week.status } : null,
    stay: stay ? { id: stay.id, status: stay.status, price: stay.price_confirmed || stay.price_quoted } : null,
  };

  if (stay) {
    db.prepare(`
      UPDATE stays SET status = 'cancelled', manual_lock = 1,
        notes = COALESCE(notes, '') || ' — Annulé manuellement'
      WHERE id = ?
    `).run(stay.id);
  }
  if (week) {
    db.prepare(`
      UPDATE requested_weeks SET status = 'abandoned', manual_lock = 1,
        notes = COALESCE(notes, '') || ' — Libéré manuellement'
      WHERE id = ?
    `).run(week.id);
  } else if (stay) {
    db.prepare(`
      UPDATE requested_weeks SET status = 'abandoned', manual_lock = 1,
        notes = COALESCE(notes, '') || ' — Libéré manuellement'
      WHERE contact_id = ? AND check_in = ? AND check_out = ?
    `).run(stay.contact_id, stay.check_in, stay.check_out);
  }

  if (!stay && !week) return { ok: false, error: 'Réservation introuvable' };

  appendAudit(db, {
    action: 'booking_removed',
    entityType: stay ? 'stay' : 'week',
    entityId: stay?.id || week?.id,
    contactId: stay?.contact_id || week?.contact_id || '',
    payload: { ...snapshot, source: auditCtx.source || 'admin' },
    actor: auditCtx.actor || auditCtx.source || 'gilles',
  });

  return { ok: true, weekId: week?.id, stayId: stay?.id };
}

/**
 * @param {import('better-sqlite3').Database} db
 */
export function updateCalendarEvent(db, { weekId, stayId, status, price, notes, checkIn, checkOut }, auditCtx = {}) {
  if (status === 'abandoned' || status === 'cancelled') {
    return removeCalendarBooking(db, { weekId, stayId }, auditCtx);
  }

  if (weekId) {
    if (status === 'booked' || status === 'confirmed') {
      return confirmRequestedWeek(db, weekId, { price, notes });
    }
    if (status) return updateRequestedWeekStatus(db, weekId, status, notes);
    if (price != null) {
      const week = db.prepare('SELECT * FROM requested_weeks WHERE id = ?').get(weekId);
      if (!week) return { ok: false, error: 'Semaine introuvable' };
      const stay = db.prepare(`
        SELECT id FROM stays WHERE contact_id = ? AND check_in = ? AND check_out = ?
      `).get(week.contact_id, week.check_in, week.check_out);
      if (stay) {
        db.prepare('UPDATE stays SET price_quoted = ?, price_confirmed = ?, manual_lock = 1 WHERE id = ?')
          .run(price, price, stay.id);
      }
      appendAudit(db, {
        action: 'price_updated',
        entityType: 'week',
        entityId: weekId,
        contactId: week.contact_id,
        payload: { price, checkIn: week.check_in, checkOut: week.check_out },
        actor: auditCtx.actor || auditCtx.source || 'gilles',
      });
      return { ok: true, weekId, price };
    }
  }

  if (stayId) {
    const stay = db.prepare('SELECT * FROM stays WHERE id = ?').get(stayId);
    if (!stay) return { ok: false, error: 'Séjour introuvable' };
    const personal = stay.is_personal === 1 || contactIsPersonal(db, stay.contact_id);
    const nextCheckIn = checkIn || stay.check_in;
    const nextCheckOut = checkOut || stay.check_out;
    const nights = diffNights(nextCheckIn, nextCheckOut) || stay.nights || 7;
    const resolvedPrice = personal ? 0 : (price != null ? Number(price) : Number(stay.price_confirmed || stay.price_quoted || 0));
    const nextStatus = status || stay.status;

    db.prepare(`
      UPDATE stays SET status = ?, check_in = ?, check_out = ?, nights = ?,
        price_quoted = ?, price_confirmed = ?,
        is_personal = ?, manual_lock = 1, notes = COALESCE(NULLIF(?, ''), notes)
      WHERE id = ?
    `).run(nextStatus, nextCheckIn, nextCheckOut, nights, resolvedPrice, resolvedPrice, personal ? 1 : 0, notes || '', stayId);

    const week = db.prepare(`
      SELECT id FROM requested_weeks WHERE contact_id = ? AND check_in = ? AND check_out = ?
    `).get(stay.contact_id, stay.check_in, stay.check_out);

    if (week) {
      db.prepare(`
        UPDATE requested_weeks SET check_in = ?, check_out = ?, status = ?, is_personal = ?, manual_lock = 1
        WHERE id = ?
      `).run(
        nextCheckIn, nextCheckOut,
        nextStatus === 'paid' || nextStatus === 'confirmed' ? 'booked' : 'negotiating',
        personal ? 1 : 0, week.id,
      );
    } else if (nextStatus === 'confirmed' || nextStatus === 'paid') {
      const season = stay.season || computeSeason(stay.check_in);
      db.prepare(`
        INSERT INTO requested_weeks (id, contact_id, season, check_in, check_out, adults, children, status, is_personal, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'booked', ?, ?)
      `).run(
        generateId(), stay.contact_id, season, stay.check_in, stay.check_out,
        stay.adults || 1, stay.children || 0, personal ? 1 : 0, notes || 'Sync calendrier',
      );
    }

    appendAudit(db, {
      action: 'stay_updated',
      entityType: 'stay',
      entityId: stayId,
      contactId: stay.contact_id,
      payload: { status: nextStatus, price: resolvedPrice, checkIn: nextCheckIn, checkOut: nextCheckOut },
      actor: auditCtx.actor || auditCtx.source || 'gilles',
    });

    return { ok: true, stayId, status: nextStatus, price: resolvedPrice };
  }

  return { ok: false, error: 'weekId ou stayId requis' };
}

/**
 * @param {import('better-sqlite3').Database} db
 */
export function assignWeekToContact(db, { contactId, checkIn, checkOut, adults, children, status, notes, price }) {
  const contact = db.prepare('SELECT id, is_personal, email, name, first_name FROM contacts WHERE id = ?').get(contactId);
  if (!contact) return { ok: false, error: 'Contact introuvable' };

  const personal = contactIsPersonal(db, contactId);
  const season = computeSeason(checkIn);
  const weekId = generateId();

  db.prepare(`
    INSERT INTO requested_weeks (id, contact_id, season, check_in, check_out, adults, children, status, is_personal, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    weekId, contactId, season, checkIn, checkOut,
    adults || 0, children || 0, status || 'asked', personal ? 1 : 0,
    notes || (personal ? 'Semaine personnelle' : 'Assigné manuellement'),
  );

  if (status === 'booked') {
    return confirmRequestedWeek(db, weekId, {
      notes: notes || (personal ? 'Semaine personnelle' : undefined),
      price: personal ? 0 : price,
    });
  }

  return { ok: true, weekId, contactId, checkIn, checkOut, personal };
}
