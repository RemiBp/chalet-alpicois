import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Users, Bed, CheckCircle, Clock, XCircle, Euro } from 'lucide-react';
import { fetchContacts, fetchStays } from '../data';
import type { Contact, StayRecord } from '../types';

// ─── HELPERS ──────────────────────────────────────

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function getSeasonLabel(season: string): string {
  if (!season) return 'Inconnue';
  const [start, end] = season.split('-');
  return `Hiver ${start}-${end}`;
}

const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const statusConfig: Record<string, { bg: string; text: string; label: string; icon: any }> = {
  confirmed: { bg: '#ecfdf5', text: '#059669', label: 'Confirmé', icon: CheckCircle },
  paid: { bg: '#e0f2fe', text: '#0284c7', label: 'Payé', icon: CheckCircle },
  pending: { bg: '#fef3c7', text: '#d97706', label: 'En attente', icon: Clock },
  cancelled: { bg: '#fef2f2', text: '#dc2626', label: 'Annulé', icon: XCircle },
  no_show: { bg: '#fef2f2', text: '#dc2626', label: 'Absent', icon: XCircle },
};

// ─── SEASON VIEW ──────────────────────────────────

function SeasonView({ stays }: { stays: (StayRecord & { guestName: string; contactEmail: string })[] }) {
  // Grouper par saison
  const seasons = useMemo(() => {
    const map = new Map<string, (StayRecord & { guestName: string; contactEmail: string })[]>();
    for (const s of stays) {
      const season = s.season || 'Inconnue';
      if (!map.has(season)) map.set(season, []);
      map.get(season)!.push(s);
    }
    // Trier par saison décroissante
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([season, seasonStays]) => ({
        season,
        label: getSeasonLabel(season),
        stays: seasonStays.sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime()),
      }));
  }, [stays]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {seasons.map(({ season, label, stays: seasonStays }) => {
        const totalRevenue = seasonStays.reduce((sum, s) => sum + (s.priceConfirmed || s.priceQuoted || 0), 0);
        const confirmed = seasonStays.filter(s => s.status === 'confirmed' || s.status === 'paid').length;
        const totalNights = seasonStays.reduce((sum, s) => sum + (s.nights || 7), 0);

        return (
          <div key={season}>
            {/* Season header */}
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{label}</h2>
              <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {seasonStays.length} séjour{seasonStays.length > 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {confirmed} confirmé{confirmed > 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--success, #059669)' }}>
                  {totalRevenue.toLocaleString('fr-FR')}€
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {totalNights} nuit{totalNights > 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Stays list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {seasonStays.map((stay, i) => {
                const cfg = statusConfig[stay.status] || statusConfig.pending;
                const Icon = cfg.icon;
                const price = stay.priceConfirmed || stay.priceQuoted || 0;

                return (
                  <motion.div
                    key={stay.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    style={{
                      background: 'var(--bg-surface)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = cfg.text; e.currentTarget.style.boxShadow = `0 0 0 1px ${cfg.text}20`; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    {/* Date block */}
                    <div style={{
                      textAlign: 'center',
                      minWidth: 60,
                      padding: '6px 10px',
                      borderRadius: 8,
                      background: cfg.bg,
                    }}>
                      <div style={{ fontSize: 10, color: cfg.text, fontWeight: 600 }}>
                        Sem {getWeekNumber(new Date(stay.checkIn))}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 700, marginTop: 1 }}>
                        {formatDateShort(stay.checkIn)}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                        → {formatDateShort(stay.checkOut)}
                      </div>
                    </div>

                    {/* Guest info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {stay.guestName || 'Inconnu'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-muted)' }}>
                          <Users size={10} />
                          {stay.adults + stay.children} pers. ({stay.adults}A + {stay.children}E)
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-muted)' }}>
                          <Bed size={10} />
                          {stay.nights || 7} nuits
                        </span>
                      </div>
                    </div>

                    {/* Price */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
                        {price > 0 ? `${price.toLocaleString('fr-FR')}€` : '—'}
                      </div>
                      {price > 0 && stay.nights > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                          {Math.round(price / (stay.nights || 7))}€/nuit
                        </div>
                      )}
                    </div>

                    {/* Status badge */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 8px',
                      borderRadius: 6,
                      background: cfg.bg,
                      fontSize: 10,
                      fontWeight: 600,
                      color: cfg.text,
                      whiteSpace: 'nowrap',
                    }}>
                      <Icon size={10} />
                      {cfg.label}
                    </div>
                  </motion.div>
                );
              })}

              {seasonStays.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  Aucun séjour cette saison
                </div>
              )}
            </div>
          </div>
        );
      })}

      {seasons.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          Aucune donnée de séjour disponible
        </div>
      )}
    </div>
  );
}

