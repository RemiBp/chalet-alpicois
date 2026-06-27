/**
 * Extraction heuristique de montants depuis les emails (contrats, devis).
 */

const NOISE = [
  /unsubscribe/i,
  /newsletter/i,
  /barom[eè]tre/i,
  /enqu[eê]te/i,
  /no-reply/i,
  /noreply/i,
];

export function isNoiseEmail(subject = '', bodyText = '') {
  const text = `${subject}\n${bodyText}`;
  return NOISE.some(p => p.test(text));
}

/**
 * @returns {number|null} Montant en euros (entier)
 */
export function extractPriceFromEmail(subject, bodyText) {
  const text = `${subject || ''}\n${bodyText || ''}`;
  const patterns = [
    /(?:loyer|prix|montant|total|tarif|semaine)[^\d]{0,40}(\d[\d\s]{2,6})\s*€/gi,
    /(\d[\d\s]{2,6})\s*€[^\n]{0,30}(?:loyer|semaine|location|total)/gi,
    /€\s*(\d[\d\s]{2,6})/gi,
    /(\d[\d\s]{2,6})\s*(?:EUR|euros?)/gi,
  ];

  const candidates = [];
  for (const re of patterns) {
    let m;
    const rx = new RegExp(re.source, re.flags);
    while ((m = rx.exec(text)) !== null) {
      const raw = (m[1] || m[0]).replace(/\s/g, '').replace(/€.*$/, '');
      const n = parseInt(raw, 10);
      if (n >= 400 && n <= 25000) candidates.push(n);
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b - a);
  return candidates[0];
}
