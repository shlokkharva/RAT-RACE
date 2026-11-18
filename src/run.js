import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './utils/env.js';
import { fetchLinkedInJobs } from './fetchers/linkedin.js';
import { fetchInternshalaJobs } from './fetchers/internshala.js';
import { fetchUnstopJobs } from './fetchers/unstop.js';
import { fetchTimesJobs } from './fetchers/timesjobs.js';
import { fetchHimalayasJobs } from './fetchers/himalayas.js';
import { fetchJobicyJobs } from './fetchers/jobicy.js';
import { fetchRemotiveJobs } from './fetchers/remotive.js';
import { fetchVadodaraCompanyCareers } from './fetchers/vadodara-companies.js';
import { fetchAdzunaJobs } from './fetchers/adzuna.js';
import { fetchJSearchJobs } from './fetchers/jsearch.js';
import { fetchJoobleJobs } from './fetchers/jooble.js';
import { processJobs } from './utils/filter.js';
import { loadJobsStore, mergeJobsStore, saveJobsStore } from './utils/storage.js';
import { enrichJobsWithGlassdoor, filterUnverifiedRemoteJobs } from './utils/glassdoor.js';
import { filterExpiredJobs } from './utils/validator.js';
import { getActiveRecipients } from './utils/subscribers.js';
import { buildAlertEmail, sendAlertsToSubscribers } from './utils/mailer.js';

loadEnv();

