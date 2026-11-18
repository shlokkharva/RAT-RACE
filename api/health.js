import { isMailerConfigured } from '../src/utils/mailer.js';
import { loadSubscribers } from '../src/utils/subscribers.js';
import { loadVercelJobsStore, setCorsHeaders, TMP_SUBSCRIBERS_PATH } from './_lib/store.js';

export default function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const store = loadVercelJobsStore();
  return res.status(200).json({
    ok: true,
    platform: 'vercel',
    mailerConfigured: isMailerConfigured(),
    subscriberCount: loadSubscribers(TMP_SUBSCRIBERS_PATH).length,
    totalJobs: store.jobs.length,
    lastUpdated: store.meta.lastUpdated,
  });
}
