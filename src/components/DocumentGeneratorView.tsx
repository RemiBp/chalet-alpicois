import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Search, User, CalendarDays, Euro, FileText, Download, Loader2,
  CheckCircle2, Circle, Sparkles, Package,
} from 'lucide-react';
import type { Contact, DocumentFormOverrides } from '../types';
import { fetchContacts, fetchContactById, previewDocuments, downloadDocument } from '../data';
import { CHALET } from '../config/chalet';

export type DocumentMode = 'facture' | 'contrat';

interface FieldDef {
  key: keyof DocumentFormOverrides | 'contractNumber' | 'issueDate' | 'persons' | 'nights';
  label: string;
  group: string;
  type?: 'text' | 'number' | 'date' | 'email' | 'tel';
  autoKey?: string;
}

const FIELD_DEFS: FieldDef[] = [
  { key: 'contractNumber', label: 'N° contrat / facture', group: 'Références', autoKey: 'contractNumber' },
  { key: 'contractDate', label: 'Date du contrat', group: 'Références', type: 'date', autoKey: 'contractDate' },
  { key: 'issueDate', label: 'Date de facture', group: 'Références', type: 'date', autoKey: 'issueDate' },
  { key: 'docSuffix', label: 'Suffixe document', group: 'Références' },
  { key: 'tenantName', label: 'Nom et prénom', group: 'Locataire', autoKey: 'tenantName' },
  { key: 'tenantEmail', label: 'Email', group: 'Locataire', type: 'email', autoKey: 'tenantEmail' },
  { key: 'tenantPhone', label: 'Téléphone', group: 'Locataire', type: 'tel', autoKey: 'tenantPhone' },
  { key: 'tenantAddress1', label: 'Adresse', group: 'Locataire', autoKey: 'tenantAddress1' },
  { key: 'tenantAddress2', label: 'Code postal / ville', group: 'Locataire', autoKey: 'tenantAddress2' },
  { key: 'tenantAddress3', label: 'Pays', group: 'Locataire' },
  { key: 'checkIn', label: 'Arrivée (check-in)', group: 'Séjour', type: 'date', autoKey: 'checkIn' },
  { key: 'checkOut', label: 'Départ (check-out)', group: 'Séjour', type: 'date', autoKey: 'checkOut' },
  { key: 'nights', label: 'Nuits', group: 'Séjour', type: 'number' },
  { key: 'weeks', label: 'Semaines', group: 'Séjour', type: 'number' },
  { key: 'adults', label: 'Adultes', group: 'Séjour', type: 'number', autoKey: 'adults' },
  { key: 'children', label: 'Enfants', group: 'Séjour', type: 'number', autoKey: 'children' },
  { key: 'weeklyRent', label: 'Loyer hebdomadaire (€)', group: 'Montants', type: 'number', autoKey: 'weeklyRent' },
  { key: 'rentalTotal', label: 'Total location (€)', group: 'Montants', type: 'number' },
  { key: 'taxAdults', label: 'Adultes (taxe séjour)', group: 'Montants', type: 'number' },
  { key: 'taxNights', label: 'Nuits (taxe séjour)', group: 'Montants', type: 'number' },
  { key: 'touristTaxTotal', label: 'Taxe de séjour (€)', group: 'Montants', type: 'number' },
  { key: 'totalDue', label: 'Total dû (€)', group: 'Montants', type: 'number' },
  { key: 'deposit30', label: 'Acompte 30 % (€)', group: 'Échéances', type: 'number' },
  { key: 'depositDueDate', label: 'Date limite acompte', group: 'Échéances', type: 'date' },
  { key: 'balance70', label: 'Solde 70 % + taxe (€)', group: 'Échéances', type: 'number' },
  { key: 'balanceDueDate', label: 'Date limite solde (J-60)', group: 'Échéances', type: 'date' },
  { key: 'tenantSignatureName', label: 'Nom signature locataire', group: 'Signature' },
];

function detectAutoSources(contact: Contact | null): Record<string, string> {
  if (!contact) return {};
  const s: Record<string, string> = {};
  if (contact.name) s.tenantName = 'contact';
  if (contact.email) s.tenantEmail = 'contact';
  if (contact.phone) s.tenantPhone = 'contact';
  if (contact.address) s.tenantAddress1 = 'contact';
  if (contact.postalCode) s.tenantAddress2 = 'contact';
  if (contact.profileJson?.typicalAdults != null) s.adults = 'profil IA';
  if (contact.profileJson?.typicalChildren != null) s.children = 'profil IA';
  if (contact.profileJson?.pricesMentioned?.length) s.weeklyRent = 'profil IA';
  const week = contact.requestedWeeks?.find(w => w.checkIn);
  if (week?.checkIn) s.checkIn = 'demande';
  const stay = contact.stays?.find(st => st.checkIn);
  if (stay?.checkIn) s.checkIn = 'réservation';
  return s;
}

