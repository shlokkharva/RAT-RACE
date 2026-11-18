import * as cheerio from 'cheerio';
import { HTTP_HEADERS } from '../config.js';

const VADODARA_URLS = [
  {
    url: 'https://internshala.com/jobs/web-development,full-stack-development,python-django,data-analytics,ui-ux-design-jobs-in-vadodara/',
    isInternshipUrl: false,
    isRemoteUrl: false,
  },
  {
    url: 'https://internshala.com/internships/web-development,full-stack-development,python-django,data-analytics,ui-ux-design-internship-in-vadodara/',
    isInternshipUrl: true,
    isRemoteUrl: false,
  },
];

const REMOTE_URLS = [
  {
    url: 'https://internshala.com/jobs/work-from-home/web-development,full-stack-development,python-django,data-analytics,ui-ux-design-jobs/',
    isInternshipUrl: false,
    isRemoteUrl: true,
  },
  {
    url: 'https://internshala.com/internships/work-from-home-web-development,full-stack-development,python-django,data-analytics,ui-ux-design-internships/',
    isInternshipUrl: true,
    isRemoteUrl: true,
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches STRICTLY FRESHER (0 years) jobs and internships in Vadodara & Work From Home
 * from Internshala public listings.
 */
export async function fetchInternshalaJobs({ includeRemoteIndia = true } = {}) {
  const targets = includeRemoteIndia ? [...VADODARA_URLS, ...REMOTE_URLS] : VADODARA_URLS;
  const jobs = [];
  let succeeded = 0;
  let rateLimited = false;
  let lastError = null;

  for (const target of targets) {
    try {
      const res = await fetch(target.url, {
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
        await sleep(800);
        continue;
      }

      const html = await res.text();
      const $ = cheerio.load(html);
      succeeded++;

      $('.individual_internship').each((_, el) => {
        const card = $(el);
        const titleEl = card
          .find('.job-internship-name a, .profile a, h3.job-internship-name a')
          .first();
        const title = titleEl.text().trim() || card.find('h3').first().text().trim();
        const href = titleEl.attr('href') || card.attr('data-href') || '';
        const company = card
          .find('.company-name, .company_name, p.company-name')
          .first()
          .text()
          .replace(/\bactively hiring\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        const rawLoc = card
          .find('.locations span, .location_link, #location_names')
          .first()
          .text()
          .trim();
        const location = target.isRemoteUrl
          ? rawLoc && /work from home|remote/i.test(rawLoc)
            ? 'Remote (Work From Home)'
            : rawLoc
              ? `Remote (${rawLoc})`
              : 'Remote (Work From Home)'
          : rawLoc || 'Vadodara';
        const salary = card.find('.stipend, .salary').first().text().trim();

        const rawExpText = card
          .find('.item_body, .row-1-item')
          .filter((_, item) => /year|fresher|month/i.test($(item).text()))
          .map((_, item) => $(item).text().trim())
          .get()
          .find((txt) => /year|fresher/i.test(txt));

        // Strict freshers-only: on job listings, drop roles requiring 1+ / 2+ years minimum experience
        if (!target.isInternshipUrl && rawExpText) {
          if (/\b[1-9]\s*(?:year|yr)/i.test(rawExpText) && !/\b0\b/.test(rawExpText)) {
            return;
          }
        }

        const experience = target.isInternshipUrl
          ? 'Internship'
          : rawExpText
            ? rawExpText
            : 'Fresher (0 yrs)';

        const verifiedFresher =
          target.isInternshipUrl || !rawExpText || /\b(0|fresher)\b/i.test(rawExpText);

        if (title && href) {
          const applyUrl = href.startsWith('http') ? href : `https://internshala.com${href}`;
          jobs.push({
            title,
            company: company || 'Company on Internshala',
            location,
            salary,
            experience,
            verifiedFresher,
            description: '',
            applyUrl,
            postedDate: new Date().toISOString().slice(0, 10),
            source: 'Internshala',
          });
        }
      });
    } catch (err) {
      lastError = err.message;
    }

    await sleep(800);
  }

  return {
    source: 'Internshala',
    enabled: true,
    status: succeeded > 0 ? 'ok' : 'warning',
    rateLimited,
    count: jobs.length,
    error:
      succeeded === 0 ? lastError : rateLimited ? 'Partial rate limit — cooling down' : null,
    jobs,
  };
}
