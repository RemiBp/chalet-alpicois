/**
 * Disponibilité calendrier + semaines alternatives (dimanche → dimanche).
 */

import { SEASON_2026_2027_WEEKS, getWeekPrice } from './season-prices-data.js';

const SEASON_PRICES = {
  '2025-2026': { high: 3800, mid: 2800, low: 2200 },
  '2026-2027': { high: 4000, mid: 3000, low: 2400 },
};

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function getBookedRanges(db) {
  const stays = db.prepare(`
    SELECT check_in, check_out FROM stays
    WHERE status IN ('confirmed', 'paid')
      AND check_in IS NOT NULL AND check_in != ''
  `).all();

  const bookedWeeks = db.prepare(`
    SELECT check_in, check_out FROM requested_weeks
    WHERE status = 'booked'
      AND check_in IS NOT NULL AND check_in != ''
  `).all();

  return [...stays, ...bookedWeeks].map(r => ({
    checkIn: r.check_in,
    checkOut: r.check_out,
  }));
}

export function checkPeriodAvailability(db, checkIn, checkOut) {
  if (!checkIn || !checkOut) return { status: 'unknown', label: 'Dates incomplètes' };

  const booked = getBookedRanges(db);
  const conflict = booked.find(b => rangesOverlap(checkIn, checkOut, b.checkIn, b.checkOut));

  if (conflict) {
    return {
      status: 'unavailable',
      label: 'Indisponible — chevauche une réservation',
      conflict,
    };
  }

  return { status: 'available', label: 'Disponible' };
}

function seasonStartYear(season) {
  const m = season?.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : new Date().getFullYear();
}

/** Date locale YYYY-MM-DD (évite le décalage UTC de toISOString sur Vercel). */
function formatLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function generateSundayWeeks(season) {
  const year = seasonStartYear(season || '2026-2027');
  const weeks = [];
  const d = new Date(year, 11, 1);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);

  const end = new Date(year + 1, 3, 30);
  while (d <= end) {
    const checkIn = formatLocalDate(d);
    const out = new Date(d);
    out.setDate(out.getDate() + 7);
    weeks.push({ checkIn, checkOut: formatLocalDate(out) });
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}

export function estimateWeeklyPrice(checkIn, season) {
  const exact = getWeekPrice(checkIn, season);
  if (exact != null) return exact;
  const prices = SEASON_PRICES[season] || SEASON_PRICES['2026-2027'];
  const month = parseInt(checkIn.slice(5, 7), 10);
  if (month === 12 || month === 2) return prices.high;
  if (month === 1) return prices.low;
  if (month === 3 || month === 4) return prices.mid;
  return prices.mid;
}

/** Prix estimé pour un séjour (1 ou plusieurs semaines dimanche→dimanche). */
export function estimateStayPrice(checkIn, checkOut, season) {
  if (!checkIn || !checkOut) return estimateWeeklyPrice(checkIn, season);
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  let total = 0;
  let weeks = 0;
  const cursor = new Date(start);
  while (cursor < end && weeks < 8) {
    total += estimateWeeklyPrice(formatLocalDate(cursor), season);
    cursor.setDate(cursor.getDate() + 7);
    weeks++;
  }
  return total || estimateWeeklyPrice(checkIn, season);
}

export function eachWeekCheckIn(checkIn, checkOut) {
  if (!checkIn || !checkOut) return checkIn ? [checkIn] : [];
  const out = [];
  const cursor = new Date(checkIn);
  const end = new Date(checkOut);
  while (cursor < end) {
    out.push(formatLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return out.length ? out : [checkIn];
}

/** Semaines calendrier (dim→dim) couvertes par un séjour. */
export function weeksSpannedByStay(checkIn, checkOut, season) {
  if (!checkIn || !checkOut) return [];
  return generateSundayWeeks(season).filter(w =>
    rangesOverlap(checkIn, checkOut, w.checkIn, w.checkOut),
  );
}

export function findAlternativeWeeks(db, checkIn, checkOut, season, limit = 6) {
  const allWeeks = generateSundayWeeks(season);
  const booked = getBookedRanges(db);
  const requested = new Date(checkIn);

  const available = allWeeks.filter(w => {
    if (rangesOverlap(checkIn, checkOut, w.checkIn, w.checkOut)) return false;
    return !booked.some(b => rangesOverlap(w.checkIn, w.checkOut, b.checkIn, b.checkOut));
  });

  available.sort((a, b) => {
    const da = Math.abs(new Date(a.checkIn) - requested);
    const db2 = Math.abs(new Date(b.checkIn) - requested);
    return da - db2;
  });

  return available.slice(0, limit).map(w => ({
    ...w,
    price: estimateWeeklyPrice(w.checkIn, season),
  }));
}

export function enrichWeekWithAvailability(db, week, season) {
  const availability = checkPeriodAvailability(db, week.checkIn, week.checkOut);
  return {
    ...week,
    availability: availability.status,
    availabilityLabel: availability.label,
    suggestedPrice: estimateWeeklyPrice(week.checkIn, season || computeSeasonFromDate(week.checkIn)),
    alternatives: availability.status === 'unavailable'
      ? findAlternativeWeeks(db, week.checkIn, week.checkOut, season || computeSeasonFromDate(week.checkIn))
      : findAlternativeWeeks(db, week.checkIn, week.checkOut, season || computeSeasonFromDate(week.checkIn), 4)
        .filter(w => w.checkIn !== week.checkIn),
  };
}

function computeSeasonFromDate(checkIn) {
  const y = parseInt(checkIn.slice(0, 4), 10);
  const m = parseInt(checkIn.slice(5, 7), 10);
  if (m >= 12) return `${y}-${y + 1}`;
  if (m <= 4) return `${y - 1}-${y}`;
  return `${y}-${y + 1}`;
}
