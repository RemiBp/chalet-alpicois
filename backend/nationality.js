/**
 * Heuristiques nationalité (nom, email, langue).
 */

const FRENCH_FIRST = ['jean', 'pierre', 'paul', 'jacques', 'michel', 'philippe', 'nicolas', 'laurent', 'sylvie', 'marie', 'sophie', 'nathalie', 'isabelle', 'valerie', 'caroline', 'sandrine', 'remi', 'rémi', 'thomas', 'julien', 'maxime', 'florian'];
const FRENCH_LAST = ['dupont', 'martin', 'bernard', 'dubois', 'thomas', 'petit', 'durand', 'leroy', 'moreau', 'simon', 'laurent', 'michel', 'garcia', 'david', 'roux', 'vincent', 'blanc', 'faure', 'debacker', 'boissiere', 'junot'];
const UK_FIRST = ['john', 'james', 'william', 'henry', 'charles', 'michael', 'stephen', 'andrew', 'chris', 'simon', 'daniel', 'matthew', 'stuart', 'oliver', 'jack', 'harry', 'george', 'david', 'richard'];
const DUTCH_MARKERS = ['van ', 'de ', 'jan ', 'piet ', 'willem', 'sander', 'marijke', 'arjan', 'thijs'];
const GERMAN_FIRST = ['hans', 'klaus', 'wolfgang', 'jurgen', 'markus', 'stefan', 'andreas', 'matthias'];

const NATIONALITY_FROM_LANG = {
  en: 'Britannique',
  nl: 'Neerlandaise',
  de: 'Allemande',
  es: 'Espagnole',
  it: 'Italienne',
};

export function detectEmailLanguage(text) {
  const t = (text || '').toLowerCase();
  const scores = {
    fr: (t.match(/\b(bonjour|merci|cordialement|disponible|personnes|chalet|semaine|location|nous|votre|je\s|salutations)\b/g) || []).length,
    en: (t.match(/\b(hello|thank|thanks|available|people|cottage|week|booking|we\s|your|dear|regards|sincerely|looking forward)\b/g) || []).length,
    nl: (t.match(/\b(hallo|bedankt|beschikbaar|personen|week|chalet|wij|uw|groet)\b/g) || []).length,
    de: (t.match(/\b(hallo|danke|verfügbar|verfugbar|personen|woche|chalet|wir|ihr|grüße|gruesse)\b/g) || []).length,
    es: (t.match(/\b(hola|gracias|disponible|personas|semana|chalet|saludos)\b/g) || []).length,
    it: (t.match(/\b(ciao|grazie|disponibile|persone|settimana|chalet|saluti)\b/g) || []).length,
  };
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 2 ? best[0] : '';
}

export function nationalityFromLanguage(lang) {
  return NATIONALITY_FROM_LANG[lang] || '';
}

export function extractNationalityFromText(text) {
  const m = (text || '').match(/\b(?:nationalit[ée]|citizenship|nationality|staatsangehörigkeit)\s*[:\-]?\s*([A-Za-zÀ-ÿ\s-]{3,30})/i);
  if (!m) return '';
  const v = m[1].trim().toLowerCase();
  if (/fran|french/.test(v)) return 'Française';
  if (/n[eé]erland|dutch|holland/.test(v)) return 'Neerlandaise';
  if (/brit|english|anglais|uk|scot/.test(v)) return 'Britannique';
  if (/belg|belge/.test(v)) return 'Belge';
  if (/allem|german|deutsch/.test(v)) return 'Allemande';
  if (/ital/.test(v)) return 'Italienne';
  if (/espagn|spanish|español/.test(v)) return 'Espagnole';
  return '';
}

export function guessNationality(name, email, languageHint = '') {
  if (!name && !email) return '';

  const lower = (name || '').toLowerCase();
  const domain = (email || '').toLowerCase();
  const firstname = lower.split(/\s+/)[0] || '';

  if (extractNationalityFromText(name)) return extractNationalityFromText(name);

  for (const first of FRENCH_FIRST) {
    if (firstname === first || lower.includes(` ${first} `)) {
      for (const last of FRENCH_LAST) {
        if (lower.includes(last)) return 'Française';
      }
    }
  }
  for (const last of FRENCH_LAST) {
    if (lower.endsWith(last) || lower.includes(` ${last}`)) return 'Française';
  }
  if (FRENCH_FIRST.includes(firstname)) return 'Française';

  if (domain.includes('.fr') || domain.includes('@orange.fr') || domain.includes('@free.fr')
    || domain.includes('@laposte.net') || domain.includes('@sfr.fr') || domain.includes('@wanadoo.fr')
    || domain.includes('@outlook.fr') || domain.includes('@hotmail.fr')) return 'Française';
  if (domain.includes('.nl') || domain.includes('@ziggo') || domain.includes('@casema')) return 'Neerlandaise';
  if (domain.includes('.co.uk') || domain.includes('@blueyonder')) return 'Britannique';
  if (domain.includes('.de')) return 'Allemande';
  if (domain.includes('.be')) return 'Belge';

  for (const n of DUTCH_MARKERS) {
    if (lower.startsWith(n) || lower.includes(` ${n.trim()}`)) return 'Neerlandaise';
  }
  if (UK_FIRST.includes(firstname)) return 'Britannique';
  if (GERMAN_FIRST.includes(firstname)) return 'Allemande';

  if (languageHint && languageHint !== 'fr') {
    return nationalityFromLanguage(languageHint) || '';
  }

  return '';
}
