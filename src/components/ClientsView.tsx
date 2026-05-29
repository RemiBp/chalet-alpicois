import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Search, Users, Mail, ArrowLeft, Loader2, MessageSquare, Save,
  ChevronRight, Phone, MapPin, Globe, CalendarDays, Tag, Sparkles,
} from 'lucide-react';
import type { Contact, ContactOrigin, ContactStatus, Email, RequestedWeek, ViewType } from '../types';
import { fetchContacts, fetchContactById, fetchContactEmails, updateContact } from '../data';

// ─── Constants ───────────────────────────────────────────────────────────────

const statusConfig: Record<ContactStatus, { label: string; color: string; bg: string }> = {
  client: { label: 'Client', color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  prospect: { label: 'Prospect', color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  former_client: { label: 'Ancien client', color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
};

const originOptions: { value: ContactOrigin; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'website', label: 'Site Alpicois' },
  { value: 'recommendation', label: 'La Plagne / reco' },
  { value: 'phone', label: 'Téléphone' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'social', label: 'Réseaux' },
  { value: 'other', label: 'Autre' },
];

const rwStatus: Record<string, { label: string; color: string }> = {
  asked: { label: 'Demandé', color: '#2563eb' },
  negotiating: { label: 'En négociation', color: '#d97706' },
  abandoned: { label: 'Abandonné', color: '#94a3b8' },
  booked: { label: 'Réservé', color: '#16a34a' },
};

function fmtDate(iso: string) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

// ─── UI primitives ───────────────────────────────────────────────────────────

function Card({ title, accent, children, icon: Icon }: {
  title: string; accent?: string; children: React.ReactNode; icon?: typeof Mail;
}) {
  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', gap: 8,
        background: accent ? `${accent}08` : 'transparent',
      }}>
        {Icon && <Icon size={14} color={accent || 'var(--brand)'} />}
        <span style={{ fontSize: 11, fontWeight: 700, color: accent || 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </span>
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', multiline = false, placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; multiline?: boolean; placeholder?: string;
}) {
  const style: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 8,
    border: '1px solid var(--border-color)', fontSize: 12,
    fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--bg-body)',
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} placeholder={placeholder} style={{ ...style, resize: 'vertical' }} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={style} />
      )}
    </div>
  );
}

// ─── Conversation ────────────────────────────────────────────────────────────

