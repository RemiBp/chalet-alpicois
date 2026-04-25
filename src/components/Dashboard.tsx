import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, Users, CalendarDays, Euro, ArrowUpRight, Mail,
  Clock, CheckCircle2, XCircle, AlertCircle, Search,
  MessageSquare, UserPlus
} from 'lucide-react';
import { fetchDashboardStats, fetchEmails, fetchStays, fetchContacts, updateStay } from '../data';
import type { DashboardStats, Email, StayRecord } from '../types';

// ─── HELPERS ──────────────────────────────────────

function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days} jours`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatPrice(n: number): string {
  return n.toLocaleString('fr-FR') + ' €';
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const itemAnim = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  confirmed: { label: 'Confirmé', color: '#059669', bg: '#ecfdf5', icon: CheckCircle2 },
  paid: { label: 'Payé', color: '#0284c7', bg: '#e0f2fe', icon: CheckCircle2 },
  pending: { label: 'En attente', color: '#d97706', bg: '#fef3c7', icon: Clock },
  cancelled: { label: 'Annulé', color: '#dc2626', bg: '#fef2f2', icon: XCircle },
};

// ─── STAT CARD ────────────────────────────────────

function StatCard({ icon: Icon, label, value, prefix, suffix, onClick, color, sub }: {
  icon: any; label: string; value: string | number;
  prefix?: string; suffix?: string; onClick?: () => void;
  color: string; sub?: string;
}) {
  return (
    <motion.div
      variants={itemAnim}
      onClick={onClick}
      style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxShadow: 'var(--shadow-sm)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s',
      }}
      onMouseOver={e => {
        e.currentTarget.style.boxShadow = 'var(--shadow-md)';
        if (onClick) e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseOut={e => {
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
        e.currentTarget.style.transform = 'none';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${color}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} color={color} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', letterSpacing: '-0.03em', lineHeight: 1 }}>
          {prefix}{typeof value === 'number' ? value.toLocaleString('fr-FR') : value}{suffix}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>{sub}</div>}
      </div>
    </motion.div>
  );
}

// ─── QUICK ACTION BUTTON ──────────────────────────

function ActionButton({ icon: Icon, label, desc, onClick, color }: {
  icon: any; label: string; desc: string; onClick: () => void; color: string;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 10,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      onMouseOver={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = `${color}08`; }}
      onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-surface)'; }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={15} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{desc}</div>
      </div>
      <ArrowUpRight size={14} color={color} style={{ flexShrink: 0 }} />
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentEmails, setRecentEmails] = useState<Email[]>([]);
  const [pendingStays, setPendingStays] = useState<(StayRecord & { guestName: string })[]>([]);
  const [upcomingStays, setUpcomingStays] = useState<(StayRecord & { guestName: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const loadData = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchDashboardStats(),
      fetchEmails(),
      fetchStays(),
      fetchContacts(),
    ])
    .then(([s, emails, stays, contacts]) => {
      setStats(s);
      const contactMap = new Map(contacts.map(c => [c.id, c]));
      const today = new Date().toISOString().split('T')[0];

      // Derniers emails reçus
      setRecentEmails(
        emails
          .filter(e => e.folder === 'INBOX' && e.sender !== 'contact@alpicois-laplagne.fr')
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 5)
      );

      // Séjours en attente (pending) qui arrivent bientôt
      const withNames = stays.map(s => ({
        ...s,
        guestName: contactMap.get(s.contactId)?.name || 'Inconnu',
      }));

      setPendingStays(
        withNames
          .filter(s => s.status === 'pending' && s.checkIn >= today)
          .sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime())
          .slice(0, 5)
      );

      setUpcomingStays(
        withNames
          .filter(s => s.checkIn >= today && (s.status === 'confirmed' || s.status === 'paid'))
          .sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime())
          .slice(0, 5)
      );

      setLoading(false);
    })
    .catch(err => {
      setError(err.message);
      setLoading(false);
    });
  };

  useEffect(loadData, []);

  const confirmStay = async (id: string) => {
    const ok = await updateStay(id, { status: 'confirmed' });
    setActionMsg({ text: ok ? 'Séjour confirmé ✓' : 'Erreur de confirmation', ok });
    if (ok) loadData();
    setTimeout(() => setActionMsg(null), 3000);
  };

  if (error) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12 }}>
        <AlertCircle size={24} color="#dc2626" />
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>
          Impossible de charger les données<br />
          <span style={{ fontSize: 11, color: '#dc2626' }}>{error}</span>
        </div>
        <button onClick={loadData} style={{
          padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-color)',
          background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer',
        }}>
          Réessayer
        </button>
      </div>
    );
  }

  if (!stats || loading) {
    return (
      <div style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 24, height: 24, border: '2px solid var(--border-color)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargement...</div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      style={{ padding: 24, maxWidth: 1200 }}
    >
      {/* Notification d'action */}
      {actionMsg && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          padding: '10px 18px', borderRadius: 10,
          background: actionMsg.ok ? '#059669' : '#dc2626',
          color: '#fff', fontSize: 12, fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {actionMsg.text}
        </div>
      )}

      {/* Header */}
      <motion.div variants={itemAnim} style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
            Tableau de bord
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
            Chalet Alpicois · La Plagne · {stats.totalContacts} contacts · {stats.totalStays} séjours
          </p>
        </div>
        <button onClick={loadData} style={{
          padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border-color)',
          background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 11,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <ArrowUpRight size={12} />
          Actualiser
        </button>
      </motion.div>

      {/* KPIs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
        gap: 12,
        marginBottom: 20,
      }}>
        <StatCard icon={Euro} label="Revenus confirmés" value={stats.totalRevenue} suffix=" €" color="#d97706" sub="Toutes saisons confondues" />
        <StatCard icon={CalendarDays} label="Séjours totaux" value={stats.totalStays} color="#2563eb" sub="Historique complet" />
        <StatCard icon={TrendingUp} label="Prix moyen" value={stats.averagePrice} suffix=" €" color="#059669" />
        <StatCard icon={Users} label="Clients" value={stats.clients} color="#7c3aed" sub={`${stats.prospects} prospects`} />
        <StatCard icon={Mail} label="Emails reçus ce mois" value={stats.emailsReceivedThisMonth || 0} color="#0891b2" />
        <StatCard icon={ArrowUpRight} label="Demandes en cours" value={stats.newInquiries || 0} color="#ea580c" sub="À traiter" />
      </div>

      {/* Row 2: Actions rapides + En attente */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, marginBottom: 16 }}>
        {/* Actions rapides */}
        <motion.div
          variants={itemAnim}
          style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            padding: 18,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
            Actions rapides
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ActionButton icon={UserPlus} label="Nouveau contact" desc="Ajouter un prospect/client" onClick={() => window.location.hash = '#contacts'} color="#7c3aed" />
            <ActionButton icon={MessageSquare} label="Voir les emails" desc="Boîte de réception" onClick={() => window.location.hash = '#emails'} color="#0891b2" />
            <ActionButton icon={CalendarDays} label="Calendrier" desc="Vue des réservations" onClick={() => window.location.hash = '#calendar'} color="#2563eb" />
            <ActionButton icon={Search} label="Prospects à relancer" desc={`${pendingStays.length} en attente`} onClick={() => window.location.hash = '#contacts'} color="#ea580c" />
          </div>
        </motion.div>

        {/* Séjours en attente de confirmation */}
        <motion.div
          variants={itemAnim}
          style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            padding: 18,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Demandes à confirmer
            </h2>
            {pendingStays.length > 0 && (
              <span style={{ fontSize: 10, color: '#d97706', background: '#fef3c7', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>
                {pendingStays.length} en attente
              </span>
            )}
          </div>
          {pendingStays.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              <CheckCircle2 size={20} style={{ margin: '0 auto 6px', opacity: 0.4 }} />
              Aucune demande en attente
            </div>
          ) : (
            pendingStays.map((stay, i) => {
              const nights = stay.nights ? `${stay.nights} nuits` : '';
              const price = stay.priceQuoted || 0;
              return (
                <div
                  key={stay.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 0', borderBottom: i < pendingStays.length - 1 ? '1px solid var(--border-color)' : 'none',
                  }}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: 6, background: '#fef3c7',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, fontSize: 9, fontWeight: 700, color: '#d97706',
                  }}>
                    {stay.guestName.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {stay.guestName}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                      {formatDate(stay.checkIn)} · {nights} {price > 0 ? `· ${formatPrice(price)}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => confirmStay(stay.id)}
                    title="Confirmer le séjour"
                    style={{
                      padding: '4px 10px', borderRadius: 6, border: 'none',
                      background: '#059669', color: '#fff', fontSize: 10, fontWeight: 600,
                      cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <CheckCircle2 size={10} />
                    Confirmer
                  </button>
                </div>
              );
            })
          )}
        </motion.div>
      </div>

      {/* Row 3: Derniers échanges + Prochains séjours */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <motion.div
          variants={itemAnim}
          style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            padding: 18,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
            Derniers échanges
          </h2>
          {recentEmails.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Aucun email récent
            </div>
          ) : (
            recentEmails.map((email, i) => (
              <div
                key={email.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 0', borderBottom: i < recentEmails.length - 1 ? '1px solid var(--border-color)' : 'none',
                  cursor: 'pointer',
                }}
                onClick={() => window.location.hash = '#emails'}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: 7, background: '#dbeafe',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  fontSize: 10, fontWeight: 600, color: '#2563eb',
                }}>
                  {email.senderName?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {email.senderName}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {email.subject}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {formatRelativeDate(email.date)}
                </div>
              </div>
            ))
          )}
        </motion.div>

        {/* Prochains séjours confirmés */}
        <motion.div
          variants={itemAnim}
          style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            padding: 18,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
            Prochains séjours
          </h2>
          {upcomingStays.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Aucun séjour à venir
            </div>
          ) : (
            upcomingStays.map((stay, i) => {
              const price = stay.priceConfirmed || stay.priceQuoted || 0;
              const sc = statusConfig[stay.status] || statusConfig.pending;
              const Icon = sc.icon;
              return (
                <div
                  key={stay.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 0', borderBottom: i < upcomingStays.length - 1 ? '1px solid var(--border-color)' : 'none',
                  }}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: 7, background: sc.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={12} color={sc.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {stay.guestName}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                      {formatDate(stay.checkIn)} → {formatDate(stay.checkOut)}
                      {stay.nights ? ` · ${stay.nights}n` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {price > 0 && (
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)' }}>
                        {formatPrice(price)}
                      </div>
                    )}
                    <span style={{
                      fontSize: 9, fontWeight: 600, color: sc.color, background: sc.bg,
                      padding: '1px 6px', borderRadius: 4,
                    }}>
                      {sc.label}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </motion.div>
      </div>

      {/* Par saison */}
      {stats.seasons && stats.seasons.length > 0 && (
        <motion.div
          variants={itemAnim}
          style={{
            marginTop: 16,
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            padding: 18,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
            Historique par saison
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats.seasons.map((season, i) => (
              <div
                key={season.season}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '6px 0', borderBottom: i < stats.seasons.length - 1 ? '1px solid var(--border-color)' : 'none',
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', minWidth: 85 }}>
                  {season.label}
                </span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--bg-surface-alt)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, (season.occupancyWeeks / 30) * 100)}%`,
                    borderRadius: 3,
                    background: 'linear-gradient(90deg, var(--brand), var(--brand-light))',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', minWidth: 55, textAlign: 'right' }}>
                  {season.totalStays} séj.
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand)', minWidth: 75, textAlign: 'right' }}>
                  {season.totalRevenue.toLocaleString('fr-FR')}€
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
