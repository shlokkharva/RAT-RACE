import { fetchVadodaraCompanyCareers } from '../src/fetchers/vadodara-companies.js';
import { fetchInternshalaJobs } from '../src/fetchers/internshala.js';
import { fetchUnstopJobs } from '../src/fetchers/unstop.js';
import { fetchJSearchJobs } from '../src/fetchers/jsearch.js';
import { processJobs } from '../src/utils/filter.js';
import { mergeJobsStore } from '../src/utils/storage.js';
import { enrichJobsWithGlassdoor, filterUnverifiedRemoteJobs } from '../src/utils/glassdoor.js';
import { filterExpiredJobs } from '../src/utils/validator.js';
import {
  loadVercelJobsStore,
  saveVercelJobsStore,
  setCorsHeaders,
  TMP_EXPIRED_PATH,
  TMP_REVIEWS_PATH,
} from './_lib/store.js';

/**
 * Live serverless refresh endpoint (`POST /api/refresh`) for Vercel deployments.
 * Runs fast, reliable sources within Vercel's serverless timeout and returns fresh jobs directly.
 */
export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
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
      sourcesStatus[r.source] = {
        enabled: r.enabled,
        status: r.status,
        rawCount: r.count,
      };
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

    return res.status(200).json({
      ok: true,
      meta: updatedStore.meta,
      jobs: updatedStore.jobs,
      newCount: newJobs.length,
      message:
        newJobs.length > 0
          ? `Found ${newJobs.length} new IT fresher job(s)!`
          : `Refreshed live — ${kept.length} open Vadodara & Remote IT fresher jobs.`,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
