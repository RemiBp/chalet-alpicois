import { useState } from 'react';
import { motion } from 'framer-motion';
import { Database, RefreshCw, Mail, Download, Server, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SettingsView() {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  function handleSync() {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      setLastSync(new Date().toLocaleString('fr-FR'));
    }, 2000);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ padding: 24, maxWidth: 700 }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        Paramètres
      </h1>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 24 }}>
        Configuration de la synchronisation email et de la base de données
      </p>

      {/* Connexion email */}
      <Section title="Connexion email" icon={Mail}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Info label="Hôte IMAP" value="imap.hostinger.com" />
          <Info label="Port IMAP" value="993 (SSL)" />
          <Info label="Hôte SMTP" value="smtp.hostinger.com" />
          <Info label="Port SMTP" value="465 (SSL)" />
          <Info label="Adresse" value="contact@alpicois-laplagne.fr" />
          <Info label="Statut" value={
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--success)' }}>
              <CheckCircle2 size={12} /> Connecté
            </span>
          } />
        </div>
      </Section>

      {/* Base de données */}
      <Section title="Base de données" icon={Database}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Info label="Type" value="SQLite (local)" />
          <Info label="Fichier" value="emails.db" />
          <Info label="Emails stockés" value={42} />
          <Info label="Clients identifiés" value={12} />
          <Info label="Dernière sync" value={lastSync || 'Jamais'} />
        </div>
      </Section>

      {/* Synchronisation */}
      <Section title="Synchronisation" icon={Server}>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
          Synchronisez les emails depuis votre boîte Hostinger. La première sync peut prendre quelques minutes
          selon le volume d'emails. Les syncs suivantes ne récupèrent que les nouveaux messages.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: syncing ? 'var(--color-gray-300)' : 'var(--brand)',
              color: syncing ? 'var(--text-muted)' : 'white',
              fontSize: 12,
              fontWeight: 600,
              cursor: syncing ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Synchronisation...' : 'Lancer la synchronisation'}
          </button>

          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 20px',
              borderRadius: 8,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Download size={14} />
            Exporter les données
          </button>
        </div>

        {lastSync && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 11, color: 'var(--success)' }}>
            <CheckCircle2 size={12} />
            Dernière synchronisation : {lastSync}
          </div>
        )}
      </Section>

      {/* À propos */}
      <Section title="À propos" icon={AlertCircle}>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Chalet Alpicois Dashboard · v1.0.0
          <br />
          Données synchronisées depuis contact@alpicois-laplagne.fr via MCP Email Server.
        </p>
      </Section>
    </motion.div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Mail; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border-color)',
      padding: 20,
      marginBottom: 16,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: 'var(--brand-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Icon size={15} color="var(--brand)" />
        </div>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{value}</div>
    </div>
  );
}
