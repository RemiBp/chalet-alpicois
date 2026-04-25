import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Users, CalendarDays, ChevronRight, AlertCircle } from 'lucide-react';
import { mockContacts } from '../data';

type ProspectFilter = 'all' | 'asked' | 'negotiating' | 'abandoned';

export default function ProspectsView() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ProspectFilter>('all');

  const prospects = useMemo(() => {
    return mockContacts.filter(c =>
      c.status === 'prospect' || (c.status === 'client' && c.requestedWeeks.length > 0)
    );
  }, []);

  const filtered = useMemo(() => {
    let result = prospects;
    if (filter !== 'all') {
      result = result.filter(c => c.requestedWeeks.some(rw => rw.status === filter));
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    }
    return result;
  }, [prospects, filter, search]);

  const filterLabels: Record<ProspectFilter, string> = {
    all: 'Tous',
    asked: 'Demandé',
    negotiating: 'En négociation',
    abandoned: 'Abandonné',
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Prospects</h1>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          {prospects.length} contacts · {
            prospects.filter(c => c.requestedWeeks.some(rw => rw.status === 'negotiating')).length
          } en négociation
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(Object.entries(filterLabels) as [ProspectFilter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                padding: '6px 12px', borderRadius: 8, border: 'none',
                fontSize: 11, fontWeight: filter === key ? 600 : 500,
                color: filter === key ? 'var(--brand)' : 'var(--text-secondary)',
                background: filter === key ? 'var(--brand-dim)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{
          flex: 1, maxWidth: 280, display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color)',
          background: 'var(--bg-surface)',
        }}>
          <Search size={13} color="var(--text-muted)" />
          <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', background: 'none', fontSize: 11, flex: 1, outline: 'none', color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* Kanban-like view per week requested */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((contact, i) => (
          <motion.div
            key={contact.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            style={{
              background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)', padding: 16,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'linear-gradient(135deg, rgba(217,119,6,0.12), rgba(217,119,6,0.05))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Users size={16} color="#d97706" />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{contact.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{contact.email}</div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertCircle size={10} />
                Contacté {new Date(contact.firstContactDate).toLocaleDateString('fr-FR')}
              </div>
            </div>

            {/* Weeks requested */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {contact.requestedWeeks.map(rw => {
                const reqStatusLabel =
                  rw.status === 'asked' ? 'Demandé' :
                  rw.status === 'negotiating' ? 'En négociation' :
                  rw.status === 'abandoned' ? 'Abandonné' : 'Réservé';
                const reqColor =
                  rw.status === 'booked' ? '#16a34a' :
                  rw.status === 'negotiating' ? '#d97706' :
                  rw.status === 'asked' ? '#2563eb' : '#94a3b8';

                return (
                  <div key={rw.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 12px', borderRadius: 8,
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface-alt)',
                  }}>
                    <CalendarDays size={13} color="var(--text-secondary)" />
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                        Semaine {rw.weekNumber}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {rw.season}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {new Date(rw.checkIn).toLocaleDateString('fr-FR')} → {new Date(rw.checkOut).toLocaleDateString('fr-FR')}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        · {rw.adults + rw.children} pers.
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: reqColor, background: `${reqColor}18`, padding: '2px 8px', borderRadius: 6 }}>
                        {reqStatusLabel}
                      </span>
                      <ChevronRight size={13} color="var(--text-muted)" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Origin */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 10, color: 'var(--text-muted)' }}>
              <AlertCircle size={10} />
              Origine : {contact.originDetail}
            </div>
          </motion.div>
        ))}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 12 }}>
            Aucun prospect trouvé
          </div>
        )}
      </div>
    </motion.div>
  );
}
