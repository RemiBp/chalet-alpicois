/**
 * Corps d'email + pièces jointes pour factures / contrats.
 */

import { buildDocumentFields, LANDLORD } from './document-fields.js';
import {
  generateInvoiceDocx,
  generateContractDocx,
  generateInvoicePdf,
  generateContractPdf,
  generateContractPackZip,
} from './generate-documents.js';
import { buildDocumentFilename } from './document-filenames.js';

function firstName(fullName) {
  const cleaned = (fullName || '').replace(/^(m\.|mme\.?|mr\.?|monsieur|madame)\s+/i, '').trim();
  return cleaned.split(/\s+/)[0] || 'Bonjour';
}

function stayRange(fields) {
  if (fields.checkInFormatted && fields.checkOutFormatted) {
    return `du ${fields.checkInFormatted} au ${fields.checkOutFormatted}`;
  }
  return '';
}

export async function buildDocumentDraftPayload(contact, type, overrides = {}) {
  const fields = buildDocumentFields(contact, overrides);
  const to = fields.tenantEmail || contact?.email;
  if (!to) throw new Error('Email locataire manquant — renseignez-le dans le formulaire');

  let attachments = [];

  if (type === 'facture' || type === 'facture_acompte' || type === 'facture_solde') {
    const docOverrides = {
      ...overrides,
      invoiceKind: type === 'facture_solde' ? 'solde' : type === 'facture_acompte' ? 'acompte' : overrides.invoiceKind,
    };
    attachments = [{
      filename: buildDocumentFilename(type, contact, docOverrides),
      content: generateInvoiceDocx(contact, docOverrides),
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }];
  } else if (type === 'contrat') {
    attachments = [{
      filename: buildDocumentFilename('contrat', contact, overrides),
      content: generateContractDocx(contact, overrides),
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }];
  } else if (type === 'pack') {
    attachments = [{
      filename: buildDocumentFilename('pack', contact, overrides),
      content: await generateContractPackZip(contact, overrides),
      contentType: 'application/zip',
    }];
  } else {
    throw new Error('type invalide (facture | facture_acompte | facture_solde | contrat | pack)');
  }

  const greeting = firstName(fields.tenantName);
  const stay = stayRange(fields);
  const stayPhrase = stay ? ` ${stay}` : '';

  let subject;
  let text;

  if (type === 'facture' || type === 'facture_acompte' || type === 'facture_solde') {
    const isSolde = type === 'facture_solde' || overrides.invoiceKind === 'solde';
    subject = `${isSolde ? 'Facture de solde' : "Facture d'acompte"} — Chalet L'Alpicois${stayPhrase}`;
    const amountLine = isSolde
      ? `Solde à régler : ${fields.balance70} €`
      : `Acompte à régler : ${fields.deposit30} €`;
    text = [
      `Bonjour ${greeting},`,
      '',
      `Veuillez trouver ci-joint votre ${isSolde ? 'facture de solde' : "facture d'acompte"} pour votre séjour au Chalet L'Alpicois${stayPhrase}.`,
      '',
      amountLine,
      `Référence : ${fields.contractNumber}`,
      '',
      LANDLORD.ribNote,
      '',
      'Bien cordialement,',
      '',
      LANDLORD.name,
      "Chalet L'Alpicois",
      LANDLORD.email,
      LANDLORD.phoneGilles,
    ].join('\n');
  } else {
    const docLabel = type === 'pack'
      ? 'votre pack de documents (contrat, conditions générales et fiche descriptive)'
      : 'votre contrat de location';
    subject = `Contrat de location — Chalet L'Alpicois${stayPhrase}`;
    const depositDeadline = fields.depositDueDay && fields.depositDueMonth && fields.depositDueYear
      ? `${fields.depositDueDay}/${fields.depositDueMonth}/${fields.depositDueYear}`
      : 'la date indiquée sur le contrat';
    text = [
      `Bonjour ${greeting},`,
      '',
      `Suite à notre échange, veuillez trouver ci-joint ${docLabel} pour votre séjour au Chalet L'Alpicois${stayPhrase}.`,
      '',
      `Merci de nous retourner le contrat signé, accompagné de l'acompte de 30 % (${fields.deposit30} €), avant le ${depositDeadline}.`,
      '',
      'N\'hésitez pas si vous avez la moindre question.',
      '',
      'Bien cordialement,',
      '',
      LANDLORD.name,
      "Chalet L'Alpicois",
      LANDLORD.email,
      LANDLORD.phoneGilles,
    ].join('\n');
  }

  return {
    to,
    subject,
    text,
    attachments,
    attachmentName: attachments[0]?.filename,
  };
}

export function pickThreadReply(db, contactId, defaultSubject, emailId = null) {
  let row;
  if (emailId) {
    row = db.prepare(`
      SELECT message_id, subject FROM emails
      WHERE id = ? AND contact_id = ?
    `).get(emailId, contactId);
  } else {
    row = db.prepare(`
      SELECT message_id, subject FROM emails
      WHERE contact_id = ? AND mailbox = 'INBOX'
      ORDER BY date DESC LIMIT 1
    `).get(contactId);
  }

  if (!row?.message_id) {
    return { subject: defaultSubject };
  }

  const baseSubject = row.subject?.trim() || defaultSubject;
  const subject = /^re:/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject}`;

  return {
    subject,
    inReplyTo: row.message_id,
    references: row.message_id,
  };
}

export function listContactThreadCandidates(db, contactId, limit = 8) {
  const rows = db.prepare(`
    SELECT id, message_id, subject, date, sender, mailbox
    FROM emails
    WHERE contact_id = ?
    ORDER BY date DESC
    LIMIT ?
  `).all(contactId, limit);
  return rows.map(r => ({
    id: String(r.id),
    messageId: r.message_id || '',
    subject: r.subject || '(sans objet)',
    date: r.date || '',
    sender: r.sender || '',
    mailbox: r.mailbox || '',
    isInbox: r.mailbox === 'INBOX',
  }));
}
