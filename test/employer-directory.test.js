'use strict';
/* Employer billing/publication checks against real HTTP and restartable SQLite. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
async function serverFor(t, mode = 'test', production = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'x3-employers-'));
  let child, base, clock;
  const cookies = {};
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const done = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await done;
  }
  async function start() {
    child = spawn(
      process.execPath,
      [
        '-e',
        "if(process.env.EMPLOYER_TEST_CLOCK)Date.now=()=>Number(process.env.EMPLOYER_TEST_CLOCK);require('./server/seed').seed({quiet:true});require('./server/index').start(0,'127.0.0.1').then(s=>console.log('EMPLOYER_PORT='+s.address().port));"
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        env: {
          ...process.env,
          DATA_DIR: dir,
          DB_FILE: path.join(dir, 'employers.db'),
          SITE_URL: '',
          NODE_ENV: production ? 'production' : 'development',
          JOB_BILLING_MODE: mode,
          EMPLOYER_TEST_CLOCK: clock === undefined ? '' : String(clock),
          COOKIE_SECURE: '0',
          TRUST_PROXY: '0',
          SEED_DEMO: '1',
          DEMO_TRAFFIC: '0',
          DEMO_PASSWORD: 'employer-demo-test-only',
          ADMIN_EMAIL: 'employer-admin@example.test',
          ADMIN_PASSWORD: 'employer-admin-test-only'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    const port = await new Promise((resolve, reject) => {
      let output = '',
        errors = '';
      const timeout = setTimeout(() => reject(new Error('Employer test server startup timeout')), 10000);
      child.stdout.on('data', (d) => {
        output += d;
        const m = output.match(/EMPLOYER_PORT=(\d+)/);
        if (m) {
          clearTimeout(timeout);
          resolve(m[1]);
        }
      });
      child.stderr.on('data', (d) => (errors += d));
      child.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error('Employer test process exited ' + code + ': ' + errors.slice(-1000)));
      });
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    base = 'http://127.0.0.1:' + port;
  }
  async function call(who, method, route, body) {
    const headers = {};
    if (cookies[who]) headers.cookie = cookies[who];
    if (body !== undefined) headers['content-type'] = 'application/json';
    const r = await fetch(base + route, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const cookie = r.headers.get('set-cookie');
    if (cookie) cookies[who] = cookie.split(';')[0];
    let data = null;
    try {
      data = await r.json();
    } catch {}
    return { status: r.status, data, headers: r.headers };
  }
  t.after(async () => {
    await stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  await start();
  for (const [who, email, password] of [
    ['admin', 'employer-admin@example.test', 'employer-admin-test-only'],
    ['owner', 'fan@demo.x3star.local', 'employer-demo-test-only'],
    ['other', 'raven@demo.x3star.local', 'employer-demo-test-only']
  ])
    assert.equal((await call(who, 'POST', '/api/auth/login', { email, password })).status, 200);
  return {
    call,
    databaseFile: path.join(dir, 'employers.db'),
    restart: async (next = {}) => {
      await stop();
      if (next.mode !== undefined) mode = next.mode;
      if (next.production !== undefined) production = next.production;
      if (next.now !== undefined) clock = next.now;
      await start();
    }
  };
}
const profile = {
  companyName: 'Example Studio',
  website: 'https://example.test',
  location: 'Denver, Colorado',
  state: 'colorado'
};
const listing = (extra) => ({
  title: 'Editor for weekly promotional clips',
  description:
    'Edit two short promotional clips each week. Discuss scope, deadlines and compensation before accepting.',
  category: 'editing',
  workMode: 'remote',
  location: 'US time zones',
  state: 'colorado',
  compensation: 'Discuss project rate before accepting',
  ...extra
});

test('existing accounts can create employer profiles without changing their user role', async (t) => {
  const { call } = await serverFor(t);
  const dashboard = await call('owner', 'GET', '/api/employer');
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.data.profile, null);
  const saved = await call('owner', 'PUT', '/api/employer/profile', profile);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.profile.companyName, 'Example Studio');
  assert.equal((await call('owner', 'GET', '/api/me')).data.user.role, 'fan');
  assert.equal((await call('anon', 'GET', '/api/employer')).status, 401);
});

async function review(call, listingId, decision = 'approved') {
  const preview = (await call('admin', 'GET', '/api/admin/employer-directory')).data.listings.find(
    (item) => item.id === listingId
  );
  return call('admin', 'POST', '/api/admin/employer-directory/listings/' + listingId + '/review', {
    decision,
    reviewToken: preview.reviewToken
  });
}
async function approvedListing(call, extra = {}, who = 'owner') {
  const current = await call(who, 'GET', '/api/employer');
  if (!current.data.profile)
    assert.equal(
      (
        await call(who, 'PUT', '/api/employer/profile', {
          ...profile,
          companyName: who === 'owner' ? 'Example Studio' : 'Other Studio'
        })
      ).status,
      200
    );
  const made = await call(who, 'POST', '/api/employer/listings', listing(extra));
  assert.equal(made.status, 201);
  const id = made.data.listing.id;
  assert.equal((await call(who, 'POST', '/api/employer/listings/' + id + '/submit')).status, 200);
  assert.equal((await review(call, id)).status, 200);
  return id;
}
async function orderFor(call, listingId, who = 'owner') {
  const made = await call(who, 'POST', '/api/employer/listings/' + listingId + '/orders', {
    priceCents: 1,
    paid: true
  });
  assert.equal(made.status, 201);
  return made.data.order;
}
async function payTest(call, order, who = 'owner') {
  const paid = await call(who, 'POST', '/api/employer/orders/' + order.id + '/test-pay');
  assert.equal(paid.status, 200);
  return paid.data.order;
}

test('review, immutable server-priced invoice and payment all gate public placement', async (t) => {
  const { call } = await serverFor(t);
  await call('owner', 'PUT', '/api/employer/profile', profile);
  const made = await call(
    'owner',
    'POST',
    '/api/employer/listings',
    listing({ status: 'open', reviewStatus: 'approved', paid: true, priceCents: 1, expiresAt: 9999999999999 })
  );
  assert.equal(made.status, 201);
  const id = made.data.listing.id;
  assert.equal(made.data.listing.status, 'draft');
  assert.equal(made.data.listing.reviewStatus, 'pending');
  assert.equal(
    (await call('owner', 'POST', '/api/employer/listings/' + id + '/orders')).status,
    409,
    'review is required before charging'
  );
  await call('owner', 'POST', '/api/employer/listings/' + id + '/submit');
  assert.equal((await call('owner', 'POST', '/api/employer/listings/' + id + '/orders')).status, 409);
  await review(call, id);
  assert.equal((await call('anon', 'GET', '/api/directory/jobs')).data.total, 0, 'approval alone cannot publish');
  const order = await orderFor(call, id);
  assert.equal(order.priceCents, 4900);
  assert.equal(order.durationDays, 30);
  assert.equal(order.currency, 'USD');
  assert.equal(order.test, true);
  assert.equal((await orderFor(call, id)).id, order.id, 'invoice retry is idempotent');
  assert.equal((await call('anon', 'GET', '/api/directory/jobs/' + id)).status, 404, 'pending invoice cannot publish');
  await call('admin', 'PUT', '/api/admin/employer-directory/settings', { priceCents: 7300, durationDays: 14 });
  const paid = await payTest(call, order);
  assert.equal(paid.priceCents, 4900, 'invoice snapshot stays fixed after price change');
  assert.ok(paid.expiresAt - paid.activatedAt === 30 * 86400000);
  const retry = await payTest(call, order);
  assert.equal(retry.expiresAt, paid.expiresAt);
  assert.equal(
    (await call('owner', 'POST', '/api/employer/listings/' + id + '/orders')).status,
    409,
    'active paid term cannot be duplicated'
  );
  const pub = await call('anon', 'GET', '/api/directory/jobs/' + id);
  assert.equal(pub.status, 200);
  assert.equal(pub.data.job.test, true);
  await call('owner', 'PUT', '/api/employer/listings/' + id, { title: 'Revised editor opening' });
  assert.equal((await call('anon', 'GET', '/api/directory/jobs/' + id)).status, 404, 'editing hides until reapproval');
  await review(call, id);
  assert.equal(
    (await call('anon', 'GET', '/api/directory/jobs/' + id)).data.job.expiresAt,
    paid.expiresAt,
    'reapproval never resets term'
  );
  await call('owner', 'PUT', '/api/employer/profile', { ...profile, companyName: 'Renamed Company' });
  assert.equal(
    (await call('anon', 'GET', '/api/directory/jobs/' + id)).data.job.companyName,
    'Example Studio',
    'profile rename cannot replace reviewed identity'
  );
  await call('owner', 'PUT', '/api/employer/listings/' + id, { title: 'Reviewed identity update' });
  await review(call, id);
  const updated = (await call('anon', 'GET', '/api/directory/jobs/' + id)).data.job;
  assert.equal(updated.companyName, 'Renamed Company');
  assert.equal(updated.expiresAt, paid.expiresAt);
  const metrics = (await call('admin', 'GET', '/api/admin/employer-directory')).data.metrics;
  assert.equal(metrics.liveRevenueCents, 0);
  assert.equal(metrics.testRevenueCents, 4900);
});

test('manual invoices preserve instructions and only exact Admin receipts can fulfill or refund', async (t) => {
  const { call } = await serverFor(t, 'manual');
  const id = await approvedListing(call);
  assert.equal(
    (await call('owner', 'POST', '/api/employer/listings/' + id + '/orders')).status,
    503,
    'manual payment instructions are required'
  );
  const instructions = 'Pay using the approved invoice method supplied by our billing team.';
  await call('admin', 'PUT', '/api/admin/employer-directory/settings', { invoiceInstructions: instructions });
  const order = await orderFor(call, id);
  assert.equal(order.test, false);
  assert.equal(order.invoiceInstructions, instructions);
  await call('admin', 'PUT', '/api/admin/employer-directory/settings', {
    invoiceInstructions: 'Updated instructions apply only to newly issued invoices.',
    enabled: false,
    priceCents: 9900
  });
  const dashboard = (await call('owner', 'GET', '/api/employer')).data;
  assert.equal(dashboard.orders[0].invoiceInstructions, instructions);
  const receipt = { reference: 'bank-receipt-001', amountCents: 4900, currency: 'USD' };
  assert.equal(
    (await call('owner', 'POST', '/api/admin/employer-directory/orders/' + order.id + '/confirm', receipt)).status,
    403
  );
  assert.equal(
    (
      await call('admin', 'POST', '/api/admin/employer-directory/orders/' + order.id + '/confirm', {
        ...receipt,
        amountCents: 1
      })
    ).status,
    400
  );
  assert.equal(
    (
      await call('admin', 'POST', '/api/admin/employer-directory/orders/' + order.id + '/confirm', {
        ...receipt,
        currency: 'EUR'
      })
    ).status,
    400
  );
  const confirmed = await call(
    'admin',
    'POST',
    '/api/admin/employer-directory/orders/' + order.id + '/confirm',
    receipt
  );
  assert.equal(confirmed.status, 200, 'pausing new sales must not strand an issued invoice');
  const expiry = confirmed.data.order.expiresAt;
  assert.equal(
    (await call('admin', 'POST', '/api/admin/employer-directory/orders/' + order.id + '/confirm', receipt)).data.order
      .expiresAt,
    expiry
  );
  assert.equal(
    (
      await call('admin', 'POST', '/api/admin/employer-directory/orders/' + order.id + '/confirm', {
        ...receipt,
        reference: 'different-reference'
      })
    ).status,
    409
  );
  assert.equal((await call('anon', 'GET', '/api/directory/jobs/' + id)).status, 200);
  await call('admin', 'PUT', '/api/admin/employer-directory/settings', { enabled: true });
  const id2 = await approvedListing(call, { title: 'Separate production role' }),
    order2 = await orderFor(call, id2);
  assert.equal(order2.priceCents, 9900);
  assert.equal(
    (
      await call('admin', 'POST', '/api/admin/employer-directory/orders/' + order2.id + '/confirm', {
        ...receipt,
        amountCents: 9900
      })
    ).status,
    409,
    'one reference cannot pay two invoices'
  );
  const refund = { reference: 'refund-receipt-001', note: 'Refund handled off-platform' };
  const refunded = await call('admin', 'POST', '/api/admin/employer-directory/orders/' + order.id + '/refund', refund);
  assert.equal(refunded.status, 200);
  assert.equal(refunded.data.order.status, 'refunded');
  assert.equal((await call('anon', 'GET', '/api/directory/jobs/' + id)).status, 404);
  assert.equal(
    (await call('admin', 'POST', '/api/admin/employer-directory/orders/' + order.id + '/refund', refund)).status,
    200,
    'refund receipt is idempotent'
  );
  assert.equal(
    (await call('admin', 'POST', '/api/admin/employer-directory/orders/' + order.id + '/confirm', receipt)).status,
    409,
    'payment replay cannot undo a refund'
  );
});

test('private inquiries and listing ownership remain isolated from public directory data', async (t) => {
  const { call } = await serverFor(t),
    id = await approvedListing(call),
    order = await orderFor(call, id);
  await payTest(call, order);
  await call('other', 'PUT', '/api/employer/profile', { ...profile, companyName: 'Other Studio' });
  assert.equal((await call('other', 'PUT', '/api/employer/listings/' + id, { title: 'Stolen listing' })).status, 404);
  assert.equal((await call('other', 'POST', '/api/employer/listings/' + id + '/orders')).status, 404);
  assert.equal((await call('other', 'POST', '/api/employer/orders/' + order.id + '/test-pay')).status, 404);
  assert.equal(
    (
      await call('owner', 'POST', '/api/directory/jobs/' + id + '/inquiries', {
        message: 'I should not inquire about my own job.'
      })
    ).status,
    400
  );
  assert.equal(
    (
      await call('anon', 'POST', '/api/directory/jobs/' + id + '/inquiries', {
        message: 'Anonymous inquiry must be rejected.'
      })
    ).status,
    401
  );
  assert.equal(
    (
      await call('other', 'POST', '/api/directory/jobs/' + id + '/inquiries', {
        message: 'I can help with this work.',
        portfolioUrl: 'javascript:alert(1)'
      })
    ).status,
    400
  );
  const message = 'Private applicant message for the employer inbox only.';
  const sent = await call('other', 'POST', '/api/directory/jobs/' + id + '/inquiries', {
    message,
    portfolioUrl: 'https://portfolio.example/work'
  });
  assert.equal(sent.status, 201);
  assert.equal(sent.headers.get('cache-control'), 'no-store');
  assert.equal((await call('other', 'POST', '/api/directory/jobs/' + id + '/inquiries', { message })).status, 409);
  assert.equal((await call('other', 'GET', '/api/employer/listings/' + id + '/inquiries')).status, 404);
  const inbox = await call('owner', 'GET', '/api/employer/listings/' + id + '/inquiries');
  assert.equal(inbox.headers.get('cache-control'), 'no-store');
  assert.equal(inbox.data.inquiries[0].message, message);
  assert.equal(inbox.data.inquiries[0].applicant.email, 'raven@demo.x3star.local');
  const publicJob = await call('anon', 'GET', '/api/directory/jobs/' + id);
  assert.doesNotMatch(JSON.stringify(publicJob.data), /raven@|portfolio\.example|applicant|userId/);
  assert.ok(!JSON.stringify(publicJob.data).includes(message));
  const changed = await call('owner', 'PATCH', '/api/employer/listings/' + id + '/inquiries/' + sent.data.inquiry.id, {
    status: 'reviewing'
  });
  assert.equal(changed.data.inquiry.status, 'reviewing');
  assert.equal((await call('owner', 'GET', '/api/employer')).headers.get('cache-control'), 'no-store');
});

test('directory filters are bounded and literal, and suspended employers cannot expose paid ads', async (t) => {
  const { call } = await serverFor(t),
    id = await approvedListing(call, { title: 'Editor 50% clips', state: 'CO' }),
    order = await orderFor(call, id);
  await payTest(call, order);
  const search = await call(
    'anon',
    'GET',
    '/api/directory/jobs?q=50%25&category=editing&state=colorado&workMode=remote&pageSize=1'
  );
  assert.equal(search.status, 200);
  assert.equal(search.data.total, 1);
  assert.equal(search.data.pages, 1);
  assert.equal((await call('anon', 'GET', '/api/directory/jobs?q=100%25')).data.total, 0);
  for (const query of [
    'page=0',
    'page=1001',
    'pageSize=51',
    'state=atlantis',
    'workMode=office',
    'category=unknown',
    'q[]=one'
  ])
    assert.equal((await call('anon', 'GET', '/api/directory/jobs?' + query)).status, 400, query);
  const company = (await call('owner', 'GET', '/api/employer')).data.profile;
  await call('admin', 'POST', '/api/admin/employer-directory/employers/' + company.id + '/status', {
    status: 'suspended'
  });
  assert.equal((await call('anon', 'GET', '/api/directory/jobs/' + id)).status, 404);
  assert.equal((await call('owner', 'POST', '/api/employer/listings', listing())).status, 403);
  await call('admin', 'POST', '/api/admin/employer-directory/employers/' + company.id + '/status', {
    status: 'active'
  });
  assert.equal(
    (await call('anon', 'GET', '/api/directory/jobs/' + id)).data.job.expiresAt,
    order.expiresAt || (await call('owner', 'GET', '/api/employer')).data.orders[0].expiresAt
  );
  await call('owner', 'POST', '/api/employer/listings/' + id + '/close');
  assert.equal((await call('anon', 'GET', '/api/directory/jobs/' + id)).status, 404);
  await call('owner', 'DELETE', '/api/employer/listings/' + id);
  assert.equal((await call('owner', 'PUT', '/api/employer/listings/' + id, { title: 'Archived edit' })).status, 409);
});

test('approval during employer suspension activates once upon restoration, with no lifetime extension', async (t) => {
  const { call } = await serverFor(t),
    id = await approvedListing(call),
    order = await orderFor(call, id);
  const profile = (await call('owner', 'GET', '/api/employer')).data.profile;
  await call('admin', 'POST', '/api/admin/employer-directory/employers/' + profile.id + '/status', {
    status: 'suspended'
  });
  const paid = await payTest(call, order);
  assert.equal(paid.activatedAt, null);
  assert.equal((await call('anon', 'GET', '/api/directory/jobs/' + id)).status, 404);
  await call('admin', 'POST', '/api/admin/employer-directory/employers/' + profile.id + '/status', {
    status: 'active'
  });
  const published = (await call('anon', 'GET', '/api/directory/jobs/' + id)).data.job;
  assert.ok(published.publishedAt);
  assert.ok(published.expiresAt);
  await call('admin', 'POST', '/api/admin/employer-directory/employers/' + profile.id + '/status', {
    status: 'active'
  });
  assert.equal((await call('anon', 'GET', '/api/directory/jobs/' + id)).data.job.expiresAt, published.expiresAt);
});

test('real process restart retains invoices and inquiries; controlled clock expiry requires a fresh paid renewal', async (t) => {
  const { call, restart } = await serverFor(t),
    id = await approvedListing(call),
    order = await orderFor(call, id),
    paid = await payTest(call, order);
  await call('other', 'POST', '/api/directory/jobs/' + id + '/inquiries', {
    message: 'Please discuss the available editorial work.'
  });
  await restart();
  assert.equal((await call('anon', 'GET', '/api/directory/jobs/' + id)).data.job.expiresAt, paid.expiresAt);
  assert.equal((await call('owner', 'GET', '/api/employer/listings/' + id + '/inquiries')).data.inquiries.length, 1);
  // The external system clock is controlled in the child process; SQL and HTTP stay real.
  // Keep auth sessions alive while advancing beyond the 30-day term by refreshing them first at day 29.
  await restart({ now: paid.activatedAt + 29 * 86400000 });
  assert.equal(
    (
      await call('owner', 'POST', '/api/auth/login', {
        email: 'fan@demo.x3star.local',
        password: 'employer-demo-test-only'
      })
    ).status,
    200
  );
  await restart({ now: paid.expiresAt + 1 });
  assert.equal((await call('anon', 'GET', '/api/directory/jobs/' + id)).status, 404);
  const renewed = await orderFor(call, id);
  assert.notEqual(renewed.id, order.id);
  assert.equal(renewed.status, 'pending');
  assert.equal(
    (await call('anon', 'GET', '/api/directory/jobs/' + id)).status,
    404,
    'new pending renewal does not extend visibility'
  );
  const paidNew = await payTest(call, renewed);
  assert.equal(paidNew.activatedAt, paid.expiresAt + 1);
  assert.equal(paidNew.expiresAt, paidNew.activatedAt + 30 * 86400000);
  assert.equal(
    (await payTest(call, order)).expiresAt,
    paid.expiresAt,
    'historical receipt retry keeps the historical expiry'
  );
  assert.equal((await call('anon', 'GET', '/api/directory/jobs/' + id)).data.job.expiresAt, paidNew.expiresAt);
});

test('test invoices cannot become real receipts and mode transition replaces pending and paid test entitlements', async (t) => {
  const { call, restart } = await serverFor(t);
  const pendingId = await approvedListing(call, { title: 'Pending test rollout' }),
    pendingOrder = await orderFor(call, pendingId);
  const paidId = await approvedListing(call, { title: 'Paid test rollout' }),
    testOrder = await orderFor(call, paidId);
  await payTest(call, testOrder);
  await call('admin', 'PUT', '/api/admin/employer-directory/settings', {
    invoiceInstructions: 'Manual invoice instructions from our approved billing team.'
  });
  await restart({ mode: 'manual' });
  assert.equal(
    (await call('anon', 'GET', '/api/directory/jobs/' + paidId)).status,
    404,
    'historical test ads cannot appear in manual mode'
  );
  assert.equal((await call('owner', 'POST', '/api/employer/orders/' + testOrder.id + '/test-pay')).status, 503);
  assert.equal(
    (
      await call('admin', 'POST', '/api/admin/employer-directory/orders/' + testOrder.id + '/confirm', {
        reference: 'cannot-be-live',
        amountCents: 4900,
        currency: 'USD'
      })
    ).status,
    503
  );
  const realPending = await orderFor(call, pendingId),
    realPaid = await orderFor(call, paidId);
  assert.equal(realPending.test, false);
  assert.equal(realPaid.test, false);
  assert.notEqual(realPending.id, pendingOrder.id);
  assert.notEqual(realPaid.id, testOrder.id);
  const dashboard = (await call('owner', 'GET', '/api/employer')).data;
  assert.equal(dashboard.orders.find((o) => o.id === pendingOrder.id).status, 'cancelled');
  assert.equal((await call('anon', 'GET', '/api/directory/jobs/' + paidId)).status, 404);
  await call('admin', 'POST', '/api/admin/employer-directory/orders/' + realPaid.id + '/confirm', {
    reference: 'real-rollout-receipt',
    amountCents: 4900,
    currency: 'USD'
  });
  assert.equal((await call('anon', 'GET', '/api/directory/jobs/' + paidId)).data.job.test, false);
  const metrics = (await call('admin', 'GET', '/api/admin/employer-directory')).data.metrics;
  assert.equal(metrics.liveRevenueCents, 4900);
  assert.equal(metrics.testRevenueCents, 4900);
});

test('production rejects test billing and hides historical test ads without weakening public review gates', async (t) => {
  const { call, restart } = await serverFor(t),
    id = await approvedListing(call),
    order = await orderFor(call, id);
  await payTest(call, order);
  await restart({ production: true });
  assert.equal((await call('anon', 'GET', '/api/directory/jobs/' + id)).status, 404);
  assert.equal((await call('owner', 'POST', '/api/employer/orders/' + order.id + '/test-pay')).status, 503);
  const id2 = await approvedListing(call, { title: 'Production test cannot charge' });
  assert.equal((await call('owner', 'POST', '/api/employer/listings/' + id2 + '/orders')).status, 503);
  assert.equal((await call('owner', 'GET', '/api/employer')).data.plan.available, false);
});

test('moderation decisions bind to the visible content and pending cancellation never cancels paid invoices', async (t) => {
  const { call } = await serverFor(t);
  await call('owner', 'PUT', '/api/employer/profile', profile);
  const made = await call('owner', 'POST', '/api/employer/listings', listing()),
    id = made.data.listing.id;
  await call('owner', 'POST', '/api/employer/listings/' + id + '/submit');
  const old = (await call('admin', 'GET', '/api/admin/employer-directory')).data.listings.find(
    (item) => item.id === id
  );
  assert.equal(
    (await call('admin', 'POST', '/api/admin/employer-directory/listings/' + id + '/review', { decision: 'approved' }))
      .status,
    400
  );
  await call('owner', 'PUT', '/api/employer/listings/' + id, {
    description: 'The employer changed the requested deliverables after the Admin preview.'
  });
  const stale = await call('admin', 'POST', '/api/admin/employer-directory/listings/' + id + '/review', {
    decision: 'approved',
    reviewToken: old.reviewToken
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.error.code, 'review_changed');
  assert.equal((await call('owner', 'POST', '/api/employer/listings/' + id + '/orders')).status, 409);
  assert.equal((await review(call, id)).status, 200);
  const first = await orderFor(call, id);
  assert.equal((await call('other', 'POST', '/api/employer/orders/' + first.id + '/cancel')).status, 404);
  const cancelled = await call('owner', 'POST', '/api/employer/orders/' + first.id + '/cancel');
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.order.status, 'cancelled');
  assert.equal((await call('owner', 'POST', '/api/employer/orders/' + first.id + '/cancel')).status, 200);
  assert.equal((await call('owner', 'POST', '/api/employer/orders/' + first.id + '/test-pay')).status, 409);
  const replacement = await orderFor(call, id);
  assert.notEqual(replacement.id, first.id);
  await payTest(call, replacement);
  assert.equal(
    (await call('owner', 'POST', '/api/employer/orders/' + replacement.id + '/cancel')).status,
    409,
    'a paid invoice requires separate Admin refund reconciliation'
  );
  const secondId = await approvedListing(call, { title: 'Unpaid closure role' }),
    secondInvoice = await orderFor(call, secondId);
  await call('owner', 'POST', '/api/employer/listings/' + secondId + '/close');
  assert.equal(
    (await call('owner', 'GET', '/api/employer')).data.orders.find((item) => item.id === secondInvoice.id).status,
    'cancelled'
  );
  const thirdId = await approvedListing(call, { title: 'Unpaid archival role' }),
    thirdInvoice = await orderFor(call, thirdId);
  await call('owner', 'DELETE', '/api/employer/listings/' + thirdId);
  assert.equal(
    (await call('owner', 'GET', '/api/employer')).data.orders.find((item) => item.id === thirdInvoice.id).status,
    'cancelled'
  );
});

test('old pending reviews and current invoices remain accessible ahead of bounded history', async (t) => {
  const { call, databaseFile } = await serverFor(t, 'manual');
  await call('admin', 'PUT', '/api/admin/employer-directory/settings', {
    invoiceInstructions: 'Use the approved invoice instructions supplied by billing.'
  });
  const reviewId = await approvedListing(call, { title: 'Old submitted review' });
  await call('owner', 'PUT', '/api/employer/listings/' + reviewId, {
    title: 'Old submitted review still needs decision'
  });
  const invoiceId = await approvedListing(call, { title: 'Old pending invoice still actionable' }),
    invoice = await orderFor(call, invoiceId);
  const employer = (await call('owner', 'GET', '/api/employer')).data.profile;
  // Seed a real historical SQLite corpus; assertions still use the HTTP owner/Admin boundary.
  // API throttling is left intact, so disposable archival history is fixture setup, not a rate-limit bypass.
  const { DatabaseSync } = require('node:sqlite');
  const fixture = new DatabaseSync(databaseFile);
  fixture.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;');
  const addListing = fixture.prepare(
    "INSERT INTO employer_listings(employer_id,company_name,title,description,category,work_mode,location,state,compensation,status,review_status,created_at,updated_at) VALUES(?,?,?,'Historical archived employer listing','editing','remote','','','Historical rate','archived','approved',?,?)"
  );
  const addOrder = fixture.prepare(
    "INSERT INTO employer_listing_orders(id,listing_id,price_cents,currency,duration_days,invoice_instructions,status,test,created_at) VALUES(?,?,4900,'USD',30,'Historical test invoice','cancelled',1,?)"
  );
  const point = fixture.prepare('UPDATE employer_listings SET active_order_id=? WHERE id=?');
  fixture.exec('BEGIN IMMEDIATE');
  for (let i = 0; i < 205; i++) {
    const now = Date.now() + i + 1;
    const result = addListing.run(employer.id, 'Historical Company', 'Archived history ' + i, now, now);
    const id = Number(result.lastInsertRowid),
      orderId = 'history_' + i;
    addOrder.run(orderId, id, now);
    point.run(orderId, id);
  }
  fixture.exec('COMMIT');
  fixture.close();
  const admin = await call('admin', 'GET', '/api/admin/employer-directory');
  assert.equal(admin.data.listings.length, 200);
  assert.equal(admin.data.listings[0].id, reviewId, 'submitted pending review appears before archival history');
  assert.equal(admin.data.orders.length, 200);
  assert.equal(admin.data.orders[0].id, invoice.id, 'old pending live invoice appears before cancelled test history');
  const owner = await call('owner', 'GET', '/api/employer');
  assert.equal(owner.data.orders.length, 100);
  assert.equal(owner.data.orders[0].id, invoice.id, 'current owner invoice remains visible to the portal');
  assert.equal(owner.data.listings.find((item) => item.id === invoiceId).activeOrderId, invoice.id);
});

test('exact Admin lookup keeps all listings, receipts and employers actionable beyond summary capacity', async (t) => {
  const { call, databaseFile } = await serverFor(t),
    firstListing = await approvedListing(call),
    firstOrder = await orderFor(call, firstListing);
  await payTest(call, firstOrder);
  const firstEmployer = (await call('owner', 'GET', '/api/employer')).data.profile;
  const { DatabaseSync } = require('node:sqlite'),
    fixture = new DatabaseSync(databaseFile);
  fixture.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;');
  const passHash = fixture.prepare('SELECT pass_hash FROM users WHERE email=?').get('fan@demo.x3star.local').pass_hash;
  const userInsert = fixture.prepare("INSERT INTO users(email,name,pass_hash,econ,created_at) VALUES(?,?,?,'{}',?)");
  const employerInsert = fixture.prepare(
    'INSERT INTO employer_accounts(user_id,company_name,created_at,updated_at) VALUES(?,?,?,?)'
  );
  const listingInsert = fixture.prepare(
    "INSERT INTO employer_listings(employer_id,company_name,title,description,category,work_mode,location,state,compensation,status,review_status,created_at,updated_at) VALUES(?,?,?,'Paid directory history fixture with a real SQLite row.','editing','remote','','','Scope discussed','open','approved',?,?)"
  );
  const orderInsert = fixture.prepare(
    "INSERT INTO employer_listing_orders(id,listing_id,price_cents,currency,duration_days,status,test,reference,created_at,paid_at,activated_at,expires_at) VALUES(?,?,4900,'USD',30,'paid',1,?,?,?,?,?)"
  );
  const point = fixture.prepare('UPDATE employer_listings SET active_order_id=? WHERE id=?');
  let latestEmployer, latestListing, latestOrder;
  fixture.exec('BEGIN IMMEDIATE');
  // Make the original cohort the oldest history so bounded newest-first summaries omit it.
  const oldest = Date.now() - 2000;
  fixture
    .prepare('UPDATE employer_listings SET created_at=?,updated_at=? WHERE id=?')
    .run(oldest, oldest, firstListing);
  fixture.prepare('UPDATE employer_listing_orders SET created_at=? WHERE id=?').run(oldest, firstOrder.id);
  fixture
    .prepare('UPDATE employer_accounts SET created_at=?,updated_at=? WHERE id=?')
    .run(oldest, oldest, firstEmployer.id);
  for (let i = 0; i < 205; i++) {
    const now = Date.now() - 1000 + i;
    const user = Number(
      userInsert.run('capacity-' + i + '@example.test', 'capacity_user_' + i, passHash, now).lastInsertRowid
    );
    latestEmployer = Number(employerInsert.run(user, 'Capacity Employer ' + i, now, now).lastInsertRowid);
    latestListing = Number(
      listingInsert.run(latestEmployer, 'Capacity Employer ' + i, 'Capacity role ' + i, now, now).lastInsertRowid
    );
    latestOrder = 'capacity_' + i;
    orderInsert.run(latestOrder, latestListing, 'capacity_receipt_' + i, now, now, now, Date.now() + 30 * 86400000);
    point.run(latestOrder, latestListing);
  }
  fixture.exec('COMMIT');
  fixture.close();
  const summary = (await call('admin', 'GET', '/api/admin/employer-directory')).data;
  assert.equal(summary.listings.length, 200);
  assert.equal(summary.orders.length, 200);
  assert.equal(summary.employers.length, 200);
  assert.ok(
    !summary.listings.some((item) => item.id === latestListing) ||
      !summary.listings.some((item) => item.id === firstListing),
    'at least one boundary listing is absent from bounded summary'
  );
  assert.ok(!summary.orders.some((item) => item.id === firstOrder.id));
  assert.ok(!summary.employers.some((item) => item.id === firstEmployer.id));
  const targets = [
    ['listing', firstListing, 'listing'],
    ['listing', latestListing, 'listing'],
    ['order', firstOrder.id, 'order'],
    ['order', latestOrder, 'order'],
    ['employer', firstEmployer.id, 'profile'],
    ['employer', latestEmployer, 'profile']
  ];
  for (const [type, value, key] of targets) {
    const route = '/api/admin/employer-directory/lookup?type=' + type + '&id=' + encodeURIComponent(value);
    assert.equal((await call('owner', 'GET', route)).status, 403);
    const found = await call('admin', 'GET', route);
    assert.equal(found.status, 200, route);
    assert.equal(found.headers.get('cache-control'), 'no-store');
    assert.equal(found.data[key].id, value);
  }
  assert.equal(
    (await call('anon', 'GET', '/api/directory/jobs/' + latestListing)).status,
    200,
    'paid newest job remains public regardless summary capacity'
  );
  const lastReceipt = (await call('admin', 'GET', '/api/admin/employer-directory/lookup?type=order&id=' + latestOrder))
    .data.order;
  assert.equal(
    (
      await call('admin', 'POST', '/api/admin/employer-directory/orders/' + lastReceipt.id + '/refund', {
        reference: 'capacity-last-refund',
        note: 'Test reconciliation only'
      })
    ).status,
    200
  );
  assert.equal(
    (await call('anon', 'GET', '/api/directory/jobs/' + latestListing)).status,
    404,
    'looked-up receipt can be revoked through existing action'
  );
  for (const query of ['type=listing&id=999999999', 'type=order&id=unknown_order', 'type=employer&id=999999999'])
    assert.equal((await call('admin', 'GET', '/api/admin/employer-directory/lookup?' + query)).status, 404, query);
  for (const query of [
    'type=users&id=1',
    'type=listing&id=1%20OR%201=1',
    'type=order&id=' + 'x'.repeat(81),
    'type=order&id=a%27b',
    'type=employer&id=-1',
    'type=listing&id=1&id=2'
  ])
    assert.equal((await call('admin', 'GET', '/api/admin/employer-directory/lookup?' + query)).status, 400, query);
});
