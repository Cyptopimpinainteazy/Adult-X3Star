'use strict';
/* Public + account routes: health, config, creators, auth, me, applications, reports. */
const express = require('express');
const { all, get, run, tx, J } = require('../db');
const A = require('../auth');
const S = require('../services');
const U = require('../uploads');
const hub = require('../ws');
const cfg = require('../config');
const { HttpError, bad, str, oneOf, EMAIL, NAME, NICHES, SITES } = require('./common');

const r = express.Router();

r.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now(), payments: cfg.PAYMENTS_MODE, demoTraffic: cfg.DEMO_TRAFFIC, clients: hub.clientCount() }));
r.get('/config', (_req, res) => { const c = S.econConfig(); res.json({ economy: c, odds: S.E.gachaOdds(c), payments: cfg.PAYMENTS_MODE }); });

/* ---------- creators ---------- */
r.get('/creators', (_req, res) => {
  const rows = all("SELECT * FROM creators WHERE status = 'approved' ORDER BY live DESC, featured DESC, base_viewers DESC");
  res.json({ creators: rows.map(c => S.publicCreator(c)) });
});
r.get('/creators/:id', (req, res) => {
  const c = get("SELECT * FROM creators WHERE id = ? AND status = 'approved'", req.params.id);
  if (!c) throw new HttpError(404, 'not_found', 'Creator not found');
  res.json({ creator: S.publicCreator(c, { full: true }) });
});
r.get('/leaderboard/gifters', (req, res) => {
  const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
  res.json({ rows: all(`SELECT u.name, SUM(g.diamonds) AS diamonds, COUNT(*) AS gifts FROM gifts g JOIN users u ON u.id = g.from_user WHERE g.created_at > ? GROUP BY g.from_user ORDER BY diamonds DESC LIMIT 50`, Date.now() - days * 86400000) });
});

r.get('/stories', (_req, res) => {
  const rows = all(`SELECT u.*, c.name AS cname FROM uploads u JOIN creators c ON c.id = u.creator_id
                    WHERE u.kind = 'story' AND u.status = 'approved' AND c.status = 'approved' AND u.created_at > ? ORDER BY u.created_at ASC`, Date.now() - 86400000);
  const groups = new Map();
  for (const u of rows) {
    if (!groups.has(u.creator_id)) { const c = get('SELECT * FROM creators WHERE id = ?', u.creator_id); const pc = S.publicCreator(c); groups.set(u.creator_id, { creator: { id: c.id, name: c.name, avatar: pc.avatar || pc.cover }, items: [], last: 0 }); }
    const g = groups.get(u.creator_id); g.items.push({ id: u.id, type: u.mime.startsWith('video/') ? 'video' : 'image', url: S.uploadUrl(u), caption: u.caption, at: u.created_at }); g.last = u.created_at;
  }
  res.json({ groups: [...groups.values()].sort((a, b) => b.last - a.last).map(({ last, ...g }) => g) });
});
/* live Chaturbate rooms for the grid (?gender=f|c|t|m &tag=) */
r.get('/cb/live', async (req, res, next) => {
  try {
    const pc = S.econConfig().partners || {}, cb = pc.CB || {};
    if (!cb.enabled || cb.liveGrid === false || !require('../affiliates').isLive('CB') || !/^[A-Za-z0-9]{1,20}$/.test(cb.campaign || '')) return res.json({ enabled: false, rooms: [], total: 0 });
    const limit = Math.min(48, Math.max(1, parseInt(req.query.limit, 10) || 24)), offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const out = await require('../cblive').liveRooms({ campaign: cb.campaign, program: cb.program, gender: req.query.gender, tag: req.query.tag, ip: req.ip });
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json({ enabled: true, total: out.rooms.length, stale: out.stale, error: out.error ? 'Live rooms are unavailable right now' : null,
      rooms: out.rooms.slice(offset, offset + limit).map(x => ({ ...x, href: `/go/CB/r/${x.room}` })) });
  } catch (e) { next(e); }
});
/* live BongaCams rooms for the grid (?gender=f|c|t|m) */
r.get('/bc/live', async (req, res, next) => {
  try {
    if (!S.liveSites().includes('BC')) return res.json({ enabled: false, rooms: [], total: 0 });
    const bc = (S.econConfig().partners || {}).BC || {};
    const limit = Math.min(48, Math.max(1, parseInt(req.query.limit, 10) || 24)), offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const out = await require('../bclive').liveRooms({ affiliateId: String(bc.affiliateId), gender: req.query.gender });
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json({ enabled: true, total: out.rooms.length, stale: out.stale, error: out.error ? 'Live rooms are unavailable right now' : null,
      rooms: out.rooms.slice(offset, offset + limit).map(x => ({ ...x, href: `/go/BC/r/${encodeURIComponent(x.room)}` })) });
  } catch (e) { next(e); }
});
/* partner videos (BongaCams feed) — newest first, optional ?tag= &performer= */
r.get('/partner-videos', (req, res) => {
  const F = require('../feeds');
  const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 24)), offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const tag = String(req.query.tag || '').slice(0, 40), performer = String(req.query.performer || '').slice(0, 60);
  let rows = all('SELECT * FROM partner_videos WHERE hidden = 0 ORDER BY id DESC').filter(r => require('../affiliates').isLive(r.site));
  const tagCount = new Map();
  rows.forEach(r => J(r.tags, []).forEach(t => { const k = t.toLowerCase(); const e = tagCount.get(k) || { tag: t, n: 0 }; e.n++; tagCount.set(k, e); }));
  if (tag) rows = rows.filter(r => J(r.tags, []).some(t => t.toLowerCase() === tag.toLowerCase()));
  if (performer) rows = rows.filter(r => r.performer === performer);
  res.json({ total: rows.length, videos: rows.slice(offset, offset + limit).map(F.publicVideo), tags: [...tagCount.values()].sort((a, b) => b.n - a.n).slice(0, 24) });
});
r.get('/clips', (_req, res) => {
  const rows = all(`SELECT u.*, c.name AS cname FROM uploads u JOIN creators c ON c.id = u.creator_id
                    WHERE u.kind = 'gallery' AND u.status = 'approved' AND c.status = 'approved' AND u.mime LIKE 'video/%' ORDER BY u.id DESC LIMIT 60`);
  res.json({ clips: rows.map(u => ({ id: u.id, creator: { id: u.creator_id, name: u.cname }, type: 'video', url: S.uploadUrl(u), caption: u.caption, likes: null, at: u.created_at })) });
});

