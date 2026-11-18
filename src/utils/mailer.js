import nodemailer from 'nodemailer';
import { ROLE_CATEGORIES } from '../config.js';
import { filterJobsForSubscriber, getActiveRecipients } from './subscribers.js';

const CATEGORY_MAP = new Map(ROLE_CATEGORIES.map((c) => [c.id, c]));

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHref(url = '') {
  const trimmed = String(url || '').trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return '#';
}

export function isMailerConfigured() {
  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailPass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
  return Boolean(gmailUser && gmailPass);
}

function createTransporter() {
  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailPass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');
  if (!gmailUser || !gmailPass) return null;

  return {
    gmailUser,
    transporter: nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    }),
  };
}

export function buildAlertEmail(
  jobs = [],
  dashboardUrl = '',
  { recipientName = '', isWelcome = false, selectedRoles = [] } = {}
) {
  const count = jobs.length;
  const uniqueCategoryLabels = Array.from(
    new Set(
      jobs
        .flatMap((j) => j.categories || [])
        .map((id) => CATEGORY_MAP.get(id)?.label)
        .filter(Boolean)
    )
  );

  const roleSummary =
    uniqueCategoryLabels.length > 0 ? ` (${uniqueCategoryLabels.slice(0, 3).join(', ')})` : '';

  const subject = isWelcome
    ? `[Rat Racer BDQ] Vadodara IT Fresher Alerts Active${count > 0 ? ` — ${count} Open Role${count === 1 ? '' : 's'} Ready` : ''}`
    : `[Rat Racer BDQ] ${count} New Vadodara IT Fresher Job${count === 1 ? '' : 's'}${roleSummary}`;

  const istTime = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const greeting = recipientName ? `Hi ${escapeHtml(recipientName)},` : 'Hi there,';
  const selectedRoleLabels = selectedRoles
    .map((id) => CATEGORY_MAP.get(id)?.label)
    .filter(Boolean)
    .join(', ');

  const introBlock = isWelcome
    ? `<tr>
         <td style="padding:18px 20px 8px;font-size:14px;color:#334155;line-height:1.55;">
           ${greeting}<br /><br />
           Your <strong>Vadodara IT Fresher Job Alerts</strong> are now active! Whenever a new fresher or internship opening is posted in Vadodara${
             selectedRoleLabels ? ` for <strong>${escapeHtml(selectedRoleLabels)}</strong>` : ''
           }, we'll email you immediately with the direct application link.
           ${
             count > 0
               ? `<br /><br />Here ${count === 1 ? 'is' : 'are'} the <strong>${count} currently active opening${count === 1 ? '' : 's'}</strong> matching your profile:`
               : '<br /><br />No active openings matched right at this moment — you will automatically receive an email as soon as the next job is posted.'
           }
         </td>
       </tr>`
    : '';

  const jobCardsHtml = jobs
    .map((job) => {
      const badges = (job.categories || [])
        .map((id) => {
          const cat = CATEGORY_MAP.get(id);
          const label = cat ? cat.label : id;
          const color = cat ? cat.color : '#2563eb';
          return `<span style="display:inline-block;padding:3px 9px;margin:0 6px 6px 0;border-radius:999px;font-size:11px;font-weight:600;background:${color}1a;color:${color};border:1px solid ${color}40;">${escapeHtml(label)}</span>`;
        })
        .join('');

      const metaParts = [job.location, job.experience, job.salary, job.source]
        .filter(Boolean)
        .map((m) => escapeHtml(m))
        .join(' &nbsp;&bull;&nbsp; ');

      return `
        <tr>
          <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
            <div style="margin-bottom:6px;">${badges}</div>
            <div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:4px;">
              ${escapeHtml(job.title)}
            </div>
            <div style="font-size:14px;font-weight:600;color:#334155;margin-bottom:6px;">
              ${escapeHtml(job.company)}
            </div>
            <div style="font-size:12px;color:#64748b;margin-bottom:12px;">
              ${metaParts}
            </div>
            <a href="${escapeHtml(safeHref(job.applyUrl))}" target="_blank" rel="noopener noreferrer"
               style="display:inline-block;padding:9px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;margin-right:8px;">
              Apply Now &rarr;
            </a>
            ${
              job.glassdoor?.url
                ? `<a href="${escapeHtml(safeHref(job.glassdoor.url))}" target="_blank" rel="noopener noreferrer"
                     style="display:inline-block;padding:8px 13px;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;text-decoration:none;border-radius:8px;font-size:12px;font-weight:600;">
                    &#9733; ${job.glassdoor.rating ? `${escapeHtml(job.glassdoor.rating)} ` : ''}Glassdoor Reviews
                  </a>`
                : ''
            }
          </td>
        </tr>`;
    })
    .join('');

  const dashboardCta = dashboardUrl
    ? `<p style="margin:14px 0 0;text-align:center;">
         <a href="${escapeHtml(safeHref(dashboardUrl))}" target="_blank" rel="noopener noreferrer"
            style="display:inline-block;padding:10px 20px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">
           Open Vadodara Jobs Dashboard
         </a>
       </p>`
    : '';

  const headerTitle = isWelcome
    ? 'Welcome to Rat Racer BDQ Vadodara Alerts'
    : `${count} New IT Fresher Job${count === 1 ? '' : 's'} Found`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr>
      <td style="padding:24px 20px;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#ffffff;">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#dbeafe;font-weight:700;">
          Rat Racer BDQ &bull; Vadodara IT Fresher Alert
        </div>
        <h1 style="margin:6px 0 4px;font-size:21px;line-height:1.3;">
          ${headerTitle}
        </h1>
        <div style="font-size:12px;color:#e0e7ff;">
          Checked at ${escapeHtml(istTime)} IST &bull; Vadodara, Gujarat
        </div>
      </td>
    </tr>
    ${introBlock}
    ${jobCardsHtml}
    <tr>
      <td style="padding:18px 20px;background:#f8fafc;text-align:center;font-size:12px;color:#64748b;">
        ${dashboardCta}
        <p style="margin:14px 0 0;">
          Sent automatically by Rat Racer BDQ. You only receive alerts when brand-new Vadodara IT fresher openings appear.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines = [
    `Rat Racer BDQ — ${headerTitle} (${istTime} IST)`,
    '='.repeat(64),
    '',
    ...jobs.flatMap((job, i) => [
      `${i + 1}. ${job.title} — ${job.company}`,
      `   Location: ${job.location} | ${job.experience} | Source: ${job.source}`,
      `   Apply: ${job.applyUrl}`,
      '',
    ]),
  ];
  if (dashboardUrl) {
    textLines.push(`Dashboard: ${dashboardUrl}`);
  }

  return { subject, html, text: textLines.join('\n') };
}

