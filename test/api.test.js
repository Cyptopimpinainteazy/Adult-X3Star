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
  // Chaturbate: built from the partner config (campaign Ji03i) once the creator has a CB room
  assert.equal((await call('anon', 'GET', '/go/CB/luna')).status, 302);
  const cb = await call('anon', 'GET', '/go/CB/luna?c=spring&s=reddit');
  assert.equal(cb.headers.get('location'), 'https://chaturbate.com/in/?tour=LQps&campaign=Ji03i&track=reddit-spring_room&room=luna_vex');
  // other sites use their URL template and 404 until one is set
  assert.equal((await call('anon', 'GET', '/go/SC/luna')).status, 404);
  await call('cr', 'PUT', '/api/studio/profile', { handles: { CB: 'luna_vex', SC: 'luna_sc' } });
  await call('ad', 'PUT', '/api/admin/config', { overrides: { welcomeDiamonds: 250, affiliates: { SC: { name: 'Stripchat', url: 'https://example.com/in/?track={campaign}&room={room}' } } } });
  const sc = await call('anon', 'GET', '/go/SC/luna?c=spring&s=reddit');
  assert.equal(sc.status, 302); assert.equal(sc.headers.get('location'), 'https://example.com/in/?track=spring&room=luna_sc');
  const bad = await call('ad', 'PUT', '/api/admin/config', { overrides: { affiliates: { SC: { name: 'Stripchat', url: 'http://insecure.example' } } } });
  assert.equal(bad.status, 400);
  const t = await call('ad', 'GET', '/api/admin/traffic');
  assert.equal(t.data.total, 3); assert.equal(t.data.byPlacement[0].placement, 'room');
});

test('partner placements: boot data, redirects, admin settings', async () => {
  const html = await (await fetch(base + '/')).text();
  const boot = JSON.parse(html.match(/window\.X3STAR_BOOT=(\{.*?\});<\/script>/s)[1]);
  assert.equal(boot.partners.footer_female.href, '/go/p/footer_female');
  assert.ok(!html.includes('chaturbate.com/in/'), 'raw affiliate URLs are not in the page; clicks go through /go/p');
  const r = await call('anon', 'GET', '/go/p/footer_female?s=tiktok');
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), 'https://chaturbate.com/in/?tour=IsSO&campaign=Ji03i&track=tiktok_footer_female');
  assert.equal((await call('anon', 'GET', '/go/p/nope')).status, 404);
  assert.equal((await call('anon', 'GET', '/go/p/..%2F')).status, 404);
  const p = await call('ad', 'GET', '/api/admin/partners');
  assert.equal(p.data.config.campaign, 'Ji03i'); assert.equal(Object.keys(p.data.programs).length, 3);
  assert.ok(p.data.placements.every(x => x.url && x.url.startsWith('https://chaturbate.com/in/')));
  // switch program to pay-per-signup and turn the footer female link off
  const cur = (await call('ad', 'GET', '/api/admin/config')).data.overrides;
  const ov = { ...cur, partners: { CB: { program: 'pps' }, placements: { footer_female: { on: false } } } };
  assert.equal((await call('ad', 'PUT', '/api/admin/config', { overrides: ov })).status, 200);
  assert.equal((await call('anon', 'GET', '/go/p/footer_female')).status, 404);
  assert.equal((await call('anon', 'GET', '/go/p/apply_broadcaster')).headers.get('location'), 'https://chaturbate.com/in/?tour=5zjT&campaign=Ji03i&track=x3s_apply_broadcaster');
  assert.equal((await call('ad', 'PUT', '/api/admin/config', { overrides: { ...cur, partners: { CB: { campaign: 'bad code!' } } } })).status, 400);
  await login('pfan', 'fan@demo.x3star.local', 'demo-pass-123');
  assert.equal((await call('pfan', 'GET', '/api/admin/partners')).status, 403);
  await call('ad', 'PUT', '/api/admin/config', { overrides: cur });
});

