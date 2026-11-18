import { HTTP_HEADERS } from '../config.js';

/**
 * Fetches Worldwide / APAC / India-eligible remote IT jobs from Jobicy's free public JSON API.
 * No API key required.
 */
export async function fetchJobicyJobs({ includeRemoteIndia = true } = {}) {
  if (!includeRemoteIndia) {
    return {
      source: 'Jobicy',
      enabled: false,
      status: 'skipped',
      rateLimited: false,
      count: 0,
      error: 'Remote fetching disabled',
      jobs: [],
    };
  }

  const urls = [
    'https://jobicy.com/api/v2/remote-jobs?count=50&geo=apac',
    'https://jobicy.com/api/v2/remote-jobs?count=50&geo=anywhere',
  ];

  const jobs = [];
  let succeeded = 0;
  let lastError = null;

  for (const url of urls) {
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
        const geo = (item.jobGeo || 'Anywhere').trim();
        const geoLower = geo.toLowerCase();
        const eligible =
          geoLower.includes('anywhere') ||
          geoLower.includes('worldwide') ||
          geoLower.includes('india') ||
          geoLower.includes('apac') ||
          geoLower.includes('asia');

        if (!eligible) continue;

        const level = String(item.jobLevel || '');
        if (/\b(senior|director|vp|executive|lead)\b/i.test(level)) continue;

        const salary =
          item.annualSalaryMin && item.annualSalaryMax
            ? `${item.salaryCurrency || 'USD'} ${Number(item.annualSalaryMin).toLocaleString()} - ${Number(item.annualSalaryMax).toLocaleString()}`
            : '';

        jobs.push({
          title: item.jobTitle,
          company: item.companyName || 'Remote Company',
          location: `Remote (${geo})`,
          salary,
          experience: level || 'Entry Level / Junior',
          description: item.jobExcerpt || '',
          applyUrl: item.url,
          postedDate: item.pubDate ? String(item.pubDate).slice(0, 10) : null,
          source: 'Jobicy',
        });
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  return {
    source: 'Jobicy',
    enabled: true,
    status: succeeded > 0 ? 'ok' : 'warning',
    rateLimited: false,
    count: jobs.length,
    error: succeeded === 0 ? lastError : null,
    jobs,
  };
}
