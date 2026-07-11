import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import CalendarView from './components/CalendarView';
import ClientsView from './components/ClientsView';
import SettingsView from './components/SettingsView';
import DocumentsView from './components/DocumentsView';
import FinanceView from './components/FinanceView';
import HistoriqueView from './components/HistoriqueView';
import { useAdminMode } from './hooks/useAdminMode';
import { prefetchContacts } from './data';
import { parseDocumentsTab } from './lib/routes';

function DocumentAliasRedirect() {
  const { tab } = useParams();
  return <Navigate to={`/documents/${parseDocumentsTab(tab)}`} replace />;
}

function AppRoutes() {
  const {
    isAdmin,
    adminActor,
    toggleAdmin,
    loginOpen,
    loginError,
    loginLoading,
    submitLogin,
    cancelLogin,
  } = useAdminMode();

  useEffect(() => {
    if (isAdmin) prefetchContacts();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <Layout
        isAdmin={isAdmin}
        adminActor={adminActor}
        onToggleAdmin={toggleAdmin}
        loginOpen={loginOpen}
        loginError={loginError}
        loginLoading={loginLoading}
        onAdminLogin={submitLogin}
        onAdminLoginCancel={cancelLogin}
      >
        <main style={{ maxWidth: 560, margin: '12vh auto', padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, marginBottom: 10 }}>Espace privé Alpicois</h1>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 20 }}>
            Connectez-vous pour consulter les séjours, messages et coordonnées des locataires.
          </p>
          <button type="button" onClick={toggleAdmin} style={{ padding: '10px 16px', border: 'none', borderRadius: 9, background: 'var(--brand)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            Se connecter
          </button>
        </main>
      </Layout>
    );
  }

  return (
    <Layout
      isAdmin={isAdmin}
      adminActor={adminActor}
      onToggleAdmin={toggleAdmin}
      loginOpen={loginOpen}
      loginError={loginError}
      loginLoading={loginLoading}
      onAdminLogin={submitLogin}
      onAdminLoginCancel={cancelLogin}
    >
      <Routes>
        <Route path="/" element={<Dashboard isAdmin={isAdmin} />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/calendar" element={<CalendarView isAdmin={isAdmin} />} />
        <Route path="/clients" element={<ClientsView isAdmin={isAdmin} />} />
        <Route path="/clients/:contactId" element={<ClientsView isAdmin={isAdmin} />} />
        <Route path="/documents" element={<Navigate to="/documents/messages" replace />} />
        <Route path="/documents/:tab" element={<DocumentsView isAdmin={isAdmin} />} />
        <Route path="/document/:tab" element={<DocumentAliasRedirect />} />
        <Route path="/document" element={<Navigate to="/documents/messages" replace />} />
        <Route path="/finance" element={<FinanceView isAdmin={isAdmin} />} />
        <Route path="/finance/historique" element={<Navigate to="/historique" replace />} />
        <Route path="/historique" element={<HistoriqueView isAdmin={isAdmin} />} />
        <Route path="/settings" element={<SettingsView isAdmin={isAdmin} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
