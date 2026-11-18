import fs from 'node:fs';
import path from 'node:path';
import { HTTP_HEADERS } from '../config.js';

export const REVIEWS_CACHE_PATH = path.resolve(process.cwd(), 'docs', 'data', 'company-reviews.json');
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Patterns commonly used by fake remote job posts, paid training shops, NGOs, or spam agencies
export const SUSPICIOUS_REMOTE_COMPANY_PATTERNS = [
  /\binternship\s*mela\b/i,
  /\bcoaching\b/i,
  /\bfoundation\b/i,
  /\bngo\b/i,
  /\bhuman\s*resource\s*agency\b/i,
  /\bplacement\s*(cell|agency|services?)\b/i,
  /\btalent\s*to\s*job\b/i,
  /\bskillsncr\b/i,
  /\bworkers\s*town\b/i,
  /\bfreelanc(e|er)\b/i,
  /\bconfidential\b/i,
  /\bundisclosed\b/i,
  /\blisted on\b/i,
];

const PARKED_DOMAIN_PATTERNS = [
  /domain\s+(?:is\s+)?for\s+sale/i,
  /buy\s+this\s+domain/i,
  /this\s+domain\s+(?:is\s+parked|has\s+expired)/i,
  /godaddy|sedoparking|dan\.com|afternic|hugedomains/i,
  /account\s+suspended/i,
  /coming\s+soon\s*[-–|]?\s*under\s+construction/i,
];

const PHYSICAL_ADDRESS_PATTERNS = [
  /"@type"\s*:\s*"PostalAddress"/i,
  /"streetAddress"\s*:\s*"[^"]{5,}"/i,
  // Indian 6-digit PIN code paired with address/city context
  /\b(?:road|rd|street|st|floor|tower|park|nagar|sector|phase|plaza|complex|marg|avenue|lane|circle|cross|layout|industrial|estate|it\s+park|tech\s+park|bengaluru|bangalore|mumbai|pune|hyderabad|noida|gurugram|gurgaon|chennai|delhi|kolkata|ahmedabad|vadodara|surat|jaipur|indore|kochi|chandigarh|gujarat|maharashtra|karnataka|telangana|tamil\s+nadu|haryana|uttar\s+pradesh)[^.\n]{0,80}\b[1-8]\d{5}\b/i,
  // Explicit office/headquarters address phrases
  /\b(?:registered\s+office|head\s+office|corporate\s+office|office\s+address|headquarters|our\s+office)\s*[:\-–]\s*[a-z0-9#,.\s-]{12,}/i,
  // Floor/building + street address pattern (India & international)
  /\b(?:\d+(?:st|nd|rd|th)\s+floor|suite\s+\d+|plot\s+no\.?\s*\d+|building\s+no\.?\s*\d+|block\s+[a-z0-9]+)[^.\n]{0,70}\b(?:road|rd|street|st|avenue|ave|blvd|park|nagar|sector|phase|lane|marg|tower|plaza|city|india|usa|uk|singapore)\b/i,
];

/**
 * Verified companies confirmed to have active Glassdoor company profiles & employee reviews.
 */
