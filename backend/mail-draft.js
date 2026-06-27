/**
 * Crée un brouillon dans la boîte mail Hostinger via IMAP APPEND.
 */

import 'dotenv/config';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';

const DRAFT_FOLDER = process.env.IMAP_DRAFTS_FOLDER || 'INBOX.Drafts';
const FROM = process.env.EMAIL_USER || 'contact@alpicois-laplagne.fr';
const FROM_NAME = process.env.EMAIL_FROM_NAME || "Chalet L'Alpicois";

function imapConfig() {
  return {
    host: process.env.IMAP_HOST || 'imap.hostinger.com',
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    secure: true,
    auth: {
      user: FROM,
      pass: process.env.EMAIL_PASS || '',
    },
    logger: false,
  };
}

export async function saveDraftToMailbox({
  to,
  subject,
  text,
  attachments = [],
  inReplyTo,
  references,
}) {
  if (!process.env.EMAIL_PASS) {
    throw new Error('EMAIL_PASS non configuré — impossible de créer un brouillon');
  }
  if (!to) throw new Error('Destinataire manquant');

  const transporter = nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true,
  });

  const mailOptions = {
    from: `"${FROM_NAME}" <${FROM}>`,
    to,
    subject,
    text,
    attachments,
  };
  if (inReplyTo) mailOptions.inReplyTo = inReplyTo;
  if (references) mailOptions.references = references;

  const info = await transporter.sendMail(mailOptions);

  const client = new ImapFlow(imapConfig());
  await client.connect();
  try {
    const result = await client.append(DRAFT_FOLDER, info.message, ['\\Draft']);
    return {
      folder: DRAFT_FOLDER,
      uid: result?.uid != null ? String(result.uid) : null,
      to,
      subject,
      from: FROM,
    };
  } finally {
    await client.logout();
  }
}
