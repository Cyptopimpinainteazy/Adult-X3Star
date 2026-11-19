'use strict';
/* Creator Studio: profile, uploads, gallery, products, live status, analytics, beans → diamonds, payouts. */
const express = require('express');
const { all, get, run, tx, J } = require('../db');
const A = require('../auth');
const S = require('../services');
const U = require('../uploads');
const { HttpError, bad, str, intIn, numIn, oneOf, HEX, NICHES, SITES } = require('./common');

const r = express.Router();
r.use(A.requireRole('creator'));

function myCreator(req) {
  const c = req.user.role === 'admin' && req.query.as ? get('SELECT * FROM creators WHERE id = ?', String(req.query.as)) : get('SELECT * FROM creators WHERE user_id = ?', req.user.id);
  if (!c) throw new HttpError(404, 'no_creator', 'No creator profile is linked to this account');
  return c;
}
const uploadOut = (u) => ({ id: u.id, kind: u.kind, url: S.uploadUrl(u), mime: u.mime, type: u.mime.startsWith('video/') ? 'video' : 'image', size: u.size, caption: u.caption, status: u.status, rejectReason: u.reject_reason, at: u.created_at });

r.get('/', (req, res) => {
  const c = myCreator(req), econ = S.econConfig(), now = Date.now(), day = 86400000;
  const b30 = S.beans30d(c.id), tier = S.E.hostTier(b30, econ);
  const nextTier = econ.hostTiers.find(t => t.min30d > b30) || null;
  const daily = all(`SELECT CAST((created_at - ?) / ? AS INTEGER) AS d, SUM(beans + bonus_beans) AS beans, SUM(diamonds) AS diamonds, COUNT(*) AS gifts
                     FROM gifts WHERE creator_id = ? AND created_at > ? GROUP BY d`, now - 14 * day, day, c.id, now - 14 * day);
  const series = Array.from({ length: 14 }, (_, i) => { const row = daily.find(x => x.d === i) || {}; return { day: new Date(now - (13 - i) * day).toISOString().slice(0, 10), beans: row.beans || 0, gifts: row.gifts || 0 }; });
  const hours = all(`SELECT CAST(((created_at + ?) / 3600000) % 24 AS INTEGER) AS h, SUM(diamonds) AS diamonds FROM gifts WHERE creator_id = ? AND created_at > ? GROUP BY h`, econ.dayOffsetMinutes * 60000, c.id, now - 30 * day);
  const byGift = all('SELECT gift_id, SUM(qty) AS qty, SUM(diamonds) AS diamonds FROM gifts WHERE creator_id = ? AND created_at > ? GROUP BY gift_id ORDER BY diamonds DESC', c.id, now - 30 * day);
  const uniqueGifters = (get('SELECT COUNT(DISTINCT from_user) AS n FROM gifts WHERE creator_id = ? AND created_at > ?', c.id, now - 30 * day) || {}).n || 0;
  const weekBeans = (get("SELECT COALESCE(SUM(beans),0) AS b FROM payouts WHERE creator_id = ? AND status != 'rejected' AND created_at > ?", c.id, now - 7 * day) || {}).b || 0;
  res.json({
    creator: { ...S.publicCreator(c, { full: true }), handles: J(c.handles, {}), status: c.status, kyc: c.kyc, beans: c.beans, beansTotal: c.beans_total, pinnedProductId: c.pinned_product_id, baseViewers: c.base_viewers },
    uploads: all('SELECT * FROM uploads WHERE creator_id = ? ORDER BY id DESC', c.id).map(uploadOut),
    products: all('SELECT * FROM products WHERE creator_id = ? ORDER BY id DESC', c.id).map(p => ({ ...S.publicProduct(p), active: !!p.active, uploadId: p.upload_id })),
    payouts: all('SELECT id, beans, usd, method, status, note, created_at, decided_at FROM payouts WHERE creator_id = ? ORDER BY id DESC LIMIT 50', c.id),
    recentGifts: all('SELECT g.gift_id, g.qty, g.diamonds, g.beans, g.bonus_beans, g.created_at, u.name FROM gifts g JOIN users u ON u.id = g.from_user WHERE g.creator_id = ? ORDER BY g.id DESC LIMIT 40', c.id),
    analytics: { series, hours, byGift, uniqueGifters, beans30d: b30, tier, nextTier, payoutWeekUsed: weekBeans },
    economy: { beanUsd: econ.beanUsd, beanToDiamondRate: econ.beanToDiamondRate, minPayoutBeans: econ.minPayoutBeans, payoutWeeklyCapBeans: econ.payoutWeeklyCapBeans, hostTiers: econ.hostTiers, gifts: econ.gifts, items: econ.items.filter(i => i.type === 'filter') },
    myEcon: S.summaryFor(req.user)
  });
});

