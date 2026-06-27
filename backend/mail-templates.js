/**
 * Modèles de mails locataires — FR / EN (surchargeables en base).
 */

export const MAIL_TEMPLATE_KEYS = [
  'first_contact',
  'price_quote',
  'contract_info',
  'balance_reminder_j60',
  'deposit_reminder_j7',
  'feedback_post_stay',
];

export const MAIL_TEMPLATE_META = {
  first_contact: { order: 1, labelFr: '1er contact — accueil général', labelEn: 'First contact — general welcome' },
  price_quote: { order: 2, labelFr: '2e mail — prix de la semaine', labelEn: '2nd email — weekly price' },
  contract_info: { order: 3, labelFr: '3e mail — infos pour le contrat', labelEn: '3rd email — contract details' },
  balance_reminder_j60: { order: 4, labelFr: 'J-60 — solde à régler', labelEn: 'D-60 — balance due' },
  deposit_reminder_j7: { order: 5, labelFr: 'J-7 — caution 1 000 €', labelEn: 'D-7 — €1,000 deposit' },
  feedback_post_stay: { order: 6, labelFr: 'J+3 — retour après séjour', labelEn: 'D+3 — post-stay feedback' },
};

const SIGNATURE_FR = `\n\nBien cordialement,\n\nGilles Barbier\nChalet L'Alpicois\ncontact@alpicois-laplagne.fr\n06 74 82 91 76`;

const SIGNATURE_EN = `\n\nBest regards,\n\nGilles Barbier\nChalet L'Alpicois\ncontact@alpicois-laplagne.fr\n+33 6 74 82 91 76`;

export const DEFAULT_MAIL_TEMPLATES = {
  first_contact: {
    fr: {
      subject: "Chalet L'Alpicois — votre demande de séjour",
      body: `Bonjour {{firstName}},

Merci pour votre intérêt pour le Chalet L'Alpicois à La Plagne-Tarentaise.

Nous avons bien reçu votre message et revenons vers vous rapidement avec les disponibilités pour les dates souhaitées.

N'hésitez pas à nous préciser le nombre de personnes et vos dates idéales si ce n'est pas déjà fait.${SIGNATURE_FR}`,
    },
    en: {
      subject: "Chalet L'Alpicois — your stay enquiry",
      body: `Hello {{firstName}},

Thank you for your interest in Chalet L'Alpicois in La Plagne-Tarentaise.

We have received your message and will get back to you shortly with availability for your preferred dates.

Please let us know the number of guests and your ideal dates if you have not already done so.${SIGNATURE_EN}`,
    },
  },
  price_quote: {
    fr: {
      subject: "Chalet L'Alpicois — tarif pour votre semaine",
      body: `Bonjour {{firstName}},

Pour votre séjour du {{checkIn}} au {{checkOut}}, le tarif est de {{weeklyPrice}} € la semaine (location du chalet, hors taxe de séjour).

Ce tarif correspond à la formule location seule. Options possibles : draps, lits faits, assurance annulation.

Souhaitez-vous que nous bloquions provisoirement cette semaine en attendant votre confirmation ?${SIGNATURE_FR}`,
    },
    en: {
      subject: "Chalet L'Alpicois — rate for your week",
      body: `Hello {{firstName}},

For your stay from {{checkIn}} to {{checkOut}}, the rate is €{{weeklyPrice}} per week (chalet rental, tourist tax excluded).

This is for self-catering rental. Optional extras: bed linen, beds made, cancellation insurance.

Would you like us to hold this week provisionally while you confirm?${SIGNATURE_EN}`,
    },
  },
  contract_info: {
    fr: {
      subject: "Chalet L'Alpicois — éléments pour établir le contrat",
      body: `Bonjour {{firstName}},

Afin d'établir le contrat de location, merci de nous confirmer :

• Nom et prénom complets de chaque adulte
• Adresse postale complète
• Téléphone portable
• Nombre exact d'adultes et d'enfants
• Dates d'arrivée et de départ confirmées

Dès réception, nous vous enverrons le contrat avec les modalités d'acompte (30 %) et de solde.${SIGNATURE_FR}`,
    },
    en: {
      subject: "Chalet L'Alpicois — information for the rental agreement",
      body: `Hello {{firstName}},

To prepare the rental agreement, please confirm:

• Full names of all adults
• Full postal address
• Mobile phone number
• Exact number of adults and children
• Confirmed arrival and departure dates

Once received, we will send the contract with deposit (30%) and balance payment terms.${SIGNATURE_EN}`,
    },
  },
  balance_reminder_j60: {
    fr: {
      subject: "Chalet L'Alpicois — solde à régler (J-60)",
      body: `Bonjour {{firstName}},

Votre séjour au Chalet L'Alpicois approche ({{checkIn}} → {{checkOut}}).

Conformément au contrat, merci de régler le solde restant dû (70 % de la location + taxe de séjour), soit {{balanceDue}} €, avant le {{balanceDueDate}}.

Merci d'indiquer votre nom et la référence contrat en libellé du virement.${SIGNATURE_FR}`,
    },
    en: {
      subject: "Chalet L'Alpicois — balance payment reminder (60 days before)",
      body: `Hello {{firstName}},

Your stay at Chalet L'Alpicois is approaching ({{checkIn}} → {{checkOut}}).

As per the agreement, please pay the remaining balance (70% of rental + tourist tax), i.e. €{{balanceDue}}, by {{balanceDueDate}}.

Please include your name and contract reference in the bank transfer.${SIGNATURE_EN}`,
    },
  },
  deposit_reminder_j7: {
    fr: {
      subject: "Chalet L'Alpicois — caution de 1 000 € avant votre arrivée",
      body: `Bonjour {{firstName}},

Votre séjour commence dans une semaine (arrivée le {{checkIn}}).

Merci de verser la caution de 1 000 € (chèque de caution ou virement selon ce qui a été convenu) avant votre arrivée.

Elle vous sera restituée après l'état des lieux de sortie, déduction faite le cas échéant des éventuels dommages.${SIGNATURE_FR}`,
    },
    en: {
      subject: "Chalet L'Alpicois — €1,000 security deposit before arrival",
      body: `Hello {{firstName}},

Your stay begins in one week (check-in on {{checkIn}}).

Please transfer the €1,000 security deposit (or provide a deposit cheque as agreed) before your arrival.

It will be returned after the check-out inspection, minus any damages if applicable.${SIGNATURE_EN}`,
    },
  },
  feedback_post_stay: {
    fr: {
      subject: "Chalet L'Alpicois — comment s'est passé votre séjour ?",
      body: `Bonjour {{firstName}},

Nous espérons que vous avez passé un excellent séjour au Chalet L'Alpicois.

Votre retour nous est précieux : y a-t-il des points que vous avez particulièrement appréciés, ou des suggestions pour améliorer l'accueil ?

Merci encore pour votre confiance, et peut-être à une prochaine fois en montagne !${SIGNATURE_FR}`,
    },
    en: {
      subject: "Chalet L'Alpicois — how was your stay?",
      body: `Hello {{firstName}},

We hope you had a wonderful stay at Chalet L'Alpicois.

Your feedback means a lot to us: what did you enjoy most, and do you have any suggestions?

Thank you again for your trust — we hope to welcome you back in the mountains!${SIGNATURE_EN}`,
    },
  },
};