const VERIFIED_GLASSDOOR_COMPANIES = new Set([
  'apple', 'google', 'microsoft', 'amazon', 'meta', 'netflix', 'adobe', 'oracle', 'sap',
  'salesforce', 'cisco', 'intel', 'qualcomm', 'nvidia', 'ibm', 'dell', 'hp', 'hewlett packard',
  'vmware', 'atlassian', 'stripe', 'shopify', 'uber', 'airbnb', 'spotify', 'bytedance',
  'canonical', 'supabase', 'gitlab', 'github', 'vercel', 'cloudflare', 'datadog', 'postman',
  'figma', 'canva', 'notion', 'hubspot', 'twilio', 'servicenow', 'workday', 'intuit', 'paypal',
  'mastercard', 'visa', 'american express', 'jpmorgan', 'jp morgan', 'goldman sachs',
  'morgan stanley', 'barclays', 'bnp paribas', 'hsbc', 'citi', 'citibank', 'deutsche bank',
  'standard chartered', 'wells fargo', 'fidelity', 'blackrock', 'infosys', 'tcs',
  'tata consultancy services', 'wipro', 'hcl', 'hcltech', 'hcl technologies', 'tech mahindra',
  'cognizant', 'accenture', 'capgemini', 'deloitte', 'pwc', 'ey', 'ernst young', 'kpmg',
  'ltimindtree', 'mindtree', 'mphasis', 'persistent', 'persistent systems', 'coforge', 'cyient',
  'zensar', 'hexaware', 'birlasoft', 'kpit', 'tata elxsi', 'l t technology services', 'ltts',
  'flipkart', 'myntra', 'swiggy', 'zomato', 'razorpay', 'paytm', 'phonepe', 'meesho', 'nykaa',
  'lenskart', 'ola', 'cred', 'groww', 'zerodha', 'zoho', 'freshworks', 'chargebee',
  'browserstack', 'clevertap', 'druva', 'icertis', 'darwinbox', 'inmobi', 'makemytrip',
  'naukri', 'info edge', 'indiamart', 'justdial', 'reliance', 'jio', 'airtel', 'bharti airtel',
  'tata digital', 'trent', 'hitachi', 'hitachi energy', 'siemens', 'bosch', 'valeo',
  'concentrix', 'teleperformance', 'genpact', 'wns', 'exl', 'mu sigma', 'fractal',
  'fractal analytics', 'tiger analytics', 'latentview', 'nielseniq', 'nielsen', 'mccormick',
  'mccormick company', 'peroptyx', 'pivotroots', 'enterprise bot', 'lemon yellow',
  'mri software', 'civica', 'rishabh software', 'netweb software', 'matrix comsec',
  'helios solutions', 'collabera', 'kanan co', 'kanan', 'kmk consulting', 'linde',
  'linde engineering', 'zignuts technolab', 'webmyne', 'webmyne systems', 'abb',
  'schneider electric', 'honeywell', 'ge', 'general electric', 'gea group', 'numerator',
  'publicis sapient', 'thoughtworks', 'epam', 'globant', 'nagarro', 'hashedin', 'publicis',
  'dentsu', 'wpp', 'sutherland', 'fis', 'fiserv', 'broadridge', 'morningstar', 's p global',
  'moodys', 'thomson reuters', 'wolters kluwer', 'optum', 'unitedhealth', 'iqvia', 'novartis',
  'pfizer', 'astrazeneca', 'sanofi', 'shell', 'bp', 'airbus', 'boeing', 'mercedes benz',
  'bmw', 'volkswagen', 'ford', 'gm', 'general motors', 'samsung', 'lg', 'sony', 'ericsson',
  'nokia', 'qualtrics', 'autodesk', 'cadence', 'synopsys', 'mathworks', 'zscaler',
  'crowdstrike', 'palo alto networks', 'fortinet', 'splunk', 'snowflake', 'databricks',
  'mongodb', 'elastic', 'confluent', 'redis', 'hashicorp',
  // Verified Vadodara IT companies & verified Indian startups with real offices
  'trevita infotech', 'trevitha infotech', 'atyantik', 'atyantik technologies', 'si2 tech',
  'zithas', 'zithas technologies', 'cloudester', 'cloudester software', 'tecunique',
  'barodaweb', 'enlighten infosystems', 'ecare infoway', 'spaculus', 'spaculus software',
  'exxat', 'heliconia', 'heliconia solutions',
]);

/**
 * Real companies with verified physical offices & live official websites that may not be on Glassdoor yet.
 */
