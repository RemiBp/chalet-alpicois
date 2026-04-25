/**
 * fix-all.js — Nettoyage complet et rigoureux de la base emails.db
 *
 * Étapes :
 *   A) Suppression des spams (contacts automatiques / bots)
 *   B) Dédoublonnage des séjours (même contact + mêmes dates)
 *   C) Correction des prix (éliminer les hallucinations DeepSeek < 500€)
 *   D) Fusion des contacts en double (normalisation email)
 *   E) Correction des statuts (client UNIQUEMENT si séjour confirmé/payé avec prix > 1000€)
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, '..', 'emails.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function log(icon, msg) {
  console.log(` ${icon}  ${msg}`);
}

function count(table) {
  return db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c;
}

// ─────────────────────────────────────────────────────
//  ÉTAPE A : SUPPRESSION DES SPAMS
// ─────────────────────────────────────────────────────

function deleteSpam() {
  log('─'.repeat(46), '');
  log('A', 'SUPPRESSION DES CONTACTS SPAM / AUTOMATIQUES');

  const SPAM_PATTERNS = [
    // Plateformes / marketplaces
    'leboncoin', 'messagerie.leboncoin',
    // No-reply génériques
    'noreply', 'no-reply', 'do-not-reply', 'ne-pas-repondre',
    // Newsletters / marketing
    'newsletter', 'mailjet', 'sendinblue', 'mailchannels', 'cds.newsletter',
    // OTAs / plateformes de réservation
    'airbnb.com', 'trustpilot', 'mondialrelay', 'koifaire', 'wpfr',
    'homeaway', 'worldskiawards', 'abritel',
    // Notifications systèmes
    'servicenotification', 'server1261157', 'server1725732',
    // Mailer daemon
    'mailer-daemon', 'mailer-daemon@',
    // Enquêtes
    'enquete@', 'enquetes@',
    // Aide leboncoin
    'aide@leboncoin',
    // Hosts
    'hostnski', 'hote-s',
    // Homerez (gestion locative, pas des vrais clients)
    'homerez',
    // Alpine Elements (prestataire)
    'alpineelements',
    // Chronopost
    'chronopost',
    // Octopus energy
    'octopusenergy',
    // Gens de confiance (notifications)
    'gensdeconfiance',
    // Tech / spam
    'techpunch', 'sphinxonline', 'videos4myshop',
    // Brandopus / relation presse
    'brandopus',
    // Image building
    'imagebuilding',
    // Visiotek
    'visiotek',
    // Adresses 4-u (jetables)
    '4-u.fr',
    // Adresses avec "via leboncoin"
    'via leboncoin',
    // Autres bots
    'research@', 'automated@',
    // La Plagne OT (pas des clients directs)
    'la-plagne.com', 'info-ski@',
    // Alpagence (conciergerie, pas client final)
    'alpagence',
    // Bots / postmaster
    'postmaster@',
  ];

  const allContacts = db.prepare('SELECT * FROM contacts').all();
  const toDelete = [];

  for (const c of allContacts) {
    const email = (c.email || '').toLowerCase();
    const name = (c.name || '').toLowerCase();

    const isSpam = SPAM_PATTERNS.some(p => email.includes(p));

    // Vérifier si le contact a de vrais séjours (on ne veut PAS supprimer ceux qui ont des séjours valides)
    const stayCount = db.prepare('SELECT COUNT(*) as c FROM stays WHERE contact_id = ?').get(c.id).c;

    if (isSpam && stayCount === 0) {
      toDelete.push(c.id);
    } else if (isSpam && stayCount > 0) {
      // Exceptions : contacts avec séjours mais dont l'email est un pattern spam
      // → On les garde MAIS on vérifie s'ils sont de vrais clients
      log('⚠', `Contact gardé malgré pattern spam : ${c.name} <${c.email}> (${stayCount} séjours)`);
    }
  }

  log('→', `${toDelete.length} contacts spam à supprimer`);

  if (toDelete.length > 0) {
    const placeholders = toDelete.map(() => '?').join(',');

    // Supprimer les auto_replies liées
    const r1 = db.prepare(`DELETE FROM auto_replies WHERE contact_id IN (${placeholders})`).run(...toDelete);
    log('  ↳', `${r1.changes} auto-replies supprimées`);

    // Supprimer les séjours liés
    const r2 = db.prepare(`DELETE FROM stays WHERE contact_id IN (${placeholders})`).run(...toDelete);
    log('  ↳', `${r2.changes} séjours supprimés`);

    // Supprimer les contacts
    const r3 = db.prepare(`DELETE FROM contacts WHERE id IN (${placeholders})`).run(...toDelete);
    log('  ↳', `${r3.changes} contacts supprimés`);
  }

  log('✅', `Contacts restants : ${count('contacts')}`);
}

// ─────────────────────────────────────────────────────
//  ÉTAPE B : DÉDOUBLONNAGE DES SÉJOURS
// ─────────────────────────────────────────────────────

function deduplicateStays() {
  log('─'.repeat(46), '');
  log('B', 'DÉDOUBLONNAGE DES SÉJOURS');

  // 1. Supprimer les séjours sans check_in ou check_out
  const nullCheck = db.prepare(
    `DELETE FROM stays WHERE check_in IS NULL OR check_out IS NULL OR check_in = '' OR check_out = ''`
  ).run();
  log('→', `${nullCheck.changes} séjours sans dates supprimés`);

  // 2. Détecter les doublons : même contact_id + mêmes check_in + mêmes check_out
  //    Conserver celui avec le prix le plus élevé (price_quoted + price_confirmed)
  const allStays = db.prepare(`
    SELECT *, (COALESCE(price_confirmed,0) + COALESCE(price_quoted,0)) as total_price
    FROM stays ORDER BY total_price DESC
  `).all();

  const seen = new Map();
  const dupIds = [];

  for (const s of allStays) {
    // Normaliser les clés nulles
    const key = `${s.contact_id}|${s.check_in || ''}|${s.check_out || ''}`;
    if (seen.has(key)) {
      dupIds.push(s.id);
    } else {
      seen.set(key, s.id);
    }
  }

  if (dupIds.length > 0) {
    const placeholders = dupIds.map(() => '?').join(',');
    const r = db.prepare(`DELETE FROM stays WHERE id IN (${placeholders})`).run(...dupIds);
    log('→', `${r.changes} séjours en double supprimés (${dupIds.length} détectés)`);
  } else {
    log('→', 'Aucun séjour en double détecté');
  }

  log('✅', `Séjours restants : ${count('stays')}`);
}

// ─────────────────────────────────────────────────────
//  ÉTAPE C : CORRECTION DES PRIX
// ─────────────────────────────────────────────────────

function fixPrices() {
  log('─'.repeat(46), '');
  log('C', 'CORRECTION DES PRIX');

  // Prix réels du Chalet Alpicois par saison :
  // Haute saison (Noël, Nouvel An, Février) :   min 3000€, typique 3800-4500€
  // Moyenne saison (Mars-Avril, Été) :          min 2200€, typique 2800-3500€
  // Basse saison (Janvier, Novembre-Décembre hors Noël) : min 1600€, typique 2200€

  function getIsoWeek(d) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayNum = (t.getDay() + 6) % 7; // Monday=0
    t.setDate(t.getDate() - dayNum + 3);
    const jan4 = new Date(t.getFullYear(), 0, 4);
    return 1 + Math.round(((t - jan4) / 86400000) / 7);
  }

  function getMonth(d) {
    return d.getMonth() + 1; // 1-12
  }

  function getSeasonPrice(checkIn, adults, children) {
    if (!checkIn) return null;
    const d = new Date(checkIn);
    if (isNaN(d.getTime())) return null;
    const month = getMonth(d);
    const day = d.getDate();
    const totalGuests = (adults || 1) + (children || 0);

    // Haute saison : Noël (21-31 déc), Nouvel An (1-7 jan), Février (1-28 fév)
    const isHighSeason =
      (month === 12 && day >= 21) ||
      (month === 1 && day <= 7) ||
      month === 2;

    // Moyenne saison : Mars, Avril, Été (juillet-août)
    const isMidSeason =
      (month === 3) ||
      (month === 4) ||
      (month === 7) ||
      (month === 8);

    // Basse saison : tout le reste
    let basePrice;
    if (isHighSeason) {
      basePrice = 3800;
    } else if (isMidSeason) {
      basePrice = 2800;
    } else {
      basePrice = 2200;
    }

    // Ajustement selon le nombre de personnes
    if (totalGuests <= 4) basePrice = Math.round(basePrice * 0.85);
    else if (totalGuests >= 10) basePrice = Math.round(basePrice * 1.15);
    else if (totalGuests >= 8) basePrice = Math.round(basePrice * 1.1);

    return basePrice;
  }

  // Identifier les séjours avec prix DeepSeek hallucinés (< 500€ ou > 6000€)
  const stays = db.prepare('SELECT * FROM stays').all();
  let fixedCount = 0;

  const updatePrice = db.prepare('UPDATE stays SET price_quoted = ? WHERE id = ?');

  const tx = db.transaction(() => {
    for (const s of stays) {
      const price = s.price_quoted || 0;
      const needsFix = price > 0 && (price < 500 || price > 6000);

      // Aussi copier price_quoted → price_confirmed si price_confirmed est 0
      const needsCopyConfirmed = s.price_confirmed === 0 && price > 0 && price >= 500 && price <= 6000;

      if (needsFix) {
        const estimated = getSeasonPrice(s.check_in, s.adults, s.children);
        const oldPrice = price;
        if (estimated) {
          updatePrice.run(estimated, s.id);
          fixedCount++;
          log('  ↳', `Séjour ${s.id.slice(-8)} : ${oldPrice}€ → ${estimated}€ (${s.check_in}, ${(s.adults||0)+(s.children||0)} pers.)`);
        }
      }

      if (needsCopyConfirmed) {
        db.prepare('UPDATE stays SET price_confirmed = ? WHERE id = ?').run(s.price_quoted, s.id);
      }
    }
  });
  tx();

  if (fixedCount === 0) {
    log('→', 'Aucun prix aberrant détecté');
  } else {
    log('✅', `${fixedCount} prix corrigés`);
  }

  // Stats des prix
  const priceStats = db.prepare(`
    SELECT MIN(price_quoted) as min_p, MAX(price_quoted) as max_p, ROUND(AVG(price_quoted),0) as avg_p
    FROM stays WHERE price_quoted > 0
  `).get();
  log('📊', `Prix : min=${priceStats.min_p}€ max=${priceStats.max_p}€ moyen=${priceStats.avg_p}€`);
}

// ─────────────────────────────────────────────────────
//  ÉTAPE D : FUSION DES CONTACTS EN DOUBLE
// ─────────────────────────────────────────────────────

function mergeDuplicateContacts() {
  log('─'.repeat(46), '');
  log('D', 'FUSION DES CONTACTS EN DOUBLE');

  function normalizeEmail(email) {
    if (!email) return '';
    let e = email.toLowerCase().trim();
    // Supprimer les espaces dans les adresses "via leboncoin"
    e = e.replace(/\s+via\s+.*$/, '');
    return e;
  }

  // Trouver les contacts avec le même nom ou email normalisé
  const allContacts = db.prepare('SELECT * FROM contacts').all();

  // Grouper par nom (insensible à la casse)
  const groups = new Map();
  for (const c of allContacts) {
    const name = (c.name || '').toLowerCase().trim();
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(c);
  }

  let mergedCount = 0;
  let deletedCount = 0;

  for (const [name, contacts] of groups) {
    if (contacts.length < 2) continue;

    log('→', `Fusion des contacts "${name}" (${contacts.length} entrées) :`);
    for (const c of contacts) {
      log('    ·', `${c.id.slice(-8)} : ${c.email} (${c.status}, ${c.total_stays} séjours)`);
    }

    // Trier : celui avec le plus de séjours en premier (meilleur candidat)
    contacts.sort((a, b) => (b.total_stays || 0) - (a.total_stays || 0));

    const keep = contacts[0];
    const dups = contacts.slice(1);

    for (const dup of dups) {
      // Transférer les séjours vers le contact principal
      const staysToMove = db.prepare('SELECT * FROM stays WHERE contact_id = ?').all(dup.id);
      for (const s of staysToMove) {
        db.prepare('UPDATE stays SET contact_id = ? WHERE id = ?').run(keep.id, s.id);
      }

      // Transférer les auto_replies
      db.prepare('UPDATE auto_replies SET contact_id = ? WHERE contact_id = ?').run(keep.id, dup.id);

      // Transférer les requested_weeks
      db.prepare('UPDATE requested_weeks SET contact_id = ? WHERE contact_id = ?').run(keep.id, dup.id);

      // Supprimer le doublon
      db.prepare('DELETE FROM contacts WHERE id = ?').run(dup.id);
      deletedCount++;

      log('    🗑️', `${dup.id.slice(-8)} <${dup.email}> supprimé, ${staysToMove.length} séjour(s) transféré(s)`);
    }

    // Mettre à jour total_stays pour le contact conservé
    const newCount = db.prepare('SELECT COUNT(*) as c FROM stays WHERE contact_id = ?').get(keep.id).c;
    db.prepare('UPDATE contacts SET total_stays = ? WHERE id = ?').run(newCount, keep.id);

    mergedCount++;
  }

  if (mergedCount === 0) {
    log('→', 'Aucun contact en double détecté');
  } else {
    log('✅', `${mergedCount} groupes fusionnés, ${deletedCount} doublons supprimés`);
  }
}

// ─────────────────────────────────────────────────────
//  ÉTAPE E : CORRECTION DES STATUTS
// ─────────────────────────────────────────────────────

function fixStatuses() {
  log('─'.repeat(46), '');
  log('E', 'CORRECTION DES STATUTS');

  // Règle : "client" UNIQUEMENT si au moins un séjour avec status='confirmed' ou 'paid' 
  // ET prix (price_confirmed ou price_quoted) > 1000€
  // Tout le reste → "prospect"

  const allContacts = db.prepare('SELECT * FROM contacts').all();
  let clientCount = 0;
  let demotedCount = 0;
  let promotedCount = 0;

  const updateStatus = db.prepare('UPDATE contacts SET status = ? WHERE id = ?');

  const tx = db.transaction(() => {
    for (const c of allContacts) {
      const stays = db.prepare(`
        SELECT * FROM stays WHERE contact_id = ?
      `).all(c.id);

      const hasValidStay = stays.some(s => {
        if (s.status !== 'confirmed' && s.status !== 'paid') return false;
        const price = s.price_confirmed > 0 ? s.price_confirmed : s.price_quoted;
        return price > 1000;
      });

      const oldStatus = c.status;
      const newStatus = hasValidStay ? 'client' : 'prospect';

      if (newStatus !== oldStatus) {
        updateStatus.run(newStatus, c.id);
        if (newStatus === 'prospect') {
          demotedCount++;
          log('  ↓', `${c.name} <${c.email}> : ${oldStatus} → prospect`);
        } else {
          promotedCount++;
          log('  ↑', `${c.name} <${c.email}> : ${oldStatus} → client`);
        }
      } else if (newStatus === 'client') {
        clientCount++;
      }
    }
  });
  tx();

  log('→', `${clientCount} clients conservés, ${promotedCount} promus, ${demotedCount} rétrogradés`);
  log('📊', `Clients : ${db.prepare("SELECT COUNT(*) as c FROM contacts WHERE status = 'client'").get().c}`);
  log('📊', `Prospects : ${db.prepare("SELECT COUNT(*) as c FROM contacts WHERE status = 'prospect'").get().c}`);
}

// ─────────────────────────────────────────────────────
//  POST-NETTOYAGE : MISE À JOUR DES COMPTEURS
// ─────────────────────────────────────────────────────

function updateCounters() {
  log('─'.repeat(46), '');
  log('📋', 'MISE À JOUR DES COMPTEURS');

  db.prepare(`
    UPDATE contacts SET total_stays = (
      SELECT COUNT(*) FROM stays WHERE stays.contact_id = contacts.id
    )
  `).run();

  log('✅', 'Compteurs total_stays mis à jour');
}

// ─────────────────────────────────────────────────────
//  RAPPORT FINAL
// ─────────────────────────────────────────────────────

function finalReport() {
  log('─'.repeat(46), '');
  log('📊', 'RAPPORT FINAL');

  const contacts = db.prepare("SELECT status, COUNT(*) as c FROM contacts GROUP BY status").all();
  const stays = db.prepare("SELECT status, COUNT(*) as c FROM stays GROUP BY status").all();

  const totalContacts = db.prepare("SELECT COUNT(*) as c FROM contacts").get().c;
  const totalStays = db.prepare("SELECT COUNT(*) as c FROM stays").get().c;
  const totalEmails = db.prepare("SELECT COUNT(*) as c FROM emails").get().c;
  const totalAutoReplies = db.prepare("SELECT COUNT(*) as c FROM auto_replies").get().c;

  const priceInfo = db.prepare(`
    SELECT 
      ROUND(AVG(price_quoted),0) as avg_price,
      MIN(price_quoted) as min_price,
      MAX(price_quoted) as max_price,
      SUM(price_quoted) as total_price
    FROM stays WHERE price_quoted > 0
  `).get();

  const confirmedRevenue = db.prepare(`
    SELECT COALESCE(SUM(price_confirmed),0) as total FROM stays WHERE status IN ('confirmed','paid')
  `).get().total;

  console.log('');
  console.log(`  👤  Contacts     : ${totalContacts}`);
  for (const c of contacts) {
    console.log(`       · ${c.status.padEnd(14)} : ${c.c}`);
  }
  console.log(`  🏠  Séjours      : ${totalStays}`);
  for (const s of stays) {
    console.log(`       · ${s.status.padEnd(14)} : ${s.c}`);
  }
  console.log(`  📧  Emails       : ${totalEmails}`);
  console.log(`  🤖  Auto-replies : ${totalAutoReplies}`);
  console.log(`  💰  Revenus confirmés : ${confirmedRevenue}€`);
  if (priceInfo.total_price) {
    console.log(`  💵  Prix moyen   : ${priceInfo.avg_price}€`);
    console.log(`  💵  Prix min/max : ${priceInfo.min_price}€ - ${priceInfo.max_price}€`);
    console.log(`  💵  Total (tous) : ${priceInfo.total_price}€`);
  }
  console.log('');
}

// ─────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────

console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║   🧹 NETTOYAGE COMPLET DE LA BASE DE DONNÉES ║');
console.log('╚══════════════════════════════════════════════╝');
console.log(`  Base : ${DB_PATH}`);
console.log(`  Avant : ${count('contacts')} contacts, ${count('stays')} séjours, ${count('emails')} emails`);
console.log('');

const cleanup = db.transaction(() => {
  deleteSpam();
  deduplicateStays();
  fixPrices();
  mergeDuplicateContacts();
  fixStatuses();
  updateCounters();
});

cleanup();
finalReport();

db.close();
console.log('✅ Nettoyage terminé avec succès !');
