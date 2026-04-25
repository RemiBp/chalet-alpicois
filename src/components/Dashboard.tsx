import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Users, CalendarDays, Euro, Bell, ArrowUpRight, ArrowDownRight, Mail } from 'lucide-react';
import { fetchDashboardStats, fetchEmails, fetchContacts, fetchStays } from '../data';
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

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemAnim = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

// ─── STAT CARD ────────────────────────────────────

function StatCard({ icon: Icon, label, value, prefix, suffix, trend, trendUp, color }: {
  icon: typeof TrendingUp;
  label: string;
  value: string | number;
  prefix?: string;
  suffix?: string;
  trend?: number;
  trendUp?: boolean;
  color: string;
}) {
  return (
    <motion.div
      variants={itemAnim}
      style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxShadow: 'var(--shadow-sm)',
        transition: 'all 0.2s',
      }}
      onMouseOver={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseOut={e => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Icon size={18} color={color} />
        </div>
        {trend !== undefined && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 10,
            fontWeight: 600,
            color: trendUp ? '#059669' : '#dc2626',
            padding: '2px 6px',
            borderRadius: 6,
            background: trendUp ? '#ecfdf5' : '#fef2f2',
          }}>
            {trendUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {trend}%
          </div>
        )}
      </div>
      <div>
        <div style={{
          fontSize: 24,
          fontWeight: 700,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-heading)',
          letterSpacing: '-0.03em',
          lineHeight: 1,
        }}>
          {prefix}{typeof value === 'number' ? value.toLocaleString('fr-FR') : value}{suffix}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
      </div>
    </motion.div>
  );
}

// ─── DASHBOARD ────────────────────────────────────

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentEmails, setRecentEmails] = useState<Email[]>([]);
  const [upcomingStays, setUpcomingStays] = useState<(StayRecord & { guestName: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchDashboardStats(),
      fetchEmails(),
      fetchContacts(),
      fetchStays(),
    ]).then(([s, emails, contacts, stays]) => {
      setStats(s);

      // Derniers 5 emails reçus (INBOX)
      setRecentEmails(
        emails
          .filter(e => e.folder === 'INBOX' && e.sender !== 'contact@alpicois-laplagne.fr')
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 5)
      );

      // Prochains séjours à venir
      const contactMap = new Map(contacts.map(c => [c.id, c]));
      const today = new Date().toISOString().split('T')[0];

      // Depuis les contacts
      const fromContacts = contacts.flatMap(c =>
        c.stays
          .filter(s => s.checkIn >= today && s.status !== 'cancelled')
          .map(s => ({ ...s, guestName: c.name }))
      );
      // Depuis l'API stays
      const fromApi = stays
        .filter(s => s.checkIn >= today && s.status !== 'cancelled')
        .map(s => ({
          ...s,
          guestName: (s as any).contactName || contactMap.get(s.contactId)?.name || 'Inconnu',
        }));

      // Fusion et déduplication
      const stayMap = new Map<string, StayRecord & { guestName: string }>();
      for (const st of [...fromApi, ...fromContacts]) {
        if (!stayMap.has(st.id)) stayMap.set(st.id, st);
      }
      setUpcomingStays(
        Array.from(stayMap.values())
          .sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime())
          .slice(0, 5)
      );

      setLoading(false);
    });
  }, []);

  if (!stats || loading) {
    return (
      <div style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargement du tableau de bord...</div>
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
      {/* Header */}
      <motion.div variants={itemAnim} style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
          Tableau de bord
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          Chalet Alpicois · La Plagne · {stats.totalContacts} contacts · {stats.totalStays} séjours historiques
        </p>
      </motion.div>

      {/* KPI Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 14,
        marginBottom: 24,
      }}>
        <StatCard icon={Euro} label="Revenus (confirmés)" value={stats.totalRevenue.toLocaleString('fr-FR')} suffix=" €" color="#d97706" />
        <StatCard icon={CalendarDays} label="Séjours totaux" value={stats.totalStays} color="#2563eb" />
        <StatCard icon={TrendingUp} label="Prix moyen" value={stats.averagePrice.toLocaleString('fr-FR')} suffix=" €" color="#059669" />
        <StatCard icon={Users} label="Clients" value={stats.clients} color="#7c3aed" />
        <StatCard icon={Bell} label="Prospects" value={stats.prospects} color="#ea580c" />
        <StatCard icon={Mail} label="Emails reçus ce mois" value={stats.emailsReceivedThisMonth || 0} color="#0891b2" />
        <StatCard icon={ArrowUpRight} label="Nouvelles demandes" value={stats.newInquiries || 0} color="#059669" />
      </div>

      {/* Two columns: Recent emails + Upcoming stays */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Derniers échanges */}
        <motion.div
          variants={itemAnim}
          style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            padding: 20,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
            Derniers échanges
          </h2>
          {recentEmails.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Aucun email récent
            </div>
          ) : (
            recentEmails.map((email, i) => (
              <div
                key={email.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 0',
                  borderBottom: i < recentEmails.length - 1 ? '1px solid var(--border-color)' : 'none',
                }}
              >
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: email.folder === 'INBOX' ? '#dbeafe' : '#fef3c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 10,
                  fontWeight: 600,
                  color: email.folder === 'INBOX' ? '#2563eb' : '#d97706',
                }}>
                  {email.senderName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {email.senderName}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
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

        {/* Prochains séjours */}
        <motion.div
          variants={itemAnim}
          style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            padding: 20,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
            Prochains séjours
          </h2>
          {upcomingStays.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Aucun séjour à venir
            </div>
          ) : (
            upcomingStays.map((stay, i) => {
              const price = stay.priceConfirmed || stay.priceQuoted || 0;
              const statusColors: Record<string, { text: string; bg: string }> = {
                confirmed: { text: '#059669', bg: '#ecfdf5' },
                paid: { text: '#0284c7', bg: '#e0f2fe' },
                pending: { text: '#d97706', bg: '#fef3c7' },
                cancelled: { text: '#dc2626', bg: '#fef2f2' },
              };
              const sc = statusColors[stay.status] || statusColors.pending;
              return (
                <div
                  key={stay.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 0',
                    borderBottom: i < upcomingStays.length - 1 ? '1px solid var(--border-color)' : 'none',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {stay.guestName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {new Date(stay.checkIn).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} → {new Date(stay.checkOut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      {stay.nights ? ` · ${stay.nights} nuits` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {price > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>
                        {price.toLocaleString('fr-FR')}€
                      </span>
                    )}
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: sc.text,
                      background: sc.bg,
                      padding: '2px 8px',
                      borderRadius: 6,
                    }}>
                      {stay.status === 'confirmed' ? 'Confirmé' : stay.status === 'paid' ? 'Payé' : stay.status === 'pending' ? 'En attente' : stay.status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </motion.div>
      </div>

      {/* Par saison résumé */}
      {stats.seasons && stats.seasons.length > 0 && (
        <motion.div
          variants={itemAnim}
          style={{
            marginTop: 16,
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-color)',
            padding: 20,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
            Historique par saison
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stats.seasons.map((season, i) => (
              <div
                key={season.season}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '8px 0',
                  borderBottom: i < stats.seasons.length - 1 ? '1px solid var(--border-color)' : 'none',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', minWidth: 90 }}>
                  {season.label}
                </span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-surface-alt)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, (season.occupancyWeeks / 30) * 100)}%`,
                    borderRadius: 4,
                    background: 'linear-gradient(90deg, var(--brand), var(--brand-light))',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 60, textAlign: 'right' }}>
                  {season.totalStays} séjours
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand)', minWidth: 80, textAlign: 'right' }}>
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
