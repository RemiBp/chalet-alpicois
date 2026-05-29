import { motion } from 'framer-motion';
import { CalendarDays, Info } from 'lucide-react';
import { CHALET, formatPrice } from '../config/chalet';

export default function CalendarView() {
  const currentSeason = CHALET.seasons[CHALET.seasons.length - 1];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalendarDays size={22} color="var(--brand)" />
          Calendrier
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
          Le calendrier des séjours sera alimenté manuellement. Pour l’instant, consultez les conversations dans Clients.
        </p>
      </div>

      <div style={{
        padding: 20, borderRadius: 12, border: '1px dashed var(--border-color)',
        background: 'var(--bg-surface)', textAlign: 'center', marginBottom: 24,
      }}>
        <CalendarDays size={32} color="var(--text-muted)" style={{ margin: '0 auto 12px', opacity: 0.4 }} />
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucune semaine réservée pour le moment</p>
      </div>

      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-color)', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Info size={16} color="var(--brand)" />
          <h2 style={{ fontSize: 14, fontWeight: 700 }}>Tarifs indicatifs — {currentSeason.label}</h2>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
          {CHALET.rentalFormula.note} · {CHALET.capacity} personnes · {CHALET.surfaceM2} m²
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { label: 'Haute saison', data: currentSeason.highSeason, color: '#dc2626' },
            { label: 'Moyenne saison', data: currentSeason.midSeason, color: '#d97706' },
            { label: 'Basse saison', data: currentSeason.lowSeason, color: '#059669' },
          ].map(({ label, data, color }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-body)' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{data.note}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color }}>{formatPrice(data.typical)}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>dès {formatPrice(data.min)}</div>
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 14 }}>
          Source : <a href={CHALET.website} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)' }}>alpicois-laplagne.fr</a>
        </p>
      </div>
    </motion.div>
  );
}
