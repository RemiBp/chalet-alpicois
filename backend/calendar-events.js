/**
 * Événements calendrier — séjours confirmés + semaines réservées.
 */

import { generateSundayWeeks } from './availability.js';
import { displayNameFromContact } from './name-format.js';
import { isInternalContact, PERSONAL_CONTACT_ID } from './host-filter.js';
import { findEventEvidenceEmail } from './event-evidence.js';
import { attachProgressToEvent } from './stay-progress.js';
import { getWeekPrice } from './season-prices-data.js';

function eventOverlapsWeek(event, week) {
  return event.checkIn < week.checkOut && event.checkOut > week.checkIn;
}

function eventsOverlap(a, b) {
  return a.checkIn < b.checkOut && a.checkOut > b.checkIn;
}

function isOfficialBookingEvent(event) {
  return Boolean(event.progress?.contractNumber);
}

function weekContainsDate(week, isoDate) {
  return isoDate >= week.checkIn && isoDate < week.checkOut;
}

/**
 * Où afficher un événement dans la grille hebdomadaire.
 * — Confirmé / bloquant ou séjour > 7 nuits : toutes les semaines chevauchées.
 * — Demande courte : uniquement la semaine contenant la date d'arrivée (évite doublon 2–9 jan).
 */
export function eventShownInWeek(event, week) {
  if (!eventOverlapsWeek(event, week)) return false;
  if (event.blocksCalendar) return true;
  if (nightsBetween(event.checkIn, event.checkOut) > 7) return true;
  return weekContainsDate(week, event.checkIn);
}

/** Une entrée par client et par semaine (évite doublons stay + week ou 2 stays). */
function dedupeWeekEvents(weekEvents) {
  const byContact = new Map();
  const score = (e) => {
    let s = 0;
    if (e.id.startsWith('stay-')) s += 4;
    if (e.blocksCalendar) s += 8;
    if (e.status === 'paid') s += 3;
    else if (e.status === 'confirmed' || e.status === 'booked') s += 2;
    s += nightsBetween(e.checkIn, e.checkOut) / 100;
    return s;
  };
  for (const e of weekEvents) {
    const prev = byContact.get(e.contactId);
    if (!prev || score(e) > score(prev)) byContact.set(e.contactId, e);
  }
  return [...byContact.values()];
}

