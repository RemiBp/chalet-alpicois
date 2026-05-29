/** Chalet info sourced from https://alpicois-laplagne.fr */

export interface SeasonPrice {
  season: string;
  label: string;
  highSeason: { min: number; typical: number; note: string };
  midSeason: { min: number; typical: number; note: string };
  lowSeason: { min: number; typical: number; note: string };
}

export const CHALET = {
  name: "Chalet L'Alpicois",
  location: 'La Plagne · Plagne Centre · 2050 m',
  website: 'https://alpicois-laplagne.fr',
  email: 'contact@alpicois-laplagne.fr',
  capacity: 10,
  surfaceM2: 130,
  bedrooms: 4,
  distancePistes: '200 m (3 min)',
  distanceCentre: '500 m (7 min)',
  domain: 'Paradiski',
  rentalFormula: {
    checkInDay: 'dimanche',
    checkOutDay: 'dimanche',
    cleaningIncluded: true,
    note: "Nouvelle formule hiver 2026-2027 : locations du dimanche au dimanche, ménage de fin de séjour inclus.",
  },
  amenities: [
    'Salon avec cheminée',
    '4 chambres avec salle d\'eau / WC',
    'Cuisine équipée',
    'Local ski privatif + sèche-chaussures',
    '2 terrasses',
    'Wifi · 4G',
    'Parking gratuit possible en face',
    'Lave-linge · Congélateur',
    'Agence partenaire locale',
  ],
  seasons: [
    {
      season: '2025-2026',
      label: 'Hiver 2025-2026',
      highSeason: { min: 3000, typical: 3800, note: 'Noël · Nouvel An · Février' },
      midSeason: { min: 2200, typical: 2800, note: 'Mars · Avril · Été' },
      lowSeason: { min: 1600, typical: 2200, note: 'Janvier · Hors vacances scolaires' },
    },
    {
      season: '2026-2027',
      label: 'Hiver 2026-2027',
      highSeason: { min: 3200, typical: 4000, note: 'Noël · Nouvel An · Février' },
      midSeason: { min: 2400, typical: 3000, note: 'Mars · Avril · Été' },
      lowSeason: { min: 1800, typical: 2400, note: 'Janvier · Hors vacances scolaires' },
    },
  ] satisfies SeasonPrice[],
} as const;

export function formatPrice(n: number): string {
  return n.toLocaleString('fr-FR') + ' €';
}