/* ---------- auth ---------- */
r.post('/auth/register', A.rateLimit('register', 10, 3600000), (req, res) => {
  const email = str(req.body.email, 'Email', 3, 160).toLowerCase();
  if (!EMAIL.test(email)) throw bad('Enter a valid email');
  const name = str(req.body.name, 'Username', 3, 24);
  if (!NAME.test(name)) throw bad('Username: 3–24 letters, numbers, _ or .');
  const password = str(req.body.password, 'Password', 8, 200);
  if (req.body.adult !== true) throw bad('You must confirm you are 18 or older', 'age_required');
  if (get('SELECT 1 FROM users WHERE email = ?', email)) throw new HttpError(409, 'email_taken', 'That email is already registered');
  if (get('SELECT 1 FROM users WHERE name = ?', name)) throw new HttpError(409, 'name_taken', 'That username is taken');
  const ref = typeof req.body.ref === 'string' ? get('SELECT id FROM users WHERE ref_code = ?', req.body.ref.toUpperCase().slice(0, 16)) : null;
  const c = S.econConfig(), now = Date.now();
  const info = run('INSERT INTO users (email, name, pass_hash, role, econ, ref_code, referred_by, created_at) VALUES (?,?,?,?,?,?,?,?)',
    email, name, A.hashPassword(password), 'fan', JSON.stringify(S.E.newState(c, now)), S.refCode(), ref ? ref.id : null, now);
  const token = A.createSession(Number(info.lastInsertRowid));
  A.setSessionCookie(res, token);
  res.status(201).json({ user: S.publicUser(get('SELECT * FROM users WHERE id = ?', Number(info.lastInsertRowid))) });
});
r.post('/auth/login', A.rateLimit('login', 12, 600000), (req, res) => {
  const email = str(req.body.email, 'Email', 3, 160).toLowerCase(), password = str(req.body.password, 'Password', 1, 200);
  const u = get('SELECT * FROM users WHERE email = ?', email);
  if (!u || !A.verifyPassword(password, u.pass_hash)) throw new HttpError(401, 'bad_credentials', 'Email or password is incorrect');
  if (u.banned) throw new HttpError(403, 'banned', 'This account is suspended');
  A.setSessionCookie(res, A.createSession(u.id));
  res.json({ user: S.publicUser(u) });
});
r.post('/auth/logout', (req, res) => { A.destroySession(req.sessionToken); A.clearSessionCookie(res); res.json({ ok: true }); });
r.post('/auth/password', A.requireUser, (req, res) => {
  const current = str(req.body.current, 'Current password', 1, 200), next = str(req.body.next, 'New password', 8, 200);
  if (!A.verifyPassword(current, req.user.pass_hash)) throw new HttpError(401, 'bad_credentials', 'Current password is incorrect');
  run('UPDATE users SET pass_hash = ? WHERE id = ?', A.hashPassword(next), req.user.id);
  run('DELETE FROM sessions WHERE user_id = ?', req.user.id);
  A.setSessionCookie(res, A.createSession(req.user.id));
  res.json({ ok: true });
});

