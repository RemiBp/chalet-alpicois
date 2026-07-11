import { LayoutDashboard, CalendarDays, Users, Settings, Mountain, ChevronLeft, ChevronRight, Lock, Unlock, Pencil, FileText, Euro, History, AlertTriangle, Database, Eye, EyeOff, RefreshCw, CheckCircle2, Menu, X } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchApiHealth, fetchStaticDataMeta, getLastDataSource, markDataSourceLive, markRefreshStateHandled, readRefreshState, type ApiHealth, type StaticDataMeta, type StoredRefreshState } from '../data';
import type { AdminActor } from '../lib/adminSession';
import { routes, isNavActive, viewFromPath } from '../lib/routes';
import type { ViewType } from '../types';

const MOBILE_MQ = '(max-width: 768px)';

interface LayoutProps {
  children: React.ReactNode;
  isAdmin?: boolean;
  adminActor?: AdminActor | null;
  onToggleAdmin?: () => void;
  loginOpen?: boolean;
  loginError?: string | null;
  loginLoading?: boolean;
  onAdminLogin?: (password: string, actor: AdminActor) => void;
  onAdminLoginCancel?: () => void;
}

const mainNavItems: { view: ViewType; path: string; label: string; icon: typeof LayoutDashboard }[] = [
  { view: 'dashboard', path: routes.home, label: 'Tableau de bord', icon: LayoutDashboard },
  { view: 'calendar', path: routes.calendar, label: 'Calendrier', icon: CalendarDays },
  { view: 'clients', path: routes.clients, label: 'Clients', icon: Users },
  { view: 'documents', path: routes.documents, label: 'Documents', icon: FileText },
  { view: 'finance', path: routes.finance, label: 'Finance', icon: Euro },
];

const historiqueNav = { view: 'historique' as const, path: routes.historique, label: 'Historique et sync', icon: History };

function navButtonStyle(collapsed: boolean, isActive: boolean) {
  return {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 10,
    padding: collapsed ? '10px 0' : '8px 10px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: isActive ? 600 : 500,
    color: isActive ? 'var(--brand)' : 'var(--text-secondary)',
    background: isActive ? 'var(--brand-dim)' : 'transparent',
    cursor: 'pointer' as const,
    transition: 'background 0.12s ease, color 0.12s ease',
    border: 'none',
    width: '100%',
    justifyContent: collapsed ? 'center' as const : 'flex-start' as const,
  };
}

