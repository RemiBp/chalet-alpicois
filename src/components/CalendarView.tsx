import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchContacts, fetchStays } from '../data';
import type { Contact, StayRecord } from '../types';

// ─── HELPERS ──────────────────────────────────────

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function getSeasonLabel(season: string): string {
  if (!season) return 'Inconnue';
  const [start, end] = season.split('-');
  return `Hiver ${start}-${end}`;
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function getMondayOfWeek(dateStr: string): string {
  return getWeekStart(dateStr);
}

const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const statusConfig: Record<string, { bg: string; text: string; label: string; border: string }> = {
  confirmed: { bg: '#ecfdf5', text: '#059669', label: 'Confirmé', border: '#059669' },
  paid: { bg: '#e0f2fe', text: '#0284c7', label: 'Payé', border: '#0284c7' },
  pending: { bg: '#fef3c7', text: '#d97706', label: 'En attente', border: '#d97706' },
  cancelled: { bg: '#fef2f2', text: '#dc2626', label: 'Annulé', border: '#dc2626' },
};

const dayLabel = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// ─── SEASON VIEW ──────────────────────────────────

function SeasonView({ weeks }: { weeks: StayWeek[] }) {
  const seasons = useMemo(() => {
    const map = new Map<string, StayWeek[]>();
    for (const w of weeks) {
      if (!map.has(w.season)) map.set(w.season, []);
      map.get(w.season)!.push(w);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([season, items]) => ({
        season,
        label: getSeasonLabel(season),
        weeks: items.sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
      }));
  }, [weeks]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {seasons.map(({ season, label, weeks: sw }) => {
        const totalRevenue = sw.reduce((s, w) => s + w.price, 0);
        return (
          <div key={season}>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</h2>
              <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {sw.length} semaine{sw.length > 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#059669' }}>
                  {totalRevenue.toLocaleString('fr-FR')}€
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sw.map((w, i) => {
                const cfg = statusConfig[w.status] || statusConfig.pending;
                return (
                  <motion.div
                    key={`${w.checkIn}-${w.guestName}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
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

// ─── HELPERS FOR MONTH TABLE ─────────────────────

interface CalendarDay {
  date: Date | null; // null = empty filler
  dayNum: number; // 1-31 or 0 for filler
  isToday: boolean;
  isWeekend: boolean;
}

interface CalendarRow {
  label: string; // e.g. "S1"
  days: CalendarDay[];
  stay: StayWeek | null; // best stay for this week
}

interface StayWeek {
  season: string;
  checkIn: string;
  checkOut: string;
  guestName: string;
  price: number;
  status: string;
}

function buildMonthRows(year: number, month: number, stayMap: Map<string, StayWeek>): CalendarRow[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const startPad = firstDay === 0 ? 6 : firstDay - 1;

  const rows: CalendarRow[] = [];
  let row: CalendarDay[] = [];
  let weekNum = 1;

  // Pre-fill with nulls
  for (let i = 0; i < startPad; i++) {
    row.push({ date: null, dayNum: 0, isToday: false, isWeekend: false });
  }

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const dayOfWeek = date.getDay();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    row.push({ date, dayNum: d, isToday, isWeekend });

    if (row.length === 7) {
      const firstRealDate = row.find(r => r.date !== null)?.date;
      const wk = firstRealDate ? getMondayOfWeek(firstRealDate.toISOString().split('T')[0]) : '';
      const stay = wk ? stayMap.get(wk) || null : null;
      rows.push({ label: `S${weekNum++}`, days: row, stay });
      row = [];
    }
  }

  // Pad remaining
  if (row.length > 0) {
    while (row.length < 7) {
      row.push({ date: null, dayNum: 0, isToday: false, isWeekend: false });
    }
    const firstRealDate = row.find(r => r.date !== null)?.date;
    const wk = firstRealDate ? getMondayOfWeek(firstRealDate.toISOString().split('T')[0]) : '';
    const stay = wk ? stayMap.get(wk) || null : null;
    rows.push({ label: `S${weekNum}`, days: row, stay });
  }

  return rows;
}

// ─── MONTH GRID ──────────────────────────────────

function MonthGrid({ stayMap, year, month }: { stayMap: Map<string, StayWeek>; year: number; month: number }) {
  const rows = useMemo(() => buildMonthRows(year, month, stayMap), [year, month, stayMap]);

  return (
    <div style={{
      background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-color)', overflow: 'hidden',
    }}>
      {/* Column widths: 40px for week label, then 7 equal columns, each day col = (100% - 40px) / 7 */}
      <style>{`
        .cal-grid { display: grid; grid-template-columns: 40px repeat(7, 1fr); }
        .cal-cell { min-height: 100px; position: relative; padding: 26px 2px 2px; font-size: 11px; }
        .cal-stay-bar {
          position: absolute; top: 26px; height: 22px; z-index: 5;
          border-radius: 4px; display: flex; align-items: center;
          padding: 0 6px; font-size: 9px; font-weight: 600; white-space: nowrap; overflow: hidden;
          cursor: pointer; pointer-events: auto; border-left: 3px solid;
          box-sizing: border-box;
        }
        .cal-stay-bar span { overflow: hidden; text-overflow: ellipsis; }
      `}</style>

      {/* Header */}
      <div className="cal-grid" style={{ borderBottom: '2px solid var(--border-color)', background: 'var(--bg-surface-alt)' }}>
        <div style={{ padding: '8px 4px', textAlign: 'center', fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>Sem</div>
        {dayLabel.map((n, i) => (
          <div key={n} style={{
            padding: '8px 4px', textAlign: 'center', fontSize: 10, fontWeight: 600,
            color: i >= 5 ? 'var(--text-muted)' : 'var(--text-secondary)',
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>{n}</div>
        ))}
      </div>

      {/* Rows */}
      {rows.map((row, ri) => (
        <div key={ri} className="cal-grid" style={{
          borderBottom: ri < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
          position: 'relative',
        }}>
          {/* Week label */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 6,
            fontSize: 9, fontWeight: 700, color: 'var(--text-muted)',
            background: 'var(--bg-surface-alt)', borderRight: '1px solid var(--border-subtle)',
          }}>
            {row.label}
          </div>

          {/* Day cells */}
          {row.days.map((cd, ci) => {
            const isLast = ci === 6;
            if (!cd.date) {
              return <div key={`e${ci}`} className="cal-cell" style={{ background: 'var(--bg-surface-alt)', borderRight: isLast ? 'none' : '1px solid var(--border-subtle)' }} />;
            }
            return (
              <div key={cd.dayNum} className="cal-cell" style={{
                borderRight: isLast ? 'none' : '1px solid var(--border-subtle)',
                background: cd.isToday ? 'var(--brand-dim)' : 'transparent',
              }}>
                <div style={{
                  position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: cd.isToday ? 700 : 500,
                  background: cd.isToday ? 'var(--brand)' : 'transparent',
                  color: cd.isToday ? '#fff' : (cd.isWeekend ? 'var(--text-muted)' : 'var(--text-secondary)'),
                }}>
                  {cd.dayNum}
                </div>
              </div>
            );
          })}

          {/* Stay bar — positioned across the right columns only (skip week label col) */}
          {row.stay && (() => {
            const s = row.stay;
            const cfg = statusConfig[s.status] || statusConfig.pending;
            const sPrice = s.price;

            // Find day indices for checkIn and checkOut within this row
            let colStart = -1;
            let colEnd = -1;
            for (let i = 0; i < row.days.length; i++) {
              const d = row.days[i];
              if (!d.date) continue;
              const ds = d.date.toISOString().split('T')[0];
              if (colStart === -1 && ds >= s.checkIn) colStart = i;
              if (colEnd === -1 && ds >= s.checkOut) { colEnd = i; break; }
            }
            if (colEnd === -1) {
              // checkOut beyond this row — span to the end
              colEnd = row.days.filter(d => d.date !== null).length;
            }
            if (colStart === -1) colStart = 0;

            // Calculate position within the 7-column day area
            const dayAreaPct = 100; // 100% of the 7-col area
            const dayColPct = dayAreaPct / 7;
            const leftPct = colStart * dayColPct;
            const widthPct = (colEnd - colStart) * dayColPct;
            // 40px is the week label
            const leftCss = `calc(40px + ${leftPct}% + 2px)`;
            const widthCss = `calc(${widthPct}% - 4px)`;

            return (
              <div className="cal-stay-bar" style={{
                left: leftCss, width: widthCss,
                background: cfg.bg, borderLeftColor: cfg.border,
                color: 'var(--text-primary)',
              }}
                title={`${s.guestName}\n${formatDateFull(s.checkIn)} → ${formatDateFull(s.checkOut)}\n${sPrice > 0 ? `${sPrice.toLocaleString('fr-FR')}€` : 'Prix non spécifié'}`}
              >
                <span>
                  {s.guestName}
                  {sPrice > 0 && (
                    <span style={{ marginLeft: 4, color: cfg.text }}>· {sPrice.toLocaleString('fr-FR')}€</span>
                  )}
                </span>
              </div>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

// ─── MAIN CALENDAR VIEW ───────────────────────────

export default function CalendarView() {
  const [rawStays, setRawStays] = useState<StayRecord[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'season'>('month');

  useEffect(() => {
    fetchStays().then(s => setRawStays(s));
  }, []);

  // Build week map: 1 best stay per week
  const weekStayMap = useMemo(() => {
    const map = new Map<string, StayWeek>();
    for (const s of rawStays) {
      const wk = getWeekStart(s.checkIn);
      const existing = map.get(wk);
      const sp = s.priceConfirmed || s.priceQuoted || 0;
      const ep = existing ? existing.price : 0;
      const ss = (s.status === 'confirmed' || s.status === 'paid' ? 1000 : 0) + sp;
      const es = existing ? ((existing.status === 'confirmed' || existing.status === 'paid' ? 1000 : 0) + ep) : -1;
      if (!existing || ss > es) {
        map.set(wk, {
          season: s.season || 'Inconnue',
          checkIn: s.checkIn,
          checkOut: s.checkOut,
          guestName: (s as any).contactName || 'Inconnu',
          price: sp,
          status: s.status,
        });
      }
    }
    return map;
  }, [rawStays]);

  // Week list for season view (only confirmed/paid with price >= 1000)
  const seasonWeeks = useMemo(() => {
    return Array.from(weekStayMap.values())
      .filter(s => (s.status === 'confirmed' || s.status === 'paid') && s.price >= 1000);
  }, [weekStayMap]);

  const prevMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Calendrier des séjours</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {seasonWeeks.length} semaines louées · {Array.from(weekStayMap.values()).filter(s => s.status === 'confirmed' || s.status === 'paid').length} confirmées
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
                {monthNames[month]} {year}
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
            <MonthGrid stayMap={weekStayMap} year={year} month={month} />
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
            <div style={{ width: 10, height: 10, borderRadius: 2, background: cfg.bg, borderLeft: `2px solid ${cfg.border}` }} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{cfg.label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