r.put('/profile', (req, res) => {
  const c = myCreator(req), b = req.body || {};
  const name = str(b.name ?? c.name, 'Display name', 2, 40);
  const bio = str(b.bio ?? c.bio, 'Bio', 0, 600);
  const niche = oneOf(b.niche ?? c.niche, 'Niche', NICHES);
  const tags = (Array.isArray(b.tags) ? b.tags : J(c.tags, [])).map(t => str(t, 'Tag', 1, 20)).slice(0, 6);
  const sites = (Array.isArray(b.sites) ? b.sites : J(c.sites, [])).filter(s => SITES.includes(s));
  if (!sites.includes('X3')) sites.push('X3');
  const hues = Array.isArray(b.hues) ? b.hues.slice(0, 2) : J(c.hues, []);
  if (hues.length !== 2 || !hues.every(h => HEX.test(h))) throw bad('Colors must be two hex values like #ff2d87');
  const tipMenu = (Array.isArray(b.tipMenu) ? b.tipMenu : J(c.tip_menu, [])).slice(0, 8).map(t => ({ label: str(t.label, 'Tip menu label', 1, 40), price: intIn(t.price, 'Tip menu price', 1, 100000) }));
  const goal = b.goal ? { label: str(b.goal.label, 'Goal label', 1, 60), target: intIn(b.goal.target, 'Goal target', 10, 1000000) } : J(c.goal, {});
  const schedule = (Array.isArray(b.schedule) ? b.schedule : J(c.schedule, [])).slice(0, 14).map(s => ({ day: oneOf(s.day, 'Day', ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']), time: str(s.time, 'Time', 3, 8), title: str(s.title, 'Show title', 1, 60) }));
  let ticker = c.ticker;
  if (b.ticker && b.ticker !== c.ticker) {
    ticker = String(b.ticker).toUpperCase(); if (!/^[A-Z]{2,5}$/.test(ticker)) throw bad('Ticker must be 2–5 letters');
    if (get('SELECT 1 FROM creators WHERE ticker = ? AND id != ?', ticker, c.id)) throw new HttpError(409, 'ticker_taken', 'That ticker is taken');
  }
  const backAt = str(b.back ?? c.back_at, 'Back-at note', 0, 40);
  const handles = {}; const hin = b.handles && typeof b.handles === 'object' ? b.handles : J(c.handles, {});
  for (const site of ['CB', 'SC', 'BC', 'C4']) { const h = String(hin[site] || '').trim(); if (h && !/^[A-Za-z0-9_.-]{1,40}$/.test(h)) throw bad(`${site} username has invalid characters`); if (h) handles[site] = h; }
  run('UPDATE creators SET name=?, bio=?, niche=?, tags=?, sites=?, hues=?, tip_menu=?, goal=?, schedule=?, ticker=?, back_at=?, handles=? WHERE id=?',
    name, bio, niche, JSON.stringify(tags), JSON.stringify(sites), JSON.stringify(hues), JSON.stringify(tipMenu), JSON.stringify(goal), JSON.stringify(schedule), ticker, backAt, JSON.stringify(handles), c.id);
  res.json({ creator: S.publicCreator(get('SELECT * FROM creators WHERE id = ?', c.id), { full: true }) });
});

r.post('/live', (req, res) => {
  const c = myCreator(req); const live = !!req.body.live;
  if (live && c.kyc !== 'verified') throw new HttpError(403, 'kyc_required', 'ID verification must be approved before you can go live');
  run('UPDATE creators SET live = ? WHERE id = ?', live ? 1 : 0, c.id);
  res.json({ live });
});

/* ---------- uploads ---------- */
r.post('/upload', U.acceptUpload((req) => {
  const kind = oneOf(req.body.kind || 'gallery', 'kind', ['avatar', 'cover', 'gallery', 'product', 'story']);
  return { kind, creatorId: myCreator(req).id };
}), (req, res) => {
  const u = req.uploadRow, c = myCreator(req);
  if (u.kind === 'avatar' || u.kind === 'cover') run(`UPDATE creators SET ${u.kind}_upload_id = ? WHERE id = ?`, u.id, c.id);
  res.status(201).json({ upload: uploadOut(u) });
});
r.patch('/upload/:id', (req, res) => {
  const c = myCreator(req), u = get('SELECT * FROM uploads WHERE id = ? AND creator_id = ?', Number(req.params.id), c.id);
  if (!u) throw new HttpError(404, 'not_found', 'Upload not found');
  run('UPDATE uploads SET caption = ? WHERE id = ?', str(req.body.caption, 'Caption', 0, 200), u.id);
  res.json({ upload: uploadOut(get('SELECT * FROM uploads WHERE id = ?', u.id)) });
});
r.delete('/upload/:id', (req, res) => {
  const c = myCreator(req), u = get('SELECT * FROM uploads WHERE id = ? AND creator_id = ?', Number(req.params.id), c.id);
  if (!u) throw new HttpError(404, 'not_found', 'Upload not found');
  tx(() => {
    if (c.avatar_upload_id === u.id) run('UPDATE creators SET avatar_upload_id = NULL WHERE id = ?', c.id);
    if (c.cover_upload_id === u.id) run('UPDATE creators SET cover_upload_id = NULL WHERE id = ?', c.id);
    run('UPDATE products SET upload_id = NULL WHERE upload_id = ?', u.id);
    run('DELETE FROM uploads WHERE id = ?', u.id);
  });
  U.deleteUploadFile(u);
  res.json({ ok: true });
});

/* ---------- products (creator store) ---------- */
function productBody(b, c) {
  const uploadId = b.uploadId ? Number(b.uploadId) : null;
  if (uploadId && !get('SELECT 1 FROM uploads WHERE id = ? AND creator_id = ?', uploadId, c.id)) throw bad('Image must be one of your uploads');
  return { name: str(b.name, 'Product name', 2, 80), kind: oneOf(b.kind, 'Kind', ['Toy', 'Lingerie', 'Merch', 'Custom']), price: numIn(b.price, 'Price', 1, 10000), note: str(b.note || '', 'Description', 0, 300), partner: str(b.partner || '', 'Partner', 0, 60), uploadId };
}
r.post('/products', (req, res) => {
  const c = myCreator(req); if ((get('SELECT COUNT(*) AS n FROM products WHERE creator_id = ?', c.id) || {}).n >= 40) throw bad('Store limit is 40 products');
  const p = productBody(req.body || {}, c);
  const info = run('INSERT INTO products (creator_id, name, kind, price, note, partner, upload_id, created_at) VALUES (?,?,?,?,?,?,?,?)', c.id, p.name, p.kind, p.price, p.note, p.partner, p.uploadId, Date.now());
  res.status(201).json({ product: S.publicProduct(get('SELECT * FROM products WHERE id = ?', Number(info.lastInsertRowid))) });
});
r.put('/products/:id', (req, res) => {
  const c = myCreator(req), cur = get('SELECT * FROM products WHERE id = ? AND creator_id = ?', Number(req.params.id), c.id);
  if (!cur) throw new HttpError(404, 'not_found', 'Product not found');
  const p = productBody({ ...cur, uploadId: cur.upload_id, ...req.body }, c);
  run('UPDATE products SET name=?, kind=?, price=?, note=?, partner=?, upload_id=?, active=? WHERE id=?', p.name, p.kind, p.price, p.note, p.partner, p.uploadId, req.body.active === false ? 0 : 1, cur.id);
  res.json({ product: S.publicProduct(get('SELECT * FROM products WHERE id = ?', cur.id)) });
});
r.delete('/products/:id', (req, res) => {
  const c = myCreator(req); run('DELETE FROM products WHERE id = ? AND creator_id = ?', Number(req.params.id), c.id);
  if (c.pinned_product_id === Number(req.params.id)) run('UPDATE creators SET pinned_product_id = NULL WHERE id = ?', c.id);
  res.json({ ok: true });
});
r.post('/pin', (req, res) => {
  const c = myCreator(req), pid = req.body.productId ? Number(req.body.productId) : null;
  if (pid && !get('SELECT 1 FROM products WHERE id = ? AND creator_id = ?', pid, c.id)) throw new HttpError(404, 'not_found', 'Product not found');
  run('UPDATE creators SET pinned_product_id = ? WHERE id = ?', pid, c.id);
  res.json({ pinnedProductId: pid });
});

/* ---------- beans ---------- */
r.post('/convert', (req, res) => {
  const c = myCreator(req), econ = S.econConfig();
  if (!c.user_id) throw bad('This creator has no linked account to receive diamonds');
  const out = tx(() => {
    const fresh = get('SELECT beans FROM creators WHERE id = ?', c.id);
    const q = S.E.convertBeans(fresh.beans, req.body.beans, econ);
    run('UPDATE creators SET beans = beans - ? WHERE id = ?', q.beans, c.id);
    const o = S.withEcon(c.user_id, 'beans_convert', (s) => { s.diamonds += q.diamonds; return q; });
    return o;
  });
  res.json({ result: out.result, econ: out.summary, beans: get('SELECT beans FROM creators WHERE id = ?', c.id).beans });
});
r.post('/payout', (req, res) => {
  const c = myCreator(req), econ = S.econConfig();
  if (c.kyc !== 'verified') throw new HttpError(403, 'kyc_required', 'ID verification must be approved before payouts');
  const method = str(req.body.method, 'Payout method', 2, 120);
  const out = tx(() => {
    const fresh = get('SELECT beans FROM creators WHERE id = ?', c.id);
    const q = S.E.payoutQuote(fresh.beans, req.body.beans, econ);
    const week = (get("SELECT COALESCE(SUM(beans),0) AS b FROM payouts WHERE creator_id = ? AND status != 'rejected' AND created_at > ?", c.id, Date.now() - 7 * 86400000) || {}).b || 0;
    if (week + q.beans > econ.payoutWeeklyCapBeans) throw bad(`Weekly payout cap is ${econ.payoutWeeklyCapBeans.toLocaleString()} beans (${(econ.payoutWeeklyCapBeans - week).toLocaleString()} left)`, 'weekly_cap');
    run('UPDATE creators SET beans = beans - ? WHERE id = ?', q.beans, c.id);
    run('INSERT INTO payouts (creator_id, beans, usd, method, created_at) VALUES (?,?,?,?,?)', c.id, q.beans, q.usd, method, Date.now());
    return q;
  });
  res.status(201).json({ result: out, beans: get('SELECT beans FROM creators WHERE id = ?', c.id).beans });
});

module.exports = r;
