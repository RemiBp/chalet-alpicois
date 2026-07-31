import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Search, User, CalendarDays, Euro, FileText, Download, Loader2,
  CheckCircle2, Circle, Sparkles, Package, ChevronLeft, Mail, Check, AlertCircle, Eye,
} from 'lucide-react';
import type { Contact, DocumentFormOverrides } from '../types';
import {
  fetchContacts, fetchContactById, previewDocuments, downloadDocument,
  prepareDocumentDraft, previewDocumentFile, previewDocumentEmail,
  type DocumentEmailPreview,
} from '../data';
import { getAdminToken } from '../lib/adminSession';
import { displayContactName } from '../lib/formatName';
import { CHALET } from '../config/chalet';
import { toDateInputValue, isDateFieldKey } from '../lib/dateInput';

export type DocumentMode = 'facture' | 'contrat';

type FieldRequirement = 'required' | 'recommended' | 'optional';

interface FieldDef {
  key: keyof DocumentFormOverrides | 'contractNumber' | 'issueDate' | 'persons' | 'nights';
  label: string;
  group: string;
  type?: 'text' | 'number' | 'date' | 'email' | 'tel' | 'select';
  options?: { value: string; label: string }[];
  autoKey?: string;
  contrat?: FieldRequirement;
  facture?: FieldRequirement;
}

/** Exigences par type de document — obligatoire = bloque la génération. */
const FIELD_DEFS: FieldDef[] = [
  { key: 'contractNumber', label: 'N° contrat / facture', group: 'Références', autoKey: 'contractNumber', contrat: 'required', facture: 'required' },
  { key: 'contractDate', label: 'Date du contrat', group: 'Références', type: 'date', autoKey: 'contractDate', contrat: 'required', facture: 'optional' },
  { key: 'issueDate', label: 'Date de facture', group: 'Références', type: 'date', autoKey: 'issueDate', contrat: 'optional', facture: 'required' },
  { key: 'invoiceKind', label: 'Type de facture', group: 'Références', type: 'select', options: [{ value: 'acompte', label: 'Acompte' }, { value: 'solde', label: 'Solde' }], contrat: 'optional', facture: 'required' },
  { key: 'paymentMethod', label: 'Mode de paiement', group: 'Références', type: 'select', options: [{ value: 'virement', label: 'Virement' }, { value: 'carte', label: 'Carte bancaire' }], contrat: 'optional', facture: 'recommended' },
  { key: 'docSuffix', label: 'Suffixe document', group: 'Références', contrat: 'optional', facture: 'optional' },
  { key: 'tenantName', label: 'Nom et prénom', group: 'Locataire', autoKey: 'tenantName', contrat: 'required', facture: 'required' },
  { key: 'tenantEmail', label: 'Email', group: 'Locataire', type: 'email', autoKey: 'tenantEmail', contrat: 'recommended', facture: 'recommended' },
  { key: 'tenantPhone', label: 'Téléphone', group: 'Locataire', type: 'tel', autoKey: 'tenantPhone', contrat: 'recommended', facture: 'optional' },
  { key: 'tenantAddress1', label: 'Adresse', group: 'Locataire', autoKey: 'tenantAddress1', contrat: 'recommended', facture: 'recommended' },
  { key: 'tenantAddress2', label: 'Code postal / ville', group: 'Locataire', autoKey: 'tenantAddress2', contrat: 'recommended', facture: 'recommended' },
  { key: 'tenantAddress3', label: 'Pays', group: 'Locataire', contrat: 'optional', facture: 'optional' },
  { key: 'checkIn', label: 'Arrivée (check-in)', group: 'Séjour', type: 'date', autoKey: 'checkIn', contrat: 'required', facture: 'required' },
  { key: 'checkOut', label: 'Départ (check-out)', group: 'Séjour', type: 'date', autoKey: 'checkOut', contrat: 'required', facture: 'required' },
  { key: 'nights', label: 'Nuits', group: 'Séjour', type: 'number', contrat: 'optional', facture: 'optional' },
  { key: 'weeks', label: 'Semaines', group: 'Séjour', type: 'number', contrat: 'optional', facture: 'optional' },
  { key: 'adults', label: 'Adultes', group: 'Séjour', type: 'number', autoKey: 'adults', contrat: 'required', facture: 'required' },
  { key: 'children', label: 'Enfants', group: 'Séjour', type: 'number', autoKey: 'children', contrat: 'optional', facture: 'optional' },
  { key: 'weeklyRent', label: 'Loyer hebdomadaire (€)', group: 'Montants', type: 'number', autoKey: 'weeklyRent', contrat: 'required', facture: 'required' },
  { key: 'rentalTotal', label: 'Total location (€)', group: 'Montants', type: 'number', autoKey: 'rentalTotal', contrat: 'recommended', facture: 'recommended' },
  { key: 'taxAdults', label: 'Adultes (taxe séjour)', group: 'Montants', type: 'number', contrat: 'optional', facture: 'optional' },
  { key: 'taxNights', label: 'Nuits (taxe séjour)', group: 'Montants', type: 'number', contrat: 'optional', facture: 'optional' },
  { key: 'touristTaxTotal', label: 'Taxe de séjour (€)', group: 'Montants', type: 'number', contrat: 'recommended', facture: 'recommended' },
  { key: 'totalDue', label: 'Total dû (€)', group: 'Montants', type: 'number', contrat: 'required', facture: 'required' },
  { key: 'deposit30', label: 'Acompte 30 % (€)', group: 'Échéances', type: 'number', contrat: 'required', facture: 'recommended' },
  { key: 'depositDueDate', label: 'Date limite acompte', group: 'Échéances', type: 'date', contrat: 'required', facture: 'recommended' },
  { key: 'balance70', label: 'Solde 70 % + taxe (€)', group: 'Échéances', type: 'number', contrat: 'required', facture: 'recommended' },
  { key: 'balanceDueDate', label: 'Date limite solde (J-60)', group: 'Échéances', type: 'date', contrat: 'required', facture: 'recommended' },
  { key: 'tenantSignatureName', label: 'Nom signature locataire', group: 'Signature', contrat: 'required', facture: 'optional' },
];

