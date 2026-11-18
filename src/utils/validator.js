import fs from 'node:fs';
import path from 'node:path';
import { HTTP_HEADERS } from '../config.js';

export const EXPIRED_STORE_PATH = path.resolve(process.cwd(), 'data', 'expired-jobs.json');

export function loadExpiredIds(filePath = EXPIRED_STORE_PATH) {
  if (!fs.existsSync(filePath)) return new Set();
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const entries = Array.isArray(raw.expired) ? raw.expired : [];
    return new Set(entries.map((e) => (typeof e === 'string' ? e : e.id)).filter(Boolean));
  } catch {
    return new Set();
  }
}

export function markJobExpired(
  { id, title = '', company = '', reason = 'Reported expired / not accepting applications' },
  filePath = EXPIRED_STORE_PATH
) {
  if (!id) return false;
  let list = [];
  if (fs.existsSync(filePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(raw.expired)) list = raw.expired;
    } catch {
      list = [];
    }
  }
  const exists = list.some((e) => (typeof e === 'string' ? e : e.id) === id);
  if (!exists) {
    list.push({ id, title, company, reason, markedAt: new Date().toISOString() });
    // Keep most recent 500 expired IDs
    if (list.length > 500) list = list.slice(-500);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify({ updatedAt: new Date().toISOString(), expired: list }, null, 2) + '\n',
      'utf8'
    );
  }
  return true;
}

export const EXPIRED_PAGE_PATTERNS = [
  /no\s+longer\s+accepting\s+applications/i,
  /not\s+accepting\s+(?:any\s+)?(?:more\s+)?applications/i,
  /applications?\s+(?:are|is|have\s+been)\s+closed/i,
  /(?:this\s+)?(?:job|position|role|posting|internship|opportunity)\s+(?:has\s+)?(?:expired|ended|been\s+filled|been\s+closed)/i,
  /(?:this\s+)?(?:job|position|role|internship|opportunity)\s+is\s+(?:closed|expired|no\s+longer\s+(?:available|open|active))/i,
  /registrations?\s+(?:are|is|have\s+been)?\s*closed/i,
  /application\s+deadline\s+(?:has\s+)?passed/i,
  /job\s+you(?:'re|\s+are)\s+looking\s+for\s+(?:is\s+no\s+longer|has\s+expired|was\s+not\s+found)/i,
  /sorry,\s+this\s+job\s+is\s+no\s+longer\s+available/i,
  /we\s+are\s+no\s+longer\s+accepting\s+applications/i,
  /expired\s+job/i,
];

const VERIFY_TTL_MS = 6 * 60 * 60 * 1000; // Re-verify polite domains at most once every 6 hours

// Domains whose robots.txt / anti-bot systems restrict automated scraping — never probe them automatically
export const SCRAPE_RESTRICTED_DOMAINS = [
  'linkedin.com',
  'internshala.com',
  'unstop.com',
  'naukri.com',
  'indeed.com',
  'glassdoor.com',
  'glassdoor.co.in',
  'foundit.in',
  'shine.com',
  'jooble.org',
  'timesjobs.com',
];

export function isScrapeRestrictedUrl(rawUrl = '') {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return SCRAPE_RESTRICTED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export function isExpiredPageText(htmlOrText = '') {
  const raw = String(htmlOrText);

  // 1. Check Schema.org JSON-LD "validThrough" expiration date (used by Shine, LinkedIn, Naukri, Workday, etc.)
  const validThroughMatch = raw.match(/"validThrough"\s*:\s*"([^"]+)"/i);
  if (validThroughMatch) {
    const expiryMs = Date.parse(validThroughMatch[1]);
    if (!Number.isNaN(expiryMs) && expiryMs < Date.now()) {
      return true;
    }
  }

  // 2. Check visible page text for explicit closed / not-accepting messages
  const plain = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  return EXPIRED_PAGE_PATTERNS.some((rx) => rx.test(plain));
}

/**
 * Checks a single job application URL to see if it is still open & accepting applications.
 * Returns { alive: boolean, reason?: string }.
 */
export async function checkJobUrlLive(applyUrl) {
  if (!applyUrl || !/^https?:\/\//i.test(applyUrl)) {
    return { alive: false, reason: 'Invalid URL' };
  }

  // Respect robots.txt & prevent IP rate-limiting on scraping-restricted job boards
  if (isScrapeRestrictedUrl(applyUrl)) {
    return { alive: true, skipped: true, reason: 'Skipped automated probe (robots.txt / anti-ban protection)' };
  }

  try {
    const res = await fetch(applyUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: HTTP_HEADERS,
      signal: AbortSignal.timeout(12000),
    });

    if (res.status === 404 || res.status === 410) {
      return { alive: false, reason: `HTTP ${res.status} (job removed)` };
    }

    // Don't falsely kill jobs if a portal returns anti-bot 403/429
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      return { alive: true, reason: `Skipped check (HTTP ${res.status})` };
    }

    const html = await res.text();
    if (isExpiredPageText(html)) {
      return { alive: false, reason: 'Application page reports job is closed / not accepting applications' };
    }

    return { alive: true };
  } catch (err) {
    // Transient network timeout — keep the job until a definitive check succeeds
    return { alive: true, reason: `Timeout/network skip (${err.message})` };
  }
}

/**
 * Verifies a batch of jobs in parallel (concurrency 5) and removes any expired/closed postings.
 * Respects `lastVerifiedAt` so unchanged jobs aren't re-checked every 60 seconds.
 */
export async function filterExpiredJobs(
  jobs = [],
  { forceCheck = false, expiredStorePath = EXPIRED_STORE_PATH } = {}
) {
  const now = Date.now();
  const knownExpired = loadExpiredIds(expiredStorePath);
  const kept = [];
  const removed = [];

  const queue = [...jobs];
  const CONCURRENCY = 2;

  async function worker() {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) break;

      // Drop immediately if previously detected or reported expired
      if (knownExpired.has(job.id)) {
        removed.push({ job, reason: 'Previously marked expired / not accepting applications' });
        continue;
      }

      // Drop immediately if explicit deadline has already passed
      if (job.deadlineAt && !Number.isNaN(Date.parse(job.deadlineAt))) {
        if (Date.parse(job.deadlineAt) < now) {
          markJobExpired({ id: job.id, title: job.title, company: job.company, reason: 'Deadline passed' }, expiredStorePath);
          removed.push({ job, reason: 'Deadline passed' });
          continue;
        }
      }

      const lastChecked = job.lastVerifiedAt ? Date.parse(job.lastVerifiedAt) : 0;
      const recentlyChecked = !forceCheck && lastChecked && now - lastChecked < VERIFY_TTL_MS;

      if (recentlyChecked) {
        kept.push(job);
        continue;
      }

      const check = await checkJobUrlLive(job.applyUrl);
      if (!check.alive) {
        markJobExpired({ id: job.id, title: job.title, company: job.company, reason: check.reason }, expiredStorePath);
        removed.push({ job, reason: check.reason });
      } else {
        job.lastVerifiedAt = new Date().toISOString();
        kept.push(job);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length || 1) }, worker));

  return { kept, removed };
}
