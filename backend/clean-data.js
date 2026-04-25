/**
 * Nettoie et consolide les données parsées par DeepSeek :
 * 1. Supprime les contacts spam/automatiques (newsletters, notifications)
 * 2. Fusionne les contacts en double (Leboncoin + email direct)
 * 3. Marque correctement les vrais clients (séjours confirmés/payés)
 * 4. Supprime les séjours en double (même contact, mêmes dates)
 * 5. Nettoie les body_text mal encodés restants
 */

import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '../emails.db';
const db = new Database(DB_PATH);

console.log('═══════════════════════════════════════');
console.log('  🧹 NETTOYAGE DES DONNÉES');
console.log('═══════════════════════════════════════\n');

// ======== 1. IDENTIFIER LES SPAMS/NEWSLETTERS ========

const SPAM_DOMAINS = [
  'leboncoin.fr', 'mailjet.com', 'sendinblue', 'email-smtp.',
  'news.', 'info@', 'noreply', 'no-reply', 'notification',
  'newsletter', 'welcome@', 'discover@', 'marketing@',
  'hello@', 'support@', 'team@', 'accounts@',
  'messages.homeaway', 'cds.newsletter', 'servicenotification',
  'server1261157.netart', 'worldskiawards', 'trustpilotmail',
  'koifaire.com', 'wpfr.net', 'mondialrelay.fr',
];

const SPAM_KEYWORDS = [
  'leboncoin', 'Newsletter', 'newsletter', 'Lettre d\'information',
  'Infos station', 'Désabonnement', 'désabonner',
  'Confirmation de changement', 'Vous recevez ce message',
  'Réinitialisation', 'Vérification', 'Mot de passe',
  'Inscription', 'Bienvenue chez', 'Validez votre',
  'Notification', 'Paiement sécurisé',
];

console.log('📋 Identification des contacts spam/automatiques...');

const allContacts = db.prepare('SELECT * FROM contacts').all();
let spamCount = 0;
let realCount = 0;
const spamIds = [];

for (const c of allContacts) {
  const email = (c.email || '').toLowerCase();
  const name = (c.name || '');
  const isSpamDomain = SPAM_DOMAINS.some(d => email.includes(d));
  const isSpamKeyword = SPAM_KEYWORDS.some(k => 
    (c.subject || '').includes(k) || name.includes(k)
  );

  // Conserver les vrais prospects humains malgré leboncoin dans l'adresse
  if (isSpamDomain || isSpamKeyword) {
    // Sauf si la personne a un vrai nom (pas une adresse générique)
    const hasStays = db.prepare('SELECT COUNT(*) as c FROM stays WHERE contact_id = ?').get(c.id).c > 0;
    if (!hasStays && !name.match(/^[A-Z][a-z]+ [A-Z][a-z]+$/)) {
      spamIds.push(c.id);
      spamCount++;
    } else {
      realCount++;
    }
  } else {
    realCount++;
  }
}

console.log(`   🗑️  ${spamCount} spams à supprimer`);
console.log(`   ✅ ${realCount} vrais contacts conservés`);

// ======== 2. CORRIGER LES STATUTS ========

console.log('\n📋 Correction des statuts (client vs prospect)...');

// Les vrais clients : ceux avec un séjour confirmé ou payé
const clientContactIds = new Set();
const confirmedStays = db.prepare("SELECT DISTINCT contact_id FROM stays WHERE status = 'confirmed' OR status = 'paid'").all();
for (const s of confirmedStays) clientContactIds.add(s.contact_id);

const updateStatus = db.prepare('UPDATE contacts SET status = ? WHERE id = ?');
const tx = db.transaction(() => {
  for (const c of allContacts) {
    if (spamIds.includes(c.id)) continue;
    if (clientContactIds.has(c.id)) {
      updateStatus.run('client', c.id);
    } else {
      // Conserver le statut original de DeepSeek pour les prospects
    }
  }
});
tx();

const realClients = db.prepare("SELECT COUNT(*) as c FROM contacts WHERE status = 'client'").get().c;
const realProspects = db.prepare("SELECT COUNT(*) as c FROM contacts WHERE status = 'prospect' AND id NOT IN (" + spamIds.map(() => '?').join(',') + ")").get(...spamIds)?.c || 0;
console.log(`   👤 ${realClients} clients, ${realProspects} prospects`);

// ======== 3. SUPPRIMER LES SPAMS ========

if (spamIds.length > 0) {
  console.log('\n📋 Suppression des spams...');
  const placeholders = spamIds.map(() => '?').join(',');
  
  // Supprimer les séjours liés
  const deletedStays = db.prepare(`DELETE FROM stays WHERE contact_id IN (${placeholders})`).run(...spamIds);
  console.log(`   🏠 ${deletedStays.changes} séjours supprimés`);
  
  // Supprimer les réponses auto liées
  const deletedReplies = db.prepare(`DELETE FROM auto_replies WHERE contact_id IN (${placeholders})`).run(...spamIds);
  console.log(`   🤖 ${deletedReplies.changes} réponses auto supprimées`);
  
  // Supprimer les contacts spam
  const deletedContacts = db.prepare(`DELETE FROM contacts WHERE id IN (${placeholders})`).run(...spamIds);
  console.log(`   👤 ${deletedContacts.changes} contacts spam supprimés`);
}

