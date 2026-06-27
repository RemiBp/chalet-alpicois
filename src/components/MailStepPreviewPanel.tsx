import { useState } from 'react';
import { Mail, Send, Loader2, Check, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import type { MailTemplatePreview, MailTrackingStep } from '../data';
import { createMailTemplateDraft, previewMailTemplate } from '../data';

export type StepPreviewState = MailTemplatePreview & {
  editingSubject: string;
  editingBody: string;
  attachToThread: boolean;
  replyToEmailId: string | null;
  draftSuccess: string | null;
  showThread: boolean;
};

function fmtShortDate(iso: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso.slice(0, 10);
  }
}

export async function loadStepPreview(
  contactId: string,
  templateKey: string,
  lang: 'fr' | 'en',
  opts?: { attachToThread?: boolean; replyToEmailId?: string | null },
): Promise<StepPreviewState> {
  const p = await previewMailTemplate(contactId, templateKey, lang, opts);
  return {
    ...p,
    editingSubject: p.subject,
    editingBody: p.body,
    attachToThread: p.attachToThread,
    replyToEmailId: p.replyToEmailId,
    draftSuccess: null,
    showThread: false,
  };
}

export default function MailStepPreviewPanel({
  contactId,
  templateKey,
  lang,
  preview,
  isAdmin,
  busy,
  onPreviewChange,
  onDraftCreated,
  onClose,
}: {
  contactId: string;
  templateKey: string;
  lang: 'fr' | 'en';
  preview: StepPreviewState;
  isAdmin: boolean;
  busy: boolean;
  onPreviewChange: (next: StepPreviewState) => void;
  onDraftCreated: (tracking?: MailTrackingStep[]) => void;
  onClose: () => void;
}) {
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadBusy, setReloadBusy] = useState(false);

  async function refreshPreview(nextAttach: boolean, nextReplyId: string | null) {
    setReloadBusy(true);
    setError(null);
    try {
      const loaded = await loadStepPreview(contactId, templateKey, lang, {
        attachToThread: nextAttach,
        replyToEmailId: nextReplyId,
      });
      onPreviewChange({
        ...loaded,
        editingSubject: loaded.subject,
        editingBody: preview.editingBody,
        showThread: preview.showThread,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur rechargement');
    } finally {
      setReloadBusy(false);
    }
  }

  async function createDraft(markSent: boolean) {
    if (!isAdmin) return;
    setDrafting(true);
    setError(null);
    try {
      const result = await createMailTemplateDraft({
        contactId,
        templateKey,
        lang,
        subject: preview.editingSubject,
        text: preview.editingBody,
        attachToThread: preview.attachToThread,
        replyToEmailId: preview.replyToEmailId,
        markSent,
      });
      onPreviewChange({
        ...preview,
        draftSuccess: `Brouillon créé dans ${result.folder || 'Brouillons'} — vérifiez sur votre téléphone et envoyez.`,
      });
      onDraftCreated(result.tracking);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur brouillon');
    } finally {
      setDrafting(false);
    }
  }

  const varsHint = [
    preview.vars?.checkIn && `Arrivée : ${preview.vars.checkIn}`,
    preview.vars?.checkOut && `Départ : ${preview.vars.checkOut}`,
    preview.vars?.weeklyPrice && `Tarif : ${preview.vars.weeklyPrice} €`,
    preview.vars?.balanceDue && `Solde : ${preview.vars.balanceDue} €`,
  ].filter(Boolean).join(' · ');

  return (
    <div style={{
      marginTop: 12, padding: 14, borderRadius: 10,
      border: '1px solid var(--brand-border)', background: 'var(--brand-dim)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)' }}>Aperçu mail {lang.toUpperCase()}</div>
          {varsHint && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{varsHint}</div>
          )}
        </div>
        <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 10, color: 'var(--text-muted)' }}>
          Fermer
        </button>
      </div>

      {preview.draftSuccess ? (
        <div style={{
          padding: '10px 12px', borderRadius: 8, marginBottom: 10,
          background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
          fontSize: 11, color: '#047857', display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <Check size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{preview.draftSuccess}</span>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 6, marginBottom: 10, fontSize: 11 }}>
            <div><strong>À :</strong> {preview.to || '—'}</div>
            {isAdmin ? (
              <>
                <input
                  value={preview.editingSubject}
                  onChange={e => onPreviewChange({ ...preview, editingSubject: e.target.value })}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11 }}
                  placeholder="Objet"
                />
                <textarea
                  value={preview.editingBody}
                  onChange={e => onPreviewChange({ ...preview, editingBody: e.target.value })}
                  rows={12}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-color)',
                    fontSize: 11, fontFamily: 'inherit', lineHeight: 1.45, resize: 'vertical',
                  }}
                />
              </>
            ) : (
              <>
                <div><strong>Objet :</strong> {preview.editingSubject}</div>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, fontFamily: 'inherit', margin: 0, maxHeight: 240, overflowY: 'auto' }}>{preview.editingBody}</pre>
              </>
            )}
          </div>

          <div style={{ marginBottom: 10, borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => onPreviewChange({ ...preview, showThread: !preview.showThread })}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, fontWeight: 600,
              }}
            >
              <MessageSquare size={13} color="var(--brand)" />
              Fil de conversation ({preview.threadCandidates.length} message{preview.threadCandidates.length !== 1 ? 's' : ''})
              {preview.showThread ? <ChevronUp size={13} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={13} style={{ marginLeft: 'auto' }} />}
            </button>
            {preview.showThread && (
              <div style={{ padding: '0 10px 10px', borderTop: '1px solid var(--border-subtle)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '8px 0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!preview.attachToThread}
                    onChange={e => {
                      const attach = !e.target.checked;
                      onPreviewChange({ ...preview, attachToThread: attach, replyToEmailId: attach ? preview.replyToEmailId : null });
                      refreshPreview(attach, attach ? preview.replyToEmailId : null);
                    }}
                  />
                  Nouveau fil (sans réponse)
                </label>
                {preview.attachToThread && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                    {preview.threadCandidates.length === 0 ? (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 0' }}>Aucun message — le brouillon sera un nouveau fil.</div>
                    ) : preview.threadCandidates.map(c => (
                      <label
                        key={c.id}
                        style={{
                          display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                          border: preview.replyToEmailId === c.id ? '1px solid var(--brand)' : '1px solid var(--border-subtle)',
                          background: preview.replyToEmailId === c.id ? 'var(--brand-dim)' : 'var(--bg-body)',
                        }}
                      >
                        <input
                          type="radio"
                          name={`thread-${templateKey}`}
                          checked={preview.replyToEmailId === c.id || (!preview.replyToEmailId && c.isInbox)}
                          onChange={() => {
                            onPreviewChange({ ...preview, attachToThread: true, replyToEmailId: c.id });
                            refreshPreview(true, c.id);
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subject}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                            {fmtShortDate(c.date)} · {c.isInbox ? 'Reçu' : c.mailbox}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                {preview.attachToThread && preview.replyToEmailId && (
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6 }}>
                    Objet avec fil : <em>{preview.editingSubject}</em>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div style={{ fontSize: 10, color: '#b91c1c', marginBottom: 8 }}>{error}</div>
          )}

          {isAdmin && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={drafting || busy || reloadBusy || !preview.to}
                onClick={() => createDraft(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
                  border: 'none', background: 'var(--brand)', color: 'white', fontSize: 11, cursor: 'pointer',
                }}
              >
                {drafting ? <Loader2 size={13} className="spin" /> : <Send size={13} />}
                Créer brouillon
              </button>
              <button
                type="button"
                disabled={drafting || busy || reloadBusy || !preview.to}
                onClick={() => createDraft(true)}
                title="Crée le brouillon et marque l'étape comme envoyée"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
                  border: '1px solid var(--border-color)', background: 'var(--bg-body)', fontSize: 11, cursor: 'pointer',
                }}
              >
                <Mail size={13} /> Brouillon + marquer envoyé
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
