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
    return decodeBytesBestEffort(new Uint8Array(bytes));
  } catch {
    return decoded;
  }
}

function scoreDecodedText(str) {
  if (!str) return 0;
  const replacement = (str.match(/\ufffd/g) || []).length * 40;
  const mojibake = (str.match(/Ã.|Â.|â€|�/g) || []).length * 12;
  const letters = (str.match(/[A-Za-zÀ-ÿ]{3,}/g) || []).length;
  const french = (str.match(/[éèêàùçîôûœ]/gi) || []).length * 2;
  return letters + french - replacement - mojibake;
}

function decodeBytesBestEffort(bytes) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const latin1 = new TextDecoder('iso-8859-1').decode(bytes);
  return scoreDecodedText(latin1) > scoreDecodedText(utf8) ? latin1 : utf8;
}

function fixMojibake(str) {
  if (!str) return '';
  if (str.includes('\ufffd')) {
    try {
      const bytes = Uint8Array.from([...str].map(c => c.charCodeAt(0) & 0xff));
      const fixed = decodeBytesBestEffort(bytes);
      if (fixed && scoreDecodedText(fixed) > scoreDecodedText(str)) return fixed;
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

function looksLikeEncryptedOrBinary(text) {
  if (!text || text.length < 24) return false;
  const head = text.slice(0, 600);
  if (/BEGIN PGP MESSAGE|BEGIN PGP SIGNED|application\/pkcs7|smime-type|Content-Type:\s*application\/(?:pkcs7|x-pkcs7)/i.test(head)) {
    return true;
  }
  if (looksLikeBase64(text) || looksLikeImagePayload(text)) return false;
  const sample = text.slice(0, 400);
  let weird = 0;
  let spaces = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13 || code === 32) spaces++;
    if (code < 9 || (code > 13 && code < 32) || code === 0x7f) weird++;
  }
  const asciiLetters = (sample.match(/[a-zA-Z]/g) || []).length;
  const words = (sample.match(/[a-zA-ZÀ-ÿ]{3,}/g) || []).length;
  // Pièce jointe/S-MIME extraite comme texte : peu de mots, mais parfois un
  // ratio de contrôles inférieur à 12 %. Ne jamais la présenter comme un mail.
  if (weird / sample.length > 0.08 && spaces <= 1) return true;
  if (weird / sample.length > 0.04 && words < 3) return true;
  if (weird / sample.length > 0.12) return true;
  if (sample.length > 40 && spaces < 3 && words < 3) return true;
  if (text.length < 220 && asciiLetters < 12 && spaces < 4 && /[^\x09\x0A\x0D\x20-\x7E]/.test(sample)) return true;
  if (text.length < 160 && asciiLetters < 8 && spaces < 2) return true;
  return false;
}

/** Strip <style>/<script> and collapse WPForms HTML into readable field text. */
export function extractWpFormsPlainText(html) {
  if (!html) return '';
  let s = String(html);
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  // CSS often survives as raw text after a bad prior clean — drop rule blocks.
  s = s.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/gi, ' ');
  s = s.replace(/@media[^{]*\{[\s\S]*?\}/gi, ' ');
  s = s.replace(/\{[^{}]{0,400}\}/g, ' ');
  // Prefer labelled field rows: "Votre nom" / value
  const fields = [];
  const fieldRe = /<td[^>]*class="[^"]*field-name[^"]*"[^>]*>[\s\S]*?<strong[^>]*>([^<]+)<\/strong>[\s\S]*?<\/td>[\s\S]*?<td[^>]*class="[^"]*field-value[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = fieldRe.exec(s)) !== null) {
    const label = cleanBody(m[1]);
    const value = cleanBody(m[2].replace(/<br\s*\/?>/gi, '\n'));
    if (label && value) fields.push(`${label}: ${value}`);
  }
  if (fields.length >= 1) return fields.join('\n');

  // Fallback when HTML structure was already partially flattened.
  const plain = cleanBody(s)
    .replace(/^WPForms\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const name = plain.match(/(?:Votre nom|Nom|Name)\s*:?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,80}?)(?=\s+(?:Email|Téléphone|Telephone|Your Message|Message)\b|$)/i)?.[1]?.trim();
  const email = plain.match(/(?:Email)\s*:?\s*([\w.+-]+@[\w.-]+\.\w+)/i)?.[1]
    || plain.match(/([\w.+-]+@[\w.-]+\.\w+)/)?.[1];
  const message = plain.match(/(?:Your Message|Message)\s*:?\s*(.+)$/i)?.[1]?.trim();
  const lines = [];
  if (name) lines.push(`Votre nom: ${name}`);
  if (email) lines.push(`Email: ${email}`);
  if (message) lines.push(`Message: ${message}`);
  if (lines.length >= 2) return lines.join('\n');
  return cleanBody(s).replace(/^WPForms\s*/i, '').trim();
}

