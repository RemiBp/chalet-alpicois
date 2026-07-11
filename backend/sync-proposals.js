/**
 * Propositions de mise à jour émanant de la synchronisation — validation manuelle.
 */

import { appendAudit, listAuditLog } from './audit-log.js';
import { upsertStayProgress, getStayProgress } from './stay-progress.js';
import { extractInquiryBest } from './extract-inquiry.js';
import { isNoiseEmail } from './price-extract.js';
import { cleanStoredBodyText } from './email-body.js';
import {
  extractPhone,
  isPlausiblePhone,
  isHostPhone,
  isPlausibleGuestAddress,
  stripQuotedReply,
  isHostContentLine,
} from './contact-coords.js';

const PROGRESS_LABELS = {
  contractSigned: 'Contrat signé',
  depositInvoiceNumber: 'N° facture acompte',
  depositAmount: 'Montant acompte',
  depositPaid: 'Paiement acompte',
  insuranceReceived: 'Assurance reçue',
  contractNumber: 'N° contrat',
  balanceInvoiceNumber: 'Facture solde',
  balancePaid: 'Solde payé',
  idReceived: "Pièce d'identité reçue",
  depositGuaranteePaid: 'Caution reçue',
  depositGuaranteeReturned: 'Caution rendue',
  mailReview: 'Mail à qualifier',
  phone: 'Téléphone',
  address: 'Adresse',
  groupComposition: 'Composition du groupe',
};

export function countPendingProposals(db) {
  ensureValidationColumn(db);
  const row = db.prepare(`
    SELECT COUNT(*) AS n FROM audit_log
    WHERE validation_status = 'pending' AND action = 'sync_proposal'
  `).get();
  return row?.n ?? 0;
}

function ensureValidationColumn(db) {
  try {
    db.exec("ALTER TABLE audit_log ADD COLUMN validation_status TEXT DEFAULT 'none'");
  } catch { /* exists */ }
}

export function proposeSyncChange(db, {
  action = 'sync_proposal',
  entityType,
  entityId,
  contactId = '',
  label,
  field,
  proposed,
  before = null,
  emailId = null,
  emailSubject = null,
  emailExcerpt = null,
  reviewReason = null,
  checkIn = null,
  checkOut = null,
}) {
  ensureValidationColumn(db);
  const existing = db.prepare(`
    SELECT id FROM audit_log
    WHERE action = 'sync_proposal' AND entity_id = ?
  `).get(entityId);
  if (existing) return false;

  appendAudit(db, {
    action,
    entityType,
    entityId,
    contactId,
    payload: {
      label: label || PROGRESS_LABELS[field] || field,
      field,
      proposed,
      before,
      emailId,
      emailSubject,
      emailExcerpt,
      reviewReason,
      checkIn,
      checkOut,
    },
    actor: 'automatic',
    validationStatus: 'pending',
  });
  return true;
}

function isSentMailbox(mailbox) {
  return /sent/i.test(mailbox || '');
}

/** Top of thread only — ignore quoted history that can falsely fire "contrat signé". */
function progressCorpus(subject, bodyText) {
  // Aggressive quote strip (minKeep=0): short host replies must not inherit guest signals.
  return stripQuotedReply(`${subject || ''}\n${bodyText || ''}`, { minKeep: 0 });
}

