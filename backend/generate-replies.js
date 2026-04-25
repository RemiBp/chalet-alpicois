/**
 * Génère les réponses automatiques pour les emails non traités.
 * Parcourt les emails parsés et utilise DeepSeek pour générer
 * des réponses professionnelles aux demandes de réservation.
 *
 * Usage: node generate-replies.js
 */

import 'dotenv/config';
import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '../emails.db';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ═══════════════════════════════════════════════
//  DEEPSEEK CLIENT
// ═══════════════════════════════════════════════

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

async function deepseekChat(messages, options = {}) {
  if (!DEEPSEEK_API_KEY) return null;
  const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: options.model || 'deepseek-v4-flash',
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 800,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API ${response.status}: ${err}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ═══════════════════════════════════════════════
//  PROMPTS
// ═══════════════════════════════════════════════

const REPLY_PROMPT = `Tu es Gille, le propriétaire du Chalet Alpicois à La Plagne.
Tu réponds aux emails de réservation de façon professionnelle et chaleureuse.

Analyse l'email reçu et décide du type de réponse à envoyer :

1. "available" : la semaine est disponible → confirme le prix et propose de réserver
2. "alternative" : la semaine n'est pas disponible → propose des alternatives (dans la même saison)
3. "unavailable" : rien de disponible → décline poliment
4. "info" : simple demande d'info → réponds avec les infos générales
5. "no_reply" : pas besoin de réponse humaine (merci, etc.)

Réponds UNIQUEMENT au format JSON suivant :
{
  "should_reply": true/false,
  "reply_type": "available|alternative|unavailable|info|no_reply",
  "reply_subject": "Sujet de la réponse",
  "reply_body": "Corps de l'email en français (2-3 phrases max, ton pro et chaleureux)",
  "alternative_weeks": [
    { "check_in": "YYYY-MM-DD", "check_out": "YYYY-MM-DD", "price": 2500 }
  ]
}`;

// ═══════════════════════════════════════════════
//  GENERATION
// ═══════════════════════════════════════════════

async function generateReply(emailId, subject, sender, senderName, bodyText) {
  const userContent = `Sujet: ${subject}\nDe: ${senderName} <${sender}>\n\nCorps du message:\n${(bodyText || '').substring(0, 3000)}`;

  try {
    const content = await deepseekChat([
      { role: 'system', content: REPLY_PROMPT },
      { role: 'user', content: userContent },
    ]);

    if (!content) return null;
    const clean = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error(`   ⚠️ Reply error for ${emailId}:`, err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  🤖 GÉNÉRATION DE RÉPONSES AUTO');
  console.log('═══════════════════════════════════════\n');

  if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY.startsWith('sk-votre')) {
    console.log('⚠️  DeepSeek non configuré. Passez DEEPSEEK_API_KEY dans .env');
    process.exit(1);
  }

  // Test DeepSeek
  try {
    const test = await deepseekChat([{ role: 'user', content: 'Réponds OK' }]);
    console.log('✅ DeepSeek connecté\n');
  } catch (err) {
    console.log(`❌ DeepSeek indisponible: ${err.message}`);
    process.exit(1);
  }

  // Trouver les emails qui méritent une réponse auto
  // = ceux qui sont des demandes de réservation (pas les notifications, newsletters, etc.)
  const emailsToProcess = db.prepare(`
    SELECT e.id, e.subject, e.sender, e.sender_name, e.body_text, e.date,
           c.id as contact_id, c.name as contact_name
    FROM emails e
    JOIN contacts c ON c.email = e.sender
    WHERE e.parsed = 1
      AND e.body_text != ''
      AND e.body_text IS NOT NULL
      AND e.mailbox = 'INBOX'
      AND e.sender NOT LIKE '%leboncoin%'
      AND e.sender NOT LIKE '%noreply%'
      AND e.sender NOT LIKE '%no-reply%'
      AND e.sender NOT LIKE '%mailjet%'
      AND e.sender NOT LIKE '%newsletter%'
      AND e.sender NOT LIKE '%info@%'
      AND e.sender != 'contact@alpicois-laplagne.fr'
      AND NOT EXISTS (SELECT 1 FROM auto_replies ar WHERE ar.email_id = e.id)
    ORDER BY e.date ASC
    LIMIT 200
  `).all();

  console.log(`📧 ${emailsToProcess.length} emails à traiter pour réponse auto\n`);

  if (emailsToProcess.length === 0) {
    console.log('✅ Tous les emails ont déjà une réponse auto générée !');
    process.exit(0);
  }

  const insertReply = db.prepare(`
    INSERT INTO auto_replies (id, email_id, contact_id, reply_type, reply_subject, reply_body, alternative_weeks, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'))
  `);

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < emailsToProcess.length; i += 5) {
    const batch = emailsToProcess.slice(i, i + 5);

    await Promise.all(batch.map(async (email) => {
      try {
        const reply = await generateReply(email.id, email.subject, email.sender, email.sender_name, email.body_text);
        if (reply && reply.should_reply) {
          insertReply.run(
            generateId(),
            email.id,
            email.contact_id,
            reply.reply_type,
            reply.reply_subject || '',
            reply.reply_body || '',
            JSON.stringify(reply.alternative_weeks || []),
          );
          success++;
        } else {
          // Marquer qu'on a déjà évalué mais pas de réponse nécessaire
          failed++;
        }
        process.stdout.write(`   🤖 ${success} réponses générées...\r`);
      } catch (err) {
        console.error(`\n   ❌ Erreur email ${email.id}:`, err.message);
        failed++;
      }
    }));

    // Pause entre les batches
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n\n✅ ${success} réponses auto générées (${failed} ignorées)`);
  console.log(`📊 Total dans la DB: ${db.prepare('SELECT COUNT(*) as c FROM auto_replies').get().c} réponses`);

  db.close();
}

main().catch(err => { console.error('❌', err); process.exit(1); });
