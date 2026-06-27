const TOKEN_KEY = 'alpicois_admin_token';
const ACTOR_KEY = 'alpicois_admin_actor';

export type AdminActor = 'gilles' | 'claire';

export function getAdminActor(): AdminActor | null {
  try {
    const v = sessionStorage.getItem(ACTOR_KEY);
    return v === 'claire' ? 'claire' : v === 'gilles' ? 'gilles' : null;
  } catch {
    return null;
  }
}

export function setAdminActor(actor: AdminActor | null) {
  try {
    if (actor) sessionStorage.setItem(ACTOR_KEY, actor);
    else sessionStorage.removeItem(ACTOR_KEY);
  } catch { /* ignore */ }
}

const API_BASE = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? '/api' : 'http://localhost:3001/api');

export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(ACTOR_KEY);
    }
  } catch { /* ignore */ }
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAdminToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return { ...h, ...(extra as Record<string, string>) };
}

export async function adminLogin(password: string, actor: AdminActor = 'gilles'): Promise<AdminActor> {
  const res = await fetch(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, actor }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Connexion admin impossible');
  }
  const { token, actor: resolvedActor } = await res.json() as { token: string; actor: AdminActor };
  setAdminToken(token);
  setAdminActor(resolvedActor === 'claire' ? 'claire' : 'gilles');
  return resolvedActor === 'claire' ? 'claire' : 'gilles';
}

export async function checkAdminSession(): Promise<{ ok: boolean; actor: AdminActor | null }> {
  const token = getAdminToken();
  if (!token) return { ok: false, actor: null };
  try {
    const res = await fetch(`${API_BASE}/admin/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { ok: false, actor: null };
    const data = await res.json() as { authenticated?: boolean; actor?: AdminActor | null };
    if (!data.authenticated) {
      setAdminToken(null);
      return { ok: false, actor: null };
    }
    const actor = data.actor === 'claire' ? 'claire' : data.actor === 'gilles' ? 'gilles' : getAdminActor();
    if (actor) setAdminActor(actor);
    return { ok: true, actor };
  } catch {
    return { ok: false, actor: null };
  }
}

export function adminLogout() {
  setAdminToken(null);
}

export async function apiAuthFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getAdminToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, { ...init, headers });
}