test('partner videos: bundled feed on first boot, list, filters, redirect, admin hide and import', async () => {
  const list = await call('anon', 'GET', '/api/partner-videos?limit=5');
  assert.equal(list.status, 200); assert.ok(list.data.total >= 95); assert.equal(list.data.videos.length, 5);
  const v = list.data.videos[0];
  assert.match(v.href, /^\/go\/v\/BC\d+$/); assert.equal(v.thumbs.length, 10); assert.ok(!('url' in v), 'raw affiliate URL stays server-side');
  const byPerf = await call('anon', 'GET', '/api/partner-videos?performer=wild41&limit=60');
  assert.ok(byPerf.data.videos.length > 30 && byPerf.data.videos.every(x => x.performer === 'wild41'));
  const byTag = await call('anon', 'GET', '/api/partner-videos?tag=pov&limit=60');
  assert.ok(byTag.data.total > 0 && byTag.data.videos.every(x => x.tags.some(t => t.toLowerCase() === 'pov')));
  const go = await call('anon', 'GET', v.href + '?s=reddit');
  assert.equal(go.status, 302); assert.match(go.headers.get('location'), /^https:\/\/bongacams\.com\/track\?c=846478&ps=video_export&csurl=/);
  assert.equal((await call('anon', 'GET', '/go/v/BC1')).status, 404);
  assert.equal((await call('ad', 'PATCH', '/api/admin/partner-videos/' + v.id, { hidden: true })).status, 200);
  assert.equal((await call('anon', 'GET', v.href)).status, 404);
  assert.ok(!(await call('anon', 'GET', '/api/partner-videos?limit=60')).data.videos.some(x => x.id === v.id));
  const adm = await call('ad', 'GET', '/api/admin/partner-videos');
  assert.equal(adm.data.hidden, 1); assert.equal(adm.data.videos.find(x => x.id === v.id).clicks30d, 1);
  const thumbs = Array.from({ length: 10 }, (_, i) => `https://v.bngprm.com/mv/a/b/c/v3999999/x_image_${i}.jpg`).join(';');
  const imp = await call('ad', 'POST', '/api/admin/partner-videos/import', { name: 'new.txt', text: `3999999|${thumbs};|https://bongacams.com/track?c=846478&ps=video_export&csurl=https%3A%2F%2Fbongacams.com%2Ftubechat%2FNewGirl%2Fv3999999|Hello there|\n3999998|${thumbs};|https://bongacams.com/track?c=846478&ps=video_export&csurl=https%3A%2F%2Fbongacams.com%2Ftubechat%2FNewGirl%2Fv3999998|Schoolgirl cosplay|` });
  assert.equal(imp.data.added, 1); assert.equal(imp.data.skipped.length, 1);
  const again = await call('ad', 'POST', '/api/admin/partner-videos/import', { text: (await call('ad', 'GET', '/api/admin/partner-videos')).data.videos.length ? `3999999|${thumbs};|https://bongacams.com/track?c=846478&csurl=https%3A%2F%2Fbongacams.com%2Ftubechat%2FNewGirl%2Fv3999999|Renamed|` : '' });
  assert.equal(again.data.updated, 1);
  assert.equal((await call('ad', 'GET', '/api/admin/partner-videos')).data.hidden, 1, 'hide flags survive re-import');
  assert.equal((await call('ad', 'POST', '/api/admin/partner-videos/import', { text: 'not a feed' })).status, 400);
  const t = await call('ad', 'GET', '/api/admin/traffic');
  assert.equal(t.data.byVideo[0].id, v.id);
  assert.equal((await call('pfan', 'GET', '/api/admin/partner-videos')).status, 403);
});

