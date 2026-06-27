/**
 * Brouillons email de réponse aux demandes de disponibilité (FR + EN).
 */

import { LANDLORD } from './document-fields.js';
import { pickThreadReply } from './document-email.js';
import { detectEmailLanguage } from './nationality.js';

function firstName(fullName) {
  const cleaned = (fullName || '').replace(/^(m\.|mme\.?|mr\.?|monsieur|madame)\s+/i, '').trim();
  return cleaned.split(/\s+/)[0] || '';
}

function fmtFr(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

function fmtEn(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

function fmtRange(checkIn, checkOut, lang = 'fr') {
  const fmt = lang === 'en' ? fmtEn : fmtFr;
  if (lang === 'en') return `from ${fmt(checkIn)} to ${fmt(checkOut)}`;
  return `du ${fmt(checkIn)} au ${fmt(checkOut)}`;
}

function fmtPrice(n) {
  return Number(n || 0).toLocaleString('fr-FR');
}

function pickLanguage(contact, corpus = '') {
  const profileLang = contact?.profileJson?.language;
  if (profileLang === 'en' || profileLang === 'fr') return profileLang;
  const detected = detectEmailLanguage(corpus);
  if (detected === 'en') return 'en';
  return 'fr';
}

export function buildInquiryReplyEmail({
  type,
  contact,
  checkIn,
  checkOut,
  price,
  adults,
  alternativeWeeks = [],
  lang = 'fr',
}) {
  const greeting = firstName(contact?.firstName || contact?.name);
  const range = fmtRange(checkIn, checkOut, lang);
  const personsFr = adults ? `${adults} personnes` : 'votre groupe';
  const personsEn = adults ? `${adults} guests` : 'your party';

  if (lang === 'en') {
    const defaultSubject = type === 'available'
      ? `Availability Chalet L'Alpicois — ${fmtEn(checkIn)} to ${fmtEn(checkOut)}`
      : `Alternative dates — Chalet L'Alpicois`;

    let text;
    if (type === 'available') {
      text = [
        `Dear ${greeting},`,
        '',
        'Thank you for your message.',
        '',
        `We are pleased to confirm that the chalet is available ${range} for ${personsEn}.`,
        '',
        `The weekly rate is €${fmtPrice(price)} (end-of-stay cleaning included, Sunday-to-Sunday rental).`,
        '',
        'If this works for you, we will send you the booking contract and payment details.',
        '',
        'Kind regards,',
        '',
        LANDLORD.name,
        "Chalet L'Alpicois",
        LANDLORD.email,
        LANDLORD.phoneGilles,
      ].join('\n');
    } else {
      const altLines = alternativeWeeks.map(w =>
        `• ${fmtRange(w.checkIn, w.checkOut, 'en')} — €${fmtPrice(w.price)}`,
      );
      text = [
        `Dear ${greeting},`,
        '',
        'Thank you for your message.',
        '',
        `Unfortunately, the chalet is no longer available ${range}.`,
        '',
        'We can however offer the following alternative weeks:',
        '',
        ...altLines,
        '',
        'Please let us know if any of these dates would suit you — we will gladly send the booking contract.',
        '',
        'Kind regards,',
        '',
        LANDLORD.name,
        "Chalet L'Alpicois",
        LANDLORD.email,
        LANDLORD.phoneGilles,
      ].join('\n');
    }
    return { to: contact?.email, subject: defaultSubject, text, lang: 'en' };
  }

  const defaultSubject = type === 'available'
    ? `Disponibilité Chalet L'Alpicois — ${range}`
    : `Alternatives — Chalet L'Alpicois`;

  let text;
  if (type === 'available') {
    text = [
      `Bonjour ${greeting},`,
      '',
      'Merci pour votre message.',
      '',
      `Nous avons le plaisir de vous confirmer que le chalet est disponible ${range} pour ${personsFr}.`,
      '',
      `Le tarif pour cette semaine est de ${fmtPrice(price)} € (ménage de fin de séjour inclus, formule du dimanche au dimanche).`,
      '',
      'Si cette formule vous convient, nous vous transmettrons le contrat de réservation avec les modalités de paiement.',
      '',
      'Bien cordialement,',
      '',
      LANDLORD.name,
      "Chalet L'Alpicois",
      LANDLORD.email,
      LANDLORD.phoneGilles,
    ].join('\n');
  } else {
    const altLines = alternativeWeeks.map(w =>
      `• ${fmtRange(w.checkIn, w.checkOut, 'fr')} — ${fmtPrice(w.price)} €`,
    );
    text = [
      `Bonjour ${greeting},`,
      '',
      'Merci pour votre message.',
      '',
      `Malheureusement, le chalet n'est plus disponible ${range}.`,
      '',
      'Nous pouvons toutefois vous proposer les semaines suivantes :',
      '',
      ...altLines,
      '',
      'N\'hésitez pas à nous indiquer si l\'une de ces dates vous conviendrait — nous vous enverrons volontiers le contrat de réservation.',
      '',
      'Bien cordialement,',
      '',
      LANDLORD.name,
      "Chalet L'Alpicois",
      LANDLORD.email,
      LANDLORD.phoneGilles,
    ].join('\n');
  }

  return { to: contact?.email, subject: defaultSubject, text, lang: 'fr' };
}

export function buildInquiryPreview(contact, opts, corpus = '') {
  const lang = opts.lang || pickLanguage(contact, corpus);
  const fr = buildInquiryReplyEmail({ ...opts, contact, lang: 'fr' });
  const en = buildInquiryReplyEmail({ ...opts, contact, lang: 'en' });
  const primary = lang === 'en' ? en : fr;
  return { fr, en, suggestedLang: lang, primary };
}

export function buildInquiryDraftPayload(db, contactId, contact, opts) {
  const { type, checkIn, checkOut, price, adults, alternativeWeeks, lang } = opts;
  const email = buildInquiryReplyEmail({
    type,
    contact,
    checkIn,
    checkOut,
    price,
    adults,
    alternativeWeeks,
    lang,
  });
  const thread = pickThreadReply(db, contactId, email.subject);
  return {
    ...email,
    subject: thread.subject,
    inReplyTo: thread.inReplyTo,
    references: thread.references,
  };
}
