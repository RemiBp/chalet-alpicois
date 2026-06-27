/**
 * Fusionne / supprime séjours et semaines demandées en double (même client, dates chevauchantes).
 */

function stayRank(status) {
  if (status === 'paid') return 3;
  if (status === 'confirmed') return 2;
  if (status === 'pending') return 1;
  return 0;
}

function weekRank(status) {
  if (status === 'booked') return 3;
  if (status === 'negotiating') return 2;
  if (status === 'asked') return 1;
  return 0;
}

function nightsBetween(checkIn, checkOut) {
  return Math.max(0, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
}

function overlaps(aIn, aOut, bIn, bOut) {
  return aIn < bOut && aOut > bIn;
}

function pickBestStay(rows) {
  return [...rows].sort((a, b) => {
    if (a.manual_lock !== b.manual_lock) return b.manual_lock - a.manual_lock;
    const nr = stayRank(b.status) - stayRank(a.status);
    if (nr !== 0) return nr;
    return nightsBetween(b.check_in, b.check_out) - nightsBetween(a.check_in, a.check_out);
  })[0];
}

function pickBestWeek(rows) {
  return [...rows].sort((a, b) => {
    if (a.manual_lock !== b.manual_lock) return b.manual_lock - a.manual_lock;
    const nr = weekRank(b.status) - weekRank(a.status);
    if (nr !== 0) return nr;
    return nightsBetween(b.check_in, b.check_out) - nightsBetween(a.check_in, a.check_out);
  })[0];
}

function mergeDateRange(rows) {
  let checkIn = rows[0].check_in;
  let checkOut = rows[0].check_out;
  for (const r of rows) {
    if (r.check_in < checkIn) checkIn = r.check_in;
    if (r.check_out > checkOut) checkOut = r.check_out;
  }
  return { checkIn, checkOut, nights: nightsBetween(checkIn, checkOut) };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ contactId?: string }} opts
 */
export function dedupeOverlappingBookings(db, opts = {}) {
  const contactFilter = opts.contactId
    ? [opts.contactId]
    : db.prepare(`
        SELECT DISTINCT contact_id FROM stays
        WHERE status IN ('confirmed', 'paid', 'pending')
        UNION
        SELECT DISTINCT contact_id FROM requested_weeks
        WHERE status IN ('booked', 'negotiating', 'asked')
      `).all().map(r => r.contact_id);

  let staysRemoved = 0;
  let weeksRemoved = 0;
  let staysMerged = 0;
  let weeksMerged = 0;

  const delStay = db.prepare('DELETE FROM stays WHERE id = ?');
  const delWeek = db.prepare('DELETE FROM requested_weeks WHERE id = ?');
  const updStay = db.prepare(`
    UPDATE stays SET check_in = ?, check_out = ?, nights = ?, notes = COALESCE(notes, '') || ?
    WHERE id = ?
  `);
  const updWeek = db.prepare(`
    UPDATE requested_weeks SET check_in = ?, check_out = ?, notes = COALESCE(notes, '') || ?
    WHERE id = ?
  `);

  for (const contactId of contactFilter) {
    const stays = db.prepare(`
      SELECT * FROM stays WHERE contact_id = ?
        AND status IN ('confirmed', 'paid', 'pending')
      ORDER BY check_in ASC
    `).all(contactId);

    const usedStay = new Set();
    for (let i = 0; i < stays.length; i++) {
      if (usedStay.has(stays[i].id)) continue;
      const cluster = [stays[i]];
      for (let j = i + 1; j < stays.length; j++) {
        if (usedStay.has(stays[j].id)) continue;
        if (overlaps(stays[i].check_in, stays[i].check_out, stays[j].check_in, stays[j].check_out)) {
          cluster.push(stays[j]);
        }
      }
      if (cluster.length <= 1) continue;

      const keep = pickBestStay(cluster);
      const merged = mergeDateRange(cluster);
      const changed = keep.check_in !== merged.checkIn || keep.check_out !== merged.checkOut;
      if (changed && keep.manual_lock !== 1) {
        updStay.run(merged.checkIn, merged.checkOut, merged.nights, ' — fusion doublon', keep.id);
        staysMerged++;
      }
      for (const s of cluster) {
        if (s.id !== keep.id) {
          delStay.run(s.id);
          staysRemoved++;
          usedStay.add(s.id);
        }
      }
      usedStay.add(keep.id);
    }

    const weeks = db.prepare(`
      SELECT * FROM requested_weeks WHERE contact_id = ?
        AND status IN ('booked', 'negotiating', 'asked')
      ORDER BY check_in ASC
    `).all(contactId);

    const usedWeek = new Set();
    for (let i = 0; i < weeks.length; i++) {
      if (usedWeek.has(weeks[i].id)) continue;
      const cluster = [weeks[i]];
      for (let j = i + 1; j < weeks.length; j++) {
        if (usedWeek.has(weeks[j].id)) continue;
        if (overlaps(weeks[i].check_in, weeks[i].check_out, weeks[j].check_in, weeks[j].check_out)) {
          cluster.push(weeks[j]);
        }
      }
      if (cluster.length <= 1) continue;

      const keep = pickBestWeek(cluster);
      const merged = mergeDateRange(cluster);
      const changed = keep.check_in !== merged.checkIn || keep.check_out !== merged.checkOut;
      if (changed && keep.manual_lock !== 1) {
        updWeek.run(merged.checkIn, merged.checkOut, ' — fusion doublon', keep.id);
        weeksMerged++;
      }
      for (const w of cluster) {
        if (w.id !== keep.id) {
          delWeek.run(w.id);
          weeksRemoved++;
          usedWeek.add(w.id);
        }
      }
      usedWeek.add(keep.id);
    }
  }

  return { staysRemoved, weeksRemoved, staysMerged, weeksMerged };
}

