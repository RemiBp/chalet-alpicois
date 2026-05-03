import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Users, Mail, Phone, CalendarDays, MessageSquare,
  UserPlus, Clock, Tag, Globe, ArrowLeft, Plus, Trash2,
  CheckCircle2, Circle, MapPin, CreditCard, Home, Edit3,
  ChevronDown, Loader2, AlertCircle, X, Save, Star,
} from 'lucide-react';
import type { Contact, ContactStatus, ContactOrigin, StayRecord, StayStatus, StayOptions, ContactInteraction } from '../types';
import {
  fetchContacts, fetchContactById, createContact, updateContact,
  createStay, updateStay, deleteStay,
  fetchInteractions, createInteraction, updateInteraction, deleteInteraction,
} from '../data';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const statusConfig: Record<ContactStatus, { label: string; color: string; bg: string }> = {
  client:        { label: 'Client',        color: '#16a34a', bg: 'rgba(22, 163, 74, 0.12)' },
  prospect:      { label: 'Prospect',      color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)' },
  former_client: { label: 'Ancien client', color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)' },
};

const stayStatusConfig: Record<StayStatus, { label: string; color: string }> = {
  paid:      { label: 'Payé',        color: '#16a34a' },
  confirmed: { label: 'Confirmé',    color: '#2563eb' },
  pending:   { label: 'En attente',  color: '#d97706' },
  cancelled: { label: 'Annulé',      color: '#dc2626' },
  no_show:   { label: 'No show',     color: '#94a3b8' },
};

const originLabels: Record<ContactOrigin, string> = {
  email:          'Email',
  whatsapp:       'WhatsApp',
  phone:          'Téléphone',
  website:        'Site web',
  recommendation: 'Recommandation',
  social:         'Réseaux sociaux',
  other:          'Autre',
};

const originOptions: { value: ContactOrigin; label: string; detail?: string }[] = [
  { value: 'email',          label: 'Email' },
  { value: 'phone',          label: 'Téléphone' },
  { value: 'whatsapp',       label: 'WhatsApp' },
  { value: 'website',        label: 'Site Alpicois', detail: 'Site alpicois' },
  { value: 'recommendation', label: 'La Plagne',     detail: 'Site La Plagne' },
  { value: 'social',         label: 'Réseaux sociaux' },
  { value: 'other',          label: 'Autre' },
];

const seasonColors = [
  { bg: 'rgba(13,148,136,0.08)',  text: '#0d9488', border: '#0d948840' },
  { bg: 'rgba(37,99,235,0.08)',   text: '#2563eb', border: '#2563eb40' },
  { bg: 'rgba(124,58,237,0.08)',  text: '#7c3aed', border: '#7c3aed40' },
  { bg: 'rgba(217,119,6,0.08)',   text: '#d97706', border: '#d9770640' },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('fr-FR'); } catch { return iso; }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ─── EMAILS FIELD ─────────────────────────────────────────────────────────────

