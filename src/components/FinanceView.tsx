import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Euro, TrendingUp, Wallet, CalendarDays, RefreshCw, Loader2,
  Users, BarChart3, Save, Pencil, Trash2,
} from 'lucide-react';
import { fetchFinanceSummary, updateCalendarEvent, removeCalendarEvent, fetchDoubts, reconcileBookingsAi, type FinanceSummary, type FinanceLine } from '../data';
import { formatPrice } from '../config/chalet';
import { routes } from '../lib/routes';

const SEASON = '2026-2027';

type Filter = 'all' | 'collected' | 'confirmed' | 'forecast' | 'personal';

const STATUS_FOR_CATEGORY: Record<string, string> = {
  collected: 'paid',
  confirmed: 'confirmed',
  forecast: 'negotiating',
};

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function fmtWeekRange(checkIn: string, checkOut: string) {
  return `${fmtDate(checkIn)} → ${fmtDate(checkOut)}`;
}

const FILTER_LABELS: Record<Filter, string> = {
  all: 'Tout',
  collected: 'Encaissé',
  confirmed: 'Confirmé',
  forecast: 'Prévisionnel',
  personal: 'Perso',
};

const CATEGORY_STYLE: Record<string, { bg: string; color: string }> = {
  collected: { bg: 'rgba(5,150,105,0.12)', color: '#059669' },
  confirmed: { bg: 'rgba(37,99,235,0.1)', color: '#2563eb' },
  forecast: { bg: 'rgba(217,119,6,0.1)', color: '#d97706' },
  personal: { bg: 'rgba(107,114,128,0.12)', color: '#6b7280' },
};

