import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bot, Send, Check, X, MessageSquare, Plus, Trash2,
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp,
} from 'lucide-react';
import type { AutoReply, AutoReplyRule, ReplyType } from '../types';

// ============ MOCK DATA ============

const mockReplies: AutoReply[] = [
  {
    id: 'ar1', emailId: '10', contactId: 'c5', contactName: 'Camille Lefevre',
    contactEmail: 'camille.lefevre@gmail.com',
    replyType: 'available', replySubject: 'Re: Nouvelle demande hiver 2025-2026',
    replyBody: 'Bonjour Camille,\n\nMerci pour votre message ! Le chalet est disponible pour la semaine du 27 décembre au 3 janvier.\n\nLe tarif pour 6 personnes en haute saison est de 4200€.\n\nN\'hésitez pas à me confirmer pour que je bloque les dates.\n\nBien cordialement,\nGille',
    alternativeWeeks: [], status: 'draft', createdAt: '2025-10-08T14:30:00Z', sentAt: null,
    originalEmail: null,
  },
  {
    id: 'ar2', emailId: '6', contactId: 'c3', contactName: 'Jean Bernard',
    contactEmail: 'jean.bernard@gmail.com',
    replyType: 'alternative', replySubject: 'Re: Info disponibilité avril',
    replyBody: 'Bonjour Jean,\n\nLa semaine du 5 au 12 avril est malheureusement déjà réservée.\n\nCependant, je peux vous proposer les alternatives suivantes :\n- Semaine du 12 au 19 avril : 2200€\n- Semaine du 19 au 26 avril : 2000€ (dernière semaine avant fermeture)\n\nDites-moi ce qui vous conviendrait !\n\nCordialement,\nGille',
    alternativeWeeks: [
      { checkIn: '2025-04-12', checkOut: '2025-04-19', price: 2200 },
      { checkIn: '2025-04-19', checkOut: '2025-04-26', price: 2000 },
    ],
    status: 'approved', createdAt: '2025-03-05T17:30:00Z', sentAt: null,
    originalEmail: null,
  },
];

const defaultRules: AutoReplyRule[] = [
  { id: 'rule1', name: 'Nouvelle demande standard', isActive: true, matchKeywords: 'réservation,disponibilité,tarif,prix,semaine', minPrice: 0, maxPrice: 5000, minNights: 3, maxNights: 14, replyTemplate: 'Répondre avec les disponibilités et le tarif correspondant' },
  { id: 'rule2', name: 'Relance prospect', isActive: true, matchKeywords: 'encore disponible,libre,confirmation', minPrice: 0, maxPrice: 5000, minNights: 0, maxNights: 14, replyTemplate: 'Répondre en confirmant ou en proposant une alternative' },
];

// ============ TYPES DE RÉPONSES ============

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
            color: rule.isActive ? 'var(--success)' : 'var(--text-muted)',
            background: rule.isActive ? 'var(--success-dim)' : 'transparent',
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
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Template de réponse</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>{rule.replyTemplate}</div>
          </div>
          <button onClick={onDelete} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--danger-dim)', background: 'var(--danger-dim)', color: 'var(--danger)', fontSize: 10, cursor: 'pointer' }}>
            <Trash2 size={12} /> Supprimer
          </button>
        </div>
      )}
    </div>
  );
}

// ============ REPLY CARD ============

