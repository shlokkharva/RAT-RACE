import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  classifyRoles,
  evaluateFresherFit,
  evaluateLocation,
  normalizeUrl,
  processJobs,
} from '../src/utils/filter.js';
import { createEmptyStore, mergeJobsStore } from '../src/utils/storage.js';
import { buildAlertEmail } from '../src/utils/mailer.js';
import {
  filterJobsForSubscriber,
  getActiveRecipients,
  loadSubscribers,
  removeSubscriber,
  upsertSubscriber,
} from '../src/utils/subscribers.js';
import {
  enrichJobsWithGlassdoor,
  filterUnverifiedRemoteJobs,
  hasPhysicalAddressSignal,
  isParkedDomainHtml,
} from '../src/utils/glassdoor.js';
import {
  checkJobUrlLive,
  filterExpiredJobs,
  isExpiredPageText,
  isScrapeRestrictedUrl,
  markJobExpired,
} from '../src/utils/validator.js';

test('classifyRoles accurately tags Data Analyst, UI/UX, MERN, Full-Stack, and Python', () => {
  assert.ok(classifyRoles('Junior Data Analyst (Power BI & SQL)').includes('data-analyst'));
  assert.ok(classifyRoles('UI/UX Designer Intern - Figma').includes('ui-ux'));
  assert.ok(classifyRoles('MERN Stack Developer Fresher').includes('mern'));
  assert.ok(classifyRoles('Full Stack Web Developer Trainee').includes('fullstack'));
  assert.ok(classifyRoles('Python Django Developer - 0-1 Years').includes('python'));

  // Rejects non-IT titles even if generic keywords appear
  assert.deepEqual(classifyRoles('Interior Designer', 'Uses creative tools'), []);
  assert.deepEqual(classifyRoles('Telecaller / BPO Voice Process', 'Data entry'), []);
});

test('evaluateLocation matches Vadodara / Baroda and Remote India/Worldwide while excluding US-only remote', () => {
  assert.equal(evaluateLocation('Vadodara, Gujarat, India').matches, true);
  assert.equal(evaluateLocation('Alkapuri, Baroda').matches, true);
  assert.equal(evaluateLocation('Ahmedabad, Gujarat').matches, false);
  assert.equal(evaluateLocation('Remote, India').matches, true);
  assert.equal(evaluateLocation('Remote (Worldwide)').matches, true);
  assert.equal(evaluateLocation('Work From Home').isRemote, true);
  assert.equal(evaluateLocation('Remote (USA Only)').matches, false);
  assert.equal(evaluateLocation('Remote, India', '', '', { includeRemoteIndia: false }).matches, false);
  // Reject non-Vadodara jobs tagged "Remote" when JD actually says WFO / On-site / Hybrid
  assert.equal(
    evaluateLocation('Remote (Gurgaon)', 'Data Analyst Intern', 'This is a WFO role in Gurgaon').matches,
    false
  );
  assert.equal(
    evaluateLocation('Remote (Thane)', 'UX Intern', 'Work from office 5 days a week, on-site').matches,
    false
  );
  assert.equal(
    evaluateLocation('Remote (Bangalore)', 'Python Intern', 'Hybrid work model in Bangalore office').matches,
    false
  );
  // Vadodara hybrid stays valid because it IS in Vadodara!
  assert.equal(
    evaluateLocation('Vadodara (Hybrid)', 'Data Analyst Intern', 'Hybrid in Vadodara').matches,
    true
  );
});

test('evaluateFresherFit strictly keeps freshers/interns and rejects 1.5+/2+ yrs and unspecified experience', () => {
  const fresher = evaluateFresherFit('Python Developer Fresher', '0-1 years experience required');
  assert.equal(fresher.isFresherFriendly, true);
  assert.equal(fresher.jobType, 'Full-Time Fresher');

  const intern = evaluateFresherFit('UI/UX Design Intern', 'Figma prototyping');
  assert.equal(intern.isFresherFriendly, true);
  assert.equal(intern.jobType, 'Internship');

  const seniorTitle = evaluateFresherFit('Senior Full Stack Developer', 'React and Node');
  assert.equal(seniorTitle.isFresherFriendly, false);

  const highExp = evaluateFresherFit('Data Analyst', 'Minimum 2+ years of experience in SQL');
  assert.equal(highExp.isFresherFriendly, false);

  const onePointFive = evaluateFresherFit('Junior Full Stack Developer (1.5 Years Experience)', 'PHP');
  assert.equal(onePointFive.isFresherFriendly, false);

  const expProf = evaluateFresherFit('Data Analyst', 'Open to Experienced Professionals only');
  assert.equal(expProf.isFresherFriendly, false);

  const vagueNoProof = evaluateFresherFit('Software Engineer', 'Build backend services in Python');
  assert.equal(vagueNoProof.isFresherFriendly, false);

  const gluedYears = evaluateFresherFit(
    'Software Engineer (Dotnet, Angular/React)',
    'Software Engineer Experience: 7+ yearsRole Overview Level 2 mid-level engineering role'
  );
  assert.equal(gluedYears.isFresherFriendly, false);

  const internationalFalseIntern = evaluateFresherFit(
    'Linux Cryptography and Security Engineer',
    'Maintain compliance with international security standards and internal tooling'
  );
  assert.equal(internationalFalseIntern.isFresherFriendly, false);
});

