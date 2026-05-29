import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Mail, MessageSquare, ArrowRight, Mountain } from 'lucide-react';
import { fetchDashboardStats } from '../data';
import type { ViewType } from '../types';
import { CHALET } from '../config/chalet';

interface SimpleStats {
  totalContacts: number;
  totalEmails: number;
  emailsThisMonth: number;
  recentContacts: number;
}

export default function Dashboard({ onNavigate }: { onNavigate?: (view: ViewType) => void }) {
  const [stats, setStats] = useState<SimpleStats | null>(null);

  useEffect(() => {
    fetchDashboardStats().then(setStats).catch(() => setStats(null));
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}
    >
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 14, margin: '0 auto 16px',
          background: 'linear-gradient(135deg, var(--brand), var(--brand-light))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Mountain size={24} color="white" />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
          {CHALET.name}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
          {CHALET.location}
        </p>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 24 }}>
          {[
            { icon: Users, label: 'Contacts', value: stats.totalContacts, color: '#7c3aed' },
            { icon: MessageSquare, label: 'Messages', value: stats.totalEmails, color: '#0891b2' },
            { icon: Mail, label: 'Emails ce mois', value: stats.emailsThisMonth, color: '#2563eb' },
            { icon: Users, label: 'Actifs ce mois', value: stats.recentContacts, color: '#059669' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div
              key={label}
              style={{
                padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border-color)',
                background: 'var(--bg-surface)',
              }}
            >
              <Icon size={16} color={color} style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onNavigate?.('clients')}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '14px 20px', borderRadius: 12, border: 'none',
          background: 'var(--brand)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          marginBottom: 20,
        }}
      >
        Voir les conversations
        <ArrowRight size={16} />
      </button>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
        {CHALET.rentalFormula.note}
        <br />
        <a href={CHALET.website} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)' }}>
          {CHALET.website.replace('https://', '')}
        </a>
      </p>
    </motion.div>
  );
}
