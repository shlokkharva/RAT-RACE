import * as cheerio from 'cheerio';
import { HTTP_HEADERS } from '../config.js';
import { isExpiredPageText } from '../utils/validator.js';

/**
 * Workday Public JSON Career APIs for major tech/engineering employers with Vadodara offices.
 */
const WORKDAY_VADODARA_COMPANIES = [
  {
    company: 'ABB',
    apiUrl: 'https://abb.wd3.myworkdayjobs.com/wday/cxs/abb/External_Career_Page/jobs',
    portalBase: 'https://abb.wd3.myworkdayjobs.com/en-US/External_Career_Page',
  },
  {
    company: 'Mastercard',
    apiUrl: 'https://mastercard.wd1.myworkdayjobs.com/wday/cxs/mastercard/CorporateCareers/jobs',
    portalBase: 'https://mastercard.wd1.myworkdayjobs.com/en-US/CorporateCareers',
  },
];

/**
 * SmartRecruiters Public JSON APIs for major Vadodara IT / Analytics employers.
 */
const SMARTRECRUITERS_VADODARA_COMPANIES = [
  {
    company: 'NielsenIQ',
    slug: 'NielsenIQ',
  },
  {
    company: 'Maskoid Technologies',
    slug: 'maskoidtechnologies',
  },
];

/**
 * Verified Live Vadodara IT Company Career & Internship Pages.
 * STRICT RULE: Only pages confirmed to visibly advertise an active fresher/internship opening
 * with an application flow are listed here. Every page is fetched live and checked against
 * visible body text (scripts/styles stripped) on each scan.
 */
const DIRECT_VADODARA_CAREER_PROGRAMS = [
  {
    company: 'Trevita Infotech',
    location: 'Alkapuri, Vadodara (Emerald One, Jetalpur Rd)',
    url: 'https://www.trevitainfotech.com/career',
    programs: [
      {
        title: 'Software Development Internship Program',
        confirmPattern: /software\s+development\s+internship\s+program/i,
        experience: 'Internship (Fresher)',
        description: 'Live-project 6-month Software Development Internship at Trevita Infotech, Alkapuri, Vadodara (Full Stack, Web & Software Dev).',
      },
      {
        title: 'Web Development Internship Programme',
        confirmPattern: /web\s+development\s+internship\s+programme/i,
        experience: 'Internship (Fresher)',
        description: '4-month Full-Stack Web Development Internship Programme at Trevita Infotech, Vadodara.',
      },
      {
        title: 'UI/UX & Graphic Design Internship Programme',
        confirmPattern: /graphic\s+design\s+internship\s+programme/i,
        experience: 'Internship (Fresher)',
        description: '4-month UI/UX & Graphic Design Internship Programme at Trevita Infotech, Alkapuri, Vadodara.',
      },
    ],
  },
  {
    company: 'MaMo Technolabs',
    location: 'Vadodara, Gujarat',
    url: 'https://mamotechnolabs.com/internship/',
    programs: [
      {
        title: 'Free AICTE-Approved Full-Stack / Frontend / UI-UX Student Internship',
        confirmPattern: /internships\s+are\s+completely\s+free|comprehensive\s+internship\s+program/i,
        experience: 'Internship (Student / Fresher)',
        description: 'Free AICTE-approved student IT internship program on real projects under mentorship at MaMo Technolabs, Vadodara.',
      },
    ],
  },
  {
    company: 'Atyantik Technologies',
    location: 'Vadodara, Gujarat',
    url: 'https://atyantik.com/careers/',
    programs: [
      {
        title: 'Software / Full-Stack / React / UI-UX Internship Programme (6 Months On-Site)',
        confirmPattern: /apply\s+for\s+the\s+internship|internship\s+programme\s*six\s+months/i,
        experience: 'Internship (Fresher)',
        description: '6-month on-site Internship Programme at Atyantik Technologies, Vadodara for final-year students and graduates.',
      },
    ],
  },
  {
    company: 'Helios Solutions',
    location: 'Vadodara, Gujarat',
    url: 'https://www.heliossolutions.co/connect-with-us/apply-for-internship/',
    programs: [
      {
        title: 'IT / Web Development / Python / UI-UX Internship',
        confirmPattern: /apply\s+for\s+internship[\s\S]{0,300}exciting\s+internship/i,
        experience: 'Internship / Fresher',
        description: 'Direct IT Internship application portal at Helios Solutions, Vadodara for recent graduates and students.',
      },
    ],
  },
  {
    company: 'Zignuts Technolab',
    location: 'Vadodara, Gujarat',
    url: 'https://www.zignuts.com/career',
    programs: [
      {
        title: 'Software / Full-Stack / MERN / Python / UI-UX Internship Opportunity',
        confirmPattern: /internship\s+opportunity/i,
        experience: 'Internship / Fresher',
        description: 'Live Internship Opportunity listed on Zignuts Technolab careers page for freshers and students.',
      },
    ],
  },
];

async function fetchWorkdayCompany(cfg) {
  const jobs = [];
  try {
    const res = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: {
        ...HTTP_HEADERS,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        appliedFacets: {},
        limit: 20,
        offset: 0,
        searchText: 'Vadodara',
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) return jobs;
    const data = await res.json();

    for (const item of data.jobPostings || []) {
      const title = String(item.title || '').trim();
      const loc = String(item.locationsText || '').trim();
      const extPath = String(item.externalPath || '').trim();
      if (!title || !extPath) continue;

      if (!/vadodara|baroda/i.test(`${loc} ${title}`)) continue;

      const applyUrl = extPath.startsWith('http') ? extPath : `${cfg.portalBase}${extPath}`;
      const isInternOrTrainee = /\b(intern|internship|trainee|graduate|fresher|junior|entry)\b/i.test(
        title
      );

      jobs.push({
        title,
        company: cfg.company,
        location: loc || 'Vadodara, Gujarat, India',
        experience: isInternOrTrainee ? 'Internship / Trainee' : '',
        verifiedFresher: isInternOrTrainee,
        description: `${title} at ${cfg.company} (${loc})`,
        applyUrl,
        postedDate: item.postedOn || null,
        source: `${cfg.company} Careers`,
      });
    }
  } catch {
    // Graceful skip
  }
  return jobs;
}

