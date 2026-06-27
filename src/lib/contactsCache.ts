import type { Contact } from '../types';

const STORAGE_KEY = 'alpicois_contacts_cache_v1';
const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  ts: number;
  data: Contact[];
}

let memory: CacheEntry | null = null;

function readSession(): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!Array.isArray(parsed.data)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(entry: CacheEntry) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    /* quota / private mode */
  }
}

export function peekContactsCache(): Contact[] {
  const entry = memory || readSession();
  return entry?.data ?? [];
}

export function isContactsCacheFresh(maxAgeMs = TTL_MS): boolean {
  const entry = memory || readSession();
  if (!entry) return false;
  return Date.now() - entry.ts < maxAgeMs;
}

export function setContactsCache(data: Contact[]) {
  const entry = { ts: Date.now(), data };
  memory = entry;
  writeSession(entry);
}

export function invalidateContactsCache() {
  memory = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
