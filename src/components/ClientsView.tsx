import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Users, Mail, ArrowLeft, Loader2, MessageSquare, Save, ChevronRight,
} from 'lucide-react';
import type { Contact, Email, ViewType } from '../types';
import { fetchContacts, fetchContactById, fetchContactEmails, updateContact } from '../data';

function fmtDate(iso: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function previewBody(body: string, max = 140) {
  const clean = (body || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

// ─── Conversation thread ─────────────────────────────────────────────────────

function ConversationThread({ contactId }: { contactId: string }) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchContactEmails(contactId).then(data => {
      setEmails(data);
      setLoading(false);
    });
  }, [contactId]);

  if (loading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)', display: 'flex', gap: 8, fontSize: 12 }}>
        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Chargement…
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
        Aucun message pour ce contact.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
      {emails.map(email => {
        const isSent = email.folder === 'INBOX.Sent' || email.folder === 'SENT';
        const open = expanded === email.id;
        return (
          <div
            key={email.id}
            style={{
              borderRadius: 10,
              border: `1px solid ${isSent ? 'rgba(124,58,237,0.25)' : 'var(--border-color)'}`,
              background: isSent ? 'rgba(124,58,237,0.04)' : 'var(--bg-surface)',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => setExpanded(open ? null : email.id)}
              style={{ width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {email.subject || '(sans objet)'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {fmtDate(email.date)} · {fmtTime(email.date)}
                    {' · '}
                    <span style={{ color: isSent ? '#7c3aed' : '#0891b2', fontWeight: 600 }}>
                      {isSent ? 'Envoyé' : 'Reçu'}
                    </span>
                  </div>
                  {!open && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.4 }}>
                      {previewBody(email.bodyText)}
                    </div>
                  )}
                </div>
                <ChevronRight size={14} color="var(--text-muted)" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0, marginTop: 2 }} />
              </div>
            </button>
            {open && (
              <div style={{
                padding: '0 14px 14px',
                fontSize: 12,
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.55,
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: 12,
                maxHeight: 400,
                overflowY: 'auto',
              }}>
                {email.bodyText || '(corps vide)'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Contact profile (editable) ──────────────────────────────────────────────

function ContactProfile({ contact, onSaved }: { contact: Contact; onSaved: (c: Contact) => void }) {
  const [form, setForm] = useState({
    name: contact.name,
    email: contact.email,
    phone: contact.phone || '',
    address: contact.address || '',
    postalCode: contact.postalCode || '',
    country: contact.country || '',
    nationality: contact.nationality || '',
    notes: contact.notes || '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      name: contact.name,
      email: contact.email,
      phone: contact.phone || '',
      address: contact.address || '',
      postalCode: contact.postalCode || '',
      country: contact.country || '',
      nationality: contact.nationality || '',
      notes: contact.notes || '',
    });
  }, [contact]);

  async function save() {
    setSaving(true);
    await updateContact(contact.id, form);
    onSaved({ ...contact, ...form });
    setSaving(false);
  }

  const field = (label: string, key: keyof typeof form, multiline = false) => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      {multiline ? (
        <textarea
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          rows={3}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12, fontFamily: 'var(--font-sans)', resize: 'vertical' }}
        />
      ) : (
        <input
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12 }}
        />
      )}
    </div>
  );

  return (
    <div style={{ padding: 16, background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-color)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
        Fiche contact
      </div>
      {field('Nom', 'name')}
      {field('Email', 'email')}
      {field('Téléphone', 'phone')}
      {field('Adresse', 'address')}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>{field('Code postal', 'postalCode')}</div>
        <div>{field('Pays', 'country')}</div>
      </div>
      {field('Nationalité', 'nationality')}
      {field('Notes', 'notes', true)}
      <button
        type="button"
        onClick={save}
        disabled={saving}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
          padding: '8px 14px', borderRadius: 8, border: 'none',
          background: 'var(--brand)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}
      >
        {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
        Enregistrer
      </button>
    </div>
  );
}

// ─── Main view ───────────────────────────────────────────────────────────────

export default function ClientsView({ onNavigate: _onNavigate }: { onNavigate?: (view: ViewType) => void }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchContacts().then(data => { setContacts(data); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selectedId) { setSelected(null); return; }
    fetchContactById(selectedId).then(setSelected);
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return contacts;
    return contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.lastSubject || '').toLowerCase().includes(q)
    );
  }, [contacts, search]);

  if (selectedId && selected) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-surface)' }}>
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-body)', cursor: 'pointer', display: 'flex' }}
          >
            <ArrowLeft size={16} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>{selected.name}</h1>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{selected.email} · {(selected.messageCount || 0)} messages</p>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 16, padding: 20 }}>
          <ContactProfile contact={selected} onSaved={setSelected} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <MessageSquare size={14} /> Conversation
            </div>
            <ConversationThread contactId={selected.id} />
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>Clients</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {contacts.length} personnes · conversations synchronisées depuis la boîte mail
          </p>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10,
        border: '1px solid var(--border-color)', background: 'var(--bg-surface)', marginBottom: 16,
      }}>
        <Search size={14} color="var(--text-muted)" />
        <input
          type="search"
          placeholder="Rechercher par nom, email ou sujet…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ border: 'none', background: 'none', flex: 1, fontSize: 12, outline: 'none' }}
        />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
          Chargement…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map((c, i) => (
            <motion.button
              key={c.id}
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.4) }}
              onClick={() => setSelectedId(c.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
                cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand-border)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: 'var(--brand-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Users size={18} color="var(--brand)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.lastSubject || c.email}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtDate(c.lastContactDate)}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#0891b2', marginTop: 2 }}>
                  <Mail size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 3 }} />
                  {c.messageCount || 0}
                </div>
              </div>
              <ChevronRight size={16} color="var(--text-muted)" />
            </motion.button>
          ))}
          {filtered.length === 0 && (
            <p style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 12 }}>Aucun résultat.</p>
          )}
        </div>
      )}
    </motion.div>
  );
}