function EmailsField({
  primary,
  secondaries,
  onSave,
}: {
  primary: string;
  secondaries: string[];
  onSave: (primary: string, secondaries: string[]) => Promise<void>;
}) {
  const [editingPrimary, setEditingPrimary] = useState(false);
  const [draftPrimary, setDraftPrimary] = useState(primary);
  const [draftSecondaries, setDraftSecondaries] = useState<string[]>(secondaries);
  const [addingNew, setAddingNew] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const primaryRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraftPrimary(primary); }, [primary]);
  useEffect(() => { setDraftSecondaries(secondaries); }, [secondaries]);
  useEffect(() => { if (editingPrimary) primaryRef.current?.focus(); }, [editingPrimary]);
  useEffect(() => { if (addingNew) newRef.current?.focus(); }, [addingNew]);

  async function persist(p: string, secs: string[]) {
    setStatus('saving');
    try {
      await onSave(p, secs);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1500);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  }

  async function commitPrimary() {
    setEditingPrimary(false);
    if (draftPrimary !== primary) await persist(draftPrimary, draftSecondaries);
  }

  async function setAsDefault(idx: number) {
    const newPrimary = draftSecondaries[idx];
    const newSecs = [primary, ...draftSecondaries.filter((_, i) => i !== idx)];
    setDraftPrimary(newPrimary);
    setDraftSecondaries(newSecs);
    await persist(newPrimary, newSecs);
  }

  async function removeSecondary(idx: number) {
    const newSecs = draftSecondaries.filter((_, i) => i !== idx);
    setDraftSecondaries(newSecs);
    await persist(draftPrimary, newSecs);
  }

  async function confirmNew() {
    const trimmed = newEmail.trim();
    if (!trimmed) { setAddingNew(false); setNewEmail(''); return; }
    const newSecs = [...draftSecondaries, trimmed];
    setDraftSecondaries(newSecs);
    setNewEmail('');
    setAddingNew(false);
    await persist(draftPrimary, newSecs);
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10, color: 'var(--text-muted)', fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2,
    display: 'flex', alignItems: 'center', gap: 4,
  };

  return (
    <div style={{ marginBottom: 10 }}>
      {/* Primary */}
      <div style={labelStyle}>
        Adresse mail
        {status === 'saving' && <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} color="var(--brand)" />}
        {status === 'saved'  && <CheckCircle2 size={10} color="#16a34a" />}
        {status === 'error'  && <AlertCircle  size={10} color="#dc2626" />}
      </div>

      {editingPrimary ? (
        <input
          ref={primaryRef}
          type="email"
          value={draftPrimary}
          onChange={e => setDraftPrimary(e.target.value)}
          onBlur={commitPrimary}
          onKeyDown={e => { if (e.key === 'Enter') commitPrimary(); if (e.key === 'Escape') { setDraftPrimary(primary); setEditingPrimary(false); } }}
          style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: '1.5px solid var(--brand)', fontSize: 13, color: 'var(--text-primary)', background: 'var(--bg-surface)', outline: 'none' }}
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            onClick={() => setEditingPrimary(true)}
            style={{ fontSize: 13, color: draftPrimary ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 500, cursor: 'text', flex: 1, padding: '3px 0', borderBottom: '1px dashed transparent' }}
            onMouseEnter={e => (e.currentTarget.style.borderBottomColor = 'var(--border-color)')}
            onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
          >
            {draftPrimary || <em style={{ fontStyle: 'italic', fontSize: 12 }}>Non renseigné</em>}
          </span>
          <button
            onClick={() => setAddingNew(true)}
            title="Ajouter un email secondaire"
            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 5, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}
          >
            <Plus size={10} /> CC
          </button>
        </div>
      )}

      {/* Secondaries */}
      {draftSecondaries.map((email, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
          <Mail size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, wordBreak: 'break-word' }}>{email}</span>
          <button
            onClick={() => setAsDefault(idx)}
            title="Définir comme email principal"
            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 5, border: '1px solid var(--brand-border)', background: 'var(--brand-dim)', cursor: 'pointer', fontSize: 10, color: 'var(--brand)', fontWeight: 600 }}
          >
            <Star size={9} /> Principal
          </button>
          <button
            onClick={() => removeSecondary(idx)}
            title="Retirer cet email"
            style={{ display: 'flex', alignItems: 'center', padding: '3px', borderRadius: 5, border: '1px solid var(--danger-dim)', background: 'var(--danger-dim)', cursor: 'pointer', color: 'var(--danger)' }}
          >
            <X size={10} />
          </button>
        </div>
      ))}

      {/* New email input */}
      {addingNew && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
          <input
            ref={newRef}
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onBlur={confirmNew}
            onKeyDown={e => { if (e.key === 'Enter') confirmNew(); if (e.key === 'Escape') { setAddingNew(false); setNewEmail(''); } }}
            placeholder="email@exemple.com"
            style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1.5px solid var(--brand)', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-surface)', outline: 'none' }}
          />
          <button onClick={() => { setAddingNew(false); setNewEmail(''); }} style={{ display: 'flex', padding: '4px', borderRadius: 5, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── INLINE EDITABLE FIELD ────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function InlineField({
  label, value, onChange, type = 'text', multiline = false, placeholder = '—',
}: {
  label: string;
  value: string;
  onChange: (v: string) => Promise<void>;
  type?: string;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function commit() {
    if (draft === value) { setEditing(false); return; }
    setStatus('saving');
    try {
      await onChange(draft);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1500);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
    setEditing(false);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !multiline) { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px 8px',
    borderRadius: 6,
    border: '1.5px solid var(--brand)',
    fontSize: 13,
    color: 'var(--text-primary)',
    background: 'var(--bg-surface)',
    outline: 'none',
    fontFamily: 'var(--font-sans)',
    resize: multiline ? 'vertical' : 'none',
    minHeight: multiline ? 72 : undefined,
  };

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}
        {status === 'saving' && <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} color="var(--brand)" />}
        {status === 'saved'  && <CheckCircle2 size={10} color="#16a34a" />}
        {status === 'error'  && <AlertCircle  size={10} color="#dc2626" />}
      </div>
      {editing ? (
        multiline ? (
          <textarea ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
            onBlur={commit} onKeyDown={handleKey} style={inputStyle} />
        ) : (
          <input ref={inputRef} type={type} value={draft} onChange={e => setDraft(e.target.value)}
            onBlur={commit} onKeyDown={handleKey} style={inputStyle} />
        )
      ) : (
        <div
          onClick={() => setEditing(true)}
          style={{
            fontSize: 13, color: draft ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: 500, cursor: 'text', padding: '3px 0',
            borderBottom: '1px dashed transparent',
            transition: 'border-color 0.15s',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
          onMouseEnter={e => (e.currentTarget.style.borderBottomColor = 'var(--border-color)')}
          onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
        >
          {draft || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 12 }}>{placeholder}</span>}
          <Edit3 size={10} color="var(--text-muted)" style={{ opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}
            className="edit-icon" />
        </div>
      )}
    </div>
  );
}

// ─── INLINE SELECT FIELD ─────────────────────────────────────────────────────

function InlineSelect<T extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => Promise<void>;
}) {
  const [status, setStatus] = useState<SaveStatus>('idle');

  async function handleChange(v: T) {
    setStatus('saving');
    try {
      await onChange(v);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1500);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  }

  const current = options.find(o => o.value === value);

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}
        {status === 'saving' && <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} color="var(--brand)" />}
        {status === 'saved'  && <CheckCircle2 size={10} color="#16a34a" />}
      </div>
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
        <select
          value={value}
          onChange={e => handleChange(e.target.value as T)}
          style={{
            appearance: 'none', padding: '4px 24px 4px 8px', borderRadius: 6,
            border: '1px solid var(--border-color)', fontSize: 12,
            background: 'var(--bg-surface)', color: current ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={12} style={{ position: 'absolute', right: 6, pointerEvents: 'none', color: 'var(--text-muted)' }} />
      </div>
    </div>
  );
}

// ─── INLINE CHECKBOX ──────────────────────────────────────────────────────────