function fieldRequirement(def: FieldDef, mode: DocumentMode): FieldRequirement {
  return (mode === 'contrat' ? def.contrat : def.facture) || 'optional';
}

function visibleFieldDefs(mode: DocumentMode): FieldDef[] {
  return FIELD_DEFS.filter(f => {
    if (mode === 'facture' && (f.key === 'contractDate' || f.key === 'tenantSignatureName')) return false;
    if (mode === 'contrat' && f.key === 'issueDate') return false;
    return true;
  });
}

function validateDocumentForm(form: Record<string, string>, mode: DocumentMode) {
  const missingRequired: FieldDef[] = [];
  const missingRecommended: FieldDef[] = [];
  let requiredTotal = 0;
  let requiredDone = 0;

  for (const def of visibleFieldDefs(mode)) {
    const req = fieldRequirement(def, mode);
    const filled = isFilled(form[def.key as string]);
    if (req === 'required') {
      requiredTotal++;
      if (filled) requiredDone++;
      else missingRequired.push(def);
    } else if (req === 'recommended' && !filled) {
      missingRecommended.push(def);
    }
  }

  return {
    canGenerate: missingRequired.length === 0,
    missingRequired,
    missingRecommended,
    requiredTotal,
    requiredDone,
  };
}

function requirementLabel(req: FieldRequirement): string | null {
  if (req === 'required') return 'Obligatoire';
  if (req === 'recommended') return 'Recommandé';
  return 'Optionnel';
}

function requirementColor(req: FieldRequirement, filled: boolean, highlightMissing: boolean) {
  if (req === 'required' && !filled && highlightMissing) return '#dc2626';
  if (req === 'required') return filled ? 'var(--success)' : 'var(--warning)';
  if (req === 'recommended') return 'var(--brand)';
  return 'var(--text-muted)';
}

