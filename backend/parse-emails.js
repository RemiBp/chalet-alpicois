/**
 * AGENT DE PARSING IA DES EMAILS
 *
 * Ce script analyse tous les emails non parsés dans SQLite,
 * utilise l'IA (OpenAI ou LLM local) pour extraire :
 *   - Qui est l'expéditeur (nom, email)
 *   - Est-ce une demande de réservation ?
 *   - Quelles dates, combien de personnes, quel prix ?
 *   - Est-ce une confirmation ? Un abandon ?
 *   - Quel est le statut du contact (client/prospect) ?
 *
 * Puis CRÉE / MET À JOUR les contacts et séjours dans SQLite.
 *
 * Usage:
 *   node parse-emails.js
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const DB_PATH = process.env.DB_PATH || '../emails.db';

// ============ SQLITE ============

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ============ IA PARSING ============

/**
 * Prompt système pour l'analyse d'email
 * L'IA doit extraire les informations structurées.
 */
function buildPrompt(email) {
  return `Tu es un assistant spécialisé dans la gestion de locations saisonnières pour un chalet à La Plagne.

Analyse cet email et extrait les informations structurées au format JSON.

Email reçu :
De: ${email.sender_name} <${email.sender}>
Date: ${email.date}
Sujet: ${email.subject}
Contenu:
${email.body_text?.substring(0, 3000)}

Réponds UNIQUEMENT avec un objet JSON valide de cette forme (pas de markdown, pas de texte autour) :

{
  "is_relevant": true/false,
  "contact": {
    "name": "Nom complet du contact",
    "email": "email@example.com",
    "phone": "numéro si trouvé sinon vide"
  },
  "email_type": "new_inquiry" | "follow_up" | "confirmation" | "cancellation" | "info_request" | "other",
  "dates": {
    "check_in": "YYYY-MM-DD ou null",
    "check_out": "YYYY-MM-DD ou null",
    "week_number": null ou le numéro de semaine
  },
  "guests": {
    "adults": nombre,
    "children": nombre
  },
  "pricing": {
    "amount": nombre ou 0,
    "currency": "EUR",
    "type": "quoted" | "confirmed" | null
  },
  "status": "client" | "prospect" | "former_client" | "unknown",
  "is_confirmation": true/false,
  "season": "2024-2025" ou "2025-2026" ou "2023-2024",
  "summary": "Résumé en français de l'email en 1-2 phrases"
}

Règles importantes :
- is_relevant = false si l'email est automatique (notification, newsletter, spam)
- email_type : new_inquiry = nouvelle demande, follow_up = relance, confirmation = confirmation de réservation
- Les dates sont au format YYYY-MM-DD. Si l'email parle de "semaine du 15 mars", check_in = "2025-03-15"
- Le numéro de semaine doit être le numéro ISO de la semaine
- season : "2024-2025" pour Oct 2024 - Avr 2025, "2025-2026" pour Oct 2025 - Avr 2026
- Si tu n'as pas assez d'infos pour un champ, mets null ou 0`;
}

/**
 * Parse un email via l'API OpenAI.
 * Si OPENAI_API_KEY n'est pas configuré, on utilise un parseur
 * regex de base (moins précis mais fonctionnel).
 */
async function parseEmail(email) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey && apiKey !== 'sk-votre-cle-openai') {
    return await parseWithOpenAI(email, apiKey);
  } else {
    return await parseWithRegex(email);
  }
}

/**
 * Parsing avec OpenAI
 */
async function parseWithOpenAI(email, apiKey) {
  const { default: OpenAI } = await import('openai');

  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // rapide et économique
      messages: [
        { role: 'system', content: buildPrompt(email) },
        { role: 'user', content: `Analyse cet email :\n\nSujet: ${email.subject}\n\nContenu:\n${email.body_text?.substring(0, 3000)}` },
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || '';
    // Nettoyer le JSON (l'IA peut mettre des backticks)
    const jsonStr = content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    return JSON.parse(jsonStr);
  } catch (err) {
    console.error(`   ❌ Erreur OpenAI pour email ${email.id}:`, err.message);
    return null;
  }
}

/**
 * Parsing regex de base (fallback quand pas d'API key)
 * Moins précis mais permet de fonctionner sans OpenAI.
 */
