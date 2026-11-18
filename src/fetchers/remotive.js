import { HTTP_HEADERS } from '../config.js';

/**
 * Fetches Worldwide / India-eligible remote IT jobs from Remotive's free public API.
 * No API key required. Filters to recent software, data, and design openings.
 */
export async function fetchRemotiveJobs({ includeRemoteIndia = true } = {}) {
  if (!includeRemoteIndia) {
    return {
      source: 'Remotive (Remote)',
      enabled: false,
      status: 'skipped',
      count: 0,
      error: 'Remote fetching disabled via INCLUDE_REMOTE_INDIA=false',
      jobs: [],
    };
  }

  const jobs = [];
  const categories = ['software-dev', 'data', 'design'];
  let succeeded = 0;
  let lastError = null;

  for (const category of categories) {
    const url = `https://remotive.com/api/remote-jobs?category=${category}&limit=30`;
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
        const region = (item.candidate_required_location || 'Worldwide').trim();
        const regionLower = region.toLowerCase();
        // Keep only Worldwide / Anywhere / India / APAC / Remote listings
        const indiaEligible =
          regionLower.includes('worldwide') ||
          regionLower.includes('anywhere') ||
          regionLower.includes('india') ||
          regionLower.includes('apac') ||
          regionLower.includes('asia') ||
          regionLower === '' ||
          regionLower === 'remote';

        if (!indiaEligible) continue;

        jobs.push({
          title: item.title,
          company: item.company_name || 'Remote Company',
          location: `Remote (${region})`,
          salary: item.salary || '',
          experience: item.job_type === 'internship' ? 'Internship' : '',
          description: item.description || '',
          applyUrl: item.url,
          postedDate: item.publication_date ? String(item.publication_date).slice(0, 10) : null,
          source: 'Remotive',
        });
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  return {
    source: 'Remotive (Remote)',
    enabled: true,
    status: succeeded > 0 ? 'ok' : 'warning',
    count: jobs.length,
    error: succeeded === 0 ? lastError : null,
    jobs,
  };
}