test('processJobs deduplicates identical jobs across sources and cleans tracking params', () => {
  const clean = normalizeUrl('https://example.com/job/123?utm_source=linkedin&refId=abc&role=dev');
  assert.equal(clean, 'https://example.com/job/123?role=dev');

  const raw = [
    {
      title: 'Junior MERN Stack Developer',
      company: 'Rishabh Software Pvt. Ltd.',
      location: 'Vadodara, Gujarat',
      description: 'React, Node.js, MongoDB fresher opening',
      applyUrl: 'https://example.com/apply/1?utm_source=a',
      source: 'LinkedIn',
    },
    {
      title: 'Junior MERN Stack Developer',
      company: 'Rishabh Software',
      location: 'Vadodara',
      description: 'React, Node.js, MongoDB, Express full stack fresher opening in Vadodara',
      applyUrl: 'https://example.com/apply/1?utm_source=b',
      source: 'Adzuna',
    },
    {
      title: 'Senior Python Architect',
      company: 'Some Corp',
      location: 'Vadodara',
      description: '8+ years experience',
      applyUrl: 'https://example.com/apply/2',
      source: 'LinkedIn',
    },
  ];

  const processed = processJobs(raw);
  assert.equal(processed.length, 1);
  assert.ok(processed[0].categories.includes('mern'));
  assert.ok(processed[0].categories.includes('fullstack'));
});

test('mergeJobsStore identifies only brand-new jobs on subsequent runs', () => {
  const initial = createEmptyStore();
  const jobA = {
    id: 'job-a',
    title: 'Junior Data Analyst',
    company: 'Vadodara Tech',
    location: 'Vadodara',
    categories: ['data-analyst'],
    jobType: 'Full-Time Fresher',
    experience: 'Fresher (0–1 yrs)',
    fresherScore: 85,
    source: 'LinkedIn',
    applyUrl: 'https://example.com/a',
  };
  const jobB = {
    id: 'job-b',
    title: 'UI/UX Designer Fresher',
    company: 'Design Studio Vadodara',
    location: 'Vadodara',
    categories: ['ui-ux'],
    jobType: 'Full-Time Fresher',
    experience: 'Fresher (0–1 yrs)',
    fresherScore: 90,
    source: 'Internshala',
    applyUrl: 'https://example.com/b',
  };

  const run1 = mergeJobsStore(initial, [jobA]);
  assert.equal(run1.newJobs.length, 1);
  assert.equal(run1.updatedStore.jobs.length, 1);

  const run2 = mergeJobsStore(run1.updatedStore, [jobA, jobB]);
  assert.equal(run2.newJobs.length, 1);
  assert.equal(run2.newJobs[0].id, 'job-b');
  assert.equal(run2.updatedStore.jobs.length, 2);
});