const VERIFIED_PHYSICAL_COMPANIES = new Map([
  ['deepthought', { websiteUrl: 'https://www.deepthought.education/', city: 'Hyderabad, India' }],
  ['deepthought edutech', { websiteUrl: 'https://www.deepthought.education/', city: 'Hyderabad, India' }],
  ['deepthought edutech ventures', { websiteUrl: 'https://www.deepthought.education/', city: 'Hyderabad, India' }],
  ['deep thoughts', { websiteUrl: 'https://www.deepthought.education/', city: 'Hyderabad, India' }],
  ['trevita infotech', { websiteUrl: 'https://www.trevitainfotech.com/career', city: 'Alkapuri, Vadodara' }],
  ['atyantik technologies', { websiteUrl: 'https://atyantik.com/careers/', city: 'Vadodara' }],
  ['si2 tech', { websiteUrl: 'https://si2tech.com/careers/', city: 'Vadodara' }],
  ['zithas technologies', { websiteUrl: 'https://www.zithas.com/careers/', city: 'Gotri, Vadodara' }],
  ['cloudester software', { websiteUrl: 'https://cloudester.zohorecruit.in/jobs/Careers', city: 'Vadodara' }],
  ['tecunique', { websiteUrl: 'https://www.tecunique.com/careers', city: 'Vadodara' }],
  ['mamo technolabs', { websiteUrl: 'https://mamotechnolabs.com/internship/', city: 'Vadodara' }],
  ['barodaweb', { websiteUrl: 'https://www.barodaweb.com/dynamic/internship', city: 'Vadodara' }],
  ['swc infotech', { websiteUrl: 'https://swcinfotech.com/careers/', city: 'Vadodara' }],
  ['ecare infoway', { websiteUrl: 'https://ecareinfoway.com/', city: 'Vadodara' }],
  ['nivida software', { websiteUrl: 'https://www.nividasoftware.com/career', city: 'Vadodara' }],
  ['heliconia solutions', { websiteUrl: 'https://www.heliconia.io/', city: 'Vadodara' }],
  ['v ex tech solution', { websiteUrl: 'https://v-extechsolution.in/', city: 'Vadodara' }],
  ['enlighten infosystems', { websiteUrl: 'https://enlighteninfosystems.com/', city: 'Vadodara' }],
]);

export function getVerifiedPhysicalCompany(company = '') {
  const key = normalizeCompanyKey(company);
  if (!key) return null;
  if (VERIFIED_PHYSICAL_COMPANIES.has(key)) return VERIFIED_PHYSICAL_COMPANIES.get(key);
  for (const [k, info] of VERIFIED_PHYSICAL_COMPANIES.entries()) {
    if (k.length >= 6 && (key === k || key.startsWith(`${k} `))) {
      return info;
    }
  }
  return null;
}

export function normalizeCompanyKey(company = '') {
  return String(company)
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|llc|india|corp|corporation|co)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isSuspiciousCompanyName(company = '') {
  const clean = String(company || '').trim();
  if (!clean || clean.length < 2) return true;
  return SUSPICIOUS_REMOTE_COMPANY_PATTERNS.some((rx) => rx.test(clean));
}

export function isInVerifiedGlassdoorRegistry(company = '') {
  if (isSuspiciousCompanyName(company)) return false;
  const key = normalizeCompanyKey(company);
  if (!key) return false;
  if (VERIFIED_GLASSDOOR_COMPANIES.has(key)) return true;

  for (const known of VERIFIED_GLASSDOOR_COMPANIES) {
    if (known.length >= 5 && (key === known || key.startsWith(`${known} `))) {
      return true;
    }
  }
  return false;
}

export function isParkedDomainHtml(html = '') {
  const raw = String(html);
  if (raw.length < 250) return true;
  return PARKED_DOMAIN_PATTERNS.some((rx) => rx.test(raw));
}

export function hasPhysicalAddressSignal(html = '') {
  const raw = String(html);
  if (PHYSICAL_ADDRESS_PATTERNS.some((rx) => rx.test(raw))) {
    return true;
  }
  const plain = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  return PHYSICAL_ADDRESS_PATTERNS.some((rx) => rx.test(plain));
}

export function buildGlassdoorSearchUrl(company = '') {
  const clean = String(company || '').trim();
  if (!clean) return 'https://www.glassdoor.co.in/Reviews/index.htm';
  return `https://www.glassdoor.co.in/Search/results.htm?keyword=${encodeURIComponent(clean)}`;
}