function isFilled(v: unknown) {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

interface DocumentGeneratorViewProps {
  mode: DocumentMode;
}

export default function DocumentGeneratorView({ mode }: DocumentGeneratorViewProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [autoSources, setAutoSources] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchContacts().then(setContacts).catch(() => setContacts([]));
  }, []);

  const refreshPreview = useCallback(async (contactId: string, overrides: DocumentFormOverrides) => {
    setLoading(true);
    setError(null);
    try {
      const { fields } = await previewDocuments(contactId, overrides);
      const next: Record<string, string> = {};
      for (const def of FIELD_DEFS) {
        const v = fields[def.key as string];
        if (v != null) next[def.key as string] = String(v);
      }
      if (fields.checkIn) next.checkIn = fields.checkIn;
      if (fields.checkOut) next.checkOut = fields.checkOut;
      if (fields.nights) next.nights = String(fields.nights);
      setForm(prev => ({ ...next, ...Object.fromEntries(Object.entries(prev).filter(([, val]) => val !== '')) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur preview');
    } finally {
      setLoading(false);
    }
  }, []);

  const selectContact = useCallback(async (id: string) => {
    setSelectedId(id);
    setForm({});
    const full = await fetchContactById(id);
    setContact(full);
    setAutoSources(detectAutoSources(full));
    if (full) await refreshPreview(id, {});
  }, [refreshPreview]);

  useEffect(() => {
    if (!selectedId) return;
    const t = setTimeout(() => {
      const overrides = buildOverrides(form);
      refreshPreview(selectedId, overrides);
    }, 400);
    return () => clearTimeout(t);
  }, [form, selectedId, refreshPreview]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return contacts.slice(0, 50);
    return contacts.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [contacts, search]);

  const groups = useMemo(() => {
    const visible = mode === 'facture'
      ? FIELD_DEFS.filter(f => f.key !== 'contractDate' && f.key !== 'tenantSignatureName')
      : FIELD_DEFS.filter(f => f.key !== 'issueDate');
    const g = new Map<string, FieldDef[]>();
    for (const f of visible) {
      if (!g.has(f.group)) g.set(f.group, []);
      g.get(f.group)!.push(f);
    }
    return g;
  }, [mode]);

  const completion = useMemo(() => {
    const required = mode === 'facture'
      ? ['tenantName', 'checkIn', 'checkOut', 'weeklyRent', 'totalDue']
      : ['tenantName', 'checkIn', 'checkOut', 'weeklyRent', 'totalDue', 'tenantSignatureName'];
    const done = required.filter(k => isFilled(form[k])).length;
    return { done, total: required.length };
  }, [form, mode]);

  const setField = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleGenerate = async (type: 'facture' | 'contrat' | 'pack') => {
    if (!selectedId) return;
    setGenerating(type);
    setError(null);
    try {
      await downloadDocument(selectedId, type, buildOverrides(form));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur génération');
    } finally {
      setGenerating(null);
    }
  };

  const title = mode === 'facture' ? 'Factures' : 'Contrats de location';
  const subtitle = mode === 'facture'
    ? 'Générez une facture préremplie depuis le profil client et les dates de séjour.'
    : 'Générez le contrat avec les CGL (Annexe 1) et la Fiche Descriptive (Annexe 2).';

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={22} color="var(--brand)" />
          {title}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>{subtitle}</p>
        {mode === 'contrat' && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Pack complet : contrat + Annexe 1 (Conditions Générales) + Annexe 2 (Fiche Descriptive)
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Contact picker */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Profil locataire
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher…"
                style={{
                  width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8,
                  border: '1px solid var(--border-color)', fontSize: 12, background: 'var(--bg-body)',
                }}
              />
            </div>
          </div>
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {filtered.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectContact(c.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', cursor: 'pointer',
                  background: selectedId === c.id ? 'var(--brand-dim)' : 'transparent',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: selectedId === c.id ? 'var(--brand)' : 'var(--text-primary)' }}>{c.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{c.email || '—'}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <div>
          {!selectedId ? (
            <div style={{
              padding: 48, textAlign: 'center', background: 'var(--bg-surface)', borderRadius: 12,
              border: '1px dashed var(--border-color)', color: 'var(--text-muted)', fontSize: 13,
            }}>
              <User size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
              Sélectionnez un contact pour préremplir les champs
            </div>
          ) : (
            <>
              {contact && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 16,
                  background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-color)',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, background: 'var(--brand-dim)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Sparkles size={18} color="var(--brand)" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{contact.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {contact.messageCount ?? 0} messages · {CHALET.name}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: completion.done === completion.total ? 'var(--success)' : 'var(--warning)' }}>
                      {completion.done}/{completion.total} critères
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>prêts</div>
                  </div>
                </div>
              )}

              {loading && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', gap: 6 }}>
                  <Loader2 size={12} className="spin" /> Recalcul…
                </div>
              )}

              {error && (
                <div style={{ padding: '10px 14px', marginBottom: 12, borderRadius: 8, background: 'var(--danger-dim)', color: 'var(--danger)', fontSize: 12 }}>
                  {error}
                </div>
              )}

              {[...groups.entries()].map(([groupName, fields]) => (
                <div key={groupName} style={{
                  background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-color)',
                  marginBottom: 12, overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)',
                    fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {groupName === 'Séjour' && <CalendarDays size={13} />}
                    {groupName === 'Montants' && <Euro size={13} />}
                    {groupName === 'Échéances' && <Euro size={13} />}
                    {groupName}
                  </div>
                  <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                    {fields.map(def => {
                      const val = form[def.key as string] ?? '';
                      const auto = def.autoKey && autoSources[def.autoKey];
                      const filled = isFilled(val);
                      return (
                        <div key={def.key as string}>
                          <label style={{
                            fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase',
                            letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4,
                          }}>
                            {filled ? <CheckCircle2 size={10} color="var(--success)" /> : <Circle size={10} />}
                            {def.label}
                            {auto && (
                              <span style={{
                                fontSize: 8, padding: '1px 5px', borderRadius: 4,
                                background: 'var(--brand-dim)', color: 'var(--brand)', fontWeight: 700,
                              }}>
                                {auto}
                              </span>
                            )}
                          </label>
                          <input
                            type={def.type || 'text'}
                            value={val}
                            onChange={e => setField(def.key as string, e.target.value)}
                            style={{
                              width: '100%', padding: '7px 10px', borderRadius: 8,
                              border: `1px solid ${filled ? 'var(--brand-border)' : 'var(--border-color)'}`,
                              fontSize: 12, background: 'var(--bg-body)',
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
                {mode === 'facture' && (
                  <button
                    type="button"
                    disabled={!!generating || completion.done < 3}
                    onClick={() => handleGenerate('facture')}
                    style={btnPrimary}
                  >
                    {generating === 'facture' ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
                    Télécharger la facture (.docx)
                  </button>
                )}
                {mode === 'contrat' && (
                  <>
                    <button
                      type="button"
                      disabled={!!generating || completion.done < 4}
                      onClick={() => handleGenerate('contrat')}
                      style={btnSecondary}
                    >
                      {generating === 'contrat' ? <Loader2 size={16} className="spin" /> : <FileText size={16} />}
                      Contrat seul
                    </button>
                    <button
                      type="button"
                      disabled={!!generating || completion.done < 4}
                      onClick={() => handleGenerate('pack')}
                      style={btnPrimary}
                    >
                      {generating === 'pack' ? <Loader2 size={16} className="spin" /> : <Package size={16} />}
                      Pack complet (contrat + CGL + FDC)
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function buildOverrides(form: Record<string, string>): DocumentFormOverrides {
  const num = (k: string) => {
    const v = form[k];
    if (!v) return undefined;
    const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    return Number.isNaN(n) ? undefined : n;
  };
  return {
    docSuffix: form.docSuffix,
    contractNumber: form.contractNumber,
    contractDate: form.contractDate,
    issueDate: form.issueDate,
    tenantName: form.tenantName,
    tenantAddress1: form.tenantAddress1,
    tenantAddress2: form.tenantAddress2,
    tenantAddress3: form.tenantAddress3,
    tenantPostalCity: form.tenantAddress2,
    tenantPhone: form.tenantPhone,
    tenantEmail: form.tenantEmail,
    adults: num('adults'),
    children: num('children'),
    checkIn: form.checkIn,
    checkOut: form.checkOut,
    nights: num('nights'),
    weeks: num('weeks'),
    weeklyRent: num('weeklyRent'),
    rentalTotal: num('rentalTotal'),
    taxAdults: num('taxAdults'),
    taxNights: num('taxNights'),
    touristTaxTotal: num('touristTaxTotal'),
    totalDue: num('totalDue'),
    deposit30: num('deposit30'),
    balance70: num('balance70'),
    depositDueDate: form.depositDueDate,
    balanceDueDate: form.balanceDueDate,
    tenantSignatureName: form.tenantSignatureName,
  };
}

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderRadius: 10,
  border: 'none', background: 'var(--brand)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  ...btnPrimary,
  background: 'var(--bg-surface)',
  color: 'var(--brand)',
  border: '1px solid var(--brand-border)',
};