export function ensureMailTemplateTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_template_overrides (
      template_key TEXT NOT NULL,
      lang TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      updated_by TEXT DEFAULT '',
      PRIMARY KEY (template_key, lang)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_mail_tracking (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      template_key TEXT NOT NULL,
      lang TEXT DEFAULT 'fr',
      status TEXT DEFAULT 'pending',
      sent_at TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now')),
      updated_by TEXT DEFAULT '',
      UNIQUE(contact_id, template_key)
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_mail_tracking_contact ON contact_mail_tracking(contact_id)');
}

export function listMailTemplates(db) {
  ensureMailTemplateTables(db);
  const overrides = db.prepare('SELECT * FROM mail_template_overrides').all();
  const byKey = new Map(overrides.map(o => [`${o.template_key}:${o.lang}`, o]));

  return MAIL_TEMPLATE_KEYS.map(key => {
    const meta = MAIL_TEMPLATE_META[key];
    const def = DEFAULT_MAIL_TEMPLATES[key];
    const build = (lang) => {
      const ov = byKey.get(`${key}:${lang}`);
      return {
        subject: ov?.subject || def[lang].subject,
        body: ov?.body || def[lang].body,
        isCustom: Boolean(ov),
        updatedAt: ov?.updated_at || null,
        updatedBy: ov?.updated_by || null,
      };
    };
    return {
      key,
      order: meta.order,
      labelFr: meta.labelFr,
      labelEn: meta.labelEn,
      fr: build('fr'),
      en: build('en'),
    };
  });
}

export function saveMailTemplateOverride(db, { templateKey, lang, subject, body, actor = '' }) {
  ensureMailTemplateTables(db);
  db.prepare(`
    INSERT INTO mail_template_overrides (template_key, lang, subject, body, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(template_key, lang) DO UPDATE SET
      subject = excluded.subject,
      body = excluded.body,
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `).run(templateKey, lang, subject, body, actor);
}

export function resetMailTemplateOverride(db, templateKey, lang) {
  ensureMailTemplateTables(db);
  db.prepare('DELETE FROM mail_template_overrides WHERE template_key = ? AND lang = ?').run(templateKey, lang);
}

export function getContactMailTracking(db, contactId) {
  ensureMailTemplateTables(db);
  const rows = db.prepare(`
    SELECT * FROM contact_mail_tracking WHERE contact_id = ? ORDER BY template_key
  `).all(contactId);
  const byKey = new Map(rows.map(r => [r.template_key, r]));
  return MAIL_TEMPLATE_KEYS.map(key => {
    const row = byKey.get(key);
    return {
      templateKey: key,
      ...MAIL_TEMPLATE_META[key],
      lang: row?.lang || 'fr',
      status: row?.status || 'pending',
      sentAt: row?.sent_at || '',
      notes: row?.notes || '',
      updatedBy: row?.updated_by || '',
    };
  });
}

export function upsertContactMailTracking(db, { contactId, templateKey, status, lang, notes, actor = '' }) {
  ensureMailTemplateTables(db);
  const id = `${contactId}:${templateKey}`;
  const sentAt = status === 'sent' ? new Date().toISOString() : '';
  db.prepare(`
    INSERT INTO contact_mail_tracking (id, contact_id, template_key, lang, status, sent_at, notes, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(contact_id, template_key) DO UPDATE SET
      lang = excluded.lang,
      status = excluded.status,
      sent_at = CASE WHEN excluded.status = 'sent' THEN COALESCE(NULLIF(excluded.sent_at, ''), datetime('now')) ELSE contact_mail_tracking.sent_at END,
      notes = excluded.notes,
      updated_by = excluded.updated_by,
      updated_at = datetime('now')
  `).run(id, contactId, templateKey, lang || 'fr', status, sentAt, notes || '', actor);
}

export function renderMailTemplate(text, vars = {}) {
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null && vars[k] !== '' ? String(vars[k]) : `{{${k}}}`));
}

