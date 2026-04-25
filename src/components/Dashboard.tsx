import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Users, CalendarDays, Euro, Building2, Bell, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { getDashboardStats } from '../data';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemAnim = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

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
      }}
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
            color: trendUp ? 'var(--success)' : 'var(--danger)',
            padding: '2px 6px',
            borderRadius: 6,
            background: trendUp ? 'var(--success-dim)' : 'var(--danger-dim)',
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

export default function Dashboard() {
  const stats = useMemo(() => getDashboardStats(), []);

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      style={{ padding: 24 }}
    >
      {/* Header */}
      <motion.div variants={itemAnim} style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
          Tableau de bord
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          Chalet Alpicois · La Plagne · Saison 2025
        </p>
      </motion.div>

      {/* KPI Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 24,
      }}>
        <StatCard
          icon={Euro}
          label="Revenus confirmés"
          value={stats.totalRevenue}
          prefix=""
          color="var(--brand)"
          trend={12}
          trendUp={true}
        />
        <StatCard
          icon={CalendarDays}
          label="Séjours totaux"
          value={stats.totalStays}
          color="var(--info)"
        />
        <StatCard
          icon={Building2}
          label="Taux d'occupation"
          value={stats.occupancyRate}
          suffix="%"
          color="var(--warning)"
          trend={5}
          trendUp={true}
        />
        <StatCard
          icon={TrendingUp}
          label="Prix moyen"
          value={stats.averagePrice}
          prefix=""
          suffix=" €"
          color="var(--success)"
        />
        <StatCard
          icon={Users}
          label="Clients"
          value={stats.clients}
          color="var(--brand-light)"
        />
        <StatCard
          icon={Bell}
          label="Prospects"
          value={stats.prospects}
          color="var(--warning)"
        />
        <StatCard
          icon={Bell}
          label="Nouvelles demandes"
          value={stats.newInquiries}
          color="var(--danger)"
          trend={-2}
          trendUp={false}
        />
      </div>

      {/* Recent activity & upcoming stays */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
        {/* Recent emails */}
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
          {[
            { name: 'Famille Dupont', subject: 'Réservation Chalet - Mars 2025', time: 'Il y a 2h' },
            { name: 'Famille Martin', subject: 'Confirmation semaine ski', time: 'Il y a 1j' },
            { name: 'Jean Bernard', subject: 'Info disponibilité avril', time: 'Il y a 3j' },
          ].map((item, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: i < 2 ? '1px solid var(--border-color)' : 'none',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.subject}</div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', marginLeft: 12 }}>{item.time}</div>
            </div>
          ))}
        </motion.div>

        {/* Upcoming stays */}
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
          {[
            { name: 'Famille Martin', dates: '17 - 24 Fév 2025', price: 3200, status: 'Payé' as const },
            { name: 'Famille Dupont', dates: '15 - 22 Mar 2025', price: 2800, status: 'Confirmé' as const },
            { name: 'Jean Bernard', dates: '5 - 12 Avr 2025', price: 2200, status: 'En attente' as const },
          ].map((stay, i) => {
            const statusColor = stay.status === 'Payé' ? 'var(--success)' : stay.status === 'Confirmé' ? 'var(--info)' : 'var(--warning)';
            const statusBg = stay.status === 'Payé' ? 'var(--success-dim)' : stay.status === 'Confirmé' ? 'var(--info-dim)' : 'var(--warning-dim)';
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: i < 2 ? '1px solid var(--border-color)' : 'none',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{stay.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{stay.dates}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand)' }}>{stay.price}€</span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: statusColor,
                    background: statusBg,
                    padding: '2px 8px',
                    borderRadius: 6,
                  }}>
                    {stay.status}
                  </span>
                </div>
              </div>
            );
          })}
        </motion.div>
      </div>
    </motion.div>
  );
}
