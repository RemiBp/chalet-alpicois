import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Database, Mail, Mountain, CheckCircle2, ExternalLink } from 'lucide-react';
import { fetchDashboardStats } from '../data';
import { CHALET, formatPrice } from '../config/chalet';

export default function SettingsView() {
  const [stats, setStats] = useState<{ totalContacts: number; totalEmails: number } | null>(null);

  useEffect(() => {
    fetchDashboardStats().then(s => setStats({ totalContacts: s.totalContacts, totalEmails: s.totalEmails })).catch(() => {});
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24, maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Paramètres</h1>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 24 }}>
        Configuration et informations du chalet
      </p>

      <Section title="Chalet" icon={Mountain}>
        <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{CHALET.name}</strong> — {CHALET.capacity} pers. · {CHALET.surfaceM2} m² · {CHALET.bedrooms} chambres
          <br />Pistes à {CHALET.distancePistes} · Plagne Centre à {CHALET.distanceCentre}
          <br />
          <a href={CHALET.website} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
            Site web <ExternalLink size={12} />
          </a>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, padding: '10px 12px', background: 'var(--bg-body)', borderRadius: 8 }}>
          {CHALET.rentalFormula.note}
        </p>
      </Section>

      <Section title="Tarifs indicatifs" icon={Mountain}>
        {CHALET.seasons.map(season => (
          <div key={season.season} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{season.label}</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {[
                ['Haute', season.highSeason],
                ['Moyenne', season.midSeason],
                ['Basse', season.lowSeason],
              ].map(([label, tier]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{label as string} — {(tier as { note: string }).note}</span>
                  <span style={{ fontWeight: 600 }}>{formatPrice((tier as { typical: number }).typical)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Données" icon={Database}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Info label="Contacts" value={stats?.totalContacts ?? '—'} />
          <Info label="Messages liés" value={stats?.totalEmails ?? '—'} />
          <Info label="Email" value={CHALET.email} />
          <Info label="Base" value="SQLite (emails.db)" />
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.5 }}>
          Pour reconstruire les fiches depuis la boîte mail : <code style={{ fontSize: 10 }}>npm run rebuild</code>
        </p>
      </Section>

      <Section title="Connexion email" icon={Mail}>
        <Info label="Compte" value={
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--success)' }}>
            <CheckCircle2 size={12} /> {CHALET.email}
          </span>
        } />
      </Section>
    </motion.div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Mail; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-color)',
      padding: 20, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Icon size={16} color="var(--brand)" />
        <h2 style={{ fontSize: 14, fontWeight: 700 }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 500 }}>{value}</div>
    </div>
  );
}