function fmtMailDate(iso, lang = 'fr') {
  if (!iso) return '';
  try {
    const raw = String(iso).trim();
    const d = raw.includes('T') ? new Date(raw) : new Date(`${raw.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
    return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return String(iso).slice(0, 10);
  }
}

function isoDateOnly(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

/** Séjour / semaine la plus pertinente pour pré-remplir les modèles. */
export function pickPrimaryStayForMail(contact) {
  const stays = contact?.stays || [];
  const weeks = contact?.requestedWeeks || [];
  const now = new Date();
  const isFuture = (d) => {
    if (!d) return false;
    const t = new Date(isoDateOnly(d) + 'T12:00:00');
    return !Number.isNaN(t.getTime()) && t >= new Date(now.toDateString());
  };
  const score = (row) => {
    let s = 0;
    if (row.status === 'confirmed' || row.status === 'booked') s += 20;
    if (row.status === 'negotiating') s += 10;
    if (isFuture(row.checkIn || row.check_in)) s += 15;
    return s;
  };
  const candidates = [...stays, ...weeks].filter(r => r?.checkIn || r?.check_in);
  candidates.sort((a, b) => score(b) - score(a) || isoDateOnly(b.checkIn || b.check_in).localeCompare(isoDateOnly(a.checkIn || a.check_in)));
  return candidates[0] || null;
}

/** @param {import('better-sqlite3').Database} [db] */
export function buildMailTemplateVars(contact, lang = 'fr', db = null) {
  const stay = pickPrimaryStayForMail(contact);
  const checkInRaw = stay?.checkIn || stay?.check_in || '';
  const checkOutRaw = stay?.checkOut || stay?.check_out || '';
  const price = Number(stay?.priceConfirmed || stay?.price_confirmed || stay?.priceQuoted || stay?.price_quoted || 0);
  const weeklyPrice = price > 0 ? price.toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR') : '';
  const balanceDueNum = price > 0 ? Math.round(price * 0.7) : 0;
  const balanceDue = balanceDueNum > 0 ? balanceDueNum.toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR') : '';

  let balanceDueDate = '';
  if (checkInRaw) {
    const d = new Date(isoDateOnly(checkInRaw) + 'T12:00:00');
    if (!Number.isNaN(d.getTime())) {
      d.setDate(d.getDate() - 60);
      balanceDueDate = fmtMailDate(d.toISOString(), lang);
    }
  }

  const firstNameRaw = contact?.firstName || contact?.name || '';
  const firstName = firstNameRaw.replace(/^(m\.|mme\.?|mr\.?|monsieur|madame)\s+/i, '').trim().split(/\s+/)[0] || 'Bonjour';

  return {
    firstName,
    checkIn: fmtMailDate(checkInRaw, lang),
    checkOut: fmtMailDate(checkOutRaw, lang),
    checkInRaw: isoDateOnly(checkInRaw),
    checkOutRaw: isoDateOnly(checkOutRaw),
    weeklyPrice,
    balanceDue,
    balanceDueDate,
    stayStatus: stay?.status || '',
  };
}

export function renderMailTemplateForContact(db, contact, templateKey, lang = 'fr') {
  const tpl = listMailTemplates(db).find(t => t.key === templateKey);
  if (!tpl) return null;
  const content = lang === 'en' ? tpl.en : tpl.fr;
  const vars = buildMailTemplateVars(contact, lang, db);
  return {
    subject: renderMailTemplate(content.subject, vars),
    body: renderMailTemplate(content.body, vars),
    vars,
    lang,
    templateKey,
  };
}
