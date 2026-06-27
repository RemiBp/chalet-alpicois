/**
 * Formatage qualitatif des noms de contacts (prénom / nom, casse, emails type milon.herve).
 */

const PARTICLES = new Set(['de', 'du', 'des', 'le', 'la', 'les', "d'", 'l', 'van', 'von', 'et']);

const FIRST_NAMES = new Set([
  'philippe', 'sandrine', 'michele', 'michèle', 'michel', 'herve', 'hervé', 'annick',
  'emma', 'nathalie', 'laurent', 'celine', 'céline', 'gilles', 'claire', 'carlos',
  'stéphanie', 'stephanie', 'stephanie', 'jack', 'yves', 'michaël', 'michael', 'marie',
  'pierre', 'jean', 'paul', 'jacques', 'bernard', 'thierry', 'patrick', 'christophe',
  'nicolas', 'david', 'thomas', 'julien', 'alexandre', 'guillaume', 'vincent', 'olivier',
  'sylvie', 'isabelle', 'catherine', 'monique', 'françoise', 'martine', 'christine',
  'valérie', 'valerie', 'caroline', 'audrey', 'julie', 'sophie', 'anne', 'hélène', 'helene',
  'evelyne', 'dominique', 'brigitte', 'florence', 'veronique', 'véronique', 'patricia',
  'evelyne', 'sandrine', 'fabrice', 'laurent', 'stéphane', 'stephane', 'frédéric', 'frederic',
  'sebastien', 'sébastien', 'benjamin', 'maxime', 'romain', 'kevin', 'florian', 'anthony',
  'jerome', 'jérôme', 'pascal', 'alain', 'rené', 'rene', 'andre', 'andré', 'robert',
  'daniel', 'marc', 'eric', 'éric', 'christian', 'serge', 'gerard', 'gérard', 'henri',
  'luc', 'bruno', 'yannick', 'yann', 'lionel', 'damien', 'cyril', 'arnaud', 'mathieu',
  'charlotte', 'camille', 'laura', 'manon', 'chloe', 'chlœ', 'chloé', 'sarah', 'lucie',
  'pauline', 'marine', 'elodie', 'élodie', 'aurelie', 'aurélie', 'melanie', 'mélanie',
  'virginie', 'celine', 'céline', 'myriam', 'corinne', 'nadege', 'nadège', 'karine',
  'severine', 'séverine', 'delphine', 'emilie', 'émilie', 'amélie', 'amelie', 'justine',
  'margaux', 'oceane', 'océane', 'lisa', 'jade', 'lola', 'ines', 'inès', 'eva', 'léa', 'lea',
  'laure',
]);

const FIRST_NAMES_SORTED = [...FIRST_NAMES].sort((a, b) => b.length - a.length);

function stripAccents(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

function normKey(s) {
  return stripAccents((s || '').toLowerCase().trim());
}

function isFirstName(word) {
  return FIRST_NAMES.has(normKey(word));
}

function titleWord(word) {
  if (!word) return '';
  return word.split('-').map((part, i) => {
    const lower = part.toLowerCase();
    if (i > 0 && PARTICLES.has(lower)) return lower;
    if (PARTICLES.has(lower) && lower.length <= 3) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join('-');
}

function titleCaseName(text) {
  return (text || '')
    .trim()
    .split(/\s+/)
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (lower === 'et') return 'et';
      if (i > 0 && PARTICLES.has(lower)) return lower;
      return titleWord(w);
    })
    .join(' ');
}

function isOrganization(name) {
  return /\//.test(name) || /tourisme|consulting|refuge du|hostinger|newsletter|enquete/i.test(name);
}

export function isWellFormattedName(name) {
  if (!name || name.length < 2) return false;
  if (name.includes('@')) return false;
  if (/^[a-z0-9._-]+$/i.test(name) && !name.includes(' ')) return false;
  if (name === name.toUpperCase() && name.length > 4) return false;
  if (name === name.toLowerCase()) return false;
  return /\b[A-ZÀ-ÖÙÝ][a-zà-ÿ]+/.test(name);
}

function parseEmailLocal(email) {
  const local = (email || '').split('@')[0] || '';
  return local.replace(/\d+/g, '').split(/[._-]+/).filter(p => p.length >= 2);
}

function splitGluedToken(token) {
  const lower = token.toLowerCase();
  for (const fn of FIRST_NAMES_SORTED) {
    if (lower.endsWith(fn) && lower.length > fn.length + 1) {
      const last = lower.slice(0, -fn.length);
      return { firstName: fn, lastName: last };
    }
    if (lower.startsWith(fn) && lower.length > fn.length + 1) {
      const last = lower.slice(fn.length);
      return { firstName: fn, lastName: last };
    }
  }
  return null;
}

function orderTwoParts(a, b) {
  const aIsFirst = isFirstName(a);
  const bIsFirst = isFirstName(b);
  if (aIsFirst && !bIsFirst) return { firstName: a, lastName: b };
  if (bIsFirst && !aIsFirst) return { firstName: b, lastName: a };
  // défaut courant en .fr : prenom.nom
  if (aIsFirst && bIsFirst) return { firstName: a, lastName: b };
  return { firstName: a, lastName: b };
}

function parseCoupleAllCaps(name) {
  const m = name.match(/^([A-ZÀ-ÖÙÝ][A-ZÀ-ÖÙÝ-]+)\s+([A-ZÀ-ÖÙÝ]+)\s+ET\s+([A-ZÀ-ÖÙÝ]+)$/i);
  if (!m) return null;
  const family = titleCaseName(m[1]);
  const p1 = titleWord(m[2].toLowerCase());
  const p2 = titleWord(m[3].toLowerCase());
  return {
    firstName: `${p1} et ${p2}`,
    lastName: family,
    displayName: `${p1} et ${p2} ${family}`,
  };
}

function parseCoupleFormatted(name) {
  const m = name.match(/^([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?)\s+et\s+([A-Za-zÀ-ÿ]+)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s-]*)$/i);
  if (!m) return null;
  const p1 = titleWord(m[1]);
  const p2 = titleWord(m[2]);
  const family = titleCaseName(m[3].trim());
  return {
    firstName: `${p1} et ${p2}`,
    lastName: family,
    displayName: `${p1} et ${p2} ${family}`,
  };
}