function InlineCheckbox({
  label, checked, onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => Promise<void>;
}) {
  const [status, setStatus] = useState<SaveStatus>('idle');

  async function toggle() {
    setStatus('saving');
    try {
      await onChange(!checked);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 8px', borderRadius: 6,
        border: `1px solid ${checked ? 'var(--brand-border)' : 'var(--border-color)'}`,
        background: checked ? 'var(--brand-dim)' : 'transparent',
        cursor: 'pointer', fontSize: 12, fontWeight: 500,
        color: checked ? 'var(--brand)' : 'var(--text-secondary)',
        transition: 'all 0.15s',
      }}
    >
      {status === 'saving' ? (
        <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
      ) : checked ? (
        <CheckCircle2 size={13} />
      ) : (
        <Circle size={13} />
      )}
      {label}
    </button>
  );
}

// ─── CARD ─────────────────────────────────────────────────────────────────────

function Card({
  title, children, accent, action,
}: {
  title: string; children: React.ReactNode; accent?: string; action?: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-color)', padding: '14px 16px',
      boxShadow: 'var(--shadow-sm)',
      borderTop: accent ? `3px solid ${accent}` : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── STAY CARD ────────────────────────────────────────────────────────────────

function StayCard({
  stay, accentColor, contactId, onUpdate, onDelete,
}: {
  stay: StayRecord;
  accentColor: string;
  contactId: string;
  onUpdate: (id: string, data: Partial<StayRecord>) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = stayStatusConfig[stay.status];
  const [expanded, setExpanded] = useState(false);

  async function save(data: Partial<StayRecord>) {
    await updateStay(stay.id, data);
    onUpdate(stay.id, data);
  }

  const totalPeople = stay.adults + stay.children;
  const price = stay.priceConfirmed || stay.priceQuoted || 0;

  return (
    <div style={{
      borderRadius: 10, border: `1px solid var(--border-color)`,
      background: 'var(--bg-surface-alt)', marginBottom: 8,
      overflow: 'hidden',
    }}>
      {/* Summary row */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalendarDays size={13} color={accentColor} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            {fmtDate(stay.checkIn)} → {fmtDate(stay.checkOut)}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            · {stay.nights || 7} nuits · {totalPeople} pers.
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {price > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)' }}>{price.toLocaleString('fr-FR')} €</span>}
          <span style={{ fontSize: 10, fontWeight: 600, color: cfg.color, background: `${cfg.color}18`, padding: '2px 8px', borderRadius: 6 }}>
            {cfg.label}
          </span>
          <ChevronDown size={14} color="var(--text-muted)" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            style={{ borderTop: '1px solid var(--border-color)', padding: '14px 14px 10px', overflow: 'hidden' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {/* Dates */}
              <InlineField label="Arrivée" value={stay.checkIn?.slice(0, 10) || ''} type="date"
                onChange={v => save({ checkIn: v })} />
              <InlineField label="Départ" value={stay.checkOut?.slice(0, 10) || ''} type="date"
                onChange={v => save({ checkOut: v })} />

              {/* Prix */}
              <InlineField label="Prix devisé (€)" value={String(stay.priceQuoted || '')}
                onChange={v => save({ priceQuoted: parseFloat(v) || 0 })} />
              <InlineField label="Prix payé (€)" value={String(stay.priceConfirmed || '')}
                onChange={v => save({ priceConfirmed: parseFloat(v) || 0 })} />

              {/* Personnes */}
              <InlineField label="Adultes" value={String(stay.adults || 1)}
                onChange={v => save({ adults: parseInt(v) || 1 })} />
              <InlineField label="Enfants" value={String(stay.children || 0)}
                onChange={v => save({ children: parseInt(v) || 0 })} />
            </div>

            {/* Options */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Options prises
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <InlineCheckbox
                  label="Draps"
                  checked={!!stay.options?.draps}
                  onChange={v => save({ options: { ...stay.options, draps: v } })}
                />
                <InlineCheckbox
                  label="Lits faits"
                  checked={!!stay.options?.litsFaits}
                  onChange={v => save({ options: { ...stay.options, litsFaits: v } })}
                />
                <InlineCheckbox
                  label="Assurance annulation"
                  checked={!!stay.options?.assuranceAnnulation}
                  onChange={v => save({ options: { ...stay.options, assuranceAnnulation: v } })}
                />
              </div>
            </div>

            {/* Paiement */}
            <InlineField label="Modalités de paiement" value={stay.paymentMethod || ''} placeholder="Virement, chèque..."
              onChange={v => save({ paymentMethod: v })} />

            {/* Statut */}
            <InlineSelect
              label="Statut"
              value={stay.status}
              options={Object.entries(stayStatusConfig).map(([k, v]) => ({ value: k as StayStatus, label: v.label }))}
              onChange={v => save({ status: v })}
            />

            {/* Notes */}
            <InlineField label="Commentaires" value={stay.notes || ''} multiline placeholder="Notes sur ce séjour..."
              onChange={v => save({ notes: v })} />

            {/* Delete */}
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { if (confirm('Supprimer ce séjour ?')) { deleteStay(stay.id); onDelete(stay.id); } }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--danger-dim)', background: 'var(--danger-dim)', color: 'var(--danger)', fontSize: 11, cursor: 'pointer' }}
              >
                <Trash2 size={11} /> Supprimer
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── NEW STAY FORM ────────────────────────────────────────────────────────────

function NewStayForm({ contactId, onSaved, onCancel }: {
  contactId: string;
  onSaved: (stay: StayRecord) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    checkIn: '', checkOut: '', nights: '7', adults: '2', children: '0',
    priceQuoted: '', priceConfirmed: '', status: 'pending' as StayStatus,
    paymentMethod: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  function computeSeason(date: string): string {
    if (!date) return '';
    const d = new Date(date);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.checkIn) return;
    setSaving(true);
    try {
      const res = await fetch('http://localhost:3001/api/stays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId,
          checkIn: form.checkIn,
          checkOut: form.checkOut,
          nights: parseInt(form.nights) || 7,
          adults: parseInt(form.adults) || 2,
          children: parseInt(form.children) || 0,
          priceQuoted: parseFloat(form.priceQuoted) || 0,
          priceConfirmed: parseFloat(form.priceConfirmed) || 0,
          status: form.status,
          season: computeSeason(form.checkIn),
          paymentMethod: form.paymentMethod,
          notes: form.notes,
        }),
      });
      if (res.ok) {
        const stay = await res.json();
        onSaved(stay);
      }
    } finally {
      setSaving(false);
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: 6,
    border: '1px solid var(--border-color)', fontSize: 12,
    color: 'var(--text-primary)', background: 'var(--bg-surface)', fontFamily: 'var(--font-sans)',
  };
  const lbl: React.CSSProperties = { fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 3 };

  return (
    <form onSubmit={handleSubmit} style={{ padding: '14px', background: 'var(--bg-surface-alt)', borderRadius: 10, border: '1px dashed var(--brand-border)', marginBottom: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Nouveau séjour</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div><label style={lbl}>Arrivée *</label><input required type="date" value={form.checkIn} onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))} style={inp} /></div>
        <div><label style={lbl}>Départ</label><input type="date" value={form.checkOut} onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))} style={inp} /></div>
        <div><label style={lbl}>Adultes</label><input type="number" min="1" value={form.adults} onChange={e => setForm(f => ({ ...f, adults: e.target.value }))} style={inp} /></div>
        <div><label style={lbl}>Enfants</label><input type="number" min="0" value={form.children} onChange={e => setForm(f => ({ ...f, children: e.target.value }))} style={inp} /></div>
        <div><label style={lbl}>Prix devisé (€)</label><input type="number" value={form.priceQuoted} onChange={e => setForm(f => ({ ...f, priceQuoted: e.target.value }))} style={inp} /></div>
        <div><label style={lbl}>Prix payé (€)</label><input type="number" value={form.priceConfirmed} onChange={e => setForm(f => ({ ...f, priceConfirmed: e.target.value }))} style={inp} /></div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <label style={lbl}>Modalités de paiement</label>
        <input value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))} placeholder="Virement, chèque..." style={inp} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={lbl}>Commentaires</label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inp, minHeight: 52, resize: 'vertical' }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 7, border: 'none', background: 'var(--brand)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
          Enregistrer
        </button>
        <button type="button" onClick={onCancel} style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
          Annuler
        </button>
      </div>
    </form>
  );
}

