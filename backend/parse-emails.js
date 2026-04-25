/**
 * AGENT IA DE PARSING EMAIL (DeepSeek V4 Pro)
 *
 * Stratégie :
 *   - Analyse TOUS les emails sans exception (INBOX + Sent)
 *   - DeepSeek détermine lui-même si l'email contient des infos utiles
 *   - Croise les infos des emails entrants et sortants pour un même contact
 *   - Ne crée JAMAIS de séjour pour l'hôte (contact@alpicois-laplagne.fr)
 *   - Dédoublonnage : un même (contact + dates) ne crée qu'un seul séjour
 */

import 'dotenv/config';
import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '../emails.db';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ============ CONFIG DEEPSEEK ============

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const MODEL = 'deepseek-v4-flash';

function createDeepSeekClient() {
  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'sk-votre-cle-openai') {
    return null;
  }
  return {
    async chat(messages, options = {}) {
      const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: options.model || MODEL,
          messages,
          temperature: options.temperature ?? 0.05,
          max_tokens: options.maxTokens ?? 600,
          thinking: { type: 'disabled' },
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

// ============ HOST EMAIL ============

const HOST_EMAILS = ['contact@alpicois-laplagne.fr'];

function isHostEmail(email) {
  return HOST_EMAILS.some(h => (email || '').toLowerCase() === h.toLowerCase());
}

// ============ PROMPT ============

const SYSTEM_PROMPT = `Tu es un assistant expert en analyse d'emails pour "Chalet Alpicois" à La Plagne (location saisonnière).

Tu reçois un email. Tu dois extraire UNIQUEMENT les informations LITTÉRALES présentes dans l'email.

RÈGLES STRICTES — ATTENTION, CES RÈGLES SONT CRITIQUES :
1. PRIX : Extrais le montant EXACT mentionné (ex: "2990€" → 2990, "2700 euros" → 2700). Si aucun prix n'est mentionné explicitement, mets 0. N'INVENTE JAMAIS UN PRIX.
2. DATES : Extrais les dates EXACTES. "du 11 au 18 février 2024" → check_in="2024-02-11", check_out="2024-02-18". Utilise le contexte de la conversation (sujet "Re: Réservation pour semaine du 21 décembre" → les dates sont dans le sujet). Si pas de date, mets null.
3. is_confirmation = true UNIQUEMENT si l'email contient une confirmation CLAIRE et EXplicite qu'une réservation est validée. Exemples : "c'est bon pour la semaine", "je confirme", "réservation confirmée", "OK je prends", "merci je confirme", "arrangement conclu", "le chalet est réservé", "d'accord pour ces dates". Les simples demandes d'info ou propositions de prix ne sont PAS des confirmations.
4. CONTACT PRINCIPAL :
   - INBOX (email REÇU) : Le contact est l'EXPÉDITEUR
   - INBOX.Sent (email ENVOYÉ par l'hôte) : Le contact est le DESTINATAIRE. Cherche son email/piétine dans le corps ou le sujet. Si tu ne trouves PAS de nom de destinataire clair, mets contact.email = null (ne prends PAS l'hôte comme contact).
5. is_from_host = true UNIQUEMENT si l'expéditeur est le gérant (contact@alpicois-laplagne.fr).
6. Si l'email à l'air d'être une newsletter, notification automatique, ou email purement informatif sans rapport avec une réservation → has_info = false.
7. Pour les emails SENT (réponses du gérant) : même si l'email traite de disponibilités générales, si tu identifies un destinataire précis qui est un client potentiel, has_info = true et extrait ses infos.

Retourne UNIQUEMENT ce JSON valide (pas de markdown, pas de texte autour) :

{
  "has_info": true/false,
  "contact": {
    "name": "Nom complet du contact ou null",
    "email": "email du destinataire (pour SENT) ou expéditeur (pour INBOX) ou null",
    "phone": "numéro de téléphone ou ''"
  },
  "email_type": "inquiry" | "confirmation" | "pricing" | "cancellation" | "newsletter" | "notification" | "other",
  "is_newsletter": true/false,
  "dates": {
    "check_in": "YYYY-MM-DD ou null",
    "check_out": "YYYY-MM-DD ou null"
  },
  "guests": {
    "adults": nombre ou 0,
    "children": nombre ou 0
  },
  "price": nombre ou 0 (UNIQUEMENT si littéral dans l'email),
  "is_confirmation": true/false (STRICT : seulement si confirmation explicite),
  "is_from_host": true/false,
  "nationality": "Nationalité du contact si identifiable (ex: Française, Néerlandaise, Britannique, Belge, Allemande, etc.) ou ''",
  "summary": "Résumé factuel en 1 phrase ou null"
}

RAPPEL CRITIQUE : n'invente RIEN. Si tu n'es pas sûr, mets null ou 0.`;

  // ============ PARSING ============

// ============ PARSING ============

async function parseEmail(email, retryCount = 0) {
  const direction = email.mailbox === 'INBOX.Sent' ? 'ENVOYÉ' : 'REÇU';
  const userContent = `Email ${direction}
Sujet: ${email.subject || ''}
De: ${email.sender_name || ''} <${email.sender || ''}>
Date: ${email.date || ''}
Corps:
${(email.body_text || '').substring(0, 3000)}`;

  try {
    const content = await deepseek.chat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ], { temperature: retryCount > 0 ? 0.1 : 0.05, maxTokens: 800 });

    const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(clean);

    result.contact = result.contact || {};
    result.dates = result.dates || {};
    result.guests = result.guests || {};

    return result;
  } catch (err) {
    if (retryCount < 2) {
      // Retry avec un prompt simplifié
      console.warn(`   🔄 Retry ${retryCount + 1} email ${email.id}: ${err.message}`);
      await new Promise(r => setTimeout(r, 1000));
      // Prompt simplifié pour le retry
      const simpleContent = `Sujet: ${email.subject || ''}\nDe: ${email.sender_name || ''}\nDate: ${email.date || ''}\n\nCorps:\n${(email.body_text || '').substring(0, 1500)}`;
      const retryContent = await deepseek.chat([
        { role: 'system', content: 'Tu extrais UNIQUEMENT un JSON valide de cet email. Si pas de contenu utile, réponds {"has_info":false}. Toujours du JSON valide.' },
        { role: 'user', content: simpleContent },
      ], { temperature: 0.1, maxTokens: 600 });
      const clean = retryContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const result = JSON.parse(clean);
      result.contact = result.contact || {};
      result.dates = result.dates || {};
      result.guests = result.guests || {};
      return result;
    }
    console.error(`   ⚠️ DeepSeek error email ${email.id}: ${err.message}`);
    return { has_info: false, contact: {}, dates: {}, guests: {}, is_newsletter: false };
  }
}