function fromEmailLocal(email) {
  const parts = parseEmailLocal(email);
  if (parts.length === 0) return null;

  if (parts.length === 1) {
    const split = splitGluedToken(parts[0]);
    if (split) {
      return {
        firstName: titleWord(split.firstName),
        lastName: titleCaseName(split.lastName),
        displayName: `${titleWord(split.firstName)} ${titleCaseName(split.lastName)}`,
      };
    }
    return {
      firstName: '',
      lastName: titleCaseName(parts[0]),
      displayName: titleCaseName(parts[0]),
    };
  }

  if (parts.length === 2) {
    const { firstName, lastName } = orderTwoParts(parts[0], parts[1]);
    return {
      firstName: titleWord(firstName),
      lastName: titleCaseName(lastName),
      displayName: `${titleWord(firstName)} ${titleCaseName(lastName)}`,
    };
  }

  const firstName = titleWord(parts[0]);
  const lastName = titleCaseName(parts.slice(1).join(' '));
  return { firstName, lastName, displayName: `${firstName} ${lastName}` };
}

/**
 * @returns {{ firstName: string, lastName: string, displayName: string }}
 */
export function formatContactName(rawName, email = '') {
  let name = (rawName || '').trim();

  if (isOrganization(name)) {
    return { firstName: '', lastName: name, displayName: name };
  }

  const couple = parseCoupleAllCaps(name) || parseCoupleFormatted(name);
  if (couple) return couple;

  if (isWellFormattedName(name) && !name.includes(' ET ') && !/\bet\b/i.test(name)) {
    const parts = name.trim().split(/\s+/);
    return {
      firstName: parts.length > 1 ? parts[0] : '',
      lastName: parts.length > 1 ? parts.slice(1).join(' ') : name,
      displayName: name,
    };
  }

  if (name.includes(' ET ')) {
    name = name.replace(/\s+ET\s+/g, ' et ');
  }

  const coupleLower = parseCoupleFormatted(name);
  if (coupleLower) return coupleLower;

  if (email && (isWellFormattedName(name) === false || /^[a-z0-9._-]+$/i.test(name))) {
    const fromEmail = fromEmailLocal(email);
    if (fromEmail) return fromEmail;
  }

  if (name && !name.includes(' ')) {
    const split = splitGluedToken(name.replace(/[._-]/g, ''));
    if (split) {
      return {
        firstName: titleWord(split.firstName),
        lastName: titleCaseName(split.lastName),
        displayName: `${titleWord(split.firstName)} ${titleCaseName(split.lastName)}`,
      };
    }
  }

  if (name.includes('.') && !name.includes(' ')) {
    const [a, b] = name.split('.');
    const ordered = orderTwoParts(a, b);
    return {
      firstName: titleWord(ordered.firstName),
      lastName: titleCaseName(ordered.lastName),
      displayName: `${titleWord(ordered.firstName)} ${titleCaseName(ordered.lastName)}`,
    };
  }

  const titled = titleCaseName(name);
  const parts = titled.split(/\s+/);
  if (parts.length >= 2) {
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' '),
      displayName: titled,
    };
  }

  return { firstName: '', lastName: titled, displayName: titled };
}

export function displayNameFromContact(contact) {
  const fn = (contact?.firstName || contact?.first_name || '').trim();
  const ln = (contact?.name || '').trim();

  if (fn && ln) {
    if (ln.toLowerCase().startsWith(`${fn.toLowerCase()} `)) {
      return formatContactName(ln, contact?.email).displayName;
    }
    return formatContactName(`${fn} ${ln}`.trim(), contact?.email).displayName;
  }

  return formatContactName(ln || fn, contact?.email).displayName;
}