export async function runJobFetch({
  isDryRun = false,
  skipEmail = false,
  skipSources = new Set(),
} = {}) {
  const includeRemoteIndia =
    String(process.env.INCLUDE_REMOTE_INDIA ?? 'true').toLowerCase() !== 'false';
  const maxAgeDays = Number(process.env.MAX_JOB_AGE_DAYS) || 14;

  console.log('===============================================================');
  console.log(' Rat Racer BDQ — Vadodara & Remote IT Fresher Job Fetcher');
  console.log(' Roles: Data Analyst | UI/UX | MERN Stack | Full-Stack | Python');
  console.log(` Scope: Vadodara${includeRemoteIndia ? ' + Remote (India/Worldwide)' : ' Only'}`);
  console.log(` Mode: ${isDryRun ? 'DRY RUN (no file write / no email)' : 'LIVE'}`);
  console.log('===============================================================');

  const fetcherEntries = [
    { name: 'Vadodara Company Careers', fn: () => fetchVadodaraCompanyCareers() },
    { name: 'LinkedIn', fn: () => fetchLinkedInJobs({ includeRemoteIndia }) },
    { name: 'Internshala', fn: () => fetchInternshalaJobs({ includeRemoteIndia }) },
    { name: 'Unstop', fn: () => fetchUnstopJobs({ includeRemoteIndia }) },
    { name: 'TimesJobs', fn: () => fetchTimesJobs({ includeRemoteIndia }) },
    { name: 'Himalayas', fn: () => fetchHimalayasJobs({ includeRemoteIndia }) },
    { name: 'Jobicy', fn: () => fetchJobicyJobs({ includeRemoteIndia }) },
    { name: 'Remotive (Remote)', fn: () => fetchRemotiveJobs({ includeRemoteIndia }) },
    { name: 'Adzuna', fn: () => fetchAdzunaJobs() },
    { name: 'Google Jobs (JSearch)', fn: () => fetchJSearchJobs({ includeRemoteIndia }) },
    { name: 'Jooble', fn: () => fetchJoobleJobs() },
  ];

  const results = await Promise.all(
    fetcherEntries.map(({ name, fn }) => {
      if (skipSources.has(name)) {
        return Promise.resolve({
          source: name,
          enabled: true,
          status: 'cooldown',
          rateLimited: false,
          count: 0,
          error: 'Cooling down after rate limit',
          jobs: [],
        });
      }
      return fn();
    })
  );
  const sourcesStatus = {};
  const rateLimitedSources = [];
  const allRawJobs = [];

  for (const res of results) {
    if (res.rateLimited) {
      rateLimitedSources.push(res.source);
    }
    sourcesStatus[res.source] = {
      enabled: res.enabled,
      status: res.status,
      rawCount: res.count,
      ...(res.error ? { note: res.error } : {}),
    };
    console.log(
      `[${res.status.toUpperCase().padEnd(8)}] ${res.source.padEnd(22)} -> ${res.count} raw listings${res.error ? ` (${res.error})` : ''
      }`
    );
    allRawJobs.push(...res.jobs);
  }

  const requireGlassdoorForRemote =
    String(process.env.REQUIRE_GLASSDOOR_FOR_REMOTE ?? 'true').toLowerCase() !== 'false';

  const rawFilteredJobs = processJobs(allRawJobs, { includeRemoteIndia });
  await enrichJobsWithGlassdoor(rawFilteredJobs);

  const filteredJobs = filterUnverifiedRemoteJobs(rawFilteredJobs, {
    requireGlassdoorForRemote,
  });
  const droppedRemoteCount = rawFilteredJobs.length - filteredJobs.length;
  const vadodaraCount = filteredJobs.filter((j) => j.isVadodara).length;
  const remoteCount = filteredJobs.filter((j) => j.isRemote).length;
  console.log(
    `\nFiltered to ${filteredJobs.length} verified IT fresher listings (${vadodaraCount} Vadodara, ${remoteCount} Glassdoor-verified Remote${droppedRemoteCount > 0 ? `, dropped ${droppedRemoteCount} unverified/fake remote` : ''
    }).`
  );

  // Also clean any previously stored unverified remote jobs from existing store
  const existingStore = loadJobsStore();
  await enrichJobsWithGlassdoor(existingStore.jobs);
  existingStore.jobs = filterUnverifiedRemoteJobs(existingStore.jobs, {
    requireGlassdoorForRemote,
  });

  const { updatedStore, newJobs } = mergeJobsStore(existingStore, filteredJobs, {
    maxAgeDays,
    sourcesStatus,
  });

  // Live expiry check: verify application URLs and auto-remove any closed/expired jobs!
  const { kept: liveJobs, removed: expiredJobs } = await filterExpiredJobs(updatedStore.jobs);
  if (expiredJobs.length > 0) {
    console.log(`Removed ${expiredJobs.length} expired/closed job(s):`);
    for (const ex of expiredJobs) {
      console.log(`  x ${ex.job.title} (${ex.job.company}) — ${ex.reason}`);
    }
  }
  const liveIdSet = new Set(liveJobs.map((j) => j.id));
  updatedStore.jobs = liveJobs;
  updatedStore.meta.totalJobs = liveJobs.length;
  const liveNewJobs = newJobs.filter((j) => liveIdSet.has(j.id));
  updatedStore.meta.newInLastRun = liveNewJobs.length;

  console.log(`Total active open jobs on dashboard: ${updatedStore.jobs.length}`);
  console.log(`Brand-new open jobs discovered this run: ${liveNewJobs.length}`);

  if (isDryRun) {
    if (liveNewJobs.length > 0) {
      const preview = buildAlertEmail(liveNewJobs, process.env.DASHBOARD_URL || '');
      const previewPath = path.resolve(process.cwd(), 'preview-email.html');
      fs.writeFileSync(previewPath, preview.html, 'utf8');
      console.log(`Dry-run email preview written to: ${previewPath}`);
    }
    return { updatedStore, newJobs: liveNewJobs, mailSummary: null };
  }

  saveJobsStore(updatedStore);
  console.log('Saved updated jobs database to docs/data/jobs.json');

  let mailSummary = null;
  if (!skipEmail && liveNewJobs.length > 0) {
    const recipients = getActiveRecipients();
    mailSummary = await sendAlertsToSubscribers(liveNewJobs, recipients);
    if (mailSummary.sentCount > 0) {
      console.log(
        `Sent Gmail alerts to ${mailSummary.sentCount}/${recipients.length} subscribed user(s).`
      );
      for (const r of mailSummary.results) {
        console.log(
          `  -> ${r.recipient}: ${r.sent ? `sent (${r.count} job(s))` : `skipped (${r.reason})`}`
        );
      }
    } else {
      console.log(`Email alerts skipped: ${mailSummary.reason || 'No matching recipients'}`);
    }
  } else if (newJobs.length === 0) {
    console.log('No brand-new jobs since last check — no email sent.');
  }

  return { updatedStore, newJobs: liveNewJobs, mailSummary, rateLimitedSources };
}

// Run directly when executed from CLI (`npm run fetch`)
const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  const args = new Set(process.argv.slice(2));
  const isDryRun = args.has('--dry-run');
  const skipEmail = args.has('--no-email') || isDryRun;

  runJobFetch({ isDryRun, skipEmail }).catch((err) => {
    console.error('Fatal error in Rat Racer BDQ run:', err);
    process.exit(1);
  });
}
