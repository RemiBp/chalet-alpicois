/**
 * Nettoie et corrige les données clients :
 * 1. Corrige les statuts : "client" uniquement si séjour confirmé/avec prix
 * 2. Copie price_quoted → price_confirmed pour les séjours confirmés
 * 3. Fusionne les doublons de contacts (même email, noms similaires)
 * 4. Supprime les contacts sans aucun email ni séjour (fantômes)
 */

import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '../emails.db';
const db = new Database(DB_PATH);

console.log('═══════════════════════════════════════');
console.log('  💰 CORRECTION DES PRIX & STATUTS');
console.log('═══════════════════════════════════════\n');

// ======== 1. COPIER price_quoted → price_confirmed pour les confirmed ========

console.log('📋 Copie price_quoted → price_confirmed...');
const fixConfirmed = db.prepare(`
  UPDATE stays 
  SET price_confirmed = CASE 
    WHEN price_confirmed = 0 AND price_quoted > 0 THEN price_quoted 
    ELSE price_confirmed 
  END
  WHERE status = 'confirmed' OR status = 'paid'
`);
const r1 = fixConfirmed.run();
console.log(`   ✅ ${r1.changes} séjours mis à jour`);

// ======== 2. STATUTS : corriger les faux clients ========

console.log('\n📋 Correction des statuts clients...');

// Seuls ceux avec un séjour confirmé ET un prix > 0 sont "client"
const fixStatusClient = db.prepare(`
  UPDATE contacts 
  SET status = CASE 
    WHEN (SELECT COUNT(*) FROM stays s WHERE s.contact_id = contacts.id AND (s.status = 'confirmed' OR s.status = 'paid') AND (s.price_confirmed > 0 OR s.price_quoted > 0)) > 0 
    THEN 'client' 
    ELSE 'prospect' 
  END
  WHERE status = 'client'
`);
const r2 = fixStatusClient.run();
console.log(`   ✅ ${r2.changes} contacts corrigés (client → prospect)`);

// Ceux avec séjour mais sans prix → restent prospect jusqu'à confirmation prix
const fixEmptyClients = db.prepare(`
  UPDATE contacts SET status = 'prospect' WHERE status = 'client' AND (
    SELECT COALESCE(SUM(COALESCE(price_confirmed, price_quoted, 0)), 0) FROM stays WHERE contact_id = contacts.id
  ) = 0
`);
const r3 = fixEmptyClients.run();
console.log(`   ✅ ${r3.changes} clients sans revenu → prospect`);

// ======== 3. FUSIONNER LES DOUBLONS ========

console.log('\n📋 Fusion des contacts en double...');

// Trouver les doublons par email (normalisé)
const allContacts = db.prepare("SELECT id, name, email, phone FROM contacts WHERE email != '' AND email IS NOT NULL").all();
const emailGroups = new Map();

for (const c of allContacts) {
  const email = c.email.toLowerCase().trim();
  // Normaliser les emails leboncoin
  const normalized = email.replace(/.*via leboncoin.*/, '').replace(/<.*>/, '').trim();
  if (!normalized) continue;
  if (!emailGroups.has(normalized)) emailGroups.set(normalized, []);
  emailGroups.get(normalized).push(c);
}

let merged = 0;
let deletedContactCount = 0;

for (const [email, group] of emailGroups) {
  if (group.length <= 1) continue;
  
  // Garder le contact avec le plus de séjours ou le plus récent
  const withStays = group.map(c => ({
    ...c,
    stayCount: db.prepare('SELECT COUNT(*) as c FROM stays WHERE contact_id = ?').get(c.id).c,
    lastDate: db.prepare('SELECT MAX(last_contact_date) as d FROM contacts WHERE id = ?').get(c.id).d || '',
  })).sort((a, b) => b.stayCount - a.stayCount || (b.lastDate || '').localeCompare(a.lastDate || ''));

  const keep = withStays[0];
  const toMerge = withStays.slice(1);

  for (const dup of toMerge) {
    // Transférer les séjours
    db.prepare('UPDATE stays SET contact_id = ? WHERE contact_id = ?').run(keep.id, dup.id);
    // Transférer les réponses auto
    db.prepare('UPDATE auto_replies SET contact_id = ? WHERE contact_id = ?').run(keep.id, dup.id);
    // Supprimer le doublon
    db.prepare('DELETE FROM contacts WHERE id = ?').run(dup.id);
    merged++;
  }
  deletedContactCount += toMerge.length;
}

console.log(`   ✅ ${deletedContactCount} doublons fusionnés (${merged} opérations)`);

// ======== 4. SUPPRIMER LES FANTÔMES ========

console.log('\n📋 Suppression des contacts fantômes (0 séjour, 0 email)...');
const ghosts = db.prepare("SELECT id, name FROM contacts WHERE (SELECT COUNT(*) FROM stays WHERE contact_id = contacts.id) = 0").all();
let ghostCount = 0;
for (const g of ghosts) {
  // Vérifier si ce contact a vraiment des emails dans la boîte
  const hasEmail = db.prepare("SELECT COUNT(*) as c FROM emails WHERE sender = (SELECT email FROM contacts WHERE id = ?)").get(g.id).c > 0;
  if (!hasEmail) {
    db.prepare('DELETE FROM contacts WHERE id = ?').run(g.id);
    ghostCount++;
  }
}
console.log(`   ✅ ${ghostCount} contacts fantômes supprimés`);

