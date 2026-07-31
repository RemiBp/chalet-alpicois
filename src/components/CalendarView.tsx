import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Info, Lock, Clock, Users, LayoutGrid, List, RefreshCw, CheckCircle2, Loader2, UserPlus, Home, Mail, X, ExternalLink, Plus, Trash2, Save, Pencil } from 'lucide-react';
import { fetchCalendar, triggerDataRefresh, updateRequestedWeek, assignWeekToContact, fetchContacts, updateCalendarEvent, removeCalendarEvent } from '../data';
import type { CalendarEvent, CalendarWeek, StayProgress } from '../data';
import type { Contact } from '../types';
import { CHALET, formatPrice } from '../config/chalet';
import { displayContactName } from '../lib/formatName';
import { safeEmailBodyPreview } from '../lib/cleanEmailBody';
import { routes } from '../lib/routes';

const SEASON = '2026-2027';
const PERSONAL_CONTACT_ID = 'barbier-et-amis';
const WEEKDAYS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];

type ViewMode = 'weeks' | 'days';

function formatWeekRange(checkIn: string, checkOut: string) {
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  return `${a.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} → ${b.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function eventColor(status: string, blocked: boolean, personal?: boolean) {
  if (personal) {
    return { bg: 'rgba(107,114,128,0.12)', border: '#6b7280', text: '#4b5563' };
  }
  if (blocked || status === 'confirmed' || status === 'paid' || status === 'booked') {
    return { bg: 'rgba(220,38,38,0.12)', border: '#dc2626', text: '#b91c1c' };
  }
  if (status === 'negotiating' || status === 'pending') {
    return { bg: 'rgba(217,119,6,0.12)', border: '#d97706', text: '#b45309' };
  }
  return { bg: 'rgba(37,99,235,0.1)', border: '#2563eb', text: '#1d4ed8' };
}

function isoAddDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function eventsForDay(dayIso: string, events: CalendarEvent[]) {
  const next = isoAddDays(dayIso, 1);
  return events.filter(e => e.checkIn < next && e.checkOut > dayIso);
}

function buildDayGrid(weeks: CalendarWeek[], events: CalendarEvent[]) {
  if (!weeks.length) return [];
  const start = weeks[0].checkIn;
  const end = weeks[weeks.length - 1].checkOut;
  const months: { key: string; label: string; cells: Array<{ day: number | null; iso?: string; events: CalendarEvent[]; blocked: boolean }> }[] = [];

  let cursor = new Date(start);
  const endDate = new Date(end);

  while (cursor < endDate) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const key = `${y}-${m}`;
    const label = cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const firstOfMonth = new Date(y, m, 1);
    const lastOfMonth = new Date(y, m + 1, 0);
    const monthStart = cursor > firstOfMonth ? new Date(cursor) : firstOfMonth;
    const monthEnd = endDate < lastOfMonth ? endDate : new Date(lastOfMonth.getTime() + 86400000);

    const weekdayOffset = (firstOfMonth.getDay() + 6) % 7;
    const cells: typeof months[0]['cells'] = [];
    for (let i = 0; i < weekdayOffset; i++) cells.push({ day: null, events: [], blocked: false });

    const d = new Date(monthStart);
    while (d < monthEnd && d.getMonth() === m) {
      const iso = d.toISOString().slice(0, 10);
      const dayEvents = eventsForDay(iso, events);
      cells.push({
        day: d.getDate(),
        iso,
        events: dayEvents,
        blocked: dayEvents.some(e => e.blocksCalendar),
      });
      d.setDate(d.getDate() + 1);
    }
    while (cells.length % 7 !== 0) cells.push({ day: null, events: [], blocked: false });

    months.push({ key, label, cells });
    cursor = new Date(y, m + 1, 1);
  }

  return months;
}

function fmtMailDate(iso: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

const PROGRESS_STEPS: { key: keyof StayProgress; label: string; short: string }[] = [
  { key: 'contractNumber', label: 'N° contrat', short: 'Contrat' },
  { key: 'contractSigned', label: 'Contrat signé', short: 'Signé' },
  { key: 'depositInvoiceNumber', label: 'N° facture acompte', short: 'Fact. ac.' },
  { key: 'depositAmount', label: 'Acompte', short: 'Acompte' },
  { key: 'depositPaid', label: 'Paiement acompte', short: 'Payé' },
  { key: 'balanceInvoiceNumber', label: 'Facture solde', short: 'Fact. solde' },
  { key: 'balancePaid', label: 'Solde payé', short: 'Solde' },
  { key: 'insuranceReceived', label: 'Assurance', short: 'Assur.' },
  { key: 'idReceived', label: "Pièce d'identité", short: 'ID' },
  { key: 'depositGuaranteePaid', label: 'Caution reçue', short: 'Caution' },
  { key: 'depositGuaranteeReturned', label: 'Caution rendue', short: 'Rendue' },
];

function progressStepOk(p: StayProgress, key: keyof StayProgress) {
  if (key === 'depositAmount' || key === 'balanceAmount') return Number(p[key]) > 0;
  if (key === 'contractNumber' || key === 'depositInvoiceNumber' || key === 'balanceInvoiceNumber') return Boolean(p[key]);
  if (typeof p[key] === 'boolean') return p[key] === true;
  return Boolean(p[key]);
}

function ProgressChips({ progress }: { progress: StayProgress }) {
  const allOk = PROGRESS_STEPS.every(s => progressStepOk(progress, s.key));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
      {PROGRESS_STEPS.map(step => {
        const ok = progressStepOk(progress, step.key);
        return (
          <span key={step.key} title={step.label} style={{
            fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 6,
            background: ok ? 'rgba(5,150,105,0.15)' : 'rgba(217,119,6,0.12)',
            color: ok ? '#059669' : '#b45309',
            border: `1px solid ${ok ? 'rgba(5,150,105,0.35)' : 'rgba(217,119,6,0.35)'}`,
          }}>
            {step.short}{ok ? ' ✓' : ''}
          </span>
        );
      })}
      {allOk && (
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
          background: '#059669', color: 'white', display: 'flex', alignItems: 'center', gap: 3,
        }}>
          <CheckCircle2 size={10} /> Complet
        </span>
      )}
    </div>
  );
}

export default function CalendarView({ isAdmin = false }: {
  isAdmin?: boolean;
}) {
  const navigate = useNavigate();
  const [calendar, setCalendar] = useState<Awaited<ReturnType<typeof fetchCalendar>>>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('weeks');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<CalendarWeek | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [assignContactId, setAssignContactId] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [assignStatus, setAssignStatus] = useState<'booked' | 'negotiating' | 'asked'>('booked');
  const [assignPrice, setAssignPrice] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const eventDetailRef = useRef<HTMLDivElement>(null);

  const reloadCalendar = () => fetchCalendar(SEASON, false).then(setCalendar);

  useEffect(() => {
    reloadCalendar().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isAdmin) fetchContacts().then(setContacts).catch(() => {});
  }, [isAdmin]);

  async function handleSync() {
    if (!isAdmin) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const report = await triggerDataRefresh(false);
      await reloadCalendar();
      setSyncMsg(`Sync OK — ${report.imap?.totalSynced ?? 0} mails, ${report.profiles?.filledNationality ?? 0} nationalités`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Erreur sync');
    } finally {
      setSyncing(false);
    }
  }

  async function confirmEvent(ev: CalendarEvent) {
    if (!isAdmin || !ev.id.startsWith('week-')) return;
    const weekId = ev.id.replace(/^week-/, '');
    setActionBusy(true);
    try {
      await updateRequestedWeek(weekId, { status: 'booked' });
      await reloadCalendar();
      setSyncMsg(`${ev.contactName} confirmé(e) — semaine bloquée`);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Erreur confirmation');
    } finally {
      setActionBusy(false);
    }
  }

  async function assignWeek() {
    if (!isAdmin || !selectedWeek || !assignContactId) return;
    setActionBusy(true);
    try {
      await assignWeekToContact({
        contactId: assignContactId,
        checkIn: selectedWeek.checkIn,
        checkOut: selectedWeek.checkOut,
        status: assignStatus,
        notes: assignContactId === PERSONAL_CONTACT_ID ? 'Semaine personnelle' : 'Assigné depuis le calendrier',
        price: assignPrice ? Number(assignPrice) : undefined,
      });
      await reloadCalendar();
      setSyncMsg(assignContactId === PERSONAL_CONTACT_ID ? 'Semaine personnelle enregistrée (0 €)' : 'Semaine enregistrée');
      setAssignContactId('');
      setAssignPrice('');
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Erreur assignation');
    } finally {
      setActionBusy(false);
    }
  }

  async function assignPersonalWeek() {
    if (!isAdmin || !selectedWeek) return;
    setActionBusy(true);
    try {
      await assignWeekToContact({
        contactId: PERSONAL_CONTACT_ID,
        checkIn: selectedWeek.checkIn,
        checkOut: selectedWeek.checkOut,
        status: 'booked',
        notes: 'Semaine personnelle',
        price: 0,
      });
      await reloadCalendar();
      setSyncMsg('Semaine personnelle enregistrée (0 €)');
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Erreur assignation');
    } finally {
      setActionBusy(false);
    }
  }

  useEffect(() => {
    if (!selectedEvent) return;
    setEditStatus(selectedEvent.status);
    setEditPrice(selectedEvent.price ? String(selectedEvent.price) : '');
    requestAnimationFrame(() => {
      eventDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [selectedEvent]);

  function selectEvent(ev: CalendarEvent | null) {
    setSelectedEvent(ev);
    if (ev) setSelectedWeek(null);
  }

  function renderEventDetailPanel(ev: CalendarEvent) {
    return (
      <div
        ref={selectedEvent?.id === ev.id ? eventDetailRef : undefined}
        style={{
          marginTop: -4, marginBottom: 4, padding: 14, borderRadius: '0 0 10px 10px',
          border: '1px solid var(--brand)', borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{ev.contactName} — {ev.label}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {formatWeekRange(ev.checkIn, ev.checkOut)}
              {ev.price ? ` · ${formatPrice(ev.price)}` : ev.progress?.weekPrice ? ` · ${formatPrice(ev.progress.weekPrice)}` : ''}
            </div>
          </div>
          <button type="button" onClick={() => selectEvent(null)}
            style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-body)', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>

        {ev.progress && ev.blocksCalendar && !ev.personal && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
            Suivi administratif (Excel)
            </div>
            <ProgressChips progress={ev.progress} />
            {ev.progress.mailSteps && Object.keys(ev.progress.mailSteps).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {Object.entries(ev.progress.mailSteps).map(([key, status]) => (
                  <span key={key} style={{ fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 6, background: 'rgba(37,99,235,0.1)', color: '#1d4ed8' }}>
                    {key} · {status}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {ev.confirmationEmail ? (
          <div style={{ borderRadius: 10, border: '1px solid var(--border-color)', overflow: 'hidden', background: 'var(--bg-surface)' }}>
            <div style={{
              padding: '12px 14px',
              background: 'linear-gradient(180deg, rgba(13,148,136,0.08), var(--bg-body))',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <Mail size={15} color="var(--brand)" />
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--brand)', textTransform: 'uppercase' }}>Mail de preuve</span>
                    {ev.confirmationEmail.signalLabel && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: '#1d4ed8',
                        background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.18)',
                        borderRadius: 999, padding: '2px 7px',
                      }}>
                        {ev.confirmationEmail.signalLabel}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 750, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                    {ev.confirmationEmail.subject || '(Sans sujet)'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
                    {ev.confirmationEmail.senderName || 'Expéditeur inconnu'} · {fmtMailDate(ev.confirmationEmail.date)}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                Extrait nettoyé
              </div>
              <div style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'var(--bg-body)',
                border: '1px solid var(--border-subtle)',
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                maxHeight: 260,
                overflowY: 'auto',
                color: 'var(--text-secondary)',
              }}>
                {safeEmailBodyPreview(ev.confirmationEmail.bodyText || ev.confirmationEmail.bodyPreview || '', 2000)}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  Cette preuve alimente le statut calendrier et le suivi administratif.
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
            Aucun mail de confirmation identifié — vérifiez la fiche client.
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {!ev.personal && (
            <button type="button" onClick={() => navigate(routes.client(ev.contactId))}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8,
                border: 'none', background: 'var(--brand)', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}>
              <ExternalLink size={12} /> Voir fiche client
            </button>
          )}
          {isAdmin && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', width: '100%', marginTop: 4 }}>
              <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 11 }}>
                <option value="confirmed">Confirmé</option>
                <option value="paid">Payé</option>
                <option value="pending">En cours</option>
                <option value="negotiating">Fin de négociation</option>
                <option value="asked">Fin de négociation</option>
                <option value="booked">Réservé</option>
                <option value="abandoned">Annulé / libérer</option>
              </select>
              {!ev.personal && (
                <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)}
                  placeholder="Prix €" style={{ width: 90, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 11 }} />
              )}
              <button type="button" disabled={actionBusy || selectedEvent?.id !== ev.id} onClick={saveEventAdmin}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                <Save size={12} /> Enregistrer
              </button>
              <button type="button" disabled={actionBusy || selectedEvent?.id !== ev.id} onClick={freeEvent}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, border: '1px solid #dc2626', background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                <Trash2 size={12} /> Libérer
              </button>
            </div>
          )}
          {isAdmin && ev.id.startsWith('week-') && ev.status !== 'booked' && (
            <button type="button" disabled={actionBusy || selectedEvent?.id !== ev.id} onClick={() => confirmEvent(ev)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', borderRadius: 8,
                border: 'none', background: '#dc2626', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}>
              <CheckCircle2 size={12} /> Confirmer réservation
            </button>
          )}
        </div>
      </div>
    );
  }

  async function saveEventAdmin() {
    if (!isAdmin || !selectedEvent) return;
    setActionBusy(true);
    try {
      await updateCalendarEvent(selectedEvent.id, {
        status: editStatus,
        price: editPrice ? Number(editPrice) : undefined,
      });
      await reloadCalendar();
      setSyncMsg('Semaine mise à jour');
      selectEvent(null);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Erreur mise à jour');
    } finally {
      setActionBusy(false);
    }
  }

  async function freeEvent() {
    if (!isAdmin || !selectedEvent) return;
    if (!confirm('Libérer cette semaine ? La réservation sera annulée.')) return;
    setActionBusy(true);
    try {
      await removeCalendarEvent(selectedEvent.id);
      await reloadCalendar();
      setSyncMsg('Semaine libérée');
      selectEvent(null);
      setSelectedWeek(null);
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Erreur suppression');
    } finally {
      setActionBusy(false);
    }
  }

  const currentSeason = CHALET.seasons.find(s => s.season === SEASON) || CHALET.seasons[CHALET.seasons.length - 1];
  const weeks = useMemo(() => calendar?.weeks || [], [calendar?.weeks]);
  const events = useMemo(() => calendar?.events || [], [calendar?.events]);
  const stats = calendar?.stats;
  const dayGrid = useMemo(() => buildDayGrid(weeks, events), [weeks, events]);
  const selectedDayEvents = selectedDay ? eventsForDay(selectedDay, events) : [];

  function renderWeekManagementPanel(week: CalendarWeek) {
    return (
      <div style={{ marginTop: -4, marginBottom: 4, padding: 16, borderRadius: '0 0 10px 10px', border: '1px solid var(--brand)', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Plus size={16} color="var(--brand)" />
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            Gestion — {formatWeekRange(week.checkIn, week.checkOut)}
          </div>
        </div>

        {week.events.length > 0 && (
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            {week.blocked ? 'Semaine bloquée' : 'Événements en cours'} — cliquez un nom ci-dessus pour modifier.
          </p>
        )}

        {(!week.blocked || week.events.every(e => !e.blocksCalendar)) && (
          <div style={{ borderTop: week.events.length ? '1px solid var(--border-subtle)' : 'none', paddingTop: week.events.length ? 12 : 0 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
              {week.events.length === 0 ? 'Semaine libre — ajouter :' : 'Ajouter une réservation :'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <button type="button" disabled={actionBusy} onClick={assignPersonalWeek}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', borderRadius: 8, border: '1px solid #6b7280', background: 'rgba(107,114,128,0.08)', color: '#4b5563', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                <Home size={12} /> Barbier et amis (0 €)
              </button>
            </div>
            <div className="calendar-assign-row">
              <select value={assignContactId} onChange={e => setAssignContactId(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12 }}>
                <option value="">Choisir un client…</option>
                {contacts.filter(c =>
                  !c.isPersonal
                  && c.id !== PERSONAL_CONTACT_ID
                  && !String(c.email || '').toLowerCase().endsWith('@test.local')
                ).map(c => (
                  <option key={c.id} value={c.id}>{displayContactName(c)} ({c.email})</option>
                ))}
              </select>
              <select value={assignStatus} onChange={e => setAssignStatus(e.target.value as typeof assignStatus)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 11 }}>
                <option value="booked">Confirmé (bloque)</option>
                <option value="negotiating">Fin de négociation</option>
                <option value="asked">Fin de négociation</option>
              </select>
              <input type="number" value={assignPrice} onChange={e => setAssignPrice(e.target.value)}
                placeholder="Prix €" style={{ width: '100%', minWidth: 80, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 11 }} />
              <button type="button" disabled={!assignContactId || actionBusy} onClick={assignWeek}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 12px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <UserPlus size={12} /> Ajouter
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarDays size={22} color="var(--brand)" />
            Calendrier — {SEASON}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5, maxWidth: 520 }}>
            Semaines dimanche → dimanche. Les dates confirmées (contrat / acompte) bloquent le calendrier.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {isAdmin && (
            <button type="button" onClick={handleSync} disabled={syncing}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: '1px solid var(--brand-border)', background: 'var(--brand-dim)', color: 'var(--brand)',
              }}>
              {syncing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
              Resynchroniser
            </button>
          )}
          <button type="button" onClick={() => { setViewMode('weeks'); setSelectedDay(null); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${viewMode === 'weeks' ? 'var(--brand)' : 'var(--border-color)'}`,
              background: viewMode === 'weeks' ? 'var(--brand-dim)' : 'var(--bg-surface)',
              color: viewMode === 'weeks' ? 'var(--brand)' : 'var(--text-secondary)',
            }}>
            <List size={14} /> Semaines
          </button>
          <button type="button" onClick={() => setViewMode('days')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${viewMode === 'days' ? 'var(--brand)' : 'var(--border-color)'}`,
              background: viewMode === 'days' ? 'var(--brand-dim)' : 'var(--bg-surface)',
              color: viewMode === 'days' ? 'var(--brand)' : 'var(--text-secondary)',
            }}>
            <LayoutGrid size={14} /> Jours
          </button>
        </div>
      </div>

      {syncMsg && (
        <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 8, fontSize: 11, background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
          {syncMsg}
        </div>
      )}

      {isAdmin && (
        <div style={{
          marginBottom: 16, padding: '12px 14px', borderRadius: 10,
          background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <Pencil size={14} color="#d97706" />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#b45309' }}>Mode admin calendrier</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Cliquez une semaine pour ajouter · Cliquez un nom confirmé pour voir le mail de preuve
          </span>
        </div>
      )}

      {stats && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Confirmées', value: stats.confirmed, color: '#dc2626', icon: Lock },
            { label: 'Perso', value: stats.personal ?? 0, color: '#6b7280', icon: Home },
            { label: 'En cours', value: stats.negotiating, color: '#d97706', icon: Clock },
            { label: 'À qualifier', value: stats.inquiries, color: '#d97706', icon: Users },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} style={{
              flex: '1 1 120px', padding: '12px 14px', borderRadius: 10,
              border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
            }}>
              <Icon size={14} color={color} style={{ marginBottom: 6 }} />
              <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargement du calendrier…</p>
      )}

      {viewMode === 'weeks' && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
          {weeks.map((week: CalendarWeek) => {
            const hasEvents = week.events.length > 0;
            const isSelected = selectedWeek?.checkIn === week.checkIn;
            const openEvent = selectedEvent && week.events.some(e => e.id === selectedEvent.id) ? selectedEvent : null;
            return (
              <div key={week.checkIn}>
              <button
                type="button"
                onClick={() => { setSelectedWeek(isSelected ? null : week); if (!isSelected) selectEvent(null); }}
                style={{
                  display: 'flex', gap: 12, alignItems: 'stretch', width: '100%', textAlign: 'left',
                  padding: '10px 14px', borderRadius: (isSelected && isAdmin) || openEvent ? '10px 10px 0 0' : 10, cursor: 'pointer',
                  border: `1px solid ${isSelected || openEvent ? 'var(--brand)' : week.blocked ? 'rgba(220,38,38,0.35)' : 'var(--border-color)'}`,
                  borderBottom: (isSelected && isAdmin) || openEvent ? 'none' : undefined,
                  background: isSelected || openEvent ? 'var(--brand-dim)' : week.blocked ? 'rgba(220,38,38,0.04)' : hasEvents ? 'var(--bg-surface)' : 'transparent',
                  opacity: hasEvents || isSelected || openEvent ? 1 : 0.55,
                }}
              >
                <div style={{ minWidth: 140, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', paddingTop: 4 }}>
                  {formatWeekRange(week.checkIn, week.checkOut)}
                  {week.blocked && (
                    <div style={{ fontSize: 9, color: '#dc2626', marginTop: 4, fontWeight: 700 }}>BLOQUÉ</div>
                  )}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {week.events.length === 0 ? (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Libre{week.weekPrice ? ` · ${formatPrice(week.weekPrice)}` : ''}
                    </span>
                  ) : week.events.map(ev => {
                    const c = eventColor(ev.status, ev.blocksCalendar, ev.personal);
                    const isEvSelected = selectedEvent?.id === ev.id;
                    return (
                      <div
                        key={ev.id}
                        role="button"
                        tabIndex={0}
                        onClick={e => { e.stopPropagation(); selectEvent(isEvSelected ? null : ev); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); selectEvent(isEvSelected ? null : ev); } }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                          background: c.bg, border: `1px solid ${isEvSelected ? 'var(--brand)' : c.border}`,
                          boxShadow: isEvSelected ? '0 0 0 2px var(--brand-dim)' : 'none',
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 600, color: c.text, flex: 1 }}>{ev.contactName}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: c.text }}>{ev.label}</span>
                        {ev.progress?.complete && <CheckCircle2 size={12} color="#059669" />}
                        {ev.progress && !ev.progress.complete && ev.blocksCalendar && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#d97706' }}>{ev.progress.filledCount}/{ev.progress.requiredCount}</span>
                        )}
                        {ev.confirmationEmail && <Mail size={11} color={c.text} />}
                      </div>
                    );
                  })}
                </div>
              </button>
              {openEvent && renderEventDetailPanel(openEvent)}
              {isSelected && isAdmin && renderWeekManagementPanel(week)}
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'days' && !loading && (
        <div style={{ marginBottom: 28 }}>
          {dayGrid.map(month => (
            <div key={month.key} style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: 'capitalize' }}>{month.label}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                {WEEKDAYS.map(wd => (
                  <div key={wd} style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center', padding: 4 }}>{wd}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {month.cells.map((cell, i) => {
                  if (cell.day == null) {
                    return <div key={`empty-${month.key}-${i}`} style={{ minHeight: 44 }} />;
                  }
                  const hasEvents = cell.events.length > 0;
                  const isSelected = selectedDay === cell.iso;
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      onClick={() => setSelectedDay(cell.iso === selectedDay ? null : cell.iso!)}
                      style={{
                        minHeight: 44, padding: 4, borderRadius: 8, border: `1px solid ${isSelected ? 'var(--brand)' : cell.blocked ? 'rgba(220,38,38,0.4)' : hasEvents ? 'rgba(37,99,235,0.25)' : 'var(--border-subtle)'}`,
                        background: cell.blocked ? 'rgba(220,38,38,0.12)' : hasEvents ? 'rgba(37,99,235,0.06)' : 'var(--bg-surface)',
                        cursor: 'pointer', textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: cell.blocked ? '#b91c1c' : 'var(--text-primary)' }}>{cell.day}</div>
                      {hasEvents && (
                        <div style={{ fontSize: 8, color: cell.blocked ? '#dc2626' : '#2563eb', marginTop: 2 }}>
                          {cell.events.length} loc.
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {selectedDay && (
            <div style={{
              marginTop: 8, padding: 14, borderRadius: 10,
              border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                {new Date(selectedDay).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              {selectedDayEvents.length === 0 ? (
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Journée libre</p>
              ) : selectedDayEvents.map(ev => {
                const c = eventColor(ev.status, ev.blocksCalendar, ev.personal);
                const isEvSelected = selectedEvent?.id === ev.id;
                return (
                  <div
                    key={ev.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectEvent(isEvSelected ? null : ev)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                      padding: '8px 10px', borderRadius: 8, background: c.bg,
                      border: `1px solid ${isEvSelected ? 'var(--brand)' : c.border}`,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, color: c.text, flex: 1 }}>{ev.contactName}</span>
                    <span style={{ fontSize: 10, color: c.text }}>{ev.label}</span>
                    {ev.confirmationEmail && <Mail size={11} color={c.text} />}
                  </div>
                );
              })}
              {selectedEvent && selectedDayEvents.some(e => e.id === selectedEvent.id) && (
                <div style={{ marginTop: 10 }}>{renderEventDetailPanel(selectedEvent)}</div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-color)', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Info size={16} color="var(--brand)" />
          <h2 style={{ fontSize: 14, fontWeight: 700 }}>Tarifs indicatifs — {currentSeason.label}</h2>
        </div>
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
              <div style={{ fontSize: 13, fontWeight: 700, color }}>{formatPrice(data.typical)}</div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