export function loadReviewsCache(filePath = REVIEWS_CACHE_PATH) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return raw && typeof raw.companies === 'object' ? raw.companies : {};
  } catch {
    return {};
  }
}

export function saveReviewsCache(companiesMap, filePath = REVIEWS_CACHE_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify({ updatedAt: new Date().toISOString(), companies: companiesMap }, null, 2) + '\n',
    'utf8'
  );
}

function companyNamesMatch(jobCompany, gdName) {
  const a = normalizeCompanyKey(jobCompany);
  const b = normalizeCompanyKey(gdName);
  if (!a || !b) return false;
  if (a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `)) return true;
  const tokensA = a.split(' ').filter((t) => t.length > 2);
  const tokensB = new Set(b.split(' ').filter((t) => t.length > 2));
  if (tokensA.length === 0) return false;
  const overlap = tokensA.filter((t) => tokensB.has(t)).length;
  return overlap / tokensA.length >= 0.7;
}

function buildCandidateWebsites(companyName, knownWebsiteUrl = '') {
  const candidates = [];
  if (knownWebsiteUrl && /^https?:\/\//i.test(knownWebsiteUrl)) {
    candidates.push(knownWebsiteUrl);
  }
  const key = normalizeCompanyKey(companyName);
  const compact = key.replace(/\s+/g, '');
  const hyphen = key.replace(/\s+/g, '-');
  const firstWord = key.split(' ')[0] || '';

  if (compact.length >= 4 && compact.length <= 32) {
    candidates.push(`https://www.${compact}.com`);
    candidates.push(`https://${compact}.com`);
    candidates.push(`https://${compact}.in`);
    candidates.push(`https://${compact}.co.in`);
    candidates.push(`https://${compact}.io`);
    candidates.push(`https://${compact}.ai`);
    candidates.push(`https://${compact}.tech`);
    candidates.push(`https://${compact}.co`);
    candidates.push(`https://${compact}.education`);
  }
  if (hyphen !== compact && hyphen.length >= 5 && hyphen.length <= 34) {
    candidates.push(`https://${hyphen}.com`);
    candidates.push(`https://${hyphen}.in`);
  }
  if (firstWord.length >= 5 && firstWord !== compact) {
    candidates.push(`https://www.${firstWord}.com`);
    candidates.push(`https://${firstWord}.in`);
    candidates.push(`https://${firstWord}.education`);
  }
  return Array.from(new Set(candidates)).slice(0, 8);
}

async function fetchPageQuick(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: HTTP_HEADERS,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const ctype = res.headers.get('content-type') || '';
    if (!ctype.includes('text/html')) return null;
    const html = await res.text();
    return { finalUrl: res.url, html };
  } catch {
    return null;
  }
}

/**
 * Verifies whether a company has BOTH a real live official website AND a physical office address
 * (checked on homepage and /contact / /contact-us).
 */
export async function verifyCompanyWebsiteAndAddress(companyName, knownWebsiteUrl = '') {
  if (isSuspiciousCompanyName(companyName)) {
    return { websiteVerified: false, websiteUrl: null, hasPhysicalAddress: false };
  }

  const candidates = buildCandidateWebsites(companyName, knownWebsiteUrl);
  const keyTokens = normalizeCompanyKey(companyName)
    .split(' ')
    .filter((t) => t.length >= 3);

  for (const url of candidates) {
    const page = await fetchPageQuick(url);
    if (!page || isParkedDomainHtml(page.html)) continue;

    // Confirm the website actually relates to this company (prevents unrelated domain collisions!)
    const lowerHtml = page.html.toLowerCase();
    const matchesBrand =
      (knownWebsiteUrl && url === knownWebsiteUrl) ||
      keyTokens.some((tok) => lowerHtml.includes(tok));
    if (!matchesBrand) continue;

    // 1. Check homepage for physical address
    if (hasPhysicalAddressSignal(page.html)) {
      return {
        websiteVerified: true,
        websiteUrl: page.finalUrl,
        hasPhysicalAddress: true,
      };
    }

    // 2. Check /contact, /contact-us, /about, /about-us for physical address
    try {
      const origin = new URL(page.finalUrl).origin;
      for (const subPath of ['/contact', '/contact-us', '/about', '/about-us']) {
        const subPage = await fetchPageQuick(`${origin}${subPath}`);
        if (subPage && hasPhysicalAddressSignal(subPage.html)) {
          return {
            websiteVerified: true,
            websiteUrl: page.finalUrl,
            hasPhysicalAddress: true,
          };
        }
      }
    } catch {
      // ignore URL parse error
    }
  }

  return { websiteVerified: false, websiteUrl: null, hasPhysicalAddress: false };
}

