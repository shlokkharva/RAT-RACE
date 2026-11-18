import { isValidEmail, normalizeEmail, removeSubscriber } from '../src/utils/subscribers.js';
import { parseBody, setCorsHeaders, TMP_SUBSCRIBERS_PATH } from './_lib/store.js';

export default function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = parseBody(req);
  const email = normalizeEmail(body.email || '');
  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'Invalid email address.' });
  }

  const removed = removeSubscriber(email, TMP_SUBSCRIBERS_PATH);
  return res.status(200).json({
    ok: true,
    removed,
    message: `Unsubscribed ${email} from email alerts.`,
  });
}
