import crypto from 'node:crypto';
import {
  FRESHER_POSITIVE_TERMS,
  HIGH_EXPERIENCE_PATTERNS,
  LOCATION_CONFIG,
  NON_IT_TITLE_BLOCKLIST,
  ROLE_CATEGORIES,
  SENIOR_TITLE_BLOCKLIST,
} from '../config.js';

export function cleanText(value = '') {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeUrl(rawUrl = '') {
  const trimmed = String(rawUrl).trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    // Strip tracking parameters so duplicate links collapse cleanly
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'refId',
      'trackingId',
      'position',
      'pageNum',
      'trk',
    ];
    for (const p of trackingParams) {
      parsed.searchParams.delete(p);
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export function buildDedupKey(title, company) {
  const norm = (s) =>
    cleanText(s)
      .toLowerCase()
      .replace(/\b(pvt|private|ltd|limited|llp|inc|llc|india|solutions|technologies|tech)\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${norm(company)}::${norm(title)}`;
}

export function createJobId(job) {
  const key = buildDedupKey(job.title, job.company);
  const base = key.length > 5 ? key : normalizeUrl(job.applyUrl);
  return crypto.createHash('sha256').update(base).digest('hex').slice(0, 16);
}

/**
 * Matches one or more target IT role categories (Data Analyst, UI/UX, MERN, Full-Stack, Python).
 */
export function classifyRoles(title = '', description = '') {
  const lowerTitle = cleanText(title).toLowerCase();
  const lowerDesc = cleanText(description).toLowerCase();

  // Reject clearly non-IT titles even if description contains generic words
  if (NON_IT_TITLE_BLOCKLIST.some((term) => lowerTitle.includes(term))) {
    return [];
  }

  const matched = new Set();

  for (const cat of ROLE_CATEGORIES) {
    const titleHit = cat.keywords.some((kw) => lowerTitle.includes(kw));
    if (titleHit) {
      matched.add(cat.id);
      continue;
    }
    // Only fall back to description matching if the title still looks technical/IT
    const genericItTitle =
      /\b(developer|engineer|programmer|analyst|designer|intern|trainee|fresher|software|web|it|tech|data|frontend|backend|stack)\b/i.test(
        lowerTitle
      );
    if (genericItTitle && cat.keywords.some((kw) => lowerDesc.includes(kw))) {
      matched.add(cat.id);
    }
  }

  return Array.from(matched);
}

/**
 * Checks whether a job is in Vadodara or Remote (India / Worldwide).
 */
export function evaluateLocation(
  location = '',
  title = '',
  description = '',
  { includeRemoteIndia = true } = {}
) {
  const locClean = cleanText(location);
  const locLower = locClean.toLowerCase();
  const titleLower = cleanText(title).toLowerCase();
  const descHead = cleanText(description).slice(0, 400).toLowerCase();
  const combined = `${locLower} ${titleLower} ${descHead}`;

  const isVadodara = LOCATION_CONFIG.vadodaraTerms.some((term) => combined.includes(term));
  const isRemote = LOCATION_CONFIG.remoteIndiaTerms.some(
    (term) => locLower.includes(term) || titleLower.includes(term)
  );
  const isHybrid = locLower.includes('hybrid') || titleLower.includes('hybrid');

  if (isVadodara) {
    return {
      matches: true,
      isVadodara: true,
      isRemote,
      workMode: isRemote ? 'Remote' : isHybrid ? 'Vadodara (Hybrid)' : 'Vadodara',
      displayLocation: locClean || 'Vadodara, Gujarat',
    };
  }

  if (includeRemoteIndia && isRemote) {
    const blockedRegion = LOCATION_CONFIG.remoteExcludedRegions.some((r) => locLower.includes(r));
    const fullText = `${titleLower} ${cleanText(description).toLowerCase()}`;
    const hasWfoContradiction = LOCATION_CONFIG.wfoContradictionPatterns.some((rx) =>
      rx.test(fullText)
    );

    if (!blockedRegion && !hasWfoContradiction) {
      const displayLocation =
        !locClean || /^remote$/i.test(locClean) ? 'Remote (India)' : locClean;
      return {
        matches: true,
        isVadodara: false,
        isRemote: true,
        workMode: 'Remote',
        displayLocation,
      };
    }
  }

  return {
    matches: false,
    isVadodara: false,
    isRemote,
    workMode: 'Other',
    displayLocation: locClean,
  };
}

function hasWordTerm(text, term) {
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

/**
 * Strictly evaluates whether a listing is genuinely for FRESHERS / INTERNS (0–1 yrs).
 * Rejects senior roles, 1.5+ / 2+ years requirements, and ambiguous listings with no fresher proof.
 */
export function evaluateFresherFit(
  title = '',
  description = '',
  experienceLabel = '',
  { verifiedFresher = false } = {}
) {
  const lowerTitle = cleanText(title).toLowerCase();
  const lowerDesc = cleanText(description).toLowerCase();
  const lowerExp = cleanText(experienceLabel).toLowerCase();

  // 1. Hard reject senior/lead/manager/mid-level titles
  if (SENIOR_TITLE_BLOCKLIST.some((term) => lowerTitle.includes(term))) {
    return {
      isFresherFriendly: false,
      fresherScore: 0,
      experienceTag: 'Experienced',
      jobType: 'Experienced',
    };
  }

  // 2. Reject explicit 1.5+ / 2+ / 1-3+ years experience requirements or "Experienced Professionals"
  const hasHighExp = HIGH_EXPERIENCE_PATTERNS.some(
    (regex) => regex.test(lowerTitle) || regex.test(lowerExp) || regex.test(lowerDesc)
  );
  const explicitlyZeroYears =
    /\b(fresher|freshers|0\s*(?:-|to|–)\s*1|0\s*year|no\s+(?:prior\s+)?experience|internship|intern\b|trainee)\b/i.test(
      `${lowerTitle} ${lowerExp}`
    );

  if (hasHighExp && !explicitlyZeroYears) {
    return {
      isFresherFriendly: false,
      fresherScore: 0,
      experienceTag: 'Experienced (2+ yrs)',
      jobType: 'Experienced',
    };
  }

  // 3. Require explicit fresher / intern / entry-level / junior proof (word-boundary matched!)
  const hasExplicitFresherSignal =
    verifiedFresher ||
    FRESHER_POSITIVE_TERMS.some(
      (term) => hasWordTerm(lowerTitle, term) || hasWordTerm(lowerExp, term) || hasWordTerm(lowerDesc, term)
    );

  if (!hasExplicitFresherSignal) {
    return {
      isFresherFriendly: false,
      fresherScore: 0,
      experienceTag: 'Experience Unspecified',
      jobType: 'Experienced',
    };
  }

  // 4. Score fresher relevance
  let score = 55;
  for (const term of FRESHER_POSITIVE_TERMS) {
    if (hasWordTerm(lowerTitle, term)) score += 20;
    else if (hasWordTerm(lowerExp, term)) score += 15;
    else if (hasWordTerm(lowerDesc, term)) score += 8;
  }
  score = Math.min(100, score);

  const isInternship = /\b(intern|internship|trainee)\b/i.test(`${lowerTitle} ${lowerExp}`);

  // Keep the real experience label from the application page instead of fabricating one
  const cleanExpLabel = cleanText(experienceLabel);
  let experienceTag = cleanExpLabel;
  if (!experienceTag) {
    experienceTag = isInternship ? 'Internship / Trainee' : 'Fresher / Entry Level';
  }

  return {
    isFresherFriendly: true,
    fresherScore: score,
    experienceTag,
    jobType: isInternship ? 'Internship' : 'Full-Time Fresher',
  };
}

/**
 * Cleans, filters, categorizes, scores, and deduplicates raw job objects from all sources.
 */
export function processJobs(rawJobs = [], { includeRemoteIndia = true } = {}) {
  const seenKeys = new Map();
  const accepted = [];

  for (const raw of rawJobs) {
    const title = cleanText(raw.title);
    const company = cleanText(raw.company) || 'Company Listed on Portal';
    const applyUrl = normalizeUrl(raw.applyUrl);
    const description = cleanText(raw.description || '');

    if (!title || !applyUrl) continue;

    // 1. Check location (Vadodara or optional Remote India)
    const loc = evaluateLocation(raw.location, title, description, { includeRemoteIndia });
    if (!loc.matches) continue;

    // 2. Check target IT role categories
    const categories = classifyRoles(title, description);
    if (categories.length === 0) continue;

    // 3. Check strict fresher / intern suitability
    const fresher = evaluateFresherFit(title, description, raw.experience || '', {
      verifiedFresher: Boolean(raw.verifiedFresher),
    });
    if (!fresher.isFresherFriendly) continue;

    const dedupKey = buildDedupKey(title, company);
    const id = createJobId({ title, company, applyUrl });

    const jobRecord = {
      id,
      title,
      company,
      location: loc.displayLocation,
      isVadodara: loc.isVadodara,
      isRemote: loc.isRemote,
      workMode: loc.workMode,
      categories,
      jobType: fresher.jobType,
      experience: fresher.experienceTag,
      fresherScore: fresher.fresherScore,
      salary: cleanText(raw.salary || ''),
      source: cleanText(raw.source || 'Web'),
      applyUrl,
      snippet: description.slice(0, 260),
      postedDate: raw.postedDate || null,
      deadlineAt: raw.deadlineAt || null,
      discoveredAt: raw.discoveredAt || new Date().toISOString(),
      ...(raw.employerWebsite ? { employerWebsite: normalizeUrl(raw.employerWebsite) } : {}),
      ...(raw.glassdoor ? { glassdoor: raw.glassdoor } : {}),
    };

    // Deduplicate: keep the version with richer metadata or higher fresher score
    const existingIdx = seenKeys.get(dedupKey);
    if (existingIdx !== undefined) {
      const existing = accepted[existingIdx];
      const mergedCategories = Array.from(new Set([...existing.categories, ...jobRecord.categories]));
      if (jobRecord.snippet.length > existing.snippet.length || jobRecord.fresherScore > existing.fresherScore) {
        accepted[existingIdx] = { ...jobRecord, categories: mergedCategories };
      } else {
        existing.categories = mergedCategories;
      }
      continue;
    }

    seenKeys.set(dedupKey, accepted.length);
    accepted.push(jobRecord);
  }

  // Anti-noise cap: prevent any single remote company from flooding the board (max 2 remote roles/company)
  const MAX_REMOTE_PER_COMPANY = 2;
  const remoteCountByCompany = new Map();
  const dedupedAndCapped = [];

  for (const job of accepted) {
    if (job.isRemote && !job.isVadodara) {
      const compKey = buildDedupKey('', job.company);
      const count = remoteCountByCompany.get(compKey) || 0;
      if (count >= MAX_REMOTE_PER_COMPANY) continue;
      remoteCountByCompany.set(compKey, count + 1);
    }
    dedupedAndCapped.push(job);
  }

  return dedupedAndCapped;
}
