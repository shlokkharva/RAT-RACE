import { loadExpiredIds } from '../src/utils/validator.js';
import { loadVercelJobsStore, setCorsHeaders, TMP_EXPIRED_PATH } from './_lib/store.js';

export default function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const store = loadVercelJobsStore();
  const expiredIds = loadExpiredIds(TMP_EXPIRED_PATH);
  const activeJobs = store.jobs.filter((j) => !expiredIds.has(j.id));

  return res.status(200).json({
    ok: true,
    meta: { ...store.meta, totalJobs: activeJobs.length },
    jobs: activeJobs,
    sync: {
      isFetching: false,
      intervalSeconds: 60,
      lastFetchFinishedAt: store.meta.lastUpdated,
      nextFetchAt: null,
      platform: 'vercel',
    },
  });
}