function ReplyCard({ reply, onApprove, onSend, onCancel }: { reply: AutoReply; onApprove: () => void; onSend: () => void; onCancel: () => void }) {
  const replyCfg = replyTypeConfig[reply.replyType] || replyTypeConfig.info;
  const statCfg = statusConfig[reply.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)', padding: 16,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--brand-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bot size={16} color="var(--brand)" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {reply.contactName}
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

      {/* Subject */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
        {reply.replySubject}
      </div>

      {/* Body */}
      <div style={{
        fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.7,
        background: 'var(--bg-surface-alt)', padding: 12, borderRadius: 8,
        whiteSpace: 'pre-wrap', marginBottom: 12,
      }}>
        {reply.replyBody}
      </div>

      {/* Alternatives */}
      {reply.alternativeWeeks.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
            Semaines alternatives proposées :
          </div>
          {reply.alternativeWeeks.map((alt, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
              <span>{new Date(alt.checkIn).toLocaleDateString('fr-FR')} → {new Date(alt.checkOut).toLocaleDateString('fr-FR')}</span>
              <span style={{ fontWeight: 600, color: 'var(--brand)' }}>{alt.price}€</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        {reply.status === 'draft' && (
          <>
            <button onClick={onApprove} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              <Check size={13} /> Approuver
            </button>
            <button onClick={onSend} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
              <Send size={13} /> Envoyer
            </button>
            <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--danger-dim)', background: 'transparent', color: 'var(--danger)', fontSize: 11, cursor: 'pointer' }}>
              <X size={13} /> Ignorer
            </button>
          </>
        )}
        {reply.status === 'approved' && (
          <button onClick={onSend} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--success)', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            <Send size={13} /> Envoyer maintenant
          </button>
        )}
        {reply.status === 'sent' && (
          <div style={{ fontSize: 11, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Check size={13} /> Envoyé le {new Date(reply.sentAt || '').toLocaleDateString('fr-FR')}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ============ MAIN COMPONENT ============

export default function AutoReplyView() {
  const [tab, setTab] = useState<'pending' | 'rules'>('pending');
  const [replies, setReplies] = useState<AutoReply[]>(mockReplies);
  const [rules, setRules] = useState<AutoReplyRule[]>(defaultRules);
  const [showNewRule, setShowNewRule] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', matchKeywords: '', minPrice: 0, maxPrice: 5000, minNights: 1, maxNights: 14, replyTemplate: '' });

  function handleApprove(replyId: string) {
    setReplies(prev => prev.map(r => r.id === replyId ? { ...r, status: 'approved' } : r));
  }

  function handleSend(replyId: string) {
    setReplies(prev => prev.map(r => r.id === replyId ? { ...r, status: 'sent', sentAt: new Date().toISOString() } : r));
  }

  function handleCancel(replyId: string) {
    setReplies(prev => prev.map(r => r.id === replyId ? { ...r, status: 'cancelled' } : r));
  }

  function handleToggleRule(ruleId: string) {
    setRules(prev => prev.map(r => r.id === ruleId ? { ...r, isActive: !r.isActive } : r));
  }

  function handleDeleteRule(ruleId: string) {
    setRules(prev => prev.filter(r => r.id !== ruleId));
  }

  function handleAddRule() {
    if (!newRule.name) return;
    const rule: AutoReplyRule = {
      id: Date.now().toString(36),
      name: newRule.name,
      isActive: true,
      matchKeywords: newRule.matchKeywords,
      minPrice: newRule.minPrice,
      maxPrice: newRule.maxPrice,
      minNights: newRule.minNights,
      maxNights: newRule.maxNights,
      replyTemplate: newRule.replyTemplate,
    };
    setRules(prev => [...prev, rule]);
    setShowNewRule(false);
    setNewRule({ name: '', matchKeywords: '', minPrice: 0, maxPrice: 5000, minNights: 1, maxNights: 14, replyTemplate: '' });
  }

  const pendingReplies = replies.filter(r => r.status === 'draft' || r.status === 'approved');

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Réponse automatique</h1>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
          Gérez les réponses automatiques générées par l'IA DeepSeek
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
            <span style={{ fontSize: 10, background: 'var(--danger)', color: 'white', borderRadius: 10, padding: '1px 6px' }}>{pendingReplies.length}</span>
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
      </div>

      {tab === 'pending' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pendingReplies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 12 }}>
              <Bot size={24} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
              Aucune réponse en attente
              <br />Les réponses automatiques apparaîtront ici après la synchronisation des emails.
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

      {tab === 'rules' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Les règles définissent quand et comment l'IA DeepSeek génère des réponses automatiques.
            </p>
            <button onClick={() => setShowNewRule(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: 'var(--brand)', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>
              <Plus size={14} /> Nouvelle règle
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rules.map(rule => (
              <RuleCard key={rule.id} rule={rule} onToggle={() => handleToggleRule(rule.id)} onDelete={() => handleDeleteRule(rule.id)} />
            ))}
          </div>

          {/* New rule form */}
          {showNewRule && (
            <div style={{
              background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--brand-border)', padding: 20, marginTop: 16,
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
                Nouvelle règle
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Nom de la règle
                  </label>
                  <input value={newRule.name} onChange={e => setNewRule(r => ({ ...r, name: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-surface)' }}
                    placeholder="ex: Demande standard semaine ski" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Mots-clés (séparés par des virgules)
                  </label>
                  <input value={newRule.matchKeywords} onChange={e => setNewRule(r => ({ ...r, matchKeywords: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-surface)' }}
                    placeholder="réservation, disponibilité, tarif" />
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
                    Template de réponse
                  </label>
                  <textarea value={newRule.replyTemplate} onChange={e => setNewRule(r => ({ ...r, replyTemplate: e.target.value }))}
                    style={{ width: '100%', minHeight: 60, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', fontSize: 12, color: 'var(--text-primary)', background: 'var(--bg-surface)', fontFamily: 'var(--font-sans)', resize: 'vertical' }}
                    placeholder="Instructions pour l'IA sur le type de réponse à générer..." />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleAddRule} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--brand)', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  <Plus size={14} /> Ajouter la règle
                </button>
                <button onClick={() => setShowNewRule(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>
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
