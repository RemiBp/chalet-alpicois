import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, RefreshCw, User, Inbox, Send, ChevronRight } from 'lucide-react';
import type { Email } from '../types';
import { mockEmails } from '../data';

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days} jours`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function EmailDetail({ email, onBack }: { email: Email; onBack: () => void }) {
  const thread = mockEmails.filter(e => e.threadId === email.threadId);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <button
        onClick={onBack}
        style={{
          display: 'flex',
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
        }}
      >
        <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
        Retour aux emails
      </button>

      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}>
        {/* Thread */}
        {thread.map((msg, i) => (
          <div
            key={msg.id}
            style={{
              padding: 20,
              borderBottom: i < thread.length - 1 ? '1px solid var(--border-color)' : 'none',
              background: msg.isFromGuest ? 'transparent' : 'var(--bg-surface-alt)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: msg.isFromGuest ? 'var(--info-dim)' : 'var(--brand-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <User size={14} color={msg.isFromGuest ? 'var(--info)' : 'var(--brand)'} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {msg.senderName}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {new Date(msg.date).toLocaleString('fr-FR')}
                  </div>
                </div>
              </div>
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 6,
                color: msg.isFromGuest ? 'var(--info)' : 'var(--brand)',
                background: msg.isFromGuest ? 'var(--info-dim)' : 'var(--brand-dim)',
              }}>
                {msg.isFromGuest ? 'Client' : 'Nous'}
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {msg.bodyText}
            </p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

export default function EmailsView() {
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState<'all' | 'inbox' | 'sent'>('all');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  const filteredEmails = useMemo(() => {
    let filtered = mockEmails;
    if (folder === 'inbox') filtered = filtered.filter(e => e.folder === 'INBOX');
    if (folder === 'sent') filtered = filtered.filter(e => e.folder === 'SENT');
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(e =>
        e.subject.toLowerCase().includes(q) ||
        e.senderName.toLowerCase().includes(q) ||
        e.bodyText.toLowerCase().includes(q)
      );
    }
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [search, folder]);

  if (selectedEmailId) {
    const email = mockEmails.find(e => e.id === selectedEmailId);
    if (!email) return null;
    return <EmailDetail email={email} onBack={() => setSelectedEmailId(null)} />;
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
            contact@alpicois-laplagne.fr
          </p>
        </div>
        <button
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
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} />
          Synchroniser
        </button>
      </div>

      {/* Folder tabs & search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'all' as const, label: 'Tous', icon: Inbox },
            { key: 'inbox' as const, label: 'Reçus', icon: Inbox },
            { key: 'sent' as const, label: 'Envoyés', icon: Send },
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
                }}
              >
                <Icon size={14} />
                {tab.label}
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
          maxWidth: 280,
        }}>
          <Search size={13} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              border: 'none',
              background: 'none',
              fontSize: 11,
              flex: 1,
              outline: 'none',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      {/* Email list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filteredEmails.map((email, i) => (
          <motion.div
            key={email.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => setSelectedEmailId(email.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              cursor: 'pointer',
              transition: 'border-color 0.15s ease',
            }}
          >
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: email.isFromGuest ? 'var(--info-dim)' : 'var(--brand-dim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <User size={15} color={email.isFromGuest ? 'var(--info)' : 'var(--brand)'} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {email.senderName}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {'<'} {email.sender} {'>'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {email.subject}
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {formatDate(email.date)}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
