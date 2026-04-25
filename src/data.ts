import type { Contact, Email, DashboardStats, SeasonSummary, StayRecord } from './types';

// ============ EMAILS ============

export const mockEmails: Email[] = [
  {
    id: '1', messageId: '<msg1@hostinger>',
    sender: 'dupont.famille@gmail.com', senderName: 'Famille Dupont',
    recipients: 'contact@alpicois-laplagne.fr',
    date: '2025-01-15T10:30:00Z',
    subject: 'Réservation Chalet Alpicois - Mars 2025',
    bodyText: 'Bonjour, Nous sommes une famille de 4 personnes et souhaitons réserver le chalet du 15 au 22 mars 2025. Pouvez-vous nous donner le tarif pour cette semaine ? Cordialement, La famille Dupont',
    isFromGuest: true, threadId: 'thread-1', folder: 'INBOX',
  },
  {
    id: '2', messageId: '<msg2@hostinger>',
    sender: 'contact@alpicois-laplagne.fr', senderName: 'Chalet Alpicois',
    recipients: 'dupont.famille@gmail.com',
    date: '2025-01-15T14:00:00Z',
    subject: 'Re: Réservation Chalet Alpicois - Mars 2025',
    bodyText: 'Bonjour, Merci pour votre intérêt ! Le chalet est disponible du 15 au 22 mars. Le tarif pour 4 personnes est de 2800€ la semaine. Cordialement, Gille',
    isFromGuest: false, threadId: 'thread-1', folder: 'SENT',
  },
  {
    id: '3', messageId: '<msg3@hostinger>',
    sender: 'martin.family@orange.fr', senderName: 'Famille Martin',
    recipients: 'contact@alpicois-laplagne.fr',
    date: '2025-02-01T09:15:00Z',
    subject: 'Location semaine ski février',
    bodyText: 'Bonjour, Serait-il possible de louer le chalet pour la semaine du 17 au 24 février ? Nous sommes 5 personnes (2 adultes + 3 enfants). Merci de nous indiquer les disponibilités et le prix. Cordialement, Sophie Martin',
    isFromGuest: true, threadId: 'thread-2', folder: 'INBOX',
  },
  {
    id: '4', messageId: '<msg4@hostinger>',
    sender: 'contact@alpicois-laplagne.fr', senderName: 'Chalet Alpicois',
    recipients: 'martin.family@orange.fr',
    date: '2025-02-01T11:30:00Z',
    subject: 'Re: Location semaine ski février',
    bodyText: 'Bonjour Sophie, Le chalet est disponible du 17 au 24 février ! Tarif pour 5 personnes : 3200€ la semaine. Belle journée, Gille',
    isFromGuest: false, threadId: 'thread-2', folder: 'SENT',
  },
  {
    id: '5', messageId: '<msg5@hostinger>',
    sender: 'martin.family@orange.fr', senderName: 'Famille Martin',
    recipients: 'contact@alpicois-laplagne.fr',
    date: '2025-02-02T08:00:00Z',
    subject: 'Re: Location semaine ski février',
    bodyText: 'Parfait ! Nous confirmons la réservation du 17 au 24 février. Pouvez-vous nous envoyer un devis ? Merci ! Sophie',
    isFromGuest: true, threadId: 'thread-2', folder: 'INBOX',
  },
  {
    id: '6', messageId: '<msg6@hostinger>',
    sender: 'jean.bernard@gmail.com', senderName: 'Jean Bernard',
    recipients: 'contact@alpicois-laplagne.fr',
    date: '2025-03-05T16:45:00Z',
    subject: 'Info disponibilité avril',
    bodyText: 'Bonjour, Je cherche un chalet pour 2 personnes du 5 au 12 avril. Avez-vous des disponibilités ? Merci, Jean',
    isFromGuest: true, threadId: 'thread-3', folder: 'INBOX',
  },
  {
    id: '7', messageId: '<msg7@hostinger>',
    sender: 'contact@alpicois-laplagne.fr', senderName: 'Chalet Alpicois',
    recipients: 'jean.bernard@gmail.com',
    date: '2025-03-05T17:30:00Z',
    subject: 'Re: Info disponibilité avril',
    bodyText: 'Bonjour Jean, Oui le chalet est disponible du 5 au 12 avril. Pour 2 personnes le tarif est de 2200€ la semaine. Au plaisir ! Gille',
    isFromGuest: false, threadId: 'thread-3', folder: 'SENT',
  },
  {
    id: '8', messageId: '<msg8@hostinger>',
    sender: 'pierre.leclerc@yahoo.fr', senderName: 'Pierre Leclerc',
    recipients: 'contact@alpicois-laplagne.fr',
    date: '2025-06-10T10:00:00Z',
    subject: 'Réservation été chalet',
    bodyText: 'Bonjour, Nous sommes intéressés par le chalet pour la semaine du 20 au 27 juillet. Nous sommes 6 personnes. Pouvez-vous me donner le tarif été ? Merci, Pierre',
    isFromGuest: true, threadId: 'thread-4', folder: 'INBOX',
  },
  {
    id: '9', messageId: '<msg9@hostinger>',
    sender: 'contact@alpicois-laplagne.fr', senderName: 'Chalet Alpicois',
    recipients: 'pierre.leclerc@yahoo.fr',
    date: '2025-06-10T14:00:00Z',
    subject: 'Re: Réservation été chalet',
    bodyText: 'Bonjour Pierre, Le chalet est disponible du 20 au 27 juillet. Tarif été : 2600€. N\'hésitez pas ! Gille',
    isFromGuest: false, threadId: 'thread-4', folder: 'SENT',
  },
  {
    id: '10', messageId: '<msg10@hostinger>',
    sender: 'camille.lefevre@gmail.com', senderName: 'Camille Lefevre',
    recipients: 'contact@alpicois-laplagne.fr',
    date: '2025-10-08T11:00:00Z',
    subject: 'Nouvelle demande hiver 2025-2026',
    bodyText: 'Bonjour, Nous sommes un groupe de 6 personnes et cherchons un chalet pour la semaine du 27 décembre au 3 janvier. Est-ce encore disponible ? Merci ! Camille',
    isFromGuest: true, threadId: 'thread-5', folder: 'INBOX',
  },
  {
    id: '11', messageId: '<msg11@hostinger>',
    sender: 'contact@alpicois-laplagne.fr', senderName: 'Chalet Alpicois',
    recipients: 'camille.lefevre@gmail.com',
    date: '2025-10-08T14:30:00Z',
    subject: 'Re: Nouvelle demande hiver 2025-2026',
    bodyText: 'Bonjour Camille, Oui le chalet est disponible pour la semaine du 27 déc au 3 janv. Tarif haute saison 6 pers : 4200€. Au plaisir ! Gille',
    isFromGuest: false, threadId: 'thread-5', folder: 'SENT',
  },
];

