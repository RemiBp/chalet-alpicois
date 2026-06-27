import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, User, Bot, RefreshCw, Check, X, CheckCircle2 } from 'lucide-react';
import {
  fetchAuditLog, resolveAuditProposals, type AuditEntry,
} from '../data';
import { routes } from '../lib/routes';

type SourceFilter = 'all' | 'automatic' | 'gilles' | 'claire' | 'pending';

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
  const [filter, setFilter] = useState<SourceFilter>(focusPending ? 'pending' : 'automatic');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [decisions, setDecisions] = useState<Record<string, boolean | undefined>>({});
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    const pendingOnly = filter === 'pending';
    const source = filter === 'all' || filter === 'pending' ? undefined : filter;
    fetchAuditLog(150, source, pendingOnly)
      .then(({ entries: list, pendingCount: n }) => {
        setEntries(list);
        setPendingCount(n);
        if (pendingOnly) {
          const init: Record<string, boolean | undefined> = {};
          list.filter(e => e.validationStatus === 'pending').forEach(e => { init[e.id] = undefined; });
          setDecisions(init);
        }
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (focusPending) setFilter('pending');
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
  const allDecided = pendingEntries.length > 0
    && pendingEntries.every(e => decisions[e.id] === true || decisions[e.id] === false);

  async function submitDecisions() {
    const batch = pendingEntries
      .filter(e => decisions[e.id] === true || decisions[e.id] === false)
      .map(e => ({ id: e.id, approved: decisions[e.id] === true }));
    if (batch.length === 0) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await resolveAuditProposals(batch);
      setMsg(`${batch.filter(d => d.approved).length} accepté(s), ${batch.filter(d => !d.approved).length} refusé(s)`);
      setDecisions({});
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
    { id: 'pending', label: `À valider${pendingCount ? ` (${pendingCount})` : ''}` },
    { id: 'automatic', label: 'Automatique' },
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

      {filter === 'pending' && pendingEntries.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
          Propositions détectées lors de la synchronisation — validez ou refusez chaque ajustement, puis confirmez en bas.
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
          {filter === 'pending' ? 'Aucune proposition en attente — lancez une synchronisation.' : 'Aucune modification enregistrée.'}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(entry => {
          const Icon = actorIcon(entry.actor);
          const color = entry.actor === 'gilles' ? '#2563eb' : entry.actor === 'claire' ? '#7c3aed' : '#6b7280';
          const isPending = entry.validationStatus === 'pending';
          const decision = decisions[entry.id];

          return (
            <div key={entry.id} style={{
              padding: '12px 14px', borderRadius: 10, background: 'var(--bg-surface)',
              border: `1px solid ${isPending ? 'rgba(217,119,6,0.4)' : 'var(--border-color)'}`,
              display: 'grid', gridTemplateColumns: isPending && filter === 'pending' ? 'auto 1fr auto auto' : 'auto 1fr auto',
              gap: 12, alignItems: 'start',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: `${color}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={14} color={color} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>
                  {proposalLabel(entry)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.45 }}>
                  {entry.payload?.field != null && <>Champ : {friendlyField(String(entry.payload.field))} · </>}
                  {entry.payload?.proposed != null && <>Proposé : {friendlyValue(entry.payload.proposed)} · </>}
                  {entry.payload?.emailSubject != null && <>Mail : {String(entry.payload.emailSubject).slice(0, 60)} · </>}
                  {entry.payload?.checkIn != null && <>Séjour : {String(entry.payload.checkIn)} → {String(entry.payload.checkOut || '')} · </>}
                  {entry.payload?.mails != null && <>{String(entry.payload.mails)} mail(s) · </>}
                  {entry.payload?.signals != null && <>{String(entry.payload.signals)} statut(s) · </>}
                  {entry.payload?.proposals != null && <>{String(entry.payload.proposals)} proposition(s) · </>}
                  {entry.contactId && (
                    <button type="button" onClick={() => navigate(routes.client(entry.contactId))}
                      style={{ border: 'none', background: 'transparent', color: 'var(--brand)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                      ouvrir la fiche
                    </button>
                  )}
                </div>
              </div>

              {isPending && filter === 'pending' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" title="Accepter" onClick={() => setDecisions(d => ({ ...d, [entry.id]: true }))}
                    style={{
                      padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: decision === true ? '#059669' : 'rgba(5,150,105,0.15)',
                      color: decision === true ? 'white' : '#059669',
                    }}>
                    <Check size={14} />
                  </button>
                  <button type="button" title="Refuser" onClick={() => setDecisions(d => ({ ...d, [entry.id]: false }))}
                    style={{
                      padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: decision === false ? '#dc2626' : 'rgba(220,38,38,0.12)',
                      color: decision === false ? 'white' : '#dc2626',
                    }}>
                    <X size={14} />
                  </button>
                </div>
              )}

              <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--text-muted)' }}>
                <div style={{ fontWeight: 600, color }}>{actorLabel(entry.actor)}</div>
                {isPending && filter !== 'pending' && (
                  <div style={{ color: '#d97706', fontWeight: 600, marginTop: 2 }}>En attente</div>
                )}
                <div style={{ marginTop: 4 }}>{fmtDate(entry.createdAt)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {filter === 'pending' && pendingEntries.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
          {msg && (
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>{msg}</p>
          )}
          <button type="button" disabled={!allDecided || submitting} onClick={submitDecisions}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none',
              background: allDecided ? 'var(--brand)' : 'var(--border-color)',
              color: allDecided ? 'white' : 'var(--text-muted)',
              fontSize: 13, fontWeight: 700, cursor: allDecided ? 'pointer' : 'not-allowed',
            }}>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Valider les décisions ({pendingEntries.filter(e => decisions[e.id] != null).length}/{pendingEntries.length})
          </button>
        </div>
      )}
    </div>
  );
}

function friendlyField(field: string) {
  const m: Record<string, string> = {
    contractSigned: 'Contrat signé',
    depositPaid: 'Acompte payé',
    insuranceReceived: 'Assurance',
    idReceived: "Pièce d'identité",
    balancePaid: 'Solde payé',
    depositGuaranteePaid: 'Caution reçue',
    depositGuaranteeReturned: 'Caution rendue',
    depositInvoiceSent: 'Facture acompte envoyée',
    balanceInvoiceSent: 'Facture solde envoyée',
    contractSent: 'Contrat envoyé',
    mailSteps: 'Étape mail',
  };
  return m[field] || field;
}

function friendlyValue(value: unknown) {
  if (typeof value === 'boolean') return value ? 'oui' : 'non';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
