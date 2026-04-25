/**
 * POST-TRAITEMENT après parsing DeepSeek
 *
 * 1. Fusion des contacts en double
 * 2. Correction des contacts via formulaire relay (barbier.famille)
 * 3. Ajout des nationalités
 * 4. Correction des séjours sans check_out
 * 5. Stats finales
 */

import Database from 'better-sqlite3';
import 'dotenv/config';

const DB_PATH = process.env.DB_PATH || '../emails.db';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ============ ÉTAPE 1 : FUSION DES CONTACTS EN DOUBLE ============

function mergeDuplicateContacts() {
  console.log('\n📋 Étape 1 : Fusion des contacts en double');

  const allContacts = db.prepare('SELECT * FROM contacts ORDER BY total_stays DESC').all();

  // Détection par nom de famille
  const groups = new Map();
  for (const c of allContacts) {
    const name = (c.name || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!name || name === 'inconnu') continue;

    const parts = name.split(/\s+/);
    const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    const firstInitial = parts[0]?.[0] || '';
    const key = lastName + '|' + firstInitial;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  let merged = 0;
  let deleted = 0;

  for (const [key, contacts] of groups) {
    if (contacts.length < 2) continue;
    contacts.sort((a, b) => (b.total_stays || 0) - (a.total_stays || 0));

    const keep = contacts[0];
    const dups = contacts.slice(1);

    for (const dup of dups) {
      const staysMoved = db.prepare('SELECT COUNT(*) as c FROM stays WHERE contact_id = ?').get(dup.id).c;
      if (staysMoved > 0) {
        db.prepare('UPDATE stays SET contact_id = ? WHERE contact_id = ?').run(keep.id, dup.id);
      }
      db.prepare('UPDATE auto_replies SET contact_id = ? WHERE contact_id = ?').run(keep.id, dup.id);
      db.prepare('UPDATE requested_weeks SET contact_id = ? WHERE contact_id = ?').run(keep.id, dup.id);

      // Meilleur nom
      if (dup.name && dup.name.length > (keep.name || '').length && !(keep.name || '').includes(' ')) {
        db.prepare('UPDATE contacts SET name = ? WHERE id = ?').run(dup.name, keep.id);
      }
      // Téléphone si manquant
      if (dup.phone && !keep.phone) {
        db.prepare('UPDATE contacts SET phone = ? WHERE id = ?').run(dup.phone, keep.id);
      }
      // Meilleure date
      if (dup.last_contact_date > keep.last_contact_date) {
        db.prepare('UPDATE contacts SET last_contact_date = ? WHERE id = ?').run(dup.last_contact_date, keep.id);
      }
      if (dup.first_contact_date < keep.first_contact_date) {
        db.prepare('UPDATE contacts SET first_contact_date = ? WHERE id = ?').run(dup.first_contact_date, keep.id);
      }

      console.log(`   🔗 ${keep.name} <${keep.email}> + ${dup.name} <${dup.email}>` + (staysMoved > 0 ? ` → ${staysMoved} séjour(s)` : ''));
      db.prepare('DELETE FROM contacts WHERE id = ?').run(dup.id);
      deleted++;
    }

    const newCount = db.prepare('SELECT COUNT(*) as c FROM stays WHERE contact_id = ?').get(keep.id).c;
    db.prepare('UPDATE contacts SET total_stays = ? WHERE id = ?').run(newCount, keep.id);
    merged++;
  }

  console.log(`   ✅ ${merged} groupes fusionnés, ${deleted} doublons supprimés`);
}

// ============ ÉTAPE 2 : CORRECTION FORMULAIRE RELAY ============

function fixFormRelayContacts() {
  console.log('\n📋 Étape 2 : Correction contacts formulaire relay');

  const relayContacts = db.prepare("SELECT * FROM contacts WHERE email = 'barbier.famille@orange.fr'").all();
  let fixed = 0;

  for (const c of relayContacts) {
    const stays = db.prepare('SELECT * FROM stays WHERE contact_id = ?').all(c.id);
    for (const s of stays) {
      if (s.source_email_id) {
        const email = db.prepare('SELECT sender FROM emails WHERE id = ?').get(s.source_email_id);
        if (email && email.sender && email.sender !== 'barbier.famille@orange.fr') {
          db.prepare('UPDATE contacts SET email = ?, origin = ? WHERE id = ?').run(email.sender, 'website', c.id);
          console.log(`   ✏️  ${c.name} : barbier.famille → ${email.sender}`);
          fixed++;
          break;
        }
      }
    }
  }

  if (fixed === 0) console.log('   → Aucun contact relay à corriger');
  else console.log(`   ✅ ${fixed} contacts corrigés`);
}

// ============ ÉTAPE 3 : NATIONALITÉ ============

function guessNationality(name, email) {
  if (!name) return '';
  const lower = name.toLowerCase();
  const domain = (email || '').toLowerCase();

  const FRENCH_FIRST = ['jean','pierre','paul','jacques','michel','andre','francois','henri','louis','marc','philippe','stephane','nicolas','laurent','patrick','christophe','thierry','didier','eric','sylvain','sebastien','jerome','vincent','antoine','olivier','bruno','rene','alain','claude','bernard','daniel','robert','gerard','marcel','maurice','georges','fernand','leon','raymond','albert','joseph','alexandre','julien','maxime','thomas','florian','kevin','jeremy','quentin','gaetan','damien','cyril','fabien','florent','loic','remi','baptiste','guillaume','bastien','remy','tristan','corentin','arthur','hugo','nathan','lucas','marius','gabriel','raphael','adam','gilles','pascal','xavier','laurence','sophie','cecile','nathalie','isabelle','valerie','sylvie','christine','marie','camille','julie','aurore','caroline','emilie','delphine','severine','sandrine','laetitia','audrey','elodie','vanessa','celine','stephanie'];
  const FRENCH_LAST = ['dupont','martin','bernard','dubois','thomas','robert','richard','petit','durand','leroy','moreau','simon','laurent','lefebvre','michel','garcia','david','bertrand','roux','vincent','fournier','morel','girard','andreu','mercier','blanc','guerin','boyer','garnier','chevallier','faure','rousseau','rousselet','perrin','clement','caron','dumas','menard','maillard','henry','morin','brun','robin','marchal','gautier','aubry','renaud','piton','hautekiet','primard','baudry','joly','coulon','hosty','nemazine','lefevre','rode','daniel','delachaume','brand','charlie','rodrigues','elineau','marquaille','bouhil','desseaux','bourgault','lorenzo'];

  // Nom français : prénom français + nom français
  for (const first of FRENCH_FIRST) {
    if (lower.includes(first)) {
      for (const last of FRENCH_LAST) {
        if (lower.includes(last)) return 'Française';
      }
    }
  }

  // Si juste un nom très français
  for (const last of FRENCH_LAST) {
    if (lower.endsWith(last) || lower.includes(' ' + last)) return 'Française';
  }

  // Prénoms très français
  const fullname = lower.split(/\s+/);
  const firstname = fullname[0];
  if (FRENCH_FIRST.includes(firstname)) return 'Française';

  // Indices spécifiques
  if (domain.includes('.fr') || domain.includes('@orange.fr') || domain.includes('@free.fr') || domain.includes('@laposte.net') || domain.includes('@sfr.fr') || domain.includes('@wanadoo.fr') || domain.includes('@outlook.fr') || domain.includes('@hotmail.fr')) return 'Française';
  if (domain.includes('.nl') || domain.includes('@ziggo') || domain.includes('@casema') || domain.includes('@hetnet')) return 'Neerlandaise';
  if (domain.includes('.co.uk') || domain.includes('@blueyonder') || domain.includes('@igoski')) return 'Britannique';
  if (domain.includes('.de')) return 'Allemande';

  // Prénoms spécifiques
  const DUTCH_NAMES = ['van ','jan ','piet ','henk','willem','klaas','dirk','sander','bart ','gert ','jelle','thijs','remco','menno','bas ','tim ','wouter','ruud','freek','marijke','arjan'];
  for (const n of DUTCH_NAMES) if (lower.startsWith(n) || lower.includes(' ' + n.trim())) return 'Neerlandaise';

  const UK_NAMES = ['john','james','william','henry','charles','robert','richard','michael','stephen','andrew','chris','simon','brian','daniel','matthew','stuart','alan','graham','bruce','steven','anthony','ian','edward','oliver','jack','harry','joe','alex','george'];
  for (const n of UK_NAMES) if (firstname === n) return 'Britannique';

  const BELGIAN_NAMES = ['bart','luc ','patrick','johan','frank','wim','piet','geert','stefan','koen','filip'];
  for (const n of BELGIAN_NAMES) if (firstname === n) return 'Belge';

  const SPANISH_NAMES = ['jose','juan','manuel','antonio','javier','francisco','carlos','jorge','miguel','angel','ramon','pedro','luis','enrique','pablo','alejandro','fernando','vicente','rafael'];
  for (const n of SPANISH_NAMES) if (firstname === n) return 'Espagnole';

  const ITALIAN_NAMES = ['giuseppe','marco','paolo','francesco','andrea','roberto','claudio','luca','mario','giovanni','luigi','federico','davide','valerio','mauro','enrico'];
  for (const n of ITALIAN_NAMES) if (firstname === n) return 'Italienne';

  const GERMAN_NAMES = ['hans','fritz','karl','heinz','werner','gunther','klaus','wolfgang','dieter','jurgen','rolf','horst','erich','gerhard','bernd','manfred','thorsten','jens','markus'];
  for (const n of GERMAN_NAMES) if (firstname === n) return 'Allemande';

  return '';
}

function fillNationalities() {
  console.log('\n📋 Étape 3 : Ajout des nationalités');

  const contacts = db.prepare("SELECT * FROM contacts WHERE nationality IS NULL OR nationality = ''").all();
  let filled = 0;

  for (const c of contacts) {
    const nationality = guessNationality(c.name, c.email);
    if (nationality) {
      db.prepare('UPDATE contacts SET nationality = ? WHERE id = ?').run(nationality, c.id);
      filled++;
      console.log(`   🌍 ${nationality.padEnd(15)} : ${c.name} <${c.email}>`);
    }
  }

  console.log(`   ✅ ${filled} nationalités ajoutées (sur ${contacts.length} contacts sans nationalité)`);
}

// ============ ÉTAPE 4 : NETTOYAGE SÉJOURS ============

function fixStays() {
  console.log('\n📋 Étape 4 : Correction des séjours');

  let fixed = 0;
  const stays = db.prepare("SELECT * FROM stays WHERE check_out IS NULL OR check_out = ''").all();
  for (const s of stays) {
    if (s.check_in && s.nights > 0) {
      const d = new Date(s.check_in);
      d.setDate(d.getDate() + s.nights);
      db.prepare('UPDATE stays SET check_out = ? WHERE id = ?').run(d.toISOString().split('T')[0], s.id);
      fixed++;
    }
  }
  console.log(`   ✅ ${fixed} séjours sans check_out corrigés`);

  // Supprimer les séjours avec contact_id qui n'existe plus
  const orphans = db.prepare('SELECT COUNT(*) as c FROM stays WHERE contact_id NOT IN (SELECT id FROM contacts)').get().c;
  if (orphans > 0) {
    db.prepare('DELETE FROM stays WHERE contact_id NOT IN (SELECT id FROM contacts)').run();
    console.log(`   🗑️ ${orphans} séjours orphelins supprimés`);
  }
}

// ============ ÉTAPE 4b : DÉDOUBLONNAGE SÉJOURS ============

function deduplicateStays() {
  console.log('\n📋 Étape 4b : Dédoublonnage des séjours');

  let totalDeleted = 0;
  let totalKept = 0;

  // Parcourir chaque contact qui a des stays
  const contacts = db.prepare('SELECT id, name FROM contacts').all();

  for (const contact of contacts) {
    const stays = db.prepare('SELECT * FROM stays WHERE contact_id = ? ORDER BY check_in, status DESC').all(contact.id);
    if (stays.length <= 1) continue;

    const kept = new Set();
    const deleted = new Set();

    for (let i = 0; i < stays.length; i++) {
      if (deleted.has(stays[i].id)) continue;
      kept.add(stays[i].id);

      const s1 = stays[i];
      const d1in = new Date(s1.check_in).getTime();
      const d1out = new Date(s1.check_out || s1.check_in).getTime();

      for (let j = i + 1; j < stays.length; j++) {
        if (deleted.has(stays[j].id)) continue;
        const s2 = stays[j];
        const d2in = new Date(s2.check_in).getTime();
        const d2out = new Date(s2.check_out || s2.check_in).getTime();

        // Chevauchement : si les périodes se touchent ou se chevauchent
        const overlap = !(d1out <= d2in || d2out <= d1in);
        // Même date exacte
        const sameDate = s1.check_in === s2.check_in;

        // Pas de chevauchement ni même date → deux séjours distincts
        if (!overlap && !sameDate) continue;

        // Sinon, c'est un doublon — garder le meilleur
        // Priorité : confirmed > paid > pending, puis price_confirmed > 0, puis le plus récent
        const s1Score = (s1.status === 'confirmed' || s1.status === 'paid') ? 100 : 0
          + (s1.price_confirmed > 0 ? 50 : 0)
          + (s1.price_quoted > 0 ? 10 : 0);
        const s2Score = (s2.status === 'confirmed' || s2.status === 'paid') ? 100 : 0
          + (s2.price_confirmed > 0 ? 50 : 0)
          + (s2.price_quoted > 0 ? 10 : 0);

        // Si les deux ont le même score, garder le plus récent
        if (s2Score > s1Score) {
          // On garde s2, on supprime s1
          kept.delete(s1.id);
          s1.id = s2.id; // hack pour dire "on a changé"
          const temp = s1Score;
          // actually: swap — garder s2
          kept.add(s2.id);
          deleted.delete(s2.id);
          deleted.add(s1.id);
        } else {
          deleted.add(s2.id);
        }
      }
    }

    for (const id of deleted) {
      db.prepare('DELETE FROM stays WHERE id = ?').run(id);
      totalDeleted++;
    }
    totalKept += kept.size;
  }

  // Mettre à jour total_stays pour tous les contacts
  db.prepare(`UPDATE contacts SET total_stays = (SELECT COUNT(*) FROM stays WHERE contact_id = contacts.id)`).run();

  console.log(`   ✅ ${totalDeleted} séjours en double supprimés, ${totalKept} séjours conservés`);
}

// ============ ÉTAPE 5 : STATS ============

function finalStats() {
  console.log('\n📊 STATS FINALES\n');

  const totalEmails = db.prepare("SELECT COUNT(*) as c FROM emails").get().c;
  const parsedEmails = db.prepare("SELECT COUNT(*) as c FROM emails WHERE parsed=1").get().c;
  const totalContacts = db.prepare("SELECT COUNT(*) as c FROM contacts").get().c;
  const totalStays = db.prepare("SELECT COUNT(*) as c FROM stays").get().c;
  const clients = db.prepare("SELECT COUNT(*) as c FROM contacts WHERE status='client'").get().c;
  const prospects = db.prepare("SELECT COUNT(*) as c FROM contacts WHERE status='prospect'").get().c;
  const confirmedStays = db.prepare("SELECT COUNT(*) as c FROM stays WHERE status IN ('confirmed','paid')").get().c;
  const pendingStays = db.prepare("SELECT COUNT(*) as c FROM stays WHERE status='pending'").get().c;
  const staysWithPrices = db.prepare("SELECT COUNT(*) as c FROM stays WHERE price_quoted > 0 OR price_confirmed > 0").get().c;
  const totalRevenue = db.prepare("SELECT COALESCE(SUM(COALESCE(price_confirmed,0)),0) as rev FROM stays WHERE status IN ('confirmed','paid')").get().rev;
  const totalQuoted = db.prepare("SELECT COALESCE(SUM(price_quoted),0) as rev FROM stays").get().rev;

  const nationalities = db.prepare("SELECT nationality, COUNT(*) as c FROM contacts WHERE nationality != '' GROUP BY nationality ORDER BY c DESC").all();

  console.log(`📧  Emails        : ${parsedEmails}/${totalEmails} parsés`);
  console.log(`👤  Contacts      : ${totalContacts}`);
  console.log(`    · Clients     : ${clients}`);
  console.log(`    · Prospects   : ${prospects}`);
  console.log(`🏠  Séjours       : ${totalStays} (${confirmedStays} confirmés, ${pendingStays} en attente)`);
  console.log(`    · Avec prix   : ${staysWithPrices}`);
  console.log(`💰  Revenus       : ${totalRevenue.toLocaleString('fr-FR')}€ (confirmés)`);
  console.log(`    · Total devisé: ${totalQuoted.toLocaleString('fr-FR')}€`);

  if (nationalities.length > 0) {
    console.log(`🌍  Nationalités  :`);
    for (const n of nationalities) {
      console.log(`    · ${n.nationality.padEnd(15)} : ${n.c}`);
    }
  }

  // Prochains séjours
  const today = new Date().toISOString().split('T')[0];
  const upcoming = db.prepare(`
    SELECT c.name, s.check_in, s.price_quoted, s.status 
    FROM stays s JOIN contacts c ON c.id=s.contact_id 
    WHERE s.check_in >= ? AND s.status NOT IN ('cancelled')
    ORDER BY s.check_in LIMIT 10
  `).all(today);

  if (upcoming.length > 0) {
    console.log(`📅  Prochains     :`);
    for (const s of upcoming) {
      const p = s.price_quoted > 0 ? ` ${s.price_quoted}€` : '';
      console.log(`    · ${s.check_in} : ${s.name}${p} [${s.status}]`);
    }
  }
}

// ============ MAIN ============

function main() {
  console.log('═══════════════════════════════════════');
  console.log('  🧹 POST-TRAITEMENT');
  console.log('═══════════════════════════════════════\n');

  const beforeContacts = db.prepare("SELECT COUNT(*) as c FROM contacts").get().c;
  const beforeStays = db.prepare("SELECT COUNT(*) as c FROM stays").get().c;
  console.log(`📊 Avant : ${beforeContacts} contacts, ${beforeStays} séjours\n`);

  mergeDuplicateContacts();
  fixFormRelayContacts();
  fixStays();
  deduplicateStays();
  fillNationalities();

  // Mise à jour des statuts
  console.log('\n📋 Mise à jour des statuts...');
  db.prepare(`
    UPDATE contacts SET status = 'client' WHERE id IN (
      SELECT DISTINCT contact_id FROM stays 
      WHERE status IN ('confirmed', 'paid')
        AND (price_confirmed > 500 OR (price_confirmed = 0 AND price_quoted > 500))
    )
  `).run();
  db.prepare("UPDATE contacts SET status = 'prospect' WHERE status != 'client'").run();

  const totalClients = db.prepare("SELECT COUNT(*) as c FROM contacts WHERE status='client'").get().c;
  console.log(`   ✅ ${totalClients} clients, ${beforeContacts - totalClients - (beforeContacts - db.prepare('SELECT COUNT(*) as c FROM contacts').get().c)} prospects`);

  finalStats();
  db.close();
  console.log('\n✅ Post-traitement terminé !');
}

main();
