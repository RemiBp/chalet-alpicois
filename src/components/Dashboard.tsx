import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Mail, MessageSquare, ArrowRight, FileText, ScrollText } from 'lucide-react';
import { fetchDashboardStats } from '../data';
import type { ViewType } from '../types';
import { CHALET } from '../config/chalet';

const HERO_IMAGE = `${import.meta.env.BASE_URL}chalet-hero.png`;

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
      style={{ padding: '24px 32px 32px', maxWidth: 720, margin: '0 auto' }}
    >
      {/* Hero */}
      <div style={{
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 28,
        border: '1px solid var(--border-color)',
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08)',
      }}>
        <img
          src={HERO_IMAGE}
          alt={`${CHALET.name} en hiver — La Plagne`}
          style={{
            width: '100%',
            height: 280,
            objectFit: 'cover',
            objectPosition: 'center 40%',
            display: 'block',
          }}
        />
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(15,23,42,0.75) 0%, rgba(15,23,42,0.15) 55%, transparent 100%)',
        }} />
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '20px 22px',
          color: 'white',
        }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, textShadow: '0 1px 8px rgba(0,0,0,0.4)' }}>
            {CHALET.name}
          </h1>
          <p style={{ fontSize: 13, opacity: 0.92, marginTop: 6 }}>
            {CHALET.location} · {CHALET.domain}
          </p>
        </div>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => onNavigate?.('clients')}
          style={primaryBtn}
        >
          Conversations
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.('contracts')}
          style={secondaryBtn}
        >
          <ScrollText size={16} />
          Contrats
        </button>
      </div>
      <button
        type="button"
        onClick={() => onNavigate?.('invoices')}
        style={{ ...secondaryBtn, width: '100%', marginBottom: 20 }}
      >
        <FileText size={16} />
        Factures
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

const primaryBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '13px 16px', borderRadius: 12, border: 'none',
  background: 'var(--brand)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '13px 16px', borderRadius: 12,
  border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
  color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