export function isGarbageEmailBody(body, subject = '') {
  if (!body || body.length < 20) return true;
  if (looksLikeImagePayload(body)) return false;
  const raw = body.trim();
  if (looksLikeBase64(raw)) return false;
  // WPForms HTML often looks like CSS noise until styles are stripped.
  const looksWp = /^WPForms/i.test(raw) || raw.includes('@media only screen')
    || (subject === 'New Entry: Contact Form 1' && /field-value|WPForms|alpicois-laplagne\.fr/i.test(raw));
  if (looksWp) {
    const plain = extractWpFormsPlainText(raw);
    if (plain.length >= 40 && /@[\w.-]+\.\w+/.test(plain)) return false;
    if (plain.length >= 60 && /(Votre nom|Email|Your Message|Message)/i.test(plain)) return false;
    return true;
  }
  if (/^[A-Za-z0-9+/=]{200,}$/.test(raw.replace(/\s/g, ''))) return true;
  return false;
}

function cleanBody(str) {
  if (!str) return '';
  str = fixMojibake(str);
  // Drop CSS/JS blocks before stripping tags (WPForms notifications).
  str = str.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  str = str.replace(/<script[\s\S]*?<\/script>/gi, ' ');
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
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/r�servation/gi, 'réservation')
    .replace(/int�ress�es/gi, 'intéressées')
    .replace(/int�ress�s/gi, 'intéressés')
    .replace(/int�ress�/gi, 'intéressé')
    .replace(/pr�c�dent/gi, 'précédent')
    .replace(/d�cembre/gi, 'décembre')
    .replace(/f�vrier/gi, 'février')
    .replace(/s�jour/gi, 'séjour')
    .replace(/pi�ce/gi, 'pièce')
    .replace(/identit�/gi, 'identité')
    .replace(/t�l/gi, 'tél')
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
      raw = decodeBytesBestEffort(sourceBuffer);
    } catch {
      raw = sourceBuffer.toString('utf-8');
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
    const textHtmlParts = [];
    if (boundary) {
      const sections = raw.split(new RegExp(`--${escapeRegex(boundary)}`));
      for (const section of sections) {
        const isPlain = /Content-Type:\s*text\/plain/i.test(section);
        const isHtml = /Content-Type:\s*text\/html/i.test(section);
        if (!isPlain && !isHtml) continue;
        const parts = section.split(/\r?\n\r?\n/);
        if (parts.length > 1) {
          let content = parts.slice(1).join('\n\n').replace(/--\s*$/, '').trim();
          if (section.includes('quoted-printable')) {
            content = decodeQuotedPrintable(content);
          }
          if (/base64/i.test(section)) {
            content = decodeBase64Body(content.replace(/\s/g, ''));
          }
          if (isPlain) textPlainParts.push(content);
          else textHtmlParts.push(content);
        }
      }
    }

    if (textPlainParts.length === 0 && textHtmlParts.length === 0) {
      const bodyMatch = raw.match(/(?:\r?\n\r?\n)([\s\S]*)/);
      if (bodyMatch) {
        let body = bodyMatch[1].replace(/^--\n.*$/gm, '').trim();
        if (/quoted-printable/i.test(raw)) body = decodeQuotedPrintable(body);
        if (/<html|<body|WPForms|field-value/i.test(body)) textHtmlParts.push(body);
        else textPlainParts.push(body);
      }
    }

    const plainJoined = textPlainParts.join('\n\n');
    const htmlJoined = textHtmlParts.join('\n\n');
    // WPForms / HTML-only notifications: prefer structured field extraction.
    if (/WPForms|field-value|@media only screen/i.test(htmlJoined || plainJoined)) {
      const fromHtml = extractWpFormsPlainText(htmlJoined || plainJoined);
      if (fromHtml.length > 40) return fromHtml.substring(0, 50000);
    }
    if (plainJoined.trim().length >= 20) {
      return cleanBody(plainJoined).substring(0, 50000);
    }
    if (htmlJoined) {
      const fromHtml = extractWpFormsPlainText(htmlJoined);
      if (fromHtml.length > 20) return fromHtml.substring(0, 50000);
      return cleanBody(htmlJoined).substring(0, 50000);
    }
    return cleanBody(plainJoined).substring(0, 50000);
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

  if (looksLikeEncryptedOrBinary(raw)) {
    return 'Message chiffré ou pièce jointe non lisible ici — ouvrez-le dans la boîte mail Hostinger';
  }

  if (looksLikeBase64(raw.trim())) {
    return cleanBody(decodeBase64Body(raw)).substring(0, 50000);
  }

  if (/WPForms|field-value|@media only screen/i.test(raw)) {
    const wp = extractWpFormsPlainText(raw);
    if (wp.length > 40) return wp.substring(0, 50000);
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