/**
 * Sends a personalized job email to a single specific user's email address.
 */
export async function sendJobAlertToRecipient(
  recipientEmail,
  jobs = [],
  { recipientName = '', isWelcome = false, selectedRoles = [] } = {}
) {
  if (!isWelcome && !jobs.length) {
    return { sent: false, recipient: recipientEmail, reason: 'No matching jobs to notify.' };
  }

  const client = createTransporter();
  if (!client) {
    return {
      sent: false,
      recipient: recipientEmail,
      reason: 'GMAIL_USER or GMAIL_APP_PASSWORD not configured (skipping email).',
    };
  }

  const dashboardUrl = process.env.DASHBOARD_URL?.trim() || '';
  const { subject, html, text } = buildAlertEmail(jobs, dashboardUrl, {
    recipientName,
    isWelcome,
    selectedRoles,
  });

  const info = await client.transporter.sendMail({
    from: `"Rat Racer BDQ Vadodara" <${client.gmailUser}>`,
    to: recipientEmail,
    subject,
    text,
    html,
  });

  return {
    sent: true,
    messageId: info.messageId,
    recipient: recipientEmail,
    count: jobs.length,
  };
}

/**
 * Sends personalized alerts to every active subscriber (matching each user's chosen roles).
 */
export async function sendAlertsToSubscribers(newJobs = [], recipients = getActiveRecipients()) {
  if (!newJobs.length) {
    return { sentCount: 0, results: [], reason: 'No new jobs to notify.' };
  }
  if (!recipients.length) {
    return { sentCount: 0, results: [], reason: 'No subscribers or ALERT_EMAIL_TO configured.' };
  }
  if (!isMailerConfigured()) {
    return {
      sentCount: 0,
      results: [],
      reason: 'GMAIL_USER or GMAIL_APP_PASSWORD not configured (skipping email).',
    };
  }

  const results = [];
  for (const sub of recipients) {
    const matchedJobs = filterJobsForSubscriber(newJobs, sub.roles, sub.workMode || 'all');
    if (matchedJobs.length === 0) {
      results.push({
        sent: false,
        recipient: sub.email,
        reason: 'No new jobs matched this user role selection.',
      });
      continue;
    }
    try {
      const res = await sendJobAlertToRecipient(sub.email, matchedJobs, {
        recipientName: sub.name,
        selectedRoles: sub.roles,
      });
      results.push(res);
    } catch (err) {
      results.push({ sent: false, recipient: sub.email, reason: err.message });
    }
  }

  return {
    sentCount: results.filter((r) => r.sent).length,
    results,
  };
}

/**
 * Convenience wrapper for single-recipient test / legacy calls.
 */
export async function sendJobAlertEmail(newJobs = []) {
  const toEmail = process.env.ALERT_EMAIL_TO?.trim() || process.env.GMAIL_USER?.trim();
  if (!toEmail) {
    return {
      sent: false,
      reason: 'GMAIL_USER or GMAIL_APP_PASSWORD not configured (skipping email).',
    };
  }
  return sendJobAlertToRecipient(toEmail, newJobs);
}
