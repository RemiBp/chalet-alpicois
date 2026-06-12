/**
 * Champs administratifs — préremplissage depuis contact / séjour.
 */

export const LANDLORD = {
  name: 'Barbier Gilles',
  address1: '7 rue Joanès',
  address2: '75014 Paris',
  country: 'France',
  phoneClaire: '06 32 65 65 64 (Claire)',
  phoneGilles: '06 74 82 91 76 (Gilles)',
  email: 'contact@alpicois-laplagne.fr',
  ribNote: 'Merci d\'indiquer votre nom et le numéro de facture en référence du virement.',
};

export const CHALET_ADMIN = {
  name: "Chalet L'Alpicois",
  address: '120 rue de la Forêt',
  city: '73210 La Plagne-Tarentaise',
  country: 'France',
  surfaceM2: 120,
  capacity: 10,
};

export const TOURIST_TAX_PER_ADULT_PER_NIGHT = 1.75;
export const DEPOSIT_RATE = 0.3;
export const BALANCE_RATE = 0.7;
export const BALANCE_DAYS_BEFORE = 60;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseDateParts(iso) {
  if (!iso) return { day: '', month: '', year: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: '', month: '', year: '' };
  return { day: pad2(d.getDate()), month: pad2(d.getMonth() + 1), year: String(d.getFullYear()) };
}

