/**
 * Extraction heuristique des dates / groupe depuis les emails clients.
 */

const MONTHS = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

function stripAccents(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function monthNum(name) {
  return MONTHS[stripAccents(name)] || null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toIso(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function inferYear(month, refIso, explicitYear) {
  if (explicitYear) return explicitYear;
  const ref = refIso ? new Date(refIso) : new Date();
  let year = ref.getFullYear();
  const refMonth = ref.getMonth() + 1;
  if (month >= 1 && month <= 4 && refMonth >= 5) year += 1;
  if (month === 12 && refMonth >= 1 && refMonth <= 4) year -= 1;
  return year;
}

function parseDayMonth(dayStr, monthName, yearStr, refIso) {
  const day = parseInt(dayStr, 10);
  const month = monthNum(monthName);
  if (!day || !month) return null;
  const year = inferYear(month, refIso, yearStr ? parseInt(yearStr, 10) : null);
  return toIso(year, month, day);
}

function addDays(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffNights(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function cleanBody(text) {
  return (text || '')
    .replace(/^(>.*\n?)+/gm, '')
    .replace(/--[\s\S]*?--/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeQuotedPrintable(text) {
  const cleaned = (text || '').replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '=' && /^[0-9A-F]{2}/i.test(cleaned.slice(i + 1, i + 3))) {
      bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(cleaned.charCodeAt(i) & 0xff);
    }
  }
  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch {
    return cleaned;
  }
}

function normalizeText(text) {
  const decoded = decodeQuotedPrintable(text || '');
  return decoded
    .replace(/Content-Type:[^\n]*\n/gi, ' ')
    .replace(/Content-Transfer-Encoding:[^\n]*\n/gi, ' ')
    .replace(/^--[A-Za-z0-9-]+$/gm, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MONTH_PATTERN = 'janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre';

function parsePersonCount(text) {
  const personsMatch = text.match(/(\d+)\s*personnes?/i);
  const adultsMatch = text.match(/(\d+)\s*adultes?/i);
  return personsMatch ? parseInt(personsMatch[1], 10) : (adultsMatch ? parseInt(adultsMatch[1], 10) : undefined);
}

function buildResult(checkIn, checkOut, text, refDate) {
  if (!checkIn || !checkOut || checkOut <= checkIn) return null;
  return {
    checkIn,
    checkOut,
    nights: diffNights(checkIn, checkOut),
    adults: parsePersonCount(text),
    children: 0,
    notes: text.slice(0, 200),
  };
}

function tryExtractDates(text, refDate) {
  if (!text) return null;

  const results = [];

  function pushResult(checkIn, checkOut) {
    const r = buildResult(checkIn, checkOut, text, refDate);
    if (r) results.push(r);
  }

  const mCrossMonth = text.match(
    new RegExp(`(?:du?\\s*)?(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?\\s*(?:au|à|-)\\s*(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?`, 'i'),
  );
  if (mCrossMonth) {
    const y1 = mCrossMonth[3] || mCrossMonth[6];
    pushResult(
      parseDayMonth(mCrossMonth[1], mCrossMonth[2], y1, refDate),
      parseDayMonth(mCrossMonth[4], mCrossMonth[5], mCrossMonth[6] || y1, refDate),
    );
  }

  const mSameMonth = text.match(
    new RegExp(`du\\s+(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?\\s+au\\s+(\\d{1,2})(?:\\s+\\2)?(?:\\s+(\\d{4}))?`, 'i'),
  );
  if (mSameMonth) {
    const year = mSameMonth[3] || mSameMonth[5] || String(inferYear(monthNum(mSameMonth[2]), refDate));
    pushResult(
      parseDayMonth(mSameMonth[1], mSameMonth[2], year, refDate),
      parseDayMonth(mSameMonth[4], mSameMonth[2], year, refDate),
    );
  }

  const mDuAuMonth = text.match(
    new RegExp(`du\\s+(\\d{1,2})\\s+au\\s+(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?`, 'gi'),
  );
  if (mDuAuMonth) {
    for (const m of text.matchAll(new RegExp(`du\\s+(\\d{1,2})\\s+au\\s+(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?`, 'gi'))) {
      const year = m[4] ? parseInt(m[4], 10) : inferYear(monthNum(m[3]), refDate);
      pushResult(
        parseDayMonth(m[1], m[3], String(year), refDate),
        parseDayMonth(m[2], m[3], String(year), refDate),
      );
    }
  }

  const mSem = text.match(
    new RegExp(`semaine\\s+(?:du?\\s*)?(\\d{1,2})\\s+(?:au|à|-)\\s*(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?`, 'gi'),
  );
  if (mSem) {
    for (const m of text.matchAll(new RegExp(`semaine\\s+(?:du?\\s*)?(\\d{1,2})\\s+(?:au|à|-)\\s*(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?`, 'gi'))) {
      const year = m[4] ? parseInt(m[4], 10) : inferYear(monthNum(m[3]), refDate);
      pushResult(
        parseDayMonth(m[1], m[3], String(year), refDate),
        parseDayMonth(m[2], m[3], String(year), refDate),
      );
    }
  }

  const mDimCross = text.match(
    new RegExp(`(?:dimanche\\s+)?(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?\\s+au\\s+(?:dimanche\\s+)?(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?`, 'i'),
  );
  if (mDimCross) {
    const y1 = mDimCross[3] || mDimCross[6];
    pushResult(
      parseDayMonth(mDimCross[1], mDimCross[2], y1, refDate),
      parseDayMonth(mDimCross[4], mDimCross[5], mDimCross[6] || y1, refDate),
    );
  }

  const mDim = text.match(
    new RegExp(`(?:semaine\\s+(?:de\\s+)?(?:location\\s+)?(?:du\\s+)?)?(?:dimanche\\s+)?(\\d{1,2})\\s+au\\s+(?:dimanche\\s+)?(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?`, 'i'),
  );
  if (mDim) {
    const year = mDim[4] ? parseInt(mDim[4], 10) : inferYear(monthNum(mDim[3]), refDate);
    pushResult(
      parseDayMonth(mDim[1], mDim[3], String(year), refDate),
      parseDayMonth(mDim[2], mDim[3], String(year), refDate),
    );
  }

  if (/semaine\s+de\s+no[eë]l/i.test(text)) {
    const year = inferYear(12, refDate);
    pushResult(toIso(year, 12, 20), toIso(year, 12, 27));
  }

  const mReserve = text.match(
    new RegExp(`(?:r[eé]serv(?:e|ons)|chalet\\s+du)\\s+(?:du\\s+)?(?:dimanche\\s+)?(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?`, 'gi'),
  );
  if (mReserve) {
    for (const m of text.matchAll(new RegExp(`(?:r[eé]serv(?:e|ons)|chalet\\s+du)\\s+(?:du\\s+)?(?:dimanche\\s+)?(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?`, 'gi'))) {
      const year = m[3] ? parseInt(m[3], 10) : inferYear(monthNum(m[2]), refDate);
      const checkIn = parseDayMonth(m[1], m[2], String(year), refDate);
      pushResult(checkIn, addDays(checkIn, 7));
    }
  }

  const mSlash = text.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*(?:au|à|-)\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/i);
  if (mSlash) {
    pushResult(
      toIso(parseInt(mSlash[3], 10), parseInt(mSlash[2], 10), parseInt(mSlash[1], 10)),
      toIso(parseInt(mSlash[6], 10), parseInt(mSlash[5], 10), parseInt(mSlash[4], 10)),
    );
  }

  if (!results.length) return null;
  return results.sort((a, b) => (b.nights || 0) - (a.nights || 0))[0];
}

/** Essaie corps complet (citations incluses) puis corps nettoyé. */
export function extractInquiryBest(bodyText, refDate) {
  const raw = normalizeText(bodyText);
  if (!raw) return null;
  return tryExtractDates(raw, refDate) || tryExtractDates(cleanBody(bodyText), refDate);
}

export function extractInquiryLoose(bodyText, refDate) {
  return extractInquiryBest(bodyText, refDate);
}

export function extractInquiryFromText(bodyText, refDate) {
  return extractInquiryBest(bodyText, refDate);
}

export function extractInquiryFromEmails(emails) {
  const guestEmails = (emails || [])
    .filter(e => e.mailbox === 'INBOX' || e.folder === 'INBOX')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  for (const email of guestEmails) {
    const extracted = extractInquiryFromText(email.body_text || email.bodyText, email.date);
    if (extracted) {
      return {
        ...extracted,
        sourceEmailId: String(email.id),
        sourceDate: email.date,
      };
    }
  }
  return null;
}

export function computeSeason(checkIn) {
  if (!checkIn) return '';
  const y = parseInt(checkIn.slice(0, 4), 10);
  const m = parseInt(checkIn.slice(5, 7), 10);
  if (m >= 12) return `${y}-${y + 1}`;
  if (m <= 4) return `${y - 1}-${y}`;
  return `${y}-${y + 1}`;
}