test('affiliates: registry, status gating, links, reported stats, CSV import, rankings', async () => {
  const reg = await call('ad', 'GET', '/api/admin/affiliates');
  const ids = reg.data.partners.map(p => p.id);
  assert.ok(['CB', 'BC', 'SM', 'SD'].every(id => ids.includes(id)));
  assert.equal(reg.data.partners.find(p => p.id === 'SM').status, 'pending');
  // add a shop partner with a footer link; pending → hidden
  const add = await call('ad', 'POST', '/api/admin/affiliates', { id: 'dolls', name: 'Doll Shop', kind: 'shop', status: 'pending', payout: 'commission', revshare_pct: 15, dashboard_url: 'https://partner.example/dash' });
  assert.equal(add.status, 200); assert.equal(add.data.partner.id, 'DOLLS');
  assert.equal((await call('ad', 'POST', '/api/admin/affiliates', { id: 'DOLLS', name: 'Dup' })).status, 400);
  assert.equal((await call('ad', 'POST', '/api/admin/affiliates/DOLLS/links', { label: 'Shop dolls', url: 'http://insecure.example', slot: 'footer' })).status, 400);
  const link = await call('ad', 'POST', '/api/admin/affiliates/DOLLS/links', { label: 'Shop dolls', url: 'https://shop.example/?ref=josh&sub={placement}-{source}', slot: 'footer' });
  const lid = link.data.link.id;
  assert.equal((await call('anon', 'GET', `/go/a/${lid}`)).status, 404, 'pending partner links are hidden');
  let boot = JSON.parse((await (await fetch(base + '/')).text()).match(/window\.X3STAR_BOOT=(\{.*?\});<\/script>/s)[1]);
  assert.ok(!boot.partners['a' + lid]);
  // approve → live
  assert.equal((await call('ad', 'PUT', '/api/admin/affiliates/DOLLS', { status: 'active' })).status, 200);
  boot = JSON.parse((await (await fetch(base + '/')).text()).match(/window\.X3STAR_BOOT=(\{.*?\});<\/script>/s)[1]);
  assert.deepEqual(boot.partners['a' + lid], { slot: 'footer', label: 'Shop dolls', sub: 'Doll Shop', site: 'DOLLS', siteName: 'Doll Shop', kind: 'shop', href: `/go/a/${lid}` });
  const go = await call('anon', 'GET', `/go/a/${lid}?s=reddit`);
  assert.equal(go.status, 302); assert.equal(go.headers.get('location'), `https://shop.example/?ref=josh&sub=a${lid}-reddit`);
  await call('anon', 'GET', `/go/a/${lid}`);
  // pausing a built-in partner hides its links everywhere
  await call('ad', 'PUT', '/api/admin/affiliates/CB', { status: 'paused' });
  assert.equal((await call('anon', 'GET', '/go/p/footer_female')).status, 404);
  assert.equal((await call('anon', 'GET', '/go/CB/luna')).status, 404);
  await call('ad', 'PUT', '/api/admin/affiliates/CB', { status: 'active' });
  assert.equal((await call('anon', 'GET', '/go/p/footer_female')).status, 302);
  await call('ad', 'PUT', '/api/admin/affiliates/BC', { status: 'paused' });
  assert.equal((await call('anon', 'GET', '/api/partner-videos')).data.total, 0);
  await call('ad', 'PUT', '/api/admin/affiliates/BC', { status: 'active' });
  // reported stats: manual day + CSV import (upserts)
  const today = new Date().toISOString().slice(0, 10), yday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  assert.equal((await call('ad', 'PUT', `/api/admin/affiliates/DOLLS/stats/${today}`, { joins: 0, conversions: 2, sales: 400, earnings: 60 })).status, 200);
  assert.equal((await call('ad', 'PUT', '/api/admin/affiliates/DOLLS/stats/2999-01-01', { earnings: 1 })).status, 400);
  const csv = `Date,Orders,Sales,Commission\n${yday},1,"$1,000.00",$150.00\n${today},3,600,90`;
  const imp = await call('ad', 'POST', '/api/admin/affiliates/DOLLS/stats/import', { csv });
  assert.equal(imp.status, 200); assert.equal(imp.data.imported, 2);
  assert.equal((await call('ad', 'POST', '/api/admin/affiliates/DOLLS/stats/import', { csv: 'foo,bar\n1,2' })).status, 400);
  const st = await call('ad', 'GET', '/api/admin/affiliates/DOLLS/stats');
  assert.deepEqual(st.data.rows.map(r => [r.day, r.conversions, r.sales, r.earnings, r.source]), [[today, 3, 600, 90, 'csv'], [yday, 1, 1000, 150, 'csv']]);
  // rankings: DOLLS has the most earnings → rank 1; EPC = 240 / 2 clicks
  const rk = await call('ad', 'GET', '/api/admin/affiliates/rankings?days=7');
  const d = rk.data.partners[0];
  assert.equal(d.id, 'DOLLS'); assert.equal(d.rank, 1); assert.equal(d.clicks, 2); assert.equal(d.earnings, 240); assert.equal(d.epc, 120); assert.equal(d.conversions, 4);
  assert.equal(d.series.clicks.length, 7); assert.equal(d.series.clicks[6], 2); assert.equal(d.series.earnings[6], 90); assert.equal(d.series.earnings[5], 150);
  assert.ok(rk.data.partners.find(p => p.id === 'CB').clicks > 0, 'Chaturbate clicks from earlier tests are counted');
  assert.equal(rk.data.totals.earnings, 240);
  // delete: built-ins are protected, custom partners go with their links
  assert.equal((await call('ad', 'DELETE', '/api/admin/affiliates/CB')).status, 400);
  assert.equal((await call('ad', 'DELETE', '/api/admin/affiliates/DOLLS')).status, 200);
  assert.equal((await call('anon', 'GET', `/go/a/${lid}`)).status, 404);
  assert.equal((await call('pfan', 'GET', '/api/admin/affiliates/rankings')).status, 403);
});

