import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_DATA_PATH = path.resolve(process.cwd(), 'docs', 'data', 'jobs.json');

export function createEmptyStore() {
  return {
    meta: {
      city: 'Vadodara',
      targetRoles: ['Data Analyst', 'UI/UX Design', 'MERN Stack', 'Full-Stack', 'Python'],
      lastUpdated: null,
      totalJobs: 0,
      newInLastRun: 0,
      sourcesStatus: {},
    },
    jobs: [],
  };
}

export function loadJobsStore(filePath = DEFAULT_DATA_PATH) {
  if (!fs.existsSync(filePath)) {
    return createEmptyStore();
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      meta: { ...createEmptyStore().meta, ...(parsed.meta || {}) },
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    };
  } catch {
    return createEmptyStore();
  }
}

/**
 * Merges newly fetched jobs into the persistent store:
 * - Preserves original `discoveredAt` for existing jobs
 * - Marks truly new jobs so the mailer emails ONLY brand-new openings
 * - Prunes jobs older than `maxAgeDays`
 */
export function mergeJobsStore(existingStore, fetchedJobs, { maxAgeDays = 30, sourcesStatus = {} } = {}) {
  const nowIso = new Date().toISOString();
  const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  const existingById = new Map(existingStore.jobs.map((j) => [j.id, j]));
  const newJobs = [];
  const mergedMap = new Map();

  // Keep non-expired existing jobs
  for (const job of existingStore.jobs) {
    const ts = Date.parse(job.discoveredAt || nowIso);
    if (!Number.isNaN(ts) && ts >= cutoffMs) {
      mergedMap.set(job.id, job);
    }
  }

  for (const job of fetchedJobs) {
    const prev = existingById.get(job.id);
    if (prev) {
      // Refresh metadata while preserving original discoveredAt
      mergedMap.set(job.id, {
        ...prev,
        ...job,
        categories: Array.from(new Set([...(prev.categories || []), ...(job.categories || [])])),
        discoveredAt: prev.discoveredAt || nowIso,
        lastSeenAt: nowIso,
      });
    } else {
      const freshJob = {
        ...job,
        discoveredAt: nowIso,
        lastSeenAt: nowIso,
      };
      mergedMap.set(job.id, freshJob);
      newJobs.push(freshJob);
    }
  }

  // Sort newest discovered first, then highest fresher score
  const allJobs = Array.from(mergedMap.values()).sort((a, b) => {
    const timeDiff = Date.parse(b.discoveredAt || 0) - Date.parse(a.discoveredAt || 0);
    if (timeDiff !== 0) return timeDiff;
    return (b.fresherScore || 0) - (a.fresherScore || 0);
  });

  const updatedStore = {
    meta: {
      city: 'Vadodara',
      targetRoles: ['Data Analyst', 'UI/UX Design', 'MERN Stack', 'Full-Stack', 'Python'],
      lastUpdated: nowIso,
      totalJobs: allJobs.length,
      newInLastRun: newJobs.length,
      sourcesStatus,
    },
    jobs: allJobs,
  };

  return { updatedStore, newJobs };
}

export function saveJobsStore(store, filePath = DEFAULT_DATA_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2) + '\n', 'utf8');
}
