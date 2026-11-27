'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'x3-star-jobs-pages-'));
Object.assign(process.env, { DATA_DIR: dir, DB_FILE: path.join(dir, 'pages.db'), SITE_URL: 'https://stars.example', SEED_DEMO: '1', DEMO_TRAFFIC: '0', ADMIN_EMAIL: 'pages-admin@example.test', ADMIN_PASSWORD: 'pages-test-only-123', DEMO_PASSWORD: 'pages-demo-only-123', COOKIE_SECURE: '0' });
require('../server/seed').seed({ quiet: true });
const { start } = require('../server/index');
let server, base;
test.before(async () => { server = await start(0, '127.0.0.1'); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { await new Promise(resolve => server.close(resolve)); require('../server/db').db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('every approved star has a shareable board, including offline stars', async () => {
  for (const slug of ['luna', 'mila']) {
    const res = await fetch(base + '/stars/' + slug + '/jobs?utm_source=profile');
    assert.equal(res.status, 200, slug);
    const html = await res.text();
    assert.match(html, new RegExp('rel="canonical" href="https://stars\\.example/stars/' + slug + '/jobs"'));
    assert.ok(html.includes('data-creator-jobs="' + slug + '"'));
    assert.match(html, /Hiring|hiring/);
    assert.match(html, /Available for work/);
    assert.doesNotMatch(html, /<iframe|<video|\/assets\/game\.js|JobPosting/);
  }
  assert.equal((await fetch(base + '/stars/no-such-star/jobs')).status, 404);
  const duplicate = await fetch(base + '/stars/mila/jobs/?utm_source=profile', { redirect: 'manual' });
  assert.equal(duplicate.status, 301);
  assert.equal(duplicate.headers.get('location'), '/stars/mila/jobs?utm_source=profile');
});

test('published jobs render in HTML without exposing private inquiries', async () => {
  async function call(method, route, body, cookie) {
    const headers = { 'content-type': 'application/json' }; if (cookie) headers.cookie = cookie;
    const res = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await res.json();
    return { status: res.status, data, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  }
  const owner = await call('POST', '/api/auth/login', { email: 'luna@demo.x3star.local', password: 'pages-demo-only-123' });
  assert.equal(owner.status, 200);
  const listing = { kind: 'hiring', title: 'Editor <script>alert(1)</script>', description: 'Edit a short set of promotional clips. Scope and delivery agreed privately.', category: 'editing', workMode: 'remote', compensation: 'Paid, scope and budget discussed first', status: 'open', expiresAt: Date.now() + 7 * 86400000 };
  const hiring = await call('POST', '/api/studio/jobs', listing, owner.cookie);
  assert.equal(hiring.status, 201);
  const available = await call('POST', '/api/studio/jobs', { ...listing, kind: 'available', title: 'Available for design projects', category: 'design' }, owner.cookie);
  assert.equal(available.status, 201);
  const fan = await call('POST', '/api/auth/login', { email: 'fan@demo.x3star.local', password: 'pages-demo-only-123' });
  const privateMessage = 'Private portfolio discussion: keep this inquiry out of public HTML.';
  const inquiry = await call('POST', '/api/jobs/' + hiring.data.job.id + '/inquiries', { message: privateMessage }, fan.cookie);
  assert.equal(inquiry.status, 201);
  const res = await fetch(base + '/stars/luna/jobs');
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /Editor &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Available for design projects/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>|fan@demo\.x3star\.local/);
  assert.ok(!html.includes(privateMessage));
  assert.match(html, /name="robots" content="noindex,follow"/);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, follow');
  const closed = await call('PUT', '/api/studio/jobs/' + hiring.data.job.id, { status: 'closed' }, owner.cookie);
  assert.equal(closed.status, 200);
  const after = await (await fetch(base + '/stars/luna/jobs')).text();
  assert.ok(!after.includes('Editor &lt;script&gt;'));
  assert.match(after, /Available for design projects/);
});
