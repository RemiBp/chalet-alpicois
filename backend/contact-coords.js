/**
 * Extraction des coordonnées client depuis les corps de mail — exclut hôte / famille.
 */

import { cleanStoredBodyText } from './email-body.js';
import { isInternalEmail, isHostEmail } from './host-filter.js';
import { LANDLORD, CHALET_ADMIN } from './document-fields.js';

const HOST_LINE_PATTERNS = [
  /contact@alpicois/i,
  /barbier\.famille/i,
  /gilles\.barbier/i,
  /claire\.phelippeau/i,
  /mre\.barbier/i,
  /remi\.barbier/i,
  /7\s*rue\s*joan/i,
  /75014\s*paris/i,
  /120\s*rue\s*de\s*la\s*for/i,
  /73210/i,
  /la\s*plagne/i,
  /plagne[- ]centre/i,
  /paradiski/i,
  /06\s*32\s*65\s*65\s*64/i,
  /06\s*74\s*82\s*91\s*76/i,
  /chalet\s*l['']?alpicois/i,
  /monsieur\s+ou\s+madame\s+barbier/i,
  /madame\s+barbier/i,
  /monsieur\s+barbier/i,
  /bonjour\s+claire/i,
  /bonjour\s+gilles/i,
];

const COUNTRY_ALIASES = {
  'pays-bas': 'Pays-Bas',
  netherlands: 'Pays-Bas',
  holland: 'Pays-Bas',
  'la haye': 'Pays-Bas',
  belgique: 'Belgique',
  belgium: 'Belgique',
  france: 'France',
  'royaume-uni': 'Royaume-Uni',
  'united kingdom': 'Royaume-Uni',
  uk: 'Royaume-Uni',
  allemagne: 'Allemagne',
  germany: 'Allemagne',
  suisse: 'Suisse',
  switzerland: 'Suisse',
  espagne: 'Espagne',
  spain: 'Espagne',
  italie: 'Italie',
  italy: 'Italie',
};

const NATIONALITY_FROM_COUNTRY = {
  'Pays-Bas': 'Neerlandaise',
  Belgique: 'Belge',
  France: 'Française',
  'Royaume-Uni': 'Britannique',
  Allemagne: 'Allemande',
  Suisse: 'Suisse',
  Espagne: 'Espagnole',
  Italie: 'Italienne',
};

/** Digits only, FR mobiles normalized to 0XXXXXXXXX when possible. */
export function normalizePhoneDigits(value) {
  let d = String(value || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('33') && d.length >= 11) d = `0${d.slice(2)}`;
  return d;
}

/** Claire / Gilles / chalet — never attribute to a guest. */
const HOST_PHONE_KEYS = new Set([
  '0632656564', // Claire
  '0674829176', // Gilles
  '33265656564',
  '33674829176',
]);

export function isHostPhone(value) {
  const d = normalizePhoneDigits(value);
  if (!d) return false;
  if (HOST_PHONE_KEYS.has(d)) return true;
  const last10 = d.slice(-10);
  if (HOST_PHONE_KEYS.has(last10) || HOST_PHONE_KEYS.has(`0${d.slice(-9)}`)) return true;
  // Explicit landlord strings (with or without labels)
  if (/0632656564|0674829176|632656564|674829176/.test(d)) return true;
  return false;
}