/** Détecte les mises à jour administratives dans un mail (entrant ou envoyé). */
export function detectProgressHints(subject, bodyText, mailbox = 'INBOX') {
  const isSent = isSentMailbox(mailbox);
  // Always ignore deep quoted history (guest text inside host replies, etc.).
  const text = progressCorpus(subject, bodyText);
  const hints = [];

  if (/contrat.{0,80}sign[eé]|sign[eé].{0,80}contrat|signed\s+contract|rental\s+agreement.{0,80}signed|read\s+and\s+approved|lu\s+et\s+approuv[eé]/i.test(text)) {
    hints.push({ field: 'contractSigned', proposed: true, label: 'Contrat signé (mail)' });
  }
  if (/acompte\s+re[cç]u|deposit\s+(?:received|paid)|(?:bien\s+)?re[cç]u\s+le\s+virement|virement\s+re[cç]u|paiement\s+(?:de\s+l['']?)?acompte/i.test(text)) {
    hints.push({ field: 'depositPaid', proposed: true, label: 'Paiement acompte reçu' });
  }
  if (/attestation\s+(?:de\s+|d['’])?(?:garantie|assurance)|insurance\s+certificate|assurance\s+vill[eé]giature/i.test(text)) {
    hints.push({ field: 'insuranceReceived', proposed: true, label: 'Assurance villégiature' });
  }
  if (/(?:pi[eè]ce|piece)\s+d['’]?identit[eé]|passeport|passport|identity\s+(?:card|document)|carte\s+d['’]?identit[eé]/i.test(text)) {
    // Host asking for an ID ≠ ID received.
    const asking = /merci\s+de\s+(?:nous\s+)?(?:envoyer|fournir)|pouvez[- ]vous|veuillez|besoin\s+de/i.test(text);
    const received = /re[cç]u|reçue|received|ci-joint|pj|attach|voici/i.test(text);
    if (!asking || received) {
      hints.push({ field: 'idReceived', proposed: true, label: "Pièce d'identité reçue" });
    }
  }
  if (/solde\s+(?:re[cç]u|pay[eé]|r[eé]gl[eé])|balance\s+(?:received|paid)/i.test(text)) {
    hints.push({ field: 'balancePaid', proposed: true, label: 'Solde payé' });
  }
  if (/caution\s+(?:re[cç]ue|vers[eé]e|pay[eé]e)|swikly|security\s+deposit\s+(?:received|paid)/i.test(text)) {
    hints.push({ field: 'depositGuaranteePaid', proposed: true, label: 'Caution reçue' });
  }
  if (/caution\s+(?:rendue|restitu[eé]e|rembours[eé]e)|security\s+deposit\s+(?:returned|refunded)/i.test(text)) {
    hints.push({ field: 'depositGuaranteeReturned', proposed: true, label: 'Caution rendue' });
  }
  if (isSent) {
    if (/facture\s+d['']?acompte|deposit\s+invoice/i.test(text)) {
      hints.push({ field: 'depositInvoiceSent', proposed: true, label: 'Facture acompte envoyée' });
    }
    if (/ci-joint.{0,40}contrat|contrat.{0,60}(?:ci-joint|pj|attach|pi[eè]ce)|vous trouverez.{0,80}contrat|rental\s+agreement|finaliser\s+le\s+contrat/i.test(text)) {
      hints.push({ field: 'contractSent', proposed: true, label: 'Contrat envoyé au client' });
    }
    if (/facture\s+(?:de\s+)?solde|balance\s+invoice/i.test(text)) {
      hints.push({ field: 'balanceInvoiceSent', proposed: true, label: 'Facture solde envoyée' });
    }
    const mailStep = detectSentMailStep(text);
    if (mailStep) {
      hints.push({ field: 'mailSteps', proposed: { [mailStep]: 'sent' }, label: `Étape mail envoyée — ${mailStep}` });
    }
  }
  return hints;
}

function detectSentMailStep(text) {
  if (/1er\s+contact|first\s+contact|votre\s+demande\s+de\s+s[eé]jour|your\s+stay\s+enquiry/i.test(text)) return 'first_contact';
  if (/prix\s+de\s+la\s+semaine|tarif\s+pour\s+votre\s+semaine|rate\s+for\s+your\s+week/i.test(text)) return 'price_quote';
  if (/infos?\s+pour\s+le\s+contrat|information\s+for\s+the\s+rental\s+agreement|contrat.*annexes?.*facture/i.test(text)) return 'contract_info';
  if (/j-60|d-60|solde\s+à\s+r[eé]gler|balance\s+payment\s+reminder/i.test(text)) return 'balance_reminder_j60';
  if (/j-7|d-7|caution\s+1\s*000|security\s+deposit/i.test(text)) return 'deposit_reminder_j7';
  if (/j\+3|d\+3|retour\s+apr[eè]s\s+s[eé]jour|post-stay\s+feedback|how\s+was\s+your\s+stay/i.test(text)) return 'feedback_post_stay';
  return null;
}

/**
 * Scan emails récents et crée des propositions sync (sans appliquer stay_progress).
 */
export function scanEmailsForProposals(db, opts = {}) {
  const sinceDays = opts.sinceDays ?? 120;
  const limit = opts.limit ?? 800;
  const reviewLimit = opts.reviewLimit ?? 0;
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  const emails = db.prepare(`
    SELECT e.*, c.name AS contact_name, c.phone AS contact_phone, c.address AS contact_address, c.profile_json AS contact_profile_json
    FROM emails e
    JOIN contacts c ON c.id = e.contact_id
    WHERE e.contact_id IS NOT NULL AND e.date >= ? AND e.body_text != ''
    ORDER BY e.date DESC
    LIMIT ?
  `).all(since.toISOString(), limit);

  let proposals = 0;
  let reviewProposals = 0;

  for (const email of emails) {
    const cleanBody = cleanStoredBodyText(email.body_text || '');
    const cleanEmail = { ...email, body_text: cleanBody };
    const hints = [
      ...detectProgressHints(email.subject, cleanBody, email.mailbox),
      ...detectContactHints(cleanEmail),
    ];
    const dates = extractInquiryBest(`${email.subject}\n${cleanBody}`, email.date)
      || findDatesFromContact(db, email.contact_id);

    let createdForEmail = 0;
    const contactHints = hints.filter(h => h.field === 'phone' || h.field === 'address' || h.field === 'groupComposition');
    for (const hint of contactHints) {
      if (proposeSyncChange(db, {
        entityType: 'contact_profile',
        entityId: `${email.contact_id}:${hint.field}:${email.id}`,
        contactId: email.contact_id,
        label: `${hint.label} — ${email.contact_name}`,
        field: hint.field,
        proposed: hint.proposed,
        emailId: email.id,
        emailSubject: email.subject,
        emailExcerpt: cleanBody.replace(/\s+/g, ' ').slice(0, 220),
        reviewReason: 'Information client détectée dans le mail',
        checkIn: dates?.checkIn || null,
        checkOut: dates?.checkOut || null,
      })) {
        proposals++;
        createdForEmail++;
      }
    }

    if (!dates?.checkIn) {
      if (createdForEmail === 0) {
        reviewProposals += proposeMailReviewIfUseful(db, cleanEmail, {
          reviewLimit,
          currentCount: reviewProposals,
          reason: 'Mail client sans séjour identifié automatiquement',
        }) ? 1 : 0;
      }
      continue;
    }

    for (const hint of hints.filter(h => !contactHints.includes(h))) {
      if (hint.field === 'depositInvoiceSent' || hint.field === 'contractSent' || hint.field === 'balanceInvoiceSent') {
        if (proposeSyncChange(db, {
          entityType: 'mail_sent',
          entityId: `${email.id}:${hint.field}`,
          contactId: email.contact_id,
          label: `${hint.label} — ${email.contact_name}`,
          field: hint.field,
          proposed: true,
          emailId: email.id,
          emailSubject: email.subject,
          checkIn: dates.checkIn,
          checkOut: dates.checkOut,
        })) {
          proposals++;
          createdForEmail++;
        }
        continue;
      }

      const progress = getStayProgress(db, email.contact_id, dates.checkIn, dates.checkOut);
      const currentVal = progress?.[hint.field];
      if (hint.field === 'mailSteps') {
        const [[stepKey, stepStatus]] = Object.entries(hint.proposed);
        if (progress?.mailSteps?.[stepKey] === stepStatus) continue;
      } else if (currentVal === hint.proposed) continue;

      if (proposeSyncChange(db, {
        entityType: 'stay_progress',
        entityId: `${email.contact_id}:${dates.checkIn}:${hint.field}`,
        contactId: email.contact_id,
        label: `${hint.label} — ${email.contact_name}`,
        field: hint.field,
        proposed: hint.proposed,
        before: currentVal ?? false,
        emailId: email.id,
        emailSubject: email.subject,
        checkIn: dates.checkIn,
        checkOut: dates.checkOut,
      })) {
        proposals++;
        createdForEmail++;
      }
    }

    if (createdForEmail === 0) {
      reviewProposals += proposeMailReviewIfUseful(db, cleanEmail, {
        reviewLimit,
        currentCount: reviewProposals,
        reason: 'Aucune mise à jour sûre détectée automatiquement',
        dates,
      }) ? 1 : 0;
    }
  }

  return { emailsScanned: emails.length, proposalsCreated: proposals + reviewProposals, updatesCreated: proposals, reviewsCreated: reviewProposals };
}

function proposeMailReviewIfUseful(db, email, { reviewLimit, currentCount, reason, dates = null }) {
  if (!reviewLimit || currentCount >= reviewLimit) return false;
  if (isNoiseEmail(email.subject, email.body_text)) return false;
  const text = `${email.subject || ''}\n${email.body_text || ''}`;
  const looksRelevant = /alpicois|chalet|semaine|week|reservation|réservation|location|contrat|facture|assurance|acompte|solde|disponib|ski|plagne|janv|févr|mars|avril|dec|déc|2026|2027|2028/i.test(text);
  if (!looksRelevant) return false;
  const action = suggestedReviewAction(text);

  return proposeSyncChange(db, {
    entityType: 'mail_review',
    entityId: `${email.id}:mailReview`,
    contactId: email.contact_id,
    label: `Mail à qualifier — ${email.contact_name}`,
    field: 'mailReview',
    proposed: action,
    emailId: email.id,
    emailSubject: email.subject,
    emailExcerpt: String(email.body_text || '').replace(/\s+/g, ' ').slice(0, 220),
    reviewReason: reason,
    checkIn: dates?.checkIn || null,
    checkOut: dates?.checkOut || null,
  });
}

function suggestedReviewAction(text) {
  const suggestions = [];
  if (/pass(?:eport)?|identity|id card|pi[eè]ce d['’]?identit/i.test(text)) suggestions.push("pièce d'identité");
  if (/assurance|insurance|attestation/i.test(text)) suggestions.push('assurance');
  if (/contrat|contract/i.test(text)) suggestions.push('contrat');
  if (/phone|t[eé]l|mobile|\b00\d{6,}|\+?\d[\d\s().-]{7,}/i.test(text)) suggestions.push('coordonnées');
  if (/\b(?:adult|adulte|child|children|enfant|people|personnes)\b/i.test(text)) suggestions.push('composition du groupe');
  if (/adresse|address|postcode|postal/i.test(text)) suggestions.push('adresse');
  if (!suggestions.length) return 'Revoir ce mail et confirmer si une action est nécessaire';
  return `Vérifier et rattacher : ${[...new Set(suggestions)].join(', ')}`;
}

function detectContactHints(email) {
  // Never mine guest coords from host-sent mails (signatures = Claire / Gilles phones).
  if (isSentMailbox(email.mailbox)) return [];

  const stripped = stripQuotedReply(`${email.subject || ''}\n${email.body_text || ''}`);
  const text = stripped
    .split('\n')
    .filter((line) => !isHostContentLine(line))
    .join('\n');
  const hints = [];
  const cleanPhone = extractPhone(text);
  if (
    cleanPhone
    && isPlausiblePhone(cleanPhone)
    && !isHostPhone(cleanPhone)
    && !String(email.contact_phone || '').replace(/\s+/g, '').includes(cleanPhone.replace(/\s+/g, ''))
  ) {
    hints.push({ field: 'phone', proposed: cleanPhone, label: 'Téléphone à ajouter' });
  }

  // Require "adresse :" style — optional colon without separator matched "adresse postale et…"
  const rawAddress = text.match(/(?:home\s+address|adresse|address)\s*[:\-]\s*([^\n]{10,180})/i)?.[1]?.trim();
  const address = rawAddress
    ?.split(/\b(?:phone|t[eé]l(?:[ée]phone)?|mobile|portable|best\s+wishes|mail|e-?mail)\b/i)[0]
    ?.replace(/\s+/g, ' ')
    ?.trim();
  if (
    address
    && isPlausibleGuestAddress(address)
    && !String(email.contact_address || '').toLowerCase().includes(address.toLowerCase().slice(0, 16))
  ) {
    hints.push({ field: 'address', proposed: address, label: 'Adresse à ajouter' });
  }

  const adults = text.match(/(\d+)\s*(?:adultes?|adults?)/i)?.[1];
  const children = text.match(/(\d+)\s*(?:enfants?|children|kids)/i)?.[1];
  if (adults || children) {
    let profile = {};
    try { profile = JSON.parse(email.contact_profile_json || '{}'); } catch { /* ignore */ }
    const proposed = {
      typicalAdults: adults ? parseInt(adults, 10) : Number(profile.typicalAdults || 0),
      typicalChildren: children ? parseInt(children, 10) : Number(profile.typicalChildren || 0),
    };
    if ((proposed.typicalAdults && proposed.typicalAdults !== Number(profile.typicalAdults || 0))
      || (proposed.typicalChildren && proposed.typicalChildren !== Number(profile.typicalChildren || 0))) {
      hints.push({ field: 'groupComposition', proposed, label: 'Composition du groupe à ajouter' });
    }
  }

  return hints;
}

function findDatesFromContact(db, contactId) {
  const week = db.prepare(`
    SELECT check_in, check_out FROM requested_weeks
    WHERE contact_id = ? ORDER BY check_in DESC LIMIT 1
  `).get(contactId);
  if (week) return { checkIn: week.check_in, checkOut: week.check_out };
  const stay = db.prepare(`
    SELECT check_in, check_out FROM stays
    WHERE contact_id = ? ORDER BY check_in DESC LIMIT 1
  `).get(contactId);
  if (stay) return { checkIn: stay.check_in, checkOut: stay.check_out };
  return null;
}

export function resolveSyncProposals(db, decisions, actor = 'gilles') {
  ensureValidationColumn(db);
  const results = [];

  for (const { id, approved } of decisions) {
    const row = db.prepare('SELECT * FROM audit_log WHERE id = ?').get(id);
    if (!row || row.action !== 'sync_proposal') {
      results.push({ id, ok: false, reason: 'not_sync_proposal' });
      continue;
    }

    const payload = JSON.parse(row.payload_json || '{}');

    if (approved) {
      const checkIn = payload.checkIn;
      const checkOut = payload.checkOut;
      if (row.entity_type === 'mail_review') {
        // Manual review proposals only mark the email as handled in audit history.
      } else if (row.entity_type === 'contact_profile') {
        applyContactProfileProposal(db, row.contact_id, payload);
      } else if (row.entity_type === 'stay_progress' || payload.field in PROGRESS_LABELS) {
        if (checkIn && checkOut) {
          const patch = payload.field === 'mailSteps'
            ? { mailSteps: payload.proposed }
            : { [payload.field]: payload.proposed };
          if (payload.field === 'depositInvoiceSent') {
            patch.depositInvoiceNumber = patch.depositInvoiceNumber || 'auto';
          }
          if (payload.field === 'balanceInvoiceSent') {
            patch.balanceInvoiceNumber = patch.balanceInvoiceNumber || 'envoyée';
          }
          upsertStayProgress(db, row.contact_id, checkIn, checkOut, patch);
        }
      } else if (row.entity_type === 'mail_sent' && payload.field === 'depositInvoiceSent' && checkIn && checkOut) {
        upsertStayProgress(db, row.contact_id, checkIn, checkOut, { depositInvoiceNumber: 'envoyée' });
      } else if (row.entity_type === 'mail_sent' && payload.field === 'balanceInvoiceSent' && checkIn && checkOut) {
        upsertStayProgress(db, row.contact_id, checkIn, checkOut, { balanceInvoiceNumber: 'envoyée' });
      }
      db.prepare("UPDATE audit_log SET validation_status = 'approved' WHERE id = ?").run(id);
      results.push({ id, ok: true, status: 'approved', previousStatus: row.validation_status });
    } else {
      db.prepare("UPDATE audit_log SET validation_status = 'rejected' WHERE id = ?").run(id);
      results.push({ id, ok: true, status: 'rejected', previousStatus: row.validation_status });
    }
  }

  appendAudit(db, {
    action: 'sync_validated',
    entityType: 'batch',
    entityId: `batch-${Date.now()}`,
    payload: {
      count: decisions.length,
      approved: decisions.filter(d => d.approved).length,
      rejected: decisions.filter(d => !d.approved).length,
    },
    actor,
    validationStatus: 'none',
  });

  return results;
}

function applyContactProfileProposal(db, contactId, payload) {
  if (!contactId) return;
  if (payload.field === 'phone' && payload.proposed) {
    const phone = String(payload.proposed).trim();
    if (!isPlausiblePhone(phone) || isHostPhone(phone)) return;
    db.prepare(`
      UPDATE contacts SET phone = COALESCE(NULLIF(phone, ''), ?), updated_at = datetime('now')
      WHERE id = ?
    `).run(phone, contactId);
    return;
  }
  if (payload.field === 'address' && payload.proposed) {
    const address = String(payload.proposed).trim();
    if (!isPlausibleGuestAddress(address)) return;
    db.prepare(`
      UPDATE contacts SET address = COALESCE(NULLIF(address, ''), ?), updated_at = datetime('now')
      WHERE id = ?
    `).run(address, contactId);
    return;
  }
  if (payload.field === 'groupComposition' && payload.proposed && typeof payload.proposed === 'object') {
    const row = db.prepare('SELECT profile_json FROM contacts WHERE id = ?').get(contactId);
    let profile = {};
    try { profile = JSON.parse(row?.profile_json || '{}'); } catch { /* ignore */ }
    const next = {
      ...profile,
      typicalAdults: payload.proposed.typicalAdults || profile.typicalAdults || 0,
      typicalChildren: payload.proposed.typicalChildren || profile.typicalChildren || 0,
      extractedAt: new Date().toISOString(),
    };
    db.prepare(`
      UPDATE contacts SET profile_json = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(next), contactId);
  }
}

export function listPendingProposals(db, limit = 100) {
  return listAuditLog(db, { limit, source: 'automatic' })
    .filter(e => e.action === 'sync_proposal' && e.validationStatus === 'pending');
}

/**
 * Reject all pending sync proposals for a given payload field (e.g. mailReview).
 * Used to clear soft "mail to qualify" backlog without touching concrete updates.
 */
export function rejectPendingByField(db, field, actor = 'gilles') {
  ensureValidationColumn(db);
  const rows = db.prepare(`
    SELECT id, payload_json FROM audit_log
    WHERE validation_status = 'pending' AND action = 'sync_proposal'
    ORDER BY created_at DESC
    LIMIT 2000
  `).all();

  const decisions = [];
  for (const row of rows) {
    let payload = {};
    try { payload = JSON.parse(row.payload_json || '{}'); } catch { /* ignore */ }
    if (payload.field === field || (field === 'mailReview' && String(row.id).includes(':mailReview'))) {
      decisions.push({ id: row.id, approved: false });
    }
  }
  if (!decisions.length) {
    return { rejected: 0, pendingCount: countPendingProposals(db), results: [] };
  }
  const results = resolveSyncProposals(db, decisions, actor);
  return {
    rejected: results.filter(r => r.ok).length,
    pendingCount: countPendingProposals(db),
    results,
  };
}

/**
 * Drop pending contact proposals that are host noise or otherwise unusable
 * (Claire/Gilles phones, "adresse postale et vos numéros…", etc.).
 */
export function rejectInvalidPhoneProposals(db, actor = 'gilles') {
  ensureValidationColumn(db);
  const rows = db.prepare(`
    SELECT id, payload_json FROM audit_log
    WHERE validation_status = 'pending' AND action = 'sync_proposal'
    ORDER BY created_at DESC
    LIMIT 2000
  `).all();
  const decisions = [];
  for (const row of rows) {
    let payload = {};
    try { payload = JSON.parse(row.payload_json || '{}'); } catch { /* ignore */ }
    if (payload.field === 'phone') {
      if (!isPlausiblePhone(payload.proposed) || isHostPhone(payload.proposed)) {
        decisions.push({ id: row.id, approved: false });
      }
    } else if (payload.field === 'address') {
      if (!isPlausibleGuestAddress(payload.proposed)) {
        decisions.push({ id: row.id, approved: false });
      }
    }
  }
  if (!decisions.length) {
    return { rejected: 0, pendingCount: countPendingProposals(db) };
  }
  const results = resolveSyncProposals(db, decisions, actor);
  return { rejected: results.filter(r => r.ok).length, pendingCount: countPendingProposals(db) };
}
