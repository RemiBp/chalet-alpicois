import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Users, Mail, MessageSquare, Radio, Inbox, Euro, Wallet, TrendingUp, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchDashboardStats, fetchRecentSignals, fetchRecentInboxEmails, fetchFinanceSummary, triggerDataRefresh, type FinanceSummary } from '../data';
import type { RecentSignal, RecentInboxEmail } from '../data';
import { routes } from '../lib/routes';
import { CHALET, formatPrice } from '../config/chalet';

const HERO_IMAGE = `${import.meta.env.BASE_URL}chalet-hero.png`;

interface SimpleStats {
  totalContacts: number;
  totalEmails: number;
  emailsThisMonth: number;
  recentContacts: number;
}

function fmtMailDate(iso: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

const SYNC_STEPS = [
  'Connexion à la boîte mail Hostinger…',
  'Import des nouveaux messages…',
  'Liaison aux fiches clients…',
  'Extraction coordonnées & signaux…',
  'Mise à jour calendrier & finance…',
];

export default function Dashboard({ isAdmin = false }: { isAdmin?: boolean }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState<SimpleStats | null>(null);
  const [signals, setSignals] = useState<RecentSignal[]>([]);
  const [recentMails, setRecentMails] = useState<RecentInboxEmail[]>([]);
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState(0);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const syncStepTimer = useRef<number | null>(null);

  const reloadAll = () => {
    fetchDashboardStats().then(setStats).catch(() => setStats(null));
    fetchRecentSignals(45).then(setSignals).catch(() => setSignals([]));
    fetchRecentInboxEmails(25).then(setRecentMails).catch(() => setRecentMails([]));
    fetchFinanceSummary('2026-2027').then(setFinance).catch(() => setFinance(null));
  };

  useEffect(() => {
    reloadAll();
  }, []);

  useEffect(() => {
    if (!syncing) {
      if (syncStepTimer.current) window.clearInterval(syncStepTimer.current);
      setSyncStep(0);
      return;
    }
    syncStepTimer.current = window.setInterval(() => {
      setSyncStep(s => (s + 1) % SYNC_STEPS.length);
    }, 2200);
    return () => {
      if (syncStepTimer.current) window.clearInterval(syncStepTimer.current);
    };
  }, [syncing]);

  async function handleSync() {
    if (!isAdmin) {
      setSyncMsg('Mode admin requis pour synchroniser les mails (cadenas en bas à gauche).');
      return;
    }
    setSyncing(true);
    setSyncMsg(null);
    setSyncStep(0);
    try {
      const report = await triggerDataRefresh(false);
      reloadAll();
      const mails = report.imap?.totalSynced ?? 0;
      const coords = report.profiles?.filledCoords ?? 0;
      const signalsUp = report.signals?.recordsUpdated ?? 0;
      const proposals = report.proposals?.proposalsCreated ?? 0;
      const pending = report.pendingCount ?? 0;
      const imapErr = report.imap?.error;
      if (imapErr) {
        setSyncMsg(`Erreur IMAP : ${imapErr}`);
      } else {
        const now = new Date();
        setLastSyncAt(now.toISOString());
        let msg = `Synchronisation OK — ${mails} nouveau(x) mail(s), ${coords} profil(s) enrichi(s), ${signalsUp} statut(s), ${proposals} proposition(s)`;
        if (pending > 0) {
          msg += ` · ${pending} à valider dans Historique et sync`;
          navigate(`${routes.historique}?sync=1`);
        }
        setSyncMsg(msg);
      }
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Erreur de synchronisation');
    } finally {
      setSyncing(false);
    }
  }

  function fmtSyncTime(iso: string) {
    try {
      return new Date(iso).toLocaleString('fr-FR', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  const monthLabel = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <motion.div
      className="dashboard"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="dashboard-greeting dashboard-greeting--top dashboard-greeting-row">
        <div className="dashboard-greeting-text">
          <h2>Hello Gilles et Claire !</h2>
          <p>Bienvenue sur votre tableau de bord Alpicois — saison 2026-2027.</p>
        </div>
        <div className="dashboard-greeting-sync">
          <div className="dashboard-greeting-sync-label">
            <div className="dashboard-greeting-sync-title">Actualiser les données</div>
            <div className="dashboard-greeting-sync-desc">
              Récupère les derniers mails, extrait coordonnées & signaux de réservation
            </div>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className={`dashboard-sync-btn${syncing ? ' dashboard-sync-btn--active' : ''}`}
            aria-busy={syncing}
          >
            {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {syncing ? 'Synchronisation en cours…' : 'Synchroniser les mails'}
          </button>
          {lastSyncAt && !syncing && (
            <div className="dashboard-sync-last">
              <CheckCircle2 size={12} />
              Dernière sync : {fmtSyncTime(lastSyncAt)}
            </div>
          )}
        </div>
      </div>

      {syncing && (
        <div className="dashboard-sync-progress" role="status" aria-live="polite">
          <div className="dashboard-sync-progress-bar">
            <div className="dashboard-sync-progress-bar-fill" />
          </div>
          <div className="dashboard-sync-progress-row">
            <Loader2 size={14} className="animate-spin" />
            <span>{SYNC_STEPS[syncStep]}</span>
          </div>
        </div>
      )}

      {syncMsg && !syncing && (
        <div className="dashboard-sync-msg" data-ok={syncMsg.startsWith('Synchronisation OK') ? 'true' : 'false'}>
          {syncMsg.startsWith('Synchronisation OK') && <CheckCircle2 size={14} style={{ flexShrink: 0 }} />}
          {syncMsg}
        </div>
      )}

      <div className="dashboard-grid">
        {/* Hero — grande zone visuelle */}
        <div className="dashboard-hero-wrap">
          <div className="dashboard-hero">
            <img
              src={HERO_IMAGE}
              alt={`${CHALET.name} en hiver — La Plagne`}
            />
            <div className="dashboard-hero-overlay" />
            <div className="dashboard-hero-text">
              <h1>{CHALET.name}</h1>
              <p>{CHALET.location} · {CHALET.domain}</p>
            </div>
          </div>
          <p className="dashboard-footer" style={{ marginTop: 20 }}>
            {CHALET.rentalFormula.note}
            <br />
            <a href={CHALET.website} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)' }}>
              {CHALET.website.replace('https://', '')}
            </a>
          </p>
        </div>

        {/* Stats + actions */}
        <div className="dashboard-side">
          {stats && (
            <div className="dashboard-stats">
              {[
                { icon: Users, label: 'Contacts', value: stats.totalContacts, color: '#7c3aed' },
                { icon: MessageSquare, label: 'Messages', value: stats.totalEmails, color: '#0891b2' },
                { icon: Mail, label: 'Emails ce mois', value: stats.emailsThisMonth, color: '#2563eb' },
                { icon: Users, label: 'Actifs ce mois', value: stats.recentContacts, color: '#059669' },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="dashboard-stat">
                  <Icon size={18} color={color} style={{ marginBottom: 8 }} />
                  <div className="dashboard-stat-value">{value}</div>
                  <div className="dashboard-stat-label">{label}</div>
                </div>
              ))}
            </div>
          )}

          {finance && (
            <div className="dashboard-signals dashboard-finance-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Euro size={15} color="var(--brand)" />
                    <h2 style={{ fontSize: 13, fontWeight: 700 }}>Finance saison 2026-2027</h2>
                  </div>
                  <button type="button" onClick={() => navigate(routes.finance)}
                    style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Détail →
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    { icon: Wallet, label: 'Encaissé', value: finance.collected, color: '#059669', weeks: finance.byCategoryWeeks?.collected ?? 0 },
                    { icon: Euro, label: 'Confirmé', value: finance.confirmedPending, color: '#2563eb', weeks: finance.byCategoryWeeks?.confirmed ?? 0 },
                    { icon: TrendingUp, label: 'Prévisionnel', value: finance.forecast, color: '#d97706', weeks: finance.byCategoryWeeks?.forecast ?? 0 },
                  ].map(({ icon: Icon, label, value, color, weeks }) => (
                    <div key={label} style={{ padding: 12, borderRadius: 8, background: 'var(--bg-body)', border: '1px solid var(--border-subtle)' }}>
                      <Icon size={14} color={color} style={{ marginBottom: 6 }} />
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{formatPrice(value)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
                      {weeks > 0 && (
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{weeks} sem.</div>
                      )}
                    </div>
                  ))}
                </div>
                {finance.personalWeeks > 0 && (
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 10 }}>
                    {finance.personalWeeks} semaine{finance.personalWeeks > 1 ? 's' : ''} personnelle{finance.personalWeeks > 1 ? 's' : ''} exclue{finance.personalWeeks > 1 ? 's' : ''} du CA
                  </p>
                )}
              </div>
            )}
        </div>

        {signals.length > 0 && (
          <div className="dashboard-signals">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Radio size={15} color="var(--brand)" />
              <h2 style={{ fontSize: 13, fontWeight: 700 }}>Signaux récents dans les mails ({monthLabel})</h2>
            </div>
            <table className="dashboard-signals-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Indice</th>
                  <th>Confiance</th>
                </tr>
              </thead>
              <tbody>
                {signals.slice(0, 8).map(s => (
                  <tr key={s.contactId}>
                    <td className="dashboard-signals-contact">{s.contactName}</td>
                    <td className="dashboard-signals-label">{s.label}</td>
                    <td style={{ fontSize: 10, fontWeight: 600, color: s.confidence === 'high' ? '#059669' : s.confidence === 'medium' ? '#d97706' : '#9ca3af' }}>
                      {s.confidence === 'high' ? 'Élevée' : s.confidence === 'medium' ? 'Moyenne' : 'Faible'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="dashboard-signals-foot">
              Détection par mots-clés (heuristique) — vérifiez avant de confirmer. Les saisies admin ne sont plus écrasées par le pipeline.
            </p>
          </div>
        )}

        {recentMails.length > 0 && (
          <div className="dashboard-signals">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Inbox size={15} color="var(--brand)" />
                <h2 style={{ fontSize: 13, fontWeight: 700 }}>Derniers messages reçus</h2>
              </div>
              <button type="button" onClick={() => navigate(routes.clients)}
                style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Voir tout →
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentMails.map(m => (
                <div key={m.id} style={{
                  display: 'grid', gridTemplateColumns: 'minmax(120px, 160px) 1fr auto', gap: 12,
                  padding: '10px 12px', borderRadius: 8, background: 'var(--bg-body)',
                  border: '1px solid var(--border-subtle)', alignItems: 'start',
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{m.contactName}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{fmtMailDate(m.date)}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    {m.subject || '(sans objet)'}
                  </div>
                  <Mail size={14} color="var(--text-muted)" style={{ marginTop: 2 }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
