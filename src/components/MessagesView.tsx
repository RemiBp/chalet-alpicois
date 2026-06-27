import { useState, useEffect, useCallback, useMemo } from 'react';
import { Mail, Search, Loader2, CheckCircle2, Circle, Eye, Save, RotateCcw, User } from 'lucide-react';
import type { Contact } from '../types';
import {
  fetchContacts, fetchMailTemplates, updateMailTemplate, resetMailTemplate,
  fetchContactMailTracking, updateContactMailTracking, type MailTemplate, type MailTrackingStep,
} from '../data';
import { displayContactName } from '../lib/formatName';
import MailStepPreviewPanel, { loadStepPreview, type StepPreviewState } from './MailStepPreviewPanel';

type SubTab = 'library' | 'suivi';

function stepKey(templateKey: string) {
  return templateKey;
}

export default function MessagesView({ isAdmin = false }: { isAdmin?: boolean }) {
  const [subTab, setSubTab] = useState<SubTab>('suivi');
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tracking, setTracking] = useState<MailTrackingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [editLang, setEditLang] = useState<'fr' | 'en'>('fr');
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [expandedPreviewKey, setExpandedPreviewKey] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, StepPreviewState>>({});
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchMailTemplates().then(setTemplates),
      fetchContacts().then(setContacts),
    ]).finally(() => setLoading(false));
  }, []);

  const loadTracking = useCallback(async (contactId: string) => {
    const t = await fetchContactMailTracking(contactId);
    setTracking(t);
  }, []);

  useEffect(() => {
    if (selectedId) loadTracking(selectedId);
  }, [selectedId, loadTracking]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = contacts.filter(c => !c.isPersonal && c.id !== 'barbier-et-amis');
    if (!q) return base.slice(0, 40);
    return base.filter(c =>
      displayContactName(c).toLowerCase().includes(q) || c.email?.toLowerCase().includes(q),
    ).slice(0, 40);
  }, [contacts, search]);

  const selectContact = async (id: string) => {
    setSelectedId(id);
    setExpandedPreviewKey(null);
    setPreviews({});
    await loadTracking(id);
  };

  const openTemplate = (tpl: MailTemplate, lang: 'fr' | 'en') => {
    setExpandedKey(tpl.key);
    setEditLang(lang);
    const c = lang === 'en' ? tpl.en : tpl.fr;
    setEditSubject(c.subject);
    setEditBody(c.body);
  };

  const saveTemplate = async () => {
    if (!expandedKey || !isAdmin) return;
    setBusy(true);
    try {
      const updated = await updateMailTemplate(expandedKey, editLang, editSubject, editBody);
      setTemplates(updated);
      setMsg('Modèle enregistré.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const resetTemplate = async () => {
    if (!expandedKey || !isAdmin) return;
    setBusy(true);
    try {
      const updated = await resetMailTemplate(expandedKey, editLang);
      setTemplates(updated);
      openTemplate(updated.find(t => t.key === expandedKey)!, editLang);
      setMsg('Modèle réinitialisé.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const markStep = async (templateKey: string, status: 'pending' | 'sent' | 'skipped', lang: 'fr' | 'en') => {
    if (!selectedId || !isAdmin) return;
    setBusy(true);
    try {
      const t = await updateContactMailTracking(selectedId, templateKey, { status, lang });
      setTracking(t);
    } finally {
      setBusy(false);
    }
  };

  const togglePreview = async (templateKey: string, lang: 'fr' | 'en') => {
    if (!selectedId) {
      setMsg('Sélectionnez un locataire pour prévisualiser avec ses données.');
      return;
    }
    const key = stepKey(templateKey);
    if (expandedPreviewKey === key) {
      setExpandedPreviewKey(null);
      return;
    }
    setExpandedPreviewKey(key);
    setMsg(null);
    if (previews[key]) return;
    setPreviewLoading(key);
    try {
      const loaded = await loadStepPreview(selectedId, templateKey, lang);
      setPreviews(prev => ({ ...prev, [key]: loaded }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erreur preview');
      setExpandedPreviewKey(null);
    } finally {
      setPreviewLoading(null);
    }
  };

  const sentCount = tracking.filter(t => t.status === 'sent').length;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selectedId ? '260px 1fr' : '280px 1fr', gap: 16, alignItems: 'start' }}>
      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>LOCATAIRE</div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
              style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12 }} />
          </div>
        </div>
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          {filtered.map(c => (
            <button key={c.id} type="button" onClick={() => selectContact(c.id)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', cursor: 'pointer',
                background: selectedId === c.id ? 'var(--brand-dim)' : 'transparent',
                borderBottom: '1px solid var(--border-subtle)',
              }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{displayContactName(c)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.email || '—'}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {([
            { id: 'suivi' as const, label: 'Suivi par locataire' },
            { id: 'library' as const, label: 'Bibliothèque modèles' },
          ]).map(t => (
            <button key={t.id} type="button" onClick={() => setSubTab(t.id)}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: subTab === t.id ? '1px solid var(--brand-border)' : '1px solid var(--border-color)',
                background: subTab === t.id ? 'var(--brand-dim)' : 'var(--bg-surface)',
                color: subTab === t.id ? 'var(--brand)' : 'var(--text-secondary)',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {msg && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, fontSize: 11, background: 'var(--bg-body)', border: '1px solid var(--border-color)' }}>
            {msg}
          </div>
        )}

        {loading && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}><Loader2 size={14} className="animate-spin" /> Chargement…</p>}

        {subTab === 'suivi' && !loading && (
          !selectedId ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, border: '1px dashed var(--border-color)', borderRadius: 12 }}>
              <User size={28} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
              Choisissez un locataire pour voir l'avancée des mails
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
                Pipeline : <strong>{sentCount}</strong> / {tracking.length} mails envoyés
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tracking.map((step, i) => {
                  const done = step.status === 'sent';
                  const skipped = step.status === 'skipped';
                  const lang = (step.lang as 'fr' | 'en') || 'fr';
                  const key = stepKey(step.templateKey);
                  const isOpen = expandedPreviewKey === key;
                  const preview = previews[key];
                  return (
                    <div key={step.templateKey} style={{
                      padding: 14, borderRadius: 10, border: `1px solid ${isOpen ? 'var(--brand-border)' : 'var(--border-color)'}`,
                      background: done ? 'rgba(16,185,129,0.06)' : 'var(--bg-surface)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        {done ? <CheckCircle2 size={16} color="#059669" /> : skipped ? <Circle size={16} color="#9ca3af" /> : <Circle size={16} color="var(--warning)" />}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{i + 1}. {step.labelFr}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{step.labelEn}</div>
                          {step.sentAt && <div style={{ fontSize: 10, color: '#059669', marginTop: 4 }}>Envoyé le {new Date(step.sentAt).toLocaleDateString('fr-FR')}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            disabled={(!isAdmin && !selectedId) || previewLoading === key}
                            title={!isAdmin ? 'Mode admin requis pour l\'aperçu complet' : undefined}
                            onClick={() => togglePreview(step.templateKey, lang)}
                            style={{
                              padding: '4px 8px', borderRadius: 6,
                              border: `1px solid ${isOpen ? 'var(--brand)' : 'var(--border-color)'}`,
                              background: isOpen ? 'var(--brand-dim)' : 'var(--bg-body)',
                              fontSize: 10, cursor: 'pointer',
                            }}
                          >
                            {previewLoading === key
                              ? <Loader2 size={10} className="spin" style={{ display: 'inline', marginRight: 4 }} />
                              : <Eye size={10} style={{ display: 'inline', marginRight: 4 }} />}
                            Visu
                          </button>
                          {isAdmin && (
                            <>
                              <button type="button" disabled={busy} onClick={() => markStep(step.templateKey, 'sent', 'fr')}
                                style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#059669', color: 'white', fontSize: 10, cursor: 'pointer' }}>
                                FR ✓
                              </button>
                              <button type="button" disabled={busy} onClick={() => markStep(step.templateKey, 'sent', 'en')}
                                style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#2563eb', color: 'white', fontSize: 10, cursor: 'pointer' }}>
                                EN ✓
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {isOpen && preview && selectedId && (
                        <MailStepPreviewPanel
                          contactId={selectedId}
                          templateKey={step.templateKey}
                          lang={lang}
                          preview={preview}
                          isAdmin={isAdmin}
                          busy={busy}
                          onPreviewChange={next => setPreviews(prev => ({ ...prev, [key]: next }))}
                          onDraftCreated={t => { if (t) setTracking(t); }}
                          onClose={() => setExpandedPreviewKey(null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )
        )}

        {subTab === 'library' && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {templates.map(tpl => (
              <div key={tpl.key} style={{ borderRadius: 10, border: '1px solid var(--border-color)', overflow: 'hidden', background: 'var(--bg-surface)' }}>
                <button type="button" onClick={() => {
                  const next = expandedKey === tpl.key ? null : tpl.key;
                  setExpandedKey(next);
                  if (next) openTemplate(tpl, editLang);
                }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none', cursor: 'pointer',
                    background: expandedKey === tpl.key ? 'var(--brand-dim)' : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                  <Mail size={14} color="var(--brand)" />
                  <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{tpl.order}. {tpl.labelFr}</span>
                  {(tpl.fr.isCustom || tpl.en.isCustom) && (
                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'var(--brand-dim)', color: 'var(--brand)' }}>personnalisé</span>
                  )}
                </button>
                {expandedKey === tpl.key && (
                  <div style={{ padding: 14, borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                      {(['fr', 'en'] as const).map(lang => (
                        <button key={lang} type="button" onClick={() => openTemplate(tpl, lang)}
                          style={{
                            padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                            border: editLang === lang ? '1px solid var(--brand)' : '1px solid var(--border-color)',
                            background: editLang === lang ? 'var(--brand-dim)' : 'var(--bg-body)',
                          }}>
                          {lang.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    {isAdmin ? (
                      <>
                        <input value={editSubject} onChange={e => setEditSubject(e.target.value)}
                          style={{ width: '100%', marginBottom: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12 }} />
                        <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={10}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 11, fontFamily: 'inherit', lineHeight: 1.45 }} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <button type="button" disabled={busy} onClick={saveTemplate}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: 'white', fontSize: 11, cursor: 'pointer' }}>
                            <Save size={12} /> Enregistrer
                          </button>
                          <button type="button" disabled={busy} onClick={resetTemplate}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-body)', fontSize: 11, cursor: 'pointer' }}>
                            <RotateCcw size={12} /> Défaut
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>{editLang === 'en' ? tpl.en.subject : tpl.fr.subject}</div>
                        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, fontFamily: 'inherit', margin: 0 }}>{editLang === 'en' ? tpl.en.body : tpl.fr.body}</pre>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
