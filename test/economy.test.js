'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../shared/economy.js');

const cfg = E.mergeConfig(E.DEFAULT_CONFIG, { dayOffsetMinutes: 0 });
const DAY = 86400000;
const T0 = Date.UTC(2026, 10, 16, 12); // Monday noon UTC
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('new state starts with welcome diamonds and level 1', () => {
  const s = E.newState(cfg, T0);
  assert.equal(s.diamonds, cfg.welcomeDiamonds);
  assert.equal(E.levelInfo(0, cfg).level, 1);
});

test('daily check-in: once per day, streak grows, breaks after a missed day', () => {
  const s = E.newState(cfg, T0);
  const r1 = E.claimDaily(s, cfg, T0, Math.random);
  assert.equal(r1.day, 1); assert.equal(r1.diamonds, 10);
  assert.throws(() => E.claimDaily(s, cfg, T0 + 1000, Math.random), { code: 'already_claimed' });
  const r2 = E.claimDaily(s, cfg, T0 + DAY, Math.random);
  assert.equal(r2.day, 2); assert.equal(r2.streak, 2);
  const r3 = E.claimDaily(s, cfg, T0 + 3 * DAY, Math.random); // skipped a day
  assert.equal(r3.day, 1); assert.equal(r3.streak, 1);
});

test('day 7 check-in opens a free Velvet Box', () => {
  const s = E.newState(cfg, T0);
  let last;
  for (let d = 0; d < 7; d++) last = E.claimDaily(s, cfg, T0 + d * DAY, seq(0.5));
  assert.equal(last.day, 7);
  assert.ok(last.box && last.box.cost === 0 && last.box.results.length === 1);
});

test('watch chests unlock by minutes, heartbeat is capped, chests claim once', () => {
  const s = E.newState(cfg, T0);
  E.tickWatch(s, cfg, T0, 10_000); // capped to watchMaxTickSec
  assert.equal(s.watch.seconds, cfg.watchMaxTickSec);
  assert.throws(() => E.claimWatchChest(s, cfg, T0, 1), { code: 'not_ready' });
  const before = s.diamonds;
  const r = E.claimWatchChest(s, cfg, T0, 0);
  assert.equal(r.diamonds, 2); assert.equal(s.diamonds, before + 2);
  assert.throws(() => E.claimWatchChest(s, cfg, T0, 0), { code: 'already_claimed' });
  const next = E.watchStatus(s, cfg, T0 + DAY);
  assert.equal(next.seconds, 0, 'watch time resets daily');
});

test('gifts cost diamonds, award xp + beans, respect VIP gates', () => {
  const s = E.newState(cfg, T0); s.diamonds = 2000;
  const g = E.sendGift(s, cfg, T0, 'champagne', 2);
  assert.equal(g.cost, 198); assert.equal(g.beans, 198); assert.equal(g.fx, 'burst');
  assert.equal(s.diamonds, 1802 + g.levelUps.reduce((a, u) => a + u.diamonds, 0)); assert.equal(s.xp, 198);
  assert.throws(() => E.sendGift(s, cfg, T0, 'crown', 1), { code: 'vip_required' });
  assert.throws(() => E.sendGift(s, cfg, T0, 'penthouse', 1), { code: 'insufficient' });
});

test('level ups pay diamonds and milestone items', () => {
  const s = E.newState(cfg, T0);
  const ups = E.addXp(s, 5000, cfg, T0);
  assert.ok(ups.length >= 5);
  assert.ok(s.inventory.nc_pink, 'level 5 grants Hot Pink name color');
});

test('VIP: buy, renew at discount within grace, rebate once per day, items expire', () => {
  const s = E.newState(cfg, T0); s.diamonds = 10000;
  const b = E.buyVip(s, cfg, T0, 1);
  assert.equal(b.price, 1200); assert.equal(E.vipTier(s, T0), 1);
  assert.ok(s.inventory.ent_vip1.exp);
  const q = E.vipQuote(s, cfg, T0 + 29 * DAY, 1);
  assert.equal(q.isRenew, true); assert.equal(q.price, 480);
  E.claimVipRebate(s, cfg, T0);
  assert.throws(() => E.claimVipRebate(s, cfg, T0 + 60_000), { code: 'already_claimed' });
  E.ensure(s, cfg, T0 + 31 * DAY);
  assert.equal(E.vipTier(s, T0 + 31 * DAY), 0);
  assert.equal(s.inventory.ent_vip1, undefined);
});

