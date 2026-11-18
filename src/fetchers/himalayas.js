import { HTTP_HEADERS } from '../config.js';

/**
 * Fetches India / Worldwide-eligible remote IT jobs from Himalayas' free public JSON API.
 * No API key required.
 */
export async function fetchHimalayasJobs({ includeRemoteIndia = true } = {}) {
  if (!includeRemoteIndia) {
    return {
      source: 'Himalayas',
      enabled: false,
      status: 'skipped',
      rateLimited: false,
      count: 0,
      error: 'Remote fetching disabled',
      jobs: [],
    };
  }

  const jobs = [];
  let succeeded = 0;
  let lastError = null;

  for (const offset of [0, 50]) {
    const url = `https://himalayas.app/jobs/api?limit=50&offset=${offset}`;
    try {
      const res = await fetch(url, {
        headers: { ...HTTP_HEADERS, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }

      const data = await res.json();
      succeeded++;

      for (const item of data.jobs || []) {
        const restrictions = Array.isArray(item.locationRestrictions)
          ? item.locationRestrictions
          : [];
        const locString = restrictions.join(', ');
        const locLower = locString.toLowerCase();

        // Keep worldwide (no restriction) or India/APAC/Asia eligible remote jobs
        const eligible =
          restrictions.length === 0 ||
          locLower.includes('worldwide') ||
          locLower.includes('anywhere') ||
          locLower.includes('india') ||
          locLower.includes('apac') ||
          locLower.includes('asia');

        if (!eligible) continue;

        const seniority = Array.isArray(item.seniority) ? item.seniority.join(', ') : '';
        // Skip explicitly Senior/Executive/Lead seniority
        if (/\b(senior|lead|principal|staff|director|executive|manager)\b/i.test(seniority)) {
          continue;
        }

        const applyUrl = item.applicationLink || item.guid || '';
        if (!item.title || !applyUrl) continue;

        const salary =
          item.minSalary && item.maxSalary
            ? `${item.currency || 'USD'} ${Number(item.minSalary).toLocaleString()} - ${Number(item.maxSalary).toLocaleString()}`
            : '';

        jobs.push({
          title: item.title,
          company: item.companyName || 'Remote Company',
          location: restrictions.length ? `Remote (${locString})` : 'Remote (Worldwide)',
          salary,
          experience: seniority || 'Entry / Mid Level',
          description: item.excerpt || '',
          applyUrl,
          postedDate: item.pubDate ? new Date(item.pubDate * 1000).toISOString().slice(0, 10) : null,
          source: 'Himalayas',
        });
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  return {
    source: 'Himalayas',
    enabled: true,
    status: succeeded > 0 ? 'ok' : 'warning',
    rateLimited: false,
    count: jobs.length,
    error: succeeded === 0 ? lastError : null,
    jobs,
  };
}
