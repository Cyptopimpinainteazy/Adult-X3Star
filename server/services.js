'use strict';
/* Shared server services: economy config, per-user economy state, creator/upload mapping. */
const crypto = require('node:crypto');
const E = require('../shared/economy.js');
const { all, get, run, tx, J } = require('./db');

/* ---------- economy config (defaults + admin overrides) ---------- */
let econCache = null;
function econConfig() {
  if (econCache) return econCache;
  const row = get("SELECT value FROM settings WHERE key = 'economy'");
  econCache = E.mergeConfig(E.DEFAULT_CONFIG, J(row && row.value, {}));
  return econCache;
}
function setEconOverrides(overrides) {
  const merged = E.mergeConfig(E.DEFAULT_CONFIG, overrides);
  validateEcon(merged);
  run("INSERT INTO settings (key, value, updated_at) VALUES ('economy', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", JSON.stringify(overrides), Date.now());
  econCache = null;
  return econConfig();
}
function econOverrides() { return J((get("SELECT value FROM settings WHERE key = 'economy'") || {}).value, {}); }
function validateEcon(c) {
  const pos = (v, name) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw Object.assign(new Error(`${name} must be a non-negative number`), { status: 400, code: 'bad_config' }); };
  ['welcomeDiamonds', 'beansPerDiamond', 'beanUsd', 'beanToDiamondRate', 'minPayoutBeans', 'payoutWeeklyCapBeans', 'defaultDailyCapUsd', 'firstPurchaseMultiplier', 'vipRenewRate', 'agencyCommissionPct'].forEach(k => pos(c[k], k));
  if (!Array.isArray(c.gifts) || !c.gifts.length) throw Object.assign(new Error('gifts must be a non-empty array'), { status: 400, code: 'bad_config' });
  c.gifts.forEach(g => { if (!g.id || !g.name) throw Object.assign(new Error('every gift needs id and name'), { status: 400, code: 'bad_config' }); pos(g.price, `gift ${g.id} price`); });
  c.gacha.boxes.forEach(b => { const s = E.RARITIES.reduce((a, r) => a + (b.odds[r] || 0), 0); if (Math.abs(s - 1) > 0.001) throw Object.assign(new Error(`box ${b.id} odds must sum to 1 (got ${s.toFixed(3)})`), { status: 400, code: 'bad_config' }); });
  c.diamondPacks.forEach(p => { pos(p.usd, `pack ${p.id} usd`); pos(p.diamonds, `pack ${p.id} diamonds`); });
}
const rng = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;

/* ---------- per-user economy state ---------- */
function loadEcon(user) {
  const c = econConfig(), now = Date.now();
  const s = J(user.econ, null) || E.newState(c, now);
  return E.ensure(s, c, now);
}
/**
 * Run an economy mutation for a user inside a transaction.
 * fn(state, cfg, now) returns a result; state is persisted; an econ_log row is written.
 */
function withEcon(userId, action, fn) {
  return tx(() => {
    const user = get('SELECT * FROM users WHERE id = ?', userId);
    if (!user) throw Object.assign(new Error('User not found'), { status: 404, code: 'not_found' });
    const c = econConfig(), now = Date.now();
    const state = loadEcon(user), before = state.diamonds;
    const result = fn(state, c, now, user);
    run('UPDATE users SET econ = ? WHERE id = ?', JSON.stringify(state), userId);
    const delta = state.diamonds - before;
    run('INSERT INTO econ_log (user_id, action, diamonds, data, created_at) VALUES (?,?,?,?,?)', userId, action, delta, JSON.stringify(slim(result)), now);
    return { result, summary: E.summary(state, c, now) };
  });
}
const slim = (r) => { try { const o = JSON.parse(JSON.stringify(r || {})); delete o.summary; return o; } catch { return {}; } };
function summaryFor(user) { const c = econConfig(), now = Date.now(); return E.summary(loadEcon(user), c, now); }

/* ---------- uploads ---------- */
const uploadUrl = (u) => (u ? `/uploads/${u.file}` : null);
function approvedUpload(id) { return id ? get("SELECT * FROM uploads WHERE id = ? AND status = 'approved'", id) : null; }

