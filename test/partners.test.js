'use strict';
/* Chaturbate partner link builder: codes, fallbacks, track tags, validation. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../shared/partners.js');
const cfg = (cb = {}, placements) => ({ CB: { ...P.DEFAULTS.CB, ...cb }, placements: placements || P.DEFAULTS.placements });

test('revshare links match the Chaturbate linking codes exactly', () => {
  const c = cfg();
  assert.equal(P.cbUrl(c, { tour: 'home', placement: '' }).url, 'https://chaturbate.com/in/?tour=grq0&campaign=Ji03i&track=x3s');
  assert.equal(P.cbUrl(c, { tour: 'join_female', placement: 'p' }).url, 'https://chaturbate.com/in/?tour=JpRf&campaign=Ji03i&track=x3s_p&next=/female-cams/');
  assert.equal(P.cbUrl(c, { tour: 'join', placement: 'p' }).url, 'https://chaturbate.com/in/?tour=3Mc9&campaign=Ji03i&track=x3s_p&redirect_to_room=-welcomepage-');
  assert.equal(P.cbUrl(c, { tour: 'full', placement: 'p' }).url, 'https://chaturbate.com/in/?tour=dU9X&campaign=Ji03i&track=x3s_p&signup_notice=1');
  assert.equal(P.cbUrl(c, { tour: 'full_room', room: 'cock_da_hammer', placement: 'p' }).url, 'https://chaturbate.com/in/?tour=Limj&campaign=Ji03i&track=x3s_p&signup_notice=1&b=cock_da_hammer');
  assert.equal(P.placementUrl(c, 'footer_house', {}).url, 'https://chaturbate.com/in/?tour=LQps&campaign=Ji03i&track=x3s_footer_house&room=cock_da_hammer');
});

test('each program uses its own codes and falls back when a link type is missing', () => {
  assert.equal(P.cbUrl(cfg({ program: 'pps' }), { tour: 'broadcaster' }).code, '5zjT');
  assert.equal(P.cbUrl(cfg({ program: 'tokens' }), { tour: 'broadcaster' }).code, '5bpG');
  assert.equal(P.cbUrl(cfg({ program: 'revshare' }), { tour: 'broadcaster' }).code, 'NwNd');
  const tokJoin = P.cbUrl(cfg({ program: 'tokens' }), { tour: 'join_female' });   // tokens has no join pages → home
  assert.deepEqual([tokJoin.tour, tokJoin.code], ['home', '4uT2']);
  assert.ok(!tokJoin.url.includes('next='), 'fallback drops the join-page params');
  const tokHomeF = P.cbUrl(cfg({ program: 'tokens' }), { tour: 'home_female' });  // → top_female
  assert.deepEqual([tokHomeF.tour, tokHomeF.code], ['top_female', 'HuFr']);
  assert.equal(P.cbUrl(cfg({ program: 'pps' }), { tour: 'home_female_np' }).code, '0fQq');
});

test('every program code is a known tour and every placement resolves in every program', () => {
  for (const [name, prog] of Object.entries(P.PROGRAMS)) {
    for (const k of Object.keys(prog.tours)) assert.ok(P.TOURS[k], `${name}.${k} is a known tour`);
    for (const k of Object.keys(P.DEFAULT_PLACEMENTS)) assert.ok(P.placementUrl(cfg({ program: name }), k, {}), `${name} resolves ${k}`);
  }
});

test('room links need a valid room name; track tags are sanitised', () => {
  const c = cfg();
  assert.equal(P.roomUrl(c, 'bad room!', {}), null);
  assert.equal(P.roomUrl(c, 'luna_vex', { source: 'reddit spring/24', creator: 'luna' }).url, 'https://chaturbate.com/in/?tour=LQps&campaign=Ji03i&track=redditspring24_room&room=luna_vex');
  assert.equal(P.roomUrl(cfg({ roomTour: 'room', track: '{creator}' }), 'luna_vex', { creator: 'luna' }).url, 'https://chaturbate.com/in/?tour=dT8X&campaign=Ji03i&track=luna&room=luna_vex');
  assert.equal(P.cleanTrack('___'), 'default');
});

test('disabled, missing campaign and off placements produce no link', () => {
  assert.equal(P.cbUrl(cfg({ enabled: false }), { tour: 'home' }), null);
  assert.equal(P.cbUrl(cfg({ campaign: '' }), { tour: 'home' }), null);
  assert.equal(P.placementUrl(cfg({}, { x: { slot: 'footer', tour: 'home', label: 'x', on: false } }), 'x', {}), null);
});

test('validate rejects bad settings', () => {
  assert.doesNotThrow(() => P.validate(cfg()));
  assert.throws(() => P.validate(cfg({ program: 'nope' })), /program/);
  assert.throws(() => P.validate(cfg({ campaign: 'Ji03i&x=1' })), /campaign/);
  assert.throws(() => P.validate(cfg({ roomTour: 'home' })), /room tour/);
  assert.throws(() => P.validate(cfg({}, { a: { tour: 'nope', label: 'x' } })), /unknown tour/);
  assert.throws(() => P.validate(cfg({}, { a: { tour: 'home', label: '' } })), /label/);
});

test('cblive: client IP handling and stale cache fallback', async () => {
  process.env.DATA_DIR = process.env.DATA_DIR || require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'x3s-cbl-'));
  const CBL = require('../server/cblive');
  assert.equal(CBL.clientIp('::ffff:203.0.113.9'), '203.0.113.9');
  assert.equal(CBL.clientIp('192.168.0.30'), 'request_ip');
  assert.equal(CBL.clientIp('127.0.0.1'), 'request_ip');
  assert.equal(CBL.clientIp('2001:db8::1'), '2001:db8::1');
  let n = 0, fail = false;
  CBL.setFetcher(async () => { n++; if (fail) throw new Error('down'); return { ok: true, json: async () => [{ username: 'zoe', age: 30, gender: 'f', num_users: 5, image_url: 'https://roomimg.stream.highwebmedia.com/ri/zoe.jpg', tags: [] }] }; });
  const first = await CBL.liveRooms({ campaign: 'Ji03i', gender: 'f', ip: '203.0.113.9' });
  assert.equal(first.rooms[0].room, 'zoe'); assert.equal(n, 1);
  // force expiry of the fresh window, then fail: the stale copy is served
  const realNow = Date.now; Date.now = () => realNow() + 2 * 60_000; fail = true;
  try {
    const again = await CBL.liveRooms({ campaign: 'Ji03i', gender: 'f', ip: '203.0.113.9' });
    assert.equal(again.stale, true); assert.equal(again.rooms[0].room, 'zoe'); assert.equal(n, 2);
  } finally { Date.now = realNow; CBL.setFetcher(null); }
});

test('cblive: promo display names, links in subjects and youth-emphasis tags are cleaned', () => {
  process.env.DATA_DIR = process.env.DATA_DIR || require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'x3s-cbl-'));
  const { normalize } = require('../server/cblive');
  const base = { username: 'vanandjuani', gender: 'f', num_users: 30335, current_show: 'public', image_url_360x270: 'https://thumb.live.mmcdn.com/ri/vanandjuani.jpg' };
  const r = normalize({ ...base, display_name: 't.me/vanandjuani2023 (ONLY THIS ONE IS L', room_subject: 'TWERK /menu join t.me/abc and mysite.com/x now #new', tags: ['new', 'blonde', '18', 'bigboobs', 'young'] });
  assert.equal(r.name, 'vanandjuani');
  assert.equal(r.subject, 'TWERK /menu join and now #new');
  assert.deepEqual(r.tags, ['new', 'blonde', 'bigboobs']);
  assert.equal(normalize({ ...base, display_name: 'Avie 💕' }).name, 'Avie 💕');
  assert.equal(normalize({ ...base, display_name: 'Avie | my telegram' }).name, 'vanandjuani');
  assert.equal(normalize({ ...base, display_name: 'Avie onlyfans' }).name, 'vanandjuani');
  assert.equal(normalize({ ...base, display_name: '' }).name, 'vanandjuani');
});
