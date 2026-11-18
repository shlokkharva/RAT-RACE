import { markJobExpired } from '../src/utils/validator.js';
import {
  loadVercelJobsStore,
  parseBody,
  saveVercelJobsStore,
  setCorsHeaders,
  TMP_EXPIRED_PATH,
} from './_lib/store.js';

export default function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = parseBody(req);
  const id = String(body.id || '').trim();
  if (!id) {
    return res.status(400).json({ ok: false, error: 'Missing job id.' });
  }

  const store = loadVercelJobsStore();
  const target = store.jobs.find((j) => j.id === id);
  markJobExpired(
    {
      id,
      title: target?.title || body.title || '',
      company: target?.company || body.company || '',
      reason: 'Reported expired on Vercel dashboard',
    },
    TMP_EXPIRED_PATH
  );

  store.jobs = store.jobs.filter((j) => j.id !== id);
  store.meta.totalJobs = store.jobs.length;
  saveVercelJobsStore(store);

  return res.status(200).json({
    ok: true,
    removedId: id,
    totalJobs: store.jobs.length,
    message: 'Removed expired job.',
  });
}
