import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from './utils/env.js';
import { loadJobsStore, saveJobsStore } from './utils/storage.js';
import { markJobExpired } from './utils/validator.js';
import {
  filterJobsForSubscriber,
  isValidEmail,
  loadSubscribers,
  normalizeEmail,
  removeSubscriber,
  sanitizeRoles,
  upsertSubscriber,
} from './utils/subscribers.js';
import { isMailerConfigured, sendJobAlertToRecipient } from './utils/mailer.js';
import { runJobFetch } from './run.js';

loadEnv();

const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
const DOCS_DIR = path.resolve(process.cwd(), 'docs');

// Dynamic auto-fetch interval in seconds (default: every 30 minutes to protect your IP; set to 0 for manual only)
const AUTO_FETCH_INTERVAL_SECONDS = (() => {
  if (process.env.AUTO_FETCH_INTERVAL_SECONDS !== undefined) {
    return Math.max(0, Number(process.env.AUTO_FETCH_INTERVAL_SECONDS) || 0);
  }
  if (process.env.AUTO_FETCH_INTERVAL_MINUTES !== undefined) {
    return Math.max(0, (Number(process.env.AUTO_FETCH_INTERVAL_MINUTES) || 0) * 60);
  }
  return 1800;
})();

const RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Simple per-email cooldown (60 seconds) for manual "Send Now" requests
const sendNowCooldown = new Map();
// Per-source cooldown timestamps when a source returns HTTP 429
const sourceCooldownUntil = new Map();
// Connected SSE clients for instant real-time UI pushes
const sseClients = new Set();

const syncState = {
  isFetching: false,
  intervalSeconds: AUTO_FETCH_INTERVAL_SECONDS,
  lastFetchStartedAt: null,
  lastFetchFinishedAt: null,
  nextFetchAt:
    AUTO_FETCH_INTERVAL_SECONDS > 0
      ? new Date(Date.now() + AUTO_FETCH_INTERVAL_SECONDS * 1000).toISOString()
      : null,
  lastNewCount: 0,
  lastError: null,
  runCount: 0,
};

function broadcastEvent(eventName, payload) {
  const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(frame);
    } catch {
      sseClients.delete(client);
    }
  }
}

function getActiveCooldownSources() {
  const now = Date.now();
  const active = new Set();
  for (const [source, until] of sourceCooldownUntil.entries()) {
    if (until > now) {
      active.add(source);
    } else {
      sourceCooldownUntil.delete(source);
    }
  }
  return active;
}

let scheduledTimer = null;

function scheduleNextFetch() {
  if (AUTO_FETCH_INTERVAL_SECONDS <= 0) return;
  clearTimeout(scheduledTimer);
  const delayMs = AUTO_FETCH_INTERVAL_SECONDS * 1000;
  syncState.nextFetchAt = new Date(Date.now() + delayMs).toISOString();
  broadcastEvent('sync-status', { sync: syncState });

  scheduledTimer = setTimeout(() => {
    triggerDynamicFetch('scheduled').catch(() => { });
  }, delayMs);
}

