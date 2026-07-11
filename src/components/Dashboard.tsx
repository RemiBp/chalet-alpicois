import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Users, Mail, MessageSquare, Radio, Inbox, Euro, Wallet, TrendingUp, RefreshCw, Loader2, CheckCircle2, X, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchDashboardStats, fetchRecentSignals, fetchRecentInboxEmails, fetchFinanceSummary, triggerDataRefresh, type FinanceSummary } from '../data';
import type { RecentSignal, RecentInboxEmail } from '../data';
import { routes } from '../lib/routes';
import { CHALET, formatPrice } from '../config/chalet';
import { classifyEmailContent, isCondensedEmail, safeEmailBodyPreview } from '../lib/cleanEmailBody';

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

type MailPeek = {
  id: string;
  contactId?: string;
  contactName: string;
  date: string;
  subject: string;
  bodyText?: string;
  signalLabel?: string;
};

function MailPeekModal({ mail, onClose }: { mail: MailPeek; onClose: () => void }) {
  const navigate = useNavigate();
  const content = classifyEmailContent(mail.bodyText || '');
  const condensed = isCondensedEmail(mail.bodyText || '');
  const body = condensed
    ? content.label
    : (safeEmailBodyPreview(mail.bodyText || '', 8000) || '(Pas de texte lisible dans ce message)');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu du mail"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(720px, 100%)', maxHeight: 'min(84vh, 900px)',
          background: 'var(--bg-surface)', borderRadius: 14,
          border: '1px solid var(--border-color)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              {mail.contactName || 'Contact'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
              {fmtMailDate(mail.date)}
              {mail.signalLabel ? ` · ${mail.signalLabel}` : ''}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, lineHeight: 1.35 }}>
              {mail.subject || '(sans objet)'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              border: 'none', background: 'var(--bg-body)', borderRadius: 8,
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{
          padding: 16, overflowY: 'auto', flex: 1,
          fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)',
          whiteSpace: condensed ? 'normal' : 'pre-wrap',
        }}>
          {body}
        </div>

        <div style={{
          display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap',
          padding: '12px 16px', borderTop: '1px solid var(--border-subtle)',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
              background: 'var(--bg-body)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            Fermer
          </button>
          {mail.contactId && (
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate(routes.client(mail.contactId!, { mail: mail.id }));
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 12px', borderRadius: 8, border: 'none',
                background: 'var(--brand)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <ExternalLink size={14} />
              Ouvrir la fiche & le fil
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const [peekMail, setPeekMail] = useState<MailPeek | null>(null);
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

  function openMailPeek(mail: MailPeek) {
    setPeekMail(mail);
  }

  async function openSignal(s: RecentSignal) {
    if (s.contactId && s.emailId) {
      // Prefer full thread on fiche when we have both ids
      const related = recentMails.find(m => m.id === s.emailId);
      if (related?.bodyText) {
        openMailPeek({
          id: s.emailId,
          contactId: s.contactId,
          contactName: s.contactName,
          date: s.emailDate,
          subject: s.subject || related.subject || s.label,
          bodyText: related.bodyText,
          signalLabel: s.label,
        });
        return;
      }
      navigate(routes.client(s.contactId, { mail: s.emailId }));
      return;
    }
    if (s.contactId) navigate(routes.client(s.contactId));
  }

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

        <div className="dashboard-side">
          {stats && (
            <div className="dashboard-stats">
              {[
                { icon: Users, label: 'Contacts', value: stats.totalContacts, color: '#7c3aed', path: routes.clients },
                { icon: MessageSquare, label: 'Messages', value: stats.totalEmails, color: '#0891b2', path: routes.clients },
                { icon: Mail, label: 'Emails ce mois', value: stats.emailsThisMonth, color: '#2563eb', path: routes.clients },
                { icon: Users, label: 'Actifs ce mois', value: stats.recentContacts, color: '#059669', path: routes.clients },
              ].map(({ icon: Icon, label, value, color, path }) => (
                <button
                  key={label}
                  type="button"
                  className="dashboard-stat"
                  onClick={() => navigate(path)}
                  style={{ cursor: 'pointer', textAlign: 'left', border: 'none', width: '100%' }}
                >
                  <Icon size={18} color={color} style={{ marginBottom: 8 }} />
                  <div className="dashboard-stat-value">{value}</div>
                  <div className="dashboard-stat-label">{label}</div>
                </button>
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
                    <button
                      key={label}
                      type="button"
                      onClick={() => navigate(routes.finance)}
                      style={{
                        padding: 12, borderRadius: 8, background: 'var(--bg-body)',
                        border: '1px solid var(--border-subtle)', cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <Icon size={14} color={color} style={{ marginBottom: 6 }} />
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{formatPrice(value)}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
                      {weeks > 0 && (
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{weeks} sem.</div>
                      )}
                    </button>
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
                  <tr
                    key={`${s.contactId}-${s.emailId || s.emailDate}`}
                    className="dashboard-signals-row--clickable"
                    onClick={() => openSignal(s)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSignal(s); } }}
                    tabIndex={0}
                    role="link"
                    title="Voir le mail / la fiche"
                  >
                    <td className="dashboard-signals-contact">{s.contactName}</td>
                    <td className="dashboard-signals-label">
                      <div>{s.label}</div>
                      {s.subject && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, fontWeight: 400 }}>
                          {s.subject}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 10, fontWeight: 600, color: s.confidence === 'high' ? '#059669' : s.confidence === 'medium' ? '#d97706' : '#9ca3af' }}>
                      {s.confidence === 'high' ? 'Élevée' : s.confidence === 'medium' ? 'Moyenne' : 'Faible'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="dashboard-signals-foot">
              Cliquez une ligne pour lire le mail. Détection heuristique — vérifiez avant de confirmer.
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
                <button
                  key={m.id}
                  type="button"
                  className="dashboard-mail-row"
                  onClick={() => openMailPeek({
                    id: m.id,
                    contactId: m.contactId,
                    contactName: m.contactName,
                    date: m.date,
                    subject: m.subject,
                    bodyText: m.bodyText,
                  })}
                  title="Lire le mail en entier"
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'left' }}>{m.contactName}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, textAlign: 'left' }}>{fmtMailDate(m.date)}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45, textAlign: 'left' }}>
                    {m.subject || '(sans objet)'}
                  </div>
                  <Mail size={14} color="var(--brand)" style={{ marginTop: 2 }} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {peekMail && <MailPeekModal mail={peekMail} onClose={() => setPeekMail(null)} />}
    </motion.div>
  );
}