function ConversationThread({ contactId }: { contactId: string }) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetchContactEmails(contactId).then(data => { setEmails(data); setLoading(false); });
  }, [contactId]);

  if (loading) return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 6 }}><Loader2 size={14} className="spin" /> Chargement…</div>;
  if (!emails.length) return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: 16 }}>Aucun message.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {emails.map(email => {
        const isSent = email.folder === 'INBOX.Sent' || email.folder === 'SENT';
        const open = expanded === email.id;
        return (
          <div key={email.id} style={{ borderRadius: 10, border: `1px solid ${isSent ? 'rgba(124,58,237,0.3)' : 'var(--border-color)'}`, background: isSent ? 'rgba(124,58,237,0.04)' : 'var(--bg-body)' }}>
            <button type="button" onClick={() => setExpanded(open ? null : email.id)} style={{ width: '100%', textAlign: 'left', padding: '11px 13px', border: 'none', background: 'transparent', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{email.subject || '(sans objet)'}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {fmtDate(email.date)} {fmtTime(email.date)} · <span style={{ color: isSent ? '#7c3aed' : '#0891b2', fontWeight: 600 }}>{isSent ? 'Envoyé' : 'Reçu'}</span>
                  </div>
                  {!open && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.4 }}>{(email.bodyText || '').replace(/\s+/g, ' ').trim().slice(0, 160)}…</div>}
                </div>
                <ChevronRight size={14} color="var(--text-muted)" style={{ transform: open ? 'rotate(90deg)' : 'none', flexShrink: 0 }} />
              </div>
            </button>
            {open && (
              <div style={{ padding: '0 13px 13px', fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.55, borderTop: '1px solid var(--border-subtle)', paddingTop: 10, maxHeight: 420, overflowY: 'auto' }}>
                {email.bodyText || '(vide)'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function InquiriesList({ weeks }: { weeks: RequestedWeek[] }) {
  if (!weeks.length) {
    return <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Aucune semaine demandée extraite des emails.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {weeks.map(rw => {
        const st = rwStatus[rw.status] || rwStatus.asked;
        return (
          <div key={rw.id} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-body)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{rw.season ? `Saison ${rw.season}` : 'Demande'}</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: st.color, background: `${st.color}18`, padding: '2px 8px', borderRadius: 6 }}>{st.label}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {fmtDate(rw.checkIn)} → {fmtDate(rw.checkOut)}
              {(rw.adults || rw.children) ? ` · ${rw.adults || 0} adultes${rw.children ? `, ${rw.children} enfants` : ''}` : ''}
            </div>
            {rw.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{rw.notes}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Full contact detail ─────────────────────────────────────────────────────

function ContactDetailView({ contactId, onBack }: { contactId: string; onBack: () => void }) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchContactById(contactId).then(c => { setContact(c); setLoading(false); });
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  async function save(data: Partial<Contact>) {
    setSaving(true);
    await updateContact(contactId, data);
    setContact(prev => prev ? { ...prev, ...data } : prev);
    setSaving(false);
    setDirty(false);
  }

  if (loading || !contact) {
    return <div style={{ padding: 40, display: 'flex', gap: 8, color: 'var(--text-muted)' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Chargement…</div>;
  }

  const p = contact.profileJson || {};
  const cfg = statusConfig[contact.status] || statusConfig.prospect;
  const displayName = [contact.firstName, contact.name].filter(Boolean).join(' ') || contact.name;
  const altPhone = contact.alternatePhones?.[0] || '';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button type="button" onClick={onBack} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-body)', cursor: 'pointer', display: 'flex' }}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>{displayName}</h1>
            <span style={{ fontSize: 10, fontWeight: 600, color: cfg.color, background: cfg.bg, padding: '2px 8px', borderRadius: 6 }}>{cfg.label}</span>
            {p.language && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.language.toUpperCase()}</span>}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {contact.email} · {contact.messageCount || 0} messages · dernier contact {fmtDate(contact.lastContactDate)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['prospect', 'client', 'former_client'] as ContactStatus[]).map(s => (
            <button key={s} type="button" onClick={() => save({ status: s })}
              style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: contact.status === s ? 600 : 400, border: `1px solid ${contact.status === s ? statusConfig[s].color : 'var(--border-color)'}`, background: contact.status === s ? statusConfig[s].bg : 'transparent', color: contact.status === s ? statusConfig[s].color : 'var(--text-muted)', cursor: 'pointer' }}>
              {statusConfig[s].label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) minmax(280px, 340px) 1fr', gap: 16, alignItems: 'start' }}>

          {/* Col 1 — Coordonnées & origine */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {p.summary && (
              <Card title="Synthèse conversation" accent="#0891b2" icon={Sparkles}>
                <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-primary)' }}>{p.summary}</p>
                {contact.enrichedAt && <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>Enrichi le {fmtDate(contact.enrichedAt)}</p>}
              </Card>
            )}

            <Card title="Coordonnées" accent="var(--brand)" icon={MapPin}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
                <Field label="Nom" value={contact.name} onChange={v => { setContact(c => c ? { ...c, name: v } : c); setDirty(true); }} />
                <Field label="Prénom" value={contact.firstName || ''} onChange={v => { setContact(c => c ? { ...c, firstName: v } : c); setDirty(true); }} placeholder="—" />
              </div>
              <Field label="Email" value={contact.email} onChange={v => { setContact(c => c ? { ...c, email: v } : c); setDirty(true); }} />
              <Field label="Email secondaire" value={(contact.alternateEmails || [])[0] || ''} onChange={v => { setContact(c => c ? { ...c, alternateEmails: v ? [v] : [] } : c); setDirty(true); }} placeholder="—" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
                <Field label="Téléphone" value={contact.phone || ''} onChange={v => { setContact(c => c ? { ...c, phone: v } : c); setDirty(true); }} type="tel" />
                <Field label="Tél. 2" value={altPhone} onChange={v => { setContact(c => c ? { ...c, alternatePhones: v ? [v] : [] } : c); setDirty(true); }} type="tel" />
              </div>
              <Field label="Adresse" value={contact.address || ''} onChange={v => { setContact(c => c ? { ...c, address: v } : c); setDirty(true); }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
                <Field label="Code postal" value={contact.postalCode || ''} onChange={v => { setContact(c => c ? { ...c, postalCode: v } : c); setDirty(true); }} />
                <Field label="Pays" value={contact.country || ''} onChange={v => { setContact(c => c ? { ...c, country: v } : c); setDirty(true); }} />
              </div>
              <Field label="Nationalité" value={contact.nationality || ''} onChange={v => { setContact(c => c ? { ...c, nationality: v } : c); setDirty(true); }} />
            </Card>

            <Card title="Origine & dates" accent="#7c3aed" icon={Globe}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Origine</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {originOptions.map(o => (
                    <button key={o.value} type="button" onClick={() => save({ origin: o.value })}
                      style={{ padding: '4px 9px', borderRadius: 6, fontSize: 10, fontWeight: 500, cursor: 'pointer', border: `1px solid ${contact.origin === o.value ? 'var(--brand)' : 'var(--border-color)'}`, background: contact.origin === o.value ? 'var(--brand-dim)' : 'transparent', color: contact.origin === o.value ? 'var(--brand)' : 'var(--text-secondary)' }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Détail origine" value={contact.originDetail || ''} onChange={v => { setContact(c => c ? { ...c, originDetail: v } : c); setDirty(true); }} />
              <Field label="Premier contact" value={contact.firstContactDate?.slice(0, 10) || ''} onChange={v => { setContact(c => c ? { ...c, firstContactDate: v } : c); setDirty(true); }} type="date" />
              <Field label="Dernier contact" value={contact.lastContactDate?.slice(0, 10) || ''} onChange={v => { setContact(c => c ? { ...c, lastContactDate: v } : c); setDirty(true); }} type="date" />
            </Card>
          </div>

          {/* Col 2 — Demande & groupe */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card title="Composition groupe" accent="#d97706" icon={Users}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                {[
                  { label: 'Adultes', v: p.typicalAdults },
                  { label: 'Enfants', v: p.typicalChildren },
                  { label: 'Ados', v: p.typicalTeens },
                ].map(({ label, v }) => (
                  <div key={label} style={{ textAlign: 'center', padding: '10px 6px', borderRadius: 8, background: 'var(--bg-body)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{v || '—'}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
              {p.preferences && p.preferences.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {p.preferences.map(pref => (
                    <span key={pref} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--brand-dim)', color: 'var(--brand)' }}>{pref}</span>
                  ))}
                </div>
              )}
              {p.optionsMentioned && (p.optionsMentioned.draps || p.optionsMentioned.litsFaits || p.optionsMentioned.assuranceAnnulation) && (
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-secondary)' }}>
                  Options : {[
                    p.optionsMentioned.draps && 'draps',
                    p.optionsMentioned.litsFaits && 'lits faits',
                    p.optionsMentioned.assuranceAnnulation && 'assurance annulation',
                  ].filter(Boolean).join(' · ')}
                </div>
              )}
            </Card>

            <Card title="Semaines demandées" accent="#2563eb" icon={CalendarDays}>
              <InquiriesList weeks={contact.requestedWeeks || []} />
            </Card>

            {p.pricesMentioned && p.pricesMentioned.length > 0 && (
              <Card title="Prix évoqués" accent="#059669" icon={Tag}>
                {p.pricesMentioned.map((pr, i) => (
                  <div key={i} style={{ fontSize: 11, padding: '6px 0', borderBottom: i < p.pricesMentioned!.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                    <strong>{pr.amount?.toLocaleString('fr-FR')} €</strong>
                    {pr.context && <span style={{ color: 'var(--text-muted)' }}> — {pr.context}</span>}
                  </div>
                ))}
              </Card>
            )}

            <Card title="Notes & commentaires" icon={MessageSquare}>
              <Field label="" value={contact.notes || ''} onChange={v => { setContact(c => c ? { ...c, notes: v } : c); setDirty(true); }} multiline placeholder="Notes libres…" />
            </Card>

            {dirty && (
              <button type="button" onClick={() => contact && save({
                name: contact.name, firstName: contact.firstName, email: contact.email,
                phone: contact.phone, alternatePhones: contact.alternatePhones,
                alternateEmails: contact.alternateEmails, address: contact.address,
                postalCode: contact.postalCode, country: contact.country,
                nationality: contact.nationality, originDetail: contact.originDetail,
                notes: contact.notes, firstContactDate: contact.firstContactDate,
                lastContactDate: contact.lastContactDate,
              })}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 10, border: 'none', background: 'var(--brand)', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                Enregistrer les modifications
              </button>
            )}
          </div>

          {/* Col 3 — Conversation */}
          <div style={{ minWidth: 0 }}>
            <Card title={`Conversation (${contact.messageCount || 0})`} icon={Mail}>
              <ConversationThread contactId={contact.id} />
            </Card>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── List ────────────────────────────────────────────────────────────────────

export default function ClientsView({ onNavigate: _onNavigate }: { onNavigate?: (view: ViewType) => void }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchContacts().then(data => { setContacts(data); setLoading(false); });
  }, []);

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) ||
      (c.lastSubject || '').toLowerCase().includes(q) ||
      (c.firstName || '').toLowerCase().includes(q) ||
      (c.nationality || '').toLowerCase().includes(q);
  });

  if (selectedId) {
    return <ContactDetailView contactId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Clients</h1>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          {contacts.length} fiches · données extraites des conversations email
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', marginBottom: 16 }}>
        <Search size={14} color="var(--text-muted)" />
        <input type="search" placeholder="Nom, email, nationalité, sujet…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ border: 'none', background: 'none', flex: 1, fontSize: 12, outline: 'none' }} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(c => {
            const cfg = statusConfig[c.status] || statusConfig.prospect;
            const name = [c.firstName, c.name].filter(Boolean).join(' ') || c.name;
            return (
              <button key={c.id} type="button" onClick={() => setSelectedId(c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Users size={18} color={cfg.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>
                    {c.nationality && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>({c.nationality})</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.lastSubject || c.email}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: 10, color: 'var(--text-muted)' }}>
                    {c.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={9} />{c.phone}</span>}
                    {(c.requestedWeeks?.length || 0) > 0 && <span>{c.requestedWeeks!.length} demande(s)</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtDate(c.lastContactDate)}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#0891b2', marginTop: 2 }}>{c.messageCount || 0} msg</div>
                </div>
                <ChevronRight size={16} color="var(--text-muted)" />
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
