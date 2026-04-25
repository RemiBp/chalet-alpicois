/**
 * AGENT IA DE PARSING EMAIL (DeepSeek)
 *
 * Analyse chaque email pour en extraire les infos structurées :
 *   - Contact (nom, email, téléphone)
 *   - Dates de séjour, nombre de personnes
 *   - Prix demandé/confirmé
 *   - Statut (client/prospect)
 *   - Saison
 *
 * Utilise DeepSeek API via le SDK OpenAI (compatible).
 */

import 'dotenv/config';
import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '../emails.db';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ============ DEEPSEEK CLIENT ============

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

function createDeepSeekClient() {
  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'sk-votre-cle-openai') {
    return null;
  }
  // On utilise l'API OpenAI directement via fetch pour éviter la dépendance
  return {
    async chat(messages, options = {}) {
      const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: options.model || 'deepseek-chat',
          messages,
          temperature: options.temperature ?? 0.1,
          max_tokens: options.maxTokens ?? 500,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`DeepSeek API ${response.status}: ${err}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    },
  };
}

const deepseek = createDeepSeekClient();

// ============ PROMPT DE PARSING ============

const SYSTEM_PROMPT = `Tu es un assistant spécialisé dans la gestion de locations saisonnières pour "Chalet Alpicois" à La Plagne.

Analyse l'email ci-dessous et retourne UNIQUEMENT un objet JSON valide (sans markdown, sans texte autour) :

{
  "contact": {
    "name": "Nom complet du contact",
    "email": "email@example.com",
    "phone": "numéro si trouvé sinon vide"
  },
  "email_type": "new_inquiry" | "follow_up" | "confirmation" | "cancellation" | "info_request" | "other",
  "dates": { "check_in": "YYYY-MM-DD ou null", "check_out": "YYYY-MM-DD ou null" },
  "guests": { "adults": nombre, "children": nombre },
  "pricing": { "amount": nombre, "currency": "EUR" },
  "status": "client" | "prospect" | "former_client" | "unknown",
  "is_confirmation": true/false,
  "season": "2024-2025" ou "2025-2026" ou "2023-2024",
  "needs_reply": true/false,
  "urgency": "low" | "normal" | "high",
  "summary": "Résumé en français en 1-2 phrases"
}

Règles : is_confirmation = true si l'email confirme une réservation. needs_reply = true si une réponse est attendue. urgency : high = demande urgente (délai court, arrivée imminente). Saison : Oct-Avr = hiver, Mai-Sep = été.`;

// ============ PARSING AVEC DEEPSEEK ============

async function parseEmail(email) {
  // Fallback regex si DeepSeek n'est pas configuré
  if (!deepseek) {
    return parseWithRegex(email);
  }

  const userContent = `Sujet: ${email.subject}\nDe: ${email.sender_name} <${email.sender}>\nDate: ${email.date}\n\nCorps du message:\n${(email.body_text || '').substring(0, 4000)}`;

  try {
    const content = await deepseek.chat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ], { temperature: 0.1, maxTokens: 600 });

    // Nettoyer et parser le JSON
    const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(clean);

    // Enrichir avec les infos de base
    result.contact = result.contact || {};
    if (!result.contact.name) result.contact.name = email.sender_name;
    if (!result.contact.email) result.contact.email = email.sender;

    return result;
  } catch (err) {
    console.error(`   ⚠️ DeepSeek parse error for ${email.id}:`, err.message);
    console.log(`   Falling back to regex parsing...`);
    return parseWithRegex(email);
  }
}

// ============ FALLBACK REGEX ============