// ─── INTERACTIONS LOG ─────────────────────────────────────────────────────────

const interactionTypeConfig: Record<ContactOrigin, { label: string; color: string; bg: string }> = {
  email:          { label: 'Email',           color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  phone:          { label: 'Téléphone',        color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  whatsapp:       { label: 'WhatsApp',         color: '#059669', bg: 'rgba(5,150,105,0.10)' },
  website:        { label: 'Site Alpicois',    color: '#0d9488', bg: 'rgba(13,148,136,0.10)' },
  recommendation: { label: 'Site La Plagne',   color: '#7c3aed', bg: 'rgba(124,58,237,0.10)' },
  social:         { label: 'Réseaux sociaux',  color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  other:          { label: 'Autre',            color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
};

function InteractionItem({
  interaction, index, onUpdate, onDelete,
}: {
  interaction: ContactInteraction;
  index: number;
  onUpdate: (id: string, data: Partial<ContactInteraction>) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [draftNotes, setDraftNotes] = useState(interaction.notes || '');
  const [editingSubject, setEditingSubject] = useState(false);
  const [draftSubject, setDraftSubject] = useState(interaction.subject || '');
  const [saving, setSaving] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editingNotes) notesRef.current?.focus(); }, [editingNotes]);
  useEffect(() => { if (editingSubject) subjectRef.current?.focus(); }, [editingSubject]);

  const cfg = interactionTypeConfig[interaction.type] || interactionTypeConfig.other;

  async function save(data: Partial<ContactInteraction>) {
    setSaving(true);
    await updateInteraction(interaction.id, data);
    onUpdate(interaction.id, data);
    setSaving(false);
  }

  async function commitNotes() {
    setEditingNotes(false);
    if (draftNotes !== interaction.notes) await save({ notes: draftNotes });
  }

  async function commitSubject() {
    setEditingSubject(false);
    if (draftSubject !== interaction.subject) await save({ subject: draftSubject });
  }

  return (
    <div style={{
      borderRadius: 8,
      border: '1px solid var(--border-color)',
      background: 'var(--bg-surface)',
      overflow: 'hidden',
      marginBottom: 6,
    }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        {/* Counter badge */}
        <div style={{
          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
          background: 'var(--bg-surface-alt)', border: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, fontWeight: 700, color: 'var(--text-muted)',
        }}>
          {index + 1}
        </div>

        {/* Date */}
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>
          {fmtDate(interaction.date)}
        </span>

        {/* Type badge */}
        <span style={{
          fontSize: 10, fontWeight: 600, color: cfg.color, background: cfg.bg,
          padding: '1px 7px', borderRadius: 5, flexShrink: 0,
        }}>
          {cfg.label}
        </span>

        {/* Subject preview */}
        {interaction.subject && (
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {interaction.subject}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          {saving && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} color="var(--brand)" />}
          <ChevronDown size={13} color="var(--text-muted)" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
        </div>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 10px 10px', borderTop: '1px solid var(--border-subtle)' }}>
              {/* Date + Type editors */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Date</div>
                  <input
                    type="date"
                    value={interaction.date?.slice(0, 10) || ''}
                    onChange={e => save({ date: e.target.value })}
                    style={{ width: '100%', padding: '4px 7px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11, color: 'var(--text-primary)', background: 'var(--bg-surface-alt)' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Canal</div>
                  <div style={{ position: 'relative' }}>
                    <select
                      value={interaction.type}
                      onChange={e => save({ type: e.target.value as ContactOrigin })}
                      style={{ appearance: 'none', width: '100%', padding: '4px 24px 4px 7px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11, background: 'var(--bg-surface-alt)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', cursor: 'pointer' }}
                    >
                      {Object.entries(interactionTypeConfig).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={11} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
                  </div>
                </div>
              </div>

              {/* Subject */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Objet / Résumé</div>
                {editingSubject ? (
                  <input
                    ref={subjectRef}
                    value={draftSubject}
                    onChange={e => setDraftSubject(e.target.value)}
                    onBlur={commitSubject}
                    onKeyDown={e => { if (e.key === 'Enter') commitSubject(); if (e.key === 'Escape') { setDraftSubject(interaction.subject || ''); setEditingSubject(false); } }}
                    style={{ width: '100%', padding: '4px 7px', borderRadius: 6, border: '1.5px solid var(--brand)', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-surface)', outline: 'none' }}
                  />
                ) : (
                  <div
                    onClick={() => setEditingSubject(true)}
                    style={{ fontSize: 12, color: draftSubject ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: draftSubject ? 'normal' : 'italic', cursor: 'text', padding: '3px 0', borderBottom: '1px dashed transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.borderBottomColor = 'var(--border-color)')}
                    onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
                  >
                    {draftSubject || 'Cliquer pour ajouter un objet...'}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Notes / Détails</div>
                {editingNotes ? (
                  <textarea
                    ref={notesRef}
                    value={draftNotes}
                    onChange={e => setDraftNotes(e.target.value)}
                    onBlur={commitNotes}
                    onKeyDown={e => { if (e.key === 'Escape') { setDraftNotes(interaction.notes || ''); setEditingNotes(false); } }}
                    style={{ width: '100%', minHeight: 72, padding: '6px 8px', borderRadius: 6, border: '1.5px solid var(--brand)', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-surface)', outline: 'none', resize: 'vertical', fontFamily: 'var(--font-sans)', lineHeight: 1.5 }}
                  />
                ) : (
                  <div
                    onClick={() => setEditingNotes(true)}
                    style={{ fontSize: 12, color: draftNotes ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: draftNotes ? 'normal' : 'italic', cursor: 'text', whiteSpace: 'pre-wrap', lineHeight: 1.5, padding: '3px 0', borderBottom: '1px dashed transparent', minHeight: 20 }}
                    onMouseEnter={e => (e.currentTarget.style.borderBottomColor = 'var(--border-color)')}
                    onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
                  >
                    {draftNotes || 'Cliquer pour ajouter des notes...'}
                  </div>
                )}
              </div>

              {/* Delete */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { if (confirm('Supprimer cet échange ?')) { deleteInteraction(interaction.id); onDelete(interaction.id); } }}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 5, border: '1px solid var(--danger-dim)', background: 'var(--danger-dim)', color: 'var(--danger)', fontSize: 11, cursor: 'pointer' }}
                >
                  <Trash2 size={10} /> Supprimer
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InteractionsLog({ contactId }: { contactId: string }) {
  const [interactions, setInteractions] = useState<ContactInteraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState({ date: new Date().toISOString().slice(0, 10), type: 'email' as ContactOrigin, subject: '', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchInteractions(contactId).then(data => { setInteractions(data); setLoading(false); });
  }, [contactId]);

  function handleUpdate(id: string, data: Partial<ContactInteraction>) {
    setInteractions(prev => prev.map(i => i.id === id ? { ...i, ...data } : i));
  }

  function handleDelete(id: string) {
    setInteractions(prev => prev.filter(i => i.id !== id));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await createInteraction(contactId, newForm);
      setInteractions(prev => [created, ...prev]);
      setNewForm({ date: new Date().toISOString().slice(0, 10), type: 'email', subject: '', notes: '' });
      setAdding(false);
    } finally {
      setSaving(false);
    }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-surface)', fontFamily: 'var(--font-sans)' };
  const lbl: React.CSSProperties = { fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 3 };

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
          Historique des échanges
          {interactions.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', background: 'rgba(124,58,237,0.10)', padding: '1px 7px', borderRadius: 10 }}>
              {interactions.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setAdding(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 6, border: '1px solid var(--brand-border)', background: adding ? 'var(--brand)' : 'var(--brand-dim)', color: adding ? 'white' : 'var(--brand)', fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
        >
          {adding ? <X size={10} /> : <Plus size={10} />}
          {adding ? 'Annuler' : 'Nouvel échange'}
        </button>
      </div>

      {/* New interaction form */}
      <AnimatePresence>
        {adding && (
          <motion.form
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
            onSubmit={handleAdd}
            style={{ overflow: 'hidden', marginBottom: 8 }}
          >
            <div style={{ background: 'var(--bg-surface-alt)', borderRadius: 8, border: '1px dashed var(--brand-border)', padding: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                <div>
                  <label style={lbl}>Date</label>
                  <input type="date" value={newForm.date} onChange={e => setNewForm(f => ({ ...f, date: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Canal</label>
                  <div style={{ position: 'relative' }}>
                    <select value={newForm.type} onChange={e => setNewForm(f => ({ ...f, type: e.target.value as ContactOrigin }))}
                      style={{ ...inp, appearance: 'none', paddingRight: 22, cursor: 'pointer' }}>
                      {Object.entries(interactionTypeConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <ChevronDown size={11} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }} />
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 6 }}>
                <label style={lbl}>Objet / Résumé</label>
                <input value={newForm.subject} onChange={e => setNewForm(f => ({ ...f, subject: e.target.value }))} placeholder="Ex: Demande disponibilité semaine 52..." style={inp} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={lbl}>Notes</label>
                <textarea value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ ...inp, minHeight: 56, resize: 'vertical' }} placeholder="Détails de l'échange..." />
              </div>
              <button type="submit" disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--brand)', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                {saving ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={11} />}
                Enregistrer
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', gap: 6, color: 'var(--text-muted)', fontSize: 11, padding: '8px 0' }}>
          <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Chargement...
        </div>
      ) : interactions.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '10px 0' }}>
          Aucun échange enregistré
        </div>
      ) : (
        interactions.map((interaction, idx) => (
          <InteractionItem
            key={interaction.id}
            interaction={interaction}
            index={interactions.length - 1 - idx}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ))
      )}
    </div>
  );
}

// ─── CONTACT DETAIL ───────────────────────────────────────────────────────────

function ContactDetail({
  contactId, onBack,
}: {
  contactId: string;
  onBack: () => void;
}) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingStay, setAddingStay] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchContactById(contactId).then(c => { setContact(c); setLoading(false); });
  }, [contactId]);

  const save = useCallback(async (data: Partial<Contact>) => {
    await updateContact(contactId, data);
    setContact(prev => prev ? { ...prev, ...data } : prev);
  }, [contactId]);

  function updateStayLocal(id: string, data: Partial<StayRecord>) {
    setContact(prev => prev ? {
      ...prev,
      stays: prev.stays.map(s => s.id === id ? { ...s, ...data } : s),
    } : prev);
  }

  function deleteStayLocal(id: string) {
    setContact(prev => prev ? { ...prev, stays: prev.stays.filter(s => s.id !== id) } : prev);
  }

  function addStay(stay: StayRecord) {
    setContact(prev => prev ? { ...prev, stays: [...prev.stays, stay], totalStays: prev.totalStays + 1 } : prev);
    setAddingStay(false);
  }

  if (loading) return (
    <div style={{ padding: 32, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
      <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Chargement...
    </div>
  );

  if (!contact) return (
    <div style={{ padding: 32, color: 'var(--danger)' }}>Contact introuvable.</div>
  );

  const cfg = statusConfig[contact.status];
  const seasons = [...new Set(contact.stays.map(s => s.season))].sort();
  const displayName = [contact.firstName, contact.name].filter(Boolean).join(' ') || contact.name;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{ padding: 6, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', cursor: 'pointer', display: 'flex', color: 'var(--text-secondary)' }}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{displayName}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color, background: cfg.bg, padding: '2px 8px', borderRadius: 6 }}>
                {cfg.label}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                · {contact.totalStays} séjour{contact.totalStays !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
        {/* Status toggle */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(Object.entries(statusConfig) as [ContactStatus, typeof statusConfig['client']][]).map(([key, c]) => (
            <button
              key={key}
              onClick={() => save({ status: key })}
              style={{
                padding: '6px 12px', borderRadius: 8, border: 'none',
                background: contact.status === key ? c.bg : 'transparent',
                color: contact.status === key ? c.color : 'var(--text-muted)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '310px 1fr', gap: 16, alignItems: 'start' }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Coordonnées */}
          <Card title="Coordonnées" accent="var(--brand)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
              <InlineField label="Nom" value={contact.name} onChange={v => save({ name: v })} />
              <InlineField label="Prénom" value={contact.firstName || ''} onChange={v => save({ firstName: v })} placeholder="Non renseigné" />
            </div>
            <EmailsField
              primary={contact.email || ''}
              secondaries={contact.alternateEmails || []}
              onSave={async (primary, secondaries) => {
                await save({ email: primary, alternateEmails: secondaries });
              }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
              <InlineField label="Tél 1" value={contact.phone || ''} type="tel" onChange={v => save({ phone: v })} />
              <InlineField label="Tél 2" value={contact.alternatePhones?.[0] || ''} type="tel"
                onChange={v => save({ alternatePhones: v ? [v, ...(contact.alternatePhones?.slice(1) || [])] : [] })} />
            </div>
            <InlineField label="Adresse postale" value={contact.address || ''} onChange={v => save({ address: v })} placeholder="Rue, ville..." />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
              <InlineField label="Code postal" value={contact.postalCode || ''} onChange={v => save({ postalCode: v })} />
              <InlineField label="Pays" value={contact.country || ''} onChange={v => save({ country: v })} placeholder="France" />
            </div>
            <InlineField label="Nationalité" value={contact.nationality || ''} onChange={v => save({ nationality: v })} placeholder="Française" />
          </Card>

          {/* Origine du contact */}
          <Card title="Contact" accent="#7c3aed">
            <InlineField label="Date du contact" value={contact.firstContactDate?.slice(0, 10) || ''} type="date"
              onChange={v => save({ firstContactDate: v })} />
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Origine du contact
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {originOptions.map(o => (
                  <button
                    key={o.value}
                    onClick={() => save({ origin: o.value })}
                    style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                      border: `1px solid ${contact.origin === o.value ? 'var(--brand)' : 'var(--border-color)'}`,
                      background: contact.origin === o.value ? 'var(--brand-dim)' : 'transparent',
                      color: contact.origin === o.value ? 'var(--brand)' : 'var(--text-secondary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <InlineField label="Détail de l'origine" value={contact.originDetail || ''} onChange={v => save({ originDetail: v })} placeholder="Précision..." />
            <InlineField label="Dernière prise de contact" value={contact.lastContactDate?.slice(0, 10) || ''} type="date"
              onChange={v => save({ lastContactDate: v })} />
            <InteractionsLog contactId={contact.id} />
          </Card>

          {/* Statistiques */}
          <Card title="Statistiques">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Premier contact', value: fmtDate(contact.firstContactDate) },
                { label: 'Dernier contact', value: fmtDate(contact.lastContactDate) },
                { label: 'Séjours', value: `${contact.totalStays}` },
                {
                  label: 'Revenus totaux',
                  value: contact.stays.reduce((s, st) => s + (st.priceConfirmed || st.priceQuoted || 0), 0).toLocaleString('fr-FR') + ' €',
                },
              ].map(row => (
                <div key={row.label} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--bg-surface-alt)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{row.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{row.value}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Notes / Réponse */}
          <Card title="Commentaires & Réponse">
            <InlineField label="Commentaires libres" value={contact.notes || ''} multiline
              placeholder="Notes, observations, champs libres..." onChange={v => save({ notes: v })} />
          </Card>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Séjours par saison */}
          {seasons.length > 0 ? seasons.map((season, i) => {
            const seasonStays = contact.stays.filter(s => s.season === season);
            const color = seasonColors[i % seasonColors.length];
            const revenue = seasonStays.reduce((sum, s) => sum + (s.priceConfirmed || s.priceQuoted || 0), 0);
            return (
              <Card key={season} title={`Réservation — Saison ${season}`} accent={color.text}
                action={
                  <span style={{ fontSize: 11, fontWeight: 700, color: color.text }}>
                    {revenue > 0 ? `${revenue.toLocaleString('fr-FR')} €` : ''}
                    {' · '}{seasonStays.length} séjour{seasonStays.length > 1 ? 's' : ''}
                  </span>
                }
              >
                {seasonStays.map(stay => (
                  <StayCard key={stay.id} stay={stay} accentColor={color.text}
                    contactId={contact.id} onUpdate={updateStayLocal} onDelete={deleteStayLocal} />
                ))}
              </Card>
            );
          }) : null}

          {/* Semaines demandées */}
          {contact.requestedWeeks.length > 0 && (
            <Card title="Demandes en cours" accent="#d97706">
              {contact.requestedWeeks.map(rw => {
                const reqColor =
                  rw.status === 'booked' ? '#16a34a' :
                  rw.status === 'negotiating' ? '#d97706' :
                  rw.status === 'asked' ? '#2563eb' : '#94a3b8';
                const reqLabel =
                  rw.status === 'asked' ? 'Demandé' :
                  rw.status === 'negotiating' ? 'En négociation' :
                  rw.status === 'abandoned' ? 'Abandonné' : 'Réservé';
                return (
                  <div key={rw.id} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface-alt)', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                        Semaine {rw.weekNumber} · {rw.season}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: reqColor, background: `${reqColor}18`, padding: '2px 8px', borderRadius: 6 }}>
                        {reqLabel}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {fmtDate(rw.checkIn)} → {fmtDate(rw.checkOut)} · {rw.adults + rw.children} pers.
                    </div>
                    {rw.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{rw.notes}</div>}
                  </div>
                );
              })}
            </Card>
          )}

          {/* Nouveau séjour */}
          {addingStay ? (
            <NewStayForm contactId={contact.id} onSaved={addStay} onCancel={() => setAddingStay(false)} />
          ) : (
            <button
              onClick={() => setAddingStay(true)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px', borderRadius: 10, border: '1.5px dashed var(--brand-border)',
                background: 'var(--brand-dim)', color: 'var(--brand)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <Plus size={14} /> Ajouter un séjour
            </button>
          )}

          {/* Aucun séjour */}
          {seasons.length === 0 && !addingStay && (
            <Card title="Réservations">
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                Aucun séjour enregistré pour ce contact.
              </p>
            </Card>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── CONTACT FORM (create) ────────────────────────────────────────────────────

function ContactForm({
  onSave, onCancel,
}: {
  onSave: (c: Contact) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: '', firstName: '', email: '', secondaryEmail: '', phone: '', alternatePhone: '',
    origin: 'email' as ContactOrigin, originDetail: '',
    status: 'prospect' as ContactStatus,
    nationality: '', address: '', postalCode: '', country: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    setSaving(true);
    try {
      const c = await createContact({
        ...form,
        alternateEmails: form.secondaryEmail ? [form.secondaryEmail] : [],
        alternatePhones: form.alternatePhone ? [form.alternatePhone] : [],
        firstContactDate: new Date().toISOString(),
        lastContactDate: new Date().toISOString(),
        stays: [],
        requestedWeeks: [],
        totalStays: 0,
      });
      onSave(c);
    } finally {
      setSaving(false);
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--border-color)', fontSize: 12,
    color: 'var(--text-primary)', background: 'var(--bg-surface)', outline: 'none',
  };
  const lbl: React.CSSProperties = { fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 };
  const field = (label: string, key: keyof typeof form, type = 'text', required = false) => (
    <div>
      <label style={lbl}>{label}{required && <span style={{ color: 'var(--danger)' }}> *</span>}</label>
      <input type={type} value={String(form[key])} required={required}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={inp}
        onFocus={e => { e.target.style.borderColor = 'var(--brand)'; }}
        onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; }}
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 580 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20 }}>Nouveau contact</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        {field('Nom *', 'name', 'text', true)}
        {field('Prénom', 'firstName')}
        {field('Adresse mail', 'email', 'email')}
        {field('Email secondaire', 'secondaryEmail', 'email')}
        {field('Tél 1', 'phone', 'tel')}
        {field('Tél 2', 'alternatePhone', 'tel')}
        {field('Nationalité', 'nationality')}
        {field('Adresse postale', 'address')}
        {field('Code postal', 'postalCode')}
        {field('Pays', 'country')}
      </div>

      {/* Origine */}
      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>Origine du contact</label>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {originOptions.map(o => (
            <button key={o.value} type="button" onClick={() => setForm(f => ({ ...f, origin: o.value }))}
              style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${form.origin === o.value ? 'var(--brand)' : 'var(--border-color)'}`, background: form.origin === o.value ? 'var(--brand-dim)' : 'transparent', color: form.origin === o.value ? 'var(--brand)' : 'var(--text-secondary)', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>Détail origine</label>
        <input value={form.originDetail} onChange={e => setForm(f => ({ ...f, originDetail: e.target.value }))} style={inp} />
      </div>

      {/* Statut */}
      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>Statut</label>
        <div style={{ display: 'flex', gap: 5 }}>
          {(Object.entries(statusConfig) as [ContactStatus, typeof statusConfig['client']][]).map(([k, c]) => (
            <button key={k} type="button" onClick={() => setForm(f => ({ ...f, status: k }))}
              style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: form.status === k ? c.bg : 'transparent', color: form.status === k ? c.color : 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={lbl}>Notes</label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          style={{ ...inp, minHeight: 72, resize: 'vertical' }} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />}
          Créer le contact
        </button>
        <button type="button" onClick={onCancel}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>
          <X size={13} /> Annuler
        </button>
      </div>
    </form>
  );
}

// ─── CONTACTS LIST ────────────────────────────────────────────────────────────

export default function ContactsView() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ContactStatus>('all');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchContacts().then(cs => { setContacts(cs); setLoading(false); });
  }, []);

  const filteredContacts = contacts.filter(c => {
    const q = search.toLowerCase();
    const matchesSearch = !search ||
      c.name.toLowerCase().includes(q) ||
      (c.firstName || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(search);
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  function handleCreated(c: Contact) {
    setContacts(prev => [c, ...prev]);
    setShowCreateForm(false);
    setSelectedContactId(c.id);
  }

  if (selectedContactId) {
    return <ContactDetail contactId={selectedContactId} onBack={() => setSelectedContactId(null)} />;
  }

  if (showCreateForm) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24 }}>
        <button onClick={() => setShowCreateForm(false)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
          <ArrowLeft size={14} /> Retour à la liste
        </button>
        <ContactForm onSave={handleCreated} onCancel={() => setShowCreateForm(false)} />
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
            {counts.client} client{counts.client !== 1 ? 's' : ''} · {counts.prospect} prospect{counts.prospect !== 1 ? 's' : ''} · {counts.former_client} ancien{counts.former_client !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setShowCreateForm(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <UserPlus size={14} /> Nouveau contact
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {(['all', 'client', 'prospect', 'former_client'] as const).map(key => (
            <button key={key} onClick={() => setStatusFilter(key)}
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: statusFilter === key ? 600 : 500, color: statusFilter === key ? 'var(--brand)' : 'var(--text-secondary)', background: statusFilter === key ? 'var(--brand-dim)' : 'transparent', cursor: 'pointer' }}>
              {key === 'all' ? 'Tous' : key === 'client' ? 'Clients' : key === 'prospect' ? 'Prospects' : 'Anciens'}
              <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>({counts[key]})</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1, maxWidth: 280, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
          <Search size={13} color="var(--text-muted)" />
          <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', background: 'none', fontSize: 11, flex: 1, outline: 'none', color: 'var(--text-primary)' }} />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32, color: 'var(--text-muted)', gap: 8 }}>
          <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Chargement...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {filteredContacts.map((contact, i) => {
            const cfg = statusConfig[contact.status];
            const lastStay = contact.stays[contact.stays.length - 1];
            const displayName = [contact.firstName, contact.name].filter(Boolean).join(' ') || contact.name;
            const totalRevenue = contact.stays.reduce((s, st) => s + (st.priceConfirmed || st.priceQuoted || 0), 0);
            return (
              <motion.div
                key={contact.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.025 }}
                onClick={() => setSelectedContactId(contact.id)}
                style={{
                  background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)', padding: '12px 16px',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                  boxShadow: 'var(--shadow-sm)', transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--brand-border)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-color)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)'; }}
              >
                {/* Avatar */}
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: contact.status === 'client'
                    ? 'linear-gradient(135deg, var(--brand-dim), rgba(13,148,136,0.05))'
                    : contact.status === 'prospect'
                    ? 'linear-gradient(135deg, rgba(217,119,6,0.12), rgba(217,119,6,0.05))'
                    : 'linear-gradient(135deg, rgba(100,116,139,0.12), rgba(100,116,139,0.05))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Users size={18} color={cfg.color} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{displayName}</span>
                    {contact.nationality && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>({contact.nationality})</span>}
                    <span style={{ fontSize: 10, fontWeight: 600, color: cfg.color, background: cfg.bg, padding: '1px 6px', borderRadius: 4 }}>
                      {cfg.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
                    {contact.email && <span>{contact.email}</span>}
                    {contact.phone && <span>· {contact.phone}</span>}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 6 }}>
                    <span>{originLabels[contact.origin]}</span>
                    {lastStay && <span>· Dernier séjour : {fmtDate(lastStay.checkIn)}</span>}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: contact.totalStays > 0 ? 'var(--brand)' : 'var(--text-muted)' }}>
                    {contact.totalStays > 0 ? `${contact.totalStays} séjour${contact.totalStays > 1 ? 's' : ''}` : 'Prospect'}
                  </div>
                  {totalRevenue > 0 && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)', marginTop: 2 }}>
                      {totalRevenue.toLocaleString('fr-FR')} €
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {new Date(contact.firstContactDate).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
                  </div>
                </div>
              </motion.div>
            );
          })}
          {filteredContacts.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
              Aucun contact trouvé.
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
