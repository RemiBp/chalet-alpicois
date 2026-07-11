/**
 * Synthèse financière saison — exclut les semaines personnelles (Barbier et amis).
 * Multi-semaines : une ligne par semaine calendrier (pas de doublon chevauchant).
 */

import {
  estimateWeeklyPrice, estimateStayPrice, eachWeekCheckIn, generateSundayWeeks, weeksSpannedByStay,
} from './availability.js';
import { isInternalContact } from './host-filter.js';

function priceOf(row) {
  return Number(row.price_confirmed || row.price_quoted || 0);
}

function rangesOverlap(aIn, aOut, bIn, bOut) {
  return aIn < bOut && bIn < aOut;
}

/** Supprime les séjours strictement inclus dans un autre (ex. 3–10 jan dans 3–17 jan). */
function filterSubsetStays(stays) {
  return stays.filter(s => !stays.some(o =>
    o.contact_id === s.contact_id
    && o.id !== s.id
    && o.check_in <= s.check_in
    && o.check_out >= s.check_out
    && (o.check_in < s.check_in || o.check_out > s.check_out),
  ));
}

function filterSubsetWeeks(weeks) {
  return weeks.filter(w => !weeks.some(o =>
    o.contact_id === w.contact_id
    && o.id !== w.id
    && o.check_in <= w.check_in
    && o.check_out >= w.check_out
    && (o.check_in < w.check_in || o.check_out > w.check_out),
  ));
}

function stayOverlapsWeek(stay, week) {
  return rangesOverlap(stay.check_in, stay.check_out, week.check_in, week.check_out);
}

/**
 * Le chalet ne peut accueillir qu'un client par semaine. Une donnée importée peut
 * toutefois contenir deux fiches pour la même réservation (ex. fiche Excel puis
 * fiche email). On conserve la ligne la plus fiable pour les totaux afin de ne
 * jamais gonfler le chiffre d'affaires ; le doublon reste visible dans l'audit.
 */
function dedupeCalendarSlots(lines) {
  const priority = { collected: 4, confirmed: 3, personal: 2, forecast: 1 };
  const bySlot = new Map();
  for (const line of lines) {
    const existing = bySlot.get(line.checkIn);
    if (!existing) {
      bySlot.set(line.checkIn, line);
      continue;
    }
    const score = priority[line.category] || 0;
    const existingScore = priority[existing.category] || 0;
    // À statut égal, un montant confirmé est plus fiable qu'une estimation.
    if (score > existingScore || (score === existingScore && existing.estimatedAmount && !line.estimatedAmount)) {
      bySlot.set(line.checkIn, line);
    }
  }
  return [...bySlot.values()];
}

/**
 * @param {import('better-sqlite3').Database} db
 */
