'use strict';
/* Fan economy routes: check-in, watch chests, gifts, cosmetics, VIP, boxes, purchases, events, limits. */
const express = require('express');
const crypto = require('node:crypto');
const { get, run, tx } = require('../db');
const A = require('../auth');
const S = require('../services');
const hub = require('../ws');
const cfg = require('../config');
const { HttpError, str, intIn } = require('./common');

const r = express.Router();
r.use(A.requireUser);

const send = (res, out) => res.json({ result: out.result, econ: out.summary });

r.get('/', (req, res) => res.json({ econ: S.summaryFor(req.user) }));
r.post('/daily', (req, res) => send(res, S.withEcon(req.user.id, 'daily', (s, c, now) => S.E.claimDaily(s, c, now, S.rng))));
r.post('/watch', A.rateLimit('watch', 6, 60000), (req, res) => send(res, S.withEcon(req.user.id, 'watch', (s, c, now) => S.E.tickWatch(s, c, now, intIn(req.body.seconds, 'seconds', 0, 3600)))));
r.post('/watch/claim', (req, res) => send(res, S.withEcon(req.user.id, 'watch_chest', (s, c, now) => S.E.claimWatchChest(s, c, now, intIn(req.body.i, 'i', 0, 99)))));
r.post('/store/buy', (req, res) => send(res, S.withEcon(req.user.id, 'store_buy', (s, c, now) => S.E.buyItem(s, c, now, str(req.body.itemId, 'itemId', 1, 40)))));
r.post('/equip', (req, res) => send(res, S.withEcon(req.user.id, 'equip', (s, c, now) => S.E.equip(s, c, now, str(req.body.slot, 'slot', 1, 20), req.body.itemId || null))));
r.post('/vip', (req, res) => send(res, S.withEcon(req.user.id, 'vip', (s, c, now) => S.E.buyVip(s, c, now, intIn(req.body.tier, 'tier', 1, 9)))));
r.post('/vip/rebate', (req, res) => send(res, S.withEcon(req.user.id, 'vip_rebate', (s, c, now) => S.E.claimVipRebate(s, c, now))));
r.post('/gacha', A.rateLimit('gacha', 60, 60000), (req, res) => send(res, S.withEcon(req.user.id, 'gacha', (s, c, now) => S.E.rollGacha(s, c, now, str(req.body.boxId, 'boxId', 1, 40), Number(req.body.count) === 10 ? 10 : 1, S.rng, false))));
r.post('/event/claim', (req, res) => send(res, S.withEcon(req.user.id, 'event', (s, c, now) => S.E.claimEvent(s, c, now))));
r.post('/limits', (req, res) => send(res, S.withEcon(req.user.id, 'limits', (s, c, now) => S.E.setDailyCap(s, c, now, intIn(req.body.dailyCapUsd, 'dailyCapUsd', 0, 100000)))));