function detectAutoSources(contact: Contact | null, form: Record<string, string> = {}): Record<string, string> {
  if (!contact) return {};
  const s: Record<string, string> = {};
  if (contact.name) s.tenantName = 'contact';
  if (contact.email) s.tenantEmail = 'contact';
  if (contact.phone) s.tenantPhone = 'contact';
  if (contact.address) s.tenantAddress1 = 'contact';
  if (contact.postalCode || contact.country) s.tenantAddress2 = 'contact';
  if (contact.profileJson?.typicalAdults != null) s.adults = 'profil IA';
  if (contact.profileJson?.typicalChildren != null) s.children = 'profil IA';
  if (contact.profileJson?.pricesMentioned?.length) s.weeklyRent = 'profil IA';
  const stay = contact.stays?.find(st => st.checkIn && !['cancelled', 'no_show'].includes(st.status || ''));
  if (stay?.checkIn) {
    s.checkIn = 'réservation';
    s.checkOut = 'réservation';
    if (stay.priceConfirmed || stay.priceQuoted) {
      s.weeklyRent = 'réservation';
      s.rentalTotal = 'réservation';
    }
  } else {
    const week = contact.requestedWeeks?.find(w => w.checkIn);
    if (week?.checkIn) {
      s.checkIn = 'demande';
      s.checkOut = 'demande';
    }
  }
  if (form.contractDate) s.contractDate = 'aujourd\'hui';
  if (form.issueDate) s.issueDate = 'aujourd\'hui';
  if (form.depositDueDate) s.depositDueDate = 'calculé';
  if (form.balanceDueDate) s.balanceDueDate = 'J-60';
  if (form.tenantSignatureName) s.tenantSignatureName = 'contact';
  if (form.contractNumber) s.contractNumber = 'auto';
  if (form.weeklyRent && !s.weeklyRent) s.weeklyRent = 'calculé';
  if (form.rentalTotal && !s.rentalTotal) s.rentalTotal = 'calculé';
  return s;
}

