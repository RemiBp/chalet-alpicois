/**
 * Enrichit chaque fiche contact à partir de TOUTE la conversation email (DeepSeek).
 * Remplit coordonnées, origine, notes, semaines demandées (inquiries uniquement).
 *
 * Usage:
 *   node backend/enrich-contacts.js           # contacts non enrichis
 *   node backend/enrich-contacts.js --force   # tout retraiter
 *   node backend/enrich-contacts.js --limit 20
 */

import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });
const DB_PATH = process.env.DB_PATH?.startsWith('/')
  ? process.env.DB_PATH
  : join(__dirname, '..', process.env.DB_PATH?.replace(/^\.\.\//, '') || 'emails.db');
const FORCE = process.argv.includes('--force');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 0;
})();

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

try { db.exec('ALTER TABLE contacts ADD COLUMN profile_json TEXT DEFAULT \'{}\''); } catch { /* exists */ }
try { db.exec('ALTER TABLE contacts ADD COLUMN enriched_at TEXT'); } catch { /* exists */ }

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

async function deepseekChat(messages, maxTokens = 1200) {
  const response = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.05,
      max_tokens: maxTokens,
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

const SYSTEM_PROMPT = `Tu es un assistant pour "Chalet Alpicois" (location saisonnière à La Plagne, 10 personnes max).

On te donne la conversation email COMPLÈTE entre le gérant (contact@alpicois-laplagne.fr) et un correspondant.

Extrais UNIQUEMENT ce qui est littéralement présent ou clairement déductible (nationalité via langue/nom, origine via mention "site La Plagne", etc.).

RÈGLES :
- Ne marque JAMAIS une réservation comme confirmée sauf phrase explicite ("je confirme", "c'est bon", "réservé").
- Les semaines mentionnées = inquiries avec status "asked" | "negotiating" | "abandoned" uniquement.
- Prix : montant exact si écrit, sinon 0.
- Téléphones, adresses : texte exact du mail.
- origin : email | website | recommendation | phone | whatsapp | social | other
  - website si formulaire site alpicois / la-plagne
  - recommendation si parrainage / "un ami m'a donné"
- summary : synthèse factuelle 2-3 phrases de la relation et des demandes.

JSON UNIQUEMENT (pas de markdown) :

{
  "name": "Nom de famille ou nom complet",
  "first_name": "Prénom ou ''",
  "phone": "",
  "alternate_phones": [],
  "alternate_emails": [],
  "address": "",
  "postal_code": "",
  "country": "",
  "nationality": "",
  "origin": "email|website|recommendation|phone|whatsapp|social|other",
  "origin_detail": "",
  "language": "fr|en|nl|de|other",
  "typical_adults": 0,
  "typical_children": 0,
  "typical_teens": 0,
  "summary": "",
  "notes": "Points clés : dates évoquées, budget, contraintes, animaux, etc.",
  "preferences": [],
  "options_mentioned": { "draps": false, "litsFaits": false, "assuranceAnnulation": false },
  "inquiries": [
    {
      "check_in": "YYYY-MM-DD ou null",
      "check_out": "YYYY-MM-DD ou null",
      "adults": 0,
      "children": 0,
      "price_quoted": 0,
      "status": "asked|negotiating|abandoned",
      "notes": ""
    }
  ],
  "prices_mentioned": [{ "amount": 0, "context": "" }]
}`;

function parseJson(raw) {
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

function buildConversation(emails) {
  const parts = emails.map(e => {
    const dir = e.mailbox === 'INBOX.Sent' ? 'ENVOYÉ (Gille)' : 'REÇU (client)';
    return `[${e.date}] ${dir}
Sujet: ${e.subject || ''}
De: ${e.sender_name || ''} <${e.sender || ''}>
---
${(e.body_text || '').slice(0, 2500)}`;
  });
  let text = parts.join('\n\n---\n\n');
  if (text.length > 28000) {
    const head = parts.slice(0, 2).join('\n\n---\n\n');
    const tail = parts.slice(-8).join('\n\n---\n\n');
    text = head + '\n\n[... messages intermédiaires omis ...]\n\n' + tail;
  }
  return text;
}

function regexEnrich(text, existing) {
  const out = { ...existing };
  if (!out.phone) {
    const phones = text.match(/(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/g);
    if (phones?.[0]) out.phone = phones[0].replace(/\s/g, ' ').trim();
  }
  if (!out.postal_code) {
    const cp = text.match(/\b(\d{5})\b/);
    if (cp) out.postal_code = cp[1];
  }
  return out;
}

function computeSeason(checkIn) {
  if (!checkIn) return '';
  const d = new Date(checkIn);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m >= 9) return `${y}-${y + 1}`;
  return `${y - 1}-${y}`;
}

function weekNumber(checkIn) {
  if (!checkIn) return 0;
  const d = new Date(checkIn);
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function enrichContact(contact, emails) {
  const conv = buildConversation(emails);
  const userMsg = `Contact email principal: ${contact.email}
Nom actuel en base: ${contact.name}

CONVERSATION (${emails.length} messages):
${conv}`;

  let parsed;
  if (DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'sk-votre-cle-openai') {
    const raw = await deepseekChat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ]);
    parsed = parseJson(raw);
  } else {
    parsed = regexEnrich(conv, {
      name: contact.name,
      first_name: '',
      phone: contact.phone || '',
      summary: 'Enrichissement IA non disponible (clé DeepSeek manquante).',
      notes: '',
      inquiries: [],
      origin: 'email',
      origin_detail: '',
    });
  }

  parsed = regexEnrich(conv, parsed);

  const profileJson = {
    summary: parsed.summary || '',
    language: parsed.language || '',
    typicalAdults: parsed.typical_adults || 0,
    typicalChildren: parsed.typical_children || 0,
    typicalTeens: parsed.typical_teens || 0,
    preferences: parsed.preferences || [],
    optionsMentioned: parsed.options_mentioned || {},
    pricesMentioned: parsed.prices_mentioned || [],
    enrichedAt: new Date().toISOString(),
  };

  const notes = [parsed.notes, parsed.summary].filter(Boolean).join('\n\n').trim();

  db.prepare(`
    UPDATE contacts SET
      name = COALESCE(NULLIF(?, ''), name),
      first_name = COALESCE(NULLIF(?, ''), first_name),
      phone = COALESCE(NULLIF(?, ''), phone),
      alternate_phones = ?,
      alternate_emails = ?,
      address = COALESCE(NULLIF(?, ''), address),
      postal_code = COALESCE(NULLIF(?, ''), postal_code),
      country = COALESCE(NULLIF(?, ''), country),
      nationality = COALESCE(NULLIF(?, ''), nationality),
      origin = COALESCE(NULLIF(?, ''), origin),
      origin_detail = COALESCE(NULLIF(?, ''), origin_detail),
      notes = COALESCE(NULLIF(?, ''), notes),
      profile_json = ?,
      enriched_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    parsed.name || '',
    parsed.first_name || '',
    parsed.phone || '',
    JSON.stringify(parsed.alternate_phones || []),
    JSON.stringify(parsed.alternate_emails || []),
    parsed.address || '',
    parsed.postal_code || '',
    parsed.country || '',
    parsed.nationality || '',
    parsed.origin || 'email',
    parsed.origin_detail || '',
    notes,
    JSON.stringify(profileJson),
    contact.id,
  );

  db.prepare('DELETE FROM requested_weeks WHERE contact_id = ?').run(contact.id);
  const insertRw = db.prepare(`
    INSERT INTO requested_weeks (id, contact_id, season, week_number, check_in, check_out, adults, children, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const inq of parsed.inquiries || []) {
    if (!inq.check_in) continue;
    insertRw.run(
      generateId(),
      contact.id,
      computeSeason(inq.check_in),
      weekNumber(inq.check_in),
      inq.check_in,
      inq.check_out || '',
      inq.adults || parsed.typical_adults || 0,
      inq.children || parsed.typical_children || 0,
      inq.status || 'asked',
      [inq.notes, inq.price_quoted ? `Prix évoqué: ${inq.price_quoted}€` : ''].filter(Boolean).join(' — '),
    );
  }
}

async function main() {
  if (!DEEPSEEK_API_KEY) console.warn('⚠️  DEEPSEEK_API_KEY manquante — extraction regex limitée');

  let query = `
    SELECT c.*, (SELECT COUNT(*) FROM emails e WHERE e.contact_id = c.id) AS msg_count
    FROM contacts c
    WHERE (SELECT COUNT(*) FROM emails e WHERE e.contact_id = c.id) > 0
  `;
  if (!FORCE) query += ` AND (enriched_at IS NULL OR enriched_at = '')`;
  query += ` ORDER BY msg_count DESC`;
  if (LIMIT > 0) query += ` LIMIT ${LIMIT}`;

  const contacts = db.prepare(query).all();
  console.log(`\n🔍 ${contacts.length} contacts à enrichir\n`);

  let ok = 0;
  let err = 0;

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    const emails = db.prepare('SELECT * FROM emails WHERE contact_id = ? ORDER BY date ASC').all(c.id);
    process.stdout.write(`\r   [${i + 1}/${contacts.length}] ${c.name?.slice(0, 30).padEnd(30)} (${emails.length} msgs)...`);

    try {
      await enrichContact(c, emails);
      ok++;
    } catch (e) {
      err++;
      console.error(`\n   ❌ ${c.email}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 350));
  }

  console.log(`\n\n✅ ${ok} enrichis · ${err} erreurs\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