/* ---------- gifts ---------- */
r.post('/gift', A.rateLimit('gift', 240, 60000), (req, res) => {
  const creatorId = str(req.body.creatorId, 'creatorId', 1, 40), giftId = str(req.body.giftId, 'giftId', 1, 40), qty = intIn(req.body.qty ?? 1, 'qty', 1, 9999);
  const creator = get("SELECT * FROM creators WHERE id = ? AND status = 'approved'", creatorId);
  if (!creator) throw new HttpError(404, 'not_found', 'Creator not found');
  if (creator.user_id === req.user.id) throw new HttpError(400, 'self_gift', 'You can\'t gift yourself');
  const war = S.E.warStatus(S.econConfig(), Date.now());
  const out = tx(() => {
    const o = S.withEcon(req.user.id, 'gift', (s, c, now) => S.E.sendGift(s, c, now, giftId, qty));
    const g = o.result, c = S.econConfig(), now = Date.now();
    const bonus = S.E.hostBonusBeans(g.beans, S.beans30d(creatorId), c);
    const famPoints = req.user.family_id ? Math.round(g.cost * war.multiplier) : 0;
    const info = run('INSERT INTO gifts (from_user, creator_id, gift_id, qty, diamonds, beans, bonus_beans, family_id, family_points, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      req.user.id, creatorId, giftId, qty, g.cost, g.beans, bonus, req.user.family_id || null, famPoints, now);
    run('UPDATE creators SET beans = beans + ?, beans_total = beans_total + ? WHERE id = ?', g.beans + bonus, g.beans + bonus, creatorId);
    if (famPoints) run('UPDATE families SET xp = xp + ? WHERE id = ?', famPoints, req.user.family_id);
    const owner = creator.user_id ? get('SELECT agent_id FROM users WHERE id = ?', creator.user_id) : null;
    if (owner && owner.agent_id) run('INSERT INTO agent_earnings (agent_id, creator_id, beans, gift_row, created_at) VALUES (?,?,?,?,?)', owner.agent_id, creatorId, S.E.agencyCommission(g.beans, c), Number(info.lastInsertRowid), now);
    return { ...o, bonus, famPoints };
  });
  const g = out.result, ident = S.chatIdentity(get('SELECT * FROM users WHERE id = ?', req.user.id));
  const msgId = crypto.randomBytes(6).toString('hex');
  hub.broadcast({ type: 'gift', id: msgId, site: 'X3', room: creatorId, user: req.user.name, giftId, qty, diamonds: g.cost, fx: g.fx, level: ident.level, vip: ident.vip, cosmetics: ident.cosmetics, ts: Date.now() });
  const side = hub.pkGift(creatorId, g.cost, req.user.name);
  res.json({ result: { ...g, gift: { id: g.gift.id, name: g.gift.name, icon: g.gift.icon, price: g.gift.price }, msgId, pkSide: side, familyPoints: out.famPoints, war: war.active }, econ: out.summary });
});

/* ---------- diamond purchases ---------- */
/*
 * Provider interface: createCheckout(order) → { redirectUrl } | fulfil immediately.
 * PAYMENTS_MODE=test credits instantly and marks the order test=1.
 * To go live, add a provider below that creates a checkout session and call
 * fulfilOrder(orderId, extRef) from its verified webhook (route at the bottom).
 */
function fulfilOrder(orderId, extRef) {
  return tx(() => {
    const o = get('SELECT * FROM orders WHERE id = ?', orderId);
    if (!o) throw new HttpError(404, 'not_found', 'Order not found');
    if (o.status === 'paid') return { already: true };
    const out = S.withEcon(o.user_id, 'purchase', (s, c, now) => S.E.creditPurchase(s, c, now, o.pack_id));
    run("UPDATE orders SET status = 'paid', diamonds = ?, ext_ref = ?, paid_at = ? WHERE id = ?", out.result.total, extRef || null, Date.now(), orderId);
    return out;
  });
}
r.post('/purchase', A.rateLimit('purchase', 20, 600000), (req, res) => {
  const packId = str(req.body.packId, 'packId', 1, 20);
  const c = S.econConfig(), now = Date.now();
  const st = S.loadEcon(req.user);
  const q = S.E.purchaseQuote(st, c, now, packId);
  if (q.usd > q.capLeftUsd + 1e-9) throw new HttpError(400, 'cap_reached', `Daily purchase limit reached ($${st.limits.dailyCapUsd}). You can change it in Account → Spending.`);
  if (cfg.PAYMENTS_MODE === 'disabled') throw new HttpError(503, 'payments_disabled', 'Purchases are not enabled yet');
  const id = 'ord_' + crypto.randomBytes(9).toString('hex');
  run('INSERT INTO orders (id, user_id, pack_id, usd, provider, status, test, created_at) VALUES (?,?,?,?,?,?,?,?)', id, req.user.id, packId, q.usd, cfg.PAYMENTS_MODE, 'pending', cfg.PAYMENTS_MODE === 'test' ? 1 : 0, now);
  if (cfg.PAYMENTS_MODE === 'test') { const out = fulfilOrder(id, 'test'); return res.json({ result: { orderId: id, test: true, ...out.result }, econ: out.summary }); }
  throw new HttpError(501, 'provider_missing', `No handler for PAYMENTS_MODE=${cfg.PAYMENTS_MODE}`);
});
r.get('/quote/:packId', (req, res) => res.json({ quote: S.E.purchaseQuote(S.loadEcon(req.user), S.econConfig(), Date.now(), req.params.packId) }));

module.exports = { router: r, fulfilOrder };
