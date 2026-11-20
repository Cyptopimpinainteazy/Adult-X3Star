'use strict';
/* BongaCams Models Online (v1) → live grid rooms. */
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATA_DIR = process.env.DATA_DIR || require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'x3s-bcl-'));
const B = require('../server/bclive');

const room = (o) => ({ username: 'SweetMia', gender: 'Female', display_name: 'Mia', display_age: '23', ethnicity: 'Latin', hair_color: 'Brunette', bust_penis_size: 'Big', sexual_preference: 'Straight',
  hometown: 'Medellin', homecountry: 'Colombia', turns_on: 'Kind <b>gentlemen</b> visit mysite.com', members_count: '412', status: 'online', chat_status: 'public', online_time: '5400', hd_cam: '1', vibratoy: '1',
  thumbnail_image_big_live: '//i.bngcdn.com/live/SweetMia.jpg', thumbnail_image_medium_live: '', profile_image: 'https://i.bngcdn.com/p/SweetMia.jpg',
  embed_chat_url: 'https://bngprm.com/chat-frame.php?c=846478&model=SweetMia', chat_url: 'https://bongacams.com/track?c=846478&csurl=https%3A%2F%2Fbongacams.com%2FSweetMia', ...o });

test('normalizes a BongaCams room into the grid shape', () => {
  const r = B.normalize(room({}), { affiliateId: '846478' });
  assert.deepEqual({ ...r }, { room: 'SweetMia', name: 'Mia', age: 23, gender: 'f', viewers: 412, followers: 0, subject: 'Kind gentlemen visit', tags: ['latin', 'brunette', 'big', 'straight'],
    thumb: 'https://i.bngcdn.com/live/SweetMia.jpg', embed: 'https://bngprm.com/chat-frame.php?c=846478&model=SweetMia', hd: true, isNew: false, show: 'public', location: 'Medellin, Colombia', minutesOnline: 90, interactive: true });
});

test('genders, privacy and safety rules', () => {
  assert.deepEqual(['Female', 'male', 'Couple', 'Transsexual', 'shemale', 'x'].map(B.genderOf), ['f', 'm', 'c', 't', 't', '']);
  assert.equal(B.normalize(room({ display_age: '17' })), null, 'under 18');
  assert.equal(B.normalize(room({ chat_status: 'away' })), null, 'away');
  assert.equal(B.normalize(room({ turns_on: 'my teen look' })), null, 'blocked words');
  assert.equal(B.normalize(room({ thumbnail_image_big_live: 'http://x/a.jpg', profile_image: '' })), null, 'no https image');
  assert.equal(B.normalize(room({ chat_status: 'private' })).show, 'private');
  assert.equal(B.normalize(room({ display_name: 'Mia t.me/miaxx' })).name, 'SweetMia', 'ad-style display names fall back to the room name');
  assert.equal(B.normalize(room({ embed_chat_url: 'https://evil.example/frame?c=846478' }), { affiliateId: '846478' }).embed, '', 'foreign embed host');
  assert.equal(B.normalize(room({ embed_chat_url: 'https://bngprm.com/chat-frame.php?c=999&model=SweetMia' }), { affiliateId: '846478' }).embed, '', 'someone else\'s affiliate ID');
});

test('finds the room list in different JSON shapes', () => {
  const r = room({});
  assert.equal(B.roomList([r]).length, 1);
  assert.equal(B.roomList({ users: [r] }).length, 1);
  assert.equal(B.roomList({ SweetMia: r, Other: { ...r, username: 'Other' } }).length, 2);
  assert.equal(B.roomList({ error: 'nope' }), null);
});

test('liveRooms: one fetch per minute for the site, gender filter applied locally, stale fallback', async () => {
  const calls = []; let fail = false;
  B.setFetcher(async (url) => { calls.push(url); if (fail) throw new Error('down'); return { ok: true, json: async () => [room({}), room({ username: 'BigBen', gender: 'Male', members_count: '900' }), room({ username: 'Duo', gender: 'Couple', members_count: '50' })] }; });
  const all = await B.liveRooms({ affiliateId: '846478' });
  assert.deepEqual(all.rooms.map(r => r.room), ['BigBen', 'SweetMia', 'Duo']);
  const women = await B.liveRooms({ affiliateId: '846478', gender: 'f' });
  assert.deepEqual(women.rooms.map(r => r.room), ['SweetMia']);
  assert.equal(calls.length, 1, 'gender tabs reuse the same cached list');
  const u = new URL(calls[0]);
  assert.equal(u.origin + u.pathname, 'https://bngprm.com/promo.php');
  assert.deepEqual(Object.fromEntries(u.searchParams), { c: '846478', type: 'api', api_v: '1', limit: '300', api_type: 'json' });
  const realNow = Date.now; Date.now = () => realNow() + 2 * 60_000; fail = true;
  try { const st = await B.liveRooms({ affiliateId: '846478', gender: 'm' }); assert.equal(st.stale, true); assert.equal(st.rooms[0].room, 'BigBen'); }
  finally { Date.now = realNow; }
  assert.match((await B.liveRooms({ affiliateId: 'abc' })).error, /affiliate ID/);
  B.setFetcher(null);
});
