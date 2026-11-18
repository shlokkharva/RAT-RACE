import { isMailerConfigured, sendJobAlertToRecipient } from '../src/utils/mailer.js';
import {
  filterJobsForSubscriber,
  isValidEmail,
  normalizeEmail,
  upsertSubscriber,
} from '../src/utils/subscribers.js';
import {
  loadVercelJobsStore,
  parseBody,
  setCorsHeaders,
  TMP_SUBSCRIBERS_PATH,
} from './_lib/store.js';

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
      return res.status(400).json({ ok: false, error: 'Please enter a valid Gmail or email address.' });
    }

    const wantsUpdates = body.active !== false;
    const saved = upsertSubscriber(
      {
        email,
        name: body.name || '',
        roles: body.roles,
        workMode: body.workMode || 'all',
        active: wantsUpdates,
      },
      TMP_SUBSCRIBERS_PATH
    );
    const { _isNew, ...subscriber } = saved;
    const shouldSendWelcome = wantsUpdates && (_isNew || body.sendWelcome === true);

    const store = loadVercelJobsStore();
    const matchedJobs = filterJobsForSubscriber(store.jobs, subscriber.roles, subscriber.workMode);

    let emailSent = false;
    let message = '';

    if (!wantsUpdates) {
      message = `Email updates paused for ${subscriber.email}.`;
    } else if (!shouldSendWelcome) {
      message = `Updated alert preferences for ${subscriber.email}.`;
    } else if (isMailerConfigured()) {
      try {
        const mailRes = await sendJobAlertToRecipient(subscriber.email, matchedJobs, {
          recipientName: subscriber.name,
          isWelcome: true,
          selectedRoles: subscriber.roles,
        });
        emailSent = mailRes.sent;
        message = mailRes.sent
          ? `Welcome email with ${matchedJobs.length} current matching job(s) sent to ${subscriber.email}!`
          : mailRes.reason;
      } catch (err) {
        message = `Preferences saved, but Gmail sending failed: ${err.message}`;
      }
    } else {
      message =
        'Gmail preferences saved! Add GMAIL_USER and GMAIL_APP_PASSWORD in Vercel Environment Variables to activate live email delivery.';
    }

    return res.status(200).json({
      ok: true,
      subscriber,
      emailSent,
      mailerConfigured: isMailerConfigured(),
      matchedJobsCount: matchedJobs.length,
      message,
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
}
