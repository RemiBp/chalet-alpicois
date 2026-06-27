/**
 * Génération docx depuis modèles tagués + pack contrat (zip).
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import JSZip from 'jszip';
import { buildDocumentFields, getDocumentFormDates } from './document-fields.js';
import { stripDocxHighlights } from './docx-postprocess.js';
import { convertDocxToPdf } from './docx-to-pdf.js';
import { buildPackEntryNames } from './document-filenames.js';

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
  const rendered = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  return stripDocxHighlights(rendered);
}

export function generateContractDocx(contact, overrides = {}) {
  const data = buildDocumentFields(contact, overrides);
  return renderDocx('contrat.docx', data);
}

export function generateInvoiceDocx(contact, overrides = {}) {
  const data = buildDocumentFields(contact, overrides);
  return renderDocx('facture.docx', data);
}

export async function generateContractPdf(contact, overrides = {}) {
  return convertDocxToPdf(generateContractDocx(contact, overrides));
}

export async function generateInvoicePdf(contact, overrides = {}) {
  return convertDocxToPdf(generateInvoiceDocx(contact, overrides));
}

export async function generateContractPackZip(contact, overrides = {}) {
  const names = buildPackEntryNames(contact, overrides);
  const contractPdf = await generateContractPdf(contact, overrides);
  const cglPdf = await convertDocxToPdf(stripDocxHighlights(loadTemplate('annexe-cgl.docx')));
  const fdcPdf = await convertDocxToPdf(stripDocxHighlights(loadTemplate('annexe-fdc.docx')));

  const zip = new JSZip();
  zip.file(names.contract, contractPdf);
  zip.file(names.cgl, cglPdf);
  zip.file(names.fdc, fdcPdf);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export function previewDocumentFields(contact, overrides = {}) {
  const fields = buildDocumentFields(contact, overrides);
  const raw = fields._raw;
  const dates = getDocumentFormDates(contact, overrides);

  return {
    ...fields,
    ...dates,
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
