/** Affichage formaté des noms contacts (miroir léger de backend/name-format.js). */

const PARTICLES = new Set(['de', 'du', 'des', 'le', 'la', 'les', "d'", 'l', 'van', 'von', 'et']);

const FIRST_NAMES = new Set([
  'philippe', 'sandrine', 'michele', 'michèle', 'michel', 'herve', 'hervé', 'annick',
  'emma', 'nathalie', 'laurent', 'celine', 'céline', 'gilles', 'claire', 'carlos',
  'stéphanie', 'stephanie', 'jack', 'yves', 'michaël', 'michael', 'marie', 'pierre',
  'jean', 'paul', 'jacques', 'nicolas', 'david', 'thomas', 'julien', 'alexandre',
  'sylvie', 'isabelle', 'catherine', 'valérie', 'valerie', 'caroline', 'audrey',
  'julie', 'sophie', 'anne', 'hélène', 'helene', 'evelyne', 'dominique', 'florence',
  'veronique', 'véronique', 'patricia', 'fabrice', 'stéphane', 'stephane', 'frédéric',
  'frederic', 'sebastien', 'sébastien', 'benjamin', 'maxime', 'romain', 'florian',
  'jerome', 'jérôme', 'pascal', 'alain', 'andre', 'andré', 'marc', 'eric', 'éric',
  'charlotte', 'camille', 'laura', 'manon', 'chloe', 'chlœ', 'chloé', 'sarah', 'lucie',
  'pauline', 'marine', 'elodie', 'élodie', 'aurelie', 'aurélie', 'melanie', 'mélanie',
  'virginie', 'myriam', 'corinne', 'karine', 'severine', 'séverine', 'delphine',
  'emilie', 'émilie', 'amélie', 'amelie', 'justine', 'margaux', 'oceane', 'océane',
]);

const FIRST_NAMES_SORTED = [...FIRST_NAMES].sort((a, b) => b.length - a.length);

