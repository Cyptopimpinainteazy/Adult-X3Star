'use strict';
/* Connected discovery pages through real HTTP and temporary SQLite. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'x3-network-pages-'));
Object.assign(process.env, {
  DATA_DIR: dir, DB_FILE: path.join(dir, 'network-pages.db'), SITE_URL: 'https://network.example',
  NODE_ENV: 'development', JOB_BILLING_MODE: 'test', SEED_DEMO: '1', DEMO_TRAFFIC: '0',
  ADMIN_EMAIL: 'network-pages-admin@example.test', ADMIN_PASSWORD: 'network-pages-admin-only-123',
  DEMO_PASSWORD: 'network-pages-demo-only-123', COOKIE_SECURE: '0'
});
require('../server/seed').seed({ quiet: true });
const { start } = require('../server/index');
let server, base;
const cookies = {};
async function call(who, method, route, body) {
  const headers = {};
  if (cookies[who]) headers.cookie = cookies[who];
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const cookie = response.headers.get('set-cookie');
  if (cookie) cookies[who] = cookie.split(';')[0];
  return { status: response.status, data: await response.json() };
}
async function page(route) {
  const response = await fetch(base + route);
  return { status: response.status, html: await response.text(), headers: response.headers };
}
test.before(async () => {
  server = await start(0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  require('../server/db').db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('network connects text-only discovery pages and gives honest empty outcomes', async () => {
  const hub = await page('/network');
  assert.equal(hub.status, 200);
  assert.match(hub.html, /rel="canonical" href="https:\/\/network\.example\/network"/);
  for (const route of ['/talent', '/opportunities', '/companies', '/jobs', '/casting', '/blog']) {
    assert.ok(hub.html.includes(`href="${route}"`), route + ' is reachable');
  }
  assert.match(hub.html, /content="noindex,follow"/, 'demo-only hub is not indexed');
  assert.match(hub.html, /href="\/#profiles">Live app/);
  assert.doesNotMatch(hub.html, /<img|<video|<iframe|JobPosting|\/assets\/game\.js/);
  const alias = await page('/Talent?q=nothingmatches');
  assert.equal(alias.status, 200);
  assert.match(alias.html, /<title>Find creator talent/);
  const trailing = await fetch(base + '/talent/?state=CO', { redirect: 'manual' });
  assert.equal(trailing.status, 301);
  assert.equal(trailing.headers.get('location'), '/talent?state=CO');
  const empty = await page('/opportunities?q=nothingmatches');
  assert.equal(empty.status, 200);
  assert.match(empty.html, /No matching|No open/);
  assert.match(empty.html, /Free (?:profile|star)|free (?:profile|star)/);
  assert.match(empty.html, /name="q"[^>]*value="nothingmatches"/);
  assert.match(empty.html, /name="kind"/);
  assert.match(empty.html, /name="category"/);
  const companies = await page('/companies');
  assert.equal(companies.status, 200);
  assert.match(companies.html, /No matching|No companies|No active/);
  assert.match(companies.html, /content="noindex,follow"/);
  assert.equal((await page('/talent/missing-creator')).status, 404);
  assert.equal((await page('/companies/999999999')).status, 404);
});

test('talent pagination keeps its requested page size and visits the next profile', async () => {
  const first = await page('/talent?pageSize=1');
  assert.equal(first.status, 200);
  const next = first.html.match(/rel="next" href="([^"]+)"/);
  assert.ok(next, 'more than one seeded profile is discoverable');
  const nextUrl = next[1].replaceAll('&amp;', '&');
  assert.equal(new URL(nextUrl, base).searchParams.get('pageSize'), '1');
  const second = await page(nextUrl);
  const profileLinks = html => [...html.matchAll(/<h3><a href="(\/talent\/[^\"]+)"/g)].map(match => match[1]);
  const firstLinks = profileLinks(first.html), secondLinks = profileLinks(second.html);
  assert.equal(firstLinks.length, 1);
  assert.equal(secondLinks.length, 1);
  assert.notEqual(firstLinks[0], secondLinks[0], 'next does not repeat the first profile');
  assert.match(second.html, /Page 2 of/);
  assert.match(second.html, /name="pageSize" value="1"/);
});

test('talent and free opportunities expose escaped metadata and connect to the existing private-inquiry board', async () => {
  assert.equal((await call('admin', 'POST', '/api/auth/login', { email: 'network-pages-admin@example.test', password: 'network-pages-admin-only-123' })).status, 200);
  assert.equal((await call('creator', 'POST', '/api/auth/register', { name: 'network_creator', email: 'network-creator@example.test', password: 'network-creator-only-123', adult: true })).status, 201);
  assert.equal((await call('creator', 'POST', '/api/apply', { stage: 'Nova <Creator>', email: 'network-creator@example.test', adult: true })).status, 201);
  const applications = await call('admin', 'GET', '/api/admin/applications');
  const application = applications.data.rows.find(row => row.email === 'network-creator@example.test');
  assert.ok(application);
  const approved = await call('admin', 'POST', '/api/admin/applications/' + application.id, { status: 'approved' });
  assert.equal(approved.status, 200);
  const id = approved.data.creatorId;
  const saved = await call('creator', 'PUT', '/api/studio/profile', { bio: 'Editing and design. <script>alert("bio")</script>', tags: ['editing', '<tag>'], networkCity: 'Denver <Metro>', networkState: 'CO' });
  assert.equal(saved.status, 200);
  const jobBody = { kind: 'hiring', title: 'Clip editor <Team>', description: 'Edit a weekly clip package. <script>alert("post")</script> Discuss the scope before accepting.', category: 'collaboration', workMode: 'hybrid', location: 'Denver', compensation: 'Rate agreed before work begins', status: 'open' };
  const made = await call('creator', 'POST', '/api/studio/jobs', jobBody);
  assert.equal(made.status, 201);
  assert.equal((await call('creator', 'POST', '/api/studio/jobs', { ...jobBody, title: 'Clip editing partner' })).status, 201);
  assert.equal((await call('creator', 'POST', '/api/studio/jobs', { ...jobBody, kind: 'available', title: 'Available for editing', category: 'editing' })).status, 201);

  const talent = await page('/talent?q=Nova&state=CO&intent=available&pageSize=1');
  assert.equal(talent.status, 200);
  assert.match(talent.html, /Nova &lt;Creator&gt;/);
  assert.match(talent.html, /Denver &lt;Metro&gt;, Colorado/);
  assert.match(talent.html, /<option value="colorado" selected>/);
  assert.match(talent.html, /<option value="available" selected>/);
  assert.match(talent.html, /1 available-work post/);
  assert.match(talent.html, /content="noindex,follow"/);

  const profile = await page('/talent/' + id);
  assert.equal(profile.status, 200);
  assert.equal(profile.headers.get('cache-control'), 'no-store');
  assert.match(profile.html, /&lt;script&gt;alert\(&quot;bio&quot;\)&lt;\/script&gt;/);
  assert.match(profile.html, /content="index,follow"/, 'real creator metadata profile can be indexed');
  assert.ok(profile.html.includes(`href="/stars/${id}/jobs#job-${made.data.job.id}"`));
  assert.ok(profile.html.includes(`href="/#member-${id}"`));
  assert.doesNotMatch(profile.html, /<script>alert|network-creator@example\.test|<img|<video|<iframe|JobPosting|DEMO PROFILE/);

  const posts = await page('/opportunities?q=Clip&state=CO&location=Denver&kind=hiring&category=collaboration&workMode=hybrid&pageSize=1');
  assert.equal(posts.status, 200);
  assert.match(posts.html, /<option value="colorado" selected>/);
  assert.match(posts.html, /name="location"[^>]*value="Denver"/);
  assert.match(posts.html, /<option value="hiring" selected>/);
  assert.match(posts.html, /<option value="collaboration" selected>/);
  assert.match(posts.html, /<option value="hybrid" selected>/);
  const next = posts.html.match(/rel="next" href="([^"]+)"/);
  assert.ok(next);
  const params = new URL(next[1].replaceAll('&amp;', '&'), base).searchParams;
  assert.deepEqual(Object.fromEntries(params), { q: 'Clip', state: 'colorado', location: 'Denver', kind: 'hiring', category: 'collaboration', workMode: 'hybrid', pageSize: '1', page: '2' });
  assert.doesNotMatch(posts.html, /Available for editing|network-creator@example\.test|<script>alert/);
  assert.match((await page('/network')).html, /content="index,follow"/, 'real profile makes the hub useful to index');
  const casting = await page('/casting/colorado');
  for (const href of ['/talent?state=colorado', '/opportunities?state=colorado', '/jobs?state=colorado']) assert.ok(casting.html.includes(`href="${href}"`), href);
});

test('company discovery uses reviewed paid listing snapshots and labels test placements without private owner data', async () => {
  async function publish(who, companyName) {
    assert.equal((await call(who, 'POST', '/api/auth/register', { name: who, email: who + '@example.test', password: 'network-employer-only-123', adult: true })).status, 201);
    const profile = await call(who, 'PUT', '/api/employer/profile', { companyName, location: 'Private profile location', state: 'florida' });
    assert.equal(profile.status, 200);
    const made = await call(who, 'POST', '/api/employer/listings', { title: 'Production editor <Role>', description: 'Edit our production materials and agree the scope before starting. <script>alert("employer")</script>', category: 'editing', workMode: 'hybrid', location: 'Denver <Workplace>', state: 'colorado', compensation: 'Hourly scope and rate agreed before work' });
    assert.equal(made.status, 201);
    const listingId = made.data.listing.id, employerId = profile.data.profile.id;
    assert.equal((await page('/companies/' + employerId)).status, 404, 'unpaid draft has no public company page');
    assert.equal((await call(who, 'POST', '/api/employer/listings/' + listingId + '/submit', {})).status, 200);
    const queue = await call('admin', 'GET', '/api/admin/employer-directory');
    const reviewToken = queue.data.listings.find(listing => listing.id === listingId).reviewToken;
    assert.equal((await call('admin', 'POST', '/api/admin/employer-directory/listings/' + listingId + '/review', { decision: 'approved', reviewToken })).status, 200);
    assert.equal((await page('/companies/' + employerId)).status, 404, 'review alone does not bypass paid placement');
    const invoice = await call(who, 'POST', '/api/employer/listings/' + listingId + '/orders', {});
    assert.equal(invoice.status, 201);
    assert.equal((await call(who, 'POST', '/api/employer/orders/' + invoice.data.order.id + '/test-pay', {})).status, 200);
    return { listingId, employerId };
  }
  const first = await publish('network_employer_one', 'Vivid <Team>');
  await publish('network_employer_two', 'Quiet Team');
  assert.equal((await call('network_employer_one', 'PUT', '/api/employer/profile', { companyName: 'Unreviewed new name', location: 'Unreviewed new location' })).status, 200);
  const companies = await page('/companies?q=Team&state=CO&pageSize=1');
  assert.equal(companies.status, 200);
  assert.match(companies.html, /2 companies match/);
  assert.match(companies.html, /<option value="colorado" selected>/);
  assert.match(companies.html, /content="noindex,follow"/);
  const next = companies.html.match(/rel="next" href="([^"]+)"/);
  assert.ok(next);
  assert.deepEqual(Object.fromEntries(new URL(next[1].replaceAll('&amp;', '&'), base).searchParams), { q: 'Team', state: 'colorado', pageSize: '1', page: '2' });
  const profile = await page('/companies/' + first.employerId);
  assert.equal(profile.status, 200);
  assert.match(profile.html, /<h1>Vivid &lt;Team&gt;<\/h1>/);
  assert.match(profile.html, /Listing location/);
  assert.match(profile.html, /Denver &lt;Workplace&gt;, Colorado/);
  assert.match(profile.html, /TEST LISTING[^]*no real charge/);
  assert.match(profile.html, /Paid directory placement/);
  assert.ok(profile.html.includes(`href="/jobs/${first.listingId}"`));
  assert.match(profile.html, /content="noindex,follow"/);
  assert.doesNotMatch(profile.html, /network_employer_one@example\.test|Private profile location|Unreviewed new name|Unreviewed new location|<script>alert|<img|<video|<iframe|JobPosting/);
  assert.equal((await fetch(base + '/assets/network.css')).status, 200);
  assert.equal((await call('network_employer_one', 'POST', '/api/employer/listings/' + first.listingId + '/close', {})).status, 200);
  assert.equal((await page('/companies/' + first.employerId)).status, 404, 'closing the only public listing hides the company');
});
