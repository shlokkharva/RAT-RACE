/**
 * Fetches Vadodara & Remote India IT fresher jobs from JSearch v2 (Google Jobs aggregator via RapidAPI).
 * Google Jobs aggregates Naukri, Indeed, Shine, Glassdoor, Jooble, Foundit, LinkedIn & direct career pages.
 * Requires RAPIDAPI_KEY env var (free tier available on RapidAPI).
 */

const JSEARCH_QUERIES = [
  'Numerator Data Associate OR Data Analyst OR fresher in Vadodara',
  'fresher software developer OR python OR full stack in Vadodara',
  'IT internship OR trainee OR junior data analyst OR UI UX in Vadodara',
  'remote fresher OR intern python OR MERN OR data analyst OR UI UX India',
];

let lastJSearchRunMs = 0;

export async function fetchJSearchJobs({ includeRemoteIndia = true, force = false } = {}) {
  const apiKey = process.env.RAPIDAPI_KEY?.trim();

  if (!apiKey) {
    return {
      source: 'Google Jobs (JSearch)',
      enabled: false,
      status: 'skipped',
      rateLimited: false,
      count: 0,
      error: 'Optional: set RAPIDAPI_KEY to enable Google Jobs (Naukri/Indeed/Shine/Glassdoor)',
      jobs: [],
    };
  }

  // Protect RapidAPI monthly free quota during 60-second background loops
  const minIntervalMins = Number(process.env.JSEARCH_MIN_INTERVAL_MINUTES ?? 360);
  if (!force && lastJSearchRunMs > 0 && minIntervalMins > 0) {
    const elapsedMs = Date.now() - lastJSearchRunMs;
    if (elapsedMs < minIntervalMins * 60 * 1000) {
      return {
        source: 'Google Jobs (JSearch)',
        enabled: true,
        status: 'cached',
        rateLimited: false,
        count: 0,
        error: `Quota guard active (refreshes every ${minIntervalMins}m)`,
        jobs: [],
      };
    }
  }

  const queries = includeRemoteIndia ? JSEARCH_QUERIES : JSEARCH_QUERIES.slice(0, 3);
  const jobs = [];
  let succeeded = 0;
  let rateLimited = false;
  let lastError = null;

  for (const query of queries) {
    const params = new URLSearchParams({
      query,
      date_posted: 'month',
      country: 'in',
    });

    const url = `https://jsearch.p.rapidapi.com/search-v2?${params.toString()}`;

    try {
      const res = await fetch(url, {
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 429) {
        rateLimited = true;
        lastError = 'HTTP 429 (RapidAPI rate limit reached)';
        break;
      }

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }

      const payload = await res.json();
      const items = Array.isArray(payload?.data?.jobs)
        ? payload.data.jobs
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
      succeeded++;

      for (const item of items) {
        const isRemote = Boolean(item.job_is_remote);
        const city = item.job_location || [item.job_city, item.job_state].filter(Boolean).join(', ');
        const location = isRemote
          ? city && !/remote/i.test(city)
            ? `Remote (${city})`
            : city || 'Remote (India)'
          : city || 'Vadodara, Gujarat';

        // Extract employer Glassdoor review info if provided by JSearch
        const reviews = Array.isArray(item.employer_reviews) ? item.employer_reviews : [];
        const gdReview = reviews.find((r) => /glassdoor/i.test(r.publisher || ''));

        // Prefer recognized Indian board names (Naukri, Indeed, Glassdoor, Shine, LinkedIn) from publisher or apply_options
        let publisher = item.job_publisher ? String(item.job_publisher).trim() : 'Google Jobs';
        let applyUrl = item.job_apply_link || item.job_google_link || '';

        if (Array.isArray(item.apply_options) && item.apply_options.length > 0) {
          const preferred = item.apply_options.find((opt) =>
            /naukri|indeed|glassdoor|shine|foundit|linkedin/i.test(opt.publisher || '')
          );
          if (preferred && preferred.apply_link) {
            applyUrl = preferred.apply_link;
            publisher = preferred.publisher;
          }
        }

        const salary =
          item.job_salary_string ||
          item.job_salary ||
          (item.job_min_salary && item.job_max_salary
            ? `${item.job_salary_currency || 'INR'} ${item.job_min_salary}-${item.job_max_salary}`
            : '');

        jobs.push({
          title: item.job_title,
          company: item.employer_name || 'Listed on Google Jobs',
          employerWebsite: item.employer_website || '',
          location,
          salary,
          experience: item.job_employment_type || '',
          description: item.job_description || '',
          applyUrl,
          postedDate: item.job_posted_at_datetime_utc
            ? item.job_posted_at_datetime_utc.slice(0, 10)
            : null,
          source: publisher,
          glassdoor: gdReview
            ? {
                rating: gdReview.score ? Number(gdReview.score) : null,
                reviewCount: gdReview.num_reviews || null,
                url: gdReview.reviews_link || null,
              }
            : undefined,
        });
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  if (succeeded > 0) {
    lastJSearchRunMs = Date.now();
  }

  return {
    source: 'Google Jobs (JSearch)',
    enabled: true,
    status: succeeded > 0 ? 'ok' : 'error',
    rateLimited,
    count: jobs.length,
    error: succeeded === 0 ? lastError : null,
    jobs,
  };
}