function stripAccents(s: string) {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

function isFirstName(word: string) {
  return FIRST_NAMES.has(stripAccents(word.toLowerCase()));
}

function titleWord(word: string) {
  if (!word) return '';
  return word.split('-').map((part, i) => {
    const lower = part.toLowerCase();
    if (i > 0 && PARTICLES.has(lower)) return lower;
    if (PARTICLES.has(lower) && lower.length <= 3) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join('-');
}

function titleCaseName(text: string) {
  return text.trim().split(/\s+/).map((w, i) => {
    const lower = w.toLowerCase();
    if (lower === 'et') return 'et';
    if (i > 0 && PARTICLES.has(lower)) return lower;
    return titleWord(w);
  }).join(' ');
}

export function isWellFormattedName(name: string) {
  if (!name || name.length < 2) return false;
  if (name.includes('@')) return false;
  if (/^[a-z0-9._-]+$/i.test(name) && !name.includes(' ')) return false;
  if (name === name.toUpperCase() && name.length > 4) return false;
  if (name === name.toLowerCase()) return false;
  return /\b[A-ZÀ-ÖÙÝ][a-zà-ÿ]+/.test(name);
}

function parseEmailLocal(email: string) {
  const local = email.split('@')[0] || '';
  return local.replace(/\d+/g, '').split(/[._-]+/).filter(p => p.length >= 2);
}

function splitGluedToken(token: string) {
  const lower = token.toLowerCase();
  for (const fn of FIRST_NAMES_SORTED) {
    if (lower.endsWith(fn) && lower.length > fn.length + 1) {
      return { firstName: fn, lastName: lower.slice(0, -fn.length) };
    }
    if (lower.startsWith(fn) && lower.length > fn.length + 1) {
      return { firstName: fn, lastName: lower.slice(fn.length) };
    }
  }
  return null;
}

function orderTwoParts(a: string, b: string) {
  const aIsFirst = isFirstName(a);
  const bIsFirst = isFirstName(b);
  if (aIsFirst && !bIsFirst) return { firstName: a, lastName: b };
  if (bIsFirst && !aIsFirst) return { firstName: b, lastName: a };
  return { firstName: a, lastName: b };
}

function parseCoupleAllCaps(name: string) {
  const m = name.match(/^([A-ZÀ-ÖÙÝ][A-ZÀ-ÖÙÝ-]+)\s+([A-ZÀ-ÖÙÝ]+)\s+ET\s+([A-ZÀ-ÖÙÝ]+)$/i);
  if (!m) return null;
  const family = titleCaseName(m[1]);
  const p1 = titleWord(m[2].toLowerCase());
  const p2 = titleWord(m[3].toLowerCase());
  return { displayName: `${p1} et ${p2} ${family}` };
}

function fromEmailLocal(email: string) {
  const parts = parseEmailLocal(email);
  if (parts.length === 0) return null;
  if (parts.length === 1) {
    const split = splitGluedToken(parts[0]);
    if (split) return { displayName: `${titleWord(split.firstName)} ${titleCaseName(split.lastName)}` };
    return { displayName: titleCaseName(parts[0]) };
  }
  if (parts.length === 2) {
    const { firstName, lastName } = orderTwoParts(parts[0], parts[1]);
    return { displayName: `${titleWord(firstName)} ${titleCaseName(lastName)}` };
  }
  return { displayName: `${titleWord(parts[0])} ${titleCaseName(parts.slice(1).join(' '))}` };
}

export function formatContactName(rawName: string, email = '') {
  const name = (rawName || '').trim();

  if (isWellFormattedName(name) && !name.includes(' ET ')) {
    return { displayName: titleCaseName(name) };
  }

  const couple = parseCoupleAllCaps(name);
  if (couple) return couple;

  if (email && (!isWellFormattedName(name) || /^[a-z0-9._-]+$/i.test(name))) {
    const fromEmail = fromEmailLocal(email);
    if (fromEmail) return fromEmail;
  }

  if (name && !name.includes(' ')) {
    const split = splitGluedToken(name.replace(/[._-]/g, ''));
    if (split) return { displayName: `${titleWord(split.firstName)} ${titleCaseName(split.lastName)}` };
  }

  if (name.includes('.') && !name.includes(' ')) {
    const [a, b] = name.split('.');
    const { firstName, lastName } = orderTwoParts(a, b);
    return { displayName: `${titleWord(firstName)} ${titleCaseName(lastName)}` };
  }

  return { displayName: titleCaseName(name.replace(/\s+ET\s+/g, ' et ')) };
}

export function formatDisplayName(name: string, email = '') {
  return formatContactName(name, email).displayName;
}

export function displayContactName(contact: { name?: string; firstName?: string; email?: string }) {
  const { firstName, lastName } = splitContactNameFields(contact);
  if (firstName && lastName) {
    return formatDisplayName(`${firstName} ${lastName}`.trim(), contact.email);
  }
  if (lastName) return formatDisplayName(lastName, contact.email);
  return formatContactName(contact.name || '', contact.email || '').displayName;
}

/** Nom de famille / prénom pour les champs du profil (gère l'ancien format name = nom complet). */
export function splitContactNameFields(contact: { name?: string; firstName?: string; email?: string }) {
  const fn = (contact.firstName || '').trim();
  const rawName = (contact.name || '').trim();

  if (fn && rawName.toLowerCase().startsWith(`${fn.toLowerCase()} `)) {
    const rest = rawName.slice(fn.length).trim();
    if (rest) return { firstName: fn, lastName: rest };
  }

  if (fn && rawName && !rawName.toLowerCase().includes(fn.toLowerCase())) {
    return { firstName: fn, lastName: rawName };
  }

  if (!fn && rawName.includes(' ')) {
    const parts = rawName.split(/\s+/);
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }

  return { firstName: fn, lastName: rawName };
}
