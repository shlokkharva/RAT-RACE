/**
 * Fetches Vadodara IT fresher jobs from Jooble API (free API key).
 * Requires JOOBLE_API_KEY env var.
 */

const JOOBLE_KEYWORDS = [
  'Data Analyst fresher',
  'UI UX Designer fresher',
  'MERN Stack Full Stack fresher',
  'Python Developer fresher',
];

export async function fetchJoobleJobs() {
  const apiKey = process.env.JOOBLE_API_KEY?.trim();

  if (!apiKey) {
    return {
      source: 'Jooble',
      enabled: false,
      status: 'skipped',
      count: 0,
      error: 'Optional: set JOOBLE_API_KEY to enable',
      jobs: [],
    };
  }

  const jobs = [];
  let succeeded = 0;
  let lastError = null;

  for (const keywords of JOOBLE_KEYWORDS) {
    try {
      const res = await fetch(`https://jooble.org/api/${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keywords,
          location: 'Vadodara',
          page: '1',
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }

      const data = await res.json();
      succeeded++;

      for (const item of data.jobs || []) {
        jobs.push({
          title: item.title,
          company: item.company || 'Listed on Jooble',
          location: item.location || 'Vadodara, Gujarat',
          salary: item.salary || '',
          experience: '',
          description: item.snippet || '',
          applyUrl: item.link,
          postedDate: item.updated ? String(item.updated).slice(0, 10) : null,
          source: item.source ? `Jooble (${item.source})` : 'Jooble',
        });
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  return {
    source: 'Jooble',
    enabled: true,
    status: succeeded > 0 ? 'ok' : 'error',
    count: jobs.length,
    error: succeeded === 0 ? lastError : null,
    jobs,
  };
}
