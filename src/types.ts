export type ContactOrigin = 'email' | 'whatsapp' | 'phone' | 'website' | 'recommendation' | 'social' | 'other';
export type ContactStatus = 'prospect' | 'client' | 'former_client';
export type StayStatus = 'pending' | 'confirmed' | 'paid' | 'cancelled' | 'no_show';

export interface Email {
  id: string;
  messageId: string;
  sender: string;
  senderName: string;
  recipients: string;
  date: string;
  subject: string;
  bodyText: string;
  isFromGuest: boolean;
  threadId: string | null;
  folder: string;
}

export interface StayRecord {
  id: string;
  contactId: string;
  season: string;            // "2024-2025", "2025-2026", etc.
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  priceQuoted: number;
  priceConfirmed: number;
  status: StayStatus;
  sourceEmailId: string;
  notes: string;
}

export interface Contact {
  id: string;
  // Identité
  name: string;
  email: string;
  phone: string;
  alternatePhones: string[];

  // Origine du contact
  origin: ContactOrigin;
  originDetail: string;       // "Via WhatsApp", "Site web dealyse.com", "Recommandation des Martin"

  // Statut
  status: ContactStatus;
  firstContactDate: string;   // Date ISO
  lastContactDate: string;

  // Historique des séjours (plusieurs années)
  stays: StayRecord[];
  totalStays: number;

  // Pour les prospects : quelles semaines demandées
  requestedWeeks: RequestedWeek[];

  // Notes libres
  notes: string;

  // Date de création/modification locale
  createdAt: string;
  updatedAt: string;
}

export interface RequestedWeek {
  id: string;
  season: string;          // "2025-2026"
  weekNumber: number;      // Semaine calendaire ISO
  checkIn: string;         // Date d'arrivée demandée
  checkOut: string;        // Date de départ demandée
  adults: number;
  children: number;
  status: 'asked' | 'negotiating' | 'abandoned' | 'booked';
  notes: string;
}

export interface SeasonSummary {
  season: string;           // "2024-2025"
  label: string;           // "Hiver 2024-2025"
  totalStays: number;
  totalRevenue: number;
  occupancyWeeks: number;  // Nombre de semaines réservées
  contactsCount: number;
  newContacts: number;
}

export interface DashboardStats {
  currentSeason: string;
  totalContacts: number;
  prospects: number;
  clients: number;
  formerClients: number;
  totalStays: number;
  totalRevenue: number;
  averagePrice: number;
  occupancyRate: number;
  upcomingStays: number;
  newInquiries: number;
  seasons: SeasonSummary[];
}

export type ViewType = 'dashboard' | 'calendar' | 'contacts' | 'contact-detail' | 'prospects' | 'emails' | 'settings';
