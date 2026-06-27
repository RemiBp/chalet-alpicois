/**
 * Suivi administratif par séjour — aligné Excel (contrat, acompte, assurance…).
 */

import { EXCEL_BOOKING_PROGRESS, getWeekPrice } from './season-prices-data.js';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function ensureStayProgressTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stay_progress (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      season TEXT DEFAULT '2026-2027',
      week_price REAL DEFAULT 0,
      contract_number TEXT DEFAULT '',
      contract_signed INTEGER DEFAULT 0,
      deposit_invoice_number TEXT DEFAULT '',
      deposit_amount REAL DEFAULT 0,
      deposit_payment_method TEXT DEFAULT '',
      deposit_paid INTEGER DEFAULT 0,
      balance_invoice_number TEXT DEFAULT '',
      balance_amount REAL DEFAULT 0,
      balance_payment_method TEXT DEFAULT '',
      balance_paid INTEGER DEFAULT 0,
      insurance_received INTEGER DEFAULT 0,
      id_received INTEGER DEFAULT 0,
      deposit_guarantee_paid INTEGER DEFAULT 0,
      deposit_guarantee_returned INTEGER DEFAULT 0,
      mail_steps_json TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(contact_id, check_in, check_out)
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_stay_progress_contact ON stay_progress(contact_id)');
  for (const sql of [
    'ALTER TABLE stay_progress ADD COLUMN deposit_payment_method TEXT DEFAULT ""',
    'ALTER TABLE stay_progress ADD COLUMN balance_invoice_number TEXT DEFAULT ""',
    'ALTER TABLE stay_progress ADD COLUMN balance_amount REAL DEFAULT 0',
    'ALTER TABLE stay_progress ADD COLUMN balance_payment_method TEXT DEFAULT ""',
    'ALTER TABLE stay_progress ADD COLUMN balance_paid INTEGER DEFAULT 0',
    'ALTER TABLE stay_progress ADD COLUMN id_received INTEGER DEFAULT 0',
    'ALTER TABLE stay_progress ADD COLUMN deposit_guarantee_paid INTEGER DEFAULT 0',
    'ALTER TABLE stay_progress ADD COLUMN deposit_guarantee_returned INTEGER DEFAULT 0',
    'ALTER TABLE stay_progress ADD COLUMN mail_steps_json TEXT DEFAULT "{}"',
  ]) {
    try { db.exec(sql); } catch { /* already exists */ }
  }
}

export function progressRowToApi(row) {
  if (!row) return null;
  const fields = [
    row.contract_number,
    row.contract_signed,
    row.deposit_invoice_number,
    row.deposit_amount,
    row.deposit_paid,
    row.balance_invoice_number,
    row.balance_amount,
    row.balance_paid,
    row.insurance_received,
    row.id_received,
    row.deposit_guarantee_paid,
    row.deposit_guarantee_returned,
  ];
  const filled = fields.filter((v, i) => {
    if (i === 3) return Number(v) > 0;
    if (typeof v === 'number') return v === 1;
    return Boolean(v);
  }).length;
  const required = 6;
  let mailSteps = {};
  try { mailSteps = JSON.parse(row.mail_steps_json || '{}'); } catch { mailSteps = {}; }
  return {
    id: row.id,
    contactId: row.contact_id,
    checkIn: row.check_in,
    checkOut: row.check_out,
    season: row.season,
    weekPrice: Number(row.week_price || 0),
    contractNumber: row.contract_number || '',
    contractSigned: row.contract_signed === 1,
    depositInvoiceNumber: row.deposit_invoice_number || '',
    depositAmount: Number(row.deposit_amount || 0),
    depositPaymentMethod: row.deposit_payment_method || '',
    depositPaid: row.deposit_paid === 1,
    balanceInvoiceNumber: row.balance_invoice_number || '',
    balanceAmount: Number(row.balance_amount || 0),
    balancePaymentMethod: row.balance_payment_method || '',
    balancePaid: row.balance_paid === 1,
    insuranceReceived: row.insurance_received === 1,
    idReceived: row.id_received === 1,
    depositGuaranteePaid: row.deposit_guarantee_paid === 1,
    depositGuaranteeReturned: row.deposit_guarantee_returned === 1,
    mailSteps,
    complete: filled >= required,
    filledCount: filled,
    requiredCount: required,
  };
}