// ============ CONTACTS ============

export const mockContacts: Contact[] = [
  {
    id: 'c1',
    name: 'Famille Martin',
    email: 'martin.family@orange.fr',
    phone: '0612345678',
    alternatePhones: [],
    origin: 'email',
    originDetail: 'Premier contact par email',
    status: 'client',
    firstContactDate: '2025-02-01',
    lastContactDate: '2025-02-02',
    stays: [
      {
        id: 's1', contactId: 'c1', season: '2024-2025',
        checkIn: '2025-02-17', checkOut: '2025-02-24', nights: 7,
        adults: 2, children: 3,
        priceQuoted: 3200, priceConfirmed: 3200,
        status: 'paid', sourceEmailId: '5',
        notes: 'Forfait famille ski inclus. Première venue, très contents.',
      },
    ],
    totalStays: 1,
    requestedWeeks: [],
    notes: 'Famille avec 3 enfants. Habite Lyon. Venue février 2025. À recontacter pour 2026.',
    createdAt: '2025-02-01T09:15:00Z',
    updatedAt: '2025-02-02T10:00:00Z',
  },
  {
    id: 'c2',
    name: 'Famille Dupont',
    email: 'dupont.famille@gmail.com',
    phone: '0687654321',
    alternatePhones: [],
    origin: 'email',
    originDetail: 'Recommandation des Martin',
    status: 'client',
    firstContactDate: '2025-01-15',
    lastContactDate: '2025-01-15',
    stays: [
      {
        id: 's2', contactId: 'c2', season: '2024-2025',
        checkIn: '2025-03-15', checkOut: '2025-03-22', nights: 7,
        adults: 2, children: 2,
        priceQuoted: 2800, priceConfirmed: 2800,
        status: 'confirmed', sourceEmailId: '1',
        notes: '',
      },
    ],
    totalStays: 1,
    requestedWeeks: [],
    notes: 'Viennent par recommandation des Martin. 2 enfants.',
    createdAt: '2025-01-15T10:30:00Z',
    updatedAt: '2025-01-15T14:00:00Z',
  },
  {
    id: 'c3',
    name: 'Jean Bernard',
    email: 'jean.bernard@gmail.com',
    phone: '',
    alternatePhones: [],
    origin: 'email',
    originDetail: 'Site web dealyse.com',
    status: 'prospect',
    firstContactDate: '2025-03-05',
    lastContactDate: '2025-03-05',
    stays: [],
    totalStays: 0,
    requestedWeeks: [
      {
        id: 'rw1', season: '2024-2025', weekNumber: 14,
        checkIn: '2025-04-05', checkOut: '2025-04-12',
        adults: 2, children: 0,
        status: 'negotiating',
        notes: 'N\'a pas encore confirmé. Relancer.',
      },
    ],
    notes: 'Prospect pour avril 2025. Seul, cherche calme.',
    createdAt: '2025-03-05T16:45:00Z',
    updatedAt: '2025-03-05T17:30:00Z',
  },
  {
    id: 'c4',
    name: 'Pierre Leclerc',
    email: 'pierre.leclerc@yahoo.fr',
    phone: '0612345699',
    alternatePhones: [],
    origin: 'email',
    originDetail: 'Bouche à oreille',
    status: 'prospect',
    firstContactDate: '2025-06-10',
    lastContactDate: '2025-06-10',
    stays: [],
    totalStays: 0,
    requestedWeeks: [
      {
        id: 'rw2', season: '2025-2026', weekNumber: 29,
        checkIn: '2025-07-20', checkOut: '2025-07-27',
        adults: 3, children: 3,
        status: 'asked',
        notes: 'Demande pour l\'été, en attente de réponse.',
      },
    ],
    notes: 'Famille nombreuse, 6 personnes. Demande été.',
    createdAt: '2025-06-10T10:00:00Z',
    updatedAt: '2025-06-10T14:00:00Z',
  },
  {
    id: 'c5',
    name: 'Camille Lefevre',
    email: 'camille.lefevre@gmail.com',
    phone: '',
    alternatePhones: [],
    origin: 'whatsapp',
    originDetail: 'Contact via WhatsApp - groupe La Plagne',
    status: 'prospect',
    firstContactDate: '2025-10-08',
    lastContactDate: '2025-10-08',
    stays: [],
    totalStays: 0,
    requestedWeeks: [
      {
        id: 'rw3', season: '2025-2026', weekNumber: 52,
        checkIn: '2025-12-27', checkOut: '2026-01-03',
        adults: 4, children: 2,
        status: 'negotiating',
        notes: 'Haute saison. Tarif donné à 4200€. En attente.',
      },
    ],
    notes: 'Groupe 6 pers. Semaine Nouvel An 2025-2026.',
    createdAt: '2025-10-08T11:00:00Z',
    updatedAt: '2025-10-08T14:30:00Z',
  },
  {
    id: 'c6',
    name: 'Sophie Moreau',
    email: 'sophie.moreau@free.fr',
    phone: '0788990011',
    alternatePhones: ['0622334455'],
    origin: 'recommendation',
    originDetail: 'Recommandée par la famille Martin (clients février 2025)',
    status: 'prospect',
    firstContactDate: '2025-11-15',
    lastContactDate: '2025-11-15',
    stays: [],
    totalStays: 0,
    requestedWeeks: [
      {
        id: 'rw4', season: '2025-2026', weekNumber: 8,
        checkIn: '2026-02-21', checkOut: '2026-02-28',
        adults: 2, children: 1,
        status: 'asked',
        notes: 'Jeune famille. Demande par recommandation.',
      },
    ],
    notes: 'Amie des Martin. Veut venir aux mêmes dates qu\'eux en 2026.',
    createdAt: '2025-11-15T09:00:00Z',
    updatedAt: '2025-11-15T09:00:00Z',
  },
  {
    id: 'c7',
    name: 'Marc Dubois (ancien client 2024)',
    email: 'marc.dubois@icloud.com',
    phone: '0611112233',
    alternatePhones: [],
    origin: 'website',
    originDetail: 'Site web - réservation directe',
    status: 'former_client',
    firstContactDate: '2024-01-10',
    lastContactDate: '2024-02-20',
    stays: [
      {
        id: 's3', contactId: 'c7', season: '2023-2024',
        checkIn: '2024-02-10', checkOut: '2024-02-17', nights: 7,
        adults: 2, children: 0,
        priceQuoted: 2600, priceConfirmed: 2500,
        status: 'paid', sourceEmailId: '',
        notes: 'Ancien client. Séjour hiver 2024.',
      },
    ],
    totalStays: 1,
    requestedWeeks: [],
    notes: 'Client 2023-2024. Pas revenu depuis. À recontacter pour 2025-2026.',
    createdAt: '2024-01-10T08:00:00Z',
    updatedAt: '2024-02-20T18:00:00Z',
  },
];