function parseWithRegex(email) {
  const body = (email.body_text || '') + ' ' + (email.subject || '');
  const result = {
    contact: { name: email.sender_name, email: email.sender, phone: '' },
    email_type: 'other',
    dates: { check_in: null, check_out: null },
    guests: { adults: 1, children: 0 },
    pricing: { amount: 0, currency: 'EUR' },
    status: 'unknown',
    is_confirmation: false,
    season: null,
    needs_reply: false,
    urgency: 'normal',
    summary: `Email de ${email.sender_name} : ${email.subject}`,
  };

  const dates = body.match(/du (\d{1,2})[\/\s](\d{1,2})[\/\s](\d{4})/);
  if (dates) result.dates.check_in = `${dates[3]}-${dates[2].padStart(2,'0')}-${dates[1].padStart(2,'0')}`;

  const ppl = body.match(/(\d+)\s*personnes?/i) || body.match(/(\d+)\s*pers/i);
  if (ppl) result.guests.adults = parseInt(ppl[1]);

  const kids = body.match(/(\d+)\s*enfants?/i);
  if (kids) result.guests.children = parseInt(kids[1]);

  const price = body.match(/(\d[\s\d]*)\s*[€euros]/i);
  if (price) result.pricing.amount = parseInt(price[1].replace(/\s/g, ''));

  if (/confirm|réserv|book/i.test(body)) {
    result.email_type = 'confirmation'; result.is_confirmation = true; result.status = 'client';
  } else if (/information|disponibilit|tarif|prix/i.test(body) && !result.is_confirmation) {
    result.email_type = 'info_request'; result.status = 'prospect';
  }

  result.needs_reply = !email.sender?.includes('alpicois-laplagne.fr') && result.email_type !== 'other';

  return result;
}

// ============ GÉNÉRATION DE RÉPONSE AUTOMATIQUE ============

const REPLY_PROMPT = `Tu es Gille, le propriétaire du Chalet Alpicois à La Plagne.
Tu réponds aux emails de façon professionnelle et chaleureuse en français.

Voici un email reçu. Tu as vérifié les disponibilités. Génère une réponse adaptée.

Contexte :
- Le chalet peut accueillir jusqu'à 6 personnes
- Tarifs : basse saison 2200€, moyenne saison 2800€, haute saison 3200-4200€
- Semaine type : arrivée samedi 16h, départ samedi 10h

Règles de réponse :
1. Si la semaine demandée est disponible : confirmer, donner le prix, proposer un paiement
2. Si pas disponible : proposer une alternative (autre semaine)
3. Si pas disponible du tout : décliner poliment et proposer de tenir au courant pour les désistements

Retourne UNIQUEMENT un objet JSON :
{
  "should_reply": true/false,
  "reply_type": "available" | "alternative" | "unavailable" | "info" | "no_reply",
  "reply_subject": "Objet de la réponse",
  "reply_body": "Contenu de la réponse en français (naturel et chaleureux)",
  "alternative_weeks": [ { "check_in": "YYYY-MM-DD", "check_out": "YYYY-MM-DD", "price": nombre } ] ou []
}`;
export async function generateAutoReply(email, availability = {}) {
  if (!deepseek) {
    return { should_reply: false, reply_type: 'no_reply', reply_subject: '', reply_body: '', alternative_weeks: [] };
  }

  const userContent = `Email reçu :
Sujet: ${email.subject}
De: ${email.sender_name}
Date: ${email.date}
Corps:
${(email.body_text || '').substring(0, 3000)}

Disponibilités actuelles du chalet : ${JSON.stringify(availability)}`;

  try {
    const content = await deepseek.chat([
      { role: 'system', content: REPLY_PROMPT },
      { role: 'user', content: userContent },
    ], { temperature: 0.3, maxTokens: 800 });

    const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error(`   ⚠️ Reply generation error:`, err.message);
    return { should_reply: false, reply_type: 'no_reply', reply_subject: '', reply_body: '', alternative_weeks: [] };
  }
}

// ============ GÉNÉRATION D'ID ============

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ============ TRAITEMENT DES EMAILS ============