function parseWithRegex(email) {
  const body = (email.body_text || '') + ' ' + (email.subject || '');
  const result = {
    is_relevant: true,
    contact: { name: email.sender_name, email: email.sender, phone: '' },
    email_type: 'other',
    dates: { check_in: null, check_out: null, week_number: null },
    guests: { adults: 1, children: 0 },
    pricing: { amount: 0, currency: 'EUR', type: null },
    status: 'unknown' ,
    is_confirmation: false,
    season: null,
    summary: '',
  };

  // Détecter les dates
  const datePatterns = [
    /du (\d{1,2})[\s/](\d{1,2})[\s/](\d{4})/i,
    /(\d{1,2})[\s/](\d{1,2})[\s/](\d{4})/,
  ];

  for (const pattern of datePatterns) {
    const match = body.match(pattern);
    if (match) {
      if (match.length === 4) {
        const d = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
        if (!result.dates.check_in) result.dates.check_in = d;
        else result.dates.check_out = d;
      }
    }
  }

  // Détecter le nombre de personnes
  const personMatch = body.match(/(\d+)\s*personnes?/i) || body.match(/(\d+)\s*pers/i) || body.match(/(\d+)\s*adultes?/i);
  if (personMatch) {
    result.guests.adults = parseInt(personMatch[1]);
  }

  // Détecter les enfants
  const childMatch = body.match(/(\d+)\s*enfants?/i);
  if (childMatch) {
    result.guests.children = parseInt(childMatch[1]);
  }

  // Détecter les prix
  const priceMatch = body.match(/(\d+[\s]?\d*)\s*[€euros]/i);
  if (priceMatch) {
    result.pricing.amount = parseInt(priceMatch[1].replace(/\s/g, ''));
    result.pricing.type = 'quoted';
  }

  // Détecter le type d'email
  if (/confirm|réserv|réserv|book/i.test(body)) {
    result.email_type = 'confirmation';
    result.is_confirmation = true;
    result.status = 'client';
  } else if (/annul|cancel/i.test(body) && !/pas annul|ne pas annul/i.test(body)) {
    result.email_type = 'cancellation';
    result.status = 'prospect';
  } else if (/information|disponibilit|tarif|prix|combien/i.test(body)) {
    result.email_type = 'info_request';
    result.status = 'prospect';
  }

  // Détecter la saison
  if (result.dates.check_in) {
    const month = parseInt(result.dates.check_in.split('-')[1]);
    const year = parseInt(result.dates.check_in.split('-')[0]);
    if (month >= 10) {
      result.season = `${year}-${year + 1}`;
    } else if (month <= 4) {
      result.season = `${year - 1}-${year}`;
    } else {
      result.season = `${year}-${year + 1}`;
    }
  }

  // Numéro de semaine
  if (result.dates.check_in) {
    const d = new Date(result.dates.check_in);
    const dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const firstThursday = d.getTime();
    d.setUTCMonth(0, 1);
    if (d.getUTCDay() !== 4) {
      d.setUTCMonth(0, 1 + ((4 - d.getUTCDay()) + 7) % 7);
    }
    result.dates.week_number = Math.ceil((firstThursday - d.getTime()) / 86400000 / 7) + 1;
  }

  result.summary = `Email de ${email.sender_name} : ${email.subject}`;
  result.is_relevant = !/no.?reply|newsletter|notification|spam|unsubscribe/i.test(body);

  return result;
}