// ============ STATS ============

export function getDashboardStats(): DashboardStats {
  const clients = mockContacts.filter(c => c.status === 'client');
  const prospects = mockContacts.filter(c => c.status === 'prospect');
  const formerClients = mockContacts.filter(c => c.status === 'former_client');
  const allStays = mockContacts.flatMap(c => c.stays);
  const paidConfirmed = allStays.filter(s => s.status === 'paid' || s.status === 'confirmed');
  const totalRevenue = paidConfirmed.reduce((sum, s) => sum + s.priceConfirmed, 0);
  const upcoming = allStays.filter(s => new Date(s.checkIn) > new Date() && s.status !== 'cancelled');

  // Season summaries
  const seasonsMap = new Map<string, SeasonSummary>();
  for (const stay of allStays) {
    if (!seasonsMap.has(stay.season)) {
      seasonsMap.set(stay.season, {
        season: stay.season,
        label: stay.season.replace('-', ' - '),
        totalStays: 0,
        totalRevenue: 0,
        occupancyWeeks: 0,
        contactsCount: 0,
        newContacts: 0,
      });
    }
    const s = seasonsMap.get(stay.season)!;
    s.totalStays++;
    s.totalRevenue += stay.priceConfirmed;
    s.occupancyWeeks += stay.nights / 7;
  }

  return {
    currentSeason: '2025-2026',
    totalContacts: mockContacts.length,
    prospects: prospects.length,
    clients: clients.length,
    formerClients: formerClients.length,
    totalStays: allStays.length,
    totalRevenue,
    averagePrice: paidConfirmed.length > 0 ? Math.round(totalRevenue / paidConfirmed.length) : 0,
    occupancyRate: 72,
    upcomingStays: upcoming.length,
    newInquiries: mockContacts.filter(c => c.status === 'prospect').length,
    seasons: Array.from(seasonsMap.values()),
  };
}

// ============ HELPERS ============

export function getContactsByStatus(status: string): Contact[] {
  if (status === 'all') return mockContacts;
  return mockContacts.filter(c => c.status === status);
}

export function getContactById(id: string): Contact | undefined {
  return mockContacts.find(c => c.id === id);
}

export function getStaysBySeason(season: string): StayRecord[] {
  return mockContacts.flatMap(c => c.stays.filter(s => s.season === season));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
