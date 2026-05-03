export type ContactOrigin = 'email' | 'whatsapp' | 'phone' | 'website' | 'recommendation' | 'social' | 'other';
export type ContactStatus = 'prospect' | 'client' | 'former_client';
export type StayStatus = 'pending' | 'confirmed' | 'paid' | 'cancelled' | 'no_show';
export type AutoReplyStatus = 'draft' | 'approved' | 'sent' | 'cancelled';
export type ReplyType = 'available' | 'alternative' | 'unavailable' | 'info' | 'no_reply';

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

export interface StayOptions {
  draps?: boolean;
  litsFaits?: boolean;
  assuranceAnnulation?: boolean;
}

export interface StayRecord {
  id: string;
  contactId: string;
  season: string;
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
  options: StayOptions;
  paymentMethod: string;
}

export interface Contact {
  id: string;
  name: string;
  firstName: string;
  email: string;
  alternateEmails: string[];
  phone: string;
  alternatePhones: string[];
  origin: ContactOrigin;
  originDetail: string;
  status: ContactStatus;
  nationality: string;
  address: string;
  postalCode: string;
  country: string;
  firstContactDate: string;
  lastContactDate: string;
  stays: StayRecord[];
  totalStays: number;
  requestedWeeks: RequestedWeek[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface RequestedWeek {
  id: string;
  season: string;
  weekNumber: number;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  status: 'asked' | 'negotiating' | 'abandoned' | 'booked';
  notes: string;
}

export interface ContactInteraction {
  id: string;
  contactId: string;
  date: string;
  type: ContactOrigin;
  subject: string;
  notes: string;
  createdAt: string;
}

export interface AutoReply {
  id: string;
  emailId: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  replyType: ReplyType;
  replySubject: string;
  replyBody: string;
  alternativeWeeks: AlternativeWeek[];
  status: AutoReplyStatus;
  createdAt: string;
  sentAt: string | null;
  originalEmail: Email | null;
}

export interface AlternativeWeek {
  checkIn: string;
  checkOut: string;
  price: number;
}

export interface AutoReplyRule {
  id: string;
  name: string;
  isActive: boolean;
  matchKeywords: string;
  minPrice: number;
  maxPrice: number;
  minNights: number;
  maxNights: number;
  replyTemplate: string;
}

export interface SeasonSummary {
  season: string;
  label: string;
  totalStays: number;
  totalRevenue: number;
  occupancyWeeks: number;
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
  emailsReceivedThisMonth: number;
  newInquiries: number;
  pendingReplies: number;
  seasons: SeasonSummary[];
}

export type ViewType = 'dashboard' | 'calendar' | 'contacts' | 'contact-detail' | 'prospects' | 'emails' | 'auto-reply' | 'settings' | 'client-analysis';
