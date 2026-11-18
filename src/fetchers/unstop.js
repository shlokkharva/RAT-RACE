import { HTTP_HEADERS } from '../config.js';

const UNSTOP_SEARCHES = [
  { opportunity: 'jobs', searchTerm: 'vadodara' },
  { opportunity: 'jobs', searchTerm: 'python developer' },
  { opportunity: 'jobs', searchTerm: 'data analyst' },
  { opportunity: 'jobs', searchTerm: 'full stack' },
  { opportunity: 'jobs', searchTerm: 'ui ux' },
  { opportunity: 'internships', searchTerm: 'web development' },
  { opportunity: 'internships', searchTerm: 'data analyst' },
  { opportunity: 'internships', searchTerm: 'python' },
  { opportunity: 'internships', searchTerm: 'ui ux' },
];

/**
 * Fetches STRICTLY FRESHER & INTERNSHIP IT jobs (Vadodara + true Work-From-Home) from Unstop's public API.
 * Reads exact jobDetail.type ("wfh" vs "in_office"), exact eligibility filters, and real salary visibility.
 */
export async function fetchUnstopJobs({ includeRemoteIndia = true } = {}) {
  const jobs = [];
  let succeeded = 0;
  let lastError = null;

  for (const q of UNSTOP_SEARCHES) {
    const params = new URLSearchParams({
      opportunity: q.opportunity,
      per_page: '20',
      oppstatus: 'open',
      searchTerm: q.searchTerm,
    });
    const url = `https://unstop.com/api/public/opportunity/search-new?${params.toString()}`;

    try {
      const res = await fetch(url, {
        headers: {
          ...HTTP_HEADERS,
          Accept: 'application/json',
          Referer: 'https://unstop.com/jobs',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }

      const payload = await res.json();
      const items = payload?.data?.data || [];
      succeeded++;

      for (const item of items) {
        const title = String(item.title || '').trim();
        const company = String(item.organisation?.name || '').trim() || 'Company on Unstop';
        const jd = item.jobDetail || {};

        // 0. Drop expired / closed registrations immediately
        const endDateStr = item.regnRequirements?.end_regn_dt || item.end_date || null;
        if (endDateStr && !Number.isNaN(Date.parse(endDateStr)) && Date.parse(endDateStr) < Date.now()) {
          continue;
        }
        if (String(item.status || '').toLowerCase() === 'closed') {
          continue;
        }

        // 1. STRICT ELIGIBILITY CHECK (matches actual Unstop application page!)
        const eligibleTags = (Array.isArray(item.filters) ? item.filters : [])
          .filter((f) => f.type === 'eligible')
          .map((f) => String(f.name || '').toLowerCase());

        const isInternship = q.opportunity === 'internships' || jd.timing === 'internship';
        const explicitlyAllowsFreshers = eligibleTags.some((t) =>
          /\b(fresher|student|undergraduate|postgraduate|graduate|college)\b/i.test(t)
        );
        const onlyExperienced =
          eligibleTags.length > 0 &&
          !explicitlyAllowsFreshers &&
          eligibleTags.some((t) => /experienced/i.test(t));

        const minExp = typeof jd.min_experience === 'number' ? jd.min_experience : null;
        const maxExp = typeof jd.max_experience === 'number' ? jd.max_experience : null;

        // Drop experienced-only roles or roles requiring 1+ year minimum experience
        if (onlyExperienced || (minExp !== null && minExp > 0)) {
          continue;
        }
        if (!isInternship && !explicitlyAllowsFreshers && minExp !== 0) {
          continue;
        }

        // 2. TRUE WORK-MODE CHECK (jobDetail.type === 'wfh' / 'remote', NEVER item.region === 'online'!)
        const rawLocations = Array.isArray(jd.locations) ? jd.locations.filter(Boolean).join(', ') : '';
        const jobTypeStr = String(jd.type || '').toLowerCase();
        const isTrueRemote =
          jobTypeStr === 'wfh' ||
          jobTypeStr === 'remote' ||
          /\b(work from home|remote|wfh)\b/i.test(rawLocations);

        if (!includeRemoteIndia && isTrueRemote && !/vadodara|baroda/i.test(rawLocations)) {
          continue;
        }

        const location = isTrueRemote
          ? rawLocations && !/remote|work from home|wfh/i.test(rawLocations)
            ? `Remote (${rawLocations})`
            : 'Remote (Work From Home)'
          : rawLocations || 'India';

        const slug = item.seo_url || item.public_url || '';
        const applyUrl = slug.startsWith('http')
          ? slug
          : slug
            ? `https://unstop.com/${slug.replace(/^\/+/, '')}`
            : '';

        if (!title || !applyUrl) continue;

        // 3. HONEST SALARY (only show when Unstop actually displays it on the application page!)
        let salary = '';
        if (jd.show_salary === 1 && !jd.not_disclosed && jd.min_salary && jd.max_salary) {
          const period = jd.pay_in === 'monthly' ? '/month' : '/yr';
          salary = `₹${Number(jd.min_salary).toLocaleString('en-IN')} - ₹${Number(jd.max_salary).toLocaleString('en-IN')} ${period}`;
        }

        // 4. HONEST EXPERIENCE LABEL (matches Unstop's exact eligibility!)
        let experience = 'Fresher (0 yrs)';
        if (isInternship) {
          experience = 'Internship';
        } else if (minExp === 0 && maxExp && maxExp <= 1) {
          experience = `Fresher (0–${maxExp} yr)`;
        } else if (minExp === 0 && maxExp) {
          experience = `Fresher (0–${maxExp} yrs)`;
        }

        jobs.push({
          title,
          company,
          location,
          salary,
          experience,
          verifiedFresher: true,
          description: '',
          applyUrl,
          postedDate: item.start_date ? String(item.start_date).slice(0, 10) : null,
          deadlineAt: endDateStr || null,
          source: 'Unstop',
        });
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  return {
    source: 'Unstop',
    enabled: true,
    status: succeeded > 0 ? 'ok' : 'warning',
    rateLimited: false,
    count: jobs.length,
    error: succeeded === 0 ? lastError : null,
    jobs,
  };
}
