import type { ViewType } from '../types';

export type DocumentsTab = 'messages' | 'contrat' | 'facture';

export const routes = {
  home: '/',
  dashboard: '/',
  calendar: '/calendar',
  clients: '/clients',
  client: (id: string) => `/clients/${encodeURIComponent(id)}`,
  documents: '/documents/messages',
  documentsTab: (tab: DocumentsTab) => `/documents/${tab}`,
  finance: '/finance',
  historique: '/historique',
  settings: '/settings',
} as const;

const DOCUMENT_TABS = new Set<DocumentsTab>(['messages', 'contrat', 'facture']);

export function parseDocumentsTab(tab?: string): DocumentsTab {
  if (tab && DOCUMENT_TABS.has(tab as DocumentsTab)) return tab as DocumentsTab;
  return 'messages';
}

export function viewFromPath(pathname: string): ViewType {
  if (pathname.startsWith('/calendar')) return 'calendar';
  if (pathname.startsWith('/clients')) return 'clients';
  if (pathname.startsWith('/documents') || pathname.startsWith('/document')) return 'documents';
  if (pathname.startsWith('/historique') || pathname.startsWith('/finance/historique')) return 'historique';
  if (pathname.startsWith('/finance')) return 'finance';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'dashboard';
}

export function isNavActive(pathname: string, view: ViewType): boolean {
  return viewFromPath(pathname) === view;
}