// ============ DATABASE OPERATIONS ============

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function upsertContact(contactData) {
  const existing = db.prepare('SELECT id FROM contacts WHERE email = ?').get(contactData.email);

  if (existing) {
    // Mettre à jour le contact existant
    db.prepare(`
      UPDATE contacts SET
        name = COALESCE(NULLIF(?, ''), name),
        phone = COALESCE(NULLIF(?, ''), phone),
        last_contact_date = COALESCE(NULLIF(?, ''), last_contact_date),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(contactData.name, contactData.phone, new Date().toISOString(), existing.id);
    return existing.id;
  } else {
    // Nouveau contact
    const id = generateId();
    db.prepare(`
      INSERT INTO contacts (id, name, email, phone, origin, status, first_contact_date, last_contact_date)
      VALUES (?, ?, ?, ?, 'email', ?, ?, ?)
    `).run(
      id,
      contactData.name || contactData.email || 'Inconnu',
      contactData.email || '',
      contactData.phone || '',
      contactData.status === 'client' ? 'client' : 'prospect',
      new Date().toISOString(),
      new Date().toISOString(),
    );
    return id;
  }
}

function upsertStay(contactId, emailId, parsed) {
  if (!parsed.dates?.check_in) return null;

  const id = generateId();
  const nights = parsed.dates.check_out
    ? Math.round((new Date(parsed.dates.check_out).getTime() - new Date(parsed.dates.check_in).getTime()) / 86400000)
    : 7;

  db.prepare(`
    INSERT INTO stays (id, contact_id, season, check_in, check_out, nights, adults, children, price_quoted, price_confirmed, status, source_email_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(
    id,
    contactId,
    parsed.season || '',
    parsed.dates.check_in,
    parsed.dates.check_out || '',
    nights,
    parsed.guests?.adults || 1,
    parsed.guests?.children || 0,
    parsed.pricing?.amount || 0,
    parsed.is_confirmation ? 'confirmed' : 'pending',
    emailId,
    parsed.summary || '',
  );

  // Update contact total_stays
  db.prepare('UPDATE contacts SET total_stays = (SELECT COUNT(*) FROM stays WHERE contact_id = ?), status = ? WHERE id = ?')
    .run(contactId, parsed.is_confirmation ? 'client' : 'prospect', contactId);

  return id;
}

function upsertRequestedWeek(contactId, parsed) {
  if (!parsed.dates?.check_in) return null;

  const id = generateId();
  db.prepare(`
    INSERT INTO requested_weeks (id, contact_id, season, week_number, check_in, check_out, adults, children, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    contactId,
    parsed.season || '',
    parsed.dates.week_number || 0,
    parsed.dates.check_in,
    parsed.dates.check_out || '',
    parsed.guests?.adults || 1,
    parsed.guests?.children || 0,
    parsed.email_type === 'confirmation' ? 'booked' : parsed.email_type === 'cancellation' ? 'abandoned' : 'asked',
    parsed.summary || '',
  );
}

// ============ MAIN ============

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  AGENT DE PARSING IA DES EMAILS');
  console.log('═══════════════════════════════════════\n');

  const useAI = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-votre-cle-openai';
  console.log(`  Mode parsing : ${useAI ? '🧠 IA (OpenAI)' : '📝 Regex (fallback)'}`);
  console.log('');

  // Récupérer les emails non parsés
  const emails = db.prepare(`
    SELECT e.* FROM emails e
    LEFT JOIN stays s ON s.source_email_id = e.id
    WHERE e.parsed = 0 AND e.body_text != '' AND e.body_text IS NOT NULL
    GROUP BY e.id
    ORDER BY e.date ASC
  `).all();

  console.log(`📧 ${emails.length} emails à analyser\n`);

  if (emails.length === 0) {
    console.log('✅ Tous les emails sont déjà parsés !');
    db.close();
    return;
  }

  const markParsed = db.prepare('UPDATE emails SET parsed = 1 WHERE id = ?');
  let parsed = 0;
  let contacts = 0;
  let stays = 0;

  // Traiter les emails par lots pour éviter de saturer l'API
  const BATCH_SIZE = useAI ? 5 : 50;

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(async (email) => {
      try {
        const result = await parseEmail(email);

        if (!result || !result.is_relevant) {
          markParsed.run(email.id);
          return;
        }

        // Créer ou mettre à jour le contact
        if (result.contact?.email) {
          const contactId = upsertContact(result.contact);
          contacts++;

          // Créer un séjour si des dates sont trouvées
          if (result.dates?.check_in) {
            const stayId = upsertStay(contactId, email.id, result);
            if (stayId) stays++;
          }

          // Ajouter une semaine demandée si c'est une demande
          if (result.email_type === 'new_inquiry' || result.email_type === 'info_request') {
            upsertRequestedWeek(contactId, result);
          }
        }

        markParsed.run(email.id);
        parsed++;

        process.stdout.write(`   📨 ${parsed}/${emails.length} emails analysés...\r`);
      } catch (err) {
        console.error(`\n   ❌ Erreur sur email ${email.id}:`, err.message);
      }
    });

    await Promise.all(batchPromises);

    // Petite pause entre les lots pour l'API OpenAI
    if (useAI && i + BATCH_SIZE < emails.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n\n✅ Analyse terminée !`);
  console.log(`   📧 ${parsed} emails analysés`);
  console.log(`   👤 ${contacts} contacts créés/mis à jour`);
  console.log(`   🏠 ${stays} séjours créés`);
  console.log('');

  // Stats
  const stats = {
    total_emails: db.prepare('SELECT COUNT(*) as c FROM emails').get().c,
    total_contacts: db.prepare('SELECT COUNT(*) as c FROM contacts').get().c,
    total_stays: db.prepare('SELECT COUNT(*) as c FROM stays').get().c,
    total_requested: db.prepare('SELECT COUNT(*) as c FROM requested_weeks').get().c,
    clients: db.prepare("SELECT COUNT(*) as c FROM contacts WHERE status = 'client'").get().c,
    prospects: db.prepare("SELECT COUNT(*) as c FROM contacts WHERE status = 'prospect'").get().c,
  };

  console.log('📊 Base de données :');
  console.log(`   📧 ${stats.total_emails} emails`);
  console.log(`   👤 ${stats.total_contacts} contacts (${stats.clients} clients, ${stats.prospects} prospects)`);
  console.log(`   🏠 ${stats.total_stays} séjours`);
  console.log(`   📅 ${stats.total_requested} semaines demandées`);

  db.close();
}

main().catch(err => {
  console.error('❌ Erreur fatale:', err);
  process.exit(1);
});
