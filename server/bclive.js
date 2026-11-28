'use strict';
/*
 * Live BongaCams rooms for the "Live right now" grid (BongaCams tab).
 *
 * Source: BongaCash "API – Models Online" (v1, JSON):
 *   https://bngprm.com/promo.php?c=<affiliate id>&type=api&api_v=1&limit=<n>&api_type=json
 * The list is fetched once a minute for the whole site (the v1 API has no per-visitor IP parameter), cleaned with the
 * same rules as the Chaturbate grid, and filtered by gender here. A stale copy is served for up to 15 minutes if the
 * API is slow or down. Clicks go through /go/BC/r/<room> (counted, then your BongaCams tracking link).
 */
const { BLOCK_RE } = require('./feeds');
const { cleanText, displayName, HIDDEN_TAGS } = require('./cblive');

const API = 'https://bngprm.com/promo.php';
const ROOM_RE = /^[A-Za-z0-9_.-]{1,60}$/;
const ID_RE = /^\d{3,12}$/;
const EMBED_HOST_RE = /(^|\.)(bongacams\d*\.com|bngprm\.com|bngpt\.com)$/i;
const TTL_MS = 60_000, STALE_MS = 15 * 60_000, FETCH_LIMIT = 300;

let fetcher = (url, opts) => fetch(url, opts);
const cache = new Map(), inflight = new Map();
function setFetcher(fn) { fetcher = fn || ((url, opts) => fetch(url, opts)); cache.clear(); inflight.clear(); }

/** BongaCams gender words → f | m | c | t ("female" is checked before "male"). */
function genderOf(v) {
  const g = String(v || '').toLowerCase();
  if (/trans|shemale|tranny|\bts\b|^t$|^s$/.test(g)) return 't';
  if (/couple|^c$|pair/.test(g)) return 'c';
  if (/female|woman|girl|^f$/.test(g)) return 'f';
  if (/male|man|guy|^m$/.test(g)) return 'm';
  return '';
}
const https = (u) => { const s = String(u || '').trim(); return s.startsWith('//') ? 'https:' + s : s; };
function safeImg(u) {
  try { const x = new URL(https(u)); return x.protocol === 'https:' ? x.href : ''; } catch { return ''; }
}
/** BongaCams embed (embed_chat_url) — https, a BongaCams host, and carrying our affiliate ID. */
function embedSrc(u, affiliateId) {
  try {
    const x = new URL(https(u));
    if (x.protocol !== 'https:' || !EMBED_HOST_RE.test(x.hostname)) return '';
    if (affiliateId && !x.href.includes(affiliateId)) return '';
    return x.href;
  } catch { return ''; }
}
const yes = (v) => v === true || v === 1 || /^(1|true|yes|on)$/i.test(String(v || ''));
const word = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9 _-]/g, '').trim().replace(/\s+/g, '-').slice(0, 24);