async function processEmails() {
  const emails = db.prepare(`
    SELECT * FROM emails WHERE parsed = 0 AND body_text != '' AND body_text IS NOT NULL ORDER BY date ASC
  `).all();

  console.log(`📧 ${emails.length} emails à analyser avec DeepSeek\n`);

  if (emails.length === 0) {
    console.log('✅ Tous les emails sont déjà parsés !');
    return;
  }

  const markParsed = db.prepare('UPDATE emails SET parsed = 1 WHERE id = ?');
  let parsed = 0, contacts = 0, stays = 0, replies = 0;

  for (let i = 0; i < emails.length; i += 3) {
    const batch = emails.slice(i, i + 3);

    await Promise.all(batch.map(async (email) => {
      try {
        const result = await parseEmail(email);
        if (!result?.contact?.email) {
          markParsed.run(email.id);
          return;
        }

        // Upsert contact
        const existing = db.prepare('SELECT id FROM contacts WHERE email = ?').get(result.contact.email);
        let contactId;
        if (existing) {
          contactId = existing.id;
          db.prepare(`UPDATE contacts SET name = COALESCE(NULLIF(?, ''), name), phone = CASE WHEN ? != '' THEN ? ELSE phone END, last_contact_date = ?, updated_at = datetime('now') WHERE id = ?`)
            .run(result.contact.name, result.contact.phone, result.contact.phone, email.date, contactId);
        } else {
          contactId = generateId();
          db.prepare(`INSERT INTO contacts (id, name, email, phone, status, first_contact_date, last_contact_date) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(contactId, result.contact.name || result.contact.email, result.contact.email, result.contact.phone || '',
                 result.status === 'client' ? 'client' : 'prospect', email.date, email.date);
          contacts++;
        }

        // Si dates trouvées → créer un séjour
        if (result.dates?.check_in) {
          const nights = result.dates.check_out
            ? Math.round((new Date(result.dates.check_out) - new Date(result.dates.check_in)) / 86400000)
            : 7;
          db.prepare(`INSERT INTO stays (id, contact_id, season, check_in, check_out, nights, adults, children, price_quoted, status, source_email_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(generateId(), contactId, result.season || '', result.dates.check_in, result.dates.check_out || '',
                 nights, result.guests?.adults || 1, result.guests?.children || 0, result.pricing?.amount || 0,
                 result.is_confirmation ? 'confirmed' : 'pending', email.id, result.summary || '');
          stays++;
        }

        // Si demande + besoin de réponse → créer une auto-reply en attente
        if (result.needs_reply && result.email_type !== 'confirmation' && result.email_type !== 'other') {
          const reply = await generateAutoReply(email);
          if (reply.should_reply) {
            db.prepare(`INSERT INTO auto_replies (id, email_id, contact_id, reply_type, reply_subject, reply_body, alternative_weeks, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'))`)
              .run(generateId(), email.id, contactId, reply.reply_type, reply.reply_subject || '', reply.reply_body || '',
                   JSON.stringify(reply.alternative_weeks || []));
            replies++;
          }
        }

        markParsed.run(email.id);
        parsed++;
        process.stdout.write(`   📨 ${parsed}/${emails.length} emails...\r`);
      } catch (err) {
        console.error(`\n   ❌ Erreur email ${email.id}:`, err.message);
        markParsed.run(email.id);
      }
    }));

    // Petite pause entre les lots pour respecter les limites API
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n\n✅ Résultats :`);
  console.log(`   📧 ${parsed} emails analysés`);
  console.log(`   👤 ${contacts} nouveaux contacts`);
  console.log(`   🏠 ${stays} séjours créés`);
  console.log(`   🤖 ${replies} réponses auto générées (en attente de validation)`);
}

// ============ MAIN ============

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  🧠 AGENT DE PARSING DEEPSEEK');
  console.log('═══════════════════════════════════════\n');

  if (!deepseek) {
    console.log('⚠️  DeepSeek non configuré. Utilisation du parseur regex (basique).');
    console.log('   Configurez DEEPSEEK_API_KEY dans .env pour le parsing IA.\n');
  } else {
    console.log('✅ DeepSeek connecté');
    // Test de connexion
    try {
      const test = await deepseek.chat([
        { role: 'user', content: 'Réponds uniquement "OK" si tu me reçois.' },
      ], { temperature: 0, maxTokens: 10 });
      console.log(`   Test API: ${test}\n`);
    } catch (err) {
      console.log(`   ⚠️ Test DeepSeek échoué: ${err.message}. Utilisation du fallback regex.\n`);
    }
  }

  await processEmails();

  // Stats
  const stats = {
    emails: db.prepare('SELECT COUNT(*) as c FROM emails').get().c,
    contacts: db.prepare('SELECT COUNT(*) as c FROM contacts').get().c,
    stays: db.prepare('SELECT COUNT(*) as c FROM stays').get().c,
    replies: db.prepare('SELECT COUNT(*) as c FROM auto_replies').get()?.c || 0,
  };
  console.log(`\n📊 Base : ${stats.emails} emails · ${stats.contacts} contacts · ${stats.stays} séjours · ${stats.replies} réponses auto`);
  db.close();
}

main().catch(err => { console.error('❌', err); process.exit(1); });
