import fs from 'node:fs';
import path from 'node:path';
import { ROLE_CATEGORIES } from '../config.js';

export const DEFAULT_SUBSCRIBERS_PATH = path.resolve(process.cwd(), 'data', 'subscribers.json');
export const ALL_ROLE_IDS = ROLE_CATEGORIES.map((c) => c.id);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export function normalizeEmail(email = '') {
  return String(email).trim().toLowerCase();
}

export function isValidEmail(email = '') {
  const norm = normalizeEmail(email);
  return norm.length <= 254 && EMAIL_REGEX.test(norm);
}

export function sanitizeRoles(roles) {
  if (!Array.isArray(roles) || roles.length === 0) {
    return [...ALL_ROLE_IDS];
  }
  const valid = roles.filter((r) => ALL_ROLE_IDS.includes(r));
  return valid.length > 0 ? Array.from(new Set(valid)) : [...ALL_ROLE_IDS];
}

export function loadSubscribers(filePath = DEFAULT_SUBSCRIBERS_PATH) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.subscribers) ? parsed.subscribers : [];
  } catch {
    return [];
  }
}

export function saveSubscribers(subscribers, filePath = DEFAULT_SUBSCRIBERS_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify({ updatedAt: new Date().toISOString(), subscribers }, null, 2) + '\n',
    'utf8'
  );
}

export const VALID_WORK_MODES = ['all', 'vadodara', 'remote'];

export function sanitizeWorkMode(mode = 'all') {
  const norm = String(mode || 'all').trim().toLowerCase();
  return VALID_WORK_MODES.includes(norm) ? norm : 'all';
}

export function upsertSubscriber(
  { email, roles, name = '', active = true, workMode = 'all' },
  filePath = DEFAULT_SUBSCRIBERS_PATH
) {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) {
    throw new Error('Please enter a valid email address (for example, name@gmail.com).');
  }

  const cleanRoles = sanitizeRoles(roles);
  const cleanMode = sanitizeWorkMode(workMode);
  const subscribers = loadSubscribers(filePath);
  const nowIso = new Date().toISOString();
  const idx = subscribers.findIndex((s) => normalizeEmail(s.email) === normalized);

  const record = {
    email: normalized,
    name: String(name || '').trim().slice(0, 80),
    roles: cleanRoles,
    workMode: cleanMode,
    active: Boolean(active),
    subscribedAt: idx >= 0 ? subscribers[idx].subscribedAt || nowIso : nowIso,
    updatedAt: nowIso,
  };

  const isNew = idx < 0;
  if (idx >= 0) {
    subscribers[idx] = record;
  } else {
    subscribers.push(record);
  }

  saveSubscribers(subscribers, filePath);
  return { ...record, _isNew: isNew };
}

export function removeSubscriber(email, filePath = DEFAULT_SUBSCRIBERS_PATH) {
  const normalized = normalizeEmail(email);
  const subscribers = loadSubscribers(filePath);
  const next = subscribers.filter((s) => normalizeEmail(s.email) !== normalized);
  const removed = next.length !== subscribers.length;
  if (removed) {
    saveSubscribers(next, filePath);
  }
  return removed;
}

/**
 * Combines active subscribers saved via the dashboard with any env ALERT_EMAIL_TO addresses.
 */
export function getActiveRecipients(filePath = DEFAULT_SUBSCRIBERS_PATH) {
  const byEmail = new Map();

  // 1. Dashboard-subscribed users (with their personal role preferences)
  for (const sub of loadSubscribers(filePath)) {
    if (sub.active === false) continue;
    const norm = normalizeEmail(sub.email);
    if (!isValidEmail(norm)) continue;
    byEmail.set(norm, {
      email: norm,
      name: sub.name || '',
      roles: sanitizeRoles(sub.roles),
      workMode: sanitizeWorkMode(sub.workMode),
    });
  }

  // 2. Fallback / additional emails from ALERT_EMAIL_TO (comma-separated supported)
  const envRecipients = String(process.env.ALERT_EMAIL_TO || '')
    .split(',')
    .map((e) => normalizeEmail(e))
    .filter((e) => isValidEmail(e));

  for (const email of envRecipients) {
    if (!byEmail.has(email)) {
      byEmail.set(email, {
        email,
        name: '',
        roles: [...ALL_ROLE_IDS],
        workMode: 'all',
      });
    }
  }

  return Array.from(byEmail.values());
}

/**
 * Filters a list of jobs to only those matching a particular subscriber's selected role tracks & work mode.
 */
export function filterJobsForSubscriber(jobs = [], roles = ALL_ROLE_IDS, workMode = 'all') {
  const allowed = new Set(sanitizeRoles(roles));
  const mode = sanitizeWorkMode(workMode);
  return jobs.filter((job) => {
    const roleOk = (job.categories || []).some((cat) => allowed.has(cat));
    if (!roleOk) return false;
    if (mode === 'vadodara') return Boolean(job.isVadodara);
    if (mode === 'remote') return Boolean(job.isRemote);
    return true;
  });
}
