import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Search, Users, Mail, ArrowLeft, Loader2, MessageSquare, Save,
  ChevronRight, Phone, MapPin, Globe, CalendarDays, Tag, Sparkles,
  CheckCircle2, XCircle, HelpCircle, Send, Check, Pencil, X, GitMerge,
  UserPlus,
} from 'lucide-react';
import type { Contact, ContactOrigin, ContactStatus, Email, RequestedWeek, StayProgress } from '../types';
import {
  fetchContacts, fetchContactById, fetchContactEmails, updateContact,
  syncContactInquiry, prepareInquiryDraft, fetchContactInquiries,
  previewInquiryEmail, updateRequestedWeek, mergeContacts, extractContactProfile,
  createContact, updateStayProgress,
} from '../data';
import type { InquiryEmailPreview } from '../data';
import { extractInquiryFromText } from '../lib/extractInquiry';
import { displayContactName, splitContactNameFields } from '../lib/formatName';
import { emailBodyPreview, isGarbageEmailBody, classifyEmailContent, isCondensedEmail, safeEmailBodyPreview } from '../lib/cleanEmailBody';
import { toDateInputValue } from '../lib/dateInput';
import { peekContactsCache } from '../lib/contactsCache';
import { routes } from '../lib/routes';

// ─── Constants ───────────────────────────────────────────────────────────────

