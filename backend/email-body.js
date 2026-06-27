/**
 * Extraction et nettoyage du corps des emails (RFC822 / MIME).
 */

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeQuotedPrintable(str) {
  if (!str) return '';
  let decoded = str
    .replace(/=\r?\n/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  const bytes = [];
  for (let i = 0; i < decoded.length; i++) {
    if (decoded[i] === '=' && i + 2 < decoded.length) {
      const hex = decoded.substr(i + 1, 2);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(decoded.charCodeAt(i));
  }
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
  } catch {
    return decoded;
  }
}

function fixMojibake(str) {
  if (!str) return '';
  if (str.includes('\ufffd')) {
    try {
      const bytes = Uint8Array.from([...str].map(c => c.charCodeAt(0) & 0xff));
      const fixed = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      if (fixed && !fixed.includes('\ufffd')) return fixed;
    } catch { /* ignore */ }
  }
  return str;
}

function looksLikeBase64(text) {
  if (!text || text.length < 40) return false;
  const sample = text.replace(/\s/g, '').slice(0, 800);
  if (!/^[A-Za-z0-9+/=]+$/.test(sample)) return false;
  try {
    const decoded = Buffer.from(sample, 'base64').toString('utf-8');
    return decoded.length > 20 && /[a-zA-ZÀ-ÿ]{3,}/.test(decoded);
  } catch {
    return false;
  }
}

function decodeBase64Body(text) {
  if (!text) return '';
  const stripped = text.replace(/\s/g, '');
  try {
    let decoded = Buffer.from(stripped, 'base64').toString('utf-8');
    if (!decoded || decoded.includes('\ufffd')) {
      decoded = Buffer.from(stripped, 'base64').toString('latin1');
    }
    return fixMojibake(decoded);
  } catch {
    return text;
  }
}

function looksLikeImagePayload(text) {
  const t = (text || '').slice(0, 4000);
  if (/\/9j\/|iVBORw0KGgo|Content-Type:\s*image\//i.test(t)) return true;
  if (/Content-Disposition:\s*inline/i.test(t) && /name=[^\s;]+\.(jpe?g|png|gif)/i.test(t)) return true;
  return false;
}

export function isGarbageEmailBody(body, subject = '') {
  if (!body || body.length < 20) return true;
  if (looksLikeImagePayload(body)) return false;
  const b = body.trim();
  if (looksLikeBase64(b)) return false;
  if (/^WPForms/i.test(b) || b.includes('@media only screen')) return true;
  if (subject === 'New Entry: Contact Form 1' && b.includes('alpicois-laplagne.fr') && !b.includes('Bonjour')) return true;
  if (/^[A-Za-z0-9+/=]{200,}$/.test(b.replace(/\s/g, ''))) return true;
  return false;
}

function cleanBody(str) {
  if (!str) return '';
  str = fixMojibake(str);
  const utf8FixMap = {
    'Ã©': 'é', 'Ã¨': 'è', 'Ãª': 'ê', 'Ã«': 'ë',
    'Ã ': 'à', 'Ã¢': 'â', 'Ã¤': 'ä',
    'Ã¹': 'ù', 'Ã»': 'û', 'Ã¼': 'ü',
    'Ã´': 'ô', 'Ã¶': 'ö',
    'Ã®': 'î', 'Ã¯': 'ï',
    'Ã§': 'ç',
    'Å“': 'œ', 'Å’': 'Œ',
  };
  for (const [bad, good] of Object.entries(utf8FixMap)) {
    str = str.split(bad).join(good);
  }

  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extrait text/plain depuis le buffer source brut IMAP.
 */
export function extractBodyText(sourceBuffer) {
  if (!sourceBuffer) return '';
  try {
    let raw;
    try {
      raw = new TextDecoder('utf-8', { fatal: false }).decode(sourceBuffer);
    } catch {
      raw = sourceBuffer.toString('utf-8');
    }
    if (/Ã[©¨ª«¬­®°±²³´µ¶·¸¹º»¼½¾¿À-ÿ]/.test(raw)) {
      raw = new TextDecoder('latin1').decode(sourceBuffer);
    }

    const boundaryMatch = raw.match(/boundary="?([^"\s;]+)"?/i);
    const boundary = boundaryMatch?.[1] || null;
    const ctMatch = raw.match(/Content-Type:\s*text\/plain/i);
    const qpMatch = raw.match(/Content-Transfer-Encoding:\s*quoted-printable/i);

    if (!boundary && ctMatch) {
      const parts = raw.split(/\r?\n\r?\n/);
      if (parts.length > 1) {
        let body = parts.slice(1).join('\n\n');
        if (qpMatch) body = decodeQuotedPrintable(body);
        return cleanBody(body).substring(0, 50000);
      }
    }

    const textPlainParts = [];
    if (boundary) {
      const sections = raw.split(new RegExp(`--${escapeRegex(boundary)}`));
      for (const section of sections) {
        if (section.includes('text/plain')) {
          const parts = section.split(/\r?\n\r?\n/);
          if (parts.length > 1) {
            let content = parts.slice(1).join('\n\n').replace(/--\s*$/, '').trim();
            if (section.includes('quoted-printable')) {
              content = decodeQuotedPrintable(content);
            }
            if (/base64/i.test(section)) {
              content = decodeBase64Body(content.replace(/\s/g, ''));
            }
            textPlainParts.push(content);
          }
        }
      }
    }

    if (textPlainParts.length === 0) {
      const bodyMatch = raw.match(/(?:\r?\n\r?\n)([\s\S]*)/);
      if (bodyMatch) {
        let body = bodyMatch[1].replace(/^--\n.*$/gm, '').trim();
        if (/quoted-printable/i.test(raw)) body = decodeQuotedPrintable(body);
        textPlainParts.push(body);
      }
    }

    return cleanBody(textPlainParts.join('\n\n')).substring(0, 50000);
  } catch {
    return '';
  }
}

/**
 * Nettoie un body déjà stocké en base (MIME pollué, quoted-printable, etc.).
 */
export function cleanStoredBodyText(raw) {
  if (!raw) return '';
  if (looksLikeImagePayload(raw)) {
    const fn = raw.match(/name=([^\s;\n"]+\.(?:jpe?g|png|gif))/i)?.[1];
    return fn ? `Photo jointe · ${fn}` : 'Photo jointe';
  }

  if (looksLikeBase64(raw.trim())) {
    return cleanBody(decodeBase64Body(raw)).substring(0, 50000);
  }

  const looksPolluted = /^--[=_\w]/m.test(raw)
    || /Content-Transfer-Encoding:/i.test(raw)
    || /Content-Type:\s*text\//i.test(raw)
    || /=([0-9A-F]{2})/.test(raw.slice(0, 200));

  if (!looksPolluted) {
    return cleanBody(decodeQuotedPrintable(raw));
  }

  const boundary = raw.match(/^--([^\s\n]+)/m)?.[1];
  if (boundary) {
    const sections = raw.split(new RegExp(`--${escapeRegex(boundary)}`));
    for (const section of sections) {
      if (/text\/plain/i.test(section)) {
        const parts = section.split(/\r?\n\r?\n/);
        if (parts.length > 1) {
          let content = parts.slice(1).join('\n\n').replace(/--\s*$/, '').trim();
          if (/quoted-printable/i.test(section)) content = decodeQuotedPrintable(content);
          const cleaned = cleanBody(content);
          if (cleaned.length > 20) return cleaned.substring(0, 50000);
        }
      }
    }
  }

  let text = decodeQuotedPrintable(raw)
    .replace(/Content-Type:[^\n]*\n/gi, '')
    .replace(/Content-Transfer-Encoding:[^\n]*\n/gi, '')
    .replace(/charset=[^\n]*\n/gi, '')
    .replace(/^--[A-Za-z0-9_=.+-]+--?$/gm, '')
    .replace(/^--[A-Za-z0-9_=.+-]+$/gm, '');

  const markers = ['Bonjour', 'Hello', 'Dear', 'Hallo', 'Hi ', 'Good morning', 'Guten Tag'];
  for (const marker of markers) {
    const idx = text.indexOf(marker);
    if (idx >= 0 && idx < 800) {
      text = text.slice(idx);
      break;
    }
  }

  text = cleanBody(text);
  if (text.length < 15 && raw.length > 50) {
    const fallback = cleanBody(decodeQuotedPrintable(raw.replace(/^[\s\S]{0,400}/, '')));
    if (fallback.length > text.length) text = fallback;
  }

  return text.substring(0, 50000);
}

export { decodeQuotedPrintable, cleanBody, looksLikeBase64 };
