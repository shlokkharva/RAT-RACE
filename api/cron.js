import { fetchVadodaraCompanyCareers } from '../src/fetchers/vadodara-companies.js';
import { fetchInternshalaJobs } from '../src/fetchers/internshala.js';
import { fetchUnstopJobs } from '../src/fetchers/unstop.js';
import { fetchJSearchJobs } from '../src/fetchers/jsearch.js';
import { processJobs } from '../src/utils/filter.js';
import { mergeJobsStore } from '../src/utils/storage.js';
import { enrichJobsWithGlassdoor, filterUnverifiedRemoteJobs } from '../src/utils/glassdoor.js';
import { filterExpiredJobs } from '../src/utils/validator.js';
import { getActiveRecipients } from '../src/utils/subscribers.js';
import { sendAlertsToSubscribers } from '../src/utils/mailer.js';
import {
  loadVercelJobsStore,
  saveVercelJobsStore,
  TMP_EXPIRED_PATH,
  TMP_REVIEWS_PATH,
  TMP_SUBSCRIBERS_PATH,
} from './_lib/store.js';

/**
 * Vercel Cron endpoint (`GET /api/cron`, configured in vercel.json).
 * Optionally protected via CRON_SECRET env var in Vercel Project Settings.
 */
export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const includeRemoteIndia =
      String(process.env.INCLUDE_REMOTE_INDIA ?? 'true').toLowerCase() !== 'false';
    const requireGlassdoorForRemote =
      String(process.env.REQUIRE_GLASSDOOR_FOR_REMOTE ?? 'true').toLowerCase() !== 'false';

    const results = await Promise.all([
      fetchVadodaraCompanyCareers(),
      fetchInternshalaJobs({ includeRemoteIndia }),
      fetchUnstopJobs({ includeRemoteIndia }),
      fetchJSearchJobs({ includeRemoteIndia }),
    ]);

    const sourcesStatus = {};
    const rawJobs = [];
    for (const r of results) {
      sourcesStatus[r.source] = { enabled: r.enabled, status: r.status, rawCount: r.count };
      rawJobs.push(...r.jobs);
    }

    const processed = processJobs(rawJobs, { includeRemoteIndia });
    await enrichJobsWithGlassdoor(processed, TMP_REVIEWS_PATH, { checkWebsites: false });
    const verified = filterUnverifiedRemoteJobs(processed, { requireGlassdoorForRemote });

    const existing = loadVercelJobsStore();
    const { updatedStore, newJobs } = mergeJobsStore(existing, verified, {
      maxAgeDays: 14,
      sourcesStatus,
    });

    const { kept } = await filterExpiredJobs(updatedStore.jobs, {
      expiredStorePath: TMP_EXPIRED_PATH,
    });
    updatedStore.jobs = kept;
    updatedStore.meta.totalJobs = kept.length;
    saveVercelJobsStore(updatedStore);

    const liveIds = new Set(kept.map((j) => j.id));
    const liveNewJobs = newJobs.filter((j) => liveIds.has(j.id));

    let mailSummary = null;
    if (liveNewJobs.length > 0) {
      const recipients = getActiveRecipients(TMP_SUBSCRIBERS_PATH);
      mailSummary = await sendAlertsToSubscribers(liveNewJobs, recipients);
    }

    return res.status(200).json({
      ok: true,
      totalJobs: kept.length,
      newJobs: liveNewJobs.length,
      emailsSent: mailSummary?.sentCount || 0,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
