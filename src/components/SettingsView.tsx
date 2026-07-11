import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Database, Mail, Mountain, CheckCircle2, ExternalLink, RefreshCw, Loader2 } from 'lucide-react';
import { fetchDashboardStats, fetchApiHealth, triggerDataRefresh, fetchAuditLog, persistDbToBlob, reconcileBookingsAi, type AuditEntry } from '../data';
import { getAdminToken } from '../lib/adminSession';
import { CHALET, formatPrice } from '../config/chalet';

export default function SettingsView({ isAdmin = false }: { isAdmin?: boolean }) {
  const [stats, setStats] = useState<{ totalContacts: number; totalEmails: number } | null>(null);
  const [health, setHealth] = useState<{ ok: boolean; adminConfigured: boolean; blob: boolean; vercel: boolean; blobKey?: string; deepseek?: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [adminBusy, setAdminBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardStats().then(s => setStats({ totalContacts: s.totalContacts, totalEmails: s.totalEmails })).catch(() => {});
    fetchApiHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    if (isAdmin && getAdminToken()) {
      fetchAuditLog(30).then(({ entries }) => setAudit(entries)).catch(() => setAudit([]));
    } else {
      setAudit([]);
    }
  }, [isAdmin, syncReport]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 24, maxWidth: 720 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Paramètres</h1>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 24 }}>
        Configuration et informations du chalet
      </p>

      <Section title="Chalet" icon={Mountain}>
        <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{CHALET.name}</strong> — {CHALET.capacity} pers. · {CHALET.surfaceM2} m² · {CHALET.bedrooms} chambres
          <br />Pistes à {CHALET.distancePistes} · Plagne Centre à {CHALET.distanceCentre}
          <br />
          <a href={CHALET.website} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
            Site web <ExternalLink size={12} />
          </a>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, padding: '10px 12px', background: 'var(--bg-body)', borderRadius: 8 }}>
          {CHALET.rentalFormula.note}
        </p>
      </Section>

      <Section title="Tarifs indicatifs" icon={Mountain}>
        {CHALET.seasons.map(season => (
          <div key={season.season} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{season.label}</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {[
                ['Haute', season.highSeason],
                ['Moyenne', season.midSeason],
                ['Basse', season.lowSeason],
              ].map(([label, tier]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{label as string} — {(tier as { note: string }).note}</span>
                  <span style={{ fontWeight: 600 }}>{formatPrice((tier as { typical: number }).typical)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Données" icon={Database}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Info label="Contacts" value={stats?.totalContacts ?? '—'} />
          <Info label="Messages liés" value={stats?.totalEmails ?? '—'} />
          <Info label="Email" value={CHALET.email} />
          <Info label="API live" value={
            health?.ok
              ? <span style={{ color: 'var(--success)' }}>Connectée</span>
              : <span style={{ color: 'var(--warning)' }}>Repli statique</span>
          } />
          <Info label="Admin serveur" value={health?.adminConfigured ? 'Configuré' : 'Non configuré'} />
          <Info label="Persistance prod" value={
            health?.blob
              ? <span style={{ color: 'var(--success)' }}>Vercel Blob ({health.blobKey || 'alpicois-emails.db'})</span>
              : health?.vercel
                ? <span style={{ color: 'var(--warning)' }}>Non connecté</span>
                : '—'
          } />
          <Info label="DeepSeek IA" value={
            health?.deepseek
              ? <span style={{ color: 'var(--success)' }}>Configuré</span>
              : <span style={{ color: 'var(--text-muted)' }}>Non configuré</span>
          } />
          <Info label="Session admin" value={
            isAdmin && getAdminToken()
              ? <span style={{ color: 'var(--success)' }}>Active</span>
              : 'Inactive'
          } />
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.5 }}>
          En production, activez le mode admin (cadenas) pour modifier les contacts, générer des documents et créer des brouillons mail. Les écritures sont persistées sur le serveur.
          <br />Refresh auto emails + propositions à valider : 2×/jour via cron Vercel (06:00 et 17:00 UTC).
        </p>
        {!health?.blob && health?.vercel && (
          <div style={{
            marginTop: 14, padding: '12px 14px', borderRadius: 8, fontSize: 11, lineHeight: 1.55,
            background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)', color: '#92400e',
          }}>
            <strong>Persistance prod — à faire une fois :</strong>
            <ol style={{ margin: '8px 0 0 18px', padding: 0 }}>
              <li>Vercel → projet <em>chalet-alpicois-dash</em> → Storage</li>
              <li>Cliquez <strong>Connect</strong> sur le store <strong>alpicois-emails</strong> (pas « link »)</li>
              <li>Redéployez (<code>vercel --prod</code>) — le token Blob est injecté automatiquement</li>
              <li>Premier upload DB : <code>npm run upload-db-blob --prefix backend</code> (avec token local ou après connect)</li>
            </ol>
          </div>
        )}
        {isAdmin && audit.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Journal d'audit (30 derniers)</div>
            <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
              {audit.map(entry => (
                <div key={entry.id} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontSize: 10 }}>
                  <div style={{ fontWeight: 600 }}>{entry.action} · {entry.entityType} {entry.entityId.slice(0, 8)}…</div>
                  <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                    {new Date(entry.createdAt).toLocaleString('fr-FR')}
                    {entry.payload && typeof entry.payload === 'object' && 'price' in entry.payload && (
                      <> · {String(entry.payload.price)} €</>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {isAdmin && (
          <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" disabled={!!adminBusy} onClick={async () => {
              setAdminBusy('persist');
              setSyncReport(null);
              try {
                const r = await persistDbToBlob();
                setSyncReport(r.message || (r.ok ? 'Blob persisté' : 'Échec persist'));
                fetchApiHealth().then(setHealth);
              } catch (e) {
                setSyncReport(e instanceof Error ? e.message : 'Erreur');
              } finally {
                setAdminBusy(null);
              }
            }}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-body)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              {adminBusy === 'persist' ? '…' : 'Sauvegarder sur Blob'}
            </button>
            {health?.deepseek && (
              <>
                <button type="button" disabled={!!adminBusy} onClick={async () => {
                  setAdminBusy('ai-dry');
                  try {
                    const r = await reconcileBookingsAi(true);
                    setSyncReport(`IA (simulation) — ${r.issues.length} écart(s) sur ${r.checked} séjour(s)`);
                  } catch (e) {
                    setSyncReport(e instanceof Error ? e.message : 'Erreur');
                  } finally {
                    setAdminBusy(null);
                  }
                }}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-body)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  Vérifier réservations (IA)
                </button>
                <button type="button" disabled={!!adminBusy} onClick={async () => {
                  if (!confirm('Appliquer les corrections IA (confiance haute) ?')) return;
                  setAdminBusy('ai-apply');
                  try {
                    const r = await reconcileBookingsAi(false);
                    setSyncReport(`IA appliquée — ${r.fixed} correction(s), ${r.issues.length} écart(s) détecté(s)`);
                    await persistDbToBlob().catch(() => {});
                  } catch (e) {
                    setSyncReport(e instanceof Error ? e.message : 'Erreur');
                  } finally {
                    setAdminBusy(null);
                  }
                }}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(37,99,235,0.3)', background: 'rgba(37,99,235,0.08)', color: '#1d4ed8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  Corriger avec IA
                </button>
              </>
            )}
          </div>
        )}
        {isAdmin && (
          <div style={{ marginTop: 14 }}>
            <button type="button" disabled={syncing} onClick={async () => {
              setSyncing(true);
              setSyncReport(null);
              try {
                const r = await triggerDataRefresh(false);
                setSyncReport(`OK — ${r.imap?.totalSynced ?? 0} mails synchronisés, ${r.profiles?.filledNationality ?? 0} nationalités, ${r.signals?.recordsUpdated ?? 0} statuts mis à jour (${r.durationMs}ms)`);
                fetchDashboardStats().then(s => setStats({ totalContacts: s.totalContacts, totalEmails: s.totalEmails }));
              } catch (e) {
                setSyncReport(e instanceof Error ? e.message : 'Erreur');
              } finally {
                setSyncing(false);
              }
            }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: '1px solid var(--brand-border)', background: 'var(--brand-dim)', color: 'var(--brand)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {syncing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
              Resynchroniser mails & profils
            </button>
            {syncReport && <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>{syncReport}</p>}
          </div>
        )}
      </Section>

      <Section title="Connexion email" icon={Mail}>
        <Info label="Compte" value={
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--success)' }}>
            <CheckCircle2 size={12} /> {CHALET.email}
          </span>
        } />
      </Section>
    </motion.div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Mail; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-color)',
      padding: 20, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Icon size={16} color="var(--brand)" />
        <h2 style={{ fontSize: 14, fontWeight: 700 }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 500 }}>{value}</div>
    </div>
  );
}
