'use strict';
/* Real HTTP/SQLite casting application checks. Each group has its own process and rate-limit bucket. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function serverFor(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'x3s-casting-'));
  const child = spawn(process.execPath, ['-e', `
    require('./server/seed').seed({ quiet: true });
    require('./server/index').start(0, '127.0.0.1').then(s => console.log('CASTING_TEST_PORT=' + s.address().port));
  `], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATA_DIR: dir, DB_FILE: path.join(dir, 'casting.db'), NODE_ENV: 'development', COOKIE_SECURE: '0', TRUST_PROXY: '0', SEED_DEMO: '0', DEMO_TRAFFIC: '0', ADMIN_EMAIL: 'casting-admin@test.local', ADMIN_PASSWORD: 'casting-test-pass-123', PAYMENTS_MODE: 'disabled' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let closed = false;
  const exited = new Promise(resolve => child.once('exit', () => { closed = true; resolve(); }));
  t.after(async () => {
    if (!closed) child.kill('SIGTERM');
    await exited;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const port = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    const timer = setTimeout(() => reject(new Error('Casting test server did not start')), 10000);
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/CASTING_TEST_PORT=(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    child.stderr.on('data', data => { errors += data; });
    child.once('error', err => { clearTimeout(timer); reject(err); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Casting test server exited ' + code + ': ' + errors.slice(-2000))); });
  });
  const base = 'http://127.0.0.1:' + port;
  async function call(method, route, body, cookie) {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    const res = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, data: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  }
  return call;
}

const application = (extra = {}) => ({ email: 'casting@example.test', stage: 'Test Creator', adult: true, ...extra });

test('casting stores applicant state separately from entry page and preserves legacy applications', async t => {
  const call = await serverFor(t);
  const campaign = { utm_source: 'search', utm_medium: 'organic', utm_campaign: 'creator-launch', source: 'legacy-source', medium: 'legacy-medium', ref: 'partner-agent', first_seen: 1795737600000 };
  const submitted = await call('POST', '/api/apply', application({ state: 'CO', landingPath: '/casting/california', campaign }));
  assert.equal(submitted.status, 201);
  assert.equal((await call('GET', '/api/admin/applications')).status, 401);
  const admin = await call('POST', '/api/auth/login', { email: 'casting-admin@test.local', password: 'casting-test-pass-123' });
  assert.equal(admin.status, 200);
  const queue = await call('GET', '/api/admin/applications', undefined, admin.cookie);
  const stored = queue.data.rows.find(row => row.email === 'casting@example.test');
  assert.equal(stored.data.state, 'colorado');
  assert.equal(stored.data.landingPath, '/casting/california');
  assert.deepEqual(stored.data.campaign, campaign);
  assert.equal((await call('POST', '/api/apply', application())).status, 409, 'duplicate pending email');
  assert.equal((await call('POST', '/api/apply', application({ email: 'legacy@example.test', campaign: { utm_source: 'existing-app' } }))).status, 201, 'legacy payload still works');
  const underage = await call('POST', '/api/apply', application({ email: 'age@example.test', adult: false }));
  assert.equal(underage.status, 400);
  assert.equal(underage.data.error.code, 'age_required');
});

test('casting rejects unknown states and nonlocal or unknown entry pages', async t => {
  const call = await serverFor(t);
  const invalid = [
    { state: 'atlantis' },
    { state: { slug: 'colorado' } },
    { landingPath: 'https://example.test/casting/colorado' },
    { landingPath: '/casting/not-a-state' },
    { landingPath: '/casting/colorado?utm_source=search' }
  ];
  for (const fields of invalid) {
    const res = await call('POST', '/api/apply', application(fields));
    assert.equal(res.status, 400, JSON.stringify(fields));
    assert.equal(res.data.error.code, 'bad_input');
  }
});

test('casting campaign attribution rejects nested, unknown and oversized input', async t => {
  const call = await serverFor(t);
  for (const campaign of [null, ['search'], { utm_source: { value: 'search' } }, { unknown: 'search' }, { utm_source: 'x'.repeat(161) }]) {
    const res = await call('POST', '/api/apply', application({ campaign }));
    assert.equal(res.status, 400, JSON.stringify(campaign));
    assert.equal(res.data.error.code, 'bad_input');
  }
});

test('Denver campaign inquiries keep the actual state separate from the approved entry path', async t => {
  const call = await serverFor(t);
  const campaign = { utm_source: 'trafficjunky', utm_medium: 'display', utm_campaign: 'denver_creator_casting', utm_content: 'denver_intro' };
  const submitted = await call('POST', '/api/apply', application({ state: 'CO', landingPath: '/casting/colorado/denver', campaign }));
  assert.equal(submitted.status, 201);
  const admin = await call('POST', '/api/auth/login', { email: 'casting-admin@test.local', password: 'casting-test-pass-123' });
  const queue = await call('GET', '/api/admin/applications', undefined, admin.cookie);
  const stored = queue.data.rows.find(row => row.email === 'casting@example.test');
  assert.equal(stored.status, 'pending');
  assert.equal(stored.data.state, 'colorado');
  assert.equal(stored.data.landingPath, '/casting/colorado/denver');
  assert.deepEqual(stored.data.campaign, campaign);
  const visitor = await call('POST', '/api/apply', application({ email: 'visitor@example.test', state: 'WY', landingPath: '/casting/colorado/denver' }));
  assert.equal(visitor.status, 201, 'Landing page must not misreport the visitor’s actual state');
  const updated = await call('GET', '/api/admin/applications', undefined, admin.cookie);
  assert.equal(updated.data.rows.find(row => row.email === 'visitor@example.test').data.state, 'wyoming');
  for (const landingPath of ['/casting/colorado/aurora', '/casting/colorado/denver?utm_source=ad', '/casting/california/denver']) {
    assert.equal((await call('POST', '/api/apply', application({ email: 'bad-path@example.test', landingPath }))).status, 400, landingPath);
  }
});
