import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Bot, Send, Check, X, MessageSquare, Plus, Trash2,
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Mail,
} from 'lucide-react';
import { fetchAutoReplies, fetchAutoReplyRules, approveReply, sendReply, cancelReply, createAutoReplyRule, toggleAutoReplyRule, deleteAutoReplyRule } from '../data';
import type { AutoReply, AutoReplyRule, ReplyType } from '../types';
import { formatDisplayName } from '../lib/formatName';

// ============ CONFIG ============

const replyTypeConfig: Record<ReplyType, { label: string; color: string; bg: string }> = {
  available: { label: 'Disponible', color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  alternative: { label: 'Alternative', color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  unavailable: { label: 'Indisponible', color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  info: { label: 'Info', color: '#2563eb', bg: 'rgba(37,99,235,0.12)' },
  no_reply: { label: 'Pas de réponse', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
};

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Brouillon', color: '#d97706', bg: 'rgba(217,119,6,0.12)' },
  approved: { label: 'Approuvé', color: '#2563eb', bg: 'rgba(37,99,235,0.12)' },
  sent: { label: 'Envoyé', color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  cancelled: { label: 'Annulé', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
};

const seasonPeriods = [
  { id: 'haute', label: 'Haute saison (Noël/Nouvel An)', months: 'Décembre - Janvier', basePrice: '4500' },
  { id: 'moyenne', label: 'Moyenne saison (Février/Mars)', months: 'Février - Mars', basePrice: '3200' },
  { id: 'basse', label: 'Basse saison (Avril/Mai/Été)', months: 'Avril - Septembre', basePrice: '2200' },
];

// ============ REPLY CARD ============

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ReplyCard({ reply, onApprove, onSend, onCancel }: {
  reply: AutoReply;
  onApprove: () => void;
  onSend: () => void;
  onCancel: () => void;
}) {
  const replyCfg = replyTypeConfig[reply.replyType] || replyTypeConfig.info;
  const statCfg = statusConfig[reply.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      layout
      style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)', padding: 16,
        boxShadow: 'var(--shadow-sm)',
        transition: 'all 0.15s',
      }}
    >
      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--brand-dim), #fef3c7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot size={16} color="var(--brand)" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {formatDisplayName(reply.contactName)}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {reply.contactEmail}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, color: replyCfg.color, background: replyCfg.bg }}>
            {replyCfg.label}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, color: statCfg.color, background: statCfg.bg }}>
            {statCfg.label}
          </span>
        </div>
      </div>

      {/* Sujet */}
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>
        {reply.replySubject || '(Pas de sujet)'}
      </div>

      {/* Corps du message - style email */}
      <div style={{
        fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.7,
        background: 'var(--bg-surface-alt)', padding: '14px 16px', borderRadius: 8,
        whiteSpace: 'pre-wrap', marginBottom: 12,
        border: '1px solid var(--border-subtle)',
        fontFamily: 'var(--font-sans)',
      }}>
        {reply.replyBody}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-color)', fontSize: 11, color: 'var(--text-muted)' }}>
          ---
          <br />Réponse générée par IA · {formatDate(reply.createdAt)}
        </div>
      </div>

      {/* Semaines alternatives proposées */}
      {reply.alternativeWeeks && reply.alternativeWeeks.length > 0 && (
        <div style={{ marginBottom: 12, padding: '10px 12px', background: '#fef3c7', borderRadius: 8, border: '1px solid #fde68a' }}>
          <div style={{ fontSize: 10, color: '#92400e', fontWeight: 600, marginBottom: 6 }}>
            🗓️ Semaines alternatives proposées :
          </div>
          {reply.alternativeWeeks.map((alt, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, fontSize: 11, color: '#78350f', marginBottom: 3 }}>
              <span>{new Date(alt.checkIn).toLocaleDateString('fr-FR')} → {new Date(alt.checkOut).toLocaleDateString('fr-FR')}</span>
              <span style={{ fontWeight: 700 }}>{alt.price.toLocaleString('fr-FR')}€</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {reply.status === 'draft' && (
          <>
            <button onClick={onApprove}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              <Check size={13} /> Approuver
            </button>
            <button onClick={onSend}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
              <Send size={13} /> Envoyer directement
            </button>
            <button onClick={onCancel}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px solid #fecaca', background: 'transparent', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>
              <X size={13} /> Ignorer
            </button>
          </>
        )}
        {reply.status === 'approved' && (
          <>
            <button onClick={onSend}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#059669', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              <Send size={13} /> Envoyer maintenant
            </button>
            <button onClick={onCancel}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px solid #fecaca', background: 'transparent', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>
              <X size={13} /> Annuler
            </button>
          </>
        )}
        {reply.status === 'sent' && (
          <div style={{ fontSize: 11, color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Check size={13} /> Envoyé {reply.sentAt ? `le ${formatDate(reply.sentAt)}` : ''}
          </div>
        )}
        {reply.status === 'cancelled' && (
          <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
            <X size={13} /> Réponse ignorée
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ============ RULE CARD ============

function RuleCard({ rule, onToggle, onDelete }: { rule: AutoReplyRule; onToggle: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border-color)', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: rule.isActive ? 'var(--brand)' : 'var(--text-muted)', padding: 0 }}>
            {rule.isActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
          </button>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{rule.name}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Mots-clés : {rule.matchKeywords || 'Aucun'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
            color: rule.isActive ? '#059669' : '#94a3b8',
            background: rule.isActive ? '#ecfdf5' : '#f1f5f9',
          }}>
            {rule.isActive ? 'Actif' : 'Inactif'}
          </span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Prix min</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{rule.minPrice}€</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Prix max</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{rule.maxPrice}€</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Nuits min</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{rule.minNights}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Nuits max</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{rule.maxNights}</div>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Template de réponse IA</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', background: 'var(--bg-surface-alt)', padding: 8, borderRadius: 6 }}>{rule.replyTemplate || 'Aucun template'}</div>
          </div>
          <button onClick={onDelete} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 10, cursor: 'pointer' }}>
            <Trash2 size={12} /> Supprimer
          </button>
        </div>
      )}
    </div>
  );
}

// ============ MAIN COMPONENT ============

export default function AutoReplyView() {
  const [tab, setTab] = useState<'pending' | 'rules' | 'history'>('pending');
  const [replies, setReplies] = useState<AutoReply[]>([]);
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewRule, setShowNewRule] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '', matchKeywords: '', minPrice: 0, maxPrice: 5000,
    minNights: 1, maxNights: 14, replyTemplate: '',
  });

  useEffect(() => {
    Promise.all([fetchAutoReplies(), fetchAutoReplyRules()]).then(([ar, r]) => {
      setReplies(ar);
      setRules(r);
      setLoading(false);
    });
  }, []);

  async function handleApprove(id: string) {
    const ok = await approveReply(id);
    if (ok) setReplies(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r));
  }

  async function handleSend(id: string) {
    const ok = await sendReply(id);
    if (ok) setReplies(prev => prev.map(r => r.id === id ? { ...r, status: 'sent', sentAt: new Date().toISOString() } : r));
  }

  async function handleCancel(id: string) {
    const ok = await cancelReply(id);
    if (ok) setReplies(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelled' } : r));
  }

  async function handleToggleRule(id: string) {
    const ok = await toggleAutoReplyRule(id);
    if (ok) setRules(prev => prev.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
  }

  async function handleDeleteRule(id: string) {
    const ok = await deleteAutoReplyRule(id);
    if (ok) setRules(prev => prev.filter(r => r.id !== id));
  }

  async function handleAddRule() {
    if (!newRule.name) return;
    const ok = await createAutoReplyRule({
      name: newRule.name,
      isActive: true,
      matchKeywords: newRule.matchKeywords,
      minPrice: newRule.minPrice,
      maxPrice: newRule.maxPrice,
      minNights: newRule.minNights,
      maxNights: newRule.maxNights,
      replyTemplate: newRule.replyTemplate,
    });
    if (ok) {
      const updatedRules = await fetchAutoReplyRules();
      setRules(updatedRules);
      setShowNewRule(false);
      setNewRule({ name: '', matchKeywords: '', minPrice: 0, maxPrice: 5000, minNights: 1, maxNights: 14, replyTemplate: '' });
    }
  }

  const pendingReplies = replies.filter(r => r.status === 'draft' || r.status === 'approved');
  const historyReplies = replies.filter(r => r.status === 'sent' || r.status === 'cancelled');

  if (loading) {
    return (
      <div style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargement des réponses...</div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Réponse automatique</h1>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          Réponses générées par IA DeepSeek · {replies.length} réponses · {rules.length} règles actives
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        <button onClick={() => setTab('pending')} style={{
          padding: '8px 16px', borderRadius: 8, border: 'none',
          fontSize: 12, fontWeight: tab === 'pending' ? 600 : 500,
          color: tab === 'pending' ? 'var(--brand)' : 'var(--text-secondary)',
          background: tab === 'pending' ? 'var(--brand-dim)' : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <MessageSquare size={14} />
          Réponses à valider
          {pendingReplies.length > 0 && (
            <span style={{ fontSize: 10, background: '#dc2626', color: 'white', borderRadius: 10, padding: '1px 6px' }}>{pendingReplies.length}</span>
          )}
        </button>
        <button onClick={() => setTab('rules')} style={{
          padding: '8px 16px', borderRadius: 8, border: 'none',
          fontSize: 12, fontWeight: tab === 'rules' ? 600 : 500,
          color: tab === 'rules' ? 'var(--brand)' : 'var(--text-secondary)',
          background: tab === 'rules' ? 'var(--brand-dim)' : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Bot size={14} />
          Règles IA
        </button>
        <button onClick={() => setTab('history')} style={{
          padding: '8px 16px', borderRadius: 8, border: 'none',
          fontSize: 12, fontWeight: tab === 'history' ? 600 : 500,
          color: tab === 'history' ? 'var(--brand)' : 'var(--text-secondary)',
          background: tab === 'history' ? 'var(--brand-dim)' : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Mail size={14} />
          Historique ({historyReplies.length})
        </button>
      </div>

      {/* Tab: Pending replies */}
      {tab === 'pending' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pendingReplies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)', fontSize: 12 }}>
              <Bot size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Aucune réponse en attente</div>
              <div>Les réponses automatiques apparaîtront ici après analyse des emails par DeepSeek.</div>
            </div>
          ) : (
            pendingReplies.map(reply => (
              <ReplyCard
                key={reply.id}
                reply={reply}
                onApprove={() => handleApprove(reply.id)}
                onSend={() => handleSend(reply.id)}
                onCancel={() => handleCancel(reply.id)}
              />
            ))
          )}
        </div>
      )}

      {/* Tab: History */}
      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {historyReplies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 12 }}>
              Aucun historique
            </div>
          ) : (
            historyReplies.map(reply => (
              <div key={reply.id} style={{
                background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)', padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 12,
                opacity: reply.status === 'cancelled' ? 0.6 : 1,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{formatDisplayName(reply.contactName)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{reply.replySubject}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 6, color: statusConfig[reply.status]?.color, background: statusConfig[reply.status]?.bg }}>
                  {statusConfig[reply.status]?.label}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {formatDate(reply.createdAt)}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab: Rules */}
      {tab === 'rules' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Définissez les critères pour lesquels l'IA génère des réponses automatiques.
              Les règles actives sont utilisées lors de l'analyse des nouveaux emails.
            </p>
            <button onClick={() => setShowNewRule(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: 'var(--brand)', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>
              <Plus size={14} /> Nouvelle règle
            </button>
          </div>

          {/* Périodes prédéfinies */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Périodes de saison
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {seasonPeriods.map(p => (
                <div key={p.id} style={{
                  background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)', padding: 12,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{p.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{p.months}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand)' }}>À partir de {p.basePrice}€/sem</div>
                </div>
              ))}
            </div>
          </div>

          {/* Rules list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rules.map(rule => (
              <RuleCard key={rule.id} rule={rule} onToggle={() => handleToggleRule(rule.id)} onDelete={() => handleDeleteRule(rule.id)} />
            ))}
            {rules.length === 0 && (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 12 }}>
                Aucune règle configurée pour l'instant.
              </div>
            )}
          </div>

          {/* New rule form */}
          {showNewRule && (
            <div style={{
              background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
              border: '2px solid var(--brand-border)', padding: 20, marginTop: 16,
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
                Nouvelle règle de réponse automatique
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Nom de la règle
                  </label>
                  <input value={newRule.name} onChange={e => setNewRule(r => ({ ...r, name: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-surface)' }}
                    placeholder="ex: Demande standard hiver" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Mots-clés (séparés par des virgules)
                  </label>
                  <input value={newRule.matchKeywords} onChange={e => setNewRule(r => ({ ...r, matchKeywords: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-surface)' }}
                    placeholder="réservation, disponibilité, tarif, semaine, ski, chalet" />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Prix min (€)</label>
                  <input type="number" value={newRule.minPrice} onChange={e => setNewRule(r => ({ ...r, minPrice: +e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-surface)' }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Prix max (€)</label>
                  <input type="number" value={newRule.maxPrice} onChange={e => setNewRule(r => ({ ...r, maxPrice: +e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-surface)' }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Nuits min</label>
                  <input type="number" value={newRule.minNights} onChange={e => setNewRule(r => ({ ...r, minNights: +e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-surface)' }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Nuits max</label>
                  <input type="number" value={newRule.maxNights} onChange={e => setNewRule(r => ({ ...r, maxNights: +e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-surface)' }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Instructions pour l'IA
                  </label>
                  <textarea value={newRule.replyTemplate} onChange={e => setNewRule(r => ({ ...r, replyTemplate: e.target.value }))}
                    style={{ width: '100%', minHeight: 60, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-surface)', fontFamily: 'var(--font-sans)', resize: 'vertical' }}
                    placeholder="Ex: Répondre avec les disponibilités de la saison et proposer une alternative si la semaine demandée n'est pas libre." />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleAddRule} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  <Plus size={14} /> Ajouter la règle
                </button>
                <button onClick={() => { setShowNewRule(false); setNewRule({ name: '', matchKeywords: '', minPrice: 0, maxPrice: 5000, minNights: 1, maxNights: 14, replyTemplate: '' }); }}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
