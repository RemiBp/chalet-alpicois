import type { Contact, Email, DashboardStats, StayRecord, AutoReply, AutoReplyRule, ContactInteraction } from './types';

const API_BASE = 'http://localhost:3001/api';

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

// ─── EMAILS ───────────────────────────────────

export async function fetchEmails(): Promise<Email[]> {
  return apiFetch<Email[]>(`${API_BASE}/emails`);
}

export async function fetchEmailThread(threadId: string): Promise<Email[]> {
  return apiFetch<Email[]>(`${API_BASE}/emails?threadId=${threadId}`);
}

// ─── CONTACTS ─────────────────────────────────

export async function fetchContacts(): Promise<Contact[]> {
  return apiFetch<Contact[]>(`${API_BASE}/contacts`);
}

export async function fetchContactById(id: string): Promise<Contact | null> {
  try {
    return await apiFetch<Contact>(`${API_BASE}/contacts/${id}`);
  } catch {
    return null;
  }
}

export async function createContact(contact: Partial<Contact>): Promise<Contact> {
  const res = await fetch(`${API_BASE}/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contact),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export async function updateContact(id: string, data: Partial<Contact>): Promise<boolean> {
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