test('cosmetics: buy once, equip only owned items in the right slot', () => {
  const s = E.newState(cfg, T0); s.diamonds = 1000;
  E.buyItem(s, cfg, T0, 'flt_noir');
  assert.throws(() => E.buyItem(s, cfg, T0, 'flt_noir'), { code: 'owned' });
  assert.throws(() => E.buyItem(s, cfg, T0, 'flt_vhs'), { code: 'not_for_sale' });
  E.equip(s, cfg, T0, 'filter', 'flt_noir');
  assert.equal(s.equipped.filter, 'flt_noir');
  assert.throws(() => E.equip(s, cfg, T0, 'frame', 'flt_noir'), { code: 'bad_input' });
  assert.throws(() => E.equip(s, cfg, T0, 'frame', 'frm_halo'), { code: 'not_owned' });
});

test('mystery box pity guarantees epic and legendary', () => {
  const s = E.newState(cfg, T0); s.diamonds = 1e6;
  const box = cfg.gacha.boxes[0];
  // rng always 0.01 → common roll every time; pity must force epic by pull 15
  let sawEpic = false;
  for (let i = 0; i < box.pity.epic; i++) { const r = E.rollGacha(s, cfg, T0, 'velvet', 1, seq(0.01)); if (r.results[0].rarity === 'epic') sawEpic = true; }
  assert.ok(sawEpic);
  let sawLegend = false;
  for (let i = 0; i < box.pity.legendary; i++) { const r = E.rollGacha(s, cfg, T0, 'velvet', 1, seq(0.01)); if (r.results[0].rarity === 'legendary') sawLegend = true; }
  assert.ok(sawLegend);
});

test('ten-pull uses discounted price and duplicates refund diamonds', () => {
  const s = E.newState(cfg, T0); s.diamonds = 5000;
  const r = E.rollGacha(s, cfg, T0, 'velvet', 10, seq(0.01, 0.9));
  assert.equal(r.cost, 540); assert.equal(r.results.length, 10);
  assert.ok(r.results.some(x => x.duplicate || x.diamonds));
});

test('purchases: first purchase doubled, daily cap enforced, raising cap waits for cooldown', () => {
  const s = E.newState(cfg, T0);
  const q = E.creditPurchase(s, cfg, T0, 'd60');
  assert.equal(q.first, 60);
  E.setDailyCap(s, cfg, T0, 5);
  assert.throws(() => E.creditPurchase(s, cfg, T0, 'd300'), { code: 'cap_reached' });
  const raise = E.setDailyCap(s, cfg, T0, 500);
  assert.equal(raise.dailyCapUsd, 5); assert.ok(raise.pending);
  E.ensure(s, cfg, T0 + 25 * 3600000);
  assert.equal(s.limits.dailyCapUsd, 500);
});

test('weekly event tracks gifted diamonds and pays once', () => {
  const s = E.newState(cfg, T0); s.diamonds = 2000;
  E.sendGift(s, cfg, T0, 'ring', 1);
  const st = E.eventStatus(s, cfg, T0);
  assert.equal(st.done, true);
  const r = E.claimEvent(s, cfg, T0);
  assert.equal(r.diamonds, 100); assert.ok(s.inventory.bdg_event);
  assert.throws(() => E.claimEvent(s, cfg, T0), { code: 'already_claimed' });
  assert.equal(E.eventStatus(s, cfg, T0 + 7 * DAY).progress, 0, 'resets next week');
});

test('creator beans convert and pay out with minimum', () => {
  assert.deepEqual(E.convertBeans(1000, 400, cfg), { beans: 400, diamonds: 400 });
  assert.throws(() => E.payoutQuote(1000, 1000, cfg), { code: 'below_min' });
  assert.equal(E.payoutQuote(10000, 10000, cfg).usd, 80);
});
