/**
 * Extraction des profils contacts depuis les emails (heuristiques, sans IA).
 * Téléphone, adresse, nationalité, langue, composition groupe.
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { formatContactName } from './name-format.js';
import {
  detectEmailLanguage,
  extractNationalityFromText,
  guessNationality,
  nationalityFromLanguage,
} from './nationality.js';
import { isInternalContact } from './host-filter.js';
import {
  guestCorpusFromEmails,
  extractCoordinatesFromText,
  extractPhone,
  isPlausiblePhone,
  mergeExtractedFields,
} from './contact-coords.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || join(__dirname, '..', 'emails.db');

function extractPostalCode(text) {
  const nl = text.match(/\b(\d{4}\s?[A-Z]{2})\b/i);
  if (nl) return nl[1].replace(/\s+/g, ' ').trim().toUpperCase();
  const labeled = text.match(/\b(?:code postal|cp|postcode|postal code|zip)\s*[:\-]?\s*(\d{4,5}(?:\s?[A-Z]{2})?)\b/i);
  if (labeled) return labeled[1].replace(/\s+/g, ' ').trim();
  const fr = text.match(/\b(\d{5})\b/);
  return fr?.[1]?.trim() || '';
}

function isPlausiblePostalCode(value) {
  if (!value) return false;
  const s = String(value).replace(/[\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length > 12) return false;
  return /^\d{4}\s?[A-Z]{2}$/i.test(s) || /^\d{5}$/.test(s);
}

function isPlausibleCountry(value) {
  if (!value) return false;
  const s = String(value).replace(/[\x00-\x1F]/g, ' ').trim();
  if (s.length < 3 || s.length > 40) return false;
  if (/^(bas|pays)$/i.test(s)) return false;
  return /[A-Za-zÀ-ÿ]/.test(s);
}

function extractAddress(text) {
  const coords = extractCoordinatesFromText(text, '');
  if (coords?.address) return coords.address;
  const m = text.match(/(?:adresse|address|adres)\s*[:\-]\s*([^\n]{8,120})/i);
  return m?.[1]?.trim() || '';
}

function extractCountry(text) {
  const coords = extractCoordinatesFromText(text, '');
  if (coords?.country) return coords.country;
  const m = text.match(/\b(?:pays|country|land)\s*[:\-]\s*([A-Za-zÀ-ÿ\s-]{3,30})/i);
  return m?.[1]?.trim() || '';
}

function extractGroupSize(text) {
  const adults = text.match(/(\d+)\s*(?:adultes?|adults?)/i)?.[1];
  const children = text.match(/(\d+)\s*(?:enfants?|children|kids)/i)?.[1];
  const persons = text.match(/(\d+)\s*(?:personnes?|people|persons|pax|guests?)/i)?.[1];
  return {
    adults: adults ? parseInt(adults, 10) : (persons ? parseInt(persons, 10) : 0),
    children: children ? parseInt(children, 10) : 0,
  };
}

function isSentMailbox(mailbox) {
  return mailbox === 'INBOX.Sent' || mailbox === 'SENT';
}

function normalizeNameFields(contact, senderName) {
  const formatted = formatContactName(senderName || contact.name, contact.email);
  let firstName = (contact.first_name || contact.firstName || '').trim();
  let lastName = (contact.name || '').trim();

  if (firstName && lastName.toLowerCase().startsWith(firstName.toLowerCase())) {
    const rest = lastName.slice(firstName.length).trim();
    if (rest) lastName = rest;
  } else if (!firstName && formatted.firstName) {
    firstName = formatted.firstName;
    lastName = formatted.lastName || lastName;
  } else if (!lastName || lastName === senderName) {
    lastName = formatted.lastName || lastName;
    firstName = firstName || formatted.firstName || '';
  }

  return { firstName, lastName };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {object} contact
 */
export function extractProfileFromEmails(db, contact) {
  const emails = db.prepare(`
    SELECT * FROM emails WHERE contact_id = ? ORDER BY date ASC
  `).all(contact.id);

  const corpus = guestCorpusFromEmails(emails, contact.email);
  const coords = extractCoordinatesFromText(corpus, contact.email);

  const language = detectEmailLanguage(corpus);
  let nationality = extractNationalityFromText(corpus);
  if (!nationality && coords?.country) {
    nationality = mergeExtractedFields({ nationality: '' }, coords).nationality;
  }
  if (!nationality && language && language !== 'fr') {
    nationality = nationalityFromLanguage(language) || '';
  }
  if (!nationality) {
    nationality = guessNationality(
      [contact.first_name, contact.name].filter(Boolean).join(' '),
      contact.email,
      language,
    );
  }

  const firstGuest = emails.find(e => !isSentMailbox(e.mailbox));
  const names = normalizeNameFields(contact, firstGuest?.sender_name);

  const { adults, children } = extractGroupSize(corpus);

  let base = {
    firstName: names.firstName,
    lastName: names.lastName,
    phone: extractPhone(corpus),
    postalCode: extractPostalCode(corpus),
    address: extractAddress(corpus),
    country: extractCountry(corpus),
    nationality,
    language,
    typicalAdults: adults,
    typicalChildren: children,
    alternateEmail: '',
  };

  base = mergeExtractedFields(base, coords);

  return base;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} contactId
 */