function fmtFr(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

function fmtFrSlash(iso) {
  const p = parseDateParts(iso);
  if (!p.day) return '';
  return `${p.day} / ${p.month} / ${p.year}`;
}

function addDays(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 7;
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  const n = Math.round((b - a) / 86400000);
  return n > 0 ? n : 7;
}

function seasonLabel(checkIn) {
  if (!checkIn) return '2026-2027';
  const y = new Date(checkIn).getFullYear();
  const m = new Date(checkIn).getMonth();
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function defaultDocSuffix(contactId) {
  const base = (contactId || '').slice(-4).toUpperCase().replace(/[^A-Z0-9]/g, '') || '01';
  return base.padStart(2, '0').slice(-2);
}

function pickPrice(contact, overrides) {
  if (overrides.weeklyRent) return Number(overrides.weeklyRent);
  const profile = contact?.profileJson || {};
  const prices = profile.pricesMentioned || [];
  if (prices.length) return Number(prices[prices.length - 1].amount) || 0;
  const weeks = contact?.requestedWeeks || [];
  if (weeks.length && weeks[0].notes?.match(/\d+/)) {
    const m = weeks[0].notes.match(/(\d[\d\s]*)\s*€/);
    if (m) return Number(m[1].replace(/\s/g, ''));
  }
  return 0;
}

function pickStayDates(contact, overrides) {
  if (overrides.checkIn && overrides.checkOut) {
    return { checkIn: overrides.checkIn, checkOut: overrides.checkOut };
  }
  const stay = (contact?.stays || []).find(s => s.status === 'confirmed' || s.status === 'paid');
  if (stay?.checkIn) return { checkIn: stay.checkIn, checkOut: stay.checkOut };
  const week = (contact?.requestedWeeks || []).find(w => w.status === 'booked' || w.status === 'negotiating');
  if (week?.checkIn) return { checkIn: week.checkIn, checkOut: week.checkOut };
  return { checkIn: '', checkOut: '' };
}

function pickCounts(contact, overrides) {
  const profile = contact?.profileJson || {};
  return {
    adults: Number(overrides.adults ?? profile.typicalAdults ?? 2) || 2,
    children: Number(overrides.children ?? profile.typicalChildren ?? 0) || 0,
  };
}

export function buildDocumentFields(contact, overrides = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const { checkIn, checkOut } = pickStayDates(contact, overrides);
  const { adults, children } = pickCounts(contact, overrides);
  const nights = Number(overrides.nights) || diffNights(checkIn, checkOut);
  const weeks = Number(overrides.weeks) || Math.max(1, Math.round(nights / 7));
  const weeklyRent = Number(overrides.weeklyRent) || pickPrice(contact, overrides);
  const rentalTotal = Number(overrides.rentalTotal) || weeklyRent * weeks;
  const taxAdults = Number(overrides.taxAdults ?? adults);
  const taxNights = Number(overrides.taxNights ?? nights);
  const touristTaxTotal = Number(overrides.touristTaxTotal)
    || Math.round(taxAdults * TOURIST_TAX_PER_ADULT_PER_NIGHT * taxNights * 100) / 100;
  const totalDue = Number(overrides.totalDue) || rentalTotal + touristTaxTotal;
  const deposit30 = Number(overrides.deposit30) || Math.round(rentalTotal * DEPOSIT_RATE * 100) / 100;
  const balance70 = Number(overrides.balance70) || Math.round((rentalTotal * BALANCE_RATE + touristTaxTotal) * 100) / 100;

  const season = seasonLabel(checkIn);
  const suffix = overrides.docSuffix || defaultDocSuffix(contact?.id);
  const contractNumberFixed = overrides.contractNumber || `ALP ${season.includes('2026') ? '2026/27' : season.replace('-', '/')}-${suffix}`;

  const contractDate = overrides.contractDate || today;
  const issueDate = overrides.issueDate || today;
  const depositDueDate = overrides.depositDueDate || contractDate;
  const balanceDueDate = overrides.balanceDueDate || (checkIn ? addDays(checkIn, -BALANCE_DAYS_BEFORE) : '');

  const ci = parseDateParts(checkIn);
  const co = parseDateParts(checkOut);
  const dd = parseDateParts(depositDueDate);
  const bd = parseDateParts(balanceDueDate);

  const tenantName = overrides.tenantName || contact?.name || '';
  const tenantAddress1 = overrides.tenantAddress1 || contact?.address || '';
  const tenantAddress2 = overrides.tenantAddress2 || [contact?.postalCode, contact?.country !== 'France' ? contact?.country : ''].filter(Boolean).join(' ') || '';
  const tenantAddress3 = overrides.tenantAddress3 || contact?.country || '';
  const tenantPostalCity = overrides.tenantPostalCity || [contact?.postalCode, contact?.address?.split(',').pop()?.trim()].filter(Boolean).join(' ') || tenantAddress2;

  const fields = {
    contractSuffix: suffix,
    contractDate: fmtFr(contractDate),
    contractNumber: contractNumberFixed,
    invoiceSuffix: suffix,
    issueDate: fmtFr(issueDate),
    tenantName,
    tenantAddress1,
    tenantAddress2,
    tenantAddress3,
    tenantPostalCity,
    tenantPhone: overrides.tenantPhone || contact?.phone || '',
    tenantEmail: overrides.tenantEmail || contact?.email || '',
    adults: String(adults),
    children: String(children),
    persons: String(adults + children),
    weeklyRent: weeklyRent ? weeklyRent.toLocaleString('fr-FR') : '',
    taxAdults: String(taxAdults),
    touristTaxTotal: touristTaxTotal ? touristTaxTotal.toLocaleString('fr-FR') : '',
    totalDue: totalDue ? totalDue.toLocaleString('fr-FR') : '',
    deposit30: deposit30 ? deposit30.toLocaleString('fr-FR') : '',
    balance70: balance70 ? balance70.toLocaleString('fr-FR') : '',
    tenantSignatureName: overrides.tenantSignatureName || tenantName,
    checkInDay: ci.day,
    checkInMonth: ci.month,
    checkInYear: ci.year,
    checkOutDay: co.day,
    checkOutMonth: co.month,
    checkOutYear: co.year,
    weeks: String(weeks),
    weeklyPrice: weeklyRent ? weeklyRent.toLocaleString('fr-FR') : '',
    rentalTotal: rentalTotal ? rentalTotal.toLocaleString('fr-FR') : '',
    taxNights: String(taxNights),
    depositDueDay: dd.day,
    depositDueMonth: dd.month,
    depositDueYear: dd.year,
    balanceDueDay: bd.day,
    balanceDueMonth: bd.month,
    balanceDueYear: bd.year,
    checkInFormatted: fmtFrSlash(checkIn),
    checkOutFormatted: fmtFrSlash(checkOut),
    checkIn,
    checkOut,
    nights,
    _raw: {
      weeklyRent, rentalTotal, touristTaxTotal, totalDue, deposit30, balance70,
    },
  };

  return fields;
}

export const CONTRACT_TAG_ORDER = [
  'contractSuffix', 'contractDate', 'tenantName', 'tenantAddress1', 'tenantAddress2', 'tenantAddress3',
  'tenantPhone', 'tenantEmail', 'adults', 'children', 'weeklyRent', 'taxAdults', 'touristTaxTotal',
  'totalDue', 'deposit30', 'balance70', 'tenantSignatureName',
];

export const INVOICE_TAG_ORDER = [
  'invoiceSuffix', 'issueDate', 'contractNumber', 'tenantName', 'tenantAddress1', 'tenantAddress2', 'tenantPostalCity',
  'checkInDay', 'checkInMonth', 'checkInYear', 'checkOutDay', 'checkOutMonth', 'checkOutYear',
  'weeks', 'persons', 'weeklyPrice', 'weeks', 'rentalTotal', 'touristTaxTotal',
  'taxAdults', 'taxNights', 'totalDue', 'deposit30', 'depositDueDay', 'depositDueMonth', 'depositDueYear',
  'balance70', 'balanceDueDay', 'balanceDueMonth', 'balanceDueYear',
];

export function listAutoFilledSources(contact) {
  const sources = {};
  if (contact?.name) sources.tenantName = 'contact';
  if (contact?.email) sources.tenantEmail = 'contact';
  if (contact?.phone) sources.tenantPhone = 'contact';
  if (contact?.address) sources.tenantAddress1 = 'contact';
  if (contact?.postalCode) sources.tenantAddress2 = 'contact';
  if (contact?.profileJson?.typicalAdults != null) sources.adults = 'profil';
  if (contact?.profileJson?.typicalChildren != null) sources.children = 'profil';
  if (contact?.profileJson?.pricesMentioned?.length) sources.weeklyRent = 'profil';
  if (contact?.requestedWeeks?.length) sources.checkIn = 'demande';
  return sources;
}
