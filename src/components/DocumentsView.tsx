import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Mail } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import DocumentGeneratorView, { type DocumentMode } from './DocumentGeneratorView';
import MessagesView from './MessagesView';
import { parseDocumentsTab, routes, type DocumentsTab } from '../lib/routes';

interface DocumentsViewProps {
  isAdmin?: boolean;
}

export default function DocumentsView({ isAdmin = false }: DocumentsViewProps) {
  const { tab: tabParam } = useParams();
  const navigate = useNavigate();
  const tab = parseDocumentsTab(tabParam);

  useEffect(() => {
    if (tabParam && tabParam !== tab) {
      navigate(routes.documentsTab(tab), { replace: true });
    }
  }, [tabParam, tab, navigate]);

  const setTab = (next: DocumentsTab) => {
    navigate(routes.documentsTab(next));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ padding: 24, maxWidth: 1200, margin: '0 auto', width: '100%' }}
    >
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={22} color="var(--brand)" />
          Documents
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
          Messages locataires, contrats et factures — modèles pré-enregistrés FR/EN avec suivi par profil.
        </p>
        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
          {([
            { id: 'messages' as const, label: 'Messages', icon: Mail },
            { id: 'contrat' as const, label: 'Contrats', icon: FileText },
            { id: 'facture' as const, label: 'Factures', icon: FileText },
          ]).map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: tab === t.id ? '1px solid var(--brand-border)' : '1px solid var(--border-color)',
                  background: tab === t.id ? 'var(--brand-dim)' : 'var(--bg-surface)',
                  color: tab === t.id ? 'var(--brand)' : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: tab === t.id ? 600 : 500,
                  cursor: 'pointer',
                }}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      {tab === 'messages' ? (
        <MessagesView isAdmin={isAdmin} />
      ) : (
        <DocumentGeneratorView mode={tab as DocumentMode} isAdmin={isAdmin} hideHeader />
      )}
    </motion.div>
  );
}