/* ---------- me ---------- */
r.get('/me', (req, res) => res.json({ user: req.user ? S.publicUser(req.user) : null }));
r.post('/me/avatar', A.requireUser, U.acceptUpload(() => ({ kind: 'fan_avatar' })), (req, res) => {
  const old = req.user.avatar_upload_id ? get('SELECT * FROM uploads WHERE id = ?', req.user.avatar_upload_id) : null;
  run('UPDATE users SET avatar_upload_id = ? WHERE id = ?', req.uploadRow.id, req.user.id);
  if (old) { run('DELETE FROM uploads WHERE id = ?', old.id); U.deleteUploadFile(old); }
  res.status(201).json({ upload: { id: req.uploadRow.id, url: S.uploadUrl(req.uploadRow), status: req.uploadRow.status } });
});
r.get('/me/history', A.requireUser, (req, res) => {
  res.json({
    log: all('SELECT action, diamonds, data, created_at FROM econ_log WHERE user_id = ? ORDER BY id DESC LIMIT 200', req.user.id).map(x => ({ ...x, data: J(x.data, {}) })),
    orders: all('SELECT id, pack_id, usd, diamonds, provider, status, test, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', req.user.id),
    gifts: all('SELECT g.gift_id, g.qty, g.diamonds, g.created_at, c.name AS creator FROM gifts g JOIN creators c ON c.id = g.creator_id WHERE g.from_user = ? ORDER BY g.id DESC LIMIT 100', req.user.id)
  });
});

/* ---------- applications (creator / agent) ---------- */
const CAMPAIGN_FIELDS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'source', 'medium', 'campaign', 'content', 'term']);
function applicationCampaign(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad('Campaign must be an object');
  const campaign = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'first_seen') {
      if (!Number.isSafeInteger(entry) || entry < 0) throw bad('Campaign first_seen must be a valid timestamp');
    } else if (!CAMPAIGN_FIELDS.has(key) || typeof entry !== 'string' || entry.length > 160) {
      throw bad('Campaign fields must be supported text values of at most 160 characters');
    }
    campaign[key] = entry;
  }
  return campaign;
}
function applicationLocation(body) {
  const { getState } = require('../content/states');
  let state = '', landingPath = '';
  if (body.state !== undefined && body.state !== '') {
    if (typeof body.state !== 'string' || body.state.length > 40) throw bad('Choose a valid state');
    const selected = getState(body.state);
    if (!selected) throw bad('Choose a valid state');
    state = selected.slug;
  }
  if (body.landingPath !== undefined && body.landingPath !== '') {
    if (typeof body.landingPath !== 'string' || body.landingPath.length > 80 || !/^\/casting(?:\/[a-z-]+)?$/.test(body.landingPath)) throw bad('Entry page must be a casting page');
    const slug = body.landingPath.slice('/casting/'.length);
    const entryState = getState(slug);
    if (body.landingPath !== '/casting' && (!entryState || entryState.slug !== slug)) throw bad('Entry page must be a known casting page');
    landingPath = body.landingPath;
  }
  return { state, landingPath };
}
r.post('/apply', A.rateLimit('apply', 5, 3600000), (req, res) => {
  const b = req.body || {};
  const kind = b.kind === 'agent' ? 'agent' : 'creator';
  const email = str(b.email, 'Email', 3, 160).toLowerCase(); if (!EMAIL.test(email)) throw bad('Enter a valid email');
  if (b.adult !== true) throw bad('You must confirm you are 18+ and will verify ID', 'age_required');
  const data = {
    stage: str(b.stage, 'Stage name', 2, 40), niche: NICHES.includes(b.niche) ? b.niche : 'Other',
    hours: Math.max(0, Math.min(80, Number(b.hours) || 0)), sites: (Array.isArray(b.sites) ? b.sites : []).filter(s => SITES.includes(s)),
    note: str(b.note || '', 'Note', 0, 1000), campaign: applicationCampaign(b.campaign),
    agentCode: typeof b.agentCode === 'string' ? b.agentCode.toUpperCase().slice(0, 16) : '',
    ...applicationLocation(b)
  };
  if (get("SELECT 1 FROM applications WHERE email = ? AND status = 'pending'", email)) throw new HttpError(409, 'pending_exists', 'An application for this email is already under review');
  run('INSERT INTO applications (kind, email, data, user_id, created_at) VALUES (?,?,?,?,?)', kind, email, JSON.stringify(data), req.user ? req.user.id : null, Date.now());
  res.status(201).json({ ok: true });
});

/* ---------- reports ---------- */
r.post('/reports', A.requireUser, A.rateLimit('report', 20, 3600000), (req, res) => {
  const type = oneOf(req.body.targetType, 'targetType', ['creator', 'user', 'upload', 'message']);
  run('INSERT INTO reports (reporter_id, target_type, target_id, reason, created_at) VALUES (?,?,?,?,?)', req.user.id, type, str(req.body.targetId, 'targetId', 1, 80), str(req.body.reason, 'Reason', 3, 500), Date.now());
  res.status(201).json({ ok: true });
});

module.exports = r;
