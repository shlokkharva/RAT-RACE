import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

test('every DOM element ID referenced in docs/app.js exists in docs/index.html', () => {
  const html = fs.readFileSync(path.join(ROOT, 'docs', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'docs', 'app.js'), 'utf8');

  const ids = Array.from(js.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)).map((m) => m[1]);
  const uniqueIds = Array.from(new Set(ids));
  assert.ok(uniqueIds.length > 20, 'Expected at least 20 DOM IDs in docs/app.js');

  const missing = uniqueIds.filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(missing, [], `Missing DOM IDs in docs/index.html: ${missing.join(', ')}`);
});

test('docs/styles.css has balanced braces and defines light-theme tokens', () => {
  const css = fs.readFileSync(path.join(ROOT, 'docs', 'styles.css'), 'utf8');
  const opens = (css.match(/\{/g) || []).length;
  const closes = (css.match(/\}/g) || []).length;
  assert.equal(opens, closes, 'CSS braces must be balanced');
  assert.match(css, /--bg:\s*#f6f8fc/i);
  assert.match(css, /:focus-visible/);
});

test('docs/data/jobs.json is valid JSON with expected schema', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'docs', 'data', 'jobs.json'), 'utf8');
  const data = JSON.parse(raw);
  assert.equal(typeof data.meta, 'object');
  assert.ok(Array.isArray(data.jobs));
  for (const job of data.jobs) {
    assert.ok(job.id && job.title && job.applyUrl, 'Each job must have id, title, and applyUrl');
    assert.match(job.applyUrl, /^https?:\/\//i, 'Every applyUrl must be a valid http/https URL');
    assert.ok(Array.isArray(job.categories) && job.categories.length > 0);
  }
});

test('docs/data/vadodara-companies.json has 100+ valid Vadodara IT companies including Numerator', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'docs', 'data', 'vadodara-companies.json'), 'utf8');
  const data = JSON.parse(raw);
  assert.ok(Array.isArray(data.companies) && data.companies.length >= 100);
  const hasNumerator = data.companies.some((c) => /numerator/i.test(c.name));
  assert.equal(hasNumerator, true, 'Numerator must be included in Vadodara directory');
  for (const c of data.companies) {
    assert.ok(c.name && c.tier && c.focus && c.fresherRoles);
    assert.match(c.careersUrl, /^https?:\/\//i, `Invalid careersUrl for ${c.name}`);
  }
});

test('vercel.json and Vercel serverless API handlers load cleanly', async () => {
  const vcfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.equal(vcfg.outputDirectory, 'docs');
  assert.ok(Array.isArray(vcfg.crons) && vcfg.crons.length >= 1);

  const { default: jobsHandler } = await import('../api/jobs.js');
  const { default: healthHandler } = await import('../api/health.js');

  const makeMockRes = () => {
    const out = { statusCode: 200, headers: {}, body: null };
    return {
      out,
      setHeader(k, v) { out.headers[k] = v; },
      status(code) { out.statusCode = code; return this; },
      json(payload) { out.body = payload; return this; },
      end() { return this; },
    };
  };

  const healthRes = makeMockRes();
  healthHandler({ method: 'GET' }, healthRes);
  assert.equal(healthRes.out.statusCode, 200);
  assert.equal(healthRes.out.body.ok, true);
  assert.equal(healthRes.out.body.platform, 'vercel');

  const jobsRes = makeMockRes();
  jobsHandler({ method: 'GET' }, jobsRes);
  assert.equal(jobsRes.out.statusCode, 200);
  assert.equal(jobsRes.out.body.ok, true);
  assert.ok(Array.isArray(jobsRes.out.body.jobs));
});
