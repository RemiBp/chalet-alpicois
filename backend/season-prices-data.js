/**
 * Tarifs 2026-2027 — source : Administratif formats/L'Alpicois - Tarifs 2026-2027.xlsx (feuille 1, col. J).
 */

export const SEASON_2026_2027_WEEKS = [
  { checkIn: '2026-12-06', checkOut: '2026-12-13', price: 3090 },
  { checkIn: '2026-12-13', checkOut: '2026-12-20', price: 3090 },
  { checkIn: '2026-12-20', checkOut: '2026-12-27', price: 5390, clientLabel: 'Famille Laffaure' },
  { checkIn: '2026-12-27', checkOut: '2027-01-03', price: 5690, clientLabel: 'Famille Grellet' },
  { checkIn: '2027-01-03', checkOut: '2027-01-10', price: 3090, clientLabel: 'Michaël Truijen' },
  { checkIn: '2027-01-10', checkOut: '2027-01-17', price: 3290 },
  { checkIn: '2027-01-17', checkOut: '2027-01-24', price: 3650, clientLabel: 'Michaël Truijen' },
  { checkIn: '2027-01-24', checkOut: '2027-01-31', price: 3850, clientLabel: 'Famille Panuel' },
  { checkIn: '2027-01-31', checkOut: '2027-02-07', price: 3990 },
  { checkIn: '2027-02-07', checkOut: '2027-02-14', price: 5690 },
  { checkIn: '2027-02-14', checkOut: '2027-02-21', price: 5690 },
  { checkIn: '2027-02-21', checkOut: '2027-02-28', price: 5690 },
  { checkIn: '2027-02-28', checkOut: '2027-03-07', price: 5690 },
  { checkIn: '2027-03-07', checkOut: '2027-03-14', price: 3890 },
  { checkIn: '2027-03-14', checkOut: '2027-03-21', price: 3390 },
  { checkIn: '2027-03-21', checkOut: '2027-03-28', price: 2990, clientLabel: 'Milon' },
  { checkIn: '2027-03-28', checkOut: '2027-04-04', price: 3390, clientLabel: 'Cunningham Jack' },
  { checkIn: '2027-04-04', checkOut: '2027-04-11', price: 3390 },
  { checkIn: '2027-04-11', checkOut: '2027-04-18', price: 2690 },
  { checkIn: '2027-04-18', checkOut: '2027-04-25', price: 2390 },
];

/** Données administratives Excel (contrats, acomptes, assurance). */
export const EXCEL_BOOKING_PROGRESS = [
  {
    checkIn: '2026-12-20', checkOut: '2026-12-27', clientLabel: 'Stéphanie Laffaure', clientMatch: /laffaure/i,
    contractNumber: '01', contractSigned: true, depositInvoiceNumber: '01',
    depositAmount: 1617, depositPaid: true, insuranceReceived: false, weekPrice: 5390,
  },
  {
    checkIn: '2026-12-27', checkOut: '2027-01-03', clientLabel: 'Famille Grellet', clientMatch: /grellet/i,
    contractNumber: '02', contractSigned: true, depositInvoiceNumber: '02',
    depositAmount: 1707, depositPaid: true, insuranceReceived: false, weekPrice: 5690,
  },
  {
    checkIn: '2027-01-03', checkOut: '2027-01-17', clientLabel: 'Michaël Truijen', clientMatch: /truijen/i,
    contractNumber: '03', contractSigned: true, depositInvoiceNumber: '05',
    depositAmount: 1914, depositPaid: true, insuranceReceived: true, weekPrice: 6380,
  },
  {
    checkIn: '2027-01-24', checkOut: '2027-01-31', clientLabel: 'Yves Panuel', clientMatch: /panuel/i,
    contractNumber: '04', contractSigned: true, depositInvoiceNumber: '03',
    depositAmount: 1155, depositPaid: true, insuranceReceived: true, weekPrice: 3850,
  },
  {
    checkIn: '2027-03-21', checkOut: '2027-03-28', clientLabel: 'Hervé Milon', clientMatch: /milon/i,
    contractNumber: '05', contractSigned: true, depositInvoiceNumber: '04',
    depositAmount: 897, depositPaid: true, insuranceReceived: false, weekPrice: 2990,
  },
  {
    checkIn: '2027-03-28', checkOut: '2027-04-04', clientLabel: 'Jack Cunningham', clientMatch: /cunningham|jack/i,
    contractNumber: '06', contractSigned: false, depositInvoiceNumber: '06',
    depositAmount: 1017, depositPaid: true, insuranceReceived: false, weekPrice: 3390,
  },
];

export function getWeekPrice(checkIn, season = '2026-2027') {
  if (season !== '2026-2027') return null;
  const hit = SEASON_2026_2027_WEEKS.find(w => w.checkIn === checkIn);
  return hit?.price ?? null;
}