export default function FinanceView({
  isAdmin = false,
}: {
  isAdmin?: boolean;
}) {
  const navigate = useNavigate();

  const [data, setData] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [editDraft, setEditDraft] = useState<Record<string, { amount: string; category: FinanceLine['category'] }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [doubts, setDoubts] = useState<{ count: number; estimatedLines: { contactName: string; amount: number; message: string }[]; aiIssues: { contactName: string; message: string }[] } | null>(null);

  const reload = () => {
    setLoading(true);
    fetchFinanceSummary(SEASON)
      .then(d => {
        setData(d);
        setEditDraft({});
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchDoubts(SEASON).then(setDoubts).catch(() => setDoubts(null));
    } else {
      setDoubts(null);
    }
  }, [isAdmin, data]);

  const filteredLines = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data.lines;
    return data.lines.filter(l => l.category === filter);
  }, [data, filter]);

  const grouped = useMemo(() => {
    const groups = new Map<string, FinanceLine[]>();
    for (const line of filteredLines) {
      const key = line.checkIn?.slice(0, 7) || 'unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(line);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredLines]);

  const weekStats = data?.byCategoryWeeks;

  const kpis = data ? [
    { icon: Wallet, label: 'Encaissé', value: data.collected, color: '#059669', weeks: weekStats?.collected ?? 0 },
    { icon: Euro, label: 'À encaisser', value: data.confirmedPending, color: '#2563eb', weeks: weekStats?.confirmed ?? 0 },
    { icon: TrendingUp, label: 'Prévisionnel', value: data.forecast, color: '#d97706', weeks: weekStats?.forecast ?? 0 },
    { icon: CalendarDays, label: 'Potentiel', value: data.totalPotential, color: '#7c3aed', weeks: weekStats?.totalClient ?? data.clientWeeks },
  ] : [];

  function draftFor(line: FinanceLine) {
    return editDraft[line.id] ?? {
      amount: line.personal ? '0' : String(line.amount || ''),
      category: line.category,
    };
  }

  function patchDraft(line: FinanceLine, patch: Partial<{ amount: string; category: FinanceLine['category'] }>) {
    setEditDraft(prev => ({
      ...prev,
      [line.id]: { ...draftFor(line), ...patch },
    }));
  }

  async function saveLine(line: FinanceLine) {
    if (!isAdmin || line.personal) return;
    const draft = draftFor(line);
    setSavingId(line.id);
    setMsg(null);
    try {
      const status = STATUS_FOR_CATEGORY[draft.category] || line.status;
      await updateCalendarEvent(line.id, {
        status,
        price: draft.amount ? Number(draft.amount) : undefined,
      });
      setMsg('Montant enregistré — calendrier et finance mis à jour.');
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erreur enregistrement');
    } finally {
      setSavingId(null);
    }
  }

  async function removeLine(line: FinanceLine) {
    if (!isAdmin || !confirm(`Supprimer la semaine de ${line.contactName} ?`)) return;
    setSavingId(line.id);
    try {
      await removeCalendarEvent(line.id);
      setMsg('Semaine retirée.');
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erreur suppression');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}
    >
      <div className="dashboard-greeting dashboard-greeting--top" style={{ marginBottom: 20 }}>
        <h2>Hello Gilles et Claire !</h2>
        <p>Bienvenue sur votre tableau de bord Alpicois — saison 2026-2027.</p>
      </div>

      <div style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Euro size={22} color="var(--brand)" />
            Finance — {SEASON}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, maxWidth: 560, lineHeight: 1.5 }}>
            Encaissements, contrats confirmés et pipeline — hors semaines Barbier et amis.
            {isAdmin && ' Mode admin : modifiez montants et statuts ci-dessous.'}
          </p>
        </div>
        <button type="button" onClick={reload} disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
            border: '1px solid var(--border-color)', background: 'var(--bg-surface)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
          {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
          Actualiser
        </button>
      </div>

      {msg && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-color)' }}>
          {msg}
        </div>
      )}

      {isAdmin && (
        <>
          <div style={{
            marginBottom: 10, padding: '10px 14px', borderRadius: 8, fontSize: 11,
            background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', color: '#b45309',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Pencil size={14} />
            Les modifications mettent à jour les séjours en base — visibles dans Calendrier, Finance et Documents.
          </div>
          {data && data.lines.filter(l => l.estimatedAmount).length > 0 && (
            <div style={{
              marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 11,
              background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)', color: '#1d4ed8',
            }}>
              {data.lines.filter(l => l.estimatedAmount).length} montant(s) estimé(s) — saisissez le prix réel pour remplacer le tarif indicatif.
            </div>
          )}
        </>
      )}

      {isAdmin && doubts && doubts.count > 0 && (
        <div style={{
          marginBottom: 16, padding: '12px 14px', borderRadius: 8, fontSize: 11,
          background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', color: '#92400e',
        }}>
          <strong>{doubts.count} point{doubts.count > 1 ? 's' : ''} à vérifier</strong>
          <ul style={{ margin: '8px 0 0 16px', padding: 0, lineHeight: 1.5 }}>
            {doubts.estimatedLines.slice(0, 4).map((l, i) => (
              <li key={`est-${i}-${l.contactName}`}>{l.contactName} — {l.message}</li>
            ))}
            {doubts.aiIssues.slice(0, 3).map((l, i) => (
              <li key={`ai-${i}-${l.contactName}`}>{l.contactName} — {l.message}</li>
            ))}
          </ul>
          <p style={{ margin: '8px 0 0', fontSize: 10, opacity: 0.9 }}>
            Mode admin : cliquez sur une ligne pour corriger le montant · Paramètres → « Corriger avec IA » pour les dates · resync mails pour l’encodage.
          </p>
          {doubts.aiIssues.length > 0 && (
            <button type="button" style={{ marginTop: 10, fontSize: 11, fontWeight: 600, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={async () => {
                if (!confirm('Appliquer les corrections IA (confiance haute) ?')) return;
                try {
                  await reconcileBookingsAi(false);
                  setMsg('Corrections IA appliquées.');
                  reload();
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : 'Erreur IA');
                }
              }}>
              Corriger automatiquement (IA) →
            </button>
          )}
        </div>
      )}

      {loading && !data && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Chargement…</p>
      )}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            {kpis.map(({ icon: Icon, label, value, color, weeks }) => (
              <div key={label} style={{
                padding: 16, borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
              }}>
                <Icon size={18} color={color} style={{ marginBottom: 8 }} />
                <div style={{ fontSize: 22, fontWeight: 700 }}>{formatPrice(value)}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 4 }}>{label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  {weeks} semaine{weeks > 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            padding: 16, borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <BarChart3 size={16} color="var(--brand)" />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Occupation saison</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>{data.occupancyRate} %</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: 'var(--bg-body)', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${data.occupancyRate}%`, background: '#2563eb', transition: 'width 0.3s' }} />
              {data.personalWeeks > 0 && (
                <div style={{ width: `${Math.round((data.personalWeeks / data.totalSeasonWeeks) * 100)}%`, background: '#9ca3af' }} />
              )}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-secondary)' }}>
              <span><strong>{data.bookedWeeks}</strong> sem. clients</span>
              <span><strong>{data.personalWeeks}</strong> perso</span>
              <span><strong>{data.freeWeeks}</strong> libres</span>
              <span><strong>{data.totalSeasonWeeks}</strong> total</span>
              <button type="button" onClick={() => navigate(routes.calendar)}
                style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Voir calendrier →
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {(Object.keys(FILTER_LABELS) as Filter[]).map(f => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                style={{
                  padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: filter === f ? '1px solid var(--brand-border)' : '1px solid var(--border-color)',
                  background: filter === f ? 'var(--brand-dim)' : 'var(--bg-surface)',
                  color: filter === f ? 'var(--brand)' : 'var(--text-secondary)',
                }}>
                {FILTER_LABELS[f]}
                {f !== 'all' && weekStats && (
                  <span style={{ marginLeft: 4, opacity: 0.7 }}>
                    ({f === 'collected' ? weekStats.collected : f === 'confirmed' ? weekStats.confirmed : f === 'forecast' ? weekStats.forecast : f === 'personal' ? weekStats.personal : 0})
                  </span>
                )}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {grouped.map(([monthKey, lines]) => {
              const monthLabel = monthKey !== 'unknown'
                ? new Date(`${monthKey}-01`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                : 'Sans date';
              const monthTotal = lines.filter(l => !l.personal).reduce((s, l) => {
                const d = draftFor(l);
                return s + (Number(d.amount) || l.amount || 0);
              }, 0);
              const monthWeeks = lines.filter(l => !l.personal).reduce((s, l) => s + (l.weekCount || 1), 0);
              return (
                <div key={monthKey} style={{ background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                  <div style={{
                    padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{monthLabel}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {monthWeeks} sem.
                      {monthTotal > 0 && <> · <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{formatPrice(monthTotal)}</span></>}
                    </span>
                  </div>
                  {lines.map(line => {
                    const style = CATEGORY_STYLE[line.category] || CATEGORY_STYLE.forecast;
                    const draft = draftFor(line);
                    const dirty = editDraft[line.id] != null;
                    return (
                      <div key={line.id} style={{
                        display: 'grid',
                        gridTemplateColumns: isAdmin && !line.personal ? '1fr auto auto auto' : '1fr auto auto',
                        gap: 12, alignItems: 'center',
                        padding: '12px 16px', borderTop: '1px solid var(--border-subtle)',
                      }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{line.contactName}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{fmtWeekRange(line.checkIn, line.checkOut)}</div>
                        </div>

                        {isAdmin && !line.personal ? (
                          <select
                            value={draft.category}
                            onChange={e => patchDraft(line, { category: e.target.value as FinanceLine['category'] })}
                            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 10 }}
                          >
                            <option value="collected">Encaissé</option>
                            <option value="confirmed">Confirmé</option>
                            <option value="forecast">Prévisionnel</option>
                          </select>
                        ) : (
                          <span style={{
                            padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                            background: style.bg, color: style.color,
                          }}>
                            {line.label}
                          </span>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', minWidth: isAdmin ? 140 : 120 }}>
                          {isAdmin && !line.personal ? (
                            <input
                              type="number"
                              value={draft.amount}
                              onChange={e => patchDraft(line, { amount: e.target.value })}
                              style={{ width: 72, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color)', fontSize: 11, textAlign: 'right' }}
                            />
                          ) : (
                            <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>
                              {line.personal ? '—' : (
                                <>
                                  {formatPrice(line.amount)}
                                  {line.estimatedAmount && <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 2 }}>est.</span>}
                                  {(line as { weekCount?: number }).weekCount && (line as { weekCount?: number }).weekCount! > 1 && (
                                    <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 }}>
                                      ({(line as { weekCount?: number }).weekCount} sem.)
                                    </span>
                                  )}
                                </>
                              )}
                            </span>
                          )}
                          {isAdmin && !line.personal && (
                            <>
                              <button type="button" disabled={savingId === line.id} onClick={() => saveLine(line)} title="Enregistrer"
                                style={{ padding: 4, borderRadius: 6, border: 'none', background: dirty ? 'var(--brand)' : 'var(--bg-body)', color: dirty ? 'white' : 'var(--text-muted)', cursor: 'pointer' }}>
                                {savingId === line.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
                              </button>
                              <button type="button" disabled={savingId === line.id} onClick={() => removeLine(line)} title="Retirer"
                                style={{ padding: 4, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-body)', color: '#dc2626', cursor: 'pointer' }}>
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                          {!line.personal && (
                            <button type="button" onClick={() => navigate(routes.client(line.contactId))} title="Voir fiche client"
                              style={{ padding: 4, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-body)', cursor: 'pointer' }}>
                              <Users size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {filteredLines.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Aucune semaine dans cette catégorie.
              </div>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