const statusConfig: Record<ContactStatus, { label: string; color: string; bg: string }> = {
  client: { label: 'Client', color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  prospect: { label: 'Prospect', color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  former_client: { label: 'Client', color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
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
  asked: { label: 'Fin de négociation', color: '#d97706' },
  negotiating: { label: 'Fin de négociation', color: '#d97706' },
  abandoned: { label: 'Abandonné', color: '#94a3b8' },
  booked: { label: 'Réservé', color: '#16a34a' },
};

const PROGRESS_FIELDS: Array<{ key: keyof StayProgress; label: string; type?: 'number' | 'text' | 'checkbox' }> = [
  { key: 'contractNumber', label: 'N° contrat' },
  { key: 'contractSigned', label: 'Contrat signé', type: 'checkbox' },
  { key: 'depositInvoiceNumber', label: 'Facture acompte' },
  { key: 'depositAmount', label: 'Acompte (€)', type: 'number' },
  { key: 'depositPaymentMethod', label: 'Mode acompte' },
  { key: 'depositPaid', label: 'Acompte payé', type: 'checkbox' },
  { key: 'balanceInvoiceNumber', label: 'Facture solde' },
  { key: 'balanceAmount', label: 'Solde (€)', type: 'number' },
  { key: 'balancePaymentMethod', label: 'Mode solde' },
  { key: 'balancePaid', label: 'Solde payé', type: 'checkbox' },
  { key: 'insuranceReceived', label: 'Assurance', type: 'checkbox' },
  { key: 'idReceived', label: "Pièce d'identité", type: 'checkbox' },
  { key: 'depositGuaranteePaid', label: 'Caution reçue', type: 'checkbox' },
  { key: 'depositGuaranteeReturned', label: 'Caution rendue', type: 'checkbox' },
];

function BookingProgressPanel({
  contactId,
  progress,
  isAdmin,
  onChange,
}: {
  contactId: string;
  progress: StayProgress[];
  isAdmin: boolean;
  onChange: (progress: StayProgress[]) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (!progress.length) {
    return <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucun suivi administratif enregistré pour ce client.</p>;
  }

  async function patch(p: StayProgress, key: keyof StayProgress, value: string | number | boolean) {
    if (!isAdmin || !p.checkIn || !p.checkOut) return;
    setBusy(`${p.checkIn}:${String(key)}`);
    setMsg(null);
    try {
      const nextValue = typeof value === 'string' && ['depositAmount', 'balanceAmount'].includes(String(key))
        ? Number(value || 0)
        : value;
      const res = await updateStayProgress(contactId, p.checkIn, p.checkOut, { [key]: nextValue } as Partial<StayProgress>);
      onChange(progress.map(item => item.checkIn === p.checkIn && item.checkOut === p.checkOut ? res.progress as StayProgress : item));
      setMsg('Suivi mis à jour');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erreur suivi');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {progress.map(p => (
        <div key={`${p.checkIn}-${p.checkOut}`} style={{ border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-body)' }}>
          <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{fmtDate(p.checkIn || '')} → {fmtDate(p.checkOut || '')}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: p.complete ? '#059669' : '#d97706' }}>
              {p.complete ? 'Complet' : `${p.filledCount || 0}/${p.requiredCount || 6}`}
            </div>
          </div>
          <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 8 }}>
            {PROGRESS_FIELDS.map(f => {
              const value = p[f.key];
              const id = `${p.checkIn}:${String(f.key)}`;
              if (f.type === 'checkbox') {
                const checked = value === true;
                return (
                  <label key={String(f.key)} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: checked ? '#047857' : 'var(--text-secondary)' }}>
                    <input type="checkbox" disabled={!isAdmin || busy === id} checked={checked} onChange={e => patch(p, f.key, e.target.checked)} />
                    {f.label}
                  </label>
                );
              }
              return (
                <label key={String(f.key)} style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                  {f.label}
                  <input
                    type={f.type || 'text'}
                    disabled={!isAdmin || busy === id}
                    value={value == null ? '' : String(value)}
                    onChange={e => patch(p, f.key, e.target.value)}
                    style={{ marginTop: 4, width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border-color)', fontSize: 11 }}
                  />
                </label>
              );
            })}
          </div>
          {p.mailSteps && Object.keys(p.mailSteps).length > 0 && (
            <div style={{ padding: '0 12px 12px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.entries(p.mailSteps).map(([k, v]) => (
                <span key={k} style={{ fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 6, background: 'rgba(5,150,105,0.12)', color: '#047857' }}>
                  {k} · {v}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      {msg && <p style={{ fontSize: 11, color: msg.includes('Erreur') ? '#b91c1c' : '#047857' }}>{msg}</p>}
    </div>
  );
}

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

function Field({ label, value, onChange, type = 'text', multiline = false, placeholder = '', disabled = false }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; multiline?: boolean; placeholder?: string; disabled?: boolean;
}) {
  const style: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 8,
    border: '1px solid var(--border-color)', fontSize: 12,
    fontFamily: 'var(--font-sans)', color: 'var(--text-primary)',
    background: disabled ? 'var(--bg-surface)' : 'var(--bg-body)',
    opacity: disabled ? 0.85 : 1,
    cursor: disabled ? 'default' : 'text',
  };
  return (
    <div style={{ marginBottom: 10 }}>
      {label && (
        <label style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
          {label}
        </label>
      )}
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} placeholder={placeholder} disabled={disabled} style={{ ...style, resize: 'vertical' }} />
      ) : (
        <input type={type} value={type === 'date' ? toDateInputValue(value) : value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} style={style} />
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
    fetchContactEmails(contactId).then(data => {
      setEmails(data.filter(e => !isGarbageEmailBody(e.bodyText || '', e.subject || '')));
      setLoading(false);
    });
  }, [contactId]);

  if (loading) return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 6 }}><Loader2 size={14} className="spin" /> Chargement…</div>;
  if (!emails.length) return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: 16 }}>Aucun message.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {emails.map(email => {
        const isSent = email.folder === 'INBOX.Sent' || email.folder === 'SENT';
        const open = expanded === email.id;
        const content = classifyEmailContent(email.bodyText || '');
        const condensed = isCondensedEmail(email.bodyText || '');
        return (
          <div key={email.id} style={{ borderRadius: 10, border: `1px solid ${isSent ? 'rgba(124,58,237,0.3)' : condensed ? 'var(--border-subtle)' : 'var(--border-color)'}`, background: isSent ? 'rgba(124,58,237,0.04)' : condensed ? 'var(--bg-surface)' : 'var(--bg-body)' }}>
            <button type="button" onClick={() => setExpanded(open ? null : email.id)} style={{ width: '100%', textAlign: 'left', padding: '11px 13px', border: 'none', background: 'transparent', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{email.subject || '(sans objet)'}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {fmtDate(email.date)} {fmtTime(email.date)} · <span style={{ color: isSent ? '#7c3aed' : '#0891b2', fontWeight: 600 }}>{isSent ? 'Envoyé' : 'Reçu'}</span>
                    {condensed && !open && (
                      <span style={{ marginLeft: 6, color: 'var(--text-muted)', fontStyle: 'italic' }}>· {content.label}</span>
                    )}
                  </div>
                  {!open && !condensed && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.4 }}>{emailBodyPreview(email.bodyText || '')}</div>
                  )}
                </div>
                <ChevronRight size={14} color="var(--text-muted)" style={{ transform: open ? 'rotate(90deg)' : 'none', flexShrink: 0 }} />
              </div>
            </button>
            {open && (
              <div style={{
                padding: '0 13px 13px', fontSize: 12, lineHeight: 1.55, borderTop: '1px solid var(--border-subtle)', paddingTop: 10,
                ...(condensed ? {} : { whiteSpace: 'pre-wrap', maxHeight: 420, overflowY: 'auto' }),
              }}>
                {condensed ? (
                  <div style={{
                    padding: '10px 12px', borderRadius: 8, background: 'var(--bg-body)',
                    border: '1px dashed var(--border-color)', color: 'var(--text-secondary)', fontSize: 11,
                  }}>
                    {content.kind === 'image' ? '📷' : content.kind === 'encoding' ? '⚠️' : '📎'} {content.label}
                    <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                      {content.kind === 'encoding'
                        ? 'Accents perdus lors de l\'import — extrait lisible ci-dessus. Resynchroniser les mails peut améliorer le texte.'
                        : 'Contenu binaire masqué — pas de texte lisible dans ce message.'}
                    </div>
                  </div>
                ) : (
                  safeEmailBodyPreview(email.bodyText || '', 4000) || '(vide)'
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const availConfig: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  available: { label: 'Disponible', color: '#16a34a', bg: 'rgba(22,163,74,0.12)', icon: CheckCircle2 },
  unavailable: { label: 'Indisponible', color: '#dc2626', bg: 'rgba(220,38,38,0.12)', icon: XCircle },
  unknown: { label: 'À vérifier', color: '#64748b', bg: 'rgba(100,116,139,0.12)', icon: HelpCircle },
};

function fmtPrice(n?: number) {
  if (!n) return '—';
  return n.toLocaleString('fr-FR') + ' €';
}

function InquiriesPanel({
  contactId,
  contact,
  weeks,
  onWeeksChange,
  guestEmails,
  isAdmin,
}: {
  contactId: string;
  contact: Contact;
  weeks: RequestedWeek[];
  onWeeksChange: (weeks: RequestedWeek[]) => void;
  guestEmails: Email[];
  isAdmin: boolean;
}) {
  const [syncing, setSyncing] = useState(false);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [draftSuccess, setDraftSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [altPickerFor, setAltPickerFor] = useState<string | null>(null);
  const [selectedAlts, setSelectedAlts] = useState<Set<string>>(new Set());
  const [mailPreview, setMailPreview] = useState<InquiryEmailPreview | null>(null);
  const [previewLang, setPreviewLang] = useState<'fr' | 'en'>('fr');
  const [previewFor, setPreviewFor] = useState<RequestedWeek | null>(null);

  const clientExtract = useMemo(() => {
    for (const e of guestEmails) {
      const x = extractInquiryFromText(e.bodyText || '', e.date);
      if (x) return { ...x, extractedFromEmail: true };
    }
    return null;
  }, [guestEmails]);

  useEffect(() => {
    let cancelled = false;
    setSyncing(true);
    fetchContactInquiries(contactId)
      .then(res => { if (!cancelled) onWeeksChange(res.weeks); })
      .catch(() => { /* fallback client-side ci-dessous */ })
      .finally(() => { if (!cancelled) setSyncing(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  async function persistInquiry() {
    if (!isAdmin) return;
    setSyncing(true);
    try {
      const res = await syncContactInquiry(contactId);
      onWeeksChange(res.weeks);
    } finally {
      setSyncing(false);
    }
  }

  const displayWeeks = weeks.length > 0
    ? weeks
    : clientExtract
      ? [{
          id: 'detected',
          season: '',
          weekNumber: 0,
          checkIn: clientExtract.checkIn,
          checkOut: clientExtract.checkOut,
          adults: clientExtract.adults || 0,
          children: 0,
          status: 'asked' as const,
          notes: 'Détecté dans la conversation',
          extractedFromEmail: true,
          availability: 'unknown' as const,
          availabilityLabel: 'Synchronisez via l\'API pour vérifier le calendrier',
        }]
      : [];

  async function draftAvailable(rw: RequestedWeek, lang: 'fr' | 'en' = previewLang) {
    setDrafting('available-' + rw.id);
    setError(null);
    setDraftSuccess(null);
    try {
      await prepareInquiryDraft(contactId, {
        type: 'available',
        checkIn: rw.checkIn,
        checkOut: rw.checkOut,
        price: rw.suggestedPrice,
        adults: rw.adults || contact.profileJson?.typicalAdults,
        lang,
      });
      setDraftSuccess(`Brouillon « disponible » (${lang.toUpperCase()}) créé pour ${contact.email}`);
      setMailPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur brouillon');
    } finally {
      setDrafting(null);
    }
  }

  async function showMailPreview(rw: RequestedWeek) {
    if (!isAdmin) {
      setError('Mode admin requis pour l\'aperçu mail.');
      return;
    }
    setPreviewFor(rw);
    setError(null);
    try {
      const p = await previewInquiryEmail(contactId, {
        type: 'available',
        checkIn: rw.checkIn,
        checkOut: rw.checkOut,
        price: rw.suggestedPrice,
        adults: rw.adults || contact.profileJson?.typicalAdults,
      });
      setMailPreview(p);
      setPreviewLang(p.suggestedLang === 'en' ? 'en' : 'fr');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur aperçu');
    }
  }

  async function confirmWeek(rw: RequestedWeek) {
    if (!isAdmin || rw.id.startsWith('extracted') || rw.id === 'detected') return;
    setSyncing(true);
    try {
      await updateRequestedWeek(rw.id, { status: 'booked', price: rw.suggestedPrice });
      const res = await fetchContactInquiries(contactId);
      onWeeksChange(res.weeks);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur confirmation');
    } finally {
      setSyncing(false);
    }
  }

  async function draftAlternatives(rw: RequestedWeek) {
    const alts = (rw.alternatives || []).filter(a => selectedAlts.has(a.checkIn));
    if (!alts.length) {
      setError('Sélectionnez au moins une semaine alternative');
      return;
    }
    setDrafting('alt-' + rw.id);
    setError(null);
    setDraftSuccess(null);
    try {
      await prepareInquiryDraft(contactId, {
        type: 'alternative',
        checkIn: rw.checkIn,
        checkOut: rw.checkOut,
        adults: rw.adults || contact.profileJson?.typicalAdults,
        alternativeWeeks: alts,
      });
      setDraftSuccess(`Brouillon « alternatives » créé pour ${contact.email}`);
      setAltPickerFor(null);
      setSelectedAlts(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur brouillon');
    } finally {
      setDrafting(null);
    }
  }

  if (!displayWeeks.length) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
        Aucune date détectée dans la conversation. Les dates mentionnées par le client apparaîtront ici automatiquement.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {syncing && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 6 }}>
          <Loader2 size={12} className="spin" /> Analyse des dates et calendrier…
        </div>
      )}

      {isAdmin && displayWeeks.some(w => w.id === 'extracted-preview') && (
        <button
          type="button"
          onClick={persistInquiry}
          style={{
            padding: '8px 12px', borderRadius: 8, border: '1px solid var(--brand-border)',
            background: 'var(--brand-dim)', color: 'var(--brand)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Enregistrer les dates détectées
        </button>
      )}

      {draftSuccess && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', fontSize: 11, color: '#047857' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 4 }}>
            <Check size={12} /> Brouillon prêt dans contact@alpicois-laplagne.fr
          </div>
          {draftSuccess} — vérifiez sur votre téléphone et envoyez.
        </div>
      )}

      {error && (
        <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--danger-dim)', color: 'var(--danger)', fontSize: 11 }}>
          {error}
        </div>
      )}

      {mailPreview && previewFor && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div style={{
            background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-color)',
            maxWidth: 560, width: '100%', maxHeight: '80vh', overflow: 'auto', padding: 20,
          }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {(['fr', 'en'] as const).map(l => (
                <button key={l} type="button" onClick={() => setPreviewLang(l)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${previewLang === l ? 'var(--brand)' : 'var(--border-color)'}`,
                    background: previewLang === l ? 'var(--brand-dim)' : 'transparent',
                  }}>
                  {l === 'fr' ? 'Français' : 'English'}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Objet</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
              {(previewLang === 'en' ? mailPreview.en : mailPreview.fr).subject}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Message</div>
            <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.55, background: 'var(--bg-body)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
              {(previewLang === 'en' ? mailPreview.en : mailPreview.fr).text}
            </pre>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setMailPreview(null); setPreviewFor(null); }}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-body)', fontSize: 11, cursor: 'pointer' }}>
                Fermer
              </button>
              <button type="button" disabled={!!drafting} onClick={() => draftAvailable(previewFor, previewLang)}
                style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                Créer brouillon ({previewLang.toUpperCase()})
              </button>
            </div>
          </div>
        </div>
      )}

      {displayWeeks.map(rw => {
        const st = rwStatus[rw.status] || rwStatus.asked;
        const av = availConfig[rw.availability || 'unknown'] || availConfig.unknown;
        const AvIcon = av.icon;
        const showAltPicker = altPickerFor === rw.id;

        return (
          <div key={rw.id} style={{
            padding: '12px 14px', borderRadius: 10,
            border: `1px solid ${rw.availability === 'available' ? 'rgba(22,163,74,0.35)' : rw.availability === 'unavailable' ? 'rgba(220,38,38,0.35)' : 'var(--border-color)'}`,
            background: av.bg,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>
                  {rw.extractedFromEmail ? 'Dates souhaitées' : (rw.season ? `Saison ${rw.season}` : 'Dates souhaitées')}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {fmtDate(rw.checkIn)} → {fmtDate(rw.checkOut)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {(rw.adults || rw.children) ? `${rw.adults || 0} adultes${rw.children ? `, ${rw.children} enfants` : ''}` : ''}
                  {rw.suggestedPrice ? ` · ${fmtPrice(rw.suggestedPrice)}/sem.` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: av.color, background: `${av.color}18`, padding: '3px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AvIcon size={11} /> {av.label}
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, color: st.color }}>{st.label}</span>
              </div>
            </div>

            {rw.availabilityLabel && rw.availability !== 'unknown' && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>{rw.availabilityLabel}</div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {isAdmin && rw.availability === 'available' && (
                <>
                  <button type="button" disabled={!!drafting} onClick={() => showMailPreview(rw)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8,
                      border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}>
                    Aperçu mail FR/EN
                  </button>
                  <button
                    type="button"
                    disabled={!!drafting}
                    onClick={() => draftAvailable(rw)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8,
                      border: 'none', background: '#16a34a', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {drafting === 'available-' + rw.id ? <Loader2 size={12} className="spin" /> : <Send size={12} />}
                    Créer brouillon mail
                  </button>
                </>
              )}
              {isAdmin && rw.id && !['extracted-preview', 'detected'].includes(rw.id) && rw.status !== 'booked' && (
                <button type="button" disabled={syncing} onClick={() => confirmWeek(rw)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8,
                    border: 'none', background: '#dc2626', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}>
                  <CheckCircle2 size={12} /> Confirmer la semaine
                </button>
              )}
              {(rw.alternatives && rw.alternatives.length > 0) && (
                <button
                  type="button"
                  disabled={!!drafting}
                  onClick={() => {
                    setAltPickerFor(showAltPicker ? null : rw.id);
                    setSelectedAlts(new Set((rw.alternatives || []).slice(0, 2).map(a => a.checkIn)));
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8,
                    border: '1px solid var(--brand-border)', background: 'var(--bg-surface)', color: 'var(--brand)',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <CalendarDays size={12} />
                  Proposer d'autres dates
                </button>
              )}
            </div>

            {showAltPicker && rw.alternatives && rw.alternatives.length > 0 && (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 8 }}>
                  Semaines disponibles à proximité
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  {rw.alternatives.map(alt => {
                    const sel = selectedAlts.has(alt.checkIn);
                    return (
                      <label key={alt.checkIn} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                        background: sel ? 'var(--brand-dim)' : 'transparent',
                        border: `1px solid ${sel ? 'var(--brand-border)' : 'var(--border-subtle)'}`,
                        fontSize: 11,
                      }}>
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => {
                            setSelectedAlts(prev => {
                              const next = new Set(prev);
                              if (next.has(alt.checkIn)) next.delete(alt.checkIn);
                              else next.add(alt.checkIn);
                              return next;
                            });
                          }}
                        />
                        <span style={{ flex: 1, fontWeight: 500 }}>{fmtDate(alt.checkIn)} → {fmtDate(alt.checkOut)}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{fmtPrice(alt.price)}</span>
                      </label>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={!!drafting || selectedAlts.size === 0}
                  onClick={() => draftAlternatives(rw)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8,
                    border: 'none', background: 'var(--brand)', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {drafting === 'alt-' + rw.id ? <Loader2 size={12} className="spin" /> : <Mail size={12} />}
                  Préparer le mail avec ces dates
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Full contact detail ─────────────────────────────────────────────────────

function ContactDetailView({ contactId, onBack, onMerged, isAdmin }: {
  contactId: string; onBack: () => void; onMerged?: (targetId: string) => void; isAdmin: boolean;
}) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [guestEmails, setGuestEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<Contact | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState('');
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [merging, setMerging] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetchContactById(contactId),
      fetchContactEmails(contactId),
    ]).then(([c, emails]) => {
      setContact(c);
      setGuestEmails(emails.filter(e => e.folder === 'INBOX' || !e.folder?.includes('Sent')));
      setLoading(false);
      setDirty(false);
      setEditing(false);
      setSnapshot(null);
      setSaveError(null);
    });
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  const contactPayload = useCallback((c: Contact): Partial<Contact> => ({
    name: c.name,
    firstName: c.firstName,
    email: c.email,
    phone: c.phone,
    alternatePhones: c.alternatePhones,
    alternateEmails: c.alternateEmails,
    address: c.address,
    postalCode: c.postalCode,
    country: c.country,
    nationality: c.nationality,
    status: c.status,
    origin: c.origin,
    originDetail: c.originDetail,
    notes: c.notes,
    firstContactDate: c.firstContactDate,
    lastContactDate: c.lastContactDate,
  }), []);

  async function save(data: Partial<Contact>, successMsg = 'Modifications enregistrées') {
    if (!isAdmin) {
      setSaveError('Mode admin requis — activez-le via le cadenas.');
      return false;
    }
    setSaving(true);
    setSaveError(null);
    const result = await updateContact(contactId, data);
    setSaving(false);
    if (result.ok) {
      if (result.contact) {
        setContact(result.contact);
      } else {
        setContact(prev => prev ? { ...prev, ...data } : prev);
      }
      setDirty(false);
      setEditing(false);
      setSnapshot(null);
      setSaveSuccess(successMsg);
      setTimeout(() => setSaveSuccess(null), 4000);
      return true;
    }
    setSaveError(result.error || 'Échec de l\'enregistrement — reconnectez le mode admin.');
    return false;
  }

  function startEditing() {
    if (!contact || !isAdmin) return;
    setSnapshot({ ...contact });
    setEditing(true);
    setSaveError(null);
  }

  function cancelEditing() {
    if (snapshot) setContact(snapshot);
    setDirty(false);
    setEditing(false);
    setSnapshot(null);
    setSaveError(null);
  }

  function patchContact(patch: Partial<Contact>) {
    setContact(c => c ? { ...c, ...patch } : c);
    setDirty(true);
  }

  async function saveAllFields() {
    if (!contact) return;
    await save(contactPayload(contact));
  }

  async function handleExtractProfile() {
    if (!isAdmin || !contact) return;
    setExtracting(true);
    setSaveError(null);
    try {
      const updated = await extractContactProfile(contactId);
      if (updated) {
        setContact(prev => prev ? { ...prev, ...updated } : updated);
        setSaveSuccess('Coordonnées extraites depuis les mails');
        setTimeout(() => setSaveSuccess(null), 4000);
      }
      load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Extraction échouée');
    } finally {
      setExtracting(false);
    }
  }

  async function openMergeModal() {
    if (!isAdmin) return;
    setMergeOpen(true);
    setMergeSearch('');
    fetchContacts().then(setAllContacts).catch(() => setAllContacts([]));
  }

  async function handleMerge(targetId: string) {
    if (!contact || targetId === contactId) return;
    setMerging(true);
    setSaveError(null);
    try {
      await mergeContacts(contactId, targetId);
      setMergeOpen(false);
      setSaveSuccess('Profils fusionnés');
      onMerged?.(targetId);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Fusion échouée');
    } finally {
      setMerging(false);
    }
  }

  const mergeCandidates = useMemo(() => {
    const q = mergeSearch.toLowerCase().trim();
    return allContacts
      .filter(c => c.id !== contactId && !c.isPersonal && c.id !== 'barbier-et-amis')
      .filter(c => {
        if (!q) return true;
        const name = displayContactName(c).toLowerCase();
        return name.includes(q) || c.email?.toLowerCase().includes(q);
      })
      .slice(0, 20);
  }, [allContacts, mergeSearch, contactId]);

  if (loading || !contact) {
    return <div style={{ padding: 40, display: 'flex', gap: 8, color: 'var(--text-muted)' }}><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Chargement…</div>;
  }

  const p = contact.profileJson || {};
  const cfg = statusConfig[contact.status] || statusConfig.prospect;
  const displayName = displayContactName(contact);
  const nameParts = splitContactNameFields(contact);
  const altPhone = contact.alternatePhones?.[0] || '';
  const fieldsDisabled = !editing || !isAdmin;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" onClick={onBack} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-body)', cursor: 'pointer', display: 'flex' }}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 18, fontWeight: 700 }}>{displayName}</h1>
              <span style={{ fontSize: 10, fontWeight: 600, color: cfg.color, background: cfg.bg, padding: '2px 8px', borderRadius: 6 }}>{cfg.label}</span>
              {editing && (
                <span style={{ fontSize: 10, fontWeight: 600, color: '#d97706', background: 'rgba(217,119,6,0.12)', padding: '2px 8px', borderRadius: 6 }}>
                  Édition
                </span>
              )}
              {p.language && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.language.toUpperCase()}</span>}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {contact.email} · {contact.messageCount || 0} messages · dernier contact {fmtDate(contact.lastContactDate)}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
            {!editing && isAdmin && (
              <>
                <button
                  type="button"
                  onClick={handleExtractProfile}
                  disabled={extracting}
                  title="Extraire téléphone, adresse, pays depuis les mails reçus"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
                    border: '1px solid var(--border-color)', background: 'var(--bg-body)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {extracting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={14} />}
                  Extraire
                </button>
                <button
                  type="button"
                  onClick={openMergeModal}
                  title="Fusionner ce profil avec un autre (même personne, autre email)"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
                    border: '1px solid var(--border-color)', background: 'var(--bg-body)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <GitMerge size={14} />
                  Fusionner
                </button>
              </>
            )}
            {!editing ? (
              <button
                type="button"
                onClick={startEditing}
                disabled={!isAdmin}
                title={isAdmin ? 'Modifier le profil' : 'Mode admin requis'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
                  border: '1px solid var(--border-color)', background: isAdmin ? 'var(--bg-body)' : 'var(--bg-surface)',
                  color: isAdmin ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 12, fontWeight: 600,
                  cursor: isAdmin ? 'pointer' : 'not-allowed', opacity: isAdmin ? 1 : 0.6,
                }}
              >
                <Pencil size={14} />
                Modifier
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={saving}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
                    border: '1px solid var(--border-color)', background: 'var(--bg-body)',
                    color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <X size={14} />
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={saveAllFields}
                  disabled={saving || !dirty}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
                    border: 'none', background: dirty ? 'var(--brand)' : 'var(--border-color)',
                    color: dirty ? 'white' : 'var(--text-muted)', fontSize: 12, fontWeight: 600,
                    cursor: dirty && !saving ? 'pointer' : 'not-allowed',
                  }}
                >
                  {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                  Enregistrer
                </button>
              </>
            )}
          </div>
        </div>

        {(saveSuccess || saveError || (dirty && editing)) && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {saveSuccess && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)', fontSize: 11, color: '#15803d' }}>
                <CheckCircle2 size={14} />
                {saveSuccess}
              </div>
            )}
            {saveError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', fontSize: 11, color: '#b91c1c' }}>
                <XCircle size={14} />
                {saveError}
              </div>
            )}
            {dirty && editing && !saveSuccess && (
              <p style={{ fontSize: 10, color: '#d97706', margin: 0 }}>
                Modifications non enregistrées — cliquez sur « Enregistrer » pour sauvegarder sur le serveur.
              </p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
          {(['prospect', 'client'] as ContactStatus[]).map(s => (
            <button key={s} type="button" onClick={() => {
              const payload = dirty && contact
                ? { ...contactPayload(contact), status: s }
                : { status: s };
              save(payload, `Statut : ${statusConfig[s].label}`);
            }}
              disabled={!isAdmin || saving}
              style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: contact.status === s ? 600 : 400, border: `1px solid ${contact.status === s ? statusConfig[s].color : 'var(--border-color)'}`, background: contact.status === s ? statusConfig[s].bg : 'transparent', color: contact.status === s ? statusConfig[s].color : 'var(--text-muted)', cursor: isAdmin ? 'pointer' : 'not-allowed', opacity: isAdmin ? 1 : 0.6 }}>
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
                <Field label="Nom" value={nameParts.lastName} disabled={fieldsDisabled} onChange={v => patchContact({ name: v })} />
                <Field label="Prénom" value={nameParts.firstName} disabled={fieldsDisabled} onChange={v => patchContact({ firstName: v })} placeholder="—" />
              </div>
              <Field label="Email" value={contact.email} disabled={fieldsDisabled} onChange={v => patchContact({ email: v })} />
              <Field label="Email secondaire" value={(contact.alternateEmails || [])[0] || ''} disabled={fieldsDisabled} onChange={v => patchContact({ alternateEmails: v ? [v] : [] })} placeholder="—" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
                <Field label="Téléphone" value={contact.phone || ''} disabled={fieldsDisabled} onChange={v => patchContact({ phone: v })} type="tel" />
                <Field label="Tél. 2" value={altPhone} disabled={fieldsDisabled} onChange={v => patchContact({ alternatePhones: v ? [v] : [] })} type="tel" />
              </div>
              <Field label="Adresse" value={contact.address || ''} disabled={fieldsDisabled} onChange={v => patchContact({ address: v })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
                <Field label="Code postal" value={contact.postalCode || ''} disabled={fieldsDisabled} onChange={v => patchContact({ postalCode: v })} />
                <Field label="Pays" value={contact.country || ''} disabled={fieldsDisabled} onChange={v => patchContact({ country: v })} />
              </div>
              <Field label="Nationalité" value={contact.nationality || ''} disabled={fieldsDisabled} onChange={v => patchContact({ nationality: v })} />
            </Card>

            <Card title="Origine & dates" accent="#7c3aed" icon={Globe}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Origine</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {originOptions.map(o => (
                    <button key={o.value} type="button" disabled={fieldsDisabled}
                      onClick={() => patchContact({ origin: o.value })}
                      style={{ padding: '4px 9px', borderRadius: 6, fontSize: 10, fontWeight: 500, cursor: fieldsDisabled ? 'not-allowed' : 'pointer', opacity: fieldsDisabled ? 0.6 : 1, border: `1px solid ${contact.origin === o.value ? 'var(--brand)' : 'var(--border-color)'}`, background: contact.origin === o.value ? 'var(--brand-dim)' : 'transparent', color: contact.origin === o.value ? 'var(--brand)' : 'var(--text-secondary)' }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Détail origine" value={contact.originDetail || ''} disabled={fieldsDisabled} onChange={v => patchContact({ originDetail: v })} />
              <Field label="Premier contact" value={contact.firstContactDate?.slice(0, 10) || ''} disabled={fieldsDisabled} onChange={v => patchContact({ firstContactDate: v })} type="date" />
              <Field label="Dernier contact" value={contact.lastContactDate?.slice(0, 10) || ''} disabled={fieldsDisabled} onChange={v => patchContact({ lastContactDate: v })} type="date" />
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

            <Card title="Dates souhaitées" accent="#2563eb" icon={CalendarDays}>
              {contact && (
                <InquiriesPanel
                  contactId={contact.id}
                  contact={contact}
                  weeks={contact.requestedWeeks || []}
                  onWeeksChange={weeks => setContact(c => c ? { ...c, requestedWeeks: weeks } : c)}
                  guestEmails={guestEmails}
                  isAdmin={isAdmin}
                />
              )}
            </Card>

            <Card title="Suivi administratif" accent="#059669" icon={CheckCircle2}>
              <BookingProgressPanel
                contactId={contact.id}
                progress={contact.stayProgress || []}
                isAdmin={isAdmin}
                onChange={progress => setContact(c => c ? { ...c, stayProgress: progress } : c)}
              />
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
              <Field label="" value={contact.notes || ''} disabled={fieldsDisabled} onChange={v => patchContact({ notes: v })} multiline placeholder="Notes libres…" />
            </Card>
          </div>

          {/* Col 3 — Conversation */}
          <div style={{ minWidth: 0 }}>
            <Card title={`Conversation (${contact.messageCount || 0})`} icon={Mail}>
              <ConversationThread contactId={contact.id} />
            </Card>
          </div>
        </div>
      </div>

      {mergeOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,42,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            width: '100%', maxWidth: 440, background: 'var(--bg-surface)', borderRadius: 14,
            border: '1px solid var(--border-color)', padding: 20, boxShadow: 'var(--shadow-xl)',
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Fusionner vers un autre profil</h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
              Les messages et réservations de <strong>{displayName}</strong> seront rattachés au profil choisi.
              Ce profil sera supprimé.
            </p>
            <input
              value={mergeSearch}
              onChange={e => setMergeSearch(e.target.value)}
              placeholder="Rechercher par nom ou email…"
              autoFocus
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, marginBottom: 10,
                border: '1px solid var(--border-color)', fontSize: 13,
              }}
            />
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {mergeCandidates.map(c => (
                <button
                  key={c.id}
                  type="button"
                  disabled={merging}
                  onClick={() => handleMerge(c.id)}
                  style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--border-subtle)', background: 'var(--bg-body)',
                    cursor: merging ? 'wait' : 'pointer',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{displayContactName(c)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.email}</div>
                </button>
              ))}
              {mergeCandidates.length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', padding: 12 }}>Aucun profil trouvé</p>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" onClick={() => setMergeOpen(false)} disabled={merging}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', fontSize: 12 }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── List ────────────────────────────────────────────────────────────────────

export default function ClientsView({
  isAdmin = false,
}: {
  isAdmin?: boolean;
}) {
  const navigate = useNavigate();
  const { contactId: urlContactId } = useParams();
  const [contacts, setContacts] = useState<Contact[]>(() => peekContactsCache());
  const [selectedId, setSelectedId] = useState<string | null>(urlContactId ?? null);
  const [search, setSearch] = useState('');
  const [weekFilter, setWeekFilter] = useState('');
  const [loading, setLoading] = useState(() => peekContactsCache().length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClient, setNewClient] = useState({ firstName: '', name: '', email: '', phone: '', origin: 'other' as ContactOrigin, notes: '' });
  const [creatingClient, setCreatingClient] = useState(false);

  useEffect(() => {
    setSelectedId(urlContactId ?? null);
  }, [urlContactId]);

  useEffect(() => {
    let cancelled = false;
    const hadCache = peekContactsCache().length > 0;
    if (hadCache) setLoading(false);

    fetchContacts({
      onUpdate: fresh => {
        if (!cancelled && fresh.length) {
          setContacts(fresh);
          setLoading(false);
          if (hadCache) setRefreshing(true);
        }
      },
    })
      .then(fresh => {
        if (!cancelled) {
          setContacts(fresh);
          setLoading(false);
          setRefreshing(false);
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const filtered = contacts.filter(c => {
    const q = search.toLowerCase();
    const weekOk = !weekFilter || (c.requestedWeeks || []).some(w => w.checkIn === weekFilter) || (c.stays || []).some(s => s.checkIn === weekFilter);
    if (!weekOk) return false;
    if (!q) return true;
    return displayContactName(c).toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) ||
      (c.lastSubject || '').toLowerCase().includes(q) ||
      (c.firstName || '').toLowerCase().includes(q) ||
      (c.nationality || '').toLowerCase().includes(q);
  });

  const weekOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of contacts) {
      for (const w of c.requestedWeeks || []) if (w.checkIn) m.set(w.checkIn, `${fmtDate(w.checkIn)} → ${fmtDate(w.checkOut)}`);
      for (const s of c.stays || []) if (s.checkIn) m.set(s.checkIn, `${fmtDate(s.checkIn)} → ${fmtDate(s.checkOut)}`);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [contacts]);

  async function submitNewClient() {
    if (!isAdmin || !newClient.name.trim()) return;
    setCreatingClient(true);
    try {
      const created = await createContact({
        ...newClient,
        status: 'prospect',
        firstContactDate: new Date().toISOString(),
        lastContactDate: new Date().toISOString(),
      });
      setContacts(prev => [created, ...prev]);
      setNewClientOpen(false);
      setNewClient({ firstName: '', name: '', email: '', phone: '', origin: 'other', notes: '' });
      navigate(routes.client(created.id));
    } finally {
      setCreatingClient(false);
    }
  }

  if (selectedId) {
    return <ContactDetailView contactId={selectedId} onBack={() => navigate(routes.clients)} onMerged={id => navigate(routes.client(id))} isAdmin={isAdmin} />;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: '16px clamp(12px, 3vw, 24px)', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Clients</h1>
          {isAdmin && (
            <button type="button" onClick={() => setNewClientOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <UserPlus size={14} /> Nouveau client
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          {contacts.length} fiches · données extraites des conversations email
          {refreshing && (
            <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>· mise à jour…</span>
          )}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', marginBottom: 16, flexWrap: 'wrap' }}>
        <Search size={14} color="var(--text-muted)" />
        <input type="search" placeholder="Nom, email, nationalité, sujet…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ border: 'none', background: 'none', flex: '1 1 220px', fontSize: 12, outline: 'none' }} />
        <select value={weekFilter} onChange={e => setWeekFilter(e.target.value)}
          style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 11, background: 'var(--bg-body)' }}>
          <option value="">Toutes les semaines</option>
          {weekOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {newClientOpen && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, border: '1px solid var(--brand-border)', background: 'var(--bg-surface)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <Field label="Nom" value={newClient.name} onChange={v => setNewClient(c => ({ ...c, name: v }))} />
            <Field label="Prénom" value={newClient.firstName} onChange={v => setNewClient(c => ({ ...c, firstName: v }))} />
            <Field label="Email" value={newClient.email} onChange={v => setNewClient(c => ({ ...c, email: v }))} type="email" />
            <Field label="Téléphone" value={newClient.phone} onChange={v => setNewClient(c => ({ ...c, phone: v }))} type="tel" />
          </div>
          <Field label="Notes / source" value={newClient.notes} onChange={v => setNewClient(c => ({ ...c, notes: v }))} multiline />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={() => setNewClientOpen(false)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer' }}>Annuler</button>
            <button type="button" disabled={creatingClient || !newClient.name.trim()} onClick={submitNewClient} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
              {creatingClient ? 'Création…' : 'Créer la fiche'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(c => {
            const cfg = statusConfig[c.status] || statusConfig.prospect;
            const name = displayContactName(c);
            return (
              <button key={c.id} type="button" onClick={() => navigate(routes.client(c.id))}
                className="client-list-row"
                style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', cursor: 'pointer', textAlign: 'left', width: '100%', minWidth: 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Users size={18} color={cfg.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{name}</span>
                    {c.nationality && <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>({c.nationality})</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.lastSubject || c.email}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 10, color: 'var(--text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>{fmtDate(c.lastContactDate)}</span>
                    <span style={{ fontWeight: 600, color: '#0891b2' }}>{c.messageCount || 0} msg</span>
                    {c.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={9} />{c.phone}</span>}
                    {(c.requestedWeekCount ?? c.requestedWeeks?.length ?? 0) > 0 && (
                      <span>{c.requestedWeekCount ?? c.requestedWeeks!.length} demande(s)</span>
                    )}
                  </div>
                </div>
                <ChevronRight size={16} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: 12 }} />
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