export function cleanPhoneCapture(raw) {
  return String(raw || '')
    .replace(/[.\u00a0\s,;:/]+$/g, '')
    .replace(/^[\s.:\-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isHostContentLine(line) {
  const t = (line || '').trim();
  if (!t || t.length < 3) return true;
  if (isHostPhone(t)) return true;
  if (HOST_LINE_PATTERNS.some(p => p.test(t))) return true;
  if (isHostEmail(t) || isInternalEmail(t)) return true;
  if (t.includes(LANDLORD.address1) || t.includes(LANDLORD.phoneClaire?.slice(0, 10))) return true;
  if (t.includes(CHALET_ADMIN.address)) return true;
  return false;
}

export function stripQuotedReply(text, { minKeep = 0 } = {}) {
  if (!text) return '';
  const cuts = [
    /\nLe\s+.+\s+a\s+écrit\s*:/i,
    /\nOn\s+.+\s+wrote\s*:/i,
    /\nFrom:\s/i,
    /\n-----Original Message-----/i,
    /\n_{3,}/,
    /\nDe\s*:\s/i,
  ];
  let out = text;
  for (const p of cuts) {
    const idx = out.search(p);
    // Default: cut at first quote marker. Pass a higher minKeep to preserve short forwards.
    if (idx >= minKeep) out = out.slice(0, idx);
  }
  return out.trim();
}

export function guestCorpusFromEmails(emails, contactEmail) {
  const guestBodies = emails
    .filter(e => e.mailbox !== 'INBOX.Sent' && e.mailbox !== 'SENT')
    .map(e => stripQuotedReply(cleanStoredBodyText(e.body_text || e.bodyText || '')))
    .filter(Boolean);

  const filtered = guestBodies.map(body =>
    body.split('\n').filter(line => !isHostContentLine(line)).join('\n'),
  );

  const corpus = filtered.join('\n\n').trim();
  if (corpus) return corpus;

  return guestBodies.join('\n\n');
}

function normalizeCountry(raw) {
  if (!raw) return '';
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const [k, v] of Object.entries(COUNTRY_ALIASES)) {
    if (key === k || key.includes(k)) return v;
  }
  return raw.trim().replace(/\s*[–\-]\s*$/, '');
}

function nationalityFromCountry(country) {
  return NATIONALITY_FROM_COUNTRY[country] || '';
}

export function isPlausiblePhone(value) {
  if (!value) return false;
  const s = String(value).replace(/\s+/g, ' ').trim();
  if (!s) return false;
  // Reject polluted captures like "éphone, mail). Je les…"
  if (/[a-zA-Zà-ÿ]{2,}/i.test(s)) return false;
  const digits = s.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return false;
  // Bare 12+ digit blobs are usually timestamps/IDs, not phone numbers.
  if (!/^\s*(\+|00)/.test(s) && digits.length > 11) return false;
  return true;
}

export function extractPhone(text) {
  // Prefer full labels — bare "tél" must not match inside "téléphone" and swallow the rest.
  const labeled = text.match(
    /(?:t[ée]l[ée]phone|telephone|t[ée]l\.?|tel\.?|phone|mobile|mob\.?|gsm|portable)\s*(?:number|n[°o.]|nº|:|-)?\s*((?:\+|00)?\d[\d\s().\-]{6,18})/i,
  );
  if (labeled) {
    const phone = cleanPhoneCapture(labeled[1]);
    if (phone && !isHostPhone(phone) && !isHostContentLine(phone) && isPlausiblePhone(phone)) {
      return phone;
    }
  }
  const patterns = [
    /(?:\+33|0033)[\s.-]?(?:\d[\s.-]?){9,10}/,
    /(?:\+32|0032)[\s.-]?(?:\d[\s.-]?){8,11}/,
    /(?:\+31|0031)[\s.-]?(?:\d[\s.-]?){8,12}/,
    /(?:\+44|0044)[\s.-]?(?:\d[\s.-]?){9,12}/,
    /(?:\+49|0049)[\s.-]?(?:\d[\s.-]?){9,13}/,
    /(?:\+41|0041)[\s.-]?(?:\d[\s.-]?){8,11}/,
    // FR national only if clearly labeled context already failed — still reject host.
    /(?:^|[^\d])((?:0[67])(?:[\s.-]?\d{2}){4})(?!\d)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    const raw = m?.[1] || m?.[0];
    if (!raw) continue;
    const phone = cleanPhoneCapture(raw);
    if (phone && !isHostPhone(phone) && !isHostContentLine(phone) && isPlausiblePhone(phone)) {
      return phone;
    }
  }
  return '';
}

/** Guest street address — reject host prompts like "adresse postale et vos numéros". */
export function isPlausibleGuestAddress(value) {
  if (!value) return false;
  const s = String(value).replace(/\s+/g, ' ').trim();
  if (s.length < 10 || s.length > 120) return false;
  if (/[?]{2,}/.test(s)) return false;
  if (isHostContentLine(s)) return false;
  if (/(?:num[eé]ros?|t[eé]l[eé]phone|portable|e-?mails?|coordonn|postale et|vos num|ci-joint|pi[eè]ce jointe)/i.test(s)) {
    return false;
  }
  // Real addresses almost always include a digit (street no / postal).
  if (!/\d/.test(s)) return false;
  return true;
}

export function extractEmailFromBody(text, contactEmail) {
  const labeled = text.match(/(?:e-?mail|email|courriel|mail)\s*[:\-]?\s*([\w.+-]+@[\w.-]+\.\w+)/i);
  if (labeled) {
    const e = labeled[1].toLowerCase();
    if (!isHostEmail(e) && !isInternalEmail(e)) return e;
  }
  const all = [...text.matchAll(/[\w.+-]+@[\w.-]+\.\w+/gi)].map(m => m[0].toLowerCase());
  for (const e of all) {
    if (isHostEmail(e) || isInternalEmail(e)) continue;
    if (contactEmail && e === contactEmail.toLowerCase()) return e;
  }
  return all.find(e => !isHostEmail(e) && !isInternalEmail(e)) || '';
}

function parseCoordinatesBlock(block) {
  const lines = block.split('\n').map(l => l.trim()).filter(l => l && !isHostContentLine(l));
  const result = { name: '', address: '', postalCode: '', city: '', country: '', phone: '', email: '' };

  for (const line of lines) {
    const phone = extractPhone(line);
    if (phone) {
      result.phone = phone;
      continue;
    }
    const mail = line.match(/(?:e-?mail|email|courriel)\s*[:\-]?\s*(.+)/i);
    if (mail) {
      result.email = mail[1].trim().toLowerCase();
      continue;
    }

    const nlPostal = line.match(/^(\d{4}\s?[A-Z]{2})\s+(.+?)(?:\s*[–\-]\s*(.+))?$/i);
    if (nlPostal) {
      result.postalCode = nlPostal[1].trim();
      result.city = nlPostal[2].trim();
      if (nlPostal[3]) result.country = normalizeCountry(nlPostal[3]);
      else if (/haye|den haag|amsterdam|rotterdam/i.test(nlPostal[2])) result.country = 'Pays-Bas';
      continue;
    }

    const frPostal = line.match(/^(\d{5})\s+(.+?)(?:\s*[–\-]\s*(.+))?$/);
    if (frPostal) {
      result.postalCode = `${frPostal[1]} ${frPostal[2]}`.trim();
      if (frPostal[3]) result.country = normalizeCountry(frPostal[3]);
      else result.country = 'France';
      continue;
    }

    const countryOnly = line.match(/^(?:pays|country|land)\s*[:\-]\s*(.+)/i);
    if (countryOnly) {
      result.country = normalizeCountry(countryOnly[1]);
      continue;
    }

    if (!result.name && /^[A-ZÀ-ÿ][a-zà-ÿ]+(\s+[A-ZÀ-ÿ][a-zà-ÿ'-]+)+$/.test(line)) {
      result.name = line;
      continue;
    }

    if (!result.address && /\d/.test(line) && line.length >= 6 && line.length <= 80) {
      result.address = line;
    }
  }

  if (!result.country && result.city && /haye|haag|amsterdam|utrecht/i.test(result.city)) {
    result.country = 'Pays-Bas';
  }

  return result;
}

export function extractCoordinatesFromText(text, contactEmail) {
  const triggers = [
    /voici mes coordonn[ée]es/i,
    /mes coordonn[ée]es/i,
    /my contact details/i,
    /my details/i,
    /contactgegevens/i,
    /here are my details/i,
    /coordonn[ée]es\s*[:\-]/i,
  ];

  let best = null;
  for (const trigger of triggers) {
    const idx = text.search(trigger);
    if (idx === -1) continue;
    const slice = text.slice(idx, idx + 900);
    const parsed = parseCoordinatesBlock(slice);
    if (parsed.address || parsed.postalCode || parsed.phone) {
      best = parsed;
      break;
    }
  }

  if (!best) {
    const phone = extractPhone(text);
    const postalNl = text.match(/\b(\d{4}\s?[A-Z]{2})\s+([A-Za-zÀ-ÿ\s-]{3,30})(?:\s*[–\-]\s*(Pays-Bas|Netherlands|Belgique|France|Germany|UK))?/i);
    if (postalNl) {
      best = {
        address: '',
        postalCode: `${postalNl[1]} ${postalNl[2]}`.trim(),
        city: postalNl[2].trim(),
        country: normalizeCountry(postalNl[3] || (postalNl[2].match(/haye|haag/i) ? 'Pays-Bas' : '')),
        phone,
        email: extractEmailFromBody(text, contactEmail),
      };
      const before = text.slice(Math.max(0, text.indexOf(postalNl[0]) - 120), text.indexOf(postalNl[0]));
      const street = before.split('\n').map(l => l.trim()).filter(l => /\d/.test(l) && !isHostContentLine(l)).pop();
      if (street) best.address = street;
    }
  }

  if (!best) return null;

  if (!best.email) best.email = extractEmailFromBody(text, contactEmail);
  if (!best.phone) best.phone = extractPhone(text);

  return best;
}

export function mergeExtractedFields(base, extracted) {
  if (!extracted) return base;
  const out = { ...base };
  if (extracted.phone && !isHostPhone(extracted.phone) && !isHostContentLine(extracted.phone)) {
    out.phone = extracted.phone;
  }
  if (extracted.address) out.address = extracted.address;
  if (extracted.postalCode) {
    out.postalCode = extracted.city && !extracted.postalCode.includes(extracted.city)
      ? `${extracted.postalCode} ${extracted.city}`.trim()
      : extracted.postalCode;
  }
  if (extracted.country) {
    out.country = extracted.country;
    if (!out.nationality) out.nationality = nationalityFromCountry(extracted.country);
  }
  if (extracted.email && !out.alternateEmail) out.alternateEmail = extracted.email;
  return out;
}
