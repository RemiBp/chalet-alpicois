import { type ViewType } from '../types';
import { LayoutDashboard, CalendarDays, Users, Target, Mail, Settings, Mountain, ChevronLeft, ChevronRight, Lock, Unlock, Pencil, BarChart3 } from 'lucide-react';
import { useState } from 'react';

interface LayoutProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  children: React.ReactNode;
  isAdmin?: boolean;
  onToggleAdmin?: () => void;
}

const navItems: { view: ViewType; label: string; icon: typeof LayoutDashboard }[] = [
  { view: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { view: 'calendar', label: 'Calendrier', icon: CalendarDays },
  { view: 'contacts', label: 'Contacts', icon: Users },
  { view: 'prospects', label: 'Prospects', icon: Target },
  { view: 'emails', label: 'Emails', icon: Mail },
  { view: 'client-analysis', label: 'Analyse clients', icon: BarChart3 },
  { view: 'settings', label: 'Paramètres', icon: Settings },
];

export default function Layout({ currentView, onNavigate, children, isAdmin, onToggleAdmin }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ display: 'flex', width: '100%', minHeight: '100vh' }}>
      {/* Sidebar */}
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
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = currentView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => onNavigate(item.view)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: collapsed ? '10px 0' : '8px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--brand)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--brand-dim)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.12s ease, color 0.12s ease',
                  border: 'none',
                  width: '100%',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                }}
                title={item.label}
              >
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Admin toggle & collapse */}
        <div style={{ padding: '8px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Admin mode button */}
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
                  {isAdmin ? 'Admin ON' : 'Admin OFF'}
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
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg-body)', position: 'relative' }}>
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
            MODE ADMIN — Les données sont modifiables. Cliquez sur les textes pour les éditer.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