export function getStayProgress(db, contactId, checkIn, checkOut) {
  ensureStayProgressTable(db);
  const row = db.prepare(`
    SELECT * FROM stay_progress WHERE contact_id = ? AND check_in = ? AND check_out = ?
  `).get(contactId, checkIn, checkOut);
  return progressRowToApi(row);
}

export function upsertStayProgress(db, contactId, checkIn, checkOut, patch = {}) {
  ensureStayProgressTable(db);
  const existing = db.prepare(`
    SELECT * FROM stay_progress WHERE contact_id = ? AND check_in = ? AND check_out = ?
  `).get(contactId, checkIn, checkOut);

  const weekPrice = patch.weekPrice ?? existing?.week_price ?? getWeekPrice(checkIn) ?? 0;
  const depositAmount = patch.depositAmount ?? existing?.deposit_amount
    ?? (weekPrice ? Math.round(weekPrice * 0.3) : 0);

  const values = {
    contractNumber: patch.contractNumber ?? existing?.contract_number ?? '',
    contractSigned: patch.contractSigned != null ? (patch.contractSigned ? 1 : 0) : (existing?.contract_signed ?? 0),
    depositInvoiceNumber: patch.depositInvoiceNumber ?? existing?.deposit_invoice_number ?? '',
    depositAmount,
    depositPaymentMethod: patch.depositPaymentMethod ?? existing?.deposit_payment_method ?? '',
    depositPaid: patch.depositPaid != null ? (patch.depositPaid ? 1 : 0) : (existing?.deposit_paid ?? 0),
    balanceInvoiceNumber: patch.balanceInvoiceNumber ?? existing?.balance_invoice_number ?? '',
    balanceAmount: patch.balanceAmount ?? existing?.balance_amount ?? 0,
    balancePaymentMethod: patch.balancePaymentMethod ?? existing?.balance_payment_method ?? '',
    balancePaid: patch.balancePaid != null ? (patch.balancePaid ? 1 : 0) : (existing?.balance_paid ?? 0),
    insuranceReceived: patch.insuranceReceived != null ? (patch.insuranceReceived ? 1 : 0) : (existing?.insurance_received ?? 0),
    idReceived: patch.idReceived != null ? (patch.idReceived ? 1 : 0) : (existing?.id_received ?? 0),
    depositGuaranteePaid: patch.depositGuaranteePaid != null ? (patch.depositGuaranteePaid ? 1 : 0) : (existing?.deposit_guarantee_paid ?? 0),
    depositGuaranteeReturned: patch.depositGuaranteeReturned != null ? (patch.depositGuaranteeReturned ? 1 : 0) : (existing?.deposit_guarantee_returned ?? 0),
    mailStepsJson: patch.mailSteps ? JSON.stringify({ ...safeJson(existing?.mail_steps_json), ...patch.mailSteps }) : (existing?.mail_steps_json ?? '{}'),
    weekPrice,
  };

  if (existing) {
    db.prepare(`
      UPDATE stay_progress SET
        contract_number = ?, contract_signed = ?, deposit_invoice_number = ?,
        deposit_amount = ?, deposit_payment_method = ?, deposit_paid = ?,
        balance_invoice_number = ?, balance_amount = ?, balance_payment_method = ?, balance_paid = ?,
        insurance_received = ?, id_received = ?, deposit_guarantee_paid = ?, deposit_guarantee_returned = ?,
        mail_steps_json = ?,
        week_price = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      values.contractNumber, values.contractSigned, values.depositInvoiceNumber,
      values.depositAmount, values.depositPaymentMethod, values.depositPaid,
      values.balanceInvoiceNumber, values.balanceAmount, values.balancePaymentMethod, values.balancePaid,
      values.insuranceReceived, values.idReceived, values.depositGuaranteePaid, values.depositGuaranteeReturned,
      values.mailStepsJson,
      values.weekPrice, existing.id,
    );
    return progressRowToApi(db.prepare('SELECT * FROM stay_progress WHERE id = ?').get(existing.id));
  }

  const id = generateId();
  db.prepare(`
    INSERT INTO stay_progress (
      id, contact_id, check_in, check_out, season, week_price,
      contract_number, contract_signed, deposit_invoice_number,
      deposit_amount, deposit_payment_method, deposit_paid,
      balance_invoice_number, balance_amount, balance_payment_method, balance_paid,
      insurance_received, id_received, deposit_guarantee_paid, deposit_guarantee_returned, mail_steps_json
    ) VALUES (?, ?, ?, ?, '2026-2027', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, contactId, checkIn, checkOut, values.weekPrice,
    values.contractNumber, values.contractSigned, values.depositInvoiceNumber,
    values.depositAmount, values.depositPaymentMethod, values.depositPaid,
    values.balanceInvoiceNumber, values.balanceAmount, values.balancePaymentMethod, values.balancePaid,
    values.insuranceReceived, values.idReceived, values.depositGuaranteePaid, values.depositGuaranteeReturned,
    values.mailStepsJson,
  );
  return progressRowToApi(db.prepare('SELECT * FROM stay_progress WHERE id = ?').get(id));
}

function safeJson(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

export function listStayProgressForContact(db, contactId) {
  ensureStayProgressTable(db);
  return db.prepare(`
    SELECT * FROM stay_progress
    WHERE contact_id = ?
    ORDER BY check_in ASC
  `).all(contactId).map(progressRowToApi);
}

function findContactForExcelRow(db, clientMatch) {
  const contacts = db.prepare(`
    SELECT id, name, first_name, email FROM contacts WHERE is_personal != 1
  `).all();
  return contacts.find(c => clientMatch.test(`${c.name} ${c.first_name} ${c.email}`));
}

function splitExcelClientName(clientLabel = '') {
  const cleaned = clientLabel.replace(/^famille\s+/i, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: '', lastName: cleaned || 'Client Excel' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function ensureContactForExcelRow(db, row) {
  const existing = findContactForExcelRow(db, row.clientMatch);
  if (existing) return existing;

  const { firstName, lastName } = splitExcelClientName(row.clientLabel || '');
  const id = generateId();
  db.prepare(`
    INSERT INTO contacts (
      id, name, first_name, email, alternate_emails, phone, alternate_phones,
      origin, origin_detail, status, nationality, address, postal_code, country,
      notes, first_contact_date, last_contact_date, total_stays, created_at, updated_at
    ) VALUES (?, ?, ?, '', '[]', '', '[]', 'excel', 'Tarifs 2026-2027', 'client', '', '', '', '',
      ?, ?, ?, 1, datetime('now'), datetime('now'))
  `).run(
    id,
    lastName || row.clientLabel || 'Client Excel',
    firstName || '',
    `Créé depuis la ligne Excel contrat ${row.contractNumber || ''}`.trim(),
    row.checkIn,
    row.checkIn,
  );
  return { id, name: lastName, first_name: firstName, email: '' };
}

function ensureExcelBookingRows(db, contactId, row) {
  const season = '2026-2027';
  const nights = Math.max(1, Math.round((new Date(row.checkOut) - new Date(row.checkIn)) / 86400000));
  const status = row.depositPaid ? 'paid' : 'confirmed';

  const stay = db.prepare(`
    SELECT id, price_confirmed, price_quoted, status FROM stays
    WHERE contact_id = ? AND check_in = ? AND check_out = ?
  `).get(contactId, row.checkIn, row.checkOut);

  if (stay) {
    db.prepare(`
      UPDATE stays SET
        season = ?, nights = ?, status = CASE
          WHEN manual_lock = 1 THEN status
          WHEN status IN ('paid', 'confirmed') THEN status
          ELSE ?
        END,
        price_quoted = CASE
          WHEN notes LIKE ? THEN ?
          WHEN COALESCE(price_quoted, 0) > 0 THEN price_quoted
          ELSE ?
        END,
        price_confirmed = CASE
          WHEN notes LIKE ? THEN ?
          WHEN COALESCE(price_confirmed, 0) > 0 THEN price_confirmed
          ELSE ?
        END,
        notes = CASE
          WHEN notes LIKE '%Excel tarifs 2026-2027%' THEN notes
          ELSE TRIM(COALESCE(notes, '') || ' — Excel tarifs 2026-2027 contrat ' || ?)
        END
      WHERE id = ?
    `).run(
      season,
      nights,
      status,
      `%Excel tarifs 2026-2027 contrat ${row.contractNumber}%`,
      row.weekPrice,
      row.weekPrice,
      `%Excel tarifs 2026-2027 contrat ${row.contractNumber}%`,
      row.weekPrice,
      row.weekPrice,
      row.contractNumber || '',
      stay.id,
    );
  } else {
    db.prepare(`
      INSERT INTO stays (
        id, contact_id, season, check_in, check_out, nights, adults, children,
        price_quoted, price_confirmed, status, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, datetime('now'))
    `).run(
      generateId(),
      contactId,
      season,
      row.checkIn,
      row.checkOut,
      nights,
      row.weekPrice,
      row.weekPrice,
      status,
      `Excel tarifs 2026-2027 contrat ${row.contractNumber || ''}`.trim(),
    );
  }

  const week = db.prepare(`
    SELECT id FROM requested_weeks
    WHERE contact_id = ? AND check_in = ? AND check_out = ?
  `).get(contactId, row.checkIn, row.checkOut);

  if (week) {
    db.prepare(`
      UPDATE requested_weeks SET season = ?, status = CASE
        WHEN manual_lock = 1 THEN status
        ELSE 'booked'
      END,
      notes = CASE
        WHEN notes LIKE '%Excel tarifs 2026-2027%' THEN notes
        ELSE TRIM(COALESCE(notes, '') || ' — Excel tarifs 2026-2027 contrat ' || ?)
      END
      WHERE id = ?
    `).run(season, row.contractNumber || '', week.id);
  } else {
    db.prepare(`
      INSERT INTO requested_weeks (
        id, contact_id, season, check_in, check_out, adults, children, status, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, 1, 0, 'booked', ?, datetime('now'))
    `).run(
      generateId(),
      contactId,
      season,
      row.checkIn,
      row.checkOut,
      `Excel tarifs 2026-2027 contrat ${row.contractNumber || ''}`.trim(),
    );
  }

  db.prepare(`
    UPDATE contacts SET status = 'client', updated_at = datetime('now')
    WHERE id = ?
  `).run(contactId);
}

function cleanupMovedExcelBooking(db, contactId, row) {
  if (!row.contractNumber) return;
  db.prepare(`
    DELETE FROM stay_progress
    WHERE contact_id = ?
      AND contract_number = ?
      AND (check_in != ? OR check_out != ?)
  `).run(contactId, row.contractNumber, row.checkIn, row.checkOut);

  db.prepare(`
    DELETE FROM stays
    WHERE contact_id = ?
      AND notes LIKE ?
      AND (check_in != ? OR check_out != ?)
  `).run(contactId, `%Excel tarifs 2026-2027 contrat ${row.contractNumber}%`, row.checkIn, row.checkOut);

  db.prepare(`
    DELETE FROM requested_weeks
    WHERE contact_id = ?
      AND notes LIKE ?
      AND (check_in != ? OR check_out != ?)
  `).run(contactId, `%Excel tarifs 2026-2027 contrat ${row.contractNumber}%`, row.checkIn, row.checkOut);
}

/** Initialise / met à jour depuis l'Excel de référence (sans écraser les champs déjà renseignés manuellement). */
export function seedProgressFromExcel(db) {
  ensureStayProgressTable(db);
  let seeded = 0;
  for (const row of EXCEL_BOOKING_PROGRESS) {
    const contact = ensureContactForExcelRow(db, row);
    if (!contact) continue;
    cleanupMovedExcelBooking(db, contact.id, row);
    const existing = getStayProgress(db, contact.id, row.checkIn, row.checkOut);
    upsertStayProgress(db, contact.id, row.checkIn, row.checkOut, {
      weekPrice: row.weekPrice,
      contractNumber: existing?.contractNumber || row.contractNumber,
      contractSigned: existing?.contractSigned || row.contractSigned,
      depositInvoiceNumber: existing?.depositInvoiceNumber || row.depositInvoiceNumber,
      depositAmount: existing?.depositAmount || row.depositAmount,
      depositPaid: existing?.depositPaid || row.depositPaid,
      insuranceReceived: existing?.insuranceReceived || row.insuranceReceived,
    });
    ensureExcelBookingRows(db, contact.id, row);
    seeded++;
  }
  return seeded;
}

export function attachProgressToEvent(db, event) {
  if (event.personal || !event.contactId) return event;
  const progress = getStayProgress(db, event.contactId, event.checkIn, event.checkOut);
  if (progress) event.progress = progress;
  else if (event.blocksCalendar) {
    const price = getWeekPrice(event.checkIn) || event.price || 0;
    event.progress = {
      contactId: event.contactId,
      checkIn: event.checkIn,
      checkOut: event.checkOut,
      weekPrice: price,
      contractNumber: '',
      contractSigned: false,
      depositInvoiceNumber: '',
      depositAmount: price ? Math.round(price * 0.3) : 0,
      depositPaid: false,
      insuranceReceived: false,
      complete: false,
      filledCount: 0,
      requiredCount: 6,
    };
  }
  return event;
}
