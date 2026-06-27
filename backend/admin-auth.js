/**
 * Jetons admin signés (HMAC) — pas de session serveur requise (serverless).
 */

import { createHmac, timingSafeEqual } from 'crypto';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret() {
  return process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || '';
}

export function isAdminConfigured() {
  return Boolean(secret());
}

export function createAdminToken(actor = 'gilles') {
  const safeActor = actor === 'claire' ? 'claire' : 'gilles';
  const payload = Buffer.from(JSON.stringify({
    role: 'admin',
    actor: safeActor,
    exp: Date.now() + TTL_MS,
  })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function decodeAdminToken(token) {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.role !== 'admin') return null;
    if (!data.exp || Date.now() > data.exp) return null;
    return { actor: data.actor === 'claire' ? 'claire' : 'gilles', exp: data.exp };
  } catch {
    return null;
  }
}

export function verifyAdminToken(token) {
  return Boolean(decodeAdminToken(token));
}

export function checkAdminPassword(password) {
  const expected = process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET;
  if (!expected) return false;
  return password === expected;
}
