/**
 * Génération docx depuis modèles tagués + pack contrat (zip).
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import JSZip from 'jszip';
import { buildDocumentFields } from './document-fields.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, 'templates');

function loadTemplate(name) {
  const path = join(TEMPLATES_DIR, name);
  if (!existsSync(path)) {
    throw new Error(`Modèle manquant: ${name}. Exécutez: node backend/prepare-templates.js`);
  }
  return readFileSync(path);
}

function renderDocx(templateName, data) {
  const buf = loadTemplate(templateName);
  const zip = new PizZip(buf);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
  });
  doc.render(data);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export function generateContractDocx(contact, overrides = {}) {
  const data = buildDocumentFields(contact, overrides);
  return renderDocx('contrat.docx', data);
}

export function generateInvoiceDocx(contact, overrides = {}) {
  const data = buildDocumentFields(contact, overrides);
  return renderDocx('facture.docx', data);
}

export async function generateContractPackZip(contact, overrides = {}) {
  const data = buildDocumentFields(contact, overrides);
  const contract = renderDocx('contrat.docx', data);
  const cgl = loadTemplate('annexe-cgl.docx');
  const fdc = loadTemplate('annexe-fdc.docx');

  const safeName = (contact?.name || 'locataire').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
  const zip = new JSZip();
  zip.file(`Contrat_${safeName}.docx`, contract);
  zip.file(`Annexe_1_CGL_${safeName}.docx`, cgl);
  zip.file(`Annexe_2_FDC_${safeName}.docx`, fdc);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export function previewDocumentFields(contact, overrides = {}) {
  const fields = buildDocumentFields(contact, overrides);
  const raw = fields._raw;
  return {
    ...fields,
    weeklyRent: raw.weeklyRent || '',
    rentalTotal: raw.rentalTotal || '',
    touristTaxTotal: raw.touristTaxTotal || '',
    totalDue: raw.totalDue || '',
    deposit30: raw.deposit30 || '',
    balance70: raw.balance70 || '',
    nights: fields.nights,
    weeks: Number(fields.weeks) || '',
  };
}
