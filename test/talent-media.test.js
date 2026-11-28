'use strict';
/* Real HTTP/SQLite and upload moderation. Provider responses are isolated at their fetcher boundary;
   these fixtures do not establish real partner playback, muting or photo ownership in production. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'x3-talent-media-'));
Object.assign(process.env, {
  DATA_DIR: dir,
  DB_FILE: path.join(dir, 'media.db'),
  SITE_URL: '',
  NODE_ENV: 'development',
  JOB_BILLING_MODE: 'disabled',
  COOKIE_SECURE: '0',
  TRUST_PROXY: '0',
  SEED_DEMO: '1',
  DEMO_TRAFFIC: '0',
  AUTO_APPROVE_UPLOADS: '0',
  ADMIN_EMAIL: 'media-admin@example.test',
  ADMIN_PASSWORD: 'media-admin-test-only',
  DEMO_PASSWORD: 'media-demo-test-only'
});
require('../server/seed').seed({ quiet: true });
const { start } = require('../server/index');
const { db, run, get } = require('../server/db');
const CB = require('../server/cblive');
const BC = require('../server/bclive');
let server, base;
const cookies = {};
async function call(who, method, route, body) {
  const headers = {};
  if (cookies[who]) headers.cookie = cookies[who];
  if (body !== undefined && !(body instanceof FormData)) headers['content-type'] = 'application/json';
  const response = await fetch(base + route, {
    method,
    headers,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body)
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
test.before(async () => {
  server = await start(0, '127.0.0.1');
  base = 'http://127.0.0.1:' + server.address().port;
  for (const [who, email, password] of [
    ['admin', 'media-admin@example.test', 'media-admin-test-only'],
    ['luna', 'luna@demo.x3star.local', 'media-demo-test-only'],
    ['raven', 'raven@demo.x3star.local', 'media-demo-test-only']
  ])
    assert.equal((await call(who, 'POST', '/api/auth/login', { email, password })).status, 200);
});
test.after(async () => {
  CB.setFetcher(null);
  BC.setFetcher(null);
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('talent metadata has explicit photo fallbacks and no phantom demo preview endpoints', async () => {
  const response = await call('anon', 'GET', '/api/network/talent');
  assert.equal(response.status, 200);
  for (const person of response.data.talent) {
    assert.equal(person.photo, null);
    assert.equal(person.previewUrl, null);
  }
  const preview = await call('anon', 'GET', '/api/network/talent/luna/preview');
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.data, { available: false, reason: 'demo' });
  assert.equal(preview.headers.get('cache-control'), 'no-store');
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGxkAAAAASUVORK5CYII=',
  'base64'
);
async function upload(who, kind, scope = '') {
  const data = new FormData();
  data.set('kind', kind);
  data.set('file', new Blob([PNG], { type: 'image/png' }), 'fixture.png');
  const response = await call(who, 'POST', '/api/studio/upload' + scope, data);
  assert.equal(response.status, 201);
  return response.data.upload;
}
const profile = async (id = 'luna') => (await call('anon', 'GET', '/api/network/talent/' + id)).data.creator;
async function moderate(image, status = 'approved') {
  assert.equal(
    (await call('admin', 'POST', '/api/admin/uploads/' + image.id, { status, reason: 'Fixture moderation decision' }))
      .status,
    200
  );
}
test('photos require approved same-creator images and support authorized Admin upload-on-behalf', async () => {
  const cover = await upload('luna', 'cover');
  assert.equal((await profile()).photo, null, 'pending photo is private');
  await moderate(cover);
  assert.equal((await profile()).photo.url, cover.url);
  const avatar = await upload('luna', 'avatar');
  assert.equal((await profile()).photo.url, cover.url, 'pending avatar falls back to approved cover');
  await moderate(avatar);
  assert.equal((await profile()).photo.url, avatar.url);
  assert.equal((await fetch(base + avatar.url)).status, 200, 'approved actual fixture file is readable');
  await moderate(avatar, 'rejected');
  assert.equal((await profile()).photo.url, cover.url);
  const foreign = await upload('raven', 'avatar');
  await moderate(foreign);
  run('UPDATE creators SET avatar_upload_id=? WHERE id=?', foreign.id, 'luna');
  assert.equal((await profile()).photo.url, cover.url, 'cross-creator image pointer never qualifies');
  const gallery = await upload('luna', 'gallery');
  await moderate(gallery);
  run('UPDATE creators SET avatar_upload_id=? WHERE id=?', gallery.id, 'luna');
  assert.equal((await profile()).photo.url, cover.url, 'wrong image kind never qualifies');
  const admin = await upload('admin', 'avatar', '?as=luna');
  await moderate(admin);
  assert.equal((await profile()).photo.url, admin.url, 'current Admin uploader is valid for the selected creator');
  const serialized = JSON.stringify(await profile());
  assert.doesNotMatch(serialized, /owner_id|creator_id|avatar_upload_id|handles|uploader|pass_hash|network-admin/);
  assert.ok(
    (await call('anon', 'GET', '/api/network/talent')).data.talent.find((person) => person.id === 'luna').photo.url ===
      admin.url,
    'page and profile share media validation'
  );
  run('UPDATE uploads SET mime=? WHERE id=?', 'video/mp4', admin.id);
  assert.equal((await profile()).photo.url, cover.url, 'video never masquerades as a photo');
  run(
    'UPDATE uploads SET mime=?,owner_id=? WHERE id=?',
    'image/png',
    get('SELECT user_id FROM creators WHERE id=?', 'raven').user_id,
    admin.id
  );
  assert.equal(
    (await profile()).photo.url,
    cover.url,
    'a different ordinary uploader cannot assign a photo to this creator'
  );
});

test('strict adapter mode rejects unknown/private status without sharing legacy cache entries', async () => {
  const raw = {
    username: 'linked_room',
    age: 25,
    image_url: 'https://img.highwebmedia.com/image.jpg',
    iframe_embed: '<iframe src="https://chaturbate.com/in/?campaign=Ji03i&room=linked_room">'
  };
  CB.setFetcher(async () => ({ ok: true, json: async () => [raw] }));
  assert.equal(
    (await CB.liveRooms({ campaign: 'Ji03i' })).rooms.length,
    1,
    'legacy missing status keeps prior behavior'
  );
  assert.equal(
    (await CB.liveRooms({ campaign: 'Ji03i', publicOnly: true })).rooms.length,
    0,
    'preview cache cannot reuse legacy unknown status'
  );
  assert.equal(CB.normalize({ ...raw, current_show: 'private' }, { publicOnly: true }), null);
  const bonga = {
    username: 'LinkedRoom',
    display_age: 25,
    status: 'online',
    thumbnail_image_big_live: 'https://i.bngcdn.com/image.jpg',
    embed_chat_url: 'https://bngprm.com/chat-frame.php?c=846478&model=LinkedRoom'
  };
  BC.setFetcher(async () => ({ ok: true, json: async () => [bonga] }));
  assert.equal((await BC.liveRooms({ affiliateId: '846478' })).rooms.length, 1);
  assert.equal((await BC.liveRooms({ affiliateId: '846478', publicOnly: true })).rooms.length, 0);
  assert.equal(BC.normalize({ ...bonga, chat_status: 'private' }, { publicOnly: true }), null);
  assert.equal(BC.normalize({ ...bonga, chat_status: 'public', status: '' }, { publicOnly: true }), null);
  CB.setFetcher(null);
  BC.setFetcher(null);
});

const cbRoom = (extra = {}) => ({
  username: 'linked_room',
  age: 25,
  current_show: 'public',
  image_url: 'https://img.highwebmedia.com/image.jpg',
  room_subject: 'Fixture public room',
  iframe_embed: '<iframe src="https://chaturbate.com/in/?campaign=Ji03i&room=linked_room&tour=9oGW">',
  ...extra
});
const bcRoom = (extra = {}) => ({
  username: 'LinkedRoom',
  display_age: 25,
  status: 'online',
  chat_status: 'public',
  thumbnail_image_big_live: 'https://i.bngcdn.com/image.jpg',
  embed_chat_url: 'https://bngprm.com/chat-frame.php?c=846478&model=LinkedRoom',
  ...extra
});
async function configure(handles = { CB: 'linked_room' }, extra = {}) {
  run("UPDATE creators SET demo=0,status='approved',live=1 WHERE id='luna'");
  run('UPDATE users SET banned=0 WHERE id=?', get("SELECT user_id FROM creators WHERE id='luna'").user_id);
  assert.equal((await call('luna', 'PUT', '/api/studio/profile', { handles })).status, 200);
  assert.equal(
    (
      await call('admin', 'PUT', '/api/admin/config', {
        overrides: {
          partners: {
            CB: { enabled: true, liveGrid: true, campaign: 'Ji03i' },
            BC: { liveGrid: true, affiliateId: '846478' }
          },
          ...extra
        }
      })
    ).status,
    200
  );
}
test('resolver returns a minimal exact-room CB descriptor only after fresh public provider lookup', async () => {
  await configure();
  let requests = 0,
    requestUrl;
  CB.setFetcher(async (url) => {
    requests++;
    requestUrl = new URL(url);
    return { ok: true, json: async () => [cbRoom()] };
  });
  const person = await profile();
  assert.equal(person.previewUrl, '/api/network/talent/luna/preview');
  assert.equal(requests, 0, 'metadata rendering never requests provider rooms');
  const response = await call('anon', 'GET', person.previewUrl);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.data.available, true);
  assert.equal(response.data.kind, 'iframe');
  assert.equal(response.data.site, 'CB');
  assert.equal(response.data.href, '/go/CB/r/linked_room');
  assert.equal(response.data.muted, true);
  assert.ok(Math.abs(Date.now() - response.data.checkedAt) < 2000);
  const src = new URL(response.data.src);
  assert.equal(src.hostname, 'chaturbate.com');
  assert.equal(src.searchParams.get('room'), 'linked_room');
  assert.equal(src.searchParams.get('disable_sound'), '1');
  assert.equal(requestUrl.searchParams.get('client_ip'), 'request_ip');
  assert.equal(requests, 1);
  assert.doesNotMatch(
    JSON.stringify(response.data),
    /gender|age|location|room_subject|handles|iframe_embed|owner|upload/
  );
  CB.setFetcher(null);
});

test('BC requires explicit play and provider lookups run concurrently without native or clip fallbacks', async () => {
  await configure({ CB: 'linked_room', BC: 'LinkedRoom' });
  let release, notify;
  const held = new Promise((resolve) => (release = resolve)),
    started = new Promise((resolve) => (notify = resolve));
  let n = 0;
  const fetching = async (site) => {
    if (++n === 2) notify();
    await held;
    if (site === 'CB') throw new Error('Private upstream detail');
    return { ok: true, json: async () => [bcRoom()] };
  };
  CB.setFetcher(() => fetching('CB'));
  BC.setFetcher(() => fetching('BC'));
  const pending = call('anon', 'GET', '/api/network/talent/luna/preview');
  let deadline;
  try {
    await Promise.race([
      started,
      new Promise((_, reject) => {
        deadline = setTimeout(() => reject(new Error('Both providers did not start concurrently')), 1000);
      })
    ]);
  } finally {
    clearTimeout(deadline);
    release();
  }
  const response = await pending;
  assert.equal(response.data.available, true);
  assert.equal(response.data.site, 'BC');
  assert.equal(response.data.muted, false);
  assert.equal(response.data.href, '/go/BC/r/LinkedRoom');
  assert.equal(response.data.src, 'https://bngprm.com/chat-frame.php?c=846478&model=LinkedRoom');
  assert.doesNotMatch(JSON.stringify(response.data), /Private upstream|location|age|gender|gallery|video/);
  CB.setFetcher(null);
  BC.setFetcher(null);
});

test('offline, demo, missing handles and disabled providers expose no resolver candidate or upstream calls', async () => {
  await configure();
  let requests = 0;
  CB.setFetcher(async () => {
    requests++;
    throw new Error('must not request');
  });
  for (const [column, value, reason] of [
    ['live', 0, 'offline'],
    ['demo', 1, 'demo']
  ]) {
    run('UPDATE creators SET ' + column + '=? WHERE id=?', value, 'luna');
    assert.equal((await profile()).previewUrl, null);
    assert.deepEqual((await call('anon', 'GET', '/api/network/talent/luna/preview')).data, {
      available: false,
      reason
    });
    run('UPDATE creators SET ' + column + '=? WHERE id=?', column === 'live' ? 1 : 0, 'luna');
  }
  await call('luna', 'PUT', '/api/studio/profile', { handles: {} });
  assert.equal((await profile()).previewUrl, null);
  assert.equal((await call('anon', 'GET', '/api/network/talent/luna/preview')).data.reason, 'not_configured');
  await call('luna', 'PUT', '/api/studio/profile', { handles: { CB: 'linked_room' } });
  for (const settings of [{ CB: { enabled: false } }, { CB: { liveGrid: false } }]) {
    await call('admin', 'PUT', '/api/admin/config', { overrides: { partners: settings } });
    assert.equal((await profile()).previewUrl, null);
    assert.equal((await call('anon', 'GET', '/api/network/talent/luna/preview')).data.reason, 'not_configured');
  }
  await configure();
  await call('admin', 'PUT', '/api/admin/affiliates/CB', { status: 'paused' });
  assert.equal((await profile()).previewUrl, null);
  assert.equal((await call('anon', 'GET', '/api/network/talent/luna/preview')).data.reason, 'not_configured');
  await call('admin', 'PUT', '/api/admin/affiliates/CB', { status: 'active' });
  assert.equal(requests, 0);
  assert.equal((await call('anon', 'GET', '/api/network/talent/missing/preview')).status, 404);
  CB.setFetcher(null);
});

test('private, absent, unknown, stale and failed provider results never advertise a live preview', async () => {
  await configure();
  for (const rows of [
    [cbRoom({ current_show: 'private' })],
    [cbRoom({ current_show: 'group' })],
    [cbRoom({ current_show: '' })],
    [cbRoom({ username: 'somebody_else' })],
    []
  ]) {
    CB.setFetcher(async () => ({ ok: true, json: async () => rows }));
    const response = await call('anon', 'GET', '/api/network/talent/luna/preview');
    assert.deepEqual(response.data, { available: false, reason: 'unavailable' });
  }
  CB.setFetcher(async () => {
    throw new Error('secret upstream response at host with private detail');
  });
  assert.deepEqual((await call('anon', 'GET', '/api/network/talent/luna/preview')).data, {
    available: false,
    reason: 'unavailable'
  });
  let fail = false;
  CB.setFetcher(async () => {
    if (fail) throw new Error('down');
    return { ok: true, json: async () => [cbRoom()] };
  });
  assert.equal((await call('anon', 'GET', '/api/network/talent/luna/preview')).data.available, true);
  fail = true;
  const realNow = Date.now;
  Date.now = () => realNow() + 120000;
  try {
    assert.deepEqual((await call('anon', 'GET', '/api/network/talent/luna/preview')).data, {
      available: false,
      reason: 'unavailable'
    });
  } finally {
    Date.now = realNow;
    CB.setFetcher(null);
  }
  await configure({ BC: 'LinkedRoom' });
  for (const row of [
    bcRoom({ chat_status: 'private' }),
    bcRoom({ chat_status: 'vip' }),
    bcRoom({ chat_status: 'group' }),
    bcRoom({ chat_status: '' }),
    bcRoom({ status: '' })
  ]) {
    BC.setFetcher(async () => ({ ok: true, json: async () => [row] }));
    assert.deepEqual((await call('anon', 'GET', '/api/network/talent/luna/preview')).data, {
      available: false,
      reason: 'unavailable'
    });
  }
  BC.setFetcher(null);
});

test('embed URLs bind exact single provider campaign and room selectors within the current CSP', async () => {
  await configure();
  const cbUrls = [
    'http://chaturbate.com/in/?campaign=Ji03i&room=linked_room',
    'https://user:password@chaturbate.com/in/?campaign=Ji03i&room=linked_room',
    'https://chaturbate.com:8443/in/?campaign=Ji03i&room=linked_room',
    'https://other.chaturbate.com/in/?campaign=Ji03i&room=linked_room',
    'https://chaturbate.com/not-a-player/?campaign=Ji03i&room=linked_room',
    'https://chaturbate.com/in/?campaign=OTHER&room=linked_room',
    'https://chaturbate.com/in/?campaign=Ji03i&room=another_room',
    'https://chaturbate.com/in/?campaign=Ji03i&room=linked_room&room=another_room',
    'https://chaturbate.com/in/?campaign=Ji03i&campaign=OTHER&room=linked_room',
    'https://chaturbate.com/in/?campaign=Ji03i&room=linked_room&csurl=https%3A%2F%2Fevil.example',
    'https://chaturbate.com/in/?campaign=Ji03i&room=linked_room#another'
  ];
  for (const url of cbUrls) {
    CB.setFetcher(async () => ({
      ok: true,
      json: async () => [cbRoom({ iframe_embed: '<iframe src="' + url + '">' })]
    }));
    assert.equal((await call('anon', 'GET', '/api/network/talent/luna/preview')).data.available, false, url);
  }
  await configure({ BC: 'LinkedRoom' });
  const bcUrls = [
    'https://bngprm.com/chat-frame.php?c=846478&model=Other',
    'https://bngprm.com/chat-frame.php?c=123846478&model=LinkedRoom',
    'https://bngprm.com/chat-frame.php?c=846478&c=OTHER&model=LinkedRoom',
    'https://bngprm.com/chat-frame.php?c=846478&model=LinkedRoom&model=Other',
    'https://bngprm.com/chat-frame.php?c=846478&model=LinkedRoom&csurl=https%3A%2F%2Fevil.example',
    'https://user:password@bngprm.com/chat-frame.php?c=846478&model=LinkedRoom',
    'https://bngprm.com:8443/chat-frame.php?c=846478&model=LinkedRoom',
    'https://www.bngprm.com/chat-frame.php?c=846478&model=LinkedRoom',
    'https://www.bngpt.com/chat-frame.php?c=846478&model=LinkedRoom',
    'https://bongacams1.com/chat-frame.php?c=846478&model=LinkedRoom',
    'https://bngprm.com/wrong-path?c=846478&model=LinkedRoom'
  ];
  for (const url of bcUrls) {
    BC.setFetcher(async () => ({ ok: true, json: async () => [bcRoom({ embed_chat_url: url })] }));
    assert.equal((await call('anon', 'GET', '/api/network/talent/luna/preview')).data.available, false, url);
  }
  for (const host of ['bongacams.com', 'www.bongacams.com', 'bngprm.com', 'bngpt.com']) {
    BC.setFetcher(async () => ({
      ok: true,
      json: async () => [bcRoom({ embed_chat_url: 'https://' + host + '/chat-frame.php?c=846478&model=LinkedRoom' })]
    }));
    assert.equal((await call('anon', 'GET', '/api/network/talent/luna/preview')).data.available, true, host);
  }
  CB.setFetcher(null);
  BC.setFetcher(null);
});

test('eligibility and configuration are checked again after provider requests settle', async () => {
  async function heldPreview(change) {
    await configure();
    let release, started;
    const ready = new Promise((resolve) => (started = resolve)),
      gate = new Promise((resolve) => (release = resolve));
    CB.setFetcher(async () => {
      started();
      await gate;
      return { ok: true, json: async () => [cbRoom()] };
    });
    const pending = call('anon', 'GET', '/api/network/talent/luna/preview');
    await ready;
    await change();
    release();
    return pending;
  }
  let response = await heldPreview(() => call('admin', 'POST', '/api/admin/creators/luna', { status: 'suspended' }));
  assert.equal(response.status, 404);
  response = await heldPreview(() =>
    call('admin', 'PUT', '/api/admin/config', { overrides: { partners: { CB: { liveGrid: false } } } })
  );
  assert.deepEqual(response.data, { available: false, reason: 'not_configured' });
  response = await heldPreview(() =>
    call('admin', 'PUT', '/api/admin/config', { overrides: { partners: { CB: { campaign: 'CHANGED' } } } })
  );
  assert.deepEqual(response.data, { available: false, reason: 'unavailable' });
  response = await heldPreview(() => call('luna', 'PUT', '/api/studio/profile', { handles: { CB: 'new_handle' } }));
  assert.deepEqual(response.data, { available: false, reason: 'unavailable' });
  response = await heldPreview(() => call('luna', 'POST', '/api/studio/live', { live: false }));
  assert.deepEqual(response.data, { available: false, reason: 'offline' });
  response = await heldPreview(() => run('UPDATE creators SET demo=1 WHERE id=?', 'luna'));
  assert.deepEqual(response.data, { available: false, reason: 'demo' });
  const userId = get("SELECT user_id FROM creators WHERE id='luna'").user_id;
  response = await heldPreview(() => call('admin', 'POST', '/api/admin/users/' + userId, { banned: true }));
  assert.equal(response.status, 404);
  assert.equal(
    (await call('anon', 'GET', '/api/network/talent')).data.talent.some((person) => person.id === 'luna'),
    false
  );
  await call('admin', 'POST', '/api/admin/users/' + userId, { banned: false });
  assert.equal(
    (
      await call('luna', 'POST', '/api/auth/login', {
        email: 'luna@demo.x3star.local',
        password: 'media-demo-test-only'
      })
    ).status,
    200
  );
  CB.setFetcher(null);
});

test('strict public mode isolates inflight requests as well as cached provider results', async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  let requests = 0;
  CB.setFetcher(async () => {
    requests++;
    await gate;
    return { ok: true, json: async () => [cbRoom({ current_show: undefined })] };
  });
  const legacy = CB.liveRooms({ campaign: 'Ji03i' }),
    strict = CB.liveRooms({ campaign: 'Ji03i', publicOnly: true });
  assert.equal(requests, 2);
  release();
  assert.equal((await legacy).rooms.length, 1);
  assert.equal((await strict).rooms.length, 0);
  BC.setFetcher(async () => {
    requests++;
    await gate;
    return { ok: true, json: async () => [bcRoom({ chat_status: undefined })] };
  });
  requests = 0;
  const bcLegacy = BC.liveRooms({ affiliateId: '846478' }),
    bcStrict = BC.liveRooms({ affiliateId: '846478', publicOnly: true });
  assert.equal(requests, 2);
  assert.equal((await bcLegacy).rooms.length, 1);
  assert.equal((await bcStrict).rooms.length, 0);
  CB.setFetcher(null);
  BC.setFetcher(null);
});