/* ---------- creators ---------- */
function beans30d(creatorId) { return (get('SELECT COALESCE(SUM(beans + bonus_beans),0) AS b FROM gifts WHERE creator_id = ? AND created_at > ?', creatorId, Date.now() - 30 * 86400000) || {}).b || 0; }
function viewersFor(c) {
  if (!c.live) return 0;
  const t = Math.floor(Date.now() / 60000), seed = [...c.id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return Math.max(12, Math.round(c.base_viewers * (1 + 0.08 * Math.sin((t + seed) / 7))));
}
/** Map a creator row to the public shape the fan app uses for MODELS. */
function publicCreator(c, opts = {}) {
  const avatar = approvedUpload(c.avatar_upload_id), cover = approvedUpload(c.cover_upload_id);
  const video = get("SELECT * FROM uploads WHERE creator_id = ? AND kind = 'gallery' AND status = 'approved' AND mime LIKE 'video/%' ORDER BY id DESC LIMIT 1", c.id);
  const out = {
    id: c.id, name: c.name, ticker: c.ticker, niche: c.niche, tags: J(c.tags, []), bio: c.bio,
    sites: J(c.sites, ['X3']), hues: J(c.hues, ['#ff2d87', '#7a2cff']), vhue: c.vhue, price: c.price,
    live: !!c.live, featured: !!c.featured, viewers: viewersFor(c), kyc: c.kyc,
    joined: Math.max(1, Math.round((Date.now() - c.created_at) / (30 * 86400000))),
    avatar: uploadUrl(avatar), cover: uploadUrl(cover), video: uploadUrl(video),
    tipMenu: J(c.tip_menu, []), goal: J(c.goal, {}), schedule: J(c.schedule, []), back: c.back_at || '',
    hostTier: E.hostTier(beans30d(c.id), econConfig()).name,
    go: goLinks(c)
  };
  if (opts.full) {
    out.gallery = all("SELECT id, mime, file, caption, created_at FROM uploads WHERE creator_id = ? AND kind = 'gallery' AND status = 'approved' ORDER BY id DESC LIMIT 60", c.id)
      .map(u => ({ id: u.id, url: uploadUrl(u), type: u.mime.startsWith('video/') ? 'video' : 'image', caption: u.caption, at: u.created_at }));
    out.products = all('SELECT * FROM products WHERE creator_id = ? AND active = 1 ORDER BY id', c.id).map(p => publicProduct(p));
    out.pinned = c.pinned_product_id ? out.products.find(p => p.id === c.pinned_product_id) || null : null;
    out.topFans = topFans(c.id, 7, 10);
    out.topFansAll = topFans(c.id, 3650, 10);
  }
  return out;
}
function goLinks(c) {
  const aff = econConfig().affiliates || {}, handles = J(c.handles, {}), out = {};
  for (const [site, h] of Object.entries(handles)) if (h && aff[site] && aff[site].url) out[site] = { name: aff[site].name, href: `/go/${site}/${c.id}` };
  return out;
}
function publicProduct(p) { const img = approvedUpload(p.upload_id); return { id: p.id, creatorId: p.creator_id, name: p.name, kind: p.kind, price: p.price, note: p.note, partner: p.partner, image: uploadUrl(img) }; }
function topFans(creatorId, days, limit) {
  return all(`SELECT u.name, SUM(g.diamonds) AS diamonds, COUNT(*) AS gifts FROM gifts g JOIN users u ON u.id = g.from_user
              WHERE g.creator_id = ? AND g.created_at > ? GROUP BY g.from_user ORDER BY diamonds DESC LIMIT ?`, creatorId, Date.now() - days * 86400000, limit);
}
function publicUser(u) {
  if (!u) return null;
  const s = summaryFor(u), fam = u.family_id ? get('SELECT id, name, tag FROM families WHERE id = ?', u.family_id) : null;
  const creator = get('SELECT id FROM creators WHERE user_id = ?', u.id);
  const av = u.avatar_upload_id ? get('SELECT * FROM uploads WHERE id = ?', u.avatar_upload_id) : null;
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, creatorId: creator ? creator.id : null,
    avatar: av ? uploadUrl(av) : null, avatarStatus: av ? av.status : null, family: fam, refCode: u.ref_code,
    econ: s
  };
}
/** Cosmetics + level shown next to a user in chat. */
function chatIdentity(u) {
  const c = econConfig(), now = Date.now(), s = loadEcon(u);
  return { level: E.levelInfo(s.xp, c).level, vip: E.vipTier(s, now), cosmetics: { bubble: s.equipped.bubble, namecolor: s.equipped.namecolor, badge: s.equipped.badge, frame: s.equipped.frame }, entrance: s.equipped.entrance };
}

const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'creator';
function uniqueSlug(name) { let base = slugify(name), s = base, i = 2; while (get('SELECT 1 FROM creators WHERE id = ?', s)) s = `${base}-${i++}`; return s; }
function uniqueTicker(name) {
  const letters = String(name).toUpperCase().replace(/[^A-Z]/g, '') || 'X3S';
  const cands = [letters.slice(0, 4), letters.slice(0, 3) + letters.slice(-1), letters.slice(0, 5), letters.slice(0, 2) + letters.slice(-2)];
  for (const t of cands) if (t.length >= 2 && !get('SELECT 1 FROM creators WHERE ticker = ?', t)) return t;
  let n = 2; while (get('SELECT 1 FROM creators WHERE ticker = ?', letters.slice(0, 3) + n)) n++; return letters.slice(0, 3) + n;
}
const refCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

module.exports = { E, econConfig, setEconOverrides, econOverrides, rng, loadEcon, withEcon, summaryFor, uploadUrl, approvedUpload, beans30d, publicCreator, publicProduct, topFans, publicUser, chatIdentity, uniqueSlug, uniqueTicker, refCode, viewersFor };
