'use strict';
/* Public directory HTML against a real local server and temporary SQLite. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'x3-directory-pages-'));
Object.assign(process.env, { DATA_DIR: dir, DB_FILE: path.join(dir, 'directory-pages.db'), SITE_URL: 'https://jobs.example', NODE_ENV: 'development', JOB_BILLING_MODE: 'test', SEED_DEMO: '0', DEMO_TRAFFIC: '0', ADMIN_EMAIL: 'directory-pages-admin@example.test', ADMIN_PASSWORD: 'directory-pages-only-123', COOKIE_SECURE: '0' });
require('../server/seed').seed({ quiet: true });
const { start } = require('../server/index');
let server, base;
test.before(async () => { server = await start(0, '127.0.0.1'); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { await new Promise(resolve => server.close(resolve)); require('../server/db').db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('public jobs directory is useful server-rendered HTML with no invented listings', async () => {
  const res = await fetch(base + '/jobs');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<h1[^>]*>[^]*jobs[^]*<\/h1>/i);
  assert.match(html, /rel="canonical" href="https:\/\/jobs\.example\/jobs"/);
  assert.match(html, /name="q"/);
  assert.match(html, /name="category"/);
  assert.match(html, /name="state"/);
  assert.match(html, /name="workMode"/);
  assert.match(html, /href="\/employers"/);
  assert.match(html, /No open|No matching|No listings/);
  assert.doesNotMatch(html, /<iframe|<video|JobPosting|\/assets\/game\.js/);
});

test('approved paid test ads render escaped details and free private-application access', async () => {
  async function call(method, route, body, cookie) {
    const headers = { 'content-type': 'application/json' }; if (cookie) headers.cookie = cookie;
    const response = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), cookie: (response.headers.get('set-cookie') || '').split(';')[0] };
  }
  const registered = await call('POST', '/api/auth/register', { name: 'directory_owner', email: 'directory-owner@example.test', password: 'directory-owner-only-123', adult: true });
  assert.equal(registered.status, 201);
  const cookie = registered.cookie;
  const profile = await call('PUT', '/api/employer/profile', { companyName: 'Example <Studio>', website: 'https://company.example', location: 'Denver', state: 'colorado' }, cookie);
  assert.equal(profile.status, 200);
  const made = await call('POST', '/api/employer/listings', { title: 'Developer <script>alert(1)</script>', description: 'Build and maintain a production website. Discuss scope and compensation before accepting work.', category: 'technology', workMode: 'remote', location: 'US time zones', state: 'colorado', compensation: 'Hourly rate discussed before accepting work' }, cookie);
  assert.equal(made.status, 201);
  const id = made.data.listing.id;
  assert.equal((await fetch(base + '/jobs/' + id)).status, 404, 'unpaid unreviewed draft is private');
  assert.equal((await call('POST', '/api/employer/listings/' + id + '/submit', {}, cookie)).status, 200);
  const admin = await call('POST', '/api/auth/login', { email: 'directory-pages-admin@example.test', password: 'directory-pages-only-123' });
  const queue = await call('GET', '/api/admin/employer-directory', undefined, admin.cookie);
  const reviewToken = queue.data.listings.find(listing => listing.id === id).reviewToken;
  assert.equal((await call('POST', '/api/admin/employer-directory/listings/' + id + '/review', { decision: 'approved', reviewToken }, admin.cookie)).status, 200);
  assert.equal((await fetch(base + '/jobs/' + id)).status, 404, 'review approval does not bypass payment');
  const invoice = await call('POST', '/api/employer/listings/' + id + '/orders', {}, cookie);
  assert.equal(invoice.status, 201);
  const paid = await call('POST', '/api/employer/orders/' + invoice.data.order.id + '/test-pay', {}, cookie);
  assert.equal(paid.status, 200);
  const response = await fetch(base + '/jobs/' + id + '?utm_source=search');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Developer &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Example &lt;Studio&gt;/);
  assert.match(html, /TEST LISTING/);
  assert.match(html, /Apply free|Apply \/ inquire free/);
  assert.ok(html.includes('data-directory-job="' + id + '"'));
  assert.ok(html.includes('rel="canonical" href="https://jobs.example/jobs/' + id + '"'));
  assert.match(html, /content="noindex,follow"/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>|directory-owner@example\.test|JobPosting|<iframe|<video/);
  const filtered = await (await fetch(base + '/jobs?q=Developer&state=colorado&category=technology')).text();
  assert.match(filtered, /Example &lt;Studio&gt;/);
  assert.match(filtered, /content="noindex,follow"/);
  const noMatch = await (await fetch(base + '/jobs?state=florida')).text();
  assert.match(noMatch, /No matching open listings/);
  assert.ok(!noMatch.includes('Developer &lt;script&gt;'));
});

test('employer portal loads local assets and unknown openings return a real 404', async () => {
  const response = await fetch(base + '/employers');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /id="employer-app"/);
  assert.match(html, /src="\/assets\/employer\.js"/);
  assert.doesNotMatch(html, /fonts\.googleapis|<video|<iframe/);
  assert.equal((await fetch(base + '/jobs/99999999')).status, 404);
});
