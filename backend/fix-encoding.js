/**
 * Fix les caractères UTF-8 mal encodés dans les body_text/subjects de la DB.
 *
 * Le problème : les emails IMAP arrivent en UTF-8 mais certaines parties
 * sont interprétées comme Latin1 (ISO-8859-1), ce qui donne des caractères
 * comme Ã© (é mal interprété), Ã  (à), Ã§ (ç), Â  (espace précédé de U+00A0).
 *
 * Usage: node fix-encoding.js
 */

import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '../emails.db';
const db = new Database(DB_PATH);

// Décodage en deux étapes : Latin1 → UTF-8
// Quand un texte UTF-8 est interprété comme Latin1 :
// - é (U+00E9, bytes C3 A9) devient Ã© (U+00C3 U+00A9)
// - è (U+00E8, bytes C3 A8) devient Ã¨
// - à (U+00E0, bytes C3 A0) devient Ã
// - ç (U+00E7, bytes C3 A7) devient Ã§
// - Le caractère U+00A0 (non-breaking space) devient Â suivi d'espace
function fixEncoding(str) {
  if (!str) return str;
  // Étape 1 : Convertir les séquences Latin1 mal interprétées en UTF-8
  // en re-encodant chaque caractère Latin1 en UTF-8
  const replacements = [
    // Voyelles avec accents (bytes C3 xx interprétés en Latin1)
    ['Ã©', 'é'], ['Ã¨', 'è'], ['Ãª', 'ê'], ['Ã«', 'ë'],
    ['Ã ', 'à'], ['Ã¢', 'â'], ['Ã¤', 'ä'],
    ['Ã¹', 'ù'], ['Ã»', 'û'], ['Ã¼', 'ü'],
    ['Ã´', 'ô'], ['Ã¶', 'ö'], ['Ã²', 'ò'],
    ['Ã®', 'î'], ['Ã¯', 'ï'],
    ['Ã§', 'ç'],
    ['Å“', 'œ'], ['Å’', 'Œ'],

    // Majuscules
    ['Ã‰', 'É'], ['Ãˆ', 'È'], ['ÃŠ', 'Ê'], ['Ã‹', 'Ë'],
    ['Ã€', 'À'], ['Ã‚', 'Â'], ['Ã„', 'Ä'],
    ['ÃŒ', 'Ì'], ['ÃŽ', 'Î'], ['Ã', 'Ï'],
    ['Ã™', 'Ù'], ['Ãš', 'Ú'], ['Ã›', 'Û'],
    ['Ã”', 'Ô'], ['Ã–', 'Ö'], ['Ã“', 'Ó'],
    ['Ã‡', 'Ç'],

    // Caractères spéciaux
    ['â‚¬', '€'], ['â€™', "'"], ['â€œ', '"'], ['â€\u009d', '"'],
    ['â€"', '—'], ['â€“', '–'], ['â€¢', '•'], ['â€¦', '…'],
    ['â˜…', '★'], ['â˜†', '☆'],
    ['â†’', '→'], ['â†', '←'],

    // U+00A0 (non-breaking space) mal interprété : Â suivi d'espace
    ['Â ', ' '],
    ['Â ', ' '],
  ];

  for (const [bad, good] of replacements) {
    str = str.split(bad).join(good);
  }

  // Correction spécifique des caractères Latin1 mal interprétés
  // « Ï » (U+00CF) → byte 0xCF en Latin1 → « à » (U+00E0)
  str = str.replace(/Ï/g, 'à');

  // U+2019 (RIGHT SINGLE QUOTATION MARK `'`) → bytes E2 80 99 en UTF-8
  // quand interprété comme Latin1 donne « â\x80\x99 »
  // Remplacer chaque « â\x80\x99 » par l'apostrophe correcte
  str = str.replace(/â/g, "'");
  str = str.replace(/â€™/g, "'");
  str = str.replace(/â/g, "'");

  // U+2013 (–) et U+2014 (—)
  str = str.replace(/â€"/g, '—');
  str = str.replace(/â€"/g, '–');

  // U+00AB (») et U+00BB («) guillemets
  str = str.replace(/Â«/g, '«');
  str = str.replace(/Â»/g, '»');

  // U+00A0 (non-breaking space) → espace normal
  str = str.replace(/\u00a0/g, ' ');

  // BOM UTF-8 (ï»¿ = U+FEFF) en début de message
  str = str.replace(/\ufeff/g, '');

  // U+00C0 (À) mal interprété : « à » (à + control) → À
  str = str.replace(/à\u0080/g, 'À');

  // Caractères de contrôle U+0080-U+009F (sauf \t \n \r)
  str = str.replace(/[\u0080-\u009F]/g, '');

  // U+00C1 (Á), U+00C9 (É) etc qui auraient pu être touchés
  // Déjà géré par les remplacements ci-dessus

  // Nettoyage final : espaces multiples
  str = str.replace(/ {3,}/g, '  ');
  return str;
}

// Appliquer sur emails, contacts, stays, auto_replies
const tables = [
  { name: 'emails', fields: ['body_text', 'subject', 'sender_name'] },
];

let totalFixed = 0;

for (const table of tables) {
  const conditions = table.fields
    .map(f => `${f} LIKE '%Ã%' OR ${f} LIKE '%Â%' OR ${f} LIKE '%â€%' OR ${f} LIKE '%Ï%' OR ${f} LIKE '%â%'`)
    .join(' OR ');
  const rows = db.prepare(`SELECT id, ${table.fields.join(', ')} FROM ${table.name} WHERE ${conditions}`).all();
  console.log(`📧 ${table.name}: ${rows.length} lignes avec encodage cassé`);

  if (rows.length === 0) continue;

  const updateFields = table.fields.map(f => `${f} = ?`).join(', ');
  const updateStmt = db.prepare(`UPDATE ${table.name} SET ${updateFields} WHERE id = ?`);

  const tx = db.transaction(() => {
    for (const row of rows) {
      const fixed = table.fields.map(f => fixEncoding(row[f]));
      const changed = fixed.some((v, i) => v !== row[table.fields[i]]);
      if (changed) {
        updateStmt.run(...fixed, row.id);
        totalFixed++;
      }
    }
  });

  tx();
}

console.log(`\n✅ ${totalFixed} champs corrigés au total`);

// Vérification
const remaining = db.prepare("SELECT COUNT(*) as c FROM emails WHERE body_text LIKE '%Ã©%' OR body_text LIKE '%Ã¨%' OR body_text LIKE '%Ã§%' OR body_text LIKE '%Ã %'").get();
console.log(`📊 Restants avec Ã: ${remaining.c}`);

db.close();