export default function Layout({
  children, isAdmin, adminActor, onToggleAdmin,
  loginOpen, loginError, loginLoading, onAdminLogin, onAdminLoginCancel,
}: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const currentView = viewFromPath(location.pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [password, setPassword] = useState('');
  const [loginActor, setLoginActor] = useState<AdminActor>('gilles');
  const [showPassword, setShowPassword] = useState(false);
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [healthReady, setHealthReady] = useState(false);
  const [staticMeta, setStaticMeta] = useState<StaticDataMeta | null>(null);
  const [usingStatic, setUsingStatic] = useState(false);
  const [globalSyncing, setGlobalSyncing] = useState(false);
  const [globalSyncMsg, setGlobalSyncMsg] = useState<string | null>(null);
  const [globalSyncPendingCount, setGlobalSyncPendingCount] = useState(0);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const syncHandledRef = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const onChange = () => {
      setIsMobile(mq.matches);
      if (!mq.matches) setMobileMenuOpen(false);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!loginOpen) {
      setShowPassword(false);
      setLoginActor('gilles');
    }
  }, [loginOpen]);

  useEffect(() => {
    setHealthReady(false);
    fetchApiHealth().then(h => {
      setHealth(h);
      if (h?.ok) markDataSourceLive();
    }).catch(() => setHealth(null)).finally(() => setHealthReady(true));
    fetchStaticDataMeta().then(setStaticMeta).catch(() => setStaticMeta(null));
    const id = window.setInterval(() => setUsingStatic(getLastDataSource() === 'static'), 3000);
    setUsingStatic(getLastDataSource() === 'static');
    return () => window.clearInterval(id);
  }, [location.pathname]);

  useEffect(() => {
    const describeComplete = (report: StoredRefreshState['report']) => {
      const mails = report?.imap?.totalSynced ?? 0;
      const pending = report?.pendingCount ?? 0;
      return pending > 0
        ? `Sync terminée — ${mails} nouveau(x) mail(s), ${pending} proposition(s) à vérifier.`
        : `Sync terminée — ${mails} nouveau(x) mail(s), aucune proposition à valider.`;
    };
    const applyState = (state: StoredRefreshState | null) => {
      if (!state) return;
      if (state.status === 'running') {
        setGlobalSyncing(true);
        setGlobalSyncMsg('Synchronisation des derniers mails en cours…');
        setGlobalSyncPendingCount(0);
        return;
      }
      setGlobalSyncing(false);
      if (state.status === 'complete') {
        setGlobalSyncMsg(describeComplete(state.report));
        setGlobalSyncPendingCount(state.report?.pendingCount ?? 0);
        if (!state.handledAt && syncHandledRef.current !== state.completedAt) {
          syncHandledRef.current = state.completedAt || Date.now();
          markRefreshStateHandled();
          navigate(`${routes.historique}?sync=1`);
        }
      } else {
        setGlobalSyncMsg(`Erreur sync — ${state.error || 'à vérifier'}`);
      }
    };
    const onStart = () => {
      setGlobalSyncing(true);
      setGlobalSyncMsg('Synchronisation des derniers mails en cours…');
      setGlobalSyncPendingCount(0);
    };
    const onComplete = (event: Event) => {
      const report = (event as CustomEvent).detail || {};
      setGlobalSyncing(false);
      setGlobalSyncMsg(describeComplete(report));
      setGlobalSyncPendingCount(report.pendingCount ?? 0);
      syncHandledRef.current = Date.now();
      markRefreshStateHandled();
      navigate(`${routes.historique}?sync=1`);
    };
    const onError = (event: Event) => {
      setGlobalSyncing(false);
      setGlobalSyncPendingCount(0);
      setGlobalSyncMsg(`Erreur sync — ${(event as CustomEvent).detail || 'à vérifier'}`);
    };
    window.addEventListener('alpicois-sync-start', onStart);
    window.addEventListener('alpicois-sync-complete', onComplete);
    window.addEventListener('alpicois-sync-error', onError);
    applyState(readRefreshState());
    const id = window.setInterval(() => applyState(readRefreshState()), 1200);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('alpicois-sync-start', onStart);
      window.removeEventListener('alpicois-sync-complete', onComplete);
      window.removeEventListener('alpicois-sync-error', onError);
    };
  }, [navigate]);

  const go = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  return (
    <div style={{ display: 'flex', width: '100%', minHeight: '100vh', flexDirection: isMobile ? 'column' : 'row' }}>
      {/* Mobile top bar */}
      {isMobile && (
        <header style={{
          position: 'sticky', top: 0, zIndex: mobileMenuOpen ? 140 : 120,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, padding: '10px 14px', background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-color)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: 'linear-gradient(135deg, var(--brand) 0%, var(--brand-light) 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Mountain size={16} color="white" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 700, lineHeight: 1.2 }}>Alpicois</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.2 }}>La Plagne</div>
            </div>
          </div>
          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            onClick={() => setMobileMenuOpen(v => !v)}
            style={{
              border: '1px solid var(--border-color)', background: 'var(--bg-body)',
              borderRadius: 8, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </header>
      )}

      {/* Mobile overflow menu */}
      {isMobile && mobileMenuOpen && (
        <div style={{
          position: 'fixed', top: 57, left: 0, right: 0, bottom: 0, zIndex: 130, background: 'rgba(15,23,42,0.4)',
        }} onClick={() => setMobileMenuOpen(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', top: 8, right: 12, left: 12, maxWidth: 360, marginLeft: 'auto',
              background: 'var(--bg-surface)', borderRadius: 12, border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-lg)', padding: 10, display: 'flex', flexDirection: 'column', gap: 4,
            }}
          >
            <button type="button" onClick={() => go(historiqueNav.path)} style={navButtonStyle(false, isNavActive(location.pathname, historiqueNav.view))}>
              <History size={18} /> <span>{historiqueNav.label}</span>
            </button>
            <button type="button" onClick={() => go(routes.settings)} style={navButtonStyle(false, currentView === 'settings')}>
              <Settings size={18} /> <span>Paramètres</span>
            </button>
            {onToggleAdmin && (
              <button type="button" onClick={() => { onToggleAdmin(); setMobileMenuOpen(false); }} style={{
                ...navButtonStyle(false, false),
                color: isAdmin ? 'var(--warning)' : 'var(--text-secondary)',
                background: isAdmin ? 'var(--warning-dim)' : 'transparent',
              }}>
                {isAdmin ? <Unlock size={18} /> : <Lock size={18} />}
                <span>{isAdmin ? `Admin — ${adminActor === 'claire' ? 'Claire' : 'Gilles'}` : 'Admin OFF'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      {!isMobile && (
      <aside style={{
        width: collapsed ? 60 : 220,
        minWidth: collapsed ? 60 : 220,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{
          padding: collapsed ? '16px 0' : '20px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid var(--border-color)',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'linear-gradient(135deg, var(--brand) 0%, var(--brand-light) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Mountain size={16} color="white" />
          </div>
          {!collapsed && (
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                Alpicois
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.2 }}>
                La Plagne
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: collapsed ? '12px 8px' : '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {mainNavItems.map(item => {
            const Icon = item.icon;
            const isActive = isNavActive(location.pathname, item.view);
            return (
              <button
                key={item.view}
                onClick={() => navigate(item.path)}
                style={navButtonStyle(collapsed, isActive)}
                title={item.label}
              >
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
          <div style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: collapsed ? 'center' : 'stretch',
          }}>
            {(() => {
              const Icon = historiqueNav.icon;
              const isActive = isNavActive(location.pathname, historiqueNav.view);
              return (
                <button
                  type="button"
                  onClick={() => navigate(historiqueNav.path)}
                  style={navButtonStyle(collapsed, isActive)}
                  title={historiqueNav.label}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                  {!collapsed && <span>{historiqueNav.label}</span>}
                </button>
              );
            })()}
          </div>
        </nav>

        {/* Admin toggle & collapse */}
        <div style={{ padding: '8px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Admin mode button */}
          <button
            onClick={() => navigate(routes.settings)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: collapsed ? '8px 0' : '6px 10px',
              borderRadius: 8,
              border: `1px solid ${currentView === 'settings' ? 'var(--brand-border)' : 'transparent'}`,
              background: currentView === 'settings' ? 'var(--brand-dim)' : 'transparent',
              color: currentView === 'settings' ? 'var(--brand)' : 'var(--text-muted)',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              width: '100%',
              justifyContent: collapsed ? 'center' : 'flex-start',
              transition: 'all 0.15s ease',
            }}
            title="Paramètres"
          >
            <Settings size={14} />
            {!collapsed && <span>Paramètres</span>}
          </button>
          {onToggleAdmin && (
            <button
              onClick={onToggleAdmin}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: collapsed ? '8px 0' : '6px 10px',
                borderRadius: 8,
                border: `1px solid ${isAdmin ? 'var(--warning)' : 'transparent'}`,
                background: isAdmin ? 'var(--warning-dim)' : 'transparent',
                color: isAdmin ? 'var(--warning)' : 'var(--text-muted)',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
                width: '100%',
                justifyContent: collapsed ? 'center' : 'flex-start',
                transition: 'all 0.15s ease',
              }}
              title={isAdmin ? 'Mode admin activé - cliquez pour désactiver' : 'Activer le mode édition'}
            >
              {isAdmin ? <Unlock size={14} /> : <Lock size={14} />}
              {!collapsed && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isAdmin ? `Admin — ${adminActor === 'claire' ? 'Claire' : 'Gilles'}` : 'Admin OFF'}
                  {isAdmin && <Pencil size={11} />}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              padding: '6px',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          {!collapsed && typeof __APP_BUILD__ !== 'undefined' && (
            <div style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.65, padding: '4px 10px 0', fontFamily: 'var(--font-mono)' }}>
              build {__APP_BUILD__}
            </div>
          )}
        </div>
      </aside>
      )}

      {/* Main content */}
      <main style={{
        flex: 1,
        overflow: 'auto',
        background: 'var(--bg-body)',
        position: 'relative',
        paddingBottom: isMobile ? 72 : 0,
        minWidth: 0,
        width: '100%',
      }}>
        {/* Admin mode indicator bar */}
        {isAdmin && (
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 100,
            background: 'linear-gradient(90deg, #d97706, #f59e0b)',
            padding: '4px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: 10,
            fontWeight: 600,
            color: 'white',
            letterSpacing: '0.05em',
          }}>
            <Pencil size={12} />
            MODE ADMIN — {adminActor === 'claire' ? 'Claire' : 'Gilles'} — Les écritures sont enregistrées sur le serveur{health?.blob ? ' (Blob actif)' : ' — ⚠ Blob non connecté, risque de perte'}.
          </div>
        )}
        {isAdmin && (globalSyncing || globalSyncMsg) && (
          <div style={{
            position: 'sticky',
            top: isAdmin ? 28 : 0,
            zIndex: 99,
            background: globalSyncing ? '#ecfeff' : '#ecfdf5',
            borderBottom: `1px solid ${globalSyncing ? '#67e8f9' : '#86efac'}`,
            padding: '7px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            flexWrap: 'wrap',
            fontSize: 11,
            color: globalSyncing ? '#0e7490' : '#047857',
            fontWeight: 600,
          }}>
            {globalSyncing ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            {globalSyncMsg}
            {!globalSyncing && globalSyncPendingCount > 0 && (
              <button
                type="button"
                onClick={() => navigate(`${routes.historique}?sync=1`)}
                style={{
                  marginLeft: 4,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 8,
                  border: '1px solid rgba(5,150,105,0.28)',
                  background: 'white',
                  color: '#047857',
                  fontSize: 11,
                  fontWeight: 750,
                  cursor: 'pointer',
                }}
              >
                <CheckCircle2 size={12} />
                Valider maintenant
              </button>
            )}
          </div>
        )}
        {healthReady && (health === null || (usingStatic && health?.ok)) && (
          <div style={{
            position: 'sticky',
            top: isAdmin ? (globalSyncing || globalSyncMsg ? 56 : 28) : 0,
            zIndex: 99,
            background: health === null ? '#fef3c7' : '#fffbeb',
            borderBottom: `1px solid ${health === null ? '#fcd34d' : '#fde68a'}`,
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: '#92400e',
          }}>
            <AlertTriangle size={14} />
            <span>
              {health === null
                ? 'API indisponible — vérifiez que le serveur tourne (npm run dev:api)'
                : 'Certaines données proviennent du cache statique — resynchronisez pour rafraîchir'}
              {staticMeta?.exportedAt && health === null && (
                <> (export : {new Date(staticMeta.exportedAt).toLocaleString('fr-FR')})</>
              )}
            </span>
          </div>
        )}
        {isAdmin && health && !health.blob && health.vercel && (
          <div style={{
            position: 'sticky',
            top: (health === null || usingStatic) ? (isAdmin ? 56 : 28) : (isAdmin ? 28 : 0),
            zIndex: 98,
            background: '#fee2e2',
            borderBottom: '1px solid #fca5a5',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: '#991b1b',
          }}>
            <Database size={14} />
            <span>
              Persistance prod inactive — Vercel → Storage → connectez le store <strong>alpicois-emails</strong>, puis redéployez.
            </span>
          </div>
        )}
        {children}
      </main>

      {/* Mobile bottom navigation */}
      {isMobile && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 110,
          display: 'grid', gridTemplateColumns: `repeat(${mainNavItems.length}, 1fr)`,
          gap: 2, padding: '6px 4px calc(6px + env(safe-area-inset-bottom))',
          background: 'var(--bg-surface)', borderTop: '1px solid var(--border-color)',
          boxShadow: '0 -4px 16px rgba(15,23,42,0.06)',
        }}>
          {mainNavItems.map(item => {
            const Icon = item.icon;
            const isActive = isNavActive(location.pathname, item.view);
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => go(item.path)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 2, padding: '6px 2px', border: 'none', borderRadius: 8, cursor: 'pointer',
                  background: isActive ? 'var(--brand-dim)' : 'transparent',
                  color: isActive ? 'var(--brand)' : 'var(--text-muted)',
                  fontSize: 9, fontWeight: isActive ? 700 : 500, lineHeight: 1.15,
                }}
              >
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.view === 'dashboard' ? 'Accueil' : item.label}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {loginOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            width: '100%', maxWidth: 360, background: 'var(--bg-surface)', borderRadius: 14,
            border: '1px solid var(--border-color)', padding: 24, boxShadow: 'var(--shadow-xl)',
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Mode admin</h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Choisissez qui se connecte, puis entrez le mot de passe admin (identique pour Gilles et Claire).
            </p>
            <form onSubmit={e => {
              e.preventDefault();
              onAdminLogin?.(password, loginActor);
            }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {([
                  { id: 'gilles' as const, label: 'Gilles' },
                  { id: 'claire' as const, label: 'Claire' },
                ]).map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setLoginActor(a.id)}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: loginActor === a.id ? '2px solid var(--brand)' : '1px solid var(--border-color)',
                      background: loginActor === a.id ? 'var(--brand-dim)' : 'var(--bg-body)',
                      color: loginActor === a.id ? 'var(--brand)' : 'var(--text-secondary)',
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mot de passe admin"
                  autoFocus
                  style={{
                    width: '100%', padding: '10px 40px 10px 12px', borderRadius: 8,
                    border: '1px solid var(--border-color)', fontSize: 13,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    color: 'var(--text-muted)', display: 'flex', padding: 4,
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {loginError && (
                <p style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 10 }}>{loginError}</p>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => { setPassword(''); setShowPassword(false); onAdminLoginCancel?.(); }}
                  style={{
                    padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-color)',
                    background: 'transparent', cursor: 'pointer', fontSize: 12,
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loginLoading || !password}
                  style={{
                    padding: '8px 14px', borderRadius: 8, border: 'none',
                    background: 'var(--brand)', color: 'white', cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, opacity: loginLoading ? 0.7 : 1,
                  }}
                >
                  {loginLoading ? 'Connexion…' : 'Activer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
