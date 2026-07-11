/** Nettoyage affichage corps d'email (MIME, HTML, quoted-printable, base64, encodage). */

export type EmailContentKind = 'text' | 'image' | 'attachment' | 'mime' | 'encoding' | 'encrypted' | 'empty';

export interface EmailContentInfo {
  kind: EmailContentKind;
  label: string;
  filename?: string;
  cleanText: string;
}

const MOJIBAKE: [string, string][] = [
  ['Ã©', 'é'], ['Ã¨', 'è'], ['Ãª', 'ê'], ['Ã«', 'ë'],
  ['Ã ', 'à'], ['Ã¢', 'â'], ['Ã¤', 'ä'],
  ['Ã¹', 'ù'], ['Ã»', 'û'], ['Ã¼', 'ü'],
  ['Ã´', 'ô'], ['Ã¶', 'ö'], ['Ã²', 'ò'],
  ['Ã®', 'î'], ['Ã¯', 'ï'], ['Ã§', 'ç'],
  ['Å“', 'œ'], ['Å’', 'Œ'],
  ['Ã‰', 'É'], ['Ãˆ', 'È'], ['ÃŠ', 'Ê'],
  ['Ã€', 'À'], ['Ã‚', 'Â'], ['Ã‡', 'Ç'],
  ['â€™', "'"], ['â€œ', '"'], ['â€\u009d', '"'],
  ['â€"', '—'], ['â€"', '–'], ['â‚¬', '€'],
  ['Â«', '«'], ['Â»', '»'], ['Â ', ' '],
];

