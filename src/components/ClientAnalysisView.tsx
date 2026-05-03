import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Globe, TrendingUp, Users, Euro, Award } from 'lucide-react';
import { fetchClientAnalysis } from '../data';
import type { ClientAnalysis } from '../data';

const statusColor: Record<string, string> = {
  client: '#059669',
  prospect: '#6b7280',
};

function Card({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-color)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
      }}>
        {icon}
        {title}
      </div>
      <div style={{ padding: '16px 18px' }}>
        {children}
      </div>
    </div>
  );
}

export default function ClientAnalysisView() {
  const [data, setData] = useState<ClientAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchClientAnalysis().then(setData).finally(() => setLoading(false));
  }, []);

  const totalClients = useMemo(() => {
    if (!data) return 0;
    return data.byNationality.reduce((s, n) => s + n.clients, 0);
  }, [data]);

  const totalContacts = useMemo(() => {
    if (!data) return 0;
    return data.byNationality.reduce((s, n) => s + n.contacts, 0);
  }, [data]);

  if (loading) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: 24, maxWidth: 1200 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400, color: 'var(--text-muted)', fontSize: 13 }}>
          Chargement...
        </div>
      </motion.div>
    );
  }

  if (!data) return null;

  const totalLoyaltyContacts = data.loyalty.reduce((s, l) => s + l.contacts, 0);
  const returningPct = totalLoyaltyContacts > 0
    ? Math.round(data.loyalty.filter(l => l.category !== '1 séjour').reduce((s, l) => s + l.contacts, 0) / totalLoyaltyContacts * 100)
    : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Analyse des clients</h1>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          {totalClients} clients · {totalContacts - totalClients} prospects · {returningPct}% de clients fidèles (2+ séjours)
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Répartition clients / prospects */}
        <Card title="Clients vs Prospects" icon={<Users size={15} />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(['client', 'prospect'] as const).map(status => {
              const count = status === 'client' ? totalClients : totalContacts - totalClients;
              const pct = totalContacts > 0 ? Math.round(count / totalContacts * 100) : 0;
              return (
                <div key={status}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                      {status === 'client' ? 'Clients' : 'Prospects'}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: statusColor[status] }}>{count} ({pct}%)</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-surface-alt)' }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: statusColor[status], transition: 'width 0.5s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Fidélité */}
        <Card title="Fidélité" icon={<TrendingUp size={15} />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.loyalty.map(l => {
              const pct = totalLoyaltyContacts > 0
                ? Math.round(l.contacts / totalLoyaltyContacts * 100)
                : 0;
              const barColor = l.category === '1 séjour' ? '#94a3b8' : l.category === '2 séjours' ? '#6366f1' : '#059669';
              return (
                <div key={l.category}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{l.category}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {l.contacts} client{l.contacts > 1 ? 's' : ''} ({pct}%)
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-surface-alt)' }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: barColor, transition: 'width 0.5s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Par nationalité */}
        <Card title="Par nationalité" icon={<Globe size={15} />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.byNationality.slice(0, 10).map(n => (
              <div key={n.nationality} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                borderBottom: '1px solid var(--border-subtle)',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: n.nationality === 'Française' ? '#eff6ff' : '#f0fdf4',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: n.nationality === 'Française' ? '#2563eb' : '#059669',
                  flexShrink: 0,
                }}>
                  {n.nationality.slice(0, 3)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{n.nationality}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {n.clients} client{n.clients > 1 ? 's' : ''} · {n.prospects} prospect{n.prospects > 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {n.total_revenue.toLocaleString('fr-FR')}€
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    ~{n.avg_price.toLocaleString('fr-FR')}€/séjour
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Par saison */}
        <Card title="Par saison" icon={<Award size={15} />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.bySeason.map(s => {
              const max = Math.max(...data.bySeason.map(x => x.revenue));
              const pct = max > 0 ? (s.revenue / max * 100) : 0;
              return (
                <div key={s.season} style={{
                  padding: '8px 0', borderBottom: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {s.season.replace('-', ' - ')}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {s.revenue.toLocaleString('fr-FR')}€
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-surface-alt)' }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${pct}%`, background: '#059669', transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                    {s.unique_clients} client{s.unique_clients > 1 ? 's' : ''} · {s.weeks} semaine{s.weeks > 1 ? 's' : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Top clients */}
      <Card title="Top 20 clients (par revenu total)" icon={<Euro size={15} />}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.topClients.map((c, i) => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0',
              borderBottom: i < data.topClients.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: 6,
                background: i < 3 ? '#fef3c7' : 'var(--bg-surface-alt)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, color: i < 3 ? '#d97706' : 'var(--text-muted)',
                flexShrink: 0,
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.name}
                  {c.nationality && (
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>· {c.nationality}</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {c.staysCount} séjour{c.staysCount > 1 ? 's' : ''} · Dernier: {new Date(c.lastStay).toLocaleDateString('fr-FR')}
                </div>
              </div>
              <div style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                background: statusColor[c.status] + '18',
                color: statusColor[c.status],
              }}>
                {c.status === 'client' ? 'Client' : 'Prospect'}
              </div>
              <div style={{ textAlign: 'right', minWidth: 90 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {c.totalPaid.toLocaleString('fr-FR')}€
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}
