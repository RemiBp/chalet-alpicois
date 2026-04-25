/**
 * Fix les caractères UTF-8 mal encodés dans les body_text de la DB.
 * Les emails ont été synchronisés avec un mauvais charset (latin1 au lieu d'utf-8).
 * 
 * Usage: node fix-encoding.js
 */

import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || '../emails.db';
const db = new Database(DB_PATH);

// Mapping des séquences latin1 mal interprétées → UTF-8 correct
const REPLACEMENTS = {
  'Ã©': 'é', 'Ã¨': 'è', 'Ãª': 'ê', 'Ã«': 'ë',
  'Ã ': 'à', 'Ã¢': 'â', 'Ã¤': 'ä',
  'Ã¹': 'ù', 'Ã»': 'û', 'Ã¼': 'ü',
  'Ã´': 'ô', 'Ã¶': 'ö', 'Ã²': 'ò',
  'Ã®': 'î', 'Ã¯': 'ï',
  'Ã§': 'ç',
  'Å“': 'œ', 'Å’': 'Œ',
  'Ã ': 'à',
  'Ã‰': 'É', 'Ãˆ': 'È', 'ÃŠ': 'Ê', 'Ã‹': 'Ë',
  'Ã€': 'À', 'Ã‚': 'Â', 'Ã„': 'Ä',
  'ÃŒ': 'Ì', 'ÃŽ': 'Î', 'Ã?': 'Ï',
  'Ã™': 'Ù', 'Ãš': 'Ú', 'Ã›': 'Û', 'Å¨': 'Ű',
  'Ã”': 'Ô', 'Ã–': 'Ö', 'Ã“': 'Ó',
  'Ã‡': 'Ç',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'â‚¬': '€', 'â€™': "'", 'â€œ': '"', 'â€\u009d': '"',
  'â€"': '—', 'â€"': '–', 'â€¢': '•', 'â€¦': '…',
  'â™¥': '♥', 'â˜…': '★', 'â˜†': '☆',
  'â†': '→', 'â†': '←', 'â†': '↑', 'â†': '↓',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' ',
  'Â ': ' '
};

function fixString(str) {
  if (!str) return str;
  for (const [bad, good] of Object.entries(REPLACEMENTS)) {
    str = str.split(bad).join(good);
  }
  return str;
}

const emails = db.prepare("SELECT id, body_text, subject, sender_name FROM emails WHERE body_text LIKE '%Ã%' OR subject LIKE '%Ã%' OR sender_name LIKE '%Ã%'").all();
console.log(`📧 ${emails.length} emails à corriger...`);

const updateBody = db.prepare("UPDATE emails SET body_text = ? WHERE id = ?");
const updateSubject = db.prepare("UPDATE emails SET subject = ? WHERE id = ?");
const updateSender = db.prepare("UPDATE emails SET sender_name = ? WHERE id = ?");

let count = 0;
const tx = db.transaction(() => {
  for (const email of emails) {
    const newBody = fixString(email.body_text);
    const newSubject = fixString(email.subject);
    const newSender = fixString(email.sender_name);
    
    if (newBody !== email.body_text) updateBody.run(newBody, email.id);
    if (newSubject !== email.subject) updateSubject.run(newSubject, email.id);
    if (newSender !== email.sender_name) updateSender.run(newSender, email.id);
    
    count++;
    if (count % 100 === 0) process.stdout.write(`   ${count}/${emails.length}...\r`);
  }
});

tx();
console.log(`\n✅ ${count} emails corrigés`);

// Vérifier qu'il ne reste pas de mauvais encodage
const remaining = db.prepare("SELECT COUNT(*) as c FROM emails WHERE body_text LIKE '%Ã©%' OR body_text LIKE '%Ã¨%' OR body_text LIKE '%Ã§%'").get();
console.log(`📊 Restants à corriger: ${remaining.c}`);

db.close();
