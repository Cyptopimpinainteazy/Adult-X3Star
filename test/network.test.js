'use strict';
/* Network discovery through real HTTP and temporary SQLite, with no media requests. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
function fixture(databaseFile, action) {
  const db = new DatabaseSync(databaseFile);
  try {
    return action(db);
  } finally {
    db.close();
  }
}
async function serverFor(t) {
  let mode = 'test',
    production = false;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'x3-network-'));
  let child, base;
  const cookies = {},
    userIds = {};
  async function boot() {
    child = spawn(
      process.execPath,
      [
        '-e',
        "require('./server/seed').seed({quiet:true});require('./server/index').start(0,'127.0.0.1').then(s=>console.log('NETWORK_PORT='+s.address().port));"
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        env: {
          ...process.env,
          DATA_DIR: dir,
          DB_FILE: path.join(dir, 'network.db'),
          SITE_URL: '',
          NODE_ENV: production ? 'production' : 'development',
          JOB_BILLING_MODE: mode,
          COOKIE_SECURE: '0',
          TRUST_PROXY: '0',
          SEED_DEMO: '1',
          DEMO_TRAFFIC: '0',
          DEMO_PASSWORD: 'network-demo-test-only',
          ADMIN_EMAIL: 'network-admin@example.test',
          ADMIN_PASSWORD: 'network-admin-test-only'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    const port = await new Promise((resolve, reject) => {
      let stdout = '',
        stderr = '';
      const timer = setTimeout(() => reject(new Error('Network test server timed out')), 10000);
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        const found = stdout.match(/NETWORK_PORT=(\d+)/);
        if (found) {
          clearTimeout(timer);
          resolve(found[1]);
        }
      });
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error('Network server exited ' + code + ': ' + stderr.slice(-1500)));
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    base = 'http://127.0.0.1:' + port;
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const done = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await done;
  }
  async function call(who, method, route, body) {
    const headers = {};
    if (cookies[who]) headers.cookie = cookies[who];
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(base + route, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const cookie = response.headers.get('set-cookie');
    if (cookie) cookies[who] = cookie.split(';')[0];
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {}
    return { status: response.status, data, text, headers: response.headers };
  }
  t.after(async () => {
    await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await boot();
  for (const [who, email, password] of [
    ['luna', 'luna@demo.x3star.local', 'network-demo-test-only'],
    ['raven', 'raven@demo.x3star.local', 'network-demo-test-only'],
    ['fan', 'fan@demo.x3star.local', 'network-demo-test-only'],
    ['admin', 'network-admin@example.test', 'network-admin-test-only']
  ]) {
    const result = await call(who, 'POST', '/api/auth/login', { email, password });
    assert.equal(result.status, 200);
    userIds[who] = result.data.user.id;
  }
  return {
    call,
    userIds,
    restart: async (next = {}) => {
      await stop();
      if (next.mode !== undefined) mode = next.mode;
      if (next.production !== undefined) production = next.production;
      if (next.fixture) fixture(path.join(dir, 'network.db'), next.fixture);
      await boot();
    },
    databaseFile: path.join(dir, 'network.db')
  };
}

test('public talent discovery exposes explicit metadata and blank location defaults', async (t) => {
  const { call } = await serverFor(t);
  const response = await call('anon', 'GET', '/api/network/talent');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.data.total, 16);
  const luna = response.data.talent.find((person) => person.id === 'luna');
  assert.equal(luna.networkCity, '');
  assert.equal(luna.networkState, '');
  assert.equal(luna.demo, true);
  assert.equal(luna.opportunityCount, 0);
  assert.doesNotMatch(JSON.stringify(luna), /email|userId|pass_hash|kyc|avatar|video|gender/);
});

const freeJob = (extra = {}) => ({
  title: 'Editor for weekly promotional clips',
  kind: 'hiring',
  category: 'editing',
  description: 'Edit two short promotional clips weekly. Discuss scope and compensation before accepting.',
  workMode: 'remote',
  location: 'US time zones',
  compensation: 'Discuss project rate before accepting',
  status: 'open',
  ...extra
});
const paidJob = (extra = {}) => ({
  title: 'Editor for company promotional clips',
  category: 'editing',
  description: 'Edit promotional clips for a company each week. Confirm scope, timeline and compensation.',
  workMode: 'remote',
  location: 'Denver project',
  state: 'colorado',
  compensation: 'Discuss project rate before accepting',
  ...extra
});
async function createFree(call, who = 'luna', extra = {}) {
  const response = await call(who, 'POST', '/api/studio/jobs', freeJob(extra));
  assert.equal(response.status, 201);
  return response.data.job;
}
async function createPaid(call, who = 'fan', extra = {}) {
  if (!(await call(who, 'GET', '/api/employer')).data.profile)
    assert.equal(
      (
        await call(who, 'PUT', '/api/employer/profile', {
          companyName: who === 'fan' ? 'Example Studio' : 'Other Studio',
          location: 'Private account location',
          state: 'colorado',
          website: 'https://example.test'
        })
      ).status,
      200
    );
  const response = await call(who, 'POST', '/api/employer/listings', paidJob(extra));
  assert.equal(response.status, 201);
  return response.data.listing;
}
async function approve(call, job, who = 'fan') {
  assert.equal((await call(who, 'POST', '/api/employer/listings/' + job.id + '/submit')).status, 200);
  const preview = await call('admin', 'GET', '/api/admin/employer-directory/lookup?type=listing&id=' + job.id);
  const response = await call('admin', 'POST', '/api/admin/employer-directory/listings/' + job.id + '/review', {
    decision: 'approved',
    reviewToken: preview.data.listing.reviewToken
  });
  assert.equal(response.status, 200);
}
async function pay(call, job, who = 'fan') {
  const response = await call(who, 'POST', '/api/employer/listings/' + job.id + '/orders');
  assert.equal(response.status, 201);
  const order = response.data.order;
  assert.equal((await call(who, 'POST', '/api/employer/orders/' + order.id + '/test-pay')).status, 200);
  return order;
}

test('Studio location is explicit, owner scoped, normalized, clearable and persistent', async (t) => {
  const { call, restart } = await serverFor(t);
  const initial = await call('luna', 'GET', '/api/studio');
  assert.equal(initial.data.creator.networkCity, '');
  assert.deepEqual(
    initial.data.networkStates.find((state) => state.slug === 'colorado'),
    { slug: 'colorado', name: 'Colorado' }
  );
  assert.equal((await call('anon', 'PUT', '/api/studio/profile', { networkCity: 'Denver' })).status, 401);
  assert.equal((await call('fan', 'PUT', '/api/studio/profile', { networkCity: 'Denver' })).status, 403);
  const saved = await call('luna', 'PUT', '/api/studio/profile?as=raven', {
    networkCity: '  Denver  ',
    networkState: 'CO'
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.creator.id, 'luna');
  assert.equal(saved.data.creator.networkCity, 'Denver');
  assert.equal(saved.data.creator.networkState, 'colorado');
  assert.equal((await call('raven', 'GET', '/api/studio')).data.creator.networkCity, '');
  await restart();
  const publicProfile = await call('anon', 'GET', '/api/network/talent/luna');
  assert.equal(publicProfile.data.creator.networkCity, 'Denver');
  assert.equal(publicProfile.data.creator.networkState, 'colorado');
  assert.equal((await call('anon', 'GET', '/api/network/talent?state=CO')).data.total, 1);
  assert.equal((await call('anon', 'GET', '/api/network/talent?q=Denver')).data.total, 1);
  const adminEdit = await call('admin', 'PUT', '/api/studio/profile?as=raven', {
    networkCity: 'Seattle',
    networkState: 'washington'
  });
  assert.equal(adminEdit.status, 200);
  assert.equal(adminEdit.data.creator.id, 'raven');
  assert.equal((await call('raven', 'GET', '/api/studio')).data.creator.networkCity, 'Seattle');
  for (const body of [
    { networkCity: 'x'.repeat(81) },
    { networkCity: null },
    { networkCity: 25 },
    { networkCity: [] },
    { networkState: 'atlantis' },
    { networkState: null },
    { networkState: [] }
  ])
    assert.equal((await call('luna', 'PUT', '/api/studio/profile', body)).status, 400, JSON.stringify(body));
  const cleared = await call('luna', 'PUT', '/api/studio/profile', { networkCity: '', networkState: '' });
  assert.equal(cleared.data.creator.networkCity, '');
  assert.equal(cleared.data.creator.networkState, '');
  assert.equal((await call('anon', 'GET', '/api/network/talent?state=colorado')).data.total, 0);
});

test('older databases migrate public locations to blank without changing existing profiles', async (t) => {
  const { call, restart } = await serverFor(t);
  assert.equal((await call('luna', 'PUT', '/api/studio/profile', { name: 'Existing display name' })).status, 200);
  await restart({
    fixture: (db) =>
      db.exec(
        'DROP INDEX creators_network_state; ALTER TABLE creators DROP COLUMN network_city; ALTER TABLE creators DROP COLUMN network_state;'
      )
  });
  const profile = await call('anon', 'GET', '/api/network/talent/luna');
  assert.equal(profile.status, 200);
  assert.equal(profile.data.creator.name, 'Existing display name');
  assert.equal(profile.data.creator.networkCity, '');
  assert.equal(profile.data.creator.networkState, '');
  const saved = await call('luna', 'PUT', '/api/studio/profile', { networkCity: 'Portland', networkState: 'OR' });
  assert.equal(saved.status, 200);
  await restart();
  assert.equal((await call('anon', 'GET', '/api/network/talent/luna')).data.creator.networkState, 'oregon');
});

test('opportunity discovery filters real open board posts and exposes aggregate intent counts', async (t) => {
  const { call, databaseFile } = await serverFor(t);
  await call('luna', 'PUT', '/api/studio/profile', { networkCity: 'Denver', networkState: 'colorado' });
  await call('raven', 'PUT', '/api/studio/profile', { networkCity: 'Seattle', networkState: 'washington' });
  const hiring = await createFree(call, 'luna', { title: 'Editor 100%_ ready', location: 'Boulder project' });
  const available = await createFree(call, 'luna', {
    kind: 'available',
    category: 'design',
    title: 'Available for design',
    workMode: 'hybrid',
    location: 'Denver'
  });
  await createFree(call, 'luna', { status: 'draft', title: 'Private draft' });
  await createFree(call, 'luna', { status: 'closed', title: 'Closed post' });
  await createFree(call, 'raven', { title: 'Editor 100AB ready' });
  const aggregate = await call('anon', 'GET', '/api/network/talent/luna');
  assert.equal(aggregate.data.jobs.length, 2);
  assert.equal(aggregate.data.creator.availableCount, 1);
  assert.equal(aggregate.data.creator.hiringCount, 1);
  assert.equal(aggregate.data.creator.opportunityCount, 2);
  assert.equal((await call('anon', 'GET', '/api/network/talent?intent=available')).data.total, 1);
  assert.equal((await call('anon', 'GET', '/api/network/talent?intent=hiring')).data.total, 2);
  const filtered = await call(
    'anon',
    'GET',
    '/api/network/opportunities?state=CO&kind=hiring&category=editing&workMode=remote&location=Boulder'
  );
  assert.equal(filtered.status, 200);
  assert.equal(filtered.headers.get('cache-control'), 'no-store');
  assert.equal(filtered.data.total, 1);
  assert.equal(filtered.data.jobs[0].id, hiring.id);
  assert.deepEqual(filtered.data.jobs[0].creator, {
    id: 'luna',
    name: aggregate.data.creator.name,
    networkCity: 'Denver',
    networkState: 'colorado',
    demo: true
  });
  assert.equal(
    (await call('anon', 'GET', '/api/network/opportunities?location=Denver')).data.total,
    2,
    'public city can locate a remote project with a different actual location'
  );
  assert.equal(
    (await call('anon', 'GET', '/api/network/opportunities?q=' + encodeURIComponent('%_'))).data.total,
    1,
    'wildcards are literal'
  );
  const page = await call('anon', 'GET', '/api/network/opportunities?pageSize=1&page=2');
  assert.equal(page.data.total, 3);
  assert.equal(page.data.pages, 3);
  assert.equal(page.data.jobs.length, 1);
  assert.equal(
    (
      await call('fan', 'POST', '/api/jobs/' + hiring.id + '/inquiries', {
        message: 'Private applicant inquiry for this post',
        portfolioUrl: 'https://private.example/portfolio'
      })
    ).status,
    201
  );
  assert.doesNotMatch(
    JSON.stringify((await call('anon', 'GET', '/api/network/opportunities')).data),
    /Private applicant|private\.example|applicant|email|userId|inquiry/
  );
  assert.equal((await call('luna', 'PUT', '/api/studio/jobs/' + available.id, { status: 'closed' })).status, 200);
  fixture(databaseFile, (db) =>
    db.prepare('UPDATE creator_jobs SET expires_at=? WHERE id=?').run(Date.now() - 1000, hiring.id)
  );
  const after = await call('anon', 'GET', '/api/network/talent/luna');
  assert.equal(after.data.jobs.length, 0);
  assert.equal(after.data.creator.opportunityCount, 0);
  assert.equal((await call('anon', 'GET', '/api/network/opportunities?state=colorado')).data.total, 0);
  assert.equal((await call('anon', 'GET', '/api/network/talent?intent=available')).data.total, 0);
});

test('hidden creators disappear immediately and legacy public serializers omit new location fields', async (t) => {
  const { call, userIds, databaseFile } = await serverFor(t);
  await call('luna', 'PUT', '/api/studio/profile', { networkCity: 'Private until eligible', networkState: 'colorado' });
  await createFree(call);
  for (const status of ['pending', 'suspended']) {
    assert.equal((await call('admin', 'POST', '/api/admin/creators/luna', { status })).status, 200);
    assert.equal((await call('anon', 'GET', '/api/network/talent/luna')).status, 404);
    assert.equal((await call('anon', 'GET', '/api/network/talent?state=colorado')).data.total, 0);
    assert.equal((await call('anon', 'GET', '/api/network/opportunities?state=colorado')).data.total, 0);
  }
  await call('admin', 'POST', '/api/admin/creators/luna', { status: 'approved' });
  assert.equal((await call('anon', 'GET', '/api/network/talent/luna')).status, 200);
  assert.equal((await call('admin', 'POST', '/api/admin/users/' + userIds.luna, { banned: true })).status, 200);
  assert.equal((await call('anon', 'GET', '/api/network/talent/luna')).status, 404);
  assert.equal((await call('anon', 'GET', '/api/network/talent?state=colorado')).data.total, 0);
  assert.equal((await call('anon', 'GET', '/api/network/opportunities?state=colorado')).data.total, 0);
  for (const route of ['/api/creators/luna', '/api/creators', '/']) {
    const response = await call('anon', 'GET', route);
    assert.doesNotMatch(
      response.text,
      /"networkCity"|"networkState"|Private until eligible/,
      'legacy route must not expose newly declared location: ' + route
    );
  }
  fixture(databaseFile, (db) => db.prepare('UPDATE creators SET user_id=NULL WHERE id=?').run('raven'));
  assert.equal(
    (await call('anon', 'GET', '/api/network/talent/raven')).status,
    404,
    'orphaned creators have no eligible owner'
  );
});

test('company discovery uses reviewed paid snapshots and revokes edited, suspended, refunded or expired ads', async (t) => {
  const { call, databaseFile, userIds, restart } = await serverFor(t);
  const job = await createPaid(call);
  const employer = (await call('fan', 'GET', '/api/employer')).data.profile;
  const companyPath = '/api/network/companies/' + employer.id;
  assert.equal((await call('anon', 'GET', companyPath)).status, 404);
  await approve(call, job);
  assert.equal((await call('anon', 'GET', '/api/network/companies')).data.total, 0, 'approval alone is not paid');
  const order = await pay(call, job);
  const company = await call('anon', 'GET', companyPath);
  assert.equal(company.status, 200);
  assert.equal(company.headers.get('cache-control'), 'no-store');
  assert.equal(company.data.companyName, 'Example Studio');
  assert.equal(
    company.data.location,
    'Denver project',
    'directory labels job location, not private company profile location'
  );
  assert.equal(company.data.test, true);
  assert.equal(company.data.jobs[0].test, true);
  const directJob = (await call('anon', 'GET', '/api/directory/jobs/' + job.id)).data.job;
  assert.deepEqual(company.data.jobs, [directJob]);
  assert.doesNotMatch(
    JSON.stringify(company.data),
    /Private account|website|email|userId|reference|reviewToken|activeOrderId|inquiry/
  );
  await call('fan', 'PUT', '/api/employer/profile', { companyName: 'Unreviewed account rename' });
  assert.equal((await call('anon', 'GET', companyPath)).data.companyName, 'Example Studio');
  assert.equal((await call('anon', 'GET', '/api/network/companies?q=Unreviewed')).data.total, 0);
  await call('fan', 'PUT', '/api/employer/listings/' + job.id, { title: 'Edited content needs review' });
  assert.equal((await call('anon', 'GET', companyPath)).status, 404);
  await approve(call, job);
  assert.equal((await call('anon', 'GET', companyPath)).data.companyName, 'Unreviewed account rename');
  await call('admin', 'POST', '/api/admin/employer-directory/employers/' + employer.id + '/status', {
    status: 'suspended'
  });
  assert.equal((await call('anon', 'GET', companyPath)).status, 404);
  await call('admin', 'POST', '/api/admin/employer-directory/employers/' + employer.id + '/status', {
    status: 'active'
  });
  assert.equal((await call('anon', 'GET', companyPath)).status, 200);
  await call('admin', 'POST', '/api/admin/users/' + userIds.fan, { banned: true });
  assert.equal((await call('anon', 'GET', companyPath)).status, 404);
  await call('admin', 'POST', '/api/admin/users/' + userIds.fan, { banned: false });
  assert.equal((await call('anon', 'GET', companyPath)).status, 200);
  await restart({ production: true });
  assert.equal((await call('anon', 'GET', companyPath)).status, 404, 'historical test ads cannot appear in production');
  await restart({ production: false });
  assert.equal((await call('anon', 'GET', companyPath)).status, 200);
  fixture(databaseFile, (db) =>
    db.prepare('UPDATE employer_listing_orders SET expires_at=? WHERE id=?').run(Date.now() - 1000, order.id)
  );
  assert.equal((await call('anon', 'GET', companyPath)).status, 404);
  fixture(databaseFile, (db) =>
    db.prepare('UPDATE employer_listing_orders SET expires_at=? WHERE id=?').run(Date.now() + 86400000, order.id)
  );
  assert.equal((await call('anon', 'GET', companyPath)).status, 200);
  assert.equal(
    (
      await call('admin', 'POST', '/api/admin/employer-directory/orders/' + order.id + '/refund', {
        reference: 'network-test-refund',
        note: 'Recorded for publication regression'
      })
    ).status,
    200
  );
  assert.equal((await call('anon', 'GET', companyPath)).status, 404);
  assert.equal((await call('anon', 'GET', '/api/network/companies')).data.total, 0);
});

test('company grouping paginates identities while preserving individual reviewed names and matching job states', async (t) => {
  const { call, databaseFile } = await serverFor(t);
  await call('fan', 'PUT', '/api/employer/profile', { companyName: 'Studio 100%_', state: 'colorado' });
  const first = await createPaid(call, 'fan');
  await approve(call, first);
  const firstOrder = await pay(call, first);
  await call('fan', 'PUT', '/api/employer/profile', { companyName: 'Second reviewed name' });
  const second = await createPaid(call, 'fan', { location: 'Seattle project', state: 'washington' });
  await approve(call, second);
  const secondOrder = await pay(call, second);
  const other = await createPaid(call, 'raven');
  await approve(call, other, 'raven');
  await pay(call, other, 'raven');
  fixture(databaseFile, (db) => {
    db.prepare('UPDATE employer_listing_orders SET activated_at=? WHERE id=?').run(1000, firstOrder.id);
    db.prepare('UPDATE employer_listing_orders SET activated_at=? WHERE id=?').run(2000, secondOrder.id);
  });
  const literal = await call('anon', 'GET', '/api/network/companies?q=' + encodeURIComponent('%_'));
  assert.equal(literal.status, 200);
  assert.equal(literal.data.total, 1);
  assert.equal(
    literal.data.companies[0].companyName,
    'Second reviewed name',
    'company identity uses latest reviewed eligible ad even when an older name matches search'
  );
  assert.equal(literal.data.companies[0].location, 'Seattle project');
  assert.equal(literal.data.companies[0].jobs.length, 2);
  assert.deepEqual(
    literal.data.companies[0].jobs.map((job) => job.companyName),
    ['Second reviewed name', 'Studio 100%_']
  );
  const state = await call('anon', 'GET', '/api/network/companies?state=CO&pageSize=1');
  assert.equal(state.data.total, 2);
  assert.equal(state.data.pages, 2);
  assert.equal(state.data.companies.length, 1);
  const secondPage = await call('anon', 'GET', '/api/network/companies?state=colorado&pageSize=1&page=2');
  assert.equal(secondPage.data.companies.length, 1);
  assert.notEqual(secondPage.data.companies[0].id, state.data.companies[0].id);
  assert.equal((await call('anon', 'GET', '/api/network/companies?state=washington')).data.total, 1);
  await call('fan', 'POST', '/api/employer/listings/' + second.id + '/close');
  const older = (await call('anon', 'GET', '/api/network/companies/' + literal.data.companies[0].id)).data;
  assert.equal(older.companyName, 'Studio 100%_');
  assert.equal(older.jobs.length, 1);
});

test('network query limits reject malformed filters and keep pages bounded', async (t) => {
  const { call } = await serverFor(t);
  for (const directory of ['talent', 'opportunities', 'companies']) {
    for (const query of [
      'q=' + 'x'.repeat(101),
      'q=a&q=b',
      'state=invalid',
      'state[]=CO',
      'page=0',
      'page=1.5',
      'page=1001',
      'pageSize=51',
      'page=999999999999999999999'
    ]) {
      const response = await call('anon', 'GET', '/api/network/' + directory + '?' + query);
      assert.equal(response.status, 400, directory + ' ' + query);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    const empty = await call('anon', 'GET', '/api/network/' + directory + '?q=' + encodeURIComponent('%_'));
    assert.equal(empty.status, 200);
    assert.equal(empty.data.total, 0, 'literal wildcard text does not select every row');
    const beyond = await call('anon', 'GET', '/api/network/' + directory + '?page=1000&pageSize=1');
    assert.equal(beyond.status, 200);
    assert.equal((beyond.data.talent || beyond.data.jobs || beyond.data.companies).length, 0);
  }
  for (const query of ['intent=unknown'])
    assert.equal((await call('anon', 'GET', '/api/network/talent?' + query)).status, 400);
  for (const query of ['kind=unknown', 'category=unknown', 'workMode=office', 'location=' + 'x'.repeat(101)])
    assert.equal((await call('anon', 'GET', '/api/network/opportunities?' + query)).status, 400);
  assert.equal((await call('anon', 'GET', '/api/network/talent/unknown')).status, 404);
  assert.equal((await call('anon', 'GET', '/api/network/companies/999999')).status, 404);
});
