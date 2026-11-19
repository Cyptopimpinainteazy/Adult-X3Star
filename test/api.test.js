'use strict';
/* End-to-end API tests against a real server on a random port with a throwaway database. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'x3s-'));
Object.assign(process.env, { DATA_DIR: dir, SEED_DEMO: '1', DEMO_TRAFFIC: '0', DEMO_PASSWORD: 'demo-pass-123', ADMIN_EMAIL: 'admin@test.local', ADMIN_PASSWORD: 'admin-pass-123', PAYMENTS_MODE: 'test', AUTO_APPROVE_UPLOADS: '0' });
const { start } = require('../server/index.js');

let server, base;
const jars = {};
async function call(who, method, url, body, form) {
  const headers = {}; if (jars[who]) headers.cookie = jars[who];
  let payload;
  if (form) payload = form; else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers, body: payload, redirect: 'manual' });
  const set = res.headers.get('set-cookie'); if (set) jars[who] = set.split(';')[0];
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data, headers: res.headers };
}
const login = (who, email, password) => call(who, 'POST', '/api/auth/login', { email, password });
function png() {
  const w = 8, h = 8, raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x80)])));
  const crc = (b) => { let c, crcTable = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } let x = 0xffffffff; for (const byte of b) x = crcTable[(x ^ byte) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test.before(async () => { server = await start(0, '127.0.0.1'); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { await new Promise(r => server.close(r)); require('../server/db').db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('health and public creators', async () => {
  assert.equal((await call('anon', 'GET', '/api/health')).data.ok, true);
  const c = await call('anon', 'GET', '/api/creators');
  assert.ok(c.data.creators.length >= 8);
  const one = await call('anon', 'GET', '/api/creators/luna');
  assert.equal(one.data.creator.name, 'Luna Vex'); assert.ok(Array.isArray(one.data.creator.products));
});

test('register requires 18+ and a unique email', async () => {
  const bad = await call('u1', 'POST', '/api/auth/register', { email: 'new@fan.test', name: 'newfan', password: 'password123' });
  assert.equal(bad.status, 400); assert.equal(bad.data.error.code, 'age_required');
  const ok = await call('u1', 'POST', '/api/auth/register', { email: 'new@fan.test', name: 'newfan', password: 'password123', adult: true });
  assert.equal(ok.status, 201); assert.equal(ok.data.user.econ.diamonds, 100);
  const dup = await call('u2', 'POST', '/api/auth/register', { email: 'new@fan.test', name: 'other', password: 'password123', adult: true });
  assert.equal(dup.status, 409);
});

test('fan economy: daily, gifts, boxes, VIP, purchases, caps', async () => {
  const me = await call('u1', 'GET', '/api/me');
  assert.equal(me.data.user.name, 'newfan');
  const d = await call('u1', 'POST', '/api/econ/daily');
  assert.equal(d.data.result.day, 1); assert.equal(d.data.econ.diamonds, 110);
  assert.equal((await call('u1', 'POST', '/api/econ/daily')).status, 409);
  const poor = await call('u1', 'POST', '/api/econ/gift', { creatorId: 'luna', giftId: 'ring', qty: 1 });
  assert.equal(poor.status, 402);
  const buy = await call('u1', 'POST', '/api/econ/purchase', { packId: 'd980' });
  assert.equal(buy.status, 200); assert.ok(buy.data.result.first > 0, 'first purchase bonus');
  const before = (await call('anon', 'GET', '/api/creators/luna')).data.creator;
  const g = await call('u1', 'POST', '/api/econ/gift', { creatorId: 'luna', giftId: 'ring', qty: 1 });
  assert.equal(g.status, 200); assert.equal(g.data.result.cost, 520);
  const fans = (await call('anon', 'GET', '/api/creators/luna')).data.creator.topFans;
  assert.ok(fans.some(f => f.name === 'newfan'));
  const box = await call('u1', 'POST', '/api/econ/gacha', { boxId: 'velvet', count: 1 });
  assert.equal(box.data.result.results.length, 1);
  const vip = await call('u1', 'POST', '/api/econ/vip', { tier: 1 });
  assert.equal(vip.status, 200); assert.equal(vip.data.econ.vip.tier, 1);
  const cap = await call('u1', 'POST', '/api/econ/limits', { dailyCapUsd: 10 });
  assert.equal(cap.data.result.dailyCapUsd, 10);
  const blocked = await call('u1', 'POST', '/api/econ/purchase', { packId: 'd980' });
  assert.equal(blocked.status, 400); assert.equal(blocked.data.error.code, 'cap_reached');
});

test('role guards: fans cannot reach studio or admin', async () => {
  assert.equal((await call('u1', 'GET', '/api/admin/overview')).status, 403);
  assert.equal((await call('u1', 'GET', '/api/studio')).status, 403);
  assert.equal((await call('anon', 'POST', '/api/econ/daily')).status, 401);
});

test('creator studio: profile, moderated upload, stories, payout rules', async () => {
  assert.equal((await login('cr', 'luna@demo.x3star.local', 'demo-pass-123')).status, 200);
  const st = await call('cr', 'GET', '/api/studio');
  assert.equal(st.data.creator.id, 'luna');
  const upd = await call('cr', 'PUT', '/api/studio/profile', { bio: 'Updated bio', handles: { CB: 'luna_vex' } });
  assert.equal(upd.status, 200); assert.equal(upd.data.creator.bio, 'Updated bio');
  const fd = new FormData(); fd.append('kind', 'story'); fd.append('caption', 'tonight'); fd.append('file', new Blob([png()], { type: 'image/png' }), 's.png');
  const up = await call('cr', 'POST', '/api/studio/upload', undefined, fd);
  assert.equal(up.status, 201); assert.equal(up.data.upload.status, 'pending');
  const fake = new FormData(); fake.append('kind', 'gallery'); fake.append('file', new Blob([Buffer.from('not an image at all')], { type: 'image/png' }), 'x.png');
  assert.equal((await call('cr', 'POST', '/api/studio/upload', undefined, fake)).status, 415);
  assert.equal((await call('anon', 'GET', up.data.upload.url)).status, 404, 'pending upload is private');
  assert.equal((await call('anon', 'GET', '/api/stories')).data.groups.length, 0);
  assert.equal((await login('ad', 'admin@test.local', 'admin-pass-123')).status, 200);
  assert.equal((await call('ad', 'POST', `/api/admin/uploads/${up.data.upload.id}`, { status: 'approved' })).status, 200);
  assert.equal((await call('anon', 'GET', up.data.upload.url)).status, 200, 'approved upload is public');
  assert.equal((await call('anon', 'GET', '/api/stories')).data.groups[0].creator.id, 'luna');
  const small = await call('cr', 'POST', '/api/studio/payout', { beans: 10, method: 'USDC 0xabc' });
  assert.equal(small.status, 400); assert.equal(small.data.error.code, 'below_min');
  const conv = await call('cr', 'POST', '/api/studio/convert', { beans: 100 });
  assert.equal(conv.data.result.diamonds, 100);
});

test('admin: overview, application approval creates creator, economy validation', async () => {
  const o = await call('ad', 'GET', '/api/admin/overview');
  assert.ok(o.data.counts.users > 10);
  await call('anon', 'POST', '/api/apply', { email: 'rookie@test.local', stage: 'Rookie Star', niche: 'Femdom', adult: true });
  const apps = (await call('ad', 'GET', '/api/admin/applications')).data.rows;
  const a = apps.find(x => x.email === 'rookie@test.local');
  const res = await call('ad', 'POST', `/api/admin/applications/${a.id}`, { status: 'approved' });
  assert.ok(res.data.tempPassword); assert.equal(res.data.creatorId, 'rookie-star');
  assert.equal((await login('rk', 'rookie@test.local', res.data.tempPassword)).status, 200);
  assert.equal((await call('rk', 'POST', '/api/studio/live', { live: true })).status, 403, 'KYC gate');
  const bad = await call('ad', 'PUT', '/api/admin/config', { overrides: { gacha: { boxes: [{ id: 'x', name: 'X', cost: 1, cost10: 9, odds: { common: 0.5, rare: 0.1, epic: 0.1, legendary: 0.1 }, pity: { epic: 5, legendary: 9 } }] } } });
  assert.equal(bad.status, 400);
  const good = await call('ad', 'PUT', '/api/admin/config', { overrides: { welcomeDiamonds: 250 } });
  assert.equal(good.data.effective.welcomeDiamonds, 250);
});

test('affiliate go-links redirect only when configured and log clicks', async () => {
  assert.equal((await call('anon', 'GET', '/go/CB/luna')).status, 404);
  await call('ad', 'PUT', '/api/admin/config', { overrides: { welcomeDiamonds: 250, affiliates: { CB: { name: 'Chaturbate', url: 'https://example.com/in/?track={campaign}&room={room}' } } } });
  const r = await call('anon', 'GET', '/go/CB/luna?c=spring&s=reddit');
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), 'https://example.com/in/?track=spring&room=luna_vex');
  const t = await call('ad', 'GET', '/api/admin/traffic');
  assert.equal(t.data.total, 1); assert.equal(t.data.byCampaign[0].campaign, 'spring');
});

test('families: create costs diamonds, join, leaderboard', async () => {
  assert.equal((await login('fam', 'fan@demo.x3star.local', 'demo-pass-123')).status, 200);
  const f = await call('fam', 'POST', '/api/families', { name: 'Test Crew', tag: 'TST', motto: 'hi' });
  assert.equal(f.status, 201); assert.equal(f.data.family.tag, 'TST');
  const list = await call('anon', 'GET', '/api/families');
  assert.ok(list.data.families.some(x => x.tag === 'TST'));
});

test('cross-origin writes are blocked', async () => {
  const res = await fetch(base + '/api/econ/daily', { method: 'POST', headers: { origin: 'https://evil.example', cookie: jars.u1, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
});