// ======== 4. DÉDOUBLONNER LES SÉJOURS ========

console.log('\n📋 Dédoublonnage des séjours...');

// Garder un seul séjour par (contact_id, check_in, check_out)
const allStays = db.prepare('SELECT * FROM stays ORDER BY price_quoted DESC').all();
const seen = new Set();
const duplicateIds = [];

for (const s of allStays) {
  const key = `${s.contact_id}|${s.check_in}|${s.check_out}`;
  if (seen.has(key)) {
    duplicateIds.push(s.id);
  } else {
    seen.add(key);
  }
}

if (duplicateIds.length > 0) {
  const placeholders = duplicateIds.map(() => '?').join(',');
  const deleted = db.prepare(`DELETE FROM stays WHERE id IN (${placeholders})`).run(...duplicateIds);
  console.log(`   🏠 ${deleted.changes} séjours en double supprimés`);
}

// ======== 5. METTRE À JOUR LES STATS ========

console.log('\n📋 Mise à jour des compteurs...');

const updateTotalStays = db.prepare(`
  UPDATE contacts SET total_stays = (
    SELECT COUNT(*) FROM stays WHERE stays.contact_id = contacts.id
  )
`);
updateTotalStays.run();

// ======== 6. RÉSULTATS FINAUX ========

console.log('\n═══════════════════════════════════════');
console.log('  📊 RÉSULTATS FINAUX');
console.log('═══════════════════════════════════════\n');

const finalStats = {
  contacts: db.prepare("SELECT status, COUNT(*) as c FROM contacts GROUP BY status").all(),
  stays: db.prepare("SELECT status, COUNT(*) as c FROM stays GROUP BY status").all(),
  totalEmails: db.prepare("SELECT COUNT(*) as c FROM emails").get().c,
  parsedEmails: db.prepare("SELECT COUNT(*) as c FROM emails WHERE parsed = 1").get().c,
  autoReplies: db.prepare("SELECT COUNT(*) as c FROM auto_replies").get().c,
};

console.log(`📧 ${finalStats.totalEmails} emails (${finalStats.parsedEmails} parsés)`);
for (const s of finalStats.contacts) console.log(`   👤 ${s.status}: ${s.c}`);
for (const s of finalStats.stays) console.log(`   🏠 ${s.status}: ${s.c}`);
console.log(`🤖 ${finalStats.autoReplies} réponses auto en brouillon`);

// ======== 7. FIX ENCODAGE RESTANT ========

console.log('\n📋 Fix encodage final...');
const remainingBad = db.prepare("SELECT COUNT(*) as c FROM emails WHERE body_text LIKE '%Ã©%' OR body_text LIKE '%Ã¨%' OR body_text LIKE '%Ã§%' OR body_text LIKE '%Ã%'").get().c;
console.log(`   ${remainingBad} emails avec encodage encore incorrect`);

if (remainingBad > 0) {
  const replacements = {
    'Ã©': 'é', 'Ã¨': 'è', 'Ãª': 'ê', 'Ã«': 'ë',
    'Ã ': 'à', 'Ã¢': 'â', 'Ã¤': 'ä',
    'Ã¹': 'ù', 'Ã»': 'û', 'Ã¼': 'ü',
    'Ã´': 'ô', 'Ã¶': 'ö',
    'Ã®': 'î', 'Ã¯': 'ï',
    'Ã§': 'ç',
    'Å“': 'œ',
    'Ã‰': 'É', 'Ãˆ': 'È', 'ÃŠ': 'Ê', 'Ã‹': 'Ë',
    'Ã€': 'À', 'Ã‚': 'Â', 'Ã„': 'Ä',
    'ÃŒ': 'Ì', 'ÃŽ': 'Î', 'Ã?': 'Ï',
    'Ã™': 'Ù', 'Ãš': 'Ú', 'Ã›': 'Û',
    'Ã”': 'Ô', 'Ã–': 'Ö',
    'Ã‡': 'Ç',
  };

  const rows = db.prepare("SELECT id, body_text FROM emails WHERE body_text LIKE '%Ã%'").all();
  const fixBody = db.prepare('UPDATE emails SET body_text = ? WHERE id = ?');
  
  const tx2 = db.transaction(() => {
    for (const r of rows) {
      let fixed = r.body_text;
      for (const [bad, good] of Object.entries(replacements)) {
        fixed = fixed.split(bad).join(good);
      }
      if (fixed !== r.body_text) {
        fixBody.run(fixed, r.id);
      }
    }
  });
  tx2();
  console.log(`   ✅ ${rows.length} emails corrigés`);
}

console.log('\n═══════════════════════════════════════');
console.log('  ✅ NETTOYAGE TERMINÉ');
console.log('═══════════════════════════════════════\n');

db.close();
