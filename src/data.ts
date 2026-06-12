import type {
  Contact, Email, DashboardStats, StayRecord, AutoReply, AutoReplyRule,
  ContactInteraction, DocumentFormOverrides, DocumentGenerateType,
} from './types';

const STATIC_DATA = import.meta.env.PROD && !import.meta.env.VITE_API_URL;
const DATA_BASE = `${import.meta.env.BASE_URL}data/`;
const API_BASE = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

async function staticFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${DATA_BASE}${path}`);
  if (!res.ok) throw new Error(`Static data ${res.status}: ${res.statusText}`);
  return res.json();
}

// ─── EMAILS ───────────────────────────────────

export async function fetchEmails(): Promise<Email[]> {
  if (STATIC_DATA) {
    const byContact = await staticFetch<Record<string, Email[]>>('emails.json');
    return Object.values(byContact).flat().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }
  return apiFetch<Email[]>(`${API_BASE}/emails`);
}

export async function fetchContactEmails(contactId: string): Promise<Email[]> {
  if (STATIC_DATA) {
    const byContact = await staticFetch<Record<string, Email[]>>('emails.json');
    return byContact[contactId] || [];
  }
  return apiFetch<Email[]>(`${API_BASE}/contacts/${contactId}/emails`);
}

export async function fetchEmailThread(threadId: string): Promise<Email[]> {
  if (STATIC_DATA) {
    const all = await fetchEmails();
    return all.filter(e => e.threadId === threadId || e.subject?.includes(threadId));
  }
  return apiFetch<Email[]>(`${API_BASE}/emails?threadId=${encodeURIComponent(threadId)}`);
}

export async function fetchChaletConfig() {
  return apiFetch<Record<string, unknown>>(`${API_BASE}/chalet`);
}

// ─── CONTACTS ─────────────────────────────────

export async function fetchContacts(): Promise<Contact[]> {
  if (STATIC_DATA) return staticFetch<Contact[]>('contacts.json');
  return apiFetch<Contact[]>(`${API_BASE}/contacts`);
}

export async function fetchContactById(id: string): Promise<Contact | null> {
  if (STATIC_DATA) {
    const details = await staticFetch<Record<string, Contact>>('details.json');
    return details[id] || null;
  }
  try {
    return await apiFetch<Contact>(`${API_BASE}/contacts/${id}`);
  } catch {
    return null;
  }
}

export async function createContact(contact: Partial<Contact>): Promise<Contact> {
  if (STATIC_DATA) throw new Error('Lecture seule en production');
  const res = await fetch(`${API_BASE}/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contact),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function updateContact(id: string, data: Partial<Contact>): Promise<boolean> {
  if (STATIC_DATA) return false;
  try {
    const res = await fetch(`${API_BASE}/contacts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch { return false; }
}

// ─── STAYS ────────────────────────────────────

export async function fetchStays(): Promise<StayRecord[]> {
  return apiFetch<StayRecord[]>(`${API_BASE}/stays`);
}

export async function createStay(stay: Partial<StayRecord>): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/stays`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stay),
    });
    return res.ok;
  } catch { return false; }
}

export async function updateStay(id: string, data: Partial<StayRecord>): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/stays/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch { return false; }
}

export async function deleteStay(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/stays/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch { return false; }
}

// ─── INTERACTIONS ──────────────────────────────────

export async function fetchInteractions(contactId: string): Promise<ContactInteraction[]> {
  return apiFetch<ContactInteraction[]>(`${API_BASE}/contacts/${contactId}/interactions`);
}

export async function createInteraction(contactId: string, data: Partial<ContactInteraction>): Promise<ContactInteraction> {
  const res = await fetch(`${API_BASE}/contacts/${contactId}/interactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function updateInteraction(id: string, data: Partial<ContactInteraction>): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/interactions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch { return false; }
}

export async function deleteInteraction(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/interactions/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch { return false; }
}

// ─── STATS ────────────────────────────────────

export async function fetchDashboardStats(): Promise<DashboardStats> {
  if (STATIC_DATA) return staticFetch<DashboardStats>('stats.json');
  return apiFetch<DashboardStats>(`${API_BASE}/stats`);
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
  try {
    const res = await fetch(`${API_BASE}/auto-replies/${id}/approve`, { method: 'PUT' });
    return res.ok;
  } catch { return false; }
}

export async function sendReply(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auto-replies/${id}/send`, { method: 'PUT' });
    return res.ok;
  } catch { return false; }
}

export async function cancelReply(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auto-replies/${id}/cancel`, { method: 'PUT' });
    return res.ok;
  } catch { return false; }
}

export async function fetchAutoReplyRules(): Promise<AutoReplyRule[]> {
  return apiFetch<AutoReplyRule[]>(`${API_BASE}/auto-reply-rules`);
}

export async function createAutoReplyRule(rule: Partial<AutoReplyRule>): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auto-reply-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    return res.ok;
  } catch { return false; }
}

export async function toggleAutoReplyRule(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auto-reply-rules/${id}/toggle`, { method: 'PUT' });
    return res.ok;
  } catch { return false; }
}

export async function deleteAutoReplyRule(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auto-reply-rules/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch { return false; }
}

// ─── HELPERS ──────────────────────────────────

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ─── DOCUMENTS ────────────────────────────────

const API_BASE_DOCS = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

export async function previewDocuments(contactId: string, overrides: DocumentFormOverrides = {}) {
  const res = await fetch(`${API_BASE_DOCS}/documents/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactId, overrides }),
  });
  if (!res.ok) throw new Error(`Preview ${res.status}`);
  return res.json() as Promise<{ fields: Record<string, string>; contact: { id: string; name: string; email: string } | null }>;
}

export async function downloadDocument(contactId: string, type: DocumentGenerateType, overrides: DocumentFormOverrides = {}) {
  const res = await fetch(`${API_BASE_DOCS}/documents/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