/** Normalise one API room to the grid's room shape; null if it must not be shown. */
function normalize(r, { affiliateId, publicOnly = false } = {}) {
  if (!r || !ROOM_RE.test(String(r.username || ''))) return null;
  const age = Number(r.display_age);
  if (r.display_age != null && r.display_age !== '' && Number.isFinite(age) && age < 18) return null;
  const status = String(r.status || '').toLowerCase(), chat = String(r.chat_status || '').toLowerCase();
  if (publicOnly && (status !== 'online' || chat !== 'public')) return null;
  if (/offline|away|hidden/.test(status) || /offline|away|hidden/.test(chat)) return null;
  const show = /priv/.test(chat) ? 'private' : /group/.test(chat) ? 'group' : /vip/.test(chat) ? 'vip' : 'public';
  const subject = cleanText(r.turns_on, 140);
  const tags = [r.ethnicity, r.hair_color, r.bust_penis_size, r.sexual_preference].map(word).filter(Boolean);
  if (BLOCK_RE.test(subject) || BLOCK_RE.test(String(r.display_name || '')) || tags.some(t => BLOCK_RE.test(t.replace(/[_-]/g, ' ')))) return null;
  const thumb = safeImg(r.thumbnail_image_big_live) || safeImg(r.thumbnail_image_medium_live) || safeImg(r.thumbnail_image_big) || safeImg(r.profile_image);
  if (!thumb) return null;
  const loc = [r.hometown, r.homecountry].map(x => cleanText(x, 30)).filter(Boolean).join(', ');
  const online = Number(r.online_time);
  return {
    room: r.username,
    name: displayName(r.display_name, r.username),
    age: age >= 18 && age < 100 ? Math.floor(age) : null,
    gender: genderOf(r.gender),
    viewers: Math.max(0, Math.floor(Number(r.members_count) || 0)),
    followers: 0,
    subject, tags: [...new Set(tags)].filter(t => !HIDDEN_TAGS.has(t)).slice(0, 5), thumb,
    embed: embedSrc(r.embed_chat_url, affiliateId),
    hd: yes(r.hd_cam), isNew: false, show,
    location: loc.slice(0, 40),
    minutesOnline: Number.isFinite(online) && online > 0 ? Math.floor(online > 100000 ? online / 60000 : online / 60) : 0,
    interactive: yes(r.vibratoy)
  };
}

/** Pull the list of room objects out of whatever JSON shape the API returns. */
function roomList(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const v of Object.values(data)) if (Array.isArray(v) && v.some(x => x && typeof x === 'object' && 'username' in x)) return v;
    const vals = Object.values(data);
    if (vals.length && vals.every(x => x && typeof x === 'object' && 'username' in x)) return vals;
  }
  return null;
}

async function fetchFresh(affiliateId, publicOnly) {
  const q = new URLSearchParams({ c: affiliateId, type: 'api', api_v: '1', limit: String(FETCH_LIMIT), api_type: 'json' });
  const res = await fetcher(`${API}?${q}`, { headers: { 'User-Agent': 'x3STAR/1.0 (+https://x3star.live)', Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`BongaCams API ${res.status}`);
  const list = roomList(await res.json());
  if (!list) throw new Error('Unexpected BongaCams API response');
  const seen = new Set(), rooms = [];
  for (const r of list) { const n = normalize(r, { affiliateId, publicOnly }); if (n && !seen.has(n.room)) { seen.add(n.room); rooms.push(n); } }
  rooms.sort((a, b) => (a.show === 'public' ? 0 : 1) - (b.show === 'public' ? 0 : 1) || b.viewers - a.viewers);
  return rooms;
}

/** Live rooms, optionally filtered by gender (f|m|c|t). Returns { rooms, stale, error }. */
async function liveRooms({ affiliateId, gender, publicOnly = false }) {
  if (!ID_RE.test(String(affiliateId || ''))) return { rooms: [], stale: false, error: 'No BongaCams affiliate ID set' };
  const g = genderOf(gender);
  const key = String(affiliateId) + '|' + (publicOnly ? 'public' : 'legacy'), hit = cache.get(key);
  const pick = (rooms) => (g ? rooms.filter(r => r.gender === g) : rooms);
  if (hit && Date.now() - hit.at < TTL_MS) return { rooms: pick(hit.rooms), stale: false, error: null };
  if (!inflight.has(key)) inflight.set(key, fetchFresh(String(affiliateId), publicOnly).then(rooms => { cache.set(key, { at: Date.now(), rooms }); return rooms; }).finally(() => inflight.delete(key)));
  try { return { rooms: pick(await inflight.get(key)), stale: false, error: null }; }
  catch (e) {
    if (hit && Date.now() - hit.at < STALE_MS) return { rooms: pick(hit.rooms), stale: true, error: null };
    return { rooms: [], stale: false, error: e.message || 'BongaCams API unavailable' };
  }
}

module.exports = { liveRooms, normalize, genderOf, embedSrc, roomList, setFetcher, ROOM_RE };
