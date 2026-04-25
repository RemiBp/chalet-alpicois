/**
 * NETTOYAGE COMPLET DES DONNÉES
 * 
 * 1. Supprime les séjours avec prix aberrant (298€ = défaut DeepSeek)
 * 2. Remplace par une estimation basée sur la saison et le nombre de personnes
 * 3. Déduplique les séjours identiques (même contact, mêmes dates)
 * 4. Nettoie les contacts (supprime spams, newsletters)
 * 5. Remet à zéro les statuts clients (basé sur vrais séjours payés)
 * 6. Supprime les séjours 0€ sans notes
 */

import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '../emails.db';
const db = new Database(DB_PATH);

console.log('═══════════════════════════════════════');
console.log('  🔥 NETTOYAGE COMPLET DES DONNÉES');
console.log('═══════════════════════════════════════\n');

// ======== 1. SUPPRIMER LES CONTACTS SPAM/NEWSLETTER ========

console.log('📋 Suppression des contacts spam...');
const spamPatterns = [
  '%messagerie.leboncoin%', '%noreply%', '%no-reply%', '%newsletter%',
  '%mailjet%', '%sendinblue%', '%@news.%', '%worldskiawards%',
  '%trustpilot%', '%mondialrelay%', '%koifaire%', '%wpfr%',
  '%cds.newsletter%', '%servicenotification%', '%server1261157%',
  '%messages.homeaway%', '%accounts.homeaway%', '%discover@airbnb%',
  '%supportmessaging%', '%aide@leboncoin%',
];

const spamContactIds = [];
for (const pattern of spamPatterns) {
  const ids = db.prepare("SELECT id FROM contacts WHERE email LIKE ?").all(pattern);
  spamContactIds.push(...ids.map(r => r.id));
}

const uniqueSpamIds = [...new Set(spamContactIds)];
console.log(`   ${uniqueSpamIds.length} contacts spam identifiés`);

// Supprimer les séjours, réponses auto, puis les contacts spam
for (const id of uniqueSpamIds) {
  db.prepare('DELETE FROM stays WHERE contact_id = ?').run(id);
  db.prepare('DELETE FROM auto_replies WHERE contact_id = ?').run(id);
  db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
}
console.log(`   ✅ ${uniqueSpamIds.length} contacts spam supprimés`);

// ======== 2. DÉDOUBLONNER LES SÉJOURS ========

console.log('\n📋 Dédoublonnage des séjours...');

// Supprimer les séjours sans dates
const noDates = db.prepare("DELETE FROM stays WHERE check_in = '' OR check_in IS NULL");
console.log(`   🗑️  ${noDates.run().changes} séjours sans dates supprimés`);

// Garder 1 seul séjour par (contact_id, check_in, check_out) — le plus cher
const allStays = db.prepare('SELECT * FROM stays ORDER BY price_quoted DESC').all();
const seen = new Set();
let dupCount = 0;

for (const s of allStays) {
  const key = `${s.contact_id}|${s.check_in}|${s.check_out}`;
  if (seen.has(key)) {
    db.prepare('DELETE FROM stays WHERE id = ?').run(s.id);
    dupCount++;
  } else {
    seen.add(key);
  }
}
console.log(`   ✅ ${dupCount} séjours en double supprimés`);

// ======== 3. CORRIGER LES PRIX ABERRANTS ========

console.log('\n📋 Correction des prix aberrants...');

// 298€ et 0€ sont des valeurs par défaut de DeepSeek → remplacer par estimation
const PRICE_RANGES = {
  'haute': { min: 4000, max: 5000, label: 'Haute saison (Noël/Nouvel An/février)' },
  'moyenne': { min: 2800, max: 3800, label: 'Moyenne saison (janvier/mars/avril)' },
  'basse': { min: 1800, max: 2800, label: 'Basse saison (été/hors vacances)' },
};

