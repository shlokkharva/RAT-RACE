import { HTTP_HEADERS } from '../config.js';

const ADZUNA_QUERIES = [
  'data analyst',
  'ui ux designer',
  'mern stack developer',
  'full stack developer',
  'python developer',
];

/**
 * Fetches Vadodara IT fresher jobs from Adzuna India API (free tier: 250 calls/day).
 * Requires ADZUNA_APP_ID and ADZUNA_APP_KEY env vars.
 */
export async function fetchAdzunaJobs() {
  const appId = process.env.ADZUNA_APP_ID?.trim();
  const appKey = process.env.ADZUNA_APP_KEY?.trim();

  if (!appId || !appKey) {
    return {
      source: 'Adzuna',
      enabled: false,
      status: 'skipped',
      count: 0,
      error: 'Optional: set ADZUNA_APP_ID and ADZUNA_APP_KEY to enable',
      jobs: [],
    };
  }

  const jobs = [];
  let succeeded = 0;
  let lastError = null;

  for (const what of ADZUNA_QUERIES) {
    const params = new URLSearchParams({
      app_id: appId,
      app_key: appKey,
      results_per_page: '20',
      what,
      where: 'Vadodara',
      sort_by: 'date',
      max_days_old: '14',
    });

    const url = `https://api.adzuna.com/v1/api/jobs/in/search/1?${params.toString()}`;

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

      for (const item of data.results || []) {
        const salary =
          item.salary_min || item.salary_max
            ? `₹${Math.round(item.salary_min || item.salary_max).toLocaleString('en-IN')}`
            : '';

        jobs.push({
          title: item.title,
          company: item.company?.display_name || 'Listed on Adzuna',
          location: item.location?.display_name || 'Vadodara, Gujarat',
          salary,
          experience: '',
          description: item.description || '',
          applyUrl: item.redirect_url,
          postedDate: item.created ? item.created.slice(0, 10) : null,
          source: 'Adzuna',
        });
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  return {
    source: 'Adzuna',
    enabled: true,
    status: succeeded > 0 ? 'ok' : 'error',
    count: jobs.length,
    error: succeeded === 0 ? lastError : null,
    jobs,
  };
}