function isFilled(v: unknown) {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

interface DocumentGeneratorViewProps {
  mode: DocumentMode;
  isAdmin?: boolean;
  hideHeader?: boolean;
}

export default function DocumentGeneratorView({ mode, isAdmin = false, hideHeader = false }: DocumentGeneratorViewProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [baseForm, setBaseForm] = useState<Record<string, string>>({});
  const [userEdits, setUserEdits] = useState<Record<string, string>>({});
  const [autoSources, setAutoSources] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [draftPreparing, setDraftPreparing] = useState<string | null>(null);
  const [draftSuccess, setDraftSuccess] = useState<{
    to: string; subject: string; attachmentName: string; text: string; from?: string;
  } | null>(null);
  const [emailPreview, setEmailPreview] = useState<DocumentEmailPreview | null>(null);
  const [previewingDoc, setPreviewingDoc] = useState<string | null>(null);
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  const form = useMemo(() => ({ ...baseForm, ...userEdits }), [baseForm, userEdits]);

  useEffect(() => {
    fetchContacts().then(setContacts).catch(() => setContacts([]));
  }, []);

  const fieldsFromPreview = useCallback((fields: Record<string, unknown>) => {
    const next: Record<string, string> = {};
    for (const def of FIELD_DEFS) {
      const v = fields[def.key as string];
      if (v == null) continue;
      const str = String(v);
      next[def.key as string] = def.type === 'date' || isDateFieldKey(def.key as string)
        ? toDateInputValue(str)
        : str;
    }
    if (fields.checkIn) next.checkIn = toDateInputValue(String(fields.checkIn));
    if (fields.checkOut) next.checkOut = toDateInputValue(String(fields.checkOut));
    if (fields.nights != null) next.nights = String(fields.nights);
    return next;
  }, []);

  const refreshPreview = useCallback(async (contactId: string, overrides: DocumentFormOverrides, forContact?: Contact | null) => {
    setLoading(true);
    setError(null);
    try {
      const { fields } = await previewDocuments(contactId, overrides);
      const mapped = fieldsFromPreview(fields as Record<string, unknown>);
      setBaseForm(mapped);
      setAutoSources(detectAutoSources(forContact ?? contact, mapped));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur preview');
    } finally {
      setLoading(false);
    }
  }, [fieldsFromPreview, contact]);

  const selectContact = useCallback(async (id: string) => {
    setSelectedId(id);
    setBaseForm({});
    setUserEdits({});
    const full = await fetchContactById(id);
    setContact(full);
    if (full) await refreshPreview(id, {}, full);
  }, [refreshPreview]);

  const clearContact = () => {
    setSelectedId(null);
    setContact(null);
    setBaseForm({});
    setUserEdits({});
    setAutoSources({});
    setError(null);
    setDraftSuccess(null);
    setEmailPreview(null);
    setPreviewNote(null);
    setShowValidation(false);
  };

  useEffect(() => {
    if (!selectedId) return;
    const t = setTimeout(() => {
      refreshPreview(selectedId, buildOverrides({ ...baseForm, ...userEdits }));
    }, 500);
    return () => clearTimeout(t);
    // baseForm is refreshed by this request; depending on it would loop forever.
    // User edits are the deliberate trigger for a debounced server preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEdits, selectedId, refreshPreview]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = contacts.filter(c =>
      !c.isPersonal
      && c.id !== 'barbier-et-amis'
      && !String(c.email || '').toLowerCase().endsWith('@test.local')
    );
    if (!q) return base.slice(0, 50);
    return base.filter(c => {
      const name = displayContactName(c).toLowerCase();
      return name.includes(q) || c.email?.toLowerCase().includes(q);
    }).slice(0, 50);
  }, [contacts, search]);

  const groups = useMemo(() => {
    const g = new Map<string, FieldDef[]>();
    for (const f of visibleFieldDefs(mode)) {
      if (!g.has(f.group)) g.set(f.group, []);
      g.get(f.group)!.push(f);
    }
    return g;
  }, [mode]);

  const validation = useMemo(() => validateDocumentForm(form, mode), [form, mode]);

  const setField = (key: string, value: string) => {
    setUserEdits(prev => ({ ...prev, [key]: value }));
  };

  const guardGeneration = (): boolean => {
    const v = validateDocumentForm(form, mode);
    if (!v.canGenerate) {
      setShowValidation(true);
      setError(`Complétez les champs obligatoires : ${v.missingRequired.map(f => f.label).join(', ')}`);
      return false;
    }
    setShowValidation(false);
    return true;
  };

  const handleGenerate = async (type: 'facture' | 'facture_acompte' | 'facture_solde' | 'contrat' | 'pack') => {
    if (!selectedId) return;
    if (!guardGeneration()) return;
    if (!getAdminToken()) {
      setError('Mode admin requis — activez-le via le cadenas et entrez le mot de passe.');
      return;
    }
    setGenerating(type);
    setError(null);
    setDraftSuccess(null);
    try {
      await downloadDocument(selectedId, type, buildOverrides(form));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur génération');
    } finally {
      setGenerating(null);
    }
  };

  const handlePreviewDoc = async (type: 'facture' | 'facture_acompte' | 'facture_solde' | 'contrat' | 'pack') => {
    if (!selectedId) return;
    if (!guardGeneration()) return;
    if (!getAdminToken()) {
      setError('Mode admin requis — activez-le via le cadenas et entrez le mot de passe.');
      return;
    }
    setPreviewingDoc(type);
    setError(null);
    setPreviewNote(null);
    try {
      const note = await previewDocumentFile(selectedId, type, buildOverrides(form));
      if (note) setPreviewNote(note);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur aperçu document');
    } finally {
      setPreviewingDoc(null);
    }
  };

  const handlePreviewEmail = async (type: 'facture' | 'facture_acompte' | 'facture_solde' | 'contrat' | 'pack') => {
    if (!selectedId) return;
    if (!guardGeneration()) return;
    if (!isFilled(form.tenantEmail)) {
      setError('Email locataire requis pour prévisualiser le mail.');
      setShowValidation(true);
      return;
    }
    if (!getAdminToken()) {
      setError('Mode admin requis — activez-le via le cadenas et entrez le mot de passe.');
      return;
    }
    setPreviewingDoc(`mail-${type}`);
    setError(null);
    try {
      const preview = await previewDocumentEmail(selectedId, type, buildOverrides(form));
      setEmailPreview(preview);
      setDraftSuccess(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur aperçu mail');
    } finally {
      setPreviewingDoc(null);
    }
  };

  const handlePrepareDraft = async (type: 'facture' | 'facture_acompte' | 'facture_solde' | 'contrat' | 'pack') => {
    if (!selectedId) return;
    if (!guardGeneration()) return;
    if (!isFilled(form.tenantEmail)) {
      setError('Email locataire requis pour préparer le brouillon mail.');
      setShowValidation(true);
      return;
    }
    if (!getAdminToken()) {
      setError('Mode admin requis — activez-le via le cadenas et entrez le mot de passe.');
      return;
    }
    setDraftPreparing(type);
    setError(null);
    setDraftSuccess(null);
    try {
      const result = await prepareDocumentDraft(selectedId, type, buildOverrides(form));
      setDraftSuccess({
        to: result.to,
        subject: result.subject,
        attachmentName: result.attachmentName,
        text: result.text,
        from: result.from,
      });
      setEmailPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur création brouillon');
    } finally {
      setDraftPreparing(null);
    }
  };

  const title = mode === 'facture' ? 'Factures' : 'Contrats de location';
  const subtitle = mode === 'facture'
    ? 'Générez une facture préremplie depuis le profil client et les dates de séjour.'
    : 'Générez le contrat avec les CGL (Annexe 1) et la Fiche Descriptive (Annexe 2).';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ padding: hideHeader ? 0 : 24, maxWidth: selectedId ? 'none' : 1100, margin: '0 auto', width: '100%' }}
    >
      {!hideHeader && (
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
      )}

      <div className={`docs-picker-layout${selectedId ? ' is-selected' : ''}`}>
        {/* Contact picker — masqué après sélection */}
        {!selectedId && (
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
            <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
              {filtered.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectContact(c.id)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', cursor: 'pointer',
                    background: 'transparent',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{displayContactName(c)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{c.email || '—'}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form — pleine largeur une fois le profil choisi */}
        <div style={{ minWidth: 0 }}>
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
                  <button
                    type="button"
                    onClick={clearContact}
                    title="Changer de locataire"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-color)',
                      background: 'var(--bg-body)', cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0,
                    }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, background: 'var(--brand-dim)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Sparkles size={18} color="var(--brand)" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{displayContactName(contact)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {contact.messageCount ?? 0} messages · {CHALET.name}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: 11, fontWeight: 600,
                      color: validation.canGenerate ? 'var(--success)' : 'var(--warning)',
                    }}>
                      {validation.requiredDone}/{validation.requiredTotal} obligatoires
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {validation.canGenerate ? 'prêt à générer' : 'à compléter'}
                    </div>
                  </div>
                </div>
              )}

              {loading && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', gap: 6 }}>
                  <Loader2 size={12} className="spin" /> Recalcul…
                </div>
              )}

              {!isAdmin && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, padding: '8px 12px', background: 'var(--bg-body)', borderRadius: 8 }}>
                  Téléchargement et brouillons mail nécessitent le mode admin (cadenas en haut à droite).
                </p>
              )}

              {selectedId && (
                <p style={{
                  fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, padding: '10px 14px',
                  background: 'var(--brand-dim)', borderRadius: 8, border: '1px solid var(--brand-border)', lineHeight: 1.5,
                }}>
                  Champs préremplis depuis le profil client et la réservation — <strong>vérifiez chaque valeur</strong> avant de générer.
                  Les champs marqués <strong>Obligatoire</strong> bloquent le téléchargement tant qu'ils sont vides.
                </p>
              )}

              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12, fontSize: 10, color: 'var(--text-muted)',
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--warning)' }} />
                  Obligatoire
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--brand)' }} />
                  Recommandé
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--text-muted)', opacity: 0.5 }} />
                  Optionnel
                </span>
              </div>

              {showValidation && !validation.canGenerate && (
                <div style={{
                  padding: '12px 14px', marginBottom: 12, borderRadius: 8,
                  background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)',
                  fontSize: 12, color: '#b91c1c', lineHeight: 1.5,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 6 }}>
                    <AlertCircle size={14} />
                    {validation.missingRequired.length} champ{validation.missingRequired.length > 1 ? 's' : ''} obligatoire{validation.missingRequired.length > 1 ? 's' : ''} manquant{validation.missingRequired.length > 1 ? 's' : ''}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {validation.missingRequired.map(f => (
                      <li key={f.key as string}>{f.label}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validation.canGenerate && validation.missingRecommended.length > 0 && (
                <div style={{
                  padding: '10px 14px', marginBottom: 12, borderRadius: 8,
                  background: 'var(--bg-body)', border: '1px solid var(--border-color)',
                  fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5,
                }}>
                  <strong>Recommandé :</strong>{' '}
                  {validation.missingRecommended.map(f => f.label).join(' · ')}
                  {' '}— le document peut quand même être généré.
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
                  <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                    {fields.map(def => {
                      const val = form[def.key as string] ?? '';
                      const auto = def.autoKey && autoSources[def.autoKey];
                      const filled = isFilled(val);
                      const req = fieldRequirement(def, mode);
                      const reqLabel = requirementLabel(req);
                      const missingRequired = showValidation && req === 'required' && !filled;
                      const borderColor = missingRequired
                        ? '#dc2626'
                        : req === 'required'
                          ? (filled ? 'var(--success)' : 'var(--warning)')
                          : 'var(--border-color)';
                      return (
                        <div key={def.key as string}>
                          <label style={{
                            fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase',
                            letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, flexWrap: 'wrap',
                          }}>
                            {req === 'required'
                              ? (filled ? <CheckCircle2 size={10} color="var(--success)" /> : <AlertCircle size={10} color={missingRequired ? '#dc2626' : 'var(--warning)'} />)
                              : filled ? <CheckCircle2 size={10} color="var(--success)" /> : <Circle size={10} />}
                            {def.label}
                            {reqLabel && (
                              <span style={{
                                fontSize: 8, padding: '1px 5px', borderRadius: 4, fontWeight: 700,
                                background: req === 'required' ? 'rgba(245,158,11,0.15)' : req === 'recommended' ? 'var(--brand-dim)' : 'var(--bg-body)',
                                color: requirementColor(req, filled, showValidation),
                              }}>
                                {reqLabel}
                              </span>
                            )}
                            {auto && (
                              <span style={{
                                fontSize: 8, padding: '1px 5px', borderRadius: 4,
                                background: 'var(--brand-dim)', color: 'var(--brand)', fontWeight: 700,
                              }}>
                                {auto}
                              </span>
                            )}
                          </label>
                          {def.type === 'select' ? (
                            <select
                              value={val || def.options?.[0]?.value || ''}
                              onChange={e => setField(def.key as string, e.target.value)}
                              aria-required={req === 'required'}
                              style={{
                                width: '100%', padding: '7px 10px', borderRadius: 8,
                                border: `1px solid ${borderColor}`,
                                fontSize: 12, background: 'var(--bg-body)',
                              }}
                            >
                              {def.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          ) : (
                            <input
                              type={def.type || 'text'}
                              value={def.type === 'date' ? toDateInputValue(val) : val}
                              onChange={e => setField(def.key as string, e.target.value)}
                              aria-required={req === 'required'}
                              style={{
                                width: '100%', padding: '7px 10px', borderRadius: 8,
                                border: `1px solid ${borderColor}`,
                                fontSize: 12, background: 'var(--bg-body)',
                                boxShadow: missingRequired ? '0 0 0 2px rgba(220,38,38,0.12)' : undefined,
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {previewNote && (
                <div style={{
                  padding: '10px 14px', marginBottom: 12, borderRadius: 8,
                  background: 'var(--bg-body)', border: '1px solid var(--border-color)',
                  fontSize: 11, color: 'var(--text-secondary)',
                }}>
                  {previewNote}
                </div>
              )}

              {(emailPreview || draftSuccess) && (
                <EmailPreviewPanel
                  preview={emailPreview}
                  draft={draftSuccess}
                  onClose={() => { setEmailPreview(null); setDraftSuccess(null); }}
                />
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
                {mode === 'facture' && (
                  <>
                    <ActionWithVisu
                      visuDisabled={!!generating || !!draftPreparing || !!previewingDoc || !validation.canGenerate}
                      visuLoading={previewingDoc === 'facture_acompte'}
                      onVisu={() => handlePreviewDoc('facture_acompte')}
                      actionDisabled={!!generating || !!draftPreparing || !validation.canGenerate}
                      actionLoading={generating === 'facture_acompte'}
                      onAction={() => handleGenerate('facture_acompte')}
                      actionStyle={{ ...btnPrimary, opacity: validation.canGenerate ? 1 : 0.55 }}
                      actionIcon={<Download size={16} />}
                      actionLabel="Facture acompte (.docx)"
                    />
                    <ActionWithVisu
                      visuDisabled={!!generating || !!draftPreparing || !!previewingDoc || !validation.canGenerate}
                      visuLoading={previewingDoc === 'facture_solde'}
                      onVisu={() => handlePreviewDoc('facture_solde')}
                      actionDisabled={!!generating || !!draftPreparing || !validation.canGenerate}
                      actionLoading={generating === 'facture_solde'}
                      onAction={() => handleGenerate('facture_solde')}
                      actionStyle={{ ...btnSecondary, opacity: validation.canGenerate ? 1 : 0.55 }}
                      actionIcon={<Download size={16} />}
                      actionLabel="Facture solde (.docx)"
                    />
                    <ActionWithVisu
                      visuDisabled={!!generating || !!draftPreparing || !!previewingDoc || !validation.canGenerate || !form.tenantEmail}
                      visuLoading={previewingDoc === 'mail-facture_acompte'}
                      onVisu={() => handlePreviewEmail('facture_acompte')}
                      actionDisabled={!!generating || !!draftPreparing || !validation.canGenerate || !form.tenantEmail}
                      actionLoading={draftPreparing === 'facture_acompte'}
                      onAction={() => handlePrepareDraft('facture_acompte')}
                      actionStyle={{ ...btnMail, opacity: validation.canGenerate && form.tenantEmail ? 1 : 0.55 }}
                      actionIcon={<Mail size={16} />}
                      actionLabel="Mail acompte prêt à l'envoi"
                    />
                    <ActionWithVisu
                      visuDisabled={!!generating || !!draftPreparing || !!previewingDoc || !validation.canGenerate || !form.tenantEmail}
                      visuLoading={previewingDoc === 'mail-facture_solde'}
                      onVisu={() => handlePreviewEmail('facture_solde')}
                      actionDisabled={!!generating || !!draftPreparing || !validation.canGenerate || !form.tenantEmail}
                      actionLoading={draftPreparing === 'facture_solde'}
                      onAction={() => handlePrepareDraft('facture_solde')}
                      actionStyle={{ ...btnMail, opacity: validation.canGenerate && form.tenantEmail ? 1 : 0.55 }}
                      actionIcon={<Mail size={16} />}
                      actionLabel="Mail solde prêt à l'envoi"
                    />
                  </>
                )}
                {mode === 'contrat' && (
                  <>
                    <ActionWithVisu
                      visuDisabled={!!generating || !!draftPreparing || !!previewingDoc || !validation.canGenerate}
                      visuLoading={previewingDoc === 'contrat'}
                      onVisu={() => handlePreviewDoc('contrat')}
                      actionDisabled={!!generating || !!draftPreparing || !validation.canGenerate}
                      actionLoading={generating === 'contrat'}
                      onAction={() => handleGenerate('contrat')}
                      actionStyle={{ ...btnSecondary, opacity: validation.canGenerate ? 1 : 0.55 }}
                      actionIcon={<FileText size={16} />}
                      actionLabel="Contrat seul (.docx)"
                    />
                    <ActionWithVisu
                      visuDisabled={!!generating || !!draftPreparing || !!previewingDoc || !validation.canGenerate}
                      visuLoading={previewingDoc === 'pack'}
                      onVisu={() => handlePreviewDoc('pack')}
                      actionDisabled={!!generating || !!draftPreparing || !validation.canGenerate}
                      actionLoading={generating === 'pack'}
                      onAction={() => handleGenerate('pack')}
                      actionStyle={{ ...btnPrimary, opacity: validation.canGenerate ? 1 : 0.55 }}
                      actionIcon={<Package size={16} />}
                      actionLabel="Pack complet (.pdf + annexes)"
                    />
                    <ActionWithVisu
                      visuDisabled={!!generating || !!draftPreparing || !!previewingDoc || !validation.canGenerate || !form.tenantEmail}
                      visuLoading={previewingDoc === 'mail-pack'}
                      onVisu={() => handlePreviewEmail('pack')}
                      actionDisabled={!!generating || !!draftPreparing || !validation.canGenerate || !form.tenantEmail}
                      actionLoading={draftPreparing === 'pack'}
                      onAction={() => handlePrepareDraft('pack')}
                      actionStyle={{ ...btnMail, opacity: validation.canGenerate && form.tenantEmail ? 1 : 0.55 }}
                      actionIcon={<Mail size={16} />}
                      actionLabel="Préparer le mail prêt à l'envoi"
                    />
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
    contractDate: toDateInputValue(form.contractDate) || undefined,
    issueDate: toDateInputValue(form.issueDate) || undefined,
    tenantName: form.tenantName,
    tenantAddress1: form.tenantAddress1,
    tenantAddress2: form.tenantAddress2,
    tenantAddress3: form.tenantAddress3,
    tenantPostalCity: form.tenantAddress2,
    tenantPhone: form.tenantPhone,
    tenantEmail: form.tenantEmail,
    adults: num('adults'),
    children: num('children'),
    checkIn: toDateInputValue(form.checkIn) || undefined,
    checkOut: toDateInputValue(form.checkOut) || undefined,
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
    depositDueDate: toDateInputValue(form.depositDueDate) || undefined,
    balanceDueDate: toDateInputValue(form.balanceDueDate) || undefined,
    tenantSignatureName: form.tenantSignatureName,
    invoiceKind: form.invoiceKind === 'solde' ? 'solde' : 'acompte',
    paymentMethod: form.paymentMethod === 'carte' ? 'carte' : 'virement',
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

const btnMail: React.CSSProperties = {
  ...btnPrimary,
  background: '#0f766e',
};

const btnVisu: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 14px', borderRadius: 10,
  border: '1px solid var(--border-color)', background: 'var(--bg-body)', color: 'var(--text-secondary)',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
};

function ActionWithVisu({
  visuDisabled, visuLoading, onVisu, actionDisabled, actionLoading, onAction,
  actionStyle, actionIcon, actionLabel,
}: {
  visuDisabled: boolean;
  visuLoading: boolean;
  onVisu: () => void;
  actionDisabled: boolean;
  actionLoading: boolean;
  onAction: () => void;
  actionStyle: React.CSSProperties;
  actionIcon: React.ReactNode;
  actionLabel: string;
}) {
  return (
    <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      <button type="button" disabled={visuDisabled} onClick={onVisu} style={btnVisu} title="Aperçu avant téléchargement ou envoi">
        {visuLoading ? <Loader2 size={14} className="spin" /> : <Eye size={14} />}
        Visu
      </button>
      <button type="button" disabled={actionDisabled} onClick={onAction} style={actionStyle}>
        {actionLoading ? <Loader2 size={16} className="spin" /> : actionIcon}
        {actionLabel}
      </button>
    </div>
  );
}

function EmailPreviewPanel({
  preview,
  draft,
  onClose,
}: {
  preview: DocumentEmailPreview | null;
  draft: { to: string; subject: string; attachmentName: string; text: string; from?: string } | null;
  onClose: () => void;
}) {
  const data = draft || preview;
  if (!data) return null;
  const isDraft = !!draft;

  return (
    <div style={{
      padding: '14px 16px', marginBottom: 12, borderRadius: 10,
      background: isDraft ? 'rgba(16,185,129,0.08)' : 'var(--bg-surface)',
      border: `1px solid ${isDraft ? 'rgba(16,185,129,0.25)' : 'var(--border-color)'}`,
      fontSize: 12, lineHeight: 1.55, color: isDraft ? '#047857' : 'var(--text-primary)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
          {isDraft ? <Check size={14} /> : <Mail size={14} color="var(--brand)" />}
          {isDraft ? 'Brouillon prêt dans contact@alpicois-laplagne.fr' : 'Aperçu du mail (pas encore envoyé)'}
        </div>
        <button type="button" onClick={onClose} style={{
          border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)',
        }}>
          Fermer
        </button>
      </div>
      <div style={{ display: 'grid', gap: 4, marginBottom: 10, fontSize: 11 }}>
        {data.from && <div><strong>De :</strong> {data.from}</div>}
        <div><strong>À :</strong> {data.to}</div>
        <div><strong>Objet :</strong> {data.subject}</div>
        <div><strong>Pièce jointe :</strong> {data.attachmentName}</div>
      </div>
      <div style={{
        padding: '12px 14px', borderRadius: 8,
        background: isDraft ? 'rgba(255,255,255,0.6)' : 'var(--bg-body)',
        border: '1px solid var(--border-subtle)',
        whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12,
        color: 'var(--text-primary)', maxHeight: 320, overflowY: 'auto',
      }}>
        {data.text}
      </div>
      {isDraft && (
        <div style={{ marginTop: 8, color: '#065f46', fontSize: 11 }}>
          Ouvrez l'app mail sur votre téléphone, vérifiez le message ci-dessus et envoyez.
        </div>
      )}
    </div>
  );
}