function nightsBetween(checkIn, checkOut) {
  return Math.max(0, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
}

function isPersonalEvent(row) {
  return row.is_personal === 1 || row.contact_id === PERSONAL_CONTACT_ID || isInternalContact({
    id: row.contact_id,
    name: row.contact_name,
    first_name: row.contact_first_name,
    email: row.contact_email,
    is_personal: row.is_personal,
  });
}

function attachEvidence(db, event, row) {
  if (event.personal) return event;
  const evidence = findEventEvidenceEmail(db, {
    contactId: event.contactId,
    checkIn: event.checkIn,
    checkOut: event.checkOut,
    sourceEmailId: row.source_email_id,
    notes: row.notes,
  });
  if (evidence) event.confirmationEmail = evidence;
  return event;
}

export function getCalendarEvents(db, season = '2026-2027') {
  const stays = db.prepare(`
    SELECT s.*, c.name AS contact_name, c.first_name AS contact_first_name,
      c.email AS contact_email, c.is_personal AS contact_is_personal
    FROM stays s JOIN contacts c ON c.id = s.contact_id
    WHERE s.check_in IS NOT NULL AND s.check_in != ''
      AND s.status IN ('confirmed', 'paid', 'pending')
    ORDER BY s.check_in ASC
  `).all();

  const bookedWeeks = db.prepare(`
    SELECT rw.*, c.name AS contact_name, c.first_name AS contact_first_name,
      c.email AS contact_email, c.is_personal AS contact_is_personal
    FROM requested_weeks rw JOIN contacts c ON c.id = rw.contact_id
    WHERE rw.check_in IS NOT NULL AND rw.check_in != ''
      AND rw.status IN ('booked', 'negotiating', 'asked')
    ORDER BY rw.check_in ASC
  `).all();

  const events = [];

  for (const s of stays) {
    const personal = isPersonalEvent({
      ...s,
      is_personal: s.is_personal || s.contact_is_personal,
    });
    let event = {
      id: `stay-${s.id}`,
      type: personal ? 'personal' : 'stay',
      contactId: s.contact_id,
      contactName: personal ? 'Barbier et amis' : displayNameFromContact({
        name: s.contact_name,
        first_name: s.contact_first_name,
        email: s.contact_email,
      }),
      contactEmail: s.contact_email,
      checkIn: s.check_in,
      checkOut: s.check_out,
      status: s.status,
      label: personal ? 'Semaine personnelle' : (s.status === 'paid' ? 'Payé' : s.status === 'confirmed' ? 'Confirmé' : 'En cours'),
      blocksCalendar: s.status === 'confirmed' || s.status === 'paid' || personal,
      personal,
      season: s.season,
      price: personal ? 0 : Number(s.price_confirmed || s.price_quoted || 0),
    };
    if (!personal) event = attachEvidence(db, event, s);
    if (!personal) event = attachProgressToEvent(db, event);
    events.push(event);
  }

  for (const w of bookedWeeks) {
    const hasStay = events.some(e =>
      e.contactId === w.contact_id && e.checkIn === w.check_in && e.blocksCalendar,
    );
    if (hasStay) continue;

    const personal = isPersonalEvent({
      ...w,
      is_personal: w.is_personal || w.contact_is_personal,
    });

    let event = {
      id: `week-${w.id}`,
      type: personal ? 'personal' : 'inquiry',
      contactId: w.contact_id,
      contactName: personal ? 'Barbier et amis' : displayNameFromContact({
        name: w.contact_name,
        first_name: w.contact_first_name,
        email: w.contact_email,
      }),
      contactEmail: w.contact_email,
      checkIn: w.check_in,
      checkOut: w.check_out,
      status: w.status,
      label: personal ? 'Semaine personnelle' : (
        w.status === 'booked' ? 'Réservé' :
          w.status === 'negotiating' || w.status === 'asked' ? 'Fin de négociation' : 'En cours'
      ),
      blocksCalendar: w.status === 'booked' || personal,
      personal,
      season: w.season,
      price: 0,
    };
    if (!personal) event = attachEvidence(db, event, w);
    if (!personal) event = attachProgressToEvent(db, event);
    events.push(event);
  }

  const weeks = generateSundayWeeks(season);
  const seasonStart = weeks[0]?.checkIn;
  const seasonEnd = weeks[weeks.length - 1]?.checkOut;
  const rawSeasonEvents = events.filter(e =>
    !seasonStart || !seasonEnd || (e.checkIn <= seasonEnd && e.checkOut >= seasonStart),
  );
  const officialBlockedEvents = rawSeasonEvents.filter(e =>
    e.blocksCalendar && !e.personal && isOfficialBookingEvent(e),
  );
  const seasonEvents = rawSeasonEvents.filter(e => {
    if (!e.blocksCalendar || e.personal || isOfficialBookingEvent(e)) return true;
    return !officialBlockedEvents.some(official =>
      official.contactId !== e.contactId && eventsOverlap(e, official),
    );
  });

  const grid = weeks.map(w => {
    const weekEvents = dedupeWeekEvents(
      seasonEvents.filter(e => eventShownInWeek(e, w)),
    );
    const blocked = weekEvents.some(e => e.blocksCalendar);
    return {
      checkIn: w.checkIn,
      checkOut: w.checkOut,
      blocked,
      weekPrice: getWeekPrice(w.checkIn) ?? null,
      events: weekEvents,
    };
  });

  const clientBlocked = new Set();
  for (const e of seasonEvents.filter(ev => ev.blocksCalendar && !ev.personal)) {
    for (const w of weeks) {
      if (eventOverlapsWeek(e, w)) clientBlocked.add(w.checkIn);
    }
  }

  return {
    season,
    events: seasonEvents,
    weeks: grid,
    stats: {
      confirmed: seasonEvents.filter(e => e.blocksCalendar && !e.personal).length,
      personal: seasonEvents.filter(e => e.personal).length,
      negotiating: seasonEvents.filter(e => !e.personal && (e.status === 'negotiating' || e.status === 'pending')).length,
      inquiries: seasonEvents.filter(e => !e.personal && e.status === 'asked').length,
      totalWeeks: weeks.length,
      bookedWeeks: clientBlocked.size,
      occupancyRate: weeks.length ? Math.round((clientBlocked.size / weeks.length) * 100) : 0,
    },
  };
}
