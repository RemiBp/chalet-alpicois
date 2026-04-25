import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, RefreshCw, Inbox, Send, Mail, ArrowLeft } from 'lucide-react';
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
  if (days < 365) return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
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

function extractBodyPreview(body: string, maxLen = 120): string {
  if (!body) return '';
  const clean = body
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > maxLen ? clean.substring(0, maxLen) + '…' : clean;
}

// ─── EMAIL DETAIL VIEW ────────────────────────────

function EmailDetailView({ email, onBack }: { email: Email; onBack: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <button
        onClick={onBack}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 8,
          border: '1px solid var(--border-color)',
          background: 'var(--bg-surface)',
          cursor: 'pointer',
          fontSize: 12,
          color: 'var(--text-secondary)',
          marginBottom: 16,
          transition: 'all 0.15s',
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
        {/* En-tête */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, lineHeight: 1.4 }}>
            {email.subject}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: email.isFromGuest ? 'var(--info-dim)' : 'var(--brand-dim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 13,
              color: email.isFromGuest ? 'var(--info)' : 'var(--brand)',
              flexShrink: 0,
            }}>
              {getInitials(email.senderName)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {email.senderName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {email.sender}
              </div>
            </div>
            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              textAlign: 'right',
            }}>
              <div>{new Date(email.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
              <div style={{ marginTop: 2 }}>{new Date(email.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </div>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 6,
            color: email.isFromGuest ? 'var(--info)' : 'var(--brand)',
            background: email.isFromGuest ? 'var(--info-dim)' : 'var(--brand-dim)',
          }}>
            {email.folder === 'INBOX' ? 'Reçu' : 'Envoyé'}
          </div>
        </div>

        {/* Corps */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.8,
            whiteSpace: 'pre-wrap',
            fontFamily: 'var(--font-sans)',
          }}>
            {email.bodyText || '(Aucun contenu textuel)'}
          </div>
        </div>
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

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [search, folder]);

  const filteredEmails = useMemo(() => {
    let filtered = emails;
    if (folder === 'inbox') filtered = filtered.filter(e => e.folder === 'INBOX');
    if (folder === 'sent') filtered = filtered.filter(e => e.folder === 'SENT');
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

  // Sélection
  if (selectedEmailId) {
    const email = emails.find(e => e.id === selectedEmailId);
    if (!email) return null;
    return (
      <div style={{ padding: 24 }}>
        <EmailDetailView email={email} onBack={() => setSelectedEmailId(null)} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ padding: 24 }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Emails</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {filteredEmails.length} message{filteredEmails.length > 1 ? 's' : ''} · contact@alpicois-laplagne.fr
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid var(--border-color)',
            background: 'var(--bg-surface)',
            color: 'var(--text-secondary)',
            fontSize: 12,
            fontWeight: 500,
            cursor: isLoading ? 'default' : 'pointer',
            opacity: isLoading ? 0.6 : 1,
            transition: 'all 0.15s',
          }}
        >
          <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
          Synchroniser
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'all' as const, label: 'Tous', icon: Inbox, count: emails.length },
            { key: 'inbox' as const, label: 'Reçus', icon: Inbox, count: emails.filter(e => e.folder === 'INBOX').length },
            { key: 'sent' as const, label: 'Envoyés', icon: Send, count: emails.filter(e => e.folder === 'SENT').length },
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
                  gap: 5,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 11,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--brand)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--brand-dim)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <Icon size={14} />
                {tab.label}
                <span style={{
                  fontSize: 10,
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: isActive ? 'var(--brand-light)' : 'var(--bg-surface-alt)',
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
          padding: '6px 10px',
          borderRadius: 8,
          border: '1px solid var(--border-color)',
          background: 'var(--bg-surface)',
          maxWidth: 320,
          transition: 'border-color 0.15s',
        }}>
          <Search size={13} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Rechercher par nom, sujet, contenu..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              border: 'none',
              background: 'none',
              fontSize: 11,
              flex: 1,
              outline: 'none',
              color: 'var(--text-primary)',
              width: '100%',
            }}
          />
        </div>
      </div>

      {/* Loading state */}
      {isLoading && emails.length === 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 60,
          color: 'var(--text-muted)',
          fontSize: 13,
        }}>
          Chargement des emails...
        </div>
      )}

      {/* Email list */}
      <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <AnimatePresence mode="popLayout">
          {currentPage.map((email, i) => (
            <motion.div
              key={email.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ delay: i * 0.008 }}
              onClick={() => setSelectedEmailId(email.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseOver={e => {
                e.currentTarget.style.borderColor = 'var(--brand-light)';
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: email.isFromGuest ? 'linear-gradient(135deg, var(--info-dim), #dbeafe)' : 'linear-gradient(135deg, var(--brand-dim), #fef3c7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 12,
                color: email.isFromGuest ? 'var(--info)' : 'var(--brand)',
                flexShrink: 0,
              }}>
                {getInitials(email.senderName)}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 200,
                  }}>
                    {email.senderName}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {email.sender}
                  </span>
                </div>
                <div style={{
                  fontSize: 11,
                  color: 'var(--text-primary)',
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginBottom: 2,
                }}>
                  {email.subject}
                </div>
                <div style={{
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 500,
                }}>
                  {extractBodyPreview(email.bodyText)}
                </div>
              </div>

              {/* Date + badge */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {formatDate(email.date)}
                </span>
                <span style={{
                  fontSize: 9,
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: 4,
                  color: email.isFromGuest ? 'var(--info)' : 'var(--brand)',
                  background: email.isFromGuest ? 'var(--info-dim)' : 'var(--brand-dim)',
                }}>
                  {email.isFromGuest ? 'Client' : 'Nous'}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Empty state */}
        {!isLoading && filteredEmails.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 60,
            color: 'var(--text-muted)',
            fontSize: 13,
            gap: 8,
          }}>
            <Mail size={32} opacity={0.3} />
            <span>Aucun email trouvé</span>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          marginTop: 20,
          padding: '12px 0',
        }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
              fontSize: 11,
              color: page === 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
              cursor: page === 0 ? 'default' : 'pointer',
              opacity: page === 0 ? 0.5 : 1,
            }}
          >
            ← Précédent
          </button>

          <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '0 8px' }}>
            Page {page + 1} / {pageCount}
          </span>

          <button
            onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
              fontSize: 11,
              color: page >= pageCount - 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
              cursor: page >= pageCount - 1 ? 'default' : 'pointer',
              opacity: page >= pageCount - 1 ? 0.5 : 1,
            }}
          >
            Suivant →
          </button>
        </div>
      )}
    </motion.div>
  );
}