// ============ ID ============

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ============ BATCH ============

async function parseBatch(emails) {
  const results = [];
  for (const email of emails) {
    try {
      const r = await parseEmail(email);
      results.push({ email, parsed: r });
    } catch (err) {
      console.error(`   ❌ Fatal email ${email.id}: ${err.message}`);
      results.push({ email, parsed: null });
    }
  }
  return results;
}

// ============ TRAITEMENT ============

async function processEmails() {
  // TOUS les emails non parsés
  // Priorité : d'abord les SENT (réponses de l'hôte), puis INBOX
  // Les SENT contiennent les prix et confirmations, ils doivent être parsés en premier
  const emailsSent = db.prepare(`
    SELECT * FROM emails 
    WHERE parsed = 0 
      AND body_text != '' 
      AND body_text IS NOT NULL 
      AND mailbox = 'INBOX.Sent'
    ORDER BY date ASC
  `).all();

  const emailsInbox = db.prepare(`
    SELECT * FROM emails 
    WHERE parsed = 0 
      AND body_text != '' 
      AND body_text IS NOT NULL 
      AND mailbox = 'INBOX'
    ORDER BY date ASC
  `).all();

  const emails = [...emailsSent, ...emailsInbox];

  console.log(`📧 ${emails.length} emails à analyser avec DeepSeek V4 Pro\n`);

  if (emails.length === 0) {
    console.log('✅ Aucun email à analyser.');
    return;
  }

  const markParsed = db.prepare('UPDATE emails SET parsed = 1 WHERE id = ?');
  const getContactByEmail = db.prepare('SELECT id, name FROM contacts WHERE email = ?');
  const insertContact = db.prepare(`
    INSERT INTO contacts (id, name, email, phone, nationality, status, first_contact_date, last_contact_date, total_stays)
    VALUES (?, ?, ?, ?, ?, 'prospect', ?, ?, 0)
  `);
  const updateContact = db.prepare(`
    UPDATE contacts SET 
      name = CASE WHEN ? != '' AND ? IS NOT NULL THEN ? ELSE name END,
      phone = CASE WHEN ? != '' THEN ? ELSE phone END,
      last_contact_date = CASE WHEN ? > last_contact_date THEN ? ELSE last_contact_date END,
      updated_at = datetime('now')
    WHERE id = ?
  `);
  const getContactStays = db.prepare('SELECT * FROM stays WHERE contact_id = ? ORDER BY check_in');
  const insertStay = db.prepare(`
    INSERT INTO stays (id, contact_id, season, check_in, check_out, nights, adults, children, price_quoted, status, source_email_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateStayPriceConfirmed = db.prepare(`
    UPDATE stays SET price_confirmed = ?, status = 'confirmed', notes = ? WHERE id = ?
  `);
  const updateStayPrice = db.prepare(`
    UPDATE stays SET price_quoted = ?, notes = ? WHERE id = ?
  `);

  let parsed = 0;
  let newContacts = 0;
  let newStays = 0;
  let enrichedStays = 0;
  let skippedNoInfo = 0;
  let skippedHost = 0;
  let errors = 0;

  for (let i = 0; i < emails.length; i += 10) {
    const batch = emails.slice(i, i + 10);
    const results = await parseBatch(batch);

    for (const { email, parsed: r } of results) {
      try {
        if (!r) {
          markParsed.run(email.id);
          errors++;
          continue;
        }

        // DeepSeek dit que l'email n'a pas d'info utile
        if (r.has_info === false) {
          markParsed.run(email.id);
          skippedNoInfo++;
          continue;
        }

        // Déterminer l'email contact
        let contactEmail = null;
        let contactName = null;
        let contactPhone = '';

        if (isHostEmail(email.sender)) {
          // Email ENVOYÉ par l'hôte → contact = destinataire (extrait par DeepSeek)
          contactEmail = r.contact?.email || null;
          contactName = r.contact?.name || null;
          contactPhone = r.contact?.phone || '';
        } else {
          // Email REÇU → contact = expéditeur
          contactEmail = email.sender;
          contactName = email.sender_name || r.contact?.name || null;
          contactPhone = r.contact?.phone || '';
        }

        if (!contactEmail || contactEmail === 'null') {
          markParsed.run(email.id);
          continue;
        }

        // Ne JAMAIS créer de contact/séjour pour l'hôte
        if (isHostEmail(contactEmail)) {
          markParsed.run(email.id);
          skippedHost++;
          continue;
        }

        // === UPSERT CONTACT ===
        let existingContact = getContactByEmail.get(contactEmail);
        let contactId;

        if (existingContact) {
          contactId = existingContact.id;
          updateContact.run(
            contactName, contactName, contactName,
            contactPhone, contactPhone,
            email.date, email.date, contactId
          );
        } else {
          contactId = generateId();
          insertContact.run(
            contactId,
            contactName || contactEmail,
            contactEmail,
            contactPhone,
            r.nationality || '',
            email.date, email.date
          );
          newContacts++;
        }

        // === TRAITER LE SÉJOUR ===
        const checkIn = r.dates?.check_in;
        const checkOut = r.dates?.check_out;
        const price = r.price || 0;
        const adults = r.guests?.adults || 0;
        const children = r.guests?.children || 0;
        const isConfirmation = r.is_confirmation === true;
        const isFromHost = r.is_from_host === true;

        if (checkIn && checkIn !== 'null') {
          const existingStays = getContactStays.all(contactId);
          const existingStay = existingStays.find(s =>
            s.check_in === checkIn &&
            (checkOut === 'null' || !checkOut || s.check_out === checkOut || !s.check_out)
          );

          const nights = checkOut && checkOut !== 'null'
            ? Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000)
            : 7;

          if (existingStay) {
            // Enrichir le séjour existant
            if ((isConfirmation || (isFromHost && price > 0)) && existingStay.status !== 'confirmed') {
              updateStayPriceConfirmed.run(price, r.summary || existingStay.notes, existingStay.id);
            } else if (price > 0 && existingStay.price_quoted === 0) {
              updateStayPrice.run(price, r.summary || existingStay.notes, existingStay.id);
            }
            enrichedStays++;
          } else {
            const season = computeSeason(checkIn);
            const stayStatus = isConfirmation ? 'confirmed' : 'pending';
            insertStay.run(
              generateId(), contactId, season,
              checkIn, checkOut || '', nights,
              adults || 1, children || 0,
              price, stayStatus, email.id, r.summary || ''
            );
            newStays++;
          }
        }

        markParsed.run(email.id);
        parsed++;

        if (parsed % 50 === 0) {
          process.stdout.write(`   📨 ${parsed}/${emails.length} emails... (${newContacts} contacts, ${newStays} séjours, ${skippedNoInfo} ignorés)\r`);
        }
      } catch (err) {
        console.error(`\n   ❌ Erreur email ${email.id}: ${err.message}`);
        markParsed.run(email.id);
        errors++;
      }
    }

    await new Promise(r => setTimeout(r, 300));
  }

  // === POST-TRAITEMENT ===
  console.log(`\n\n📊 Post-traitement...`);

  // Mettre à jour total_stays
  db.prepare(`
    UPDATE contacts SET total_stays = (
      SELECT COUNT(*) FROM stays WHERE stays.contact_id = contacts.id
    )
  `).run();

  // Statut "client" : au moins 1 séjour confirmé avec prix > 1000€
  db.prepare(`
    UPDATE contacts SET status = 'client' WHERE id IN (
      SELECT DISTINCT contact_id FROM stays 
      WHERE status IN ('confirmed', 'paid') 
        AND (price_confirmed > 1000 OR (price_confirmed = 0 AND price_quoted > 1000))
    )
  `).run();
  db.prepare(`UPDATE contacts SET status = 'prospect' WHERE status != 'client'`).run();

  // RAPPORT
  const finalContacts = db.prepare("SELECT status, COUNT(*) as c FROM contacts GROUP BY status").all();
  const finalStays = db.prepare("SELECT status, COUNT(*) as c FROM stays GROUP BY status").all();
  const totalContacts = db.prepare("SELECT COUNT(*) as c FROM contacts").get().c;
  const totalStays = db.prepare("SELECT COUNT(*) as c FROM stays").get().c;
  const totalRevenue = db.prepare("SELECT COALESCE(SUM(price_confirmed),0) as rev FROM stays WHERE status IN ('confirmed','paid')").get().rev;
  const totalQuoted = db.prepare("SELECT COALESCE(SUM(price_quoted),0) as rev FROM stays").get().rev;

  console.log(`\n═══════════════════════════════════════`);
  console.log(`✅ PARSING TERMINÉ`);
  console.log(`═══════════════════════════════════════`);
  console.log(`📧 ${parsed} emails analysés (${errors} erreurs)`);
  console.log(`⏭️  ${skippedNoInfo} ignorés (newsletters/notifications)`);
  console.log(`⏭️  ${skippedHost} emails hôte ignorés`);
  console.log(``);
  console.log(`👤 ${totalContacts} contacts`);
  for (const c of finalContacts) console.log(`   · ${c.status} : ${c.c}`);
  console.log(`🏠 ${totalStays} séjours`);
  for (const s of finalStays) console.log(`   · ${s.status} : ${s.c}`);
  console.log(`💰 Revenus confirmés : ${totalRevenue}€`);
  console.log(`💰 Total devis : ${totalQuoted}€`);
  console.log(`📈 ${newContacts} contacts · ${newStays} séjours · ${enrichedStays} enrichis`);
  console.log(``);

  db.close();
}

function computeSeason(checkIn) {
  if (!checkIn) return '';
  const d = new Date(checkIn);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  if (month >= 10) return `${year}-${year + 1}`;
  if (month <= 4) return `${year - 1}-${year}`;
  return `${year}`;
}

// ============ MAIN ============

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  🧠 PARSING DEEPSEEK V4 PRO');
  console.log('  📧 Tous les emails analysés');
  console.log('═══════════════════════════════════════\n');

  if (!deepseek) {
    console.log('⚠️  DeepSeek non configuré.');
    process.exit(1);
  }

  console.log('✅ DeepSeek connecté');
  try {
    const test = await deepseek.chat([
      { role: 'user', content: 'Réponds uniquement "OK" si tu me reçois.' },
    ], { temperature: 0, maxTokens: 10 });
    console.log(`   Test API: ${test}\n`);
  } catch (err) {
    console.log(`   ⚠️ Test API échoué: ${err.message}`);
    process.exit(1);
  }

  await processEmails();
}

main().catch(err => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
