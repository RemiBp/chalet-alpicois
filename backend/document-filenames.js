/**
 * Noms de fichiers téléchargeables — lisibles et uniques par locataire / séjour.
 */

import { buildDocumentFields, getDocumentFormDates } from './document-fields.js';
import { displayNameFromContact } from './name-format.js';

function slugPart(value, maxLen = 48) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\w\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, maxLen) || 'Document';
}

function formatRef(contractNumber) {
  return slugPart(String(contractNumber || '').replace(/\//g, '-').replace(/\s+/g, '_'), 32);
}

function tenantSlug(contact, overrides = {}) {
  const name = overrides.tenantName || (contact ? displayNameFromContact(contact) : '');
  return slugPart(name, 40);
}

function datePart(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

export function buildDocumentFilename(type, contact, overrides = {}) {
  const fields = buildDocumentFields(contact, overrides);
  const dates = getDocumentFormDates(contact, overrides);
  const tenant = tenantSlug(contact, overrides);
  const ref = formatRef(fields.contractNumber);
  const checkIn = datePart(dates.checkIn);
  const checkOut = datePart(dates.checkOut);
  const stay = checkIn && checkOut ? `${checkIn}_au_${checkOut}` : checkIn || 'sejour';

  if (type === 'facture' || type === 'facture_acompte' || type === 'facture_solde') {
    const kind = type === 'facture_solde' || overrides.invoiceKind === 'solde' ? 'Solde' : 'Acompte';
    const refPart = ref ? `_${ref}` : '';
    return `Facture_${kind}_L_Alpicois_${tenant}${refPart}_${stay}.docx`;
  }
  if (type === 'contrat') {
    return `Contrat_L_Alpicois_${tenant}_${stay}.docx`;
  }
  if (type === 'pack') {
    return `Pack_L_Alpicois_${tenant}_${stay}.zip`;
  }
  return `Document_L_Alpicois_${tenant}.pdf`;
}

export function buildPackEntryNames(contact, overrides = {}) {
  const fields = buildDocumentFields(contact, overrides);
  const dates = getDocumentFormDates(contact, overrides);
  const tenant = tenantSlug(contact, overrides);
  const checkIn = datePart(dates.checkIn);
  const checkOut = datePart(dates.checkOut);
  const stay = checkIn && checkOut ? `${checkIn}_au_${checkOut}` : checkIn || 'sejour';
  const ref = formatRef(fields.contractNumber);

  return {
    contract: `Contrat_L_Alpicois_${tenant}_${stay}.pdf`,
    cgl: `Annexe1_CGL_L_Alpicois.pdf`,
    fdc: `Annexe2_FDC_L_Alpicois.pdf`,
    ref,
    tenant,
    stay,
  };
}
