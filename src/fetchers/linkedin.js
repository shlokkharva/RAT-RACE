import * as cheerio from 'cheerio';
import { HTTP_HEADERS } from '../config.js';

const LINKEDIN_QUERIES = [
  'Numerator Data Associate fresher',
  'Data Analyst fresher',
  'UI UX Designer fresher',
  'MERN Stack Developer fresher',
  'Full Stack Developer fresher',
  'Python Developer fresher',
  'Software Developer Intern',
];

const LINKEDIN_REMOTE_QUERIES = [
  'Data Analyst Intern fresher',
  'UI UX Designer Intern fresher',
  'MERN Stack Intern fresher',
  'Full Stack Developer Intern fresher',
  'Python Developer Intern fresher',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractLinkedInJobId(url = '') {
  const m = String(url).match(/-(\d{7,})\/?(?:\?|$)/) || String(url).match(/\/view\/(\d{7,})/);
  return m ? m[1] : null;
}

/**
 * Fetches the actual LinkedIn public job detail page to verify exact Seniority Level and description
 * so card info matches the real application page and experienced roles are filtered out.
 */
async function fetchLinkedInJobDetail(jobId) {
  if (!jobId) return null;
  try {
    const res = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`, {
      headers: HTTP_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 429) return { rateLimited: true };
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);
    let seniority = '';
    $('.description__job-criteria-item').each((_, el) => {
      const label = $(el).find('h3').text().trim().toLowerCase();
      const val = $(el).find('span').text().trim();
      if (label.includes('seniority')) seniority = val;
    });
    const description = $('.show-more-less-html__markup').text().replace(/\s+/g, ' ').trim();
    return { seniority, description, rateLimited: false };
  } catch {
    return null;
  }
}

async function runSearchBatch(queries, { location, isRemoteQuery = false }) {
  const jobs = [];
  let succeeded = 0;
  let rateLimited = false;
  let lastError = null;

  for (const keywords of queries) {
    const params = new URLSearchParams({
      keywords,
      location,
      f_E: '1,2', // Internship (1) & Entry level (2)
      f_TPR: 'r604800', // Past 7 days
      sortBy: 'DD',
      start: '0',
    });

    if (isRemoteQuery) {
      params.set('f_WT', '2'); // LinkedIn Remote work-type filter
    }

    const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params.toString()}`;

    try {
      const res = await fetch(url, {
        headers: HTTP_HEADERS,
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 429) {
        rateLimited = true;
        lastError = 'HTTP 429 (rate limited — cooling down)';
        break;
      }

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        await sleep(1100);
        continue;
      }

      const html = await res.text();
      const $ = cheerio.load(html);
      succeeded++;

      $('li').each((_, el) => {
        const card = $(el);
        const title = card.find('.base-search-card__title').text().trim();
        const company = card.find('.base-search-card__subtitle').text().trim();
        const rawLoc = card.find('.job-search-card__location').text().trim();
        const link =
          card.find('a.base-card__full-link').attr('href') ||
          card.find('a.base-search-card--link').attr('href') ||
          '';
        const postedDate =
          card.find('time').attr('datetime') || card.find('time').text().trim() || null;

        if (title && link) {
          const cleanLink = link.split('?')[0];
          jobs.push({
            title,
            company: company || 'Listed on LinkedIn',
            location: rawLoc || (isRemoteQuery ? 'India' : 'Vadodara, Gujarat, India'),
            _fromRemoteQuery: isRemoteQuery,
            experience: '',
            description: '',
            applyUrl: cleanLink,
            postedDate,
            source: 'LinkedIn',
          });
        }
      });
    } catch (err) {
      lastError = err.message;
    }

    await sleep(800);
  }

  return { jobs, succeeded, rateLimited, lastError };
}

/**
 * Fetches public Internship & Fresher IT jobs in Vadodara AND Remote India from LinkedIn,
 * verifying real seniority & job description so experience matches the application page.
 */
export async function fetchLinkedInJobs({ includeRemoteIndia = true } = {}) {
  const vadodaraRes = await runSearchBatch(LINKEDIN_QUERIES, {
    location: 'Vadodara, Gujarat, India',
    isRemoteQuery: false,
  });

  let remoteRes = { jobs: [], succeeded: 0, rateLimited: false, lastError: null };
  if (includeRemoteIndia && !vadodaraRes.rateLimited) {
    remoteRes = await runSearchBatch(LINKEDIN_REMOTE_QUERIES, {
      location: 'India',
      isRemoteQuery: true,
    });
  }

  // Deduplicate candidate URLs before inspecting real details
  const uniqueByUrl = new Map();
  for (const j of [...vadodaraRes.jobs, ...remoteRes.jobs]) {
    if (!uniqueByUrl.has(j.applyUrl)) uniqueByUrl.set(j.applyUrl, j);
  }

  const verifiedJobs = [];
  let detailRateLimited = vadodaraRes.rateLimited || remoteRes.rateLimited;
  let detailsChecked = 0;
  const MAX_DETAIL_LOOKUPS = 18;

  for (const job of uniqueByUrl.values()) {
    const titleHasExplicitFresher =
      /\b(fresher|freshers|intern|internship|trainee|junior|jr\.?|graduate|campus|0\s*-\s*1)\b/i.test(
        job.title
      );

    // Fetch real LinkedIn job detail page to verify actual seniority & experience text
    if (!detailRateLimited && detailsChecked < MAX_DETAIL_LOOKUPS) {
      detailsChecked++;
      const detail = await fetchLinkedInJobDetail(extractLinkedInJobId(job.applyUrl));
      if (detail?.rateLimited) {
        detailRateLimited = true;
      } else if (detail) {
        const seniorityLower = (detail.seniority || '').toLowerCase();
        // Reject Mid-Senior / Director / Executive / Associate roles unless explicitly Intern/Fresher
        if (
          /mid-senior|director|executive/i.test(seniorityLower) ||
          (/associate/i.test(seniorityLower) && !titleHasExplicitFresher)
        ) {
          continue;
        }
        job.description = detail.description || '';
        job.experience =
          detail.seniority || (titleHasExplicitFresher ? 'Internship / Fresher' : 'Entry level');
        job.verifiedFresher =
          /intern|entry level/i.test(seniorityLower) || titleHasExplicitFresher;

        // Only label a LinkedIn remote-query job as Remote if the real JD confirms Remote/WFH and NOT WFO/On-site
        if (job._fromRemoteQuery) {
          const descLower = job.description.toLowerCase();
          const explicitlyRemoteInJd = /\b(remote|work from home|wfh|fully remote|100% remote)\b/i.test(
            `${job.title} ${job.location} ${descLower}`
          );
          const saysWfoOrOnsite =
            /\b(wfo|work from office|working from office|on[-\s]?site|in[-\s]?office|in[-\s]?person|hybrid)\b/i.test(
              descLower
            );
          if (saysWfoOrOnsite || !explicitlyRemoteInJd) {
            // Keep honest city location (will be dropped unless it's Vadodara)
            delete job._fromRemoteQuery;
          } else {
            job.location = /remote/i.test(job.location) ? job.location : 'Remote (India)';
            delete job._fromRemoteQuery;
          }
        } else {
          delete job._fromRemoteQuery;
        }

        verifiedJobs.push(job);
        await sleep(350);
        continue;
      }
    }

    // Fallback when detail lookup is skipped/rate-limited:
    // NEVER falsely label a non-remote city as Remote; keep exact location from card!
    delete job._fromRemoteQuery;
    if (titleHasExplicitFresher) {
      const isIntern = /\b(intern|internship|trainee)\b/i.test(job.title);
      job.experience = isIntern ? 'Internship / Trainee' : 'Fresher / Junior';
      job.verifiedFresher = true;
      verifiedJobs.push(job);
    }
  }

  const totalSucceeded = vadodaraRes.succeeded + remoteRes.succeeded;

  return {
    source: 'LinkedIn',
    enabled: true,
    status: totalSucceeded > 0 ? 'ok' : 'warning',
    rateLimited: detailRateLimited,
    count: verifiedJobs.length,
    error:
      totalSucceeded === 0
        ? vadodaraRes.lastError || remoteRes.lastError
        : detailRateLimited
          ? 'Partial rate limit — cooling down'
          : null,
    jobs: verifiedJobs,
  };
}
