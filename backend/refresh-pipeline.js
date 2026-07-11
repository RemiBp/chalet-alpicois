/**
 * Pipeline refresh : IMAP → liaison contacts → signaux réservation → statuts.
 * Appelé par cron Vercel (2×/jour : 06:00 et 17:00 UTC) ou manuellement : node backend/refresh-pipeline.js
 */

import 'dotenv/config';
import { pathToFileURL } from 'url';
import { ensureDb, persistDb, getDbSync } from './database.js';
import { runImapSync } from './imap-sync.js';
import { linkOrphanEmails } from './link-emails.js';
import { refreshBookingStatuses } from './detect-booking-signals.js';
import { enrichProfilesFromEmails } from './extract-profile.js';
import { reconcileBookingsWithAi } from './ai-booking-verify.js';
import { isDeepSeekConfigured } from './deepseek-client.js';
import { dedupeOverlappingBookings } from './dedupe-bookings.js';
import { scanEmailsForProposals, rejectInvalidPhoneProposals } from './sync-proposals.js';
import { seedProgressFromExcel } from './stay-progress.js';

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ skipImap?: boolean, fullSync?: boolean, skipAi?: boolean, quick?: boolean, maxMessagesPerMailbox?: number }} opts
 */
export async function runRefreshPipeline(db, opts = {}) {
  const started = Date.now();
  const quick = opts.quick === true;
  const report = {
    ok: true,
    startedAt: new Date().toISOString(),
    imap: null,
    link: null,
    signals: null,
    durationMs: 0,
  };

  if (!opts.skipImap) {
    try {
      report.imap = await runImapSync(db, {
        full: opts.fullSync,
        maxMessagesPerMailbox: opts.maxMessagesPerMailbox,
        skipJunk: quick || opts.skipJunk === true,
      });
    } catch (err) {
      report.imap = { error: err.message };
      console.error('IMAP sync error:', err.message);
    }
  } else {
    report.imap = { skipped: true, reason: 'skipImap' };
  }

  report.link = linkOrphanEmails(db);
  report.profiles = enrichProfilesFromEmails(db, { limit: quick ? 80 : 400 });
  report.signals = refreshBookingStatuses(db, { sinceDays: quick ? 45 : 120, limit: quick ? 200 : 800 });

  report.dedupe = dedupeOverlappingBookings(db);

  report.proposals = scanEmailsForProposals(db, {
    sinceDays: quick ? 45 : 120,
    limit: quick ? 200 : 800,
    // Soft "mail to review" cards are useful but noisy — keep the daily queue small.
    reviewLimit: quick ? 8 : 0,
  });

  // Opportunistic cleanup of bad auto-proposals left from older extractors.
  report.invalidPhoneCleanup = rejectInvalidPhoneProposals(db, 'automatic');

  if (opts.skipAi) {
    report.aiReconcile = { skipped: true, reason: 'skipAi' };
  } else if (isDeepSeekConfigured() && process.env.AI_RECONCILE !== '0') {
    try {
      report.aiReconcile = await reconcileBookingsWithAi(db, {
        limit: parseInt(process.env.AI_RECONCILE_LIMIT || '15', 10),
        dryRun: process.env.AI_RECONCILE_DRY_RUN === '1',
      });
    } catch (err) {
      report.aiReconcile = { error: err.message };
    }
  }

  if (quick) {
    report.excelSeed = { skipped: true, reason: 'quick' };
  } else {
    // L'Excel tarifs 2026-2027 reste la source de vérité finale pour la saison.
    report.excelSeed = seedProgressFromExcel(db);
  }

  report.durationMs = Date.now() - started;
  return report;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Refresh pipeline — emails & statuts');
  console.log('═══════════════════════════════════════\n');

  const db = await ensureDb();
  const report = await runRefreshPipeline(db, {
    fullSync: process.argv.includes('--full'),
    skipImap: process.argv.includes('--skip-imap'),
  });

  console.log('IMAP:', report.imap);
  console.log('Link:', report.link);
  console.log('Signals:', {
    scanned: report.signals?.emailsScanned,
    detected: report.signals?.signalsDetected,
    updated: report.signals?.recordsUpdated,
    recent: report.signals?.recentSignals?.slice(0, 8).map(s => `${s.contactName}: ${s.label}`),
  });
  console.log(`\n✅ Terminé en ${report.durationMs}ms`);

  if (process.env.VERCEL === '1') {
    await persistDb();
  } else if (getDbSync()) {
    // local — db already on disk
  }

  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

export default runRefreshPipeline;