// ─── MONTH CALENDAR GRID ──────────────────────────

function MonthGrid({ stays, currentDate }: { stays: (StayRecord & { guestName: string })[]; currentDate: Date }) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const weeks: { days: (number | null)[]; weekNum: number }[] = [];
  let currentWeek: (number | null)[] = Array(startOffset).fill(null);
  let weekCounter = 1;
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push({ days: currentWeek, weekNum: weekCounter++ });
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push({ days: currentWeek, weekNum: weekCounter });
  }

  // Stays still active this month (any overlap)
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  const activeStays = stays.filter(s => s.checkIn <= monthEnd && s.checkOut >= monthStart);

  // For each stay, compute which day columns it spans
  const stayRows = useMemo(() => {
    // Group stays into lanes for each week to avoid overlap
    const lanes: (typeof activeStays)[] = [];
    for (const stay of activeStays) {
      let placed = false;
      for (const lane of lanes) {
        const conflict = lane.some(other => {
          const aStart = new Date(stay.checkIn);
          const aEnd = new Date(stay.checkOut);
          const bStart = new Date(other.checkIn);
          const bEnd = new Date(other.checkOut);
          return aStart < bEnd && aEnd > bStart;
        });
        if (!conflict) {
          lane.push(stay);
          placed = true;
          break;
        }
      }
      if (!placed) {
        lanes.push([stay]);
      }
    }
    return lanes;
  }, [activeStays]);

  const getColForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return dateStr;
  };

  // Position sejour dans la row: left offset et width
  const getStayPosition = (stay: typeof activeStays[0], week: (number | null)[]) => {
    const wkStartDates = week.filter(d => d !== null).map(d => getColForDay(d as number));
    const wkStart = wkStartDates[0] || stay.checkIn;
    const wkEnd = wkStartDates[wkStartDates.length - 1] || stay.checkOut;

    const stayStart = stay.checkIn < wkStart ? wkStart : stay.checkIn;
    const stayEnd = stay.checkOut > wkEnd ? wkEnd : stay.checkOut;

    const dayIn = new Date(stayStart);
    const dayOut = new Date(stayEnd);
    const weekFirst = new Date(wkStartDates[0]);

    const colStart = Math.round((dayIn.getTime() - weekFirst.getTime()) / 86400000);
    const colSpan = Math.max(1, Math.round((dayOut.getTime() - dayIn.getTime()) / 86400000));

    return { colStart: Math.max(0, colStart), colSpan: Math.min(7 - Math.max(0, colStart), colSpan) };
  };

  return (
    <div>
      {/* Stats header */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{activeStays.length}</span> séjours sur ce mois
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ fontWeight: 600, color: '#059669' }}>
            {activeStays.filter(s => s.status === 'confirmed' || s.status === 'paid').length}
          </span> confirmés
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#d97706' }}>
          {activeStays.reduce((sum, s) => sum + (s.priceConfirmed || s.priceQuoted || 0), 0).toLocaleString('fr-FR')}€
        </div>
      </div>

      <div style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)', overflow: 'hidden',
      }}>
        {/* Header row: week # + day names */}
        <div style={{ display: 'grid', gridTemplateColumns: '40px repeat(7, 1fr)', borderBottom: '2px solid var(--border-color)', background: 'var(--bg-surface-alt)' }}>
          <div style={{ padding: '8px 4px', textAlign: 'center', fontSize: 9, fontWeight: 600, color: 'var(--text-muted)' }}>Sem</div>
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((name, i) => (
            <div key={i} style={{
              padding: '8px 4px', textAlign: 'center', fontSize: 10, fontWeight: 600,
              color: i >= 5 ? 'var(--text-muted)' : 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              {name}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => {
          const today = new Date();
          return (
            <div key={wi} style={{
              display: 'grid', gridTemplateColumns: '40px repeat(7, 1fr)',
              borderBottom: wi < weeks.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            }}>
              {/* Week number cell */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700, color: 'var(--text-muted)',
                background: 'var(--bg-surface-alt)', borderRight: '1px solid var(--border-subtle)',
                padding: 2,
              }}>
                S{week.weekNum}
              </div>

              {/* Day cells + stay bars */}
              <div style={{ gridColumn: '2 / span 7', position: 'relative' }}>
                {/* Day cells background */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {week.days.map((day, di) => {
                    if (day === null) return <div key={`empty-${di}`} style={{ minHeight: 120, background: 'var(--bg-surface-alt)' }} />;
                    const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                    const isWeekend = di >= 5;
                    return (
                      <div key={day} style={{
                        minHeight: 120, padding: '24px 3px 3px',
                        borderRight: di < 6 ? '1px solid var(--border-subtle)' : 'none',
                        background: isToday ? 'var(--brand-dim)' : 'transparent',
                        position: 'relative',
                      }}>
                        <div style={{
                          position: 'absolute', top: 3, left: 3,
                          fontSize: 10, fontWeight: isToday ? 700 : 500,
                          color: isToday ? 'var(--brand)' : isWeekend ? 'var(--text-muted)' : 'var(--text-secondary)',
                          width: 20, height: 20, borderRadius: 4,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: isToday ? 'var(--brand)' : 'transparent',
                          color: isToday ? '#fff' : undefined,
                        }}>
                          {day}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Stay bars */}
                {stayRows.map((lane, li) => (
                  <div key={li} style={{
                    position: 'absolute', top: 0, left: 0, right: 0,
                    display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                    pointerEvents: 'none',
                  }}>
                    {week.days.map((day, di) => {
                      if (day === null) return <div key={`empty-${di}`} />;
                      const dateStr = getColForDay(day);
                      // Find stays that include this day
                      const staysHere = lane.filter(s => dateStr >= s.checkIn && dateStr < s.checkOut);
                      return (
                        <div key={day} style={{ position: 'relative', height: 24 * (li + 1) }}>
                          {staysHere.map(s => {
                            const isFirst = dateStr === s.checkIn;
                            const isLast = dateStr >= s.checkOut; // approximate

                            // Only render on the first day of each stay for simplicity per lane
                            if (dateStr !== s.checkIn) return null;

                            // Compute span
                            let span = 1;
                            for (let dd = 1; dd <= 7 - di; dd++) {
                              const nextDate = getColForDay(day + dd);
                              if (nextDate < s.checkOut) span = dd + 1;
                              else break;
                            }
                            // Limit to visible grid
                            span = Math.min(span, 7 - di);

                            const cfg = statusConfig[s.status] || statusConfig.pending;

                            return (
                              <div key={s.id} style={{
                                position: 'absolute', top: 24 * li, left: 0,
                                width: `${(span * 100)}%`, height: 20,
                                zIndex: 10, pointerEvents: 'auto', cursor: 'pointer',
                                padding: '0 2px',
                              }}
                                title={`${s.guestName} · ${s.checkIn} → ${s.checkOut}${s.priceConfirmed ? ` · ${s.priceConfirmed}€` : ''}`}
                              >
                                <div style={{
                                  display: 'flex', alignItems: 'center', gap: 4,
                                  padding: '2px 6px', borderRadius: 4, height: '100%',
                                  background: cfg.bg, borderLeft: `3px solid ${cfg.text}`,
                                  overflow: 'hidden', fontSize: 9, fontWeight: 600,
                                  color: 'var(--text-primary)', whiteSpace: 'nowrap',
                                }}>
                                  {span >= 2 && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.guestName}</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
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

  // Enrichir les stays avec le nom du contact
  const allStays = useMemo(() => {
    // D'abord via les stays intégrés aux contacts
    const fromContacts = contacts.flatMap(c =>
      c.stays.map(s => ({ ...s, guestName: c.name, contactEmail: c.email }))
    );
    // Ensuite via l'API stays (qui a contactName)
    const fromApi = rawStays.map(s => ({
      ...s,
      guestName: (s as any).contactName || 'Inconnu',
      contactEmail: (s as any).contactEmail || '',
    }));

    // Fusionner et dédupliquer par id
    const map = new Map<string, StayRecord & { guestName: string; contactEmail: string }>();
    for (const s of [...fromApi, ...fromContacts]) {
      if (!map.has(s.id)) map.set(s.id, s);
    }
    return Array.from(map.values());
  }, [contacts, rawStays]);

  const prevMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Calendrier des séjours</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {allStays.length} séjours · {allStays.filter(s => s.status === 'confirmed' || s.status === 'paid').length} confirmés
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', gap: 4, marginRight: 12 }}>
            <button
              onClick={() => setViewMode('month')}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: 'none',
                fontSize: 11,
                fontWeight: viewMode === 'month' ? 600 : 400,
                color: viewMode === 'month' ? 'var(--brand)' : 'var(--text-secondary)',
                background: viewMode === 'month' ? 'var(--brand-dim)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              Mois
            </button>
            <button
              onClick={() => setViewMode('season')}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: 'none',
                fontSize: 11,
                fontWeight: viewMode === 'season' ? 600 : 400,
                color: viewMode === 'season' ? 'var(--brand)' : 'var(--text-secondary)',
                background: viewMode === 'season' ? 'var(--brand-dim)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              Par saison
            </button>
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
            <SeasonView stays={allStays} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
        {Object.entries(statusConfig).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon size={12} color={cfg.text} />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{cfg.label}</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