function decodeQuotedPrintable(str: string): string {
  if (!str || !/=[0-9A-Fa-f]{2}/.test(str)) return str;
  let decoded = str.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < decoded.length; i++) {
    if (decoded[i] === '=' && i + 2 < decoded.length && /^[0-9A-Fa-f]{2}$/.test(decoded.substring(i + 1, i + 3))) {
      bytes.push(parseInt(decoded.substring(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(decoded.charCodeAt(i));
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
  } catch {
    return decoded;
  }
}

function fixMojibake(str: string): string {
  if (!str) return '';
  for (const [bad, good] of MOJIBAKE) {
    if (str.includes(bad)) str = str.split(bad).join(good);
  }
  if (str.includes('\ufffd')) {
    try {
      const bytes = Uint8Array.from([...str].map(c => c.charCodeAt(0) & 0xff));
      const fixed = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      if (fixed && (fixed.match(/\ufffd/g) || []).length < (str.match(/\ufffd/g) || []).length) {
        str = fixed;
      }
    } catch { /* ignore */ }
    try {
      const bytes = Uint8Array.from([...str].map(c => c.charCodeAt(0) & 0xff));
      const fixed = new TextDecoder('iso-8859-1').decode(bytes);
      const asUtf8 = new TextDecoder('utf-8', { fatal: false }).decode(
        Uint8Array.from([...fixed].map(c => c.charCodeAt(0) & 0xff)),
      );
      if (asUtf8 && !asUtf8.includes('\ufffd') && /[éèêàâùîç]/i.test(asUtf8)) str = asUtf8;
    } catch { /* ignore */ }
  }
  return str;
}

function brokenEncodingRatio(text: string): number {
  return (text.match(/\ufffd/g) || []).length / Math.max(text.length, 1);
}

function extractReadableSnippet(text: string, maxLen = 140): string {
  const parts = text
    .split(/\n|(?<=[.!?])\s+/)
    .map(p => p.replace(/\ufffd+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 12 && !p.includes('\ufffd'));
  const best = parts.sort((a, b) => b.length - a.length)[0] || text.replace(/\ufffd+/g, ' ').replace(/\s+/g, ' ').trim();
  return best.length > maxLen ? `${best.slice(0, maxLen)}…` : best;
}

function looksLikeBase64(text: string): boolean {
  if (!text || text.length < 40) return false;
  const sample = text.replace(/\s/g, '').slice(0, 800);
  if (!/^[A-Za-z0-9+/=]+$/.test(sample)) return false;
  try {
    const binary = atob(sample.slice(0, sample.length - (sample.length % 4)));
    return binary.length > 20 && /[a-zA-ZÀ-ÿ]{3,}/.test(binary);
  } catch {
    return false;
  }
}

function looksLikeImagePayload(text: string): boolean {
  const t = text.slice(0, 4000);
  if (/\/9j\/|iVBORw0KGgo|R0lGOD|Content-Type:\s*image\//i.test(t)) return true;
  if (/Content-Disposition:\s*inline/i.test(t) && /name=[^\s;]+\.(jpe?g|png|gif|heic)/i.test(t)) return true;
  if (/x-apple-part-url/i.test(t) && /image\//i.test(t)) return true;
  const stripped = text.replace(/\s/g, '');
  if (stripped.length > 800 && /^[A-Za-z0-9+/=]+$/.test(stripped.slice(0, 2000))) {
    try {
      const head = atob(stripped.slice(0, 80));
      if (head.startsWith('\xff\xd8\xff') || head.includes('PNG')) return true;
    } catch { /* ignore */ }
  }
  return false;
}

/** S/MIME, PGP, or binary blobs wrongly stored as body_text (look “cryptés”). */
function looksLikeEncryptedOrBinary(text: string): boolean {
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
  // Un corps qui combine octets de contrôle et presque aucun mot est un binaire
  // mal extrait, même si son ratio reste sous 12 % (cas S/MIME observé).
  if (weird / sample.length > 0.08 && spaces <= 1) return true;
  if (weird / sample.length > 0.04 && words < 3) return true;
  if (weird / sample.length > 0.12) return true;
  // Dense binary / misdecoded attachment: almost no whitespace, few real words
  if (sample.length > 40 && spaces < 3 && words < 3) return true;
  if (text.length < 220 && asciiLetters < 12 && spaces < 4 && /[^\x09\x0A\x0D\x20-\x7E]/.test(sample)) return true;
  if (text.length < 160 && asciiLetters < 8 && spaces < 2) return true;
  return false;
}

function extractAttachmentFilename(raw: string): string | undefined {
  const m = raw.match(/name=([^\s;\n"]+\.(?:jpe?g|png|gif|heic|pdf|docx?))/i)
    || raw.match(/filename="?([^"\n;]+\.(?:jpe?g|png|gif|heic|pdf|docx?))"?/i);
  return m?.[1]?.replace(/^["']|["']$/g, '');
}

function decodeBase64Body(text: string): string {
  const stripped = text.replace(/\s/g, '');
  try {
    const binary = atob(stripped);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return fixMojibake(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
  } catch {
    return text;
  }
}

function stripMimeArtifacts(text: string): string {
  const boundary = text.match(/^--([^\s\n]+)/m)?.[1];
  if (boundary) {
    const sections = text.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    for (const section of sections) {
      if (/text\/plain/i.test(section) && !/image\//i.test(section)) {
        const parts = section.split(/\r?\n\r?\n/);
        if (parts.length > 1) {
          let content = parts.slice(1).join('\n\n').replace(/--\s*$/, '').trim();
          if (/quoted-printable/i.test(section)) content = decodeQuotedPrintable(content);
          if (/base64/i.test(section) && !/image\//i.test(section)) content = decodeBase64Body(content);
          if (content.length > 20 && !looksLikeImagePayload(content)) return content;
        }
      }
    }
  }

  let cleaned = text
    .replace(/Content-Type:[^\n]*\n/gi, '')
    .replace(/Content-Transfer-Encoding:[^\n]*\n/gi, '')
    .replace(/Content-Disposition:[^\n]*\n/gi, '')
    .replace(/charset=[^\n]*\n/gi, '')
    .replace(/^--[A-Za-z0-9_=.+-]+--?$/gm, '');

  const markers = ['Bonjour', 'Hello', 'Dear', 'Hallo', 'Hi ', 'Good morning', 'Cher ', 'Fwd:', 'Re:'];
  for (const marker of markers) {
    const idx = cleaned.indexOf(marker);
    if (idx >= 0 && idx < 1200) {
      cleaned = cleaned.slice(idx);
      break;
    }
  }
  return cleaned;
}

function processEmailBodyRaw(raw: string): string {
  let text = raw.trim();
  if (looksLikeBase64(text) && !looksLikeImagePayload(text)) {
    text = decodeBase64Body(text);
  }

  text = decodeQuotedPrintable(text);

  if (/^--[=_\w]/m.test(text) || /Content-Transfer-Encoding:/i.test(text)) {
    text = stripMimeArtifacts(text);
  }

  return fixMojibake(text)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-zA-Z]+;/g, '')
    .replace(/\ufffd+/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function classifyEmailContent(raw: string): EmailContentInfo {
  if (!raw?.trim()) {
    return { kind: 'empty', label: 'Message vide', cleanText: '' };
  }

  const filename = extractAttachmentFilename(raw);
  if (looksLikeImagePayload(raw)) {
    return {
      kind: 'image',
      label: filename ? `Photo jointe · ${filename}` : 'Photo jointe',
      filename,
      cleanText: '',
    };
  }

  if (looksLikeEncryptedOrBinary(raw)) {
    return {
      kind: 'encrypted',
      label: 'Message chiffré ou pièce jointe non lisible ici — ouvrez-le dans la boîte mail Hostinger',
      filename,
      cleanText: '',
    };
  }

  const fffdCount = (raw.match(/\ufffd/g) || []).length;
  const encRatio = brokenEncodingRatio(raw);
  if (fffdCount >= 8 || encRatio > 0.008 || (fffdCount >= 3 && encRatio > 0.004)) {
    const snippet = extractReadableSnippet(raw);
    return {
      kind: 'encoding',
      label: snippet ? `Encodage partiel · ${snippet}` : 'Encodage partiel (accents manquants)',
      cleanText: snippet,
    };
  }

  if (/^Content-Type:\s*multipart\//im.test(raw.slice(0, 500)) && !/Bonjour|Hello|Cher /i.test(raw.slice(0, 3000))) {
    const fn = filename || 'pièce jointe';
    if (!/[a-zA-ZÀ-ÿ]{8,}/.test(raw.replace(/[A-Za-z0-9+/=\s-]/g, '').slice(0, 2000))) {
      return { kind: 'attachment', label: `Pièce jointe · ${fn}`, filename: fn, cleanText: '' };
    }
  }

  const cleanText = processEmailBodyRaw(raw);
  const replacementRatio = (cleanText.match(/\ufffd/g) || []).length / Math.max(cleanText.length, 1);
  if (replacementRatio > 0.08 && cleanText.length < 400) {
    return { kind: 'mime', label: 'Contenu technique (encodage)', cleanText: cleanText.replace(/\ufffd+/g, ' ').slice(0, 200) };
  }

  return { kind: 'text', label: '', cleanText };
}

export function isGarbageEmailBody(body: string, subject = ''): boolean {
  if (!body || body.length < 20) return true;
  const info = classifyEmailContent(body);
  if (info.kind === 'image' || info.kind === 'attachment' || info.kind === 'encrypted') return false;
  const b = (info.cleanText || body).trim();
  if (looksLikeBase64(b) && info.kind === 'text') return false;
  if (/^WPForms/i.test(b) || b.includes('@media only screen')) return true;
  if (subject === 'New Entry: Contact Form 1' && b.includes('alpicois-laplagne.fr') && !/Bonjour|Hello|Dear|Cher/i.test(b)) return true;
  if (/^[A-Za-z0-9+/=]{200,}$/.test(b.replace(/\s/g, ''))) return true;
  return false;
}

export function cleanEmailBody(raw: string): string {
  if (!raw) return '';

  const info = classifyEmailContent(raw);
  if (info.kind === 'image' || info.kind === 'attachment' || info.kind === 'encrypted') return info.label;
  if (info.kind === 'mime' && !info.cleanText) return info.label;
  if (info.kind === 'encoding') return info.label || info.cleanText;

  return info.cleanText || processEmailBodyRaw(raw);
}

export function emailBodyPreview(raw: string, maxLen = 160): string {
  const info = classifyEmailContent(raw);
  if (info.kind === 'image' || info.kind === 'attachment' || info.kind === 'encrypted') return info.label;
  if (info.kind === 'mime' || info.kind === 'encoding') return info.label || info.cleanText;
  const clean = (info.cleanText || '').replace(/\s+/g, ' ').trim();
  if (!clean) return info.label || '(vide)';
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
}

export function isCondensedEmail(raw: string): boolean {
  const k = classifyEmailContent(raw).kind;
  return k === 'image' || k === 'attachment' || k === 'mime' || k === 'encoding' || k === 'encrypted';
}

/** Affichage sûr — ne doit jamais crasher React (corps MIME énormes, etc.). */
export function safeCleanEmailBody(raw: string): string {
  if (!raw) return '';
  try {
    return cleanEmailBody(raw);
  } catch {
    return raw.slice(0, 500).replace(/\s+/g, ' ').trim() || '(contenu non affichable)';
  }
}

export function safeEmailBodyPreview(raw: string, maxLen = 160): string {
  if (!raw) return '';
  try {
    return emailBodyPreview(raw, maxLen);
  } catch {
    const t = raw.replace(/\s+/g, ' ').trim();
    return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t || '(contenu non affichable)';
  }
}