export function getFinanceSummary(db, season = '2026-2027') {
  const contacts = db.prepare('SELECT id, name, first_name, email, is_personal FROM contacts').all();
  const personalIds = new Set(
    contacts.filter(c => isInternalContact(c) || c.is_personal === 1).map(c => c.id),
  );

  const seasonWeeks = generateSundayWeeks(season);
  const totalSeasonWeeks = seasonWeeks.length;

  const staysRaw = db.prepare(`
    SELECT s.*, c.name AS contact_name, c.first_name AS contact_first_name, c.email AS contact_email
    FROM stays s
    JOIN contacts c ON c.id = s.contact_id
    WHERE s.check_in IS NOT NULL AND s.check_in != ''
      AND s.status NOT IN ('cancelled', 'no_show')
      AND (s.season = ? OR s.season = '' OR s.season IS NULL OR ? = '')
    ORDER BY s.check_in ASC
  `).all(season, season);

  const weeksRaw = db.prepare(`
    SELECT rw.*, c.name AS contact_name, c.first_name AS contact_first_name, c.email AS contact_email
    FROM requested_weeks rw
    JOIN contacts c ON c.id = rw.contact_id
    WHERE rw.check_in IS NOT NULL AND rw.check_in != ''
      AND rw.status NOT IN ('abandoned')
      AND (rw.season = ? OR rw.season = '' OR rw.season IS NULL OR ? = '')
    ORDER BY rw.check_in ASC
  `).all(season, season);

  const stays = filterSubsetStays(staysRaw);
  const weeks = filterSubsetWeeks(weeksRaw);

  let collected = 0;
  let confirmedPending = 0;
  let forecast = 0;
  let personalWeeks = 0;
  const lines = [];
  const bookedCheckIns = new Set();

  for (const s of stays) {
    const personal = personalIds.has(s.contact_id);
    const quoted = priceOf(s);
    const estimatedAmount = !personal && !quoted;
    const contactName = [s.contact_first_name, s.contact_name].filter(Boolean).join(' ').trim() || s.contact_name;
    const weekSlots = personal
      ? [{ checkIn: s.check_in, checkOut: s.check_out }]
      : weeksSpannedByStay(s.check_in, s.check_out, season);

    if (!weekSlots.length) weekSlots.push({ checkIn: s.check_in, checkOut: s.check_out });

    let category = 'forecast';
    let statusLabel = 'En cours';
    if (personal) {
      category = 'personal';
      statusLabel = 'Semaine personnelle';
    } else if (s.status === 'paid') {
      category = 'collected';
      statusLabel = 'Encaissé';
    } else if (s.status === 'confirmed') {
      category = 'confirmed';
      statusLabel = 'Confirmé';
    } else if (['pending', 'negotiating'].includes(s.status)) {
      category = 'forecast';
      statusLabel = 'En cours';
    }

    for (const slot of weekSlots) {
      const weekPrice = personal
        ? 0
        : (estimatedAmount
          ? estimateWeeklyPrice(slot.checkIn, season)
          : Math.round(quoted / weekSlots.length));

      if (personal) {
        personalWeeks++;
      } else if (category === 'collected') {
        collected += weekPrice;
        bookedCheckIns.add(slot.checkIn);
      } else if (category === 'confirmed') {
        confirmedPending += weekPrice;
        bookedCheckIns.add(slot.checkIn);
      } else if (category === 'forecast') {
        forecast += weekPrice;
      }

      lines.push({
        id: weekSlots.length > 1 ? `stay-${s.id}@${slot.checkIn}` : `stay-${s.id}`,
        type: personal ? 'personal' : 'stay',
        contactId: s.contact_id,
        contactName,
        checkIn: slot.checkIn,
        checkOut: slot.checkOut,
        status: s.status,
        amount: weekPrice,
        label: statusLabel,
        category,
        personal,
        estimatedAmount,
        weekCount: 1,
        stayId: s.id,
      });
    }
  }

  for (const w of weeks) {
    if (stays.some(s => stayOverlapsWeek(s, w))) continue;

    const personal = personalIds.has(w.contact_id);
    const contactName = [w.contact_first_name, w.contact_name].filter(Boolean).join(' ').trim() || w.contact_name;
    const weekSlots = personal
      ? [{ checkIn: w.check_in, checkOut: w.check_out }]
      : weeksSpannedByStay(w.check_in, w.check_out, season);

    if (!weekSlots.length) weekSlots.push({ checkIn: w.check_in, checkOut: w.check_out });

    for (const slot of weekSlots) {
      const price = personal ? 0 : estimateWeeklyPrice(slot.checkIn, w.season || season);

      if (personal) {
        personalWeeks++;
      } else if (w.status === 'booked') {
        confirmedPending += price;
        bookedCheckIns.add(slot.checkIn);
      } else if (['negotiating', 'asked'].includes(w.status)) {
        forecast += price;
      }

      lines.push({
        id: weekSlots.length > 1 ? `week-${w.id}@${slot.checkIn}` : `week-${w.id}`,
        type: personal ? 'personal' : 'inquiry',
        contactId: w.contact_id,
        contactName,
        checkIn: slot.checkIn,
        checkOut: slot.checkOut,
        status: w.status,
        amount: personal ? 0 : price,
        label: personal ? 'Semaine personnelle' : (w.status === 'booked' ? 'Réservé' : w.status === 'negotiating' ? 'Négociation' : 'Demande'),
        category: personal ? 'personal' : (w.status === 'booked' ? 'confirmed' : 'forecast'),
        personal,
        estimatedAmount: !personal,
        weekCount: 1,
        weekRecordId: w.id,
      });
    }
  }

  const dedupedLines = dedupeCalendarSlots(lines);
  lines.length = 0;
  lines.push(...dedupedLines);
  lines.sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''));

  // Recalcul après dédoublonnage : les compteurs alimentés pendant la collecte
  // ne doivent pas inclure une fiche importée en double.
  collected = lines.filter(l => l.category === 'collected').reduce((sum, l) => sum + l.amount, 0);
  confirmedPending = lines.filter(l => l.category === 'confirmed').reduce((sum, l) => sum + l.amount, 0);
  forecast = lines.filter(l => l.category === 'forecast').reduce((sum, l) => sum + l.amount, 0);
  personalWeeks = lines.filter(l => l.personal).reduce((sum, l) => sum + (l.weekCount || 1), 0);
  bookedCheckIns.clear();
  for (const line of lines) {
    if (line.category === 'collected' || line.category === 'confirmed') bookedCheckIns.add(line.checkIn);
  }

  function weeksOf(line) {
    if (line.personal) return 0;
    return line.weekCount || 1;
  }

  function sumWeeksFor(category) {
    return lines.filter(l => l.category === category).reduce((s, l) => s + weeksOf(l), 0);
  }

  const totalPotential = collected + confirmedPending + forecast;
  const clientWeeks = lines.filter(l => !l.personal).reduce((s, l) => s + weeksOf(l), 0);
  const occupancyRate = totalSeasonWeeks
    ? Math.round((bookedCheckIns.size / totalSeasonWeeks) * 100)
    : 0;

  const byCategory = {
    collected: lines.filter(l => l.category === 'collected'),
    confirmed: lines.filter(l => l.category === 'confirmed'),
    forecast: lines.filter(l => l.category === 'forecast'),
    personal: lines.filter(l => l.category === 'personal'),
  };

  return {
    season,
    collected,
    confirmedPending,
    forecast,
    totalPotential,
    personalWeeks,
    clientWeeks,
    totalSeasonWeeks,
    bookedWeeks: bookedCheckIns.size,
    freeWeeks: Math.max(0, totalSeasonWeeks - bookedCheckIns.size - personalWeeks),
    occupancyRate,
    lines,
    byCategory: {
      collected: byCategory.collected.length,
      confirmed: byCategory.confirmed.length,
      forecast: byCategory.forecast.length,
      personal: byCategory.personal.length,
    },
    byCategoryWeeks: {
      collected: sumWeeksFor('collected'),
      confirmed: sumWeeksFor('confirmed'),
      forecast: sumWeeksFor('forecast'),
      personal: sumWeeksFor('personal'),
      totalClient: clientWeeks,
    },
  };
}

/** Parse stay-abc123 ou stay-abc123@2027-01-03 → stayId */
export function parseStayEventId(eventId) {
  if (!eventId?.startsWith('stay-')) return null;
  return eventId.slice(5).split('@')[0] || null;
}

/** Parse week-abc123 ou week-abc123@2027-01-03 → weekId */
export function parseWeekEventId(eventId) {
  if (!eventId?.startsWith('week-')) return null;
  return eventId.slice(5).split('@')[0] || null;
}