async function fetchSmartRecruitersCompany(cfg) {
  const jobs = [];
  try {
    const url = `https://api.smartrecruiters.com/v1/companies/${cfg.slug}/postings?q=Vadodara&limit=25`;
    const res = await fetch(url, {
      headers: { ...HTTP_HEADERS, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return jobs;
    const data = await res.json();

    for (const item of data.content || []) {
      const title = String(item.name || '').trim();
      const city = item.location?.city || '';
      const expLevel = item.experienceLevel?.label || '';
      if (!title || !/vadodara|baroda/i.test(`${city} ${title}`)) continue;

      const isEntryOrIntern = /\b(intern|internship|entry|trainee|graduate|fresher|junior)\b/i.test(
        `${expLevel} ${title}`
      );
      if (!isEntryOrIntern) continue;

      const applyUrl = `https://jobs.smartrecruiters.com/${cfg.slug}/${item.id}`;
      jobs.push({
        title,
        company: cfg.company,
        location: `${city || 'Vadodara'}, Gujarat, India`,
        experience: expLevel || 'Entry Level',
        verifiedFresher: true,
        description: `${title} (${expLevel}) at ${cfg.company} Vadodara`,
        applyUrl,
        postedDate: item.releasedDate ? String(item.releasedDate).slice(0, 10) : null,
        source: `${cfg.company} Careers`,
      });
    }
  } catch {
    // Graceful skip
  }
  return jobs;
}

async function fetchMatrixComsecVadodara() {
  const jobs = [];
  const url = 'https://www.matrixcomsec.com/careers.html';
  try {
    const res = await fetch(url, {
      headers: HTTP_HEADERS,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return jobs;
    const html = await res.text();
    if (isExpiredPageText(html)) return jobs;

    const $ = cheerio.load(html);
    const seen = new Set();

    $('.career-box, .job-item, .accordion-item, .card, tr').each((_, el) => {
      const block = $(el);
      const text = block.text().replace(/\s+/g, ' ').trim();
      if (text.length < 15 || text.length > 900) return;

      const title = block.find('h2, h3, h4, h5, .job-title, td:first-child').first().text().trim();
      if (!title || title.length < 6 || title.length > 90 || seen.has(title.toLowerCase())) return;

      const isTech = /\b(software|python|full.?stack|mern|react|node|web|data\s+analyst|ui.?ux|developer|engineer|intern|trainee)\b/i.test(
        title
      );
      const isFresher = /\b(0\s*(?:-|to)\s*1|0\s*year|fresher|intern|trainee|junior|graduate)\b/i.test(
        `${title} ${text}`
      );
      if (!isTech || !isFresher) return;

      seen.add(title.toLowerCase());
      jobs.push({
        title,
        company: 'Matrix Comsec',
        location: 'Vadodara, Gujarat (Makarpura)',
        experience: /\b(intern|trainee)\b/i.test(title) ? 'Internship / Trainee' : 'Fresher (0–1 yrs)',
        verifiedFresher: true,
        description: text.slice(0, 240),
        applyUrl: url,
        postedDate: new Date().toISOString().slice(0, 10),
        source: 'Matrix Comsec Careers',
      });
    });
  } catch {
    // Graceful skip
  }
  return jobs;
}

async function fetchDirectCompanyPrograms(cfg) {
  try {
    const res = await fetch(cfg.url, {
      headers: HTTP_HEADERS,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    if (isExpiredPageText(html)) return [];

    // Strip scripts, styles, and noscript so patterns only match visible page content
    const $ = cheerio.load(html);
    $('script, style, noscript').remove();
    const visibleText = $('body').text().replace(/\s+/g, ' ').trim();
    if (!visibleText || isExpiredPageText(visibleText)) return [];

    const matched = [];
    for (const prog of cfg.programs) {
      if (!prog.confirmPattern.test(visibleText)) continue;
      matched.push({
        title: prog.title,
        company: cfg.company,
        employerWebsite: cfg.url,
        location: cfg.location,
        experience: prog.experience,
        verifiedFresher: true,
        description: prog.description,
        applyUrl: cfg.url,
        postedDate: new Date().toISOString().slice(0, 10),
        source: `${cfg.company} Careers`,
      });
    }
    return matched;
  } catch {
    return [];
  }
}

/**
 * Fetches live IT Fresher jobs & internships directly from Vadodara IT company career pages & ATS feeds.
 */
export async function fetchVadodaraCompanyCareers() {
  const batches = await Promise.all([
    ...WORKDAY_VADODARA_COMPANIES.map(fetchWorkdayCompany),
    ...SMARTRECRUITERS_VADODARA_COMPANIES.map(fetchSmartRecruitersCompany),
    fetchMatrixComsecVadodara(),
    ...DIRECT_VADODARA_CAREER_PROGRAMS.map(fetchDirectCompanyPrograms),
  ]);

  const jobs = batches.flat();
  return {
    source: 'Vadodara Company Careers',
    enabled: true,
    status: 'ok',
    rateLimited: false,
    count: jobs.length,
    error: null,
    jobs,
  };
}
