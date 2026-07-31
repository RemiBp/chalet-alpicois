import type {
  Contact, Email, DashboardStats, StayRecord, AutoReply, AutoReplyRule,
  ContactInteraction, DocumentFormOverrides, DocumentGenerateType,
} from './types';
import { apiAuthFetch, getAdminToken } from './lib/adminSession';
import { displayContactName } from './lib/formatName';
import {
  peekContactsCache, setContactsCache, isContactsCacheFresh, invalidateContactsCache,
} from './lib/contactsCache';

const DATA_BASE = `${import.meta.env.BASE_URL}data/`;
const API_BASE = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

async function apiFetch<T>(url: string, retries = 2): Promise<T> {
  let lastErr: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const token = getAdminToken();
      const res = await fetch(url, {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const err = new Error(`API ${res.status}`);
        (err as Error & { status: number }).status = res.status;
        throw err;
      }
      lastDataSource = 'live';
      return res.json();
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (i < retries) await new Promise(r => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr ?? new Error('API fetch failed');
}

export function markDataSourceLive() {
  lastDataSource = 'live';
}

async function staticFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${DATA_BASE}${path}`);
  if (!res.ok) throw new Error(`Static data ${res.status}`);
  return res.json();
}

/** Ne propage jamais d'erreur — repli statique silencieux. */
let lastDataSource: 'live' | 'static' = 'live';

export function getLastDataSource(): 'live' | 'static' {
  return lastDataSource;
}

async function readData<T>(staticPath: string, apiUrl: string): Promise<T> {
  try {
    lastDataSource = 'live';
    return await apiFetch<T>(apiUrl);
  } catch {
    if (import.meta.env.PROD) throw new Error(`API indisponible pour ${apiUrl}`);
    lastDataSource = 'static';
    return staticFetch<T>(staticPath);
  }
}

function withFormattedName(contact: Contact): Contact {
  return { ...contact, displayName: displayContactName(contact) };
}

let contactsInflight: Promise<Contact[]> | null = null;

async function fetchContactsFromApi(lite = true): Promise<Contact[]> {
  const q = lite ? '?lite=1' : '';
  const data = await apiFetch<Contact[]>(`${API_BASE}/contacts${q}`);
  return data.map(withFormattedName);
}

async function fetchContactsStatic(): Promise<Contact[]> {
  const data = await staticFetch<Contact[]>('contacts.json');
  return data.map(withFormattedName);
}

async function revalidateContacts(): Promise<Contact[]> {
  try {
    const fresh = await fetchContactsFromApi(true);
    setContactsCache(fresh);
    return fresh;
  } catch {
    try {
      const fresh = await fetchContactsStatic();
      setContactsCache(fresh);
      return fresh;
    } catch {
      return peekContactsCache();
    }
  }
}

export interface FetchContactsOptions {
  /** Appelé dès qu'une version (cache ou réseau) est disponible */
  onUpdate?: (contacts: Contact[]) => void;
  /** Force un refresh réseau même si le cache est frais */
  force?: boolean;
}

/** Cache mémoire + sessionStorage, static en secours, revalidation API en arrière-plan. */
export async function fetchContacts(options: FetchContactsOptions = {}): Promise<Contact[]> {
  const { onUpdate, force = false } = options;
  const cached = peekContactsCache();

  if (cached.length && !force) {
    onUpdate?.(cached);
    if (!isContactsCacheFresh()) {
      if (!contactsInflight) {
        contactsInflight = revalidateContacts()
          .then(fresh => {
            onUpdate?.(fresh);
            return fresh;
          })
          .finally(() => { contactsInflight = null; });
      } else {
        contactsInflight.then(onUpdate ?? (() => {})).catch(() => {});
      }
    }
    return cached;
  }

  if (contactsInflight && !force) {
    return contactsInflight.then(data => {
      onUpdate?.(data);
      return data;
    });
  }

  contactsInflight = (async () => {
    try {
      const fresh = await fetchContactsFromApi(true);
      setContactsCache(fresh);
      onUpdate?.(fresh);
      return fresh;
    } catch {
      try {
        const fromStatic = await fetchContactsStatic();
        setContactsCache(fromStatic);
        onUpdate?.(fromStatic);
        revalidateContacts().then(onUpdate ?? (() => {})).catch(() => {});
        return fromStatic;
      } catch {
        return cached;
      }
    }
  })().finally(() => { contactsInflight = null; });

  return contactsInflight;
}

/** Précharge la liste (dashboard / au démarrage). */
export function prefetchContacts(): void {
  if (peekContactsCache().length && isContactsCacheFresh()) return;
  fetchContacts().catch(() => {});
}

// ─── EMAILS ───────────────────────────────────

export async function fetchEmails(): Promise<Email[]> {
  try {
    return await apiFetch<Email[]>(`${API_BASE}/emails`);
  } catch {
    const byContact = await staticFetch<Record<string, Email[]>>('emails.json');
    return Object.values(byContact).flat().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }
}

export async function fetchContactEmails(contactId: string): Promise<Email[]> {
  try {
    return await apiFetch<Email[]>(`${API_BASE}/contacts/${contactId}/emails`);
  } catch {
    const byContact = await staticFetch<Record<string, Email[]>>('emails.json');
    return byContact[contactId] || [];
  }
}

export async function fetchEmailThread(threadId: string): Promise<Email[]> {
  try {
    return await apiFetch<Email[]>(`${API_BASE}/emails?threadId=${encodeURIComponent(threadId)}`);
  } catch {
    const all = await fetchEmails();
    return all.filter(e => e.threadId === threadId || e.subject?.includes(threadId));
  }
}

export async function fetchChaletConfig() {
  return apiFetch<Record<string, unknown>>(`${API_BASE}/chalet`);
}

// ─── CONTACTS (détail) ─────────────────────────

export async function fetchContactById(id: string): Promise<Contact | null> {
  try {
    const contact = await apiFetch<Contact>(`${API_BASE}/contacts/${id}`);
    return withFormattedName(contact);
  } catch {
    const details = await staticFetch<Record<string, Contact>>('details.json');
    const contact = details[id] || null;
    return contact ? withFormattedName(contact) : null;
  }
}

export async function createContact(contact: Partial<Contact>): Promise<Contact> {
  const res = await apiAuthFetch(`${API_BASE}/contacts`, {
    method: 'POST',
    body: JSON.stringify(contact),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `Création impossible (${res.status})`);
  }
  invalidateContactsCache();
  return res.json();
}

export async function updateContact(id: string, data: Partial<Contact>): Promise<{ ok: boolean; contact?: Contact; error?: string }> {
  if (!getAdminToken()) return { ok: false, error: 'Mode admin requis' };
  try {
    const res = await apiAuthFetch(`${API_BASE}/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => ({})) as { success?: boolean; contact?: Contact; error?: string };
    if (res.ok) {
      invalidateContactsCache();
      return { ok: true, contact: json.contact ? withFormattedName(json.contact) : undefined };
    }
    return { ok: false, error: json.error || `Erreur ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur réseau' };
  }
}

// ─── STAYS ────────────────────────────────────

export async function fetchStays(): Promise<StayRecord[]> {
  try {
    return await apiFetch<StayRecord[]>(`${API_BASE}/stays`);
  } catch {
    return [];
  }
}

export async function createStay(stay: Partial<StayRecord>): Promise<boolean> {
  if (!getAdminToken()) return false;
  try {
    const res = await apiAuthFetch(`${API_BASE}/stays`, {
      method: 'POST',
      body: JSON.stringify(stay),
    });
    return res.ok;
  } catch { return false; }
}

export async function updateStay(id: string, data: Partial<StayRecord>): Promise<boolean> {
  if (!getAdminToken()) return false;
  try {
    const res = await apiAuthFetch(`${API_BASE}/stays/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch { return false; }
}

export async function deleteStay(id: string): Promise<boolean> {
  if (!getAdminToken()) return false;
  try {
    const res = await apiAuthFetch(`${API_BASE}/stays/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch { return false; }
}

// ─── INTERACTIONS ──────────────────────────────────

export async function fetchInteractions(contactId: string): Promise<ContactInteraction[]> {
  return apiFetch<ContactInteraction[]>(`${API_BASE}/contacts/${contactId}/interactions`);
}

export async function createInteraction(contactId: string, data: Partial<ContactInteraction>): Promise<ContactInteraction> {
  const res = await apiAuthFetch(`${API_BASE}/contacts/${contactId}/interactions`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function updateInteraction(id: string, data: Partial<ContactInteraction>): Promise<boolean> {
  if (!getAdminToken()) return false;
  try {
    const res = await apiAuthFetch(`${API_BASE}/interactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch { return false; }
}

export async function deleteInteraction(id: string): Promise<boolean> {
  if (!getAdminToken()) return false;
  try {
    const res = await apiAuthFetch(`${API_BASE}/interactions/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch { return false; }
}

// ─── STATS ────────────────────────────────────

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return readData<DashboardStats>('stats.json', `${API_BASE}/stats`);
}

export interface ApiHealth {
  ok: boolean;
  adminConfigured: boolean;
  blob: boolean;
  vercel: boolean;
  blobKey?: string;
  deepseek?: boolean;
}

export interface StaticDataMeta {
  exportedAt: string;
  contactCount: number;
  emailCount: number;
}

export async function fetchStaticDataMeta(): Promise<StaticDataMeta | null> {
  try {
    return await staticFetch<StaticDataMeta>('meta.json');
  } catch {
    return null;
  }
}

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  contactId: string;
  actor: 'automatic' | 'gilles' | 'claire';
  payload: Record<string, unknown>;
  validationStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export async function fetchAuditLog(
  limit = 50,
  source?: 'automatic' | 'gilles' | 'claire',
  pendingOnly = false,
): Promise<{ entries: AuditEntry[]; pendingCount: number }> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (source) q.set('source', source);
  if (pendingOnly) q.set('pending', '1');
  const res = await apiAuthFetch(`${API_BASE}/audit?${q}`);
  if (!res.ok) throw new Error(`Audit ${res.status}`);
  const data = await res.json() as { entries: AuditEntry[]; pendingCount?: number };
  return { entries: data.entries, pendingCount: data.pendingCount ?? 0 };
}

export async function resolveAuditProposals(
  decisions: Array<{ id: string; approved: boolean }>,
): Promise<{ ok: boolean; pendingCount: number }> {
  const res = await apiAuthFetch(`${API_BASE}/audit/resolve`, {
    method: 'POST',
    body: JSON.stringify({ decisions }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error || `Resolve ${res.status}`);
  const data = await res.json() as { ok: boolean; pendingCount: number };
  invalidateContactsCache();
  return data;
}

/** Bulk-dismiss soft "mail to qualify" proposals (keeps concrete stay/contact updates). */
export async function rejectAllMailReviewProposals(): Promise<{ ok: boolean; pendingCount: number; rejected: number }> {
  const res = await apiAuthFetch(`${API_BASE}/audit/resolve`, {
    method: 'POST',
    body: JSON.stringify({ rejectField: 'mailReview' }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error || `Reject mail reviews ${res.status}`);
  const data = await res.json() as { ok: boolean; pendingCount: number; rejected?: number };
  invalidateContactsCache();
  return { ok: data.ok, pendingCount: data.pendingCount ?? 0, rejected: data.rejected ?? 0 };
}

export interface AutoResolveAuditResult {
  ok: boolean;
  total: number;
  approved: number;
  archivedReviews: number;
  rejectedDuplicates: number;
  rejectedInvalid: number;
  alreadyApplied: number;
  heldConflicts: number;
  pendingCount: number;
}

/** Safely process every pending proposal while preserving ambiguous conflicts. */
export async function autoResolveAllAuditProposals(): Promise<AutoResolveAuditResult> {
  const res = await apiAuthFetch(`${API_BASE}/audit/resolve`, {
    method: 'POST',
    body: JSON.stringify({ autoResolveAll: true }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error || `Auto-resolve ${res.status}`);
  const data = await res.json() as AutoResolveAuditResult;
  invalidateContactsCache();
  return data;
}

// ─── MAIL TEMPLATES & SUIVI ─────────────────────

export interface MailTemplateContent {
  subject: string;
  body: string;
  isCustom: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface MailTemplate {
  key: string;
  order: number;
  labelFr: string;
  labelEn: string;
  fr: MailTemplateContent;
  en: MailTemplateContent;
}

export interface MailTrackingStep {
  templateKey: string;
  order: number;
  labelFr: string;
  labelEn: string;
  lang: string;
  status: 'pending' | 'sent' | 'skipped';
  sentAt: string;
  notes: string;
  updatedBy: string;
}

export async function fetchMailTemplates(): Promise<MailTemplate[]> {
  const res = await apiFetch<{ templates: MailTemplate[] }>(`${API_BASE}/mail/templates`);
  return res.templates;
}

export async function updateMailTemplate(key: string, lang: 'fr' | 'en', subject: string, body: string): Promise<MailTemplate[]> {
  const res = await apiAuthFetch(`${API_BASE}/mail/templates/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ lang, subject, body }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error || `Template ${res.status}`);
  const data = await res.json() as { templates: MailTemplate[] };
  return data.templates;
}

export async function resetMailTemplate(key: string, lang: 'fr' | 'en'): Promise<MailTemplate[]> {
  const res = await apiAuthFetch(`${API_BASE}/mail/templates/${encodeURIComponent(key)}/reset`, {
    method: 'POST',
    body: JSON.stringify({ lang }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error || `Reset ${res.status}`);
  const data = await res.json() as { templates: MailTemplate[] };
  return data.templates;
}

export async function fetchContactMailTracking(contactId: string): Promise<MailTrackingStep[]> {
  const res = await apiFetch<{ tracking: MailTrackingStep[] }>(`${API_BASE}/mail/tracking/${encodeURIComponent(contactId)}`);
  return res.tracking;
}

export async function updateContactMailTracking(
  contactId: string,
  templateKey: string,
  data: { status: 'pending' | 'sent' | 'skipped'; lang?: 'fr' | 'en'; notes?: string },
): Promise<MailTrackingStep[]> {
  const res = await apiAuthFetch(`${API_BASE}/mail/tracking/${encodeURIComponent(contactId)}/${encodeURIComponent(templateKey)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error || `Tracking ${res.status}`);
  const json = await res.json() as { tracking: MailTrackingStep[] };
  return json.tracking;
}

export async function previewMailTemplate(
  contactId: string,
  templateKey: string,
  lang: 'fr' | 'en' = 'fr',
  opts?: { attachToThread?: boolean; replyToEmailId?: string | null },
): Promise<MailTemplatePreview> {
  if (!getAdminToken()) throw new Error('Mode admin requis — connectez-vous avec le mot de passe admin');
  const res = await apiAuthFetch(`${API_BASE}/mail/preview`, {
    method: 'POST',
    body: JSON.stringify({
      contactId,
      templateKey,
      lang,
      attachToThread: opts?.attachToThread,
      replyToEmailId: opts?.replyToEmailId,
    }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error || `Preview ${res.status}`);
  return res.json() as Promise<MailTemplatePreview>;
}

export interface MailThreadCandidate {
  id: string;
  messageId: string;
  subject: string;
  date: string;
  sender: string;
  mailbox: string;
  isInbox: boolean;
}

export interface MailTemplatePreview {
  subject: string;
  body: string;
  lang: 'fr' | 'en';
  templateKey: string;
  to: string;
  vars: Record<string, string>;
  attachToThread: boolean;
  replyToEmailId: string | null;
  threadCandidates: MailThreadCandidate[];
  from: string;
}

export async function createMailTemplateDraft(params: {
  contactId: string;
  templateKey: string;
  lang: 'fr' | 'en';
  subject: string;
  text: string;
  attachToThread?: boolean;
  replyToEmailId?: string | null;
  markSent?: boolean;
}): Promise<{ ok: boolean; to: string; subject: string; text: string; folder?: string; tracking?: MailTrackingStep[] }> {
  if (!getAdminToken()) throw new Error('Mode admin requis');
  const res = await apiAuthFetch(`${API_BASE}/mail/draft`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error || `Draft ${res.status}`);
  return res.json();
}

export async function persistDbToBlob(): Promise<{ ok: boolean; message?: string }> {
  const res = await apiAuthFetch(`${API_BASE}/admin/persist-db`, { method: 'POST' });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error || `Persist ${res.status}`);
  return res.json();
}

export interface DataDoubts {
  season: string;
  count: number;
  estimatedLines: Array<{
    id: string;
    contactName: string;
    contactId: string;
    checkIn: string;
    checkOut: string;
    amount: number;
    message: string;
  }>;
  aiIssues: Array<{
    id: string;
    contactName: string;
    message: string;
    db?: { checkIn?: string; checkOut?: string; price?: number };
    ai?: { checkIn?: string; checkOut?: string; priceEuros?: number; confidence?: string };
  }>;
  canReconcile: boolean;
}

export async function fetchDoubts(season = '2026-2027'): Promise<DataDoubts> {
  const res = await apiAuthFetch(`${API_BASE}/doubts?season=${encodeURIComponent(season)}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error || `Doubts ${res.status}`);
  return res.json();
}

export async function reconcileBookingsAi(dryRun = true): Promise<{ checked: number; fixed: number; issues: unknown[] }> {
  const res = await apiAuthFetch(`${API_BASE}/admin/reconcile-ai?dryRun=${dryRun ? '1' : '0'}`, {
    method: 'POST',
    body: JSON.stringify({ dryRun, limit: 20 }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error || `Reconcile ${res.status}`);
  return res.json();
}

export async function fetchApiHealth(): Promise<ApiHealth | null> {
  try {
    const health = await apiFetch<ApiHealth>(`${API_BASE}/health`);
    markDataSourceLive();
    return health;
  } catch {
    return null;
  }
}

// ─── CALENDAR & SIGNALS ───────────────────────

export interface CalendarEventEvidence {
  id: string;
  subject: string;
  date: string;
  senderName: string;
  mailbox?: string;
  signalLabel: string;
  bodyPreview: string;
  bodyText: string;
}

export interface StayProgress {
  id?: string;
  contactId?: string;
  checkIn?: string;
  checkOut?: string;
  contractNumber: string;
  contractSigned: boolean;
  depositInvoiceNumber: string;
  depositAmount: number;
  depositPaymentMethod?: string;
  depositPaid: boolean;
  balanceInvoiceNumber?: string;
  balanceAmount?: number;
  balancePaymentMethod?: string;
  balancePaid?: boolean;
  insuranceReceived: boolean;
  idReceived?: boolean;
  depositGuaranteePaid?: boolean;
  depositGuaranteeReturned?: boolean;
  mailSteps?: Record<string, string>;
  weekPrice?: number;
  complete?: boolean;
  filledCount?: number;
  requiredCount?: number;
}

export interface CalendarEvent {
  id: string;
  type: 'stay' | 'inquiry' | 'personal';
  contactId: string;
  contactName: string;
  contactEmail: string;
  checkIn: string;
  checkOut: string;
  status: string;
  label: string;
  blocksCalendar: boolean;
  personal?: boolean;
  season: string;
  price?: number;
  confirmationEmail?: CalendarEventEvidence;
  progress?: StayProgress;
}

export interface CalendarWeek {
  checkIn: string;
  checkOut: string;
  blocked: boolean;
  weekPrice?: number | null;
  events: CalendarEvent[];
}

export interface CalendarData {
  season: string;
  events: CalendarEvent[];
  weeks: CalendarWeek[];
  stats: {
    confirmed: number;
    negotiating: number;
    inquiries: number;
    personal?: number;
    totalWeeks?: number;
    bookedWeeks?: number;
    occupancyRate?: number;
  };
}

export interface FinanceLine {
  id: string;
  type: string;
  contactId: string;
  contactName: string;
  checkIn: string;
  checkOut: string;
  status: string;
  amount: number;
  label: string;
  category: 'collected' | 'confirmed' | 'forecast' | 'personal';
  personal: boolean;
  estimatedAmount?: boolean;
  weekCount?: number;
}

export interface FinanceSummary {
  season: string;
  collected: number;
  confirmedPending: number;
  forecast: number;
  totalPotential: number;
  personalWeeks: number;
  clientWeeks: number;
  totalSeasonWeeks: number;
  bookedWeeks: number;
  freeWeeks: number;
  occupancyRate: number;
  byCategory: { collected: number; confirmed: number; forecast: number; personal: number };
  byCategoryWeeks?: {
    collected: number;
    confirmed: number;
    forecast: number;
    personal: number;
    totalClient: number;
  };
  lines: FinanceLine[];
}

export async function fetchFinanceSummary(season = '2026-2027'): Promise<FinanceSummary> {
  const data = await apiFetch<FinanceSummary>(`${API_BASE}/finance?season=${encodeURIComponent(season)}`);
  return {
    ...data,
    lines: (data.lines || []).map(l => ({
      ...l,
      contactName: displayContactName({ name: l.contactName }),
    })),
  };
}

export async function fetchCalendar(season = '2026-2027', refresh = false): Promise<CalendarData | null> {
  try {
    const refreshQ = refresh ? '&refresh=1' : '';
    const data = await apiFetch<CalendarData>(`${API_BASE}/calendar?season=${encodeURIComponent(season)}${refreshQ}`);
    return {
      ...data,
      events: data.events.map(ev => ({
        ...ev,
        contactName: displayContactName({ name: ev.contactName, email: ev.contactEmail }),
      })),
      weeks: data.weeks.map(w => ({
        ...w,
        events: w.events.map(ev => ({
          ...ev,
          contactName: displayContactName({ name: ev.contactName, email: ev.contactEmail }),
        })),
      })),
    };
  } catch {
    return null;
  }
}

export interface RecentSignal {
  contactId: string;
  contactName: string;
  contactEmail?: string;
  label: string;
  type: string;
  strength?: number;
  confidence?: 'high' | 'medium' | 'low';
  emailDate: string;
  subject: string;
  emailId?: string;
}

export async function fetchRecentSignals(days = 45): Promise<RecentSignal[]> {
  try {
    const data = await apiFetch<{ signals: RecentSignal[] }>(`${API_BASE}/signals/recent?days=${days}`);
    return data.signals.map(s => ({
      ...s,
      contactName: displayContactName({ name: s.contactName, email: s.contactEmail }),
    }));
  } catch {
    return [];
  }
}

export interface RecentInboxEmail {
  id: string;
  date: string;
  subject: string;
  sender: string;
  senderName?: string;
  contactId?: string;
  contactName: string;
  bodyText?: string;
}

export async function fetchRecentInboxEmails(limit = 25): Promise<RecentInboxEmail[]> {
  try {
    return await apiFetch<RecentInboxEmail[]>(`${API_BASE}/emails/recent?limit=${limit}`);
  } catch {
    try {
      const all = await fetchEmails();
      return all
        .filter(e => e.isFromGuest && (e.folder === 'INBOX' || !e.folder?.includes('Sent')))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, limit)
        .map(e => ({
          id: e.id,
          date: e.date,
          subject: e.subject,
          sender: e.sender,
          senderName: e.senderName,
          contactName: e.senderName || e.sender,
          bodyText: e.bodyText,
        }));
    } catch {
      return [];
    }
  }
}

export interface ClientAnalysis {
  byNationality: {
    nationality: string;
    contacts: number;
    clients: number;
    former_clients: number;
    prospects: number;
    avg_price: number;
    total_revenue: number;
  }[];
  loyalty: {
    category: string;
    contacts: number;
    total_stays: number;
  }[];
  bySeason: {
    period: string;
    season: string;
    unique_clients: number;
    weeks: number;
    revenue: number;
  }[];
  topClients: {
    id: string;
    name: string;
    nationality: string;
    email: string;
    status: string;
    staysCount: number;
    totalPaid: number;
    lastStay: string;
  }[];
}

export async function fetchClientAnalysis(): Promise<ClientAnalysis> {
  return apiFetch<ClientAnalysis>(`${API_BASE}/client-analysis`);
}

// ─── AUTO REPLIES ─────────────────────────────

export async function fetchAutoReplies(): Promise<AutoReply[]> {
  return apiFetch<AutoReply[]>(`${API_BASE}/auto-replies`);
}

export async function approveReply(id: string): Promise<boolean> {
  if (!getAdminToken()) return false;
  try {
    const res = await apiAuthFetch(`${API_BASE}/auto-replies/${id}/approve`, { method: 'PUT' });
    return res.ok;
  } catch { return false; }
}

export async function sendReply(id: string): Promise<boolean> {
  if (!getAdminToken()) return false;
  try {
    const res = await apiAuthFetch(`${API_BASE}/auto-replies/${id}/send`, { method: 'PUT' });
    return res.ok;
  } catch { return false; }
}

export async function cancelReply(id: string): Promise<boolean> {
  if (!getAdminToken()) return false;
  try {
    const res = await apiAuthFetch(`${API_BASE}/auto-replies/${id}/cancel`, { method: 'PUT' });
    return res.ok;
  } catch { return false; }
}

export async function fetchAutoReplyRules(): Promise<AutoReplyRule[]> {
  return apiFetch<AutoReplyRule[]>(`${API_BASE}/auto-reply-rules`);
}

export async function createAutoReplyRule(rule: Partial<AutoReplyRule>): Promise<boolean> {
  if (!getAdminToken()) return false;
  try {
    const res = await apiAuthFetch(`${API_BASE}/auto-reply-rules`, {
      method: 'POST',
      body: JSON.stringify(rule),
    });
    return res.ok;
  } catch { return false; }
}

export async function toggleAutoReplyRule(id: string): Promise<boolean> {
  if (!getAdminToken()) return false;
  try {
    const res = await apiAuthFetch(`${API_BASE}/auto-reply-rules/${id}/toggle`, { method: 'PUT' });
    return res.ok;
  } catch { return false; }
}

export async function deleteAutoReplyRule(id: string): Promise<boolean> {
  if (!getAdminToken()) return false;
  try {
    const res = await apiAuthFetch(`${API_BASE}/auto-reply-rules/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch { return false; }
}

// ─── HELPERS ──────────────────────────────────

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ─── DOCUMENTS ────────────────────────────────

export async function previewDocuments(contactId: string, overrides: DocumentFormOverrides = {}) {
  const res = await fetch(`${API_BASE}/documents/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactId, overrides }),
  });
  if (!res.ok) throw new Error(`Preview ${res.status}`);
  return res.json() as Promise<{ fields: Record<string, string>; contact: { id: string; name: string; email: string } | null }>;
}

export async function downloadDocument(contactId: string, type: DocumentGenerateType, overrides: DocumentFormOverrides = {}) {
  const res = await apiAuthFetch(`${API_BASE}/documents/generate`, {
    method: 'POST',
    body: JSON.stringify({ contactId, type, overrides }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Génération ${res.status}`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || `document.${type === 'pack' ? 'zip' : 'docx'}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface DocumentDraftResult {
  ok: boolean;
  folder: string;
  uid: string | null;
  to: string;
  subject: string;
  from: string;
  text: string;
  attachmentName: string;
}

export interface DocumentEmailPreview {
  to: string;
  subject: string;
  text: string;
  attachmentName: string;
  from: string;
}

export async function previewDocumentFile(
  contactId: string,
  type: DocumentGenerateType,
  overrides: DocumentFormOverrides = {},
) {
  const res = await apiAuthFetch(`${API_BASE}/documents/preview-file`, {
    method: 'POST',
    body: JSON.stringify({ contactId, type, overrides }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Aperçu ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const note = res.headers.get('X-Preview-Note');
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return note;
}

export async function previewDocumentEmail(
  contactId: string,
  type: DocumentGenerateType,
  overrides: DocumentFormOverrides = {},
): Promise<DocumentEmailPreview> {
  const res = await apiAuthFetch(`${API_BASE}/documents/preview-email`, {
    method: 'POST',
    body: JSON.stringify({ contactId, type, overrides }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Aperçu mail ${res.status}`);
  }
  return res.json();
}

export async function prepareDocumentDraft(
  contactId: string,
  type: DocumentGenerateType,
  overrides: DocumentFormOverrides = {},
): Promise<DocumentDraftResult> {
  const res = await apiAuthFetch(`${API_BASE}/documents/draft-email`, {
    method: 'POST',
    body: JSON.stringify({ contactId, type, overrides }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Brouillon ${res.status}`);
  }
  return res.json();
}

// ─── INQUIRY / DISPONIBILITÉ ──────────────────

export interface SyncInquiryResult {
  synced: boolean;
  extracted: { checkIn: string; checkOut: string; adults?: number } | null;
  weeks: import('./types').RequestedWeek[];
}

export async function fetchContactInquiries(contactId: string): Promise<SyncInquiryResult> {
  try {
    return await apiFetch<SyncInquiryResult>(`${API_BASE}/contacts/${contactId}/inquiries`);
  } catch {
    return { synced: false, extracted: null, weeks: [] };
  }
}

export async function syncContactInquiry(contactId: string): Promise<SyncInquiryResult> {
  const res = await apiAuthFetch(`${API_BASE}/contacts/${contactId}/sync-inquiry`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Sync inquiry ${res.status}`);
  }
  return res.json();
}

export interface InquiryDraftResult {
  ok: boolean;
  to: string;
  subject: string;
  folder: string;
  price?: number;
}

export async function prepareInquiryDraft(
  contactId: string,
  body: {
    type: 'available' | 'alternative';
    checkIn: string;
    checkOut: string;
    price?: number;
    adults?: number;
    lang?: 'fr' | 'en';
    alternativeWeeks?: { checkIn: string; checkOut: string; price: number }[];
  },
): Promise<InquiryDraftResult> {
  const res = await apiAuthFetch(`${API_BASE}/contacts/${contactId}/inquiry-draft`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Brouillon inquiry ${res.status}`);
  }
  return res.json();
}

export interface InquiryEmailPreview {
  fr: { subject: string; text: string };
  en: { subject: string; text: string };
  suggestedLang: 'fr' | 'en';
  primary: { subject: string; text: string; lang: string };
  price?: number;
}

export async function previewInquiryEmail(
  contactId: string,
  body: {
    type: 'available' | 'alternative';
    checkIn: string;
    checkOut: string;
    price?: number;
    adults?: number;
    lang?: 'fr' | 'en';
    alternativeWeeks?: { checkIn: string; checkOut: string; price: number }[];
  },
): Promise<InquiryEmailPreview> {
  const res = await apiAuthFetch(`${API_BASE}/contacts/${contactId}/inquiry-preview`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Preview inquiry ${res.status}`);
  }
  return res.json();
}

export interface RefreshReport {
  ok: boolean;
  imap?: { totalSynced?: number; skipped?: boolean; error?: string };
  link?: { linked?: number; created?: number };
  profiles?: { contacts?: number; filledNationality?: number; fixedNames?: number; filledCoords?: number };
  signals?: { recordsUpdated?: number };
  proposals?: { proposalsCreated?: number };
  pendingCount?: number;
  durationMs?: number;
  reusedInFlight?: boolean;
}

export interface StoredRefreshState {
  status: 'running' | 'complete' | 'error';
  startedAt: number;
  completedAt?: number;
  handledAt?: number;
  skipImap?: boolean;
  report?: RefreshReport;
  error?: string;
}

let refreshInflight: Promise<RefreshReport> | null = null;
const REFRESH_STATE_KEY = 'alpicois-refresh-state';
const REFRESH_TIMEOUT_MS = 70000;
const REFRESH_STALE_MS = 120000;

function readStoredRefreshState(): StoredRefreshState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(REFRESH_STATE_KEY);
    return raw ? JSON.parse(raw) as StoredRefreshState : null;
  } catch {
    return null;
  }
}

function writeStoredRefreshState(state: StoredRefreshState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(REFRESH_STATE_KEY, JSON.stringify(state));
  } catch {
    // The in-memory event path still works if storage is unavailable.
  }
}

export function readRefreshState(): StoredRefreshState | null {
  const state = readStoredRefreshState();
  if (!state) return null;
  if (state.status === 'running' && Date.now() - state.startedAt > REFRESH_STALE_MS) {
    const stale: StoredRefreshState = {
      ...state,
      status: 'error',
      completedAt: Date.now(),
      error: 'Synchronisation interrompue ou expirée — relancez une sync des derniers mails.',
    };
    writeStoredRefreshState(stale);
    return stale;
  }
  return state;
}

export function markRefreshStateHandled(): void {
  const state = readStoredRefreshState();
  if (!state || state.handledAt) return;
  writeStoredRefreshState({ ...state, handledAt: Date.now() });
}

function emitRefreshEvent(name: 'start' | 'complete' | 'error', detail?: unknown) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(`alpicois-sync-${name}`, { detail }));
}

async function runDataRefresh(skipImap: boolean): Promise<RefreshReport> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await apiAuthFetch(`${API_BASE}/cron/refresh`, {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({
        skipImap,
        fullSync: false,
        skipAi: true,
        quick: true,
        maxMessagesPerMailbox: 25,
      }),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Synchronisation expirée — relancez une sync des derniers mails.', { cause: err });
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Refresh ${res.status}`);
  }
  invalidateContactsCache();
  const report = await res.json() as RefreshReport;
  writeStoredRefreshState({
    ...(readStoredRefreshState() || { startedAt: Date.now(), skipImap }),
    status: 'complete',
    completedAt: Date.now(),
    report,
  });
  emitRefreshEvent('complete', report);
  return report;
}

export async function triggerDataRefresh(skipImap = false): Promise<RefreshReport> {
  if (refreshInflight) return refreshInflight;
  writeStoredRefreshState({ status: 'running', startedAt: Date.now(), skipImap });
  emitRefreshEvent('start', { skipImap });
  const request: Promise<RefreshReport> = runDataRefresh(skipImap).catch(err => {
    const message = err instanceof Error ? err.message : String(err);
    writeStoredRefreshState({
      ...(readStoredRefreshState() || { startedAt: Date.now(), skipImap }),
      status: 'error',
      completedAt: Date.now(),
      error: message,
    });
    emitRefreshEvent('error', message);
    throw err;
  }).finally(() => {
    refreshInflight = null;
  });
  refreshInflight = request;
  return request;
}

export async function updateRequestedWeek(
  weekId: string,
  data: { status: 'asked' | 'negotiating' | 'booked' | 'abandoned' | 'cancelled'; notes?: string; price?: number },
): Promise<{ ok: boolean }> {
  const res = await apiAuthFetch(`${API_BASE}/requested-weeks/${weekId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Update week ${res.status}`);
  }
  invalidateContactsCache();
  return res.json();
}

export async function assignWeekToContact(data: {
  contactId: string;
  checkIn: string;
  checkOut: string;
  adults?: number;
  children?: number;
  status?: 'asked' | 'negotiating' | 'booked';
  notes?: string;
  price?: number;
}): Promise<{ ok: boolean; weekId?: string }> {
  const res = await apiAuthFetch(`${API_BASE}/requested-weeks`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Assign week ${res.status}`);
  }
  invalidateContactsCache();
  return res.json();
}

export async function updateCalendarEvent(
  eventId: string,
  data: { status?: string; price?: number; notes?: string },
): Promise<{ ok: boolean }> {
  const res = await apiAuthFetch(`${API_BASE}/calendar/events`, {
    method: 'PATCH',
    body: JSON.stringify({ eventId, ...data }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Update event ${res.status}`);
  }
  invalidateContactsCache();
  return res.json();
}

export async function removeCalendarEvent(eventId: string): Promise<{ ok: boolean }> {
  const res = await apiAuthFetch(`${API_BASE}/calendar/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Remove event ${res.status}`);
  }
  invalidateContactsCache();
  return res.json();
}

export async function updateStayProgress(
  contactId: string,
  checkIn: string,
  checkOut: string,
  patch: Partial<StayProgress>,
): Promise<{ ok: boolean; progress: StayProgress }> {
  const res = await apiAuthFetch(`${API_BASE}/contacts/${contactId}/stay-progress`, {
    method: 'PUT',
    body: JSON.stringify({ checkIn, checkOut, patch }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Progress ${res.status}`);
  }
  invalidateContactsCache();
  return res.json();
}

export async function mergeContacts(sourceId: string, targetId: string): Promise<{ ok: boolean; targetId?: string }> {
  const res = await apiAuthFetch(`${API_BASE}/contacts/${sourceId}/merge`, {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Merge ${res.status}`);
  }
  invalidateContactsCache();
  return res.json();
}

export async function extractContactProfile(contactId: string): Promise<Contact | null> {
  const res = await apiAuthFetch(`${API_BASE}/contacts/${contactId}/extract-profile`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Extract ${res.status}`);
  }
  invalidateContactsCache();
  const data = await res.json();
  return (data as { contact?: Contact }).contact || null;
}