test('buildAlertEmail renders subject, HTML apply buttons, and text links', () => {
  const email = buildAlertEmail(
    [
      {
        title: 'Python Developer Fresher',
        company: 'Acme Vadodara',
        location: 'Vadodara, Gujarat',
        experience: 'Fresher (0–1 yrs)',
        categories: ['python'],
        source: 'LinkedIn',
        applyUrl: 'https://example.com/apply/python',
      },
    ],
    'https://user.github.io/RAT-RACER-BDQ/'
  );

  assert.match(email.subject, /1 New Vadodara IT Fresher Job/);
  assert.match(email.html, /https:\/\/example\.com\/apply\/python/);
  assert.match(email.html, /Apply Now/);
  assert.match(email.html, /https:\/\/user\.github\.io\/RAT-RACER-BDQ\//);
  assert.match(email.text, /Python Developer Fresher/);
});

test('subscriber store saves particular user Gmail + roles, filters jobs per user, and unsubscribes', () => {
  const tmpFile = path.join(os.tmpdir(), `rat-racer-bdq-subs-${Date.now()}.json`);
  try {
    assert.throws(() => upsertSubscriber({ email: 'not-an-email', roles: ['python'] }, tmpFile));

    const saved = upsertSubscriber(
      { email: '  Shlok@Gmail.com ', name: 'Shlok', roles: ['python', 'data-analyst'] },
      tmpFile
    );
    assert.equal(saved.email, 'shlok@gmail.com');
    assert.deepEqual(saved.roles, ['python', 'data-analyst']);
    assert.equal(loadSubscribers(tmpFile).length, 1);

    const sampleJobs = [
      { id: '1', title: 'Python Dev', categories: ['python'], isVadodara: true, isRemote: false },
      { id: '2', title: 'UI/UX Designer', categories: ['ui-ux'], isVadodara: true, isRemote: false },
      { id: '3', title: 'Data Analyst', categories: ['data-analyst'], isVadodara: false, isRemote: true },
    ];
    const matched = filterJobsForSubscriber(sampleJobs, saved.roles, 'all');
    assert.equal(matched.length, 2);
    assert.deepEqual(
      matched.map((j) => j.id),
      ['1', '3']
    );
    assert.deepEqual(
      filterJobsForSubscriber(sampleJobs, saved.roles, 'remote').map((j) => j.id),
      ['3']
    );
    assert.deepEqual(
      filterJobsForSubscriber(sampleJobs, saved.roles, 'vadodara').map((j) => j.id),
      ['1']
    );

    const welcome = buildAlertEmail(matched, 'http://127.0.0.1:4173', {
      recipientName: saved.name,
      isWelcome: true,
      selectedRoles: saved.roles,
    });
    assert.match(welcome.subject, /Alerts Active/);
    assert.match(welcome.html, /Hi Shlok,/);

    // Pausing updates (active: false) excludes the user from active recipients
    upsertSubscriber(
      { email: 'shlok@gmail.com', name: 'Shlok', roles: ['python'], active: false },
      tmpFile
    );
    const prevEnv = process.env.ALERT_EMAIL_TO;
    delete process.env.ALERT_EMAIL_TO;
    try {
      assert.equal(getActiveRecipients(tmpFile).length, 0);
    } finally {
      if (prevEnv !== undefined) process.env.ALERT_EMAIL_TO = prevEnv;
    }

    assert.equal(removeSubscriber('shlok@gmail.com', tmpFile), true);
    assert.equal(loadSubscribers(tmpFile).length, 0);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('filterUnverifiedRemoteJobs drops unverified/fake remote companies and keeps Glassdoor-verified ones', async () => {
  const prevKey = process.env.RAPIDAPI_KEY;
  delete process.env.RAPIDAPI_KEY;
  const tmpCache = path.join(os.tmpdir(), `rat-racer-bdq-gd-${Date.now()}.json`);
  try {
    const sample = [
      { id: '1', company: 'Infosys', isVadodara: false, isRemote: true },
      { id: '2', company: 'Internship Mela', isVadodara: false, isRemote: true },
      { id: '3', company: 'Unknown Shady Remote LLC', isVadodara: false, isRemote: true },
      { id: '4', company: 'Rishabh Software', isVadodara: true, isRemote: false },
      { id: '5', company: 'Workers Town', isVadodara: true, isRemote: false },
    ];
    await enrichJobsWithGlassdoor(sample, tmpCache, { checkWebsites: false });
    const clean = filterUnverifiedRemoteJobs(sample, { requireGlassdoorForRemote: true });
    assert.deepEqual(
      clean.map((j) => j.id),
      ['1', '4']
    );

    // Website + physical address verification helpers
    assert.equal(
      hasPhysicalAddressSignal('<footer>Registered Office: 4th Floor, MG Road, Bengaluru 560001</footer>'),
      true
    );
    assert.equal(
      hasPhysicalAddressSignal('<div>No address listed anywhere</div>'),
      false
    );
    assert.equal(isParkedDomainHtml('<html><body>This domain is for sale on GoDaddy</body></html>'), true);
  } finally {
    if (prevKey !== undefined) process.env.RAPIDAPI_KEY = prevKey;
    if (fs.existsSync(tmpCache)) fs.unlinkSync(tmpCache);
  }
});

test('isExpiredPageText accurately detects closed/not-accepting application pages and past JSON-LD validThrough', () => {
  assert.equal(isExpiredPageText('<div>No longer accepting applications</div>'), true);
  assert.equal(isExpiredPageText('<p>Sorry, this job has expired and is closed.</p>'), true);
  assert.equal(isExpiredPageText('<p>Registrations closed — deadline passed</p>'), true);
  assert.equal(
    isExpiredPageText('<script type="application/ld+json">{"validThrough":"2020-01-01T00:00:00Z"}</script>'),
    true
  );
  assert.equal(
    isExpiredPageText('<script type="application/ld+json">{"validThrough":"2099-01-01T00:00:00Z"}</script><button>Apply</button>'),
    false
  );
  assert.equal(isExpiredPageText('<button>Apply Now for Junior Python Developer</button>'), false);
});

test('markJobExpired permanently blocks reported expired jobs on future runs', async () => {
  const tmpExpired = path.join(os.tmpdir(), `rat-racer-bdq-exp-${Date.now()}.json`);
  try {
    markJobExpired({ id: 'kmk-expired-1', title: 'Associate Trainee', company: 'KMK Consulting Inc.' }, tmpExpired);
    const { kept, removed } = await filterExpiredJobs(
      [
        { id: 'kmk-expired-1', title: 'Associate Trainee', company: 'KMK Consulting Inc.', applyUrl: 'https://example.com/1', lastVerifiedAt: new Date().toISOString() },
        { id: 'live-2', title: 'Python Intern', company: 'Trevita Infotech', applyUrl: 'https://example.com/2', lastVerifiedAt: new Date().toISOString() },
      ],
      { expiredStorePath: tmpExpired }
    );
    assert.deepEqual(kept.map((j) => j.id), ['live-2']);
    assert.deepEqual(removed.map((r) => r.job.id), ['kmk-expired-1']);
  } finally {
    if (fs.existsSync(tmpExpired)) fs.unlinkSync(tmpExpired);
  }
});

test('processJobs caps remote listings to max 2 per company while keeping Vadodara companies uncapped', () => {
  const raw = [
    { title: 'Python Intern', company: 'RemoteSpam Inc', location: 'Remote, India', workMode: 'Remote', source: 'Internshala', applyUrl: 'https://example.com/r1' },
    { title: 'MERN Stack Intern', company: 'RemoteSpam Inc', location: 'Remote, India', workMode: 'Remote', source: 'Internshala', applyUrl: 'https://example.com/r2' },
    { title: 'Data Analyst Intern', company: 'RemoteSpam Inc', location: 'Remote, India', workMode: 'Remote', source: 'Internshala', applyUrl: 'https://example.com/r3' },
    { title: 'UI/UX Design Intern', company: 'RemoteSpam Inc', location: 'Remote, India', workMode: 'Remote', source: 'Internshala', applyUrl: 'https://example.com/r4' },
    { title: 'Python Intern', company: 'Trevita Infotech', location: 'Vadodara, Gujarat', workMode: 'On-site', source: 'Company Career Page', applyUrl: 'https://example.com/v1' },
    { title: 'MERN Stack Intern', company: 'Trevita Infotech', location: 'Vadodara, Gujarat', workMode: 'On-site', source: 'Company Career Page', applyUrl: 'https://example.com/v2' },
    { title: 'UI/UX Design Intern', company: 'Trevita Infotech', location: 'Vadodara, Gujarat', workMode: 'On-site', source: 'Company Career Page', applyUrl: 'https://example.com/v3' },
  ];
  const processed = processJobs(raw, { includeRemoteIndia: true });
  const remoteOnes = processed.filter((j) => j.company === 'RemoteSpam Inc');
  const vadodaraOnes = processed.filter((j) => j.company === 'Trevita Infotech');
  assert.equal(remoteOnes.length, 2);
  assert.equal(vadodaraOnes.length, 3);
});

test('isScrapeRestrictedUrl & checkJobUrlLive skip scraping-restricted portals to protect user IP', async () => {
  assert.equal(isScrapeRestrictedUrl('https://www.linkedin.com/jobs/view/123456'), true);
  assert.equal(isScrapeRestrictedUrl('https://internshala.com/internship/detail/test'), true);
  assert.equal(isScrapeRestrictedUrl('https://unstop.com/internships/test-1234'), true);
  assert.equal(isScrapeRestrictedUrl('https://www.trevitainfotech.com/career'), false);

  const probe = await checkJobUrlLive('https://www.linkedin.com/jobs/view/123456');
  assert.equal(probe.alive, true);
  assert.equal(probe.skipped, true);
});
