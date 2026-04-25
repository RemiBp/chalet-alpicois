import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Users, Mail, Phone,
  CalendarDays, MessageSquare, UserPlus,
  Clock, Tag, Globe, Star, Save, X, ArrowLeft,
} from 'lucide-react';
import type { Contact, ContactStatus, ContactOrigin } from '../types';
import { fetchContacts, generateId } from '../data';

// ============ CONSTANTS ============

const statusConfig: Record<ContactStatus, { label: string; color: string; bg: string }> = {
  client: { label: 'Client', color: '#16a34a', bg: 'rgba(22, 163, 74, 0.12)' },
  prospect: { label: 'Prospect', color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)' },
  former_client: { label: 'Ancien client', color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)' },
};

const originLabels: Record<ContactOrigin, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  phone: 'Téléphone',
  website: 'Site web',
  recommendation: 'Recommandation',
  social: 'Réseaux sociaux',
  other: 'Autre',
};

const seasonColors = [
  { bg: 'rgba(13, 148, 136, 0.10)', text: '#0d9488' },
  { bg: 'rgba(37, 99, 235, 0.10)', text: '#2563eb' },
  { bg: 'rgba(124, 58, 237, 0.10)', text: '#7c3aed' },
  { bg: 'rgba(217, 119, 6, 0.10)', text: '#d97706' },
];

// ============ CONTACT FORM (Create + Edit) ============

