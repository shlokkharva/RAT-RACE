import { isMailerConfigured, sendJobAlertToRecipient } from '../src/utils/mailer.js';
import {
  filterJobsForSubscriber,
  isValidEmail,
  normalizeEmail,
  sanitizeRoles,
} from '../src/utils/subscribers.js';
import { loadVercelJobsStore, parseBody, setCorsHeaders } from './_lib/store.js';

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = parseBody(req);
    const email = normalizeEmail(body.email || '');
    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, error: 'Please enter a valid email address first.' });
    }

    if (!isMailerConfigured()) {
      return res.status(200).json({
        ok: false,
        mailerConfigured: false,
        error: 'Add GMAIL_USER and GMAIL_APP_PASSWORD in Vercel Environment Variables to send emails.',
      });
    }

    const roles = sanitizeRoles(body.roles);
    const store = loadVercelJobsStore();
    const matchedJobs = filterJobsForSubscriber(store.jobs, roles, body.workMode || 'all');

    if (matchedJobs.length === 0) {
      return res.status(200).json({
        ok: true,
        emailSent: false,
        message: 'No active jobs match your selected roles right now.',
      });
    }

    const mailRes = await sendJobAlertToRecipient(email, matchedJobs, {
      recipientName: body.name || '',
      selectedRoles: roles,
    });

    return res.status(200).json({
      ok: true,
      emailSent: mailRes.sent,
      count: matchedJobs.length,
      message: `Sent ${matchedJobs.length} IT fresher job(s) with Apply links to ${email}!`,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
