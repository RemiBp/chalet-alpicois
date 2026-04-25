import { useState } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import CalendarView from './components/CalendarView';
import ContactsView from './components/ContactsView';
import EmailsView from './components/EmailsView';
import SettingsView from './components/SettingsView';
import ProspectsView from './components/ProspectsView';
import type { ViewType } from './types';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');

  function handleNavigate(view: ViewType) {
    setCurrentView(view);
  }

  return (
    <Layout currentView={currentView} onNavigate={handleNavigate}>
      {currentView === 'dashboard' && <Dashboard />}
      {currentView === 'calendar' && <CalendarView />}
      {currentView === 'contacts' && <ContactsView />}
      {currentView === 'contact-detail' && <ContactsView />}
      {currentView === 'prospects' && <ProspectsView />}
      {currentView === 'emails' && <EmailsView />}
      {currentView === 'settings' && <SettingsView />}
    </Layout>
  );
}