// ======== 5. ESTIMER LES PRIX MANQUANTS ========

console.log('\n📋 Estimation des prix manquants...');

// Règles de prix par saison (basées sur les prix existants)
const priceRules = [
  { season: '2021-2022', weekThresholds: [{ maxWeek: 52, minPrice: 2000, maxPrice: 3500 }, { maxWeek: 20, minPrice: 1500, maxPrice: 2500 }] },
  { season: '2022-2023', weekThresholds: [{ maxWeek: 52, minPrice: 2200, maxPrice: 3800 }, { maxWeek: 20, minPrice: 1600, maxPrice: 2800 }] },
  { season: '2023-2024', weekThresholds: [{ maxWeek: 52, minPrice: 2500, maxPrice: 4200 }, { maxWeek: 20, minPrice: 1800, maxPrice: 3000 }] },
  { season: '2024-2025', weekThresholds: [{ maxWeek: 52, minPrice: 2800, maxPrice: 4500 }, { maxWeek: 20, minPrice: 2000, maxPrice: 3200 }] },
  { season: '2025-2026', weekThresholds: [{ maxWeek: 52, minPrice: 3000, maxPrice: 4800 }, { maxWeek: 20, minPrice: 2200, maxPrice: 3500 }] },
];

// Prix moyen par saison basé sur les séjours existants avec prix
const avgPrices = db.prepare(`
  SELECT season, AVG(COALESCE(price_confirmed, price_quoted, 0)) as avg_price
  FROM stays 
  WHERE COALESCE(price_confirmed, price_quoted, 0) > 0
  GROUP BY season
`).all();

console.log(`   Prix moyens par saison (basés sur les données existantes):`);
for (const p of avgPrices) {
  console.log(`   ${p.season}: ${Math.round(p.avg_price).toLocaleString('fr-FR')}€`);
}

// Mettre à jour les séjours sans prix avec une estimation basée sur la saison
let estimatedCount = 0;
const missingPrices = db.prepare(`
  SELECT s.id, s.season, s.check_in, s.nights, s.adults, s.children
  FROM stays s 
  WHERE COALESCE(s.price_confirmed, s.price_quoted, 0) = 0
`).all();

for (const stay of missingPrices) {
  const avgRow = avgPrices.find(p => p.season === stay.season);
  if (avgRow && avgRow.avg_price > 0) {
    // Estimation : prix moyen × (nights / 7) ajusté par nombre de personnes
    const basePrice = avgRow.avg_price;
    const nightRatio = (stay.nights || 7) / 7;
    const peopleFactor = 1 + ((stay.adults || 1) + (stay.children || 0) - 4) * 0.1; // +/-10% par personne au-delà de 4
    const estimatedPrice = Math.round(basePrice * nightRatio * Math.max(0.7, Math.min(1.3, peopleFactor)));
    
    db.prepare('UPDATE stays SET price_quoted = ? WHERE id = ?').run(estimatedPrice, stay.id);
    estimatedCount++;
  }
}
console.log(`   ✅ ${estimatedCount} séjours avec prix estimé`);

// ======== 6. METTRE À JOUR TOTAL_STAYS ET REVENUS ========

console.log('\n📋 Mise à jour des totaux...');
db.prepare(`
  UPDATE contacts SET total_stays = (
    SELECT COUNT(*) FROM stays WHERE stays.contact_id = contacts.id
  )
`).run();
console.log(`   ✅ Compteurs mis à jour`);

// ======== 7. RÉSULTATS ========

console.log('\n═══════════════════════════════════════');
console.log('  📊 RÉSULTATS FINAUX');
console.log('═══════════════════════════════════════\n');

const stats = {
  contacts: db.prepare("SELECT status, COUNT(*) as c FROM contacts GROUP BY status").all(),
  stays: db.prepare("SELECT status, COUNT(*) as c FROM stays GROUP BY status").all(),
  totalRevenue: db.prepare("SELECT COALESCE(SUM(COALESCE(price_confirmed, price_quoted, 0)), 0) as total FROM stays").get().total,
  withPrice: db.prepare("SELECT COUNT(*) as c FROM stays WHERE COALESCE(price_confirmed, price_quoted, 0) > 0").get().c,
  withoutPrice: db.prepare("SELECT COUNT(*) as c FROM stays WHERE COALESCE(price_confirmed, price_quoted, 0) = 0").get().c,
};

console.log(`👤 Contacts:`);
for (const s of stats.contacts) console.log(`   ${s.status}: ${s.c}`);
console.log(`🏠 Séjours:`);
for (const s of stats.stays) console.log(`   ${s.status}: ${s.c}`);
console.log(`💰 Revenu total: ${Math.round(stats.totalRevenue).toLocaleString('fr-FR')}€`);
console.log(`💵 Avec prix: ${stats.withPrice} · Sans prix: ${stats.withoutPrice}`);

db.close();

console.log('\n═══════════════════════════════════════');
console.log('  ✅ CORRECTION TERMINÉE');
console.log('═══════════════════════════════════════\n');
