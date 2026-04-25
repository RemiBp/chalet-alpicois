import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, RefreshCw, Inbox, Send, Mail, ArrowLeft,
  ChevronDown, ExternalLink, User,
} from 'lucide-react';
import type { Email } from '../types';
import { fetchEmails } from '../data';

// ─── HELPERS ──────────────────────────────────────

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days} jours`;
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateFull(dateStr: string) {
  const d = new Date(dateStr);
  return {
    date: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    time: d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  };
}

function getInitials(name: string): string {
  return name
    .split(/[\s-]+/)
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function extractBodyPreview(body: string, maxLen = 180): string {
  if (!body) return '';
  const clean = body
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > maxLen ? clean.substring(0, maxLen) + '…' : clean;
}

/**
 * Décode le quoted-printable (MIME Content-Transfer-Encoding).
 * Ex: =0A → \n, =09 → \t, =C3=A9 → é, =E9 → é (latin1 vers utf8)
 */
function decodeQuotedPrintable(str: string): string {
  if (!str || !/=[0-9A-Fa-f]{2}/.test(str)) return str;

  // Soft line breaks: =\r\n, =\n → supprimer (continuation de ligne)
  let decoded = str.replace(/=\r?\n/g, '');

  // Remplacer les séquences =XX
  const bytes: number[] = [];
  const len = decoded.length;
  let i = 0;
  while (i < len) {
    if (decoded[i] === '=' && i + 2 < len && /^[0-9A-Fa-f]{2}$/.test(decoded.substring(i + 1, i + 3))) {
      bytes.push(parseInt(decoded.substring(i + 1, i + 3), 16));
      i += 3;
    } else {
      bytes.push(decoded.charCodeAt(i));
      i++;
    }
  }

  // Convertir en string UTF-8
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
  } catch {
    return decoded;
  }
}

/**
 * Nettoie un body d'email pour le rendre lisible :
 * - Décode quoted-printable
 * - Enlève le CSS/HTML complet (balises, stylesheets embarqués)
 * - Enlève les blocs <style>, @media, inline CSS
 * - Préserve uniquement le texte lisible
 */
function cleanEmailBody(raw: string): string {
  if (!raw) return '';

  let text = raw;

  // 1. Décode quoted-printable
  text = decodeQuotedPrintable(text);

  // 2. Enlève les blocs <style>...</style>
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // 3. Enlève les balises HTML, garde leur contenu textuel
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-zA-Z]+;/g, '');

  // 4. Enlève les blocs CSS (@media, @font-face, etc.)
  text = text.replace(/@media[\s\S]*?\{[\s\S]*?\}\s*\}/gi, '');
  text = text.replace(/@[a-z-]+\s+[\s\S]*?\{[\s\S]*?\}/gi, '');

  // 5. Enlève les sélecteurs CSS orphelins { ... }
  text = text.replace(/[a-zA-Z.#][\w-]*[\s,.#][\w\s,.#()-]*\{[^}]*\}/g, '');

  // 6. Détecter et extraire le message utile des formulaires WPForms
  // Les champs du formulaire sont précédés de "Votre nom", "Email", "Your Message" etc.
  // Chercher le message après le champ "Your Message" ou "Votre nom" suivi de contenu
  
  // Stratégie : enlever tout ce qui est avant la première occurrence d'un marqueur de début de message
  const messageMarkers = [
    'Bonjour', 'bonjour', 'Bonjour,', 'Cher', 'cher', 'Chère', 'chère',
    'Hello', 'hello', 'Dear', 'dear',
  ];
  
  let messageStart = -1;
  for (const marker of messageMarkers) {
    const idx = text.indexOf(marker);
    if (idx >= 0) {
      // Vérifier que ce n'est pas dans une citation
      const before = text.substring(Math.max(0, idx - 20), idx);
      if (!before.includes('>') || before.trim().length < 3) {
        if (messageStart === -1 || idx < messageStart) {
          messageStart = idx;
        }
      }
    }
  }
  
  if (messageStart > 0) {
    text = text.substring(messageStart);
  }

  // 7. Enlève les lignes de pure CSS résiduelles
  const lines = text.split('\n');
  const cleanLines = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    // Lignes CSS claires (commencent par un sélecteur CSS)
    if (/^[.#@a-zA-Z][\w-]*[{]/.test(trimmed)) return false;
    if (/^\.wpforms/i.test(trimmed)) return false;
    if (/^@(media|import|font-face|keyframes|supports)/i.test(trimmed)) return false;
    if (/^[a-z-]+:\s*[^;]+;\s*$/.test(trimmed)) return false;
    // Garder tout le reste (y compris les lignes > 30 chars qui sont du texte)
    return true;
  });

  text = cleanLines.join('\n');

  // 8. Restaurer les sauts de ligne manquants dans le texte compacté
  text = text
    // Après les formules de politesse
    .replace(/\b(Bonjour[,.!?]?)\s*/g, '$1\n')
    .replace(/\b(Merci[,.!?]?)\s*/g, '$1\n')
    .replace(/\b(Cordialement[,]?)\s*/g, '$1\n')
    .replace(/\b(Bien cordialement[,]?)\s*/gi, '$1\n')
    .replace(/\b(Sincères? salutations[,]?)\s*/gi, '$1\n')
    .replace(/\b(Bien à vous[,]?)\s*/gi, '$1\n')
    .replace(/\b(Dans l[’']attente[,]?)\s*/gi, '$1\n')
    .replace(/\b(Je vous prie[^.]+\.)\s*/gi, '$1\n')
    .replace(/\b(Recevez[^.]+\.)\s*/gi, '$1\n')
    // Après les marqueurs de formulaire (Votre nom, Email, Your Message = ...)
    .replace(/^(Votre nom|Email|Your Message|Votre message)\s*/gim, '')
    // Après point d'interrogation suivi directement d'une lettre (pas de saut de ligne)
    .replace(/\?([A-Za-z])/g, '?\n$1')
    .replace(/\?([A-Za-zÀ-ÿ])/g, '?\n$1')
    // Après point suivi directement d'une lettre (pas de saut de ligne)
    .replace(/\.([A-Za-zÀ-ÿ])/g, '.\n$1')
    // "D'avance" commence souvent une phrase
    .replace(/\?D['']/g, '?\nD\'')
    // Nettoyer les sauts de ligne excessifs créés
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +$|^ +/gm, '')
    .trim();

  return text;
}

/**
 * Transforme un body text nettoyé en React fragments avec URLs cliquables.
 */
function renderBodyWithLinks(body: string): React.ReactNode[] {
  if (!body) return ['(Aucun contenu textuel)'];

  const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;
  const parts = body.split(URL_REGEX);
  const nodes: React.ReactNode[] = [];
  let key = 0;

  for (const part of parts) {
    if (!part) continue;

    const isUrl = /^https?:\/\//i.test(part);
    if (isUrl) {
      const displayUrl = part.length > 80 ? part.substring(0, 55) + '…' + part.slice(-22) : part;
      nodes.push(
        <a
          key={key++}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#2563eb',
            textDecoration: 'underline',
            textUnderlineOffset: 2,
            wordBreak: 'break-all',
          }}
        >
          {displayUrl}
        </a>
      );
    } else {
      // Découper par lignes
      const lines = part.split('\n');
      lines.forEach((line, li) => {
        if (li > 0) nodes.push(<br key={key++} />);
        if (line.trim()) {
          nodes.push(<span key={key++}>{line}</span>);
        }
      });
    }
  }

  return nodes;
}

/**
 * Extrait et rend la partie "fraîche" du message (enlève les citations de réponses).
 */
function renderFreshBody(raw: string): { nodes: React.ReactNode[]; hasQuote: boolean } {
  if (!raw) return { nodes: ['(Aucun contenu textuel)'], hasQuote: false };

  // Nettoyer d'abord le body
  const body = cleanEmailBody(raw);
  if (!body) return { nodes: ['(Aucun contenu textuel)'], hasQuote: false };

  const lines = body.split('\n');
  const quoteStartMarkers = [
    /^(Le\s+.+a\s+écrit\s*:?\s*)$/i,
    /^(-{3,}\s*Forwarded message\s*-{3,})/i,
    /^On\s+.+wrote:/i,
    /^De\s*:/i,
    /^Envoyé\s*:/i,
    /^À\s*:/i,
    /^Objet\s*:/i,
    /^Subject\s*:/i,
    /^From\s*:/i,
  ];

  let splitIndex = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (quoteStartMarkers.some(re => re.test(lines[i].trim()))) {
      splitIndex = i;
      break;
    }
  }

  const freshText = lines.slice(0, splitIndex).join('\n').trim();
  const quotedText = lines.slice(splitIndex).join('\n').trim();

  return {
    nodes: freshText ? renderBodyWithLinks(freshText) : ['(Aucun contenu textuel)'],
    hasQuote: quotedText.length > 0 && splitIndex < lines.length - 1,
  };
}

// ─── STYLES PARTAGÉS ──────────────────────────────

const btnBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderRadius: 8,
  border: 'none',
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.15s',
};

const inputBase: React.CSSProperties = {
  border: 'none',
  background: 'none',
  fontSize: 12,
  flex: 1,
  outline: 'none',
  color: 'var(--text-primary)',
  width: '100%',
};

// ─── EMAIL DETAIL VIEW ────────────────────────────

function EmailDetailView({ email, onBack }: { email: Email; onBack: () => void }) {
  const fmt = formatDateFull(email.date);
  const { nodes: bodyNodes, hasQuote } = renderFreshBody(email.bodyText);
  const [showQuote, setShowQuote] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <button
        onClick={onBack}
        style={{
          ...btnBase,
          border: '1px solid var(--border-color)',
          background: 'var(--bg-surface)',
          color: 'var(--text-secondary)',
          marginBottom: 16,
        }}
        onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-surface-hover)')}
        onMouseOut={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
      >
        <ArrowLeft size={14} />
        Retour aux emails
      </button>

      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
        maxWidth: 800,
      }}>
        {/* Header */}
        <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: 16,
            lineHeight: 1.4,
          }}>
            {email.subject}
          </h2>

          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {/* Avatar */}
            <div style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: email.isFromGuest
                ? 'linear-gradient(135deg, #dbeafe, #bfdbfe)'
                : 'linear-gradient(135deg, #fef3c7, #fde68a)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 15,
              color: email.isFromGuest ? '#1d4ed8' : '#b45309',
              flexShrink: 0,
            }}>
              {getInitials(email.senderName)}
            </div>

            {/* Infos */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {email.senderName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                {email.sender}
              </div>
              {email.recipients && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                  À : {email.recipients}
                </div>
              )}
            </div>

            {/* Date */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                {fmt.date}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                {fmt.time}
              </div>
            </div>
          </div>

          {/* Badges */}
          <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 6,
              color: email.isFromGuest ? '#1d4ed8' : '#b45309',
              background: email.isFromGuest ? '#eff6ff' : '#fffbeb',
            }}>
              <Mail size={11} />
              {email.folder === 'INBOX' ? 'Message reçu' : email.folder === 'SENT' || email.folder === 'INBOX.Sent' ? 'Message envoyé' : email.folder}
            </span>
            {email.isFromGuest && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10,
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 6,
                color: '#059669',
                background: '#ecfdf5',
              }}>
                <User size={11} />
                Client
              </span>
            )}
          </div>
        </div>

        {/* Corps du message */}
        <div style={{ padding: '24px 28px' }}>
          <div style={{
            fontSize: 13.5,
            color: 'var(--text-secondary)',
            lineHeight: 1.9,
            fontFamily: 'var(--font-sans)',
            maxHeight: 600,
            overflowY: 'auto',
          }}>
            {bodyNodes}
          </div>

          {/* Citation / réponse précédente — pliée */}
          {hasQuote && (
            <div style={{ marginTop: 16 }}>
              <button
                onClick={() => setShowQuote(!showQuote)}
                style={{
                  ...btnBase,
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface-alt)',
                  color: 'var(--text-muted)',
                  fontSize: 10.5,
                }}
              >
                {showQuote ? 'Masquer' : 'Afficher'} le message précédent
                <ChevronDown size={11}
                  style={{
                    transform: showQuote ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }}
                />
              </button>
              {showQuote && (
                <div style={{
                  marginTop: 10,
                  padding: '14px 16px',
                  borderRadius: 8,
                  background: 'var(--bg-surface-alt)',
                  border: '1px solid var(--border-color)',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-sans)',
                  maxHeight: 300,
                  overflowY: 'auto',
                  borderLeft: '3px solid var(--border-color)',
                }}>
                  {email.bodyText}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Infos techniques */}
        <details style={{
          borderTop: '1px solid var(--border-color)',
          padding: '12px 28px',
        }}>
          <summary style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            userSelect: 'none',
          }}>
            <ExternalLink size={11} />
            Détails techniques
          </summary>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8 }}>
            <div>ID : {email.id}</div>
            <div>Message-ID : {email.messageId}</div>
            <div>Date brute : {email.date}</div>
            <div>Dossier : {email.folder}</div>
          </div>
        </details>
      </div>
    </motion.div>
  );
}

// ─── EMAIL ROW ────────────────────────────────────

function EmailRow({ email, isSelected, onClick }: {
  email: Email;
  isSelected: boolean;
  onClick: () => void;
}) {
  const bodyPreview = extractBodyPreview(email.bodyText);
  const fmt = formatDate(email.date);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 12,
        alignItems: 'center',
        padding: '12px 18px',
        borderRadius: 'var(--radius-md)',
        background: isSelected ? 'var(--brand-dim)' : 'var(--bg-surface)',
        border: `1px solid ${isSelected ? 'var(--brand-light)' : 'var(--border-color)'}`,
        cursor: 'pointer',
        transition: 'all 0.12s ease',
      }}
      onMouseOver={e => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = 'var(--brand-light)';
          e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
          e.currentTarget.style.background = 'var(--bg-surface-hover)';
        }
      }}
      onMouseOut={e => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = 'var(--border-color)';
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.background = 'var(--bg-surface)';
        }
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: email.isFromGuest
          ? 'linear-gradient(135deg, #dbeafe, #bfdbfe)'
          : 'linear-gradient(135deg, #fef3c7, #fde68a)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: 13,
        color: email.isFromGuest ? '#1d4ed8' : '#b45309',
        flexShrink: 0,
      }}>
        {getInitials(email.senderName)}
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 2,
        }}>
          <span style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 180,
          }}>
            {email.senderName}
          </span>
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 150,
          }}>
            {email.sender}
          </span>
          <span style={{
            fontSize: 9.5,
            fontWeight: 600,
            padding: '1px 6px',
            borderRadius: 4,
            color: email.isFromGuest ? '#1d4ed8' : '#b45309',
            background: email.isFromGuest ? '#eff6ff' : '#fffbeb',
            flexShrink: 0,
          }}>
            {email.isFromGuest ? 'Client' : 'Nous'}
          </span>
        </div>
        <div style={{
          fontSize: 11.5,
          color: 'var(--text-primary)',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: 3,
        }}>
          {email.subject}
        </div>
        {bodyPreview && (
          <div style={{
            fontSize: 10.5,
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.4,
          }}>
            {bodyPreview}
          </div>
        )}
      </div>

      {/* Date */}
      <div style={{
        fontSize: 10.5,
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        alignSelf: 'flex-start',
        marginTop: 2,
      }}>
        {fmt}
      </div>
    </motion.div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────

const PAGE_SIZE = 50;

export default function EmailsView() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState<'all' | 'inbox' | 'sent'>('all');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsLoading(true);
    fetchEmails().then(data => {
      setEmails(data);
      setIsLoading(false);
    });
  }, []);

  useEffect(() => { setPage(0); }, [search, folder]);

  const mailboxStats = useMemo(() => ({
    all: emails.length,
    inbox: emails.filter(e => e.folder === 'INBOX').length,
    sent: emails.filter(e => e.folder === 'SENT' || e.folder === 'INBOX.Sent').length,
  }), [emails]);

  const filteredEmails = useMemo(() => {
    let filtered = emails;
    if (folder === 'inbox') filtered = filtered.filter(e => e.folder === 'INBOX');
    if (folder === 'sent') filtered = filtered.filter(e => e.folder === 'SENT' || e.folder === 'INBOX.Sent');
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(e =>
        e.subject.toLowerCase().includes(q) ||
        e.senderName.toLowerCase().includes(q) ||
        e.sender.toLowerCase().includes(q) ||
        e.bodyText.toLowerCase().includes(q)
      );
    }
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [emails, search, folder]);

  const pageCount = Math.ceil(filteredEmails.length / PAGE_SIZE);
  const currentPage = filteredEmails.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    fetchEmails().then(data => {
      setEmails(data);
      setIsLoading(false);
    });
  }, []);

  if (selectedEmailId) {
    const email = emails.find(e => e.id === selectedEmailId);
    if (!email) return null;
    return (
      <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
        <EmailDetailView email={email} onBack={() => setSelectedEmailId(null)} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
            Emails
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {filteredEmails.length} message{filteredEmails.length > 1 ? 's' : ''}
            {search && ` · recherche : "${search}"`}
            {filteredEmails.length !== mailboxStats.all && ` (${mailboxStats.all} total)`}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          style={{
            ...btnBase,
            border: '1px solid var(--border-color)',
            background: 'var(--bg-surface)',
            color: 'var(--text-secondary)',
            opacity: isLoading ? 0.6 : 1,
            cursor: isLoading ? 'default' : 'pointer',
          }}
        >
          <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
          Synchroniser
        </button>
      </div>

      {/* Filtres + Recherche */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-surface-alt)', padding: 3, borderRadius: 10 }}>
          {[
            { key: 'all' as const, label: 'Tous', icon: Mail, count: mailboxStats.all },
            { key: 'inbox' as const, label: 'Reçus', icon: Inbox, count: mailboxStats.inbox },
            { key: 'sent' as const, label: 'Envoyés', icon: Send, count: mailboxStats.sent },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = folder === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFolder(tab.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 11.5,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--brand)' : 'var(--text-secondary)',
                  background: isActive ? '#fff' : 'transparent',
                  boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <Icon size={14} />
                {tab.label}
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: isActive ? 'var(--brand-dim)' : 'var(--bg-surface)',
                  color: isActive ? 'var(--brand)' : 'var(--text-muted)',
                }}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 12px',
          borderRadius: 8,
          border: '1px solid var(--border-color)',
          background: 'var(--bg-surface)',
          minWidth: 200,
          maxWidth: 360,
          transition: 'border-color 0.15s',
        }}>
          <Search size={13} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Rechercher par nom, sujet, contenu..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={inputBase}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                ...btnBase,
                padding: '2px 6px',
                background: 'none',
                color: 'var(--text-muted)',
                fontSize: 13,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading && emails.length === 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 80,
          color: 'var(--text-muted)',
          fontSize: 13,
          gap: 10,
        }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
          Chargement des emails...
        </div>
      )}

      {/* Liste */}
      {!isLoading && (
        <>
          {filteredEmails.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
              padding: '0 4px',
            }}>
              <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                {filteredEmails.length} résultat{filteredEmails.length > 1 ? 's' : ''}
                {pageCount > 1 && ` · Page ${page + 1}/${pageCount}`}
              </span>
              {pageCount > 1 && (
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredEmails.length)}
                </span>
              )}
            </div>
          )}

          <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <AnimatePresence mode="popLayout">
              {currentPage.map((email) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  isSelected={selectedEmailId === email.id}
                  onClick={() => setSelectedEmailId(email.id)}
                />
              ))}
            </AnimatePresence>

            {filteredEmails.length === 0 && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 80,
                color: 'var(--text-muted)',
                fontSize: 13,
                gap: 10,
              }}>
                <Mail size={36} opacity={0.2} />
                <span style={{ fontWeight: 500 }}>Aucun email trouvé</span>
                {search && (
                  <span style={{ fontSize: 11 }}>
                    Essaie de modifier tes critères de recherche
                  </span>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Pagination */}
      {pageCount > 1 && !isLoading && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginTop: 20,
          padding: '12px 0',
        }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{
              ...btnBase,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
              color: page === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
              opacity: page === 0 ? 0.5 : 1,
              cursor: page === 0 ? 'default' : 'pointer',
            }}
          >
            ← Précédent
          </button>

          <div style={{ display: 'flex', gap: 3 }}>
            {Array.from({ length: Math.min(pageCount, 7) }, (_, i) => {
              let pageNum: number;
              if (pageCount <= 7) pageNum = i;
              else if (page < 3) pageNum = i;
              else if (page > pageCount - 4) pageNum = pageCount - 7 + i;
              else pageNum = page - 3 + i;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    border: 'none',
                    fontSize: 11,
                    fontWeight: page === pageNum ? 700 : 500,
                    color: page === pageNum ? 'var(--brand)' : 'var(--text-secondary)',
                    background: page === pageNum ? 'var(--brand-dim)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                >
                  {pageNum + 1}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
            style={{
              ...btnBase,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
              color: page >= pageCount - 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
              opacity: page >= pageCount - 1 ? 0.5 : 1,
              cursor: page >= pageCount - 1 ? 'default' : 'pointer',
            }}
          >
            Suivant →
          </button>
        </div>
      )}
    </motion.div>
  );
}