/** Lecture seule — prévisualise les fusions sans modifier la base. */
export function planDedupeOverlappingBookings(db, opts = {}) {
  const contactFilter = opts.contactId
    ? [opts.contactId]
    : db.prepare(`
        SELECT DISTINCT contact_id FROM stays
        WHERE status IN ('confirmed', 'paid', 'pending')
        UNION
        SELECT DISTINCT contact_id FROM requested_weeks
        WHERE status IN ('booked', 'negotiating', 'asked')
      `).all().map(r => r.contact_id);

  let staysRemoved = 0;
  let weeksRemoved = 0;
  let staysMerged = 0;
  let weeksMerged = 0;
  const samples = [];

  for (const contactId of contactFilter) {
    const stays = db.prepare(`
      SELECT id, contact_id, check_in, check_out, status, manual_lock FROM stays
      WHERE contact_id = ? AND status IN ('confirmed', 'paid', 'pending')
      ORDER BY check_in ASC
    `).all(contactId);

    const usedStay = new Set();
    for (let i = 0; i < stays.length; i++) {
      if (usedStay.has(stays[i].id)) continue;
      const cluster = [stays[i]];
      for (let j = i + 1; j < stays.length; j++) {
        if (usedStay.has(stays[j].id)) continue;
        if (overlaps(stays[i].check_in, stays[i].check_out, stays[j].check_in, stays[j].check_out)) {
          cluster.push(stays[j]);
        }
      }
      if (cluster.length <= 1) continue;
      const keep = pickBestStay(cluster);
      const merged = mergeDateRange(cluster);
      if (keep.check_in !== merged.checkIn || keep.check_out !== merged.checkOut) staysMerged++;
      for (const s of cluster) {
        if (s.id !== keep.id) {
          staysRemoved++;
          if (samples.length < 8) samples.push({ type: 'stay', remove: s.id, keep: keep.id, contactId });
        }
      }
      cluster.forEach(s => usedStay.add(s.id));
    }

    const weeks = db.prepare(`
      SELECT id, contact_id, check_in, check_out, status, manual_lock FROM requested_weeks
      WHERE contact_id = ? AND status IN ('booked', 'negotiating', 'asked')
      ORDER BY check_in ASC
    `).all(contactId);

    const usedWeek = new Set();
    for (let i = 0; i < weeks.length; i++) {
      if (usedWeek.has(weeks[i].id)) continue;
      const cluster = [weeks[i]];
      for (let j = i + 1; j < weeks.length; j++) {
        if (usedWeek.has(weeks[j].id)) continue;
        if (overlaps(weeks[i].check_in, weeks[i].check_out, weeks[j].check_in, weeks[j].check_out)) {
          cluster.push(weeks[j]);
        }
      }
      if (cluster.length <= 1) continue;
      const keep = pickBestWeek(cluster);
      const merged = mergeDateRange(cluster);
      if (keep.check_in !== merged.checkIn || keep.check_out !== merged.checkOut) weeksMerged++;
      for (const w of cluster) {
        if (w.id !== keep.id) {
          weeksRemoved++;
          if (samples.length < 8) samples.push({ type: 'week', remove: w.id, keep: keep.id, contactId });
        }
      }
      cluster.forEach(w => usedWeek.add(w.id));
    }
  }

  return { dryRun: true, staysRemoved, weeksRemoved, staysMerged, weeksMerged, samples };
}

/**
 * Trouve un séjour actif qui chevauche la plage demandée.
 */
export function findOverlappingStay(db, contactId, checkIn, checkOut) {
  return db.prepare(`
    SELECT * FROM stays WHERE contact_id = ?
      AND status IN ('confirmed', 'paid', 'pending')
      AND check_in < ? AND check_out > ?
    ORDER BY (julianday(check_out) - julianday(check_in)) DESC
    LIMIT 1
  `).get(contactId, checkOut, checkIn);
}

export function findOverlappingWeek(db, contactId, checkIn, checkOut) {
  return db.prepare(`
    SELECT * FROM requested_weeks WHERE contact_id = ?
      AND status IN ('booked', 'negotiating', 'asked')
      AND check_in < ? AND check_out > ?
    ORDER BY (julianday(check_out) - julianday(check_in)) DESC
    LIMIT 1
  `).get(contactId, checkOut, checkIn);
}