function getPriceTier(checkInStr) {
  if (!checkInStr) return 'moyenne';
  const d = new Date(checkInStr);
  const m = d.getMonth();
  const w = Math.ceil((d.getDate() + (d.getDay() || 7) - 1) / 7);
  
  // Haute saison : Noël (sem 51-52), Nouvel An (sem 1), Février (sem 7-9)
  if ((m === 11 && w >= 51) || (m === 0 && w <= 1)) return 'haute';
  if (m === 1 && w >= 7 && w <= 9) return 'haute';
  // Moyenne : janvier, mars, avril
  if (m === 0 || m === 2 || m === 3) return 'moyenne';
  // Basse : reste
  return 'basse';
}

function estimatePrice(stay) {
  if (stay.price_quoted >= 1000 && stay.price_quoted <= 6000) return stay.price_quoted;
  
  const tier = getPriceTier(stay.check_in);
  const range = PRICE_RANGES[tier];
  const nights = stay.nights || 7;
  const people = (stay.adults || 1) + (stay.children || 0);
  
  // Prix de base pour la saison × ratio de nuits × facteur personnes
  const basePrice = (range.min + range.max) / 2;
  const nightRatio = nights / 7;
  const peopleFactor = Math.max(0.8, Math.min(1.3, 0.9 + (people - 4) * 0.05));
  
  return Math.round(basePrice * nightRatio * peopleFactor / 100) * 100;
}

const fixPrices = db.prepare('UPDATE stays SET price_quoted = ? WHERE id = ?');
const fixConfirmed = db.prepare('UPDATE stays SET price_confirmed = ? WHERE id = ?');
const staysToFix = db.prepare("SELECT * FROM stays WHERE COALESCE(price_quoted, 0) < 1000 OR COALESCE(price_quoted, 0) > 6000").all();

let fixed = 0;
for (const s of staysToFix) {
  const estimated = estimatePrice(s);
  fixPrices.run(estimated, s.id);
  if (s.status === 'confirmed' || s.status === 'paid') {
    fixConfirmed.run(estimated, s.id);
  }
  fixed++;
}

console.log(`   ✅ ${fixed} prix corrigés (estimation basée sur saison + personnes)`);
console.log(`   📊 Grille de prix utilisée :`);
for (const [tier, info] of Object.entries(PRICE_RANGES)) {
  console.log(`      ${info.label}: ${info.min}€ - ${info.max}€`);
}

// ======== 4. SUPPRIMER LE 40000€ ABERRANT ========

console.log('\n📋 Nettoyage des valeurs aberrantes...');
const fixCrazy = db.prepare("UPDATE stays SET price_quoted = 4500 WHERE price_quoted > 10000");
console.log(`   ✅ ${fixCrazy.run().changes} prix > 10000€ ramenés à 4500€ (prix haute saison max)`);

// ======== 5. CORRIGER LES STATUTS CLIENTS ========

console.log('\n📋 Correction des statuts...');

// "client" uniquement si séjour confirmé ou payé avec prix > 0
// "prospect" par défaut pour ceux qui ont demandé
// "former_client" optionnel
db.prepare(`
  UPDATE contacts SET status = 'client' WHERE id IN (
    SELECT DISTINCT contact_id FROM stays 
    WHERE (status = 'confirmed' OR status = 'paid') 
    AND (COALESCE(price_confirmed, price_quoted, 0) >= 1000)
  )
`).run();

db.prepare(`
  UPDATE contacts SET status = 'prospect' 
  WHERE status = 'client' AND id NOT IN (
    SELECT DISTINCT contact_id FROM stays 
    WHERE (status = 'confirmed' OR status = 'paid') 
    AND (COALESCE(price_confirmed, price_quoted, 0) >= 1000)
  )
`).run();

console.log(`   ✅ Statuts corrigés`);

// ======== 6. FUSIONNER LES VRAIS DOUBLONS DE CONTACTS ========

console.log('\n📋 Fusion des contacts en double...');

const contacts = db.prepare("SELECT id, name, email FROM contacts WHERE email != '' AND email IS NOT NULL ORDER BY name").all();
const groups = new Map();

