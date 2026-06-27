/**
 * Prépare les modèles docx avec balises docxtemplater {tag}.
 * Usage: node backend/prepare-templates.js
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';
import { CONTRACT_TAG_ORDER, INVOICE_TAG_ORDER } from './document-fields.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, 'Administratif formats');
const OUT = join(__dirname, 'templates');

const TEMPLATES = [
  { src: 'Contrat location Alpicois.docx', dest: 'contrat.docx', tags: CONTRACT_TAG_ORDER },
  { src: "Facture Chalet L'Alpicois.docx", dest: 'facture.docx', tags: INVOICE_TAG_ORDER },
  { src: "Annexe 1 - Conditions Générales Location - Chalet L'Alpicois.docx", dest: 'annexe-cgl.docx', tags: [] },
  { src: "Annexe 2 - Fiche Descriptive du chalet L'Alpicois.docx", dest: 'annexe-fdc.docx', tags: [] },
];

function stripHighlightsFromXml(xml) {
  return xml
    .replace(/<w:highlight[^/]*\/>/g, '')
    .replace(/<w:highlight[^>]*>[\s\S]*?<\/w:highlight>/g, '');
}

function tagXml(xml, tags) {
  if (!tags.length) return stripHighlightsFromXml(xml);
  let i = 0;
  return stripHighlightsFromXml(xml).replace(/<w:t>(X+)<\/w:t>/g, (match) => {
    if (i >= tags.length) return match;
    const tag = `{${tags[i++]}}`;
    return `<w:t>${tag}</w:t>`;
  });
}

function processDocx(srcPath, destPath, tags) {
  const buf = readFileSync(srcPath);
  const zip = new PizZip(buf);
  for (const path of Object.keys(zip.files)) {
    if (!/^word\/(document|header|footer)\d*\.xml$/.test(path)) continue;
    const file = zip.file(path);
    if (!file) continue;
    zip.file(path, path === 'word/document.xml' ? tagXml(file.asText(), tags) : stripHighlightsFromXml(file.asText()));
  }
  writeFileSync(destPath, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

function copyDocxStripped(srcPath, destPath) {
  const buf = readFileSync(srcPath);
  const zip = new PizZip(buf);
  for (const path of Object.keys(zip.files)) {
    if (!/^word\/(document|header|footer)\d*\.xml$/.test(path)) continue;
    const file = zip.file(path);
    if (!file) continue;
    zip.file(path, stripHighlightsFromXml(file.asText()));
  }
  writeFileSync(destPath, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

mkdirSync(OUT, { recursive: true });

for (const { src, dest, tags } of TEMPLATES) {
  const srcPath = join(SOURCE, src);
  const destPath = join(OUT, dest);
  if (!existsSync(srcPath)) {
    if (existsSync(destPath)) {
      console.log(`✓ Using committed ${dest}`);
      continue;
    }
    console.warn(`⚠️  Missing: ${src}`);
    continue;
  }
  if (tags.length) {
    processDocx(srcPath, destPath, tags);
    console.log(`✅ Tagged ${dest} (${tags.length} champs)`);
  } else {
    copyDocxStripped(srcPath, destPath);
    console.log(`✅ Copied ${dest}`);
  }
}

console.log('\nModèles prêts dans backend/templates/');
