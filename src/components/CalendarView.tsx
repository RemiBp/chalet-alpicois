import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Users as UsersIcon } from 'lucide-react';
import { fetchContacts } from '../data';
import type { Contact, StayRecord } from '../types';

function getWeekDates(year: number, week: number): Date[] {
  const firstDay = new Date(year, 0, 1);
  const daysOffset = firstDay.getDay() === 0 ? -6 : 1 - firstDay.getDay();
  const startOfWeek1 = new Date(year, 0, 1 + daysOffset);
  const weekStart = new Date(startOfWeek1);
  weekStart.setDate(weekStart.getDate() + (week - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function CalendarView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const today = new Date();
  const [currentWeek, setCurrentWeek] = useState(getWeekNumber(today));
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  useEffect(() => {
    fetchContacts().then(setContacts);
  }, []);

  const days = useMemo(() => getWeekDates(currentYear, currentWeek), [currentYear, currentWeek]);

  const monthLabel = useMemo(() => {
    const months = [...new Set(days.map(d => d.getMonth()))];
    return months.map(m => monthNames[m]).join(' - ');
  }, [days]);

  const weekStays = useMemo(() => {
    const weekStart = new Date(days[0]);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(days[6]);
    weekEnd.setHours(23, 59, 59, 999);
    return contacts.flatMap(c =>
      c.stays.filter(s => {
        const checkIn = new Date(s.checkIn);
        const checkOut = new Date(s.checkOut);
        return checkIn <= weekEnd && checkOut >= weekStart;
      }).map(s => ({ ...s, guestName: c.name }))
    );
  }, [contacts, days]);

  function prevWeek() {
    if (currentWeek <= 1) {
      setCurrentYear(y => y - 1);
      setCurrentWeek(52);
    } else {
      setCurrentWeek(w => w - 1);
    }
  }

  function nextWeek() {
    if (currentWeek >= 52) {
      setCurrentYear(y => y + 1);
      setCurrentWeek(1);
    } else {
      setCurrentWeek(w => w + 1);
    }
  }

  const statusColors: Record<string, { bg: string; text: string }> = {
    confirmed: { bg: 'rgba(37, 99, 235, 0.12)', text: '#2563eb' },
    paid: { bg: 'rgba(22, 163, 74, 0.12)', text: '#16a34a' },
    pending: { bg: 'rgba(217, 119, 6, 0.12)', text: '#d97706' },
    cancelled: { bg: 'rgba(220, 38, 38, 0.10)', text: '#dc2626' },
    no_show: { bg: 'rgba(220, 38, 38, 0.10)', text: '#dc2626' },
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Calendrier</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {monthLabel} {currentYear}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={prevWeek} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', minWidth: 80, textAlign: 'center' }}>
            Semaine {currentWeek}
          </span>
          <button onClick={nextWeek} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Week grid */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border-color)' }}>
          {days.map((day, i) => {
            const isToday = day.toDateString() === today.toDateString();
            const isWeekend = i >= 5;
            return (
              <div key={i} style={{ padding: '12px 8px', textAlign: 'center', background: isToday ? 'var(--brand-dim)' : 'transparent', borderRight: i < 6 ? '1px solid var(--border-color)' : 'none' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>{dayNames[i]}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: isToday ? 'var(--brand)' : isWeekend ? 'var(--text-secondary)' : 'var(--text-primary)', fontFamily: 'var(--font-heading)', marginTop: 2 }}>{day.getDate()}</div>
              </div>
            );
          })}
        </div>

        {/* Stays */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minHeight: 300 }}>
          {days.map((day, i) => {
            const dayStr = day.toISOString().split('T')[0];
            const staysOnDay = weekStays.filter(s => {
              const checkIn = s.checkIn;
              const checkOut = s.checkOut;
              return dayStr >= checkIn && dayStr < checkOut;
            });

            return (
              <div key={i} style={{ padding: 8, borderRight: i < 6 ? '1px solid var(--border-subtle)' : 'none', borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'top' }}>
                {(staysOnDay as (StayRecord & { guestName: string })[]).map((stay, j) => {
                  const colors = statusColors[stay.status] || statusColors.pending;
                  const isFirstDay = dayStr === stay.checkIn;
                  return (
                    <div key={j} style={{ padding: '4px 6px', borderRadius: 6, background: colors.bg, borderLeft: `3px solid ${colors.text}`, marginBottom: 4, cursor: 'pointer', fontSize: 11 }}
                      title={`${stay.guestName} · ${stay.checkIn} → ${stay.checkOut} · ${stay.priceConfirmed || stay.priceQuoted}€`}>
                      <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.3 }}>{stay.guestName}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2, fontSize: 10, color: 'var(--text-secondary)' }}>
                        <UsersIcon size={10} />
                        <span>{stay.adults + stay.children} pers.</span>
                      </div>
                      {isFirstDay && (
                        <div style={{ fontWeight: 600, fontSize: 10, color: colors.text, marginTop: 2 }}>{stay.priceConfirmed || stay.priceQuoted}€</div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, justifyContent: 'center' }}>
        {Object.entries(statusColors).map(([key, colors]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: colors.text }} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {key === 'confirmed' ? 'Confirmé' : key === 'paid' ? 'Payé' : key === 'pending' ? 'En attente' : key === 'no_show' ? 'Absent' : 'Annulé'}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