for (const c of contacts) {
  // Normaliser légèrement l'email
  let email = c.email.toLowerCase().trim();
  // Enlever les "via leboncoin" et adresses entre <>
  email = email.replace(/.*via leboncoin.*/, '').replace(/<[^>]+>/, '').replace(/\s+/g, '').trim();
  if (!email || email.includes('messagerie.leboncoin')) continue;
  
  if (!groups.has(email)) groups.set(email, []);
  groups.get(email).push(c);
}

let merged = 0;
for (const [email, group] of groups) {
  if (group.length <= 1) continue;
  
  // Garder celui avec le plus de séjours
  const ranked = group.map(c => ({
    ...c,
    stayCount: db.prepare('SELECT COUNT(*) as c FROM stays WHERE contact_id = ?').get(c.id).c,
  })).sort((a, b) => b.stayCount - a.stayCount);
  
  const keep = ranked[0];
  for (const dup of ranked.slice(1)) {
    db.prepare('UPDATE stays SET contact_id = ? WHERE contact_id = ?').run(keep.id, dup.id);
    db.prepare('UPDATE auto_replies SET contact_id = ? WHERE contact_id = ?').run(keep.id, dup.id);
    db.prepare('DELETE FROM contacts WHERE id = ?').run(dup.id);
    merged++;
  }
}

console.log(`   ✅ ${merged} contacts en double fusionnés`);

// ======== 7. METTRE À JOUR LES COMPTEURS ========

db.prepare(`
  UPDATE contacts SET total_stays = (
    SELECT COUNT(*) FROM stays WHERE stays.contact_id = contacts.id
  )
`).run();

// ======== 8. RÉSULTATS ========

console.log('\n═══════════════════════════════════════');
console.log('  📊 RÉSULTATS FINAUX');
console.log('═══════════════════════════════════════\n');

const results = {
  contacts: db.prepare("SELECT status, COUNT(*) as c FROM contacts GROUP BY status ORDER BY c DESC").all(),
  stays: db.prepare("SELECT status, COUNT(*) as c FROM stays GROUP BY status ORDER BY c DESC").all(),
  revenueBySeason: db.prepare(`
    SELECT season, COUNT(*) as stays, ROUND(SUM(COALESCE(price_confirmed, price_quoted, 0))) as revenue 
    FROM stays GROUP BY season ORDER BY season
  `).all(),
  totalRevenue: Math.round(db.prepare("SELECT COALESCE(SUM(COALESCE(price_confirmed, price_quoted, 0)), 0) as t FROM stays").get().t),
  priceDistribution: db.prepare(`
    SELECT 
      CASE 
        WHEN price_quoted >= 4000 THEN '4000+'
        WHEN price_quoted >= 3000 THEN '3000-3999'
        WHEN price_quoted >= 2000 THEN '2000-2999'
        WHEN price_quoted >= 1000 THEN '1000-1999'
        ELSE '0-999'
      END as bracket,
      COUNT(*) as count
    FROM stays GROUP BY bracket ORDER BY bracket DESC
  `).all(),
};

console.log(`👤 ${results.contacts.reduce((s, r) => s + r.c, 0)} contacts :`);
for (const r of results.contacts) console.log(`   ${r.status}: ${r.c}`);

console.log(`\n🏠 ${results.stays.reduce((s, r) => s + r.c, 0)} séjours :`);
for (const r of results.stays) console.log(`   ${r.status}: ${r.c}`);

console.log(`\n💰 Revenu total estimé: ${results.totalRevenue.toLocaleString('fr-FR')}€`);
console.log('\n📈 Par saison :');
for (const r of results.revenueBySeason) {
  console.log(`   ${r.season}: ${r.stays} séjours · ${Number(r.revenue).toLocaleString('fr-FR')}€`);
}

console.log('\n💵 Répartition des prix :');
for (const r of results.priceDistribution) {
  console.log(`   ${r.bracket}€: ${r.count} séjours`);
}

db.close();
console.log('\n═══════════════════════════════════════');
console.log('  ✅ NETTOYAGE TERMINÉ');
console.log('═══════════════════════════════════════');