export function applyExtractedProfile(db, contactId) {
  const c = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
  if (!c) return { ok: false, error: 'Contact introuvable' };
  if (isInternalContact(c) || c.is_personal === 1) {
    return { ok: false, error: 'Profil interne — extraction ignorée' };
  }

  const ext = extractProfileFromEmails(db, c);
  let profile = {};
  try { profile = c.profile_json ? JSON.parse(c.profile_json) : {}; } catch { /* ignore */ }

  let altEmails = [];
  try { altEmails = JSON.parse(c.alternate_emails || '[]'); } catch { altEmails = []; }
  if (ext.alternateEmail && ext.alternateEmail !== c.email && !altEmails.includes(ext.alternateEmail)) {
    altEmails.push(ext.alternateEmail);
  }

  const newProfile = {
    ...profile,
    language: ext.language || profile.language || '',
    typicalAdults: ext.typicalAdults || profile.typicalAdults || 0,
    typicalChildren: ext.typicalChildren || profile.typicalChildren || 0,
    extractedAt: new Date().toISOString(),
  };

  db.prepare(`
    UPDATE contacts SET
      first_name = COALESCE(NULLIF(?, ''), first_name),
      name = COALESCE(NULLIF(?, ''), name),
      phone = COALESCE(NULLIF(?, ''), phone),
      address = COALESCE(NULLIF(?, ''), address),
      postal_code = COALESCE(NULLIF(?, ''), postal_code),
      country = COALESCE(NULLIF(?, ''), country),
      nationality = COALESCE(NULLIF(?, ''), nationality),
      alternate_emails = ?,
      profile_json = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    ext.firstName || '',
    ext.lastName || '',
    (ext.phone && isPlausiblePhone(ext.phone) ? ext.phone : '') || '',
    ext.address || '',
    (ext.postalCode && isPlausiblePostalCode(ext.postalCode) ? ext.postalCode : '') || '',
    (ext.country && isPlausibleCountry(ext.country) ? ext.country : '') || '',
    ext.nationality || '',
    JSON.stringify(altEmails),
    JSON.stringify(newProfile),
    contactId,
  );

  return {
    ok: true,
    contactId,
    extracted: {
      phone: ext.phone,
      address: ext.address,
      postalCode: ext.postalCode,
      country: ext.country,
      nationality: ext.nationality,
    },
  };
}

/**
 * @param {import('better-sqlite3').Database} db
 */
export function enrichProfilesFromEmails(db, { limit = 500 } = {}) {
  const contacts = db.prepare(`
    SELECT * FROM contacts
    WHERE COALESCE(is_personal, 0) = 0
    ORDER BY last_contact_date DESC LIMIT ?
  `).all(limit);

  let filledNationality = 0;
  let fixedNames = 0;
  let filledCoords = 0;
  let clearedBadPhones = 0;

  // Clear phones polluted by bad extraction (letters/words in the value).
  const badPhones = db.prepare(`
    SELECT id, phone FROM contacts
    WHERE phone IS NOT NULL AND phone != ''
      AND phone GLOB '*[A-Za-zÀ-ÿ]*'
      AND phone GLOB '*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ]*'
  `).all();
  const clearPhone = db.prepare(`UPDATE contacts SET phone = '', updated_at = datetime('now') WHERE id = ?`);
  for (const row of badPhones) {
    if (!isPlausiblePhone(row.phone)) {
      clearPhone.run(row.id);
      clearedBadPhones++;
    }
  }

  for (const c of contacts) {
    if (isInternalContact(c)) continue;
    const result = applyExtractedProfile(db, c.id);
    if (!result.ok) continue;
    if (result.extracted?.nationality) filledNationality++;
    if (result.extracted?.address || (result.extracted?.phone && isPlausiblePhone(result.extracted.phone))) filledCoords++;
    const updated = db.prepare('SELECT name FROM contacts WHERE id = ?').get(c.id);
    if (updated?.name !== c.name) fixedNames++;
  }

  return { contacts: contacts.length, filledNationality, fixedNames, filledCoords, clearedBadPhones };
}

async function main() {
  if (!existsSync(DB_PATH)) {
    console.error(`❌ Base introuvable: ${DB_PATH}`);
    process.exit(1);
  }
  const db = new Database(DB_PATH);
  const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '500', 10);
  const report = enrichProfilesFromEmails(db, { limit });
  console.log(`✅ ${report.contacts} profils — ${report.filledCoords} coordonnées, ${report.filledNationality} nationalités, ${report.fixedNames} noms`);
  db.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