/**
 * Queries RapidAPI's Real-Time Glassdoor Data API if the user's RAPIDAPI_KEY is subscribed to it.
 */
async function fetchGlassdoorCompanyFromApi(companyName, apiKey) {
  const url = `https://real-time-glassdoor-data.p.rapidapi.com/company-search?query=${encodeURIComponent(
    companyName
  )}&limit=3&domain=www.glassdoor.co.in`;

  try {
    const res = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'real-time-glassdoor-data.p.rapidapi.com',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401 || res.status === 403) {
      return { unauthorized: true };
    }
    if (!res.ok) return null;

    const payload = await res.json();
    const list = Array.isArray(payload?.data) ? payload.data : [];
    const match = list.find(
      (item) =>
        companyNamesMatch(companyName, item.name || '') &&
        ((item.review_count && item.review_count > 0) || (item.rating && item.rating > 0))
    );

    if (!match) {
      return {
        verified: false,
        rating: null,
        reviewCount: 0,
        reviewsUrl: buildGlassdoorSearchUrl(companyName),
        fetchedAt: new Date().toISOString(),
      };
    }

    return {
      verified: true,
      verifiedVia: 'glassdoor',
      rating: typeof match.rating === 'number' ? Number(match.rating.toFixed(1)) : null,
      reviewCount: match.review_count || null,
      recommendToFriend: match.recommend_to_friend_rating || null,
      reviewsUrl: match.reviews_link || match.overview_link || buildGlassdoorSearchUrl(companyName),
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Enriches every job with company verification:
 *   1. Glassdoor verification (registry, JSearch reviews, or live RapidAPI Glassdoor API)
 *   2. Fallback for legitimate startups not on Glassdoor: live official website + physical address check!
 */
export async function enrichJobsWithGlassdoor(
  jobs = [],
  filePath = REVIEWS_CACHE_PATH,
  { checkWebsites = true } = {}
) {
  const cache = loadReviewsCache(filePath);
  const apiKey = process.env.RAPIDAPI_KEY?.trim();
  const now = Date.now();
  let cacheDirty = false;
  let apiSubscribed = Boolean(apiKey);
  let apiCallsMade = 0;
  let websiteChecksMade = 0;
  const MAX_API_LOOKUPS_PER_RUN = 12;
  const MAX_WEBSITE_CHECKS_PER_RUN = 45;

  for (const job of jobs) {
    const companyName = String(job.company || '').trim();
    const key = normalizeCompanyKey(companyName);
    const fallbackUrl = buildGlassdoorSearchUrl(companyName);

    if (!key || isSuspiciousCompanyName(companyName)) {
      job.glassdoor = {
        verified: false,
        verifiedVia: null,
        url: fallbackUrl,
        websiteUrl: null,
        hasPhysicalAddress: false,
        rating: null,
        reviewCount: null,
      };
      continue;
    }

    // 1. JSearch already gave us Glassdoor review data
    if (job.glassdoor?.rating || job.glassdoor?.reviewCount) {
      cache[key] = {
        company: companyName,
        verified: true,
        verifiedVia: 'glassdoor',
        rating: job.glassdoor.rating ?? null,
        reviewCount: job.glassdoor.reviewCount ?? null,
        reviewsUrl: job.glassdoor.url || fallbackUrl,
        websiteUrl: job.employerWebsite || cache[key]?.websiteUrl || null,
        hasPhysicalAddress: Boolean(cache[key]?.hasPhysicalAddress),
        fetchedAt: new Date().toISOString(),
      };
      cacheDirty = true;
    }

    const verifiedByRegistry = isInVerifiedGlassdoorRegistry(companyName);
    const physicalKnown = getVerifiedPhysicalCompany(companyName);
    let cached = cache[key];
    const isFresh = cached && cached.fetchedAt && now - Date.parse(cached.fetchedAt) < CACHE_TTL_MS;

    // 2. Live Glassdoor API lookup (when subscribed on RapidAPI)
    if (!isFresh && apiSubscribed && apiCallsMade < MAX_API_LOOKUPS_PER_RUN) {
      apiCallsMade++;
      const live = await fetchGlassdoorCompanyFromApi(companyName, apiKey);
      if (live && live.unauthorized) {
        apiSubscribed = false;
      } else if (live) {
        cache[key] = { ...cached, company: companyName, ...live };
        cached = cache[key];
        cacheDirty = true;
      }
    }

    // 3. If NOT verified on Glassdoor yet and NOT in known physical companies -> verify Live Website + Physical Address!
    const alreadyGlassdoorVerified = verifiedByRegistry || cached?.verifiedVia === 'glassdoor';
    const websiteAlreadyChecked =
      cached && cached.websiteCheckedAt && now - Date.parse(cached.websiteCheckedAt) < CACHE_TTL_MS;

    if (
      checkWebsites &&
      !alreadyGlassdoorVerified &&
      !physicalKnown &&
      !websiteAlreadyChecked &&
      job.isRemote &&
      websiteChecksMade < MAX_WEBSITE_CHECKS_PER_RUN
    ) {
      websiteChecksMade++;
      const siteResult = await verifyCompanyWebsiteAndAddress(
        companyName,
        job.employerWebsite || ''
      );
      cache[key] = {
        ...cached,
        company: companyName,
        verified: siteResult.websiteVerified,
        verifiedVia: siteResult.websiteVerified ? 'website' : null,
        websiteUrl: siteResult.websiteUrl,
        hasPhysicalAddress: siteResult.hasPhysicalAddress,
        reviewsUrl: cached?.reviewsUrl || fallbackUrl,
        websiteCheckedAt: new Date().toISOString(),
        fetchedAt: cached?.fetchedAt || new Date().toISOString(),
      };
      cached = cache[key];
      cacheDirty = true;
    }

    const finalInfo = cache[key];
    const verified = alreadyGlassdoorVerified || Boolean(physicalKnown) || Boolean(finalInfo?.verified);
    const verifiedVia = alreadyGlassdoorVerified
      ? 'glassdoor'
      : physicalKnown
        ? 'website'
        : finalInfo?.verified
          ? finalInfo.verifiedVia || 'website'
          : null;

    job.glassdoor = {
      verified,
      verifiedVia,
      url: finalInfo?.reviewsUrl || fallbackUrl,
      websiteUrl: finalInfo?.websiteUrl || physicalKnown?.websiteUrl || job.employerWebsite || null,
      hasPhysicalAddress: Boolean(finalInfo?.hasPhysicalAddress || physicalKnown),
      rating: finalInfo?.rating ?? null,
      reviewCount: finalInfo?.reviewCount ?? null,
      recommendToFriend: finalInfo?.recommendToFriend ?? null,
    };
  }

  if (cacheDirty) {
    saveReviewsCache(cache, filePath);
  }

  return jobs;
}

/**
 * Filters out remote companies that are NEITHER verified on Glassdoor NOR verified via a live official website + physical office address.
 * Vadodara local IT companies are kept (excluding suspicious spam agencies).
 */
export function filterUnverifiedRemoteJobs(jobs = [], { requireGlassdoorForRemote = true } = {}) {
  if (!requireGlassdoorForRemote) return jobs;
  return jobs.filter((job) => {
    if (job.isVadodara) {
      return !isSuspiciousCompanyName(job.company);
    }
    if (job.isRemote) {
      return Boolean(job.glassdoor?.verified);
    }
    return true;
  });
}
