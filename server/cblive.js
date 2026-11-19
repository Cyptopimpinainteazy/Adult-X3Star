'use strict';
/*
 * Live Chaturbate rooms for the "Live now on Chaturbate" grid.
 *
 * Source: Chaturbate's public affiliate online-rooms API, called with your campaign code (wm) and the visitor's IP
 * (client_ip) so the list respects Chaturbate's geo restrictions for that visitor. Results are cleaned up and cached
 * briefly per (filter, visitor IP) so a busy page doesn't hammer the API, and a stale copy is served if the API is
 * slow or down. Visitors never call Chaturbate directly; room clicks go through /go/CB/r/<room> (counted, then your
 * affiliate room link).
 */
const { BLOCK_RE } = require('./feeds');

const API = 'https://chaturbate.com/api/public/affiliates/onlinerooms/';
const ROOM_RE = /^[A-Za-z0-9_]{1,60}$/;
const TAG_RE = /^[a-z0-9_-]{1,40}$/;
const GENDERS = { f: 'f', female: 'f', m: 'm', male: 'm', c: 'c', couple: 'c', t: 't', s: 't', trans: 't' };
const IMG_HOST_RE = /(^|\.)(highwebmedia\.com|mmcdn\.com)$/i;
const TTL_MS = 60_000, STALE_MS = 15 * 60_000, MAX_ENTRIES = 1000, FETCH_LIMIT = 90;

let fetcher = (url, opts) => fetch(url, opts);
/** Tests replace the network call. */
function setFetcher(fn) { fetcher = fn || ((url, opts) => fetch(url, opts)); cache.clear(); inflight.clear(); }

const cache = new Map();     // key -> { at, rooms }
const inflight = new Map();  // key -> Promise<rooms>

function remember(key, rooms) {
  cache.delete(key); cache.set(key, { at: Date.now(), rooms });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

/** Visitor IP to pass on. Private/loopback addresses (local testing) let Chaturbate use the server's own IP. */
function clientIp(raw) {
  const ip = String(raw || '').replace(/^::ffff:/, '');
  if (!ip || ip === '::1' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|fc|fd|fe80)/i.test(ip)) return 'request_ip';
  return /^[0-9a-f:.]{3,45}$/i.test(ip) ? ip : 'request_ip';
}

function safeImg(u) {
  try { const x = new URL(String(u || '')); return x.protocol === 'https:' && IMG_HOST_RE.test(x.hostname) ? x.href : ''; } catch { return ''; }
}
const cleanText = (s, n) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/gi, '').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** Normalise one API room; null if it must not be shown. */
function normalize(r) {
  if (!r || !ROOM_RE.test(String(r.username || ''))) return null;
  const age = Number(r.age);
  if (r.age != null && r.age !== '' && !(age >= 18)) return null;
  const show = String(r.current_show || 'public').toLowerCase();
  if (show === 'away' || show === 'hidden' || show === 'offline') return null;
  const subject = cleanText(r.room_subject, 140);
  const tags = (Array.isArray(r.tags) ? r.tags : []).map(t => String(t).toLowerCase().replace(/[^a-z0-9_-]/g, '')).filter(Boolean);
  if (BLOCK_RE.test(subject) || tags.some(t => BLOCK_RE.test(t.replace(/[_-]/g, ' ')))) return null;
  const thumb = safeImg(r.image_url_360x270) || safeImg(r.image_url);
  if (!thumb) return null;
  return {
    room: r.username,
    name: cleanText(r.display_name, 40) || r.username,
    age: age >= 18 && age < 100 ? Math.floor(age) : null,
    gender: GENDERS[String(r.gender || '').toLowerCase()] || '',
    viewers: Math.max(0, Math.floor(Number(r.num_users) || 0)),
    followers: Math.max(0, Math.floor(Number(r.num_followers) || 0)),
    subject, tags: tags.slice(0, 5), thumb,
    hd: !!r.is_hd, isNew: !!r.is_new, show,
    location: cleanText(r.location, 40),
    minutesOnline: Math.max(0, Math.floor((Number(r.seconds_online) || 0) / 60))
  };
}

async function fetchFresh({ campaign, gender, tag, ip }) {
  const q = new URLSearchParams({ wm: campaign, format: 'json', limit: String(FETCH_LIMIT), client_ip: ip });
  if (gender) q.set('gender', gender);
  if (tag) q.set('tag', tag);
  const res = await fetcher(`${API}?${q}`, { headers: { 'User-Agent': 'x3STAR/1.0 (+https://x3star.live)', Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Chaturbate API ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : Array.isArray(data && data.results) ? data.results : null;
  if (!list) throw new Error('Unexpected Chaturbate API response');
  const seen = new Set(), rooms = [];
  for (const r of list) { const n = normalize(r); if (n && !seen.has(n.room)) { seen.add(n.room); rooms.push(n); } }
  rooms.sort((a, b) => (a.show === 'public' ? 0 : 1) - (b.show === 'public' ? 0 : 1) || b.viewers - a.viewers);
  return rooms;
}

/**
 * Live rooms for a filter. Returns { rooms, stale, error }.
 * gender: f|m|c|t (or words), tag: one Chaturbate tag, ip: visitor IP.
 */
async function liveRooms({ campaign, gender, tag, ip }) {
  const g = GENDERS[String(gender || '').toLowerCase()] || '';
  const t = TAG_RE.test(String(tag || '').toLowerCase()) ? String(tag).toLowerCase() : '';
  const apiGender = g === 't' ? 's' : g;   // the affiliate API still uses "s" for trans
  const cip = clientIp(ip);
  const key = `${campaign}|${g}|${t}|${cip}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { rooms: hit.rooms, stale: false, error: null };
  if (!inflight.has(key)) {
    inflight.set(key, fetchFresh({ campaign, gender: apiGender, tag: t, ip: cip })
      .then(rooms => { remember(key, rooms); return rooms; })
      .finally(() => inflight.delete(key)));
  }
  try {
    return { rooms: await inflight.get(key), stale: false, error: null };
  } catch (e) {
    if (hit && Date.now() - hit.at < STALE_MS) return { rooms: hit.rooms, stale: true, error: null };
    return { rooms: [], stale: false, error: e.message || 'Chaturbate API unavailable' };
  }
}

module.exports = { liveRooms, normalize, clientIp, setFetcher, ROOM_RE };
