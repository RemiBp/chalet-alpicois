import { useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import CalendarView from './components/CalendarView';
import ClientsView from './components/ClientsView';
import SettingsView from './components/SettingsView';
import type { ViewType } from './types';
import { useAdminMode } from './hooks/useAdminMode';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const { isAdmin, toggleAdmin } = useAdminMode();

  return (
    <Layout currentView={currentView} onNavigate={setCurrentView} isAdmin={isAdmin} onToggleAdmin={toggleAdmin}>
      {currentView === 'dashboard' && <Dashboard onNavigate={setCurrentView} />}
      {currentView === 'calendar' && <CalendarView />}
      {currentView === 'clients' && <ClientsView onNavigate={setCurrentView} />}
      {currentView === 'settings' && <SettingsView />}
    </Layout>
  );
}
