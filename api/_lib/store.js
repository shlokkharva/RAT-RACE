import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEmptyStore } from '../../src/utils/storage.js';

export const BUNDLED_JOBS_PATH = path.resolve(process.cwd(), 'docs', 'data', 'jobs.json');
export const TMP_JOBS_PATH = path.join(os.tmpdir(), 'ratracerbdq-jobs.json');
export const TMP_SUBSCRIBERS_PATH = path.join(os.tmpdir(), 'ratracerbdq-subscribers.json');
export const TMP_EXPIRED_PATH = path.join(os.tmpdir(), 'ratracerbdq-expired.json');
export const TMP_REVIEWS_PATH = path.join(os.tmpdir(), 'ratracerbdq-reviews.json');

export function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

export function loadVercelJobsStore() {
  // Prefer fresher /tmp store if a serverless refresh/expiry happened in this instance
  for (const candidate of [TMP_JOBS_PATH, BUNDLED_JOBS_PATH]) {
    if (fs.existsSync(candidate)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        return {
          meta: { ...createEmptyStore().meta, ...(parsed.meta || {}) },
          jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
        };
      } catch {
        // try next
      }
    }
  }
  return createEmptyStore();
}

export function saveVercelJobsStore(store) {
  fs.writeFileSync(TMP_JOBS_PATH, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

export function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(String(req.body));
  } catch {
    return {};
  }
}