async function triggerDynamicFetch(reason = 'scheduled') {
  if (syncState.isFetching) {
    return { started: false, reason: 'Fetch already in progress', sync: syncState };
  }

  syncState.isFetching = true;
  syncState.lastFetchStartedAt = new Date().toISOString();
  syncState.lastError = null;
  broadcastEvent('sync-status', { sync: syncState, trigger: reason });

  try {
    const skipSources = getActiveCooldownSources();
    const { updatedStore, newJobs, rateLimitedSources } = await runJobFetch({
      isDryRun: false,
      skipEmail: false,
      skipSources,
    });

    for (const src of rateLimitedSources || []) {
      sourceCooldownUntil.set(src, Date.now() + RATE_LIMIT_COOLDOWN_MS);
    }

    syncState.lastFetchFinishedAt = new Date().toISOString();
    syncState.lastNewCount = newJobs.length;
    syncState.runCount += 1;
    syncState.isFetching = false;

    scheduleNextFetch();

    broadcastEvent('jobs-updated', {
      meta: updatedStore.meta,
      jobs: updatedStore.jobs,
      newCount: newJobs.length,
      sync: syncState,
    });

    return {
      started: true,
      newCount: newJobs.length,
      totalJobs: updatedStore.jobs.length,
      sync: syncState,
    };
  } catch (err) {
    syncState.isFetching = false;
    syncState.lastError = err.message;
    syncState.lastFetchFinishedAt = new Date().toISOString();
    console.error(`[Rat Racer BDQ] Dynamic fetch (${reason}) failed:`, err.message);
    scheduleNextFetch();
    broadcastEvent('sync-status', { sync: syncState, error: err.message });
    return { started: true, error: err.message, sync: syncState };
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, maxBytes = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Request payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, urlPath) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return true;
  }

  if (urlPath === '/api/health' && req.method === 'GET') {
    const store = loadJobsStore();
    return (
      sendJson(res, 200, {
        ok: true,
        mailerConfigured: isMailerConfigured(),
        subscriberCount: loadSubscribers().length,
        totalJobs: store.jobs.length,
        lastUpdated: store.meta.lastUpdated,
        sync: syncState,
      }),
      true
    );
  }

  if (urlPath === '/api/jobs' && req.method === 'GET') {
    const store = loadJobsStore();
    return (
      sendJson(res, 200, {
        ok: true,
        meta: store.meta,
        jobs: store.jobs,
        sync: syncState,
      }),
      true
    );
  }

  if (urlPath === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`event: sync-status\ndata: ${JSON.stringify({ sync: syncState })}\n\n`);
    sseClients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
    return true;
  }

  if (urlPath === '/api/refresh' && req.method === 'POST') {
    if (syncState.isFetching) {
      return (
        sendJson(res, 200, {
          ok: true,
          alreadyRunning: true,
          message: 'A live job scan is already running...',
          sync: syncState,
        }),
        true
      );
    }
    // Kick off refresh immediately and respond without making the UI time out
    triggerDynamicFetch('manual').catch(() => { });
    return (
      sendJson(res, 202, {
        ok: true,
        started: true,
        message: 'Scanning LinkedIn, Internshala & Remotive for fresh Vadodara & Remote IT jobs...',
        sync: syncState,
      }),
      true
    );
  }

  if (urlPath === '/api/subscribe' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const email = normalizeEmail(body.email || '');
      if (!isValidEmail(email)) {
        return sendJson(res, 400, { ok: false, error: 'Please enter a valid Gmail or email address.' }), true;
      }

      const wantsUpdates = body.active !== false;
      const saved = upsertSubscriber({
        email,
        name: body.name || '',
        roles: body.roles,
        workMode: body.workMode || 'all',
        active: wantsUpdates,
      });
      const { _isNew, ...subscriber } = saved;
      const shouldSendWelcome = wantsUpdates && (_isNew || body.sendWelcome === true);

      const store = loadJobsStore();
      const matchedJobs = filterJobsForSubscriber(store.jobs, subscriber.roles, subscriber.workMode);

      let emailSent = false;
      let emailNote = '';

      if (!wantsUpdates) {
        emailNote = `Email updates are turned OFF for ${subscriber.email}. You can turn them back on anytime.`;
      } else if (!shouldSendWelcome) {
        emailNote = `Updated alert preferences for ${subscriber.email}. You'll be emailed when new matching jobs arrive.`;
      } else if (isMailerConfigured()) {
        try {
          const mailRes = await sendJobAlertToRecipient(subscriber.email, matchedJobs, {
            recipientName: subscriber.name,
            isWelcome: true,
            selectedRoles: subscriber.roles,
          });
          emailSent = mailRes.sent;
          emailNote = mailRes.sent
            ? `Welcome email with ${matchedJobs.length} current matching job(s) sent to ${subscriber.email}!`
            : mailRes.reason;
        } catch (err) {
          emailNote = `Saved your Gmail, but sending failed: ${err.message}`;
        }
      } else {
        emailNote =
          'Your Gmail opt-in is saved! Add GMAIL_USER and GMAIL_APP_PASSWORD in .env (or hosting secrets) to activate live email delivery.';
      }

      return (
        sendJson(res, 200, {
          ok: true,
          subscriber,
          emailSent,
          mailerConfigured: isMailerConfigured(),
          matchedJobsCount: matchedJobs.length,
          message: emailNote,
        }),
        true
      );
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message }), true;
    }
  }

  if (urlPath === '/api/send-now' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const email = normalizeEmail(body.email || '');
      if (!isValidEmail(email)) {
        return sendJson(res, 400, { ok: false, error: 'Please enter a valid email address first.' }), true;
      }

      const lastSent = sendNowCooldown.get(email) || 0;
      const waitSec = Math.ceil((60000 - (Date.now() - lastSent)) / 1000);
      if (waitSec > 0) {
        return (
          sendJson(res, 429, {
            ok: false,
            error: `Please wait ${waitSec}s before sending another digest to ${email}.`,
          }),
          true
        );
      }

      if (!isMailerConfigured()) {
        return (
          sendJson(res, 200, {
            ok: false,
            mailerConfigured: false,
            error: 'Gmail SMTP is not configured yet. Set GMAIL_USER & GMAIL_APP_PASSWORD in .env.',
          }),
          true
        );
      }

      const roles = sanitizeRoles(body.roles);
      const store = loadJobsStore();
      const matchedJobs = filterJobsForSubscriber(store.jobs, roles, body.workMode || 'all');

      if (matchedJobs.length === 0) {
        return (
          sendJson(res, 200, {
            ok: true,
            emailSent: false,
            message: 'No active jobs match your selected roles yet. You will be emailed automatically once one is posted.',
          }),
          true
        );
      }

      const mailRes = await sendJobAlertToRecipient(email, matchedJobs, {
        recipientName: body.name || '',
        selectedRoles: roles,
      });
      sendNowCooldown.set(email, Date.now());

      return (
        sendJson(res, 200, {
          ok: true,
          emailSent: mailRes.sent,
          count: matchedJobs.length,
          message: `Sent ${matchedJobs.length} IT fresher job(s) with Apply links to ${email}!`,
        }),
        true
      );
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message }), true;
    }
  }

  if (urlPath === '/api/report-expired' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const id = String(body.id || '').trim();
      if (!id) {
        return sendJson(res, 400, { ok: false, error: 'Missing job id.' }), true;
      }

      const store = loadJobsStore();
      const target = store.jobs.find((j) => j.id === id);
      markJobExpired({
        id,
        title: target?.title || body.title || '',
        company: target?.company || body.company || '',
        reason: 'Marked not accepting applications by user',
      });

      const nextJobs = store.jobs.filter((j) => j.id !== id);
      if (nextJobs.length !== store.jobs.length) {
        store.jobs = nextJobs;
        store.meta.totalJobs = nextJobs.length;
        saveJobsStore(store);
        broadcastEvent('jobs-updated', {
          meta: store.meta,
          jobs: store.jobs,
          newCount: 0,
          sync: syncState,
        });
      }

      return (
        sendJson(res, 200, {
          ok: true,
          removedId: id,
          totalJobs: store.jobs.length,
          message: 'Removed expired job permanently so it will not reappear.',
        }),
        true
      );
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message }), true;
    }
  }

  if (urlPath === '/api/unsubscribe' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const email = normalizeEmail(body.email || '');
      if (!isValidEmail(email)) {
        return sendJson(res, 400, { ok: false, error: 'Invalid email address.' }), true;
      }
      const removed = removeSubscriber(email);
      return (
        sendJson(res, 200, {
          ok: true,
          removed,
          message: removed
            ? `Unsubscribed ${email} from job alert emails.`
            : `${email} was not in the active email list.`,
        }),
        true
      );
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message }), true;
    }
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath.startsWith('/api/')) {
    const handled = await handleApi(req, res, urlPath);
    if (handled) return;
    return sendJson(res, 404, { ok: false, error: 'API endpoint not found' });
  }

  if (urlPath === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  const relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const fullPath = path.resolve(DOCS_DIR, relPath);

  if (!fullPath.startsWith(DOCS_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Rat Racer BDQ Dynamic Dashboard + Alert API running at http://${HOST}:${PORT}`);
  console.log(
    `Gmail SMTP configured: ${isMailerConfigured() ? 'YES' : 'NO (set GMAIL_USER & GMAIL_APP_PASSWORD in .env)'}`
  );

  if (AUTO_FETCH_INTERVAL_SECONDS > 0) {
    console.log(
      `Dynamic auto-fetch enabled: scanning for new Vadodara & Remote IT fresher jobs every ${AUTO_FETCH_INTERVAL_SECONDS}s (with automatic HTTP 429 cooldown protection).`
    );
    scheduleNextFetch();
  }
});
