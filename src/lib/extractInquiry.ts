/** Extraction légère côté client (affichage immédiat si API indisponible). */

const MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, décembre: 12,
};

function stripAccents(s: string) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function inferYear(month: number, refIso?: string) {
  const ref = refIso ? new Date(refIso) : new Date();
  let year = ref.getFullYear();
  const refMonth = ref.getMonth() + 1;
  if (month >= 1 && month <= 4 && refMonth >= 5) year += 1;
  if (month === 12 && refMonth >= 1 && refMonth <= 4) year -= 1;
  return year;
}

export function extractInquiryFromText(bodyText: string, refDate?: string) {
  const text = (bodyText || '').replace(/\s+/g, ' ').trim();
  const m = text.match(
    /(?:du?\s*)?(\d{1,2})\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)(?:\s+(\d{4}))?\s*(?:au|à|-)\s*(\d{1,2})\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)(?:\s+(\d{4}))?/i,
  );
  if (!m) return null;

  const month1 = MONTHS[stripAccents(m[2])];
  const month2 = MONTHS[stripAccents(m[5])];
  if (!month1 || !month2) return null;

  const y = m[3] || m[6] ? parseInt(m[3] || m[6], 10) : inferYear(month1, refDate);
  const pad = (n: number) => String(n).padStart(2, '0');
  const checkIn = `${y}-${pad(month1)}-${pad(parseInt(m[1], 10))}`;
  const checkOut = `${y}-${pad(month2)}-${pad(parseInt(m[4], 10))}`;

  if (checkOut <= checkIn) return null;

  const persons = text.match(/(\d+)\s*personnes?/i);
  return {
    checkIn,
    checkOut,
    adults: persons ? parseInt(persons[1], 10) : undefined,
  };
}
