import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, CheckCircle, Clock, XCircle } from 'lucide-react';
import { fetchContacts, fetchStays } from '../data';
import type { Contact, StayRecord } from '../types';

// ─── HELPERS ──────────────────────────────────────

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function getSeasonLabel(season: string): string {
  if (!season) return 'Inconnue';
  const [start, end] = season.split('-');
  return `Hiver ${start}-${end}`;
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay(); // 0=dim
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  confirmed: { bg: '#ecfdf5', text: '#059669', label: 'Confirmé' },
  paid: { bg: '#e0f2fe', text: '#0284c7', label: 'Payé' },
  pending: { bg: '#fef3c7', text: '#d97706', label: 'En attente' },
  cancelled: { bg: '#fef2f2', text: '#dc2626', label: 'Annulé' },
};

// ─── SEASON VIEW ──────────────────────────────────

function SeasonView({ weeks }: { weeks: { season: string; weekStart: string; guestName: string; price: number; status: string; checkIn: string; checkOut: string }[] }) {
  const seasons = useMemo(() => {
    const map = new Map<string, typeof weeks>();
    for (const w of weeks) {
      if (!map.has(w.season)) map.set(w.season, []);
      map.get(w.season)!.push(w);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([season, items]) => ({ season, label: getSeasonLabel(season), weeks: items.sort((a, b) => a.weekStart.localeCompare(b.weekStart)) }));
  }, [weeks]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {seasons.map(({ season, label, weeks: seasonWeeks }) => {
        const totalRevenue = seasonWeeks.reduce((sum, w) => sum + w.price, 0);
        return (
          <div key={season}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</h2>
              <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {seasonWeeks.length} semaine{seasonWeeks.length > 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--success, #059669)' }}>
                  {totalRevenue.toLocaleString('fr-FR')}€
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {seasonWeeks.map((w, i) => {
                const cfg = statusConfig[w.status] || statusConfig.pending;
                return (
                  <motion.div
                    key={w.weekStart}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    style={{
                      background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)', padding: '12px 16px',
                      display: 'flex', alignItems: 'center', gap: 16,
                    }}
                  >
                    <div style={{
                      textAlign: 'center', minWidth: 80, padding: '6px 10px',
                      borderRadius: 8, background: cfg.bg,
                    }}>
                      <div style={{ fontSize: 10, color: cfg.text, fontWeight: 600 }}>Semaine</div>
                      <div style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 700, marginTop: 1 }}>
                        {formatDateShort(w.checkIn)}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                        → {formatDateShort(w.checkOut)}
                      </div>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {w.guestName}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
                        {w.price > 0 ? `${w.price.toLocaleString('fr-FR')}€` : '—'}
                      </div>
                    </div>

                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
                      borderRadius: 6, background: cfg.bg, fontSize: 10, fontWeight: 600,
                      color: cfg.text, whiteSpace: 'nowrap',
                    }}>
                      {cfg.label}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── MONTH CALENDAR GRID ──────────────────────────

function MonthGrid({ stays, currentDate }: { stays: (StayRecord & { guestName: string })[]; currentDate: Date }) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=dim
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const weeks: { days: (number | null)[]; weekNum: number }[] = [];
  let currentWeek: (number | null)[] = Array(startOffset).fill(null);
  let weekCounter = 1;
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day);
    if (currentWeek.length === 7) { weeks.push({ days: currentWeek, weekNum: weekCounter++ }); currentWeek = []; }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push({ days: currentWeek, weekNum: weekCounter });
  }

  const getDateStr = (day: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // Grouper les séjours par semaine unique : 1 meilleur séjour par semaine
  const weekStays = useMemo(() => {
    const map = new Map<string, (StayRecord & { guestName: string })>();
    for (const s of stays) {
      const wk = getWeekStart(s.checkIn);
      const existing = map.get(wk);
      const sPrice = s.priceConfirmed || s.priceQuoted || 0;
      const ePrice = existing ? (existing.priceConfirmed || existing.priceQuoted || 0) : 0;
      if (!existing || sPrice > ePrice) {
        map.set(wk, { ...s, checkIn: s.checkIn, checkOut: s.checkOut });
      }
    }
    return map;
  }, [stays]);

  return (
    <div>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '40px repeat(7, 1fr)', borderBottom: '2px solid var(--border-color)', background: 'var(--bg-surface-alt)' }}>
          <div style={{ padding: '8px 4px', textAlign: 'center', fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>Sem</div>
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((name, i) => (
            <div key={i} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 10, fontWeight: 600, color: i >= 5 ? 'var(--text-muted)' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {name}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => {
          const firstDay = week.days.find(d => d !== null);
          const weekStart = firstDay ? getDateStr(firstDay) : '';
          const weekS = weekStart ? getWeekStart(weekStart) : '';
          const stay = weekS ? weekStays.get(weekS) : undefined;
          const today = new Date();
          const cfg = stay ? (statusConfig[stay.status] || statusConfig.pending) : null;

          return (
            <div key={wi} style={{
              display: 'grid', gridTemplateColumns: '40px repeat(7, 1fr)',
              borderBottom: wi < weeks.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              position: 'relative',
            }}>
              {/* Week number */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 6,
                fontSize: 9, fontWeight: 700, color: 'var(--text-muted)',
                background: 'var(--bg-surface-alt)', borderRight: '1px solid var(--border-subtle)',
              }}>
                S{week.weekNum}
              </div>

              {/* Day cells */}
              {week.days.map((day, di) => {
                if (day === null) return <div key={`e-${di}`} style={{ minHeight: 110, background: 'var(--bg-surface-alt)' }} />;
                const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                const isWeekend = di >= 5;
                return (
                  <div key={day} style={{
                    minHeight: 110, padding: '24px 3px 3px', position: 'relative',
                    borderRight: di < 6 ? '1px solid var(--border-subtle)' : 'none',
                    background: isToday ? 'var(--brand-dim)' : 'transparent',
                  }}>
                    <div style={{
                      position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: 4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: isToday ? 700 : 500,
                      background: isToday ? 'var(--brand)' : 'transparent',
                      color: isToday ? '#fff' : (isWeekend ? 'var(--text-muted)' : 'var(--text-secondary)'),
                    }}>
                      {day}
                    </div>
                  </div>
                );
              })}

              {/* Stay bar — 1 seul par semaine */}
              {stay && cfg && (() => {
                // Find start/end columns
                const startIdx = week.days.findIndex(d => d !== null && getDateStr(d) >= stay.checkIn);
                const endCol = week.days.findIndex(d => d !== null && getDateStr(d) >= stay.checkOut);
                const colStart = Math.max(0, startIdx);
                const colEnd = endCol >= 0 ? endCol : week.days.filter(d => d !== null).length;
                const span = Math.max(1, colEnd - colStart);

                const sPrice = stay.priceConfirmed || stay.priceQuoted || 0;

                return (
                  <div style={{
                    position: 'absolute', top: 24, left: 0, right: 0, pointerEvents: 'none',
                    display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                  }}>
                    {week.days.map((_d, ci) => {
                      if (ci < colStart || ci >= colStart + span) return <div key={`sp-${ci}`} />;
                      const isFirst = ci === colStart;
                      return (
                        <div key={`stay-${ci}`} style={{
                          gridColumn: `${ci + 1} / span 1`, pointerEvents: 'auto',
                          padding: isFirst ? '0 2px' : 0,
                        }}>
                          <div style={{
                            height: 22, borderRadius: isFirst ? 4 : 0, overflow: 'hidden',
                            background: cfg.bg, borderLeft: isFirst ? `3px solid ${cfg.text}` : 'none',
                            display: 'flex', alignItems: 'center', padding: isFirst ? '0 6px' : 0,
                            fontSize: 9, fontWeight: 600, color: 'var(--text-primary)',
                            whiteSpace: 'nowrap', cursor: 'pointer',
                          }}
                            title={`${stay.guestName}\n${formatDateShort(stay.checkIn)} → ${formatDateShort(stay.checkOut)}\n${sPrice > 0 ? `${sPrice.toLocaleString('fr-FR')}€` : 'Prix non spécifié'}`}
                          >
                            {isFirst && (
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {stay.guestName}
                                {sPrice > 0 && <span style={{ marginLeft: 3, color: cfg.text }}>· {sPrice.toLocaleString('fr-FR')}€</span>}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MAIN CALENDAR VIEW ───────────────────────────

export default function CalendarView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [rawStays, setRawStays] = useState<StayRecord[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'season'>('month');

  useEffect(() => {
    Promise.all([fetchContacts(), fetchStays()]).then(([c, s]) => {
      setContacts(c);
      setRawStays(s);
    });
  }, []);

  // Enrich stays with guest name, déduplique par semaine (1 seul / semaine)
  const allStays = useMemo(() => {
    const fromApi = rawStays.map(s => ({
      ...s,
      guestName: (s as any).contactName || 'Inconnu',
      contactEmail: (s as any).contactEmail || '',
    }));

    // 1 seul stay par semaine : prendre le meilleur (confirmed > pending, puis meilleur prix)
    const weekMap = new Map<string, StayRecord & { guestName: string; contactEmail: string }>();
    for (const s of fromApi) {
      const wk = getWeekStart(s.checkIn);
      const existing = weekMap.get(wk);
      const sPrice = s.priceConfirmed || s.priceQuoted || 0;
      const ePrice = existing ? (existing.priceConfirmed || existing.priceQuoted || 0) : 0;
      const sScore = (s.status === 'confirmed' || s.status === 'paid' ? 1000 : 0) + sPrice;
      const eScore = existing ? ((existing.status === 'confirmed' || existing.status === 'paid' ? 1000 : 0) + ePrice) : -1;
      if (!existing || sScore > eScore) {
        weekMap.set(wk, s);
      }
    }
    return Array.from(weekMap.values());
  }, [rawStays]);

  const prevMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  // Build week list for season view
  const seasonWeeks = useMemo(() => {
    return allStays
      .filter(s => (s.status === 'confirmed' || s.status === 'paid') && (s.priceConfirmed || s.priceQuoted || 0) >= 1000)
      .map(s => ({
        season: s.season || 'Inconnue',
        weekStart: getWeekStart(s.checkIn),
        guestName: s.guestName,
        price: s.priceConfirmed || s.priceQuoted || 0,
        status: s.status,
        checkIn: s.checkIn,
        checkOut: s.checkOut,
      }));
  }, [allStays]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Calendrier des séjours</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {seasonWeeks.length} semaines louées · {allStays.filter(s => s.status === 'confirmed' || s.status === 'paid').length} confirmées
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', gap: 4, marginRight: 12 }}>
            <button onClick={() => setViewMode('month')} style={{
              padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11,
              fontWeight: viewMode === 'month' ? 600 : 400,
              color: viewMode === 'month' ? 'var(--brand)' : 'var(--text-secondary)',
              background: viewMode === 'month' ? 'var(--brand-dim)' : 'transparent', cursor: 'pointer',
            }}>Mois</button>
            <button onClick={() => setViewMode('season')} style={{
              padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11,
              fontWeight: viewMode === 'season' ? 600 : 400,
              color: viewMode === 'season' ? 'var(--brand)' : 'var(--text-secondary)',
              background: viewMode === 'season' ? 'var(--brand-dim)' : 'transparent', cursor: 'pointer',
            }}>Par saison</button>
          </div>
          {viewMode === 'month' && (
            <>
              <button onClick={prevMonth} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', minWidth: 180, textAlign: 'center' }}>
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </span>
              <button onClick={nextMonth} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
                <ChevronRight size={16} />
              </button>
              <button onClick={goToday} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 11, color: 'var(--text-secondary)', marginLeft: 4 }}>
                Aujourd'hui
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {viewMode === 'month' ? (
          <motion.div key="month" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <MonthGrid stays={allStays} currentDate={currentDate} />
          </motion.div>
        ) : (
          <motion.div key="season" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SeasonView weeks={seasonWeeks} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: cfg.bg, borderLeft: `2px solid ${cfg.text}` }} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{cfg.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
