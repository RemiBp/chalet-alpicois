import { type ViewType } from '../types';
import { LayoutDashboard, CalendarDays, Users, Target, Mail, Settings, Mountain, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface LayoutProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  children: React.ReactNode;
}

const navItems: { view: ViewType; label: string; icon: typeof LayoutDashboard }[] = [
  { view: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { view: 'calendar', label: 'Calendrier', icon: CalendarDays },
  { view: 'contacts', label: 'Contacts', icon: Users },
  { view: 'prospects', label: 'Prospects', icon: Target },
  { view: 'emails', label: 'Emails', icon: Mail },
  { view: 'settings', label: 'Paramètres', icon: Settings },
];

export default function Layout({ currentView, onNavigate, children }: LayoutProps) {
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

        {/* Collapse toggle */}
        <div style={{ padding: '8px', borderTop: '1px solid var(--border-color)' }}>
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
      <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg-body)' }}>
        {children}
      </main>
    </div>
  );
}