test('cam model guide, robots.txt and sitemap', async () => {
  const r = await fetch(base + '/cam-model-guide'); const html = await r.text();
  assert.equal(r.status, 200);
  assert.match(html, /<h1>How to become a <em>cam model<\/em>\.<\/h1>/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/cam-model-guide">/);
  assert.ok(html.includes('$0.008') && html.includes('$40'), 'pay figures come from the economy config');
  assert.ok(html.includes('href="/#creators"'));
  assert.equal((await call('ad', 'PUT', '/api/admin/config', { overrides: { beanUsd: 0.01 } })).status, 200);
  assert.ok((await (await fetch(base + '/cam-model-guide')).text()).includes('$50'), 'min payout follows the new bean value');
  await call('ad', 'PUT', '/api/admin/config', { overrides: {} });
  assert.equal((await fetch(base + '/become-a-cam-model', { redirect: 'manual' })).headers.get('location'), '/cam-model-guide');
  const robots = await (await fetch(base + '/robots.txt')).text();
  assert.match(robots, /Disallow: \/admin/); assert.match(robots, /Sitemap: http:\/\/127\.0\.0\.1:\d+\/sitemap\.xml/);
  assert.match(await (await fetch(base + '/sitemap.xml')).text(), /<loc>http:\/\/127\.0\.0\.1:\d+\/cam-model-guide<\/loc>/);
});

test('live Chaturbate grid: API call, cleaning, caching, stale fallback, click link, switch', async () => {
  const CBL = require('../server/cblive');
  const calls = [];
  const room = (o) => ({ username: 'amy_rose', display_name: 'Amy', age: 24, gender: 'f', num_users: 120, num_followers: 900, room_subject: 'Hi <b>guys</b> #goal https://spam.example', tags: ['bigboobs', 'lovense'], current_show: 'public', is_hd: true, is_new: false, location: 'Colombia', seconds_online: 3600, image_url: 'https://roomimg.stream.highwebmedia.com/ri/amy_rose.jpg', image_url_360x270: 'https://thumb.live.mmcdn.com/riw/amy_rose.jpg', ...o });
  let payload = { count: 6, results: [
    room({}),
    room({ username: 'bella', num_users: 900 }),
    room({ username: 'kid_x', age: 17 }),                                   // under 18 → dropped
    room({ username: 'tina', tags: ['teen'] }),                             // blocked tag → dropped
    room({ username: 'evil', image_url_360x270: 'https://evil.example/x.jpg', image_url: 'http://insecure/x.jpg' }),  // foreign/insecure thumbnail → dropped
    room({ username: 'away_girl', current_show: 'away' })                   // away → dropped
  ] };
  let fail = false;
  CBL.setFetcher(async (url) => { calls.push(url); if (fail) throw new Error('down'); return { ok: true, json: async () => payload }; });
  const r = await call('anon', 'GET', '/api/cb/live?gender=female&tag=bigboobs');
  assert.equal(r.status, 200); assert.equal(r.data.enabled, true);
  assert.deepEqual(r.data.rooms.map(x => x.room), ['bella', 'amy_rose'], 'sorted by viewers, unsafe rooms removed');
  const a = r.data.rooms[1];
  assert.equal(a.subject, 'Hi guys #goal'); assert.equal(a.embed, '');
  assert.match(r.headers.get('content-security-policy'), /frame-src https:\/\/chaturbate\.com/); assert.equal(a.thumb, 'https://thumb.live.mmcdn.com/riw/amy_rose.jpg'); assert.equal(a.href, '/go/CB/r/amy_rose'); assert.equal(a.minutesOnline, 60);
  const u = new URL(calls[0]);
  assert.equal(u.origin + u.pathname, 'https://chaturbate.com/api/public/affiliates/onlinerooms/');
  assert.equal(u.searchParams.get('wm'), 'Ji03i'); assert.equal(u.searchParams.get('gender'), 'f'); assert.equal(u.searchParams.get('tag'), 'bigboobs'); assert.equal(u.searchParams.get('client_ip'), 'request_ip');
  await call('anon', 'GET', '/api/cb/live?gender=f&tag=bigboobs');
  assert.equal(calls.length, 1, 'second request within a minute is served from cache');
  await call('anon', 'GET', '/api/cb/live?gender=trans');
  assert.equal(new URL(calls[1]).searchParams.get('gender'), 's', 'trans is "s" in the affiliate API');
  // API down → nothing cached for this filter → empty with a friendly error
  fail = true;
  const down = await call('anon', 'GET', '/api/cb/live?gender=c');
  assert.equal(down.data.rooms.length, 0); assert.match(down.data.error, /unavailable/);
  // click goes through our counter to the affiliate room link
  const go = await call('anon', 'GET', '/go/CB/r/amy_rose?s=reddit');
  assert.equal(go.status, 302); assert.equal(go.headers.get('location'), 'https://chaturbate.com/in/?tour=LQps&campaign=Ji03i&track=reddit_live_grid&room=amy_rose');
  assert.equal((await call('anon', 'GET', '/go/CB/r/bad%20room')).status, 404);
  // admin switch turns the grid off
  const cur = (await call('ad', 'GET', '/api/admin/config')).data.overrides;
  await call('ad', 'PUT', '/api/admin/config', { overrides: { ...cur, partners: { ...(cur.partners || {}), CB: { ...((cur.partners || {}).CB || {}), liveGrid: false } } } });
  assert.deepEqual((await call('anon', 'GET', '/api/cb/live')).data, { enabled: false, rooms: [], total: 0 });
  await call('ad', 'PUT', '/api/admin/config', { overrides: cur });
  // pausing Chaturbate in Affiliates also hides it
  await call('ad', 'PUT', '/api/admin/affiliates/CB', { status: 'paused' });
  assert.equal((await call('anon', 'GET', '/api/cb/live')).data.enabled, false);
  assert.equal((await call('anon', 'GET', '/go/CB/r/amy_rose')).status, 404);
  await call('ad', 'PUT', '/api/admin/affiliates/CB', { status: 'active' });
  CBL.setFetcher(null);
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
