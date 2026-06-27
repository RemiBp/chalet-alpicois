import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { History } from 'lucide-react';
import AuditHistoryPanel from './AuditHistoryPanel';

export default function HistoriqueView({ isAdmin = false }: { isAdmin?: boolean }) {
  const [params] = useSearchParams();
  const focusPending = params.get('sync') === '1';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}
    >
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
          <History size={22} color="var(--brand)" />
          Historique et synchronisation
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
          Validez les propositions détectées dans les mails (entrants et envoyés), puis consultez l'historique Gilles / Claire / Automatique.
        </p>
      </div>
      <AuditHistoryPanel isAdmin={isAdmin} focusPending={focusPending} />
    </motion.div>
  );
}
