import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, User, Bot, RefreshCw, Check, X, Mail, CalendarDays } from 'lucide-react';
import {
  fetchAuditLog, resolveAuditProposals, type AuditEntry,
} from '../data';
import { routes } from '../lib/routes';

type SourceFilter = 'all' | 'automatic' | 'gilles' | 'claire';

const ACTION_LABELS: Record<string, string> = {
  booking_removed: 'Réservation retirée',
  price_updated: 'Prix modifié',
  stay_updated: 'Séjour modifié',
  week_confirmed: 'Semaine confirmée',
  week_status_updated: 'Statut semaine modifié',
  contact_updated: 'Fiche client modifiée',
  data_refresh: 'Synchronisation données',
  sync_proposal: 'Proposition sync',
  sync_validated: 'Validations enregistrées',
  mail_template_updated: 'Modèle mail modifié',
  mail_template_reset: 'Modèle mail réinitialisé',
  mail_tracking_updated: 'Suivi mail mis à jour',
  ai_reconcile: 'Correction IA',
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function actorLabel(actor: string) {
  if (actor === 'gilles') return 'Gilles';
  if (actor === 'claire') return 'Claire';
  return 'Automatique';
}

function actorIcon(actor: string) {
  if (actor === 'automatic') return Bot;
  return User;
}

function proposalLabel(entry: AuditEntry) {
  if (entry.payload?.label) return String(entry.payload.label);
  return ACTION_LABELS[entry.action] || entry.action;
}

export default function AuditHistoryPanel({
  isAdmin,
  focusPending = false,
  onPendingResolved,
}: {
  isAdmin: boolean;
  focusPending?: boolean;
  onPendingResolved?: () => void;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<SourceFilter>('automatic');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    const pendingOnly = filter === 'automatic';
    const source = filter === 'all' ? undefined : filter;
    fetchAuditLog(150, source, pendingOnly)
      .then(({ entries: list, pendingCount: n }) => {
        setEntries(list);
        setPendingCount(n);
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (focusPending) setFilter('automatic');
  }, [focusPending]);

  useEffect(() => {
    if (!isAdmin) {
      setEntries([]);
      setLoading(false);
      return;
    }
    load();
  }, [filter, isAdmin]);

  const pendingEntries = entries.filter(e => e.validationStatus === 'pending');

  async function resolveOne(entry: AuditEntry, approved: boolean) {
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await resolveAuditProposals([{ id: entry.id, approved }]);
      setMsg(`${approved ? 'Validé' : 'Refusé'} : ${proposalLabel(entry)}`);
      load();
      onPendingResolved?.();
      setPendingCount(res.pendingCount);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erreur validation');
    } finally {
      setSubmitting(false);
    }
  }

  const filters: { id: SourceFilter; label: string }[] = [
    { id: 'automatic', label: `Automatique à valider${pendingCount ? ` (${pendingCount})` : ''}` },
    { id: 'all', label: 'Tout' },
    { id: 'gilles', label: 'Gilles' },
    { id: 'claire', label: 'Claire' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end', alignItems: 'center', marginBottom: 16 }}>
        <button type="button" onClick={load} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', fontSize: 11, cursor: 'pointer' }}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Actualiser
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {filters.map(f => (
          <button key={f.id} type="button" onClick={() => setFilter(f.id)}
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              border: filter === f.id ? '1px solid var(--brand-border)' : '1px solid var(--border-color)',
              background: filter === f.id ? 'var(--brand-dim)' : 'var(--bg-surface)',
              color: filter === f.id ? 'var(--brand)' : 'var(--text-secondary)',
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {filter === 'automatic' && pendingEntries.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
          Propositions automatiques détectées depuis les derniers mails. Chaque carte indique la mise à jour souhaitée, le mail source et le séjour concerné.
        </p>
      )}

      {!isAdmin && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: 16, background: 'var(--bg-surface)', borderRadius: 8 }}>
          Mode admin requis pour voir l'historique complet.
        </p>
      )}

      {loading && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargement…</p>}

      {!loading && entries.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: 24, textAlign: 'center' }}>
          {filter === 'automatic' ? 'Aucune proposition automatique à valider.' : 'Aucune modification enregistrée.'}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(entry => {
          const Icon = actorIcon(entry.actor);
          const color = entry.actor === 'gilles' ? '#2563eb' : entry.actor === 'claire' ? '#7c3aed' : '#6b7280';
          const isPending = entry.validationStatus === 'pending';
          const showDecisionButtons = isPending && filter === 'automatic';

          return (
            <div key={entry.id} style={{
              padding: 16, borderRadius: 10, background: 'var(--bg-surface)',
              border: `1px solid ${isPending ? 'rgba(13,148,136,0.35)' : 'var(--border-color)'}`,
              display: 'grid', gridTemplateColumns: showDecisionButtons ? 'auto 1fr minmax(150px, auto)' : 'auto 1fr auto',
              gap: 16, alignItems: 'start',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8, background: isPending ? 'rgba(13,148,136,0.12)' : `${color}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={16} color={isPending ? 'var(--brand)' : color} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 13, fontWeight: 750, color: 'var(--text-primary)' }}>
                    {proposalLabel(entry)}
                  </div>
                  {isPending && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: 'var(--brand)', background: 'var(--brand-dim)',
                      border: '1px solid var(--brand-border)', borderRadius: 999, padding: '2px 8px',
                    }}>
                      Automatique à valider
                    </span>
                  )}
                </div>
                {entry.payload?.field != null && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {entry.payload.field === 'mailReview' ? 'Proposition proposée :' : 'Mise à jour souhaitée :'}
                    </strong>{' '}
                    {friendlyField(String(entry.payload.field))} → {friendlyValue(entry.payload.proposed)}
                  </div>
                )}
                {entry.payload?.reviewReason != null && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    Pourquoi : {String(entry.payload.reviewReason)}
                  </div>
                )}
                {entry.payload?.emailExcerpt != null && (
                  <div style={{
                    marginTop: 8, padding: '8px 10px', borderRadius: 8,
                    background: 'var(--bg-body)', border: '1px solid var(--border-subtle)',
                    fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5,
                  }}>
                    {String(entry.payload.emailExcerpt)}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.45 }}>
                  {entry.payload?.emailSubject != null && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Mail size={12} /> {String(entry.payload.emailSubject).slice(0, 80)}
                    </span>
                  )}
                  {entry.payload?.checkIn != null && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <CalendarDays size={12} /> {String(entry.payload.checkIn)} → {String(entry.payload.checkOut || '')}
                    </span>
                  )}
                  {entry.payload?.emailId != null && <span>ID mail {String(entry.payload.emailId)}</span>}
                  {entry.payload?.mails != null && <span>{String(entry.payload.mails)} mail(s)</span>}
                  {entry.payload?.signals != null && <span>{String(entry.payload.signals)} statut(s)</span>}
                  {entry.payload?.proposals != null && <span>{String(entry.payload.proposals)} proposition(s)</span>}
                </div>
                <div style={{ marginTop: 8 }}>
                  {entry.contactId && (
                    <button type="button" onClick={() => navigate(routes.client(entry.contactId))}
                      style={{ border: 'none', background: 'transparent', color: 'var(--brand)', fontSize: 11, fontWeight: 750, cursor: 'pointer', padding: 0 }}>
                      ouvrir la fiche
                    </button>
                  )}
                </div>
              </div>

              {showDecisionButtons ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
                  <button type="button" disabled={submitting} onClick={() => resolveOne(entry, true)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '8px 12px', borderRadius: 8, border: 'none', cursor: submitting ? 'wait' : 'pointer',
                      background: '#059669', color: 'white', fontSize: 11, fontWeight: 750,
                    }}>
                    <Check size={14} />
                    Valider
                  </button>
                  <button type="button" disabled={submitting} onClick={() => resolveOne(entry, false)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(220,38,38,0.25)',
                      cursor: submitting ? 'wait' : 'pointer', background: 'rgba(220,38,38,0.08)',
                      color: '#dc2626', fontSize: 11, fontWeight: 750,
                    }}>
                    <X size={14} />
                    Refuser
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--text-muted)' }}>
                  <div style={{ fontWeight: 600, color }}>{actorLabel(entry.actor)}</div>
                  {isPending && (
                    <div style={{ color: 'var(--brand)', fontWeight: 700, marginTop: 2 }}>Automatique à valider</div>
                  )}
                  <div style={{ marginTop: 4 }}>{fmtDate(entry.createdAt)}</div>
                </div>
              )}

              {showDecisionButtons && (
                <div style={{ gridColumn: '2 / 3', marginTop: -10, fontSize: 10, color: 'var(--text-muted)' }}>
                  Détecté automatiquement le {fmtDate(entry.createdAt)}
                  {msg && (
                    <span style={{ marginLeft: 10, color: 'var(--text-secondary)', fontWeight: 600 }}>{msg}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filter === 'automatic' && pendingEntries.length > 0 && msg && (
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 12 }}>{msg}</p>
      )}
    </div>
  );
}

function friendlyField(field: string) {
  const m: Record<string, string> = {
    contractSigned: 'Contrat signé',
    depositPaid: 'Acompte payé',
    insuranceReceived: 'Assurance villégiature reçue',
    idReceived: "Pièce d'identité reçue",
    balancePaid: 'Solde payé',
    depositGuaranteePaid: 'Caution reçue',
    depositGuaranteeReturned: 'Caution rendue',
    depositInvoiceSent: 'Facture acompte envoyée',
    balanceInvoiceSent: 'Facture solde envoyée',
    contractSent: 'Contrat envoyé',
    mailSteps: 'Étape mail',
    mailReview: 'Revue du mail',
  };
  return m[field] || field;
}

function friendlyValue(value: unknown) {
  if (typeof value === 'boolean') return value ? 'marquer comme reçu / fait' : 'non';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
