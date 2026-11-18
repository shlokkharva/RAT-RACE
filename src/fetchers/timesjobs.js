import * as cheerio from 'cheerio';
import { HTTP_HEADERS } from '../config.js';

const TIMESJOBS_QUERIES = [
  { keywords: 'data analyst', location: 'Vadodara' },
  { keywords: 'ui ux designer', location: 'Vadodara' },
  { keywords: 'mern stack full stack', location: 'Vadodara' },
  { keywords: 'python developer', location: 'Vadodara' },
  { keywords: 'python developer fresher', location: 'Work From Home' },
  { keywords: 'data analyst fresher', location: 'Work From Home' },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches Vadodara & Work-From-Home fresher IT jobs from TimesJobs public listings.
 * No API key required.
 */
export async function fetchTimesJobs({ includeRemoteIndia = true } = {}) {
  const queries = includeRemoteIndia
    ? TIMESJOBS_QUERIES
    : TIMESJOBS_QUERIES.filter((q) => q.location === 'Vadodara');

  const jobs = [];
  let succeeded = 0;
  let rateLimited = false;
  let lastError = null;

  for (const q of queries) {
    const params = new URLSearchParams({
      searchType: 'personalizedSearch',
      from: 'submit',
      txtKeywords: q.keywords,
      txtLocation: q.location,
      cboWorkExp1: '0',
    });
    const url = `https://www.timesjobs.com/candidate/job-search.html?${params.toString()}`;

    try {
      const res = await fetch(url, {
        headers: HTTP_HEADERS,
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 429) {
        rateLimited = true;
        lastError = 'HTTP 429';
        break;
      }

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }

      const html = await res.text();
      const $ = cheerio.load(html);
      succeeded++;

      $('li.clearfix.job-bx').each((_, el) => {
        const card = $(el);
        const titleEl = card.find('h2 a').first();
        const title = titleEl.text().trim();
        const applyUrl = titleEl.attr('href') || '';
        const company = card.find('h3.joblist-comp-name').first().text().trim();
        const expText = card.find('.top-jd-dtl li').first().text().replace(/card_travel/gi, '').trim();
        const locText = card.find('.top-jd-dtl li span').last().text().trim() || q.location;
        const skills = card.find('.srp-skills').text().trim();

        if (title && applyUrl) {
          jobs.push({
            title,
            company: company || 'Company on TimesJobs',
            location:
              q.location === 'Work From Home' && !/remote|work from home/i.test(locText)
                ? `Remote (${locText})`
                : locText,
            experience: expText || '0–2 yrs',
            description: skills,
            applyUrl,
            postedDate: new Date().toISOString().slice(0, 10),
            source: 'TimesJobs',
          });
        }
      });
    } catch (err) {
      lastError = err.message;
    }

    await sleep(600);
  }

  return {
    source: 'TimesJobs',
    enabled: true,
    status: succeeded > 0 ? 'ok' : 'warning',
    rateLimited,
    count: jobs.length,
    error: succeeded === 0 ? lastError : null,
    jobs,
  };
}