function ContactForm({
  contact,
  onSave,
  onCancel,
}: {
  contact?: Contact;
  onSave: (c: Partial<Contact>) => void;
  onCancel: () => void;
}) {
  const isNew = !contact;
  const [form, setForm] = useState({
    name: contact?.name || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    alternatePhones: contact?.alternatePhones.join(', ') || '',
    origin: (contact?.origin || 'email') as ContactOrigin,
    originDetail: contact?.originDetail || '',
    status: (contact?.status || 'prospect') as ContactStatus,
    nationality: contact?.nationality || '',
    notes: contact?.notes || '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...form,
      alternatePhones: form.alternatePhones ? form.alternatePhones.split(',').map(s => s.trim()) : [],
      firstContactDate: contact?.firstContactDate || new Date().toISOString(),
      lastContactDate: new Date().toISOString(),
      stays: contact?.stays || [],
      totalStays: contact?.totalStays || 0,
      requestedWeeks: contact?.requestedWeeks || [],
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 600 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>
        {isNew ? 'Nouveau contact' : 'Modifier le contact'}
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <FormField label="Nom *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} required />
        <FormField label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} type="email" />
        <FormField label="Téléphone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
        <FormField label="Autres téléphones (séparés par ,)" value={form.alternatePhones} onChange={v => setForm(f => ({ ...f, alternatePhones: v }))} />
        <FormField label="Nationalité" value={form.nationality} onChange={v => setForm(f => ({ ...f, nationality: v }))} />
      </div>

      {/* Origin */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
          Origine du contact
        </label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(Object.entries(originLabels) as [ContactOrigin, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setForm(f => ({ ...f, origin: key }))}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                border: `1px solid ${form.origin === key ? 'var(--brand)' : 'var(--border-color)'}`,
                background: form.origin === key ? 'var(--brand-dim)' : 'transparent',
                color: form.origin === key ? 'var(--brand)' : 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <FormField label="Détail origine" value={form.originDetail} onChange={v => setForm(f => ({ ...f, originDetail: v }))} />

      {/* Status */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
          Statut
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          {(Object.entries(statusConfig) as [ContactStatus, typeof statusConfig['client']][]).map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              onClick={() => setForm(f => ({ ...f, status: key }))}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: 'none',
                background: form.status === key ? cfg.bg : 'transparent',
                color: form.status === key ? cfg.color : 'var(--text-muted)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
          Notes
        </label>
        <textarea
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          style={{
            width: '100%',
            minHeight: 100,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--border-color)',
            fontSize: 12,
            fontFamily: 'var(--font-sans)',
            resize: 'vertical',
            color: 'var(--text-primary)',
            background: 'var(--bg-surface)',
          }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 18px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--brand)',
            color: 'white',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Save size={14} />
          {isNew ? 'Créer le contact' : 'Enregistrer'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 18px',
            borderRadius: 8,
            border: '1px solid var(--border-color)',
            background: 'var(--bg-surface)',
            color: 'var(--text-secondary)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <X size={14} />
          Annuler
        </button>
      </div>
    </form>
  );
}

function FormField({
  label, value, onChange, type = 'text', required,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
        {label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid var(--border-color)',
          fontSize: 12,
          color: 'var(--text-primary)',
          background: 'var(--bg-surface)',
          outline: 'none',
        }}
        onFocus={e => { e.target.style.borderColor = 'var(--brand)'; }}
        onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; }}
      />
    </div>
  );
}

// ============ CONTACT DETAIL ============

function ContactDetail({ contact, onBack }: { contact: Contact; onBack: () => void }) {
  const cfg = statusConfig[contact.status];
  const [editMode, setEditMode] = useState(false);
  const [localContact] = useState<Contact>({ ...contact });

  function handleSave(updates: Partial<Contact>) {
    Object.assign(localContact, updates, { updatedAt: new Date().toISOString() });
    Object.assign(contact, localContact);
    setEditMode(false);
  }

  if (editMode) {
    return (
      <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} style={{ padding: 24 }}>
        <button onClick={() => setEditMode(false)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
          <ArrowLeft size={14} /> Retour
        </button>
        <ContactForm contact={localContact} onSave={handleSave} onCancel={() => setEditMode(false)} />
      </motion.div>
    );
  }

  const seasons = [...new Set(localContact.stays.map(s => s.season))];
  const allRequestedWeeks = localContact.requestedWeeks;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{ padding: '6px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', cursor: 'pointer', display: 'flex', color: 'var(--text-secondary)' }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{localContact.name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color, background: cfg.bg, padding: '2px 8px', borderRadius: 6 }}>
                {cfg.label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Contacté le {new Date(localContact.firstContactDate).toLocaleDateString('fr-FR')}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setEditMode(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
            <Save size={14} /> Modifier
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>
        {/* LEFT COLUMN - Infos contact */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Carte identité */}
          <Card title="Coordonnées">
            <InfoRow icon={Mail} label="Email" value={localContact.email} />
            <InfoRow icon={Phone} label="Téléphone" value={localContact.phone || '—'} />
            {localContact.alternatePhones.length > 0 && (
              <InfoRow icon={Phone} label="Autres" value={localContact.alternatePhones.join(', ')} />
            )}
            {localContact.nationality && (
              <InfoRow icon={Globe} label="Nationalité" value={localContact.nationality} />
            )}
          </Card>

          {/* Origine */}
          <Card title="Origine">
            <InfoRow icon={Tag} label="Canal" value={originLabels[localContact.origin]} />
            <InfoRow icon={MessageSquare} label="Détail" value={localContact.originDetail} />
          </Card>

          {/* Stats */}
          <Card title="Statistiques">
            <InfoRow icon={CalendarDays} label="Premier contact" value={new Date(localContact.firstContactDate).toLocaleDateString('fr-FR')} />
            <InfoRow icon={Clock} label="Dernier contact" value={new Date(localContact.lastContactDate).toLocaleDateString('fr-FR')} />
            <InfoRow icon={Star} label="Séjours" value={`${localContact.totalStays} séjour${localContact.totalStays !== 1 ? 's' : ''}`} />
          </Card>

          {/* Notes */}
          {localContact.notes && (
            <Card title="Notes">
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{localContact.notes}</p>
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN - Historique des séjours + demandes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Historique année par année */}
          {seasons.length > 0 ? seasons.map((season, i) => {
            const seasonStays = localContact.stays.filter(s => s.season === season);
            const color = seasonColors[i % seasonColors.length];
            const revenue = seasonStays.reduce((sum, s) => sum + (s.priceConfirmed || s.priceQuoted), 0);
            return (
              <Card key={season} title={`Saison ${season}`} accent={color.text}>
                {seasonStays.map(stay => {
                  const stayStatusLabel =
                    stay.status === 'paid' ? 'Payé' :
                    stay.status === 'confirmed' ? 'Confirmé' :
                    stay.status === 'pending' ? 'En attente' :
                    stay.status === 'cancelled' ? 'Annulé' : 'No show';
                  const stayColor =
                    stay.status === 'paid' ? '#16a34a' :
                    stay.status === 'confirmed' ? '#2563eb' :
                    stay.status === 'pending' ? '#d97706' : '#dc2626';

                  return (
                    <div key={stay.id} style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-surface-alt)',
                      marginBottom: 8,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CalendarDays size={13} color="var(--text-secondary)" />
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {new Date(stay.checkIn).toLocaleDateString('fr-FR')} → {new Date(stay.checkOut).toLocaleDateString('fr-FR')}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>{stay.priceConfirmed || stay.priceQuoted}€</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: stayColor, background: `${stayColor}18`, padding: '2px 8px', borderRadius: 6 }}>
                            {stayStatusLabel}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-secondary)' }}>
                        <span>{stay.nights} nuits</span>
                        <span>{stay.adults + stay.children} pers. ({stay.adults}A + {stay.children}E)</span>
                      </div>
                      {stay.notes && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>{stay.notes}</p>}
                    </div>
                  );
                })}
                <div style={{ fontSize: 11, fontWeight: 600, color: color.text, marginTop: 8 }}>
                  Total saison : {revenue}€ ({seasonStays.length} séjour{seasonStays.length > 1 ? 's' : ''})
                </div>
              </Card>
            );
          }) : (
            <Card title="Séjours">
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                Aucun séjour enregistré
              </p>
            </Card>
          )}

          {/* Demandes en cours (prospects) */}
          {allRequestedWeeks.length > 0 && (
            <Card title="Semaines demandées" accent="#d97706">
              {allRequestedWeeks.map(rw => {
                const reqStatusLabel =
                  rw.status === 'asked' ? 'Demandé' :
                  rw.status === 'negotiating' ? 'En négociation' :
                  rw.status === 'abandoned' ? 'Abandonné' : 'Réservé';
                const reqColor =
                  rw.status === 'booked' ? '#16a34a' :
                  rw.status === 'negotiating' ? '#d97706' :
                  rw.status === 'asked' ? '#2563eb' : '#94a3b8';
                return (
                  <div key={rw.id} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface-alt)', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                        Semaine {rw.weekNumber} · {rw.season}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: reqColor, background: `${reqColor}18`, padding: '2px 8px', borderRadius: 6 }}>
                        {reqStatusLabel}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {new Date(rw.checkIn).toLocaleDateString('fr-FR')} → {new Date(rw.checkOut).toLocaleDateString('fr-FR')}
                      {' · '}{rw.adults + rw.children} pers.
                    </div>
                    {rw.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{rw.notes}</div>}
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ============ CARD COMPONENT ============

function Card({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-color)',
      padding: 16,
      boxShadow: 'var(--shadow-sm)',
      borderTop: accent ? `3px solid ${accent}` : undefined,
    }}>
      <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, fontFamily: 'var(--font-sans)' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
      <Icon size={13} color="var(--text-muted)" style={{ marginTop: 2, flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, wordBreak: 'break-word' }}>{value}</div>
      </div>
    </div>
  );
}

// ============ CONTACTS LIST ============

export default function ContactsView() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ContactStatus>('all');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    fetchContacts().then(setContacts);
  }, []);

  const filteredContacts = contacts.filter(c => {
    const matchesSearch = !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search);
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  function handleCreate(data: Partial<Contact>) {
    const newContact: Contact = {
      id: generateId(),
      name: data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      alternatePhones: data.alternatePhones || [],
      origin: data.origin || 'email',
      originDetail: data.originDetail || '',
      status: data.status || 'prospect',
      nationality: data.nationality || '',
      firstContactDate: data.firstContactDate || new Date().toISOString(),
      lastContactDate: data.lastContactDate || new Date().toISOString(),
      stays: data.stays || [],
      totalStays: data.totalStays || 0,
      requestedWeeks: data.requestedWeeks || [],
      notes: data.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setContacts(prev => [newContact, ...prev]);
    setShowCreateForm(false);
    setSelectedContactId(newContact.id);
  }

  if (selectedContactId) {
    const contact = contacts.find(c => c.id === selectedContactId);
    if (!contact) return null;
    return <ContactDetail contact={contact} onBack={() => setSelectedContactId(null)} />;
  }

  if (showCreateForm) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24 }}>
        <button onClick={() => setShowCreateForm(false)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
          <ArrowLeft size={14} /> Retour à la liste
        </button>
        <ContactForm onSave={handleCreate} onCancel={() => setShowCreateForm(false)} />
      </motion.div>
    );
  }

  const counts = {
    all: contacts.length,
    client: contacts.filter(c => c.status === 'client').length,
    prospect: contacts.filter(c => c.status === 'prospect').length,
    former_client: contacts.filter(c => c.status === 'former_client').length,
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Contacts</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {counts.client} client{counts.client > 1 ? 's' : ''} · {counts.prospect} prospect{counts.prospect > 1 ? 's' : ''} · {counts.former_client} ancien{counts.former_client > 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8, border: 'none',
            background: 'var(--brand)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <UserPlus size={14} />
          Nouveau contact
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'client', 'prospect', 'former_client'] as const).map(key => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              style={{
                padding: '6px 12px', borderRadius: 8, border: 'none',
                fontSize: 11, fontWeight: statusFilter === key ? 600 : 500,
                color: statusFilter === key ? 'var(--brand)' : 'var(--text-secondary)',
                background: statusFilter === key ? 'var(--brand-dim)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              {key === 'all' ? 'Tous' : key === 'client' ? 'Clients' : key === 'prospect' ? 'Prospects' : 'Anciens'}
              <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>({counts[key]})</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1, maxWidth: 280, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
          <Search size={13} color="var(--text-muted)" />
          <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', background: 'none', fontSize: 11, flex: 1, outline: 'none', color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* Contact list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filteredContacts.map((contact, i) => {
          const cfg = statusConfig[contact.status];
          const lastStay = contact.stays[contact.stays.length - 1];
          return (
            <motion.div
              key={contact.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => setSelectedContactId(contact.id)}
              style={{
                background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)', padding: '14px 16px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                boxShadow: 'var(--shadow-sm)',
                transition: 'border-color 0.15s ease',
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: contact.status === 'client' ? 'linear-gradient(135deg, var(--brand-dim), rgba(13,148,136,0.05))' :
                  contact.status === 'prospect' ? 'linear-gradient(135deg, rgba(217,119,6,0.12), rgba(217,119,6,0.05))' :
                  'linear-gradient(135deg, rgba(100,116,139,0.12), rgba(100,116,139,0.05))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Users size={18} color={cfg.color} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{contact.name}</span>
                  {contact.nationality && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>({contact.nationality})</span>
                  )}
                  <span style={{ fontSize: 10, fontWeight: 600, color: cfg.color, background: cfg.bg, padding: '1px 6px', borderRadius: 4 }}>
                    {cfg.label}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span>{contact.email}</span>
                  {contact.phone && <span>· {contact.phone}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                  <span>{originLabels[contact.origin]}</span>
                  {lastStay && <span>· Dernier séjour : {new Date(lastStay.checkIn).toLocaleDateString('fr-FR')}</span>}
                  {!lastStay && contact.requestedWeeks.length > 0 && <span>· Semaine {contact.requestedWeeks[0].weekNumber} demandée</span>}
                </div>
              </div>

              {/* Right info */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: contact.totalStays > 0 ? 'var(--brand)' : 'var(--text-muted)' }}>
                  {contact.totalStays > 0 ? `${contact.totalStays} séjour${contact.totalStays > 1 ? 's' : ''}` : 'Prospect'}
                </div>
                {contact.stays.length > 0 && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand)', marginTop: 2 }}>
                    {contact.stays.reduce((sum, s) => sum + (s.priceConfirmed || s.priceQuoted), 0)}€
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  {new Date(contact.firstContactDate).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
