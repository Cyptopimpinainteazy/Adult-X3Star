/* =====================================================================
   x3STAR economy engine
   ---------------------------------------------------------------------
   One rules engine, two runtimes:
     • Node (server/) — authoritative; state persisted per user in SQLite
     • Browser (public/) — offline demo mode; state kept in localStorage
   Every operation is a pure function of (state, config, now[, rng]) that
   mutates the passed state object and returns a result, or throws an
   EconError with a stable `code`.

   Currencies
     diamonds  — fan currency. Earned (daily check-in, watch chests, level
                 ups, events, mystery boxes, VIP rebates) or purchased.
     beans     — creator earnings. Every diamond gifted becomes
                 `beansPerDiamond` beans for the creator. Beans cash out at
                 `beanUsd` or convert back to diamonds.
     xp        — drives levels. Earned by watching, gifting, chatting and
                 daily check-ins.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.X3Economy = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 86400000;
  const RARITIES = ['common', 'rare', 'epic', 'legendary'];

  const DEFAULT_CONFIG = {
    version: 1,
    dayOffsetMinutes: -420,          // daily resets at local midnight for UTC-7 (Mountain). Set 0 for UTC.
    welcomeDiamonds: 100,
    beansPerDiamond: 1,
    beanUsd: 0.008,                  // 1 bean cashes out at $0.008
    beanToDiamondRate: 1,            // beans → diamonds conversion for creators
    minPayoutBeans: 5000,
    payoutWeeklyCapBeans: 1000000,
    hostTiers: [                     // bonus beans (platform-funded) on every gift, based on beans earned in the last 30 days
      { id: 'rising',   name: 'Rising',        min30d: 0,       bonusPct: 0 },
      { id: 'official', name: 'Official Host', min30d: 50000,   bonusPct: 5 },
      { id: 'star',     name: 'Star Host',     min30d: 250000,  bonusPct: 10 },
      { id: 'icon',     name: 'Icon',          min30d: 1000000, bonusPct: 15 }
    ],
    agencyCommissionPct: 20,         // agents earn this % of their recruited hosts' gift beans (platform-funded)
    families: { createCost: 2000, maxMembers: 50, warMultiplier: 1.5, warStartHour: 20, warEndHour: 22, levelBase: 5000, levelExp: 1.3 },
    defaultDailyCapUsd: 200,         // per-user daily purchase cap (user can lower instantly, raise after cooldown)
    capRaiseCooldownHours: 24,
    firstPurchaseMultiplier: 2,      // first diamond purchase is doubled
    diamondPacks: [
      { id: 'd60',   diamonds: 60,   bonus: 0,    usd: 0.99 },
      { id: 'd300',  diamonds: 300,  bonus: 30,   usd: 4.99 },
      { id: 'd980',  diamonds: 980,  bonus: 120,  usd: 14.99 },
      { id: 'd1980', diamonds: 1980, bonus: 300,  usd: 29.99 },
      { id: 'd3280', diamonds: 3280, bonus: 600,  usd: 49.99 },
      { id: 'd6480', diamonds: 6480, bonus: 1500, usd: 99.99 }
    ],
    flashSale: { windowHours: 6, bonusPct: 20, packs: ['d300', 'd980', 'd1980', 'd3280'] },
    daily: [
      { diamonds: 10 }, { diamonds: 15 }, { diamonds: 20 }, { diamonds: 30 },
      { diamonds: 40 }, { diamonds: 60 }, { diamonds: 100, box: 'velvet' }
    ],
    watchChests: [
      { min: 1, diamonds: 2, xp: 5 }, { min: 3, diamonds: 3, xp: 10 }, { min: 5, diamonds: 5, xp: 15 },
      { min: 10, diamonds: 8, xp: 25 }, { min: 20, diamonds: 12, xp: 40 }, { min: 40, diamonds: 20, xp: 60 },
      { min: 60, diamonds: 30, xp: 80 }
    ],
    watchMaxTickSec: 75,             // server accepts at most this many seconds per heartbeat
    watchDailyCapMin: 240,
    xp: { perWatchMinute: 4, perDiamondGifted: 1, perChat: 1, chatDailyCap: 60, perDailyClaim: 20 },
    levelCurve: { base: 60, exp: 1.45, max: 99 },
    levelRewards: { diamondsPerLevel: 3, items: { 5: 'nc_pink', 10: 'frm_neon', 20: 'bub_glass', 30: 'ent_spark', 50: 'frm_halo' } },
    gifts: [
      { id: 'rose',      name: 'Neon Rose',    icon: '🌹', price: 1 },
      { id: 'kiss',      name: 'Kiss',         icon: '💋', price: 5 },
      { id: 'heart',     name: 'Heart',        icon: '💖', price: 10 },
      { id: 'lipstick',  name: 'Lipstick',     icon: '💄', price: 20 },
      { id: 'cocktail',  name: 'Cocktail',     icon: '🍸', price: 50 },
      { id: 'champagne', name: 'Champagne',    icon: '🍾', price: 99 },
      { id: 'heels',     name: 'Stilettos',    icon: '👠', price: 199 },
      { id: 'ring',      name: 'Diamond Ring', icon: '💍', price: 520 },
      { id: 'lambo',     name: 'Pink Lambo',   icon: '🏎️', price: 1314 },
      { id: 'crown',     name: 'Velvet Crown', icon: '👑', price: 2999, vip: 2 },
      { id: 'yacht',     name: 'Yacht',        icon: '🛥️', price: 3344 },
      { id: 'rocket',    name: 'Rocket',       icon: '🚀', price: 6666 },
      { id: 'penthouse', name: 'Penthouse',    icon: '🏙️', price: 9999 },
      { id: 'galaxy',    name: 'Galaxy',       icon: '🌌', price: 19999, vip: 3 }
    ],
    comboWindowMs: 3200,
    vip: [
      { tier: 1, name: 'VIP',       price: 1200,  days: 30, dailyRebate: 15,  dailyBonus: 0.10, items: ['bub_vip1', 'ent_vip1', 'bdg_vip1'],
        perks: ['VIP badge + chat bubble', 'Entrance banner in every room', '+10% daily & chest diamonds', '15 💎 daily rebate'] },
      { tier: 2, name: 'VIP+',      price: 4800,  days: 30, dailyRebate: 60,  dailyBonus: 0.25, items: ['bub_vip2', 'ent_vip2', 'bdg_vip2', 'frm_vip2'],
        perks: ['Everything in VIP', 'Velvet Crown gift unlocked', 'Animated VIP+ frame', '+25% daily & chest diamonds', '60 💎 daily rebate'] },
      { tier: 3, name: 'Black VIP', price: 19800, days: 30, dailyRebate: 260, dailyBonus: 0.50, items: ['bub_vip3', 'ent_vip3', 'bdg_vip3', 'frm_vip3', 'nc_vip3'],
        perks: ['Everything in VIP+', 'Galaxy gift unlocked', 'Holographic name', '+50% daily & chest diamonds', '260 💎 daily rebate', 'Top of the guest queue'] }
    ],
    vipRenewRate: 0.4,               // renewing the same tier costs 40% of list price
    vipRenewGraceDays: 3,
    items: [
      // camera / view filters
      { id: 'flt_rose',   type: 'filter', name: 'Rose Tint',   rarity: 'common',    price: 60,   css: 'sepia(.35) saturate(1.6) hue-rotate(-30deg)' },
      { id: 'flt_mono',   type: 'filter', name: 'Mono',        rarity: 'common',    price: 80,   css: 'grayscale(1) contrast(1.15)' },
      { id: 'flt_noir',   type: 'filter', name: 'Neon Noir',   rarity: 'rare',      price: 120,  css: 'grayscale(1) contrast(1.35) brightness(.92)', overlay: 'pink' },
      { id: 'flt_velvet', type: 'filter', name: 'Velvet Glow', rarity: 'epic',      price: 200,  css: 'saturate(1.5) contrast(1.05) brightness(1.1)', overlay: 'glow' },
      { id: 'flt_gold',   type: 'filter', name: 'Gold Hour',   rarity: 'epic',      price: 300,  css: 'sepia(.6) saturate(1.8) brightness(1.05)' },
      { id: 'flt_ice',    type: 'filter', name: 'Ice',         rarity: 'rare',      price: null, css: 'saturate(.8) hue-rotate(160deg) brightness(1.05)' },
      { id: 'flt_vhs',    type: 'filter', name: 'VHS',         rarity: 'epic',      price: null, css: 'saturate(1.3) contrast(1.1) hue-rotate(-8deg)', overlay: 'scanlines' },
      // avatar frames
      { id: 'frm_neon',   type: 'frame', name: 'Neon Ring',    rarity: 'rare',      price: 150 },
      { id: 'frm_thorns', type: 'frame', name: 'Thorns',       rarity: 'rare',      price: null },
      { id: 'frm_gold',   type: 'frame', name: 'Gilded',       rarity: 'epic',      price: null },
      { id: 'frm_halo',   type: 'frame', name: 'Halo',         rarity: 'legendary', price: null },
      { id: 'frm_vip2',   type: 'frame', name: 'VIP+ Frame',   rarity: 'epic',      price: null, vip: 2 },
      { id: 'frm_vip3',   type: 'frame', name: 'Black Frame',  rarity: 'legendary', price: null, vip: 3 },
      // chat bubbles
      { id: 'bub_pink',   type: 'bubble', name: 'Pink Bubble',  rarity: 'common',   price: 50 },
      { id: 'bub_glass',  type: 'bubble', name: 'Glass Bubble', rarity: 'rare',     price: 180 },
      { id: 'bub_gold',   type: 'bubble', name: 'Gold Bubble',  rarity: 'rare',     price: null },
      { id: 'bub_vip1',   type: 'bubble', name: 'VIP Bubble',   rarity: 'rare',     price: null, vip: 1 },
      { id: 'bub_vip2',   type: 'bubble', name: 'VIP+ Bubble',  rarity: 'epic',     price: null, vip: 2 },
      { id: 'bub_vip3',   type: 'bubble', name: 'Black Bubble', rarity: 'legendary', price: null, vip: 3 },
      // entrance effects
      { id: 'ent_spark',  type: 'entrance', name: 'Spark Trail',  rarity: 'rare',      price: 250, text: 'arrived in a shower of sparks' },
      { id: 'ent_rose',   type: 'entrance', name: 'Rose Petals',  rarity: 'rare',      price: null, text: 'arrived on a carpet of roses' },
      { id: 'ent_lambo',  type: 'entrance', name: 'Pink Lambo',   rarity: 'epic',      price: 900, text: 'pulled up in a Pink Lambo' },
      { id: 'ent_galaxy', type: 'entrance', name: 'Galaxy Gate',  rarity: 'legendary', price: null, text: 'stepped through the Galaxy Gate' },
      { id: 'ent_vip1',   type: 'entrance', name: 'VIP Arrival',  rarity: 'rare',      price: null, vip: 1, text: 'entered — VIP' },
      { id: 'ent_vip2',   type: 'entrance', name: 'VIP+ Arrival', rarity: 'epic',      price: null, vip: 2, text: 'entered — VIP+' },
      { id: 'ent_vip3',   type: 'entrance', name: 'Black Arrival', rarity: 'legendary', price: null, vip: 3, text: 'has entered — Black VIP' },
      // name colors
      { id: 'nc_pink',    type: 'namecolor', name: 'Hot Pink',    rarity: 'common',    price: 80 },
      { id: 'nc_gold',    type: 'namecolor', name: 'Gold',        rarity: 'epic',      price: null },
      { id: 'nc_holo',    type: 'namecolor', name: 'Holographic', rarity: 'legendary', price: null },
      { id: 'nc_vip3',    type: 'namecolor', name: 'Black Gold',  rarity: 'legendary', price: null, vip: 3 },
      // badges
      { id: 'bdg_vip1',   type: 'badge', name: 'VIP',        rarity: 'rare',      price: null, vip: 1, icon: '◆' },
      { id: 'bdg_vip2',   type: 'badge', name: 'VIP+',       rarity: 'epic',      price: null, vip: 2, icon: '◆◆' },
      { id: 'bdg_vip3',   type: 'badge', name: 'Black VIP',  rarity: 'legendary', price: null, vip: 3, icon: '♛' },
      { id: 'bdg_legend', type: 'badge', name: 'Legend',     rarity: 'legendary', price: null, icon: '✦' },
      { id: 'bdg_event',  type: 'badge', name: 'Neon Week',  rarity: 'epic',      price: null, icon: '☾' }
    ],
    gacha: {
      boxes: [
        { id: 'velvet', name: 'Velvet Box', cost: 60,  cost10: 540,  odds: { common: 0.68, rare: 0.24, epic: 0.07, legendary: 0.01 }, pity: { epic: 15, legendary: 90 } },
        { id: 'black',  name: 'Black Box',  cost: 300, cost10: 2700, odds: { common: 0.40, rare: 0.38, epic: 0.17, legendary: 0.05 }, pity: { epic: 6, legendary: 40 } }
      ],
      pools: {
        common:    [{ diamonds: 10 }, { diamonds: 20 }, { item: 'nc_pink' }, { item: 'bub_pink' }, { item: 'flt_rose' }],
        rare:      [{ diamonds: 60 }, { item: 'flt_ice' }, { item: 'frm_thorns' }, { item: 'ent_rose' }, { item: 'bub_gold' }],
        epic:      [{ diamonds: 250 }, { item: 'flt_vhs' }, { item: 'frm_gold' }, { item: 'ent_lambo' }, { item: 'nc_gold' }],
        legendary: [{ diamonds: 1500 }, { item: 'frm_halo' }, { item: 'nc_holo' }, { item: 'ent_galaxy' }, { item: 'bdg_legend' }]
      },
      dupeRefund: { common: 5, rare: 25, epic: 120, legendary: 600 }
    },
    events: [
      { id: 'neon-week', name: 'Neon Week', type: 'gift', goal: 520, reward: { diamonds: 100, item: 'bdg_event' }, desc: 'Gift 520 💎 to any creator this week' }
    ],
    pk: { durationSec: 180, cooldownSec: 20 },
    affiliates: {                    // outbound "also live on" links. Placeholders: {room} {campaign} {source}. Empty url = hidden.
                                     // Chaturbate is driven by `partners` (shared/partners.js) unless partners.CB.enabled is false.
      CB: { name: 'Chaturbate', url: '' },
      SC: { name: 'Stripchat', url: '' },
      BC: { name: 'BongaCams', url: '' },
      C4: { name: 'CAM4', url: '' }
    }
  };

  class EconError extends Error {
    constructor(code, message) { super(message || code); this.code = code; this.name = 'EconError'; }
  }

  /* ---------- helpers ---------- */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  function mergeConfig(base, over) {
    const out = clone(base);
    if (!isObj(over)) return out;
    for (const k of Object.keys(over)) out[k] = isObj(over[k]) && isObj(out[k]) ? mergeConfig(out[k], over[k]) : clone(over[k]);
    return out;
  }
  const dayKey = (now, cfg) => Math.floor((now + (cfg.dayOffsetMinutes || 0) * 60000) / DAY);
  const nextResetMs = (now, cfg) => (dayKey(now, cfg) + 1) * DAY - (cfg.dayOffsetMinutes || 0) * 60000 - now;
  const weekKey = (now, cfg) => Math.floor((dayKey(now, cfg) + 3) / 7);            // weeks start Monday
  const weekEndsMs = (now, cfg) => ((weekKey(now, cfg) + 1) * 7 - 3) * DAY - (cfg.dayOffsetMinutes || 0) * 60000 - now;
  const int = (v, lo, hi) => { const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < lo || n > hi) throw new EconError('bad_input', `Expected an integer between ${lo} and ${hi}`); return n; };
  const itemById = (cfg, id) => cfg.items.find(i => i.id === id) || null;
  const giftById = (cfg, id) => cfg.gifts.find(g => g.id === id) || null;
  const vipCfg = (cfg, tier) => cfg.vip.find(v => v.tier === tier) || null;

  /* ---------- state ---------- */
  function newState(cfg, now) {
    return {
      v: 1, created: now,
      diamonds: cfg.welcomeDiamonds, xp: 0,
      vip: null,
      inventory: {},                                   // itemId -> { at, exp|null }
      equipped: { filter: null, frame: null, bubble: null, entrance: null, namecolor: null, badge: null },
      daily: { streak: 0, lastDay: null },
      watch: { day: null, seconds: 0, claimed: [] },
      gacha: {},                                       // boxId -> { sinceEpic, sinceLegendary, total }
      purchases: { count: 0, day: null, usdToday: 0, usdTotal: 0 },
      limits: { dailyCapUsd: cfg.defaultDailyCapUsd, pending: null },
      stats: { giftedDiamonds: 0, giftsSent: 0, chatDay: null, chatXp: 0, boxesOpened: 0 },
      event: { key: null, progress: 0, claimed: false }
    };
  }
  function ensure(state, cfg, now) {
    const fresh = newState(cfg, now);
    for (const k of Object.keys(fresh)) if (state[k] === undefined) state[k] = fresh[k];
    for (const k of Object.keys(fresh.equipped)) if (state.equipped[k] === undefined) state.equipped[k] = null;
    // expire timed inventory + VIP-bound equips
    for (const [id, rec] of Object.entries(state.inventory)) if (rec.exp && rec.exp <= now) delete state.inventory[id];
    for (const [slot, id] of Object.entries(state.equipped)) if (id && !state.inventory[id]) state.equipped[slot] = null;
    // pending purchase-cap raise
    if (state.limits.pending && state.limits.pending.at <= now) { state.limits.dailyCapUsd = state.limits.pending.usd; state.limits.pending = null; }
    return state;
  }

  /* ---------- levels ---------- */
  const xpNeed = (level, cfg) => Math.round(cfg.levelCurve.base * Math.pow(level, cfg.levelCurve.exp));
  function levelInfo(xp, cfg) {
    let level = 1, rem = xp;
    while (level < cfg.levelCurve.max && rem >= xpNeed(level, cfg)) { rem -= xpNeed(level, cfg); level++; }
    const need = xpNeed(level, cfg);
    return { level, into: rem, need, pct: level >= cfg.levelCurve.max ? 1 : rem / need };
  }
  const levelReward = (level, cfg) => ({ diamonds: cfg.levelRewards.diamondsPerLevel * level, item: cfg.levelRewards.items[level] || null });
  function grant(state, itemId, now, exp) {
    const cur = state.inventory[itemId];
    if (cur && !cur.exp) return false;                // already permanent
    state.inventory[itemId] = { at: now, exp: exp || null };
    return true;
  }
  function addXp(state, amount, cfg, now) {
    const n = Math.max(0, Math.round(amount)); if (!n) return [];
    const before = levelInfo(state.xp, cfg).level;
    state.xp += n;
    const after = levelInfo(state.xp, cfg).level, ups = [];
    for (let L = before + 1; L <= after; L++) {
      const r = levelReward(L, cfg); state.diamonds += r.diamonds;
      if (r.item) grant(state, r.item, now);
      ups.push({ level: L, diamonds: r.diamonds, item: r.item });
    }
    return ups;
  }

  /* ---------- VIP ---------- */
  const vipTier = (state, now) => (state.vip && state.vip.expires > now ? state.vip.tier : 0);
  const vipBonus = (state, cfg, now) => { const t = vipCfg(cfg, vipTier(state, now)); return t ? t.dailyBonus : 0; };
  function vipQuote(state, cfg, now, tier) {
    const t = vipCfg(cfg, tier); if (!t) throw new EconError('not_found', 'Unknown VIP tier');
    const cur = state.vip;
    const isRenew = !!(cur && cur.tier === tier && cur.expires > now - cfg.vipRenewGraceDays * DAY);
    return { tier, name: t.name, price: isRenew ? Math.round(t.price * cfg.vipRenewRate) : t.price, listPrice: t.price, isRenew, days: t.days };
  }
  function buyVip(state, cfg, now, tier) {
    tier = int(tier, 1, 9);
    const q = vipQuote(state, cfg, now, tier), t = vipCfg(cfg, tier);
    if (vipTier(state, now) > tier) throw new EconError('downgrade', 'You already hold a higher VIP tier');
    if (state.diamonds < q.price) throw new EconError('insufficient', 'Not enough diamonds');
    state.diamonds -= q.price;
    const start = state.vip && state.vip.tier === tier && state.vip.expires > now ? state.vip.expires : now;
    const expires = start + t.days * DAY;
    state.vip = { tier, expires, since: (state.vip && state.vip.since) || now, lastRebateDay: state.vip && state.vip.tier === tier ? state.vip.lastRebateDay : null };
    t.items.forEach(id => { const cur = state.inventory[id]; if (!cur || cur.exp) state.inventory[id] = { at: now, exp: expires }; });
    return { ...q, expires };
  }
  function claimVipRebate(state, cfg, now) {
    const tier = vipTier(state, now); if (!tier) throw new EconError('no_vip', 'No active VIP');
    const today = dayKey(now, cfg);
    if (state.vip.lastRebateDay === today) throw new EconError('already_claimed', 'Rebate already claimed today');
    const t = vipCfg(cfg, tier); state.vip.lastRebateDay = today; state.diamonds += t.dailyRebate;
    return { diamonds: t.dailyRebate, tier };
  }

  /* ---------- daily check-in ---------- */
  function dailyStatus(state, cfg, now) {
    const today = dayKey(now, cfg), last = state.daily.lastDay;
    const claimed = last === today;
    const alive = claimed || last === today - 1;
    const streak = alive ? state.daily.streak : 0;
    const idx = claimed ? (streak - 1) % cfg.daily.length : streak % cfg.daily.length;
    return { claimed, streak, idx, rewards: cfg.daily, resetInMs: nextResetMs(now, cfg) };
  }
  function claimDaily(state, cfg, now, rng) {
    const st = dailyStatus(state, cfg, now);
    if (st.claimed) throw new EconError('already_claimed', 'Already checked in today');
    const r = cfg.daily[st.idx];
    const diamonds = Math.round(r.diamonds * (1 + vipBonus(state, cfg, now)));
    state.daily = { streak: st.streak + 1, lastDay: dayKey(now, cfg) };
    state.diamonds += diamonds;
    const levelUps = addXp(state, cfg.xp.perDailyClaim, cfg, now);
    const box = r.box ? rollGacha(state, cfg, now, r.box, 1, rng, true) : null;
    return { day: st.idx + 1, streak: state.daily.streak, diamonds, xp: cfg.xp.perDailyClaim, levelUps, box };
  }

  /* ---------- watch-time chests ---------- */
  function rollWatchDay(state, cfg, now) { const today = dayKey(now, cfg); if (state.watch.day !== today) state.watch = { day: today, seconds: 0, claimed: [] }; }
  function watchStatus(state, cfg, now) {
    const today = dayKey(now, cfg), w = state.watch.day === today ? state.watch : { seconds: 0, claimed: [] };
    const chests = cfg.watchChests.map((c, i) => ({ ...c, i, claimed: w.claimed.includes(i), ready: w.seconds >= c.min * 60 && !w.claimed.includes(i) }));
    const next = chests.find(c => !c.claimed && !c.ready) || null;
    return { seconds: w.seconds, chests, next, nextInSec: next ? Math.max(0, next.min * 60 - w.seconds) : null, readyCount: chests.filter(c => c.ready).length, resetInMs: nextResetMs(now, cfg) };
  }
  function tickWatch(state, cfg, now, seconds) {
    rollWatchDay(state, cfg, now);
    const secs = Math.max(0, Math.min(cfg.watchMaxTickSec, Math.floor(Number(seconds) || 0)));
    const cap = cfg.watchDailyCapMin * 60;
    const before = state.watch.seconds;
    state.watch.seconds = Math.min(cap, before + secs);
    const minutes = Math.floor(state.watch.seconds / 60) - Math.floor(before / 60);
    const levelUps = addXp(state, minutes * cfg.xp.perWatchMinute, cfg, now);
    return { added: state.watch.seconds - before, xp: minutes * cfg.xp.perWatchMinute, levelUps };
  }
  function claimWatchChest(state, cfg, now, i) {
    rollWatchDay(state, cfg, now);
    const st = watchStatus(state, cfg, now), c = st.chests[int(i, 0, 99)];
    if (!c) throw new EconError('not_found', 'Unknown chest');
    if (c.claimed) throw new EconError('already_claimed', 'Chest already opened');
    if (!c.ready) throw new EconError('not_ready', 'Keep watching to unlock this chest');
    state.watch.claimed.push(c.i);
    const diamonds = Math.round(c.diamonds * (1 + vipBonus(state, cfg, now)));
    state.diamonds += diamonds;
    const levelUps = addXp(state, c.xp, cfg, now);
    return { i: c.i, diamonds, xp: c.xp, levelUps };
  }

  /* ---------- gifts ---------- */
  const giftFx = (g) => (g.price >= 1314 ? 'fullscreen' : g.price >= 520 ? 'banner' : g.price >= 99 ? 'burst' : 'float');
  function sendGift(state, cfg, now, giftId, qty) {
    const g = giftById(cfg, giftId); if (!g) throw new EconError('not_found', 'Unknown gift');
    qty = int(qty, 1, 9999);
    if (g.vip && vipTier(state, now) < g.vip) throw new EconError('vip_required', `Requires ${vipCfg(cfg, g.vip).name}`);
    const cost = g.price * qty;
    if (state.diamonds < cost) throw new EconError('insufficient', 'Not enough diamonds');
    state.diamonds -= cost;
    state.stats.giftedDiamonds += cost; state.stats.giftsSent += qty;
    progressEvent(state, cfg, now, 'gift', cost);
    const levelUps = addXp(state, cost * cfg.xp.perDiamondGifted, cfg, now);
    return { gift: g, qty, cost, beans: cost * cfg.beansPerDiamond, xp: cost * cfg.xp.perDiamondGifted, fx: giftFx(g), levelUps };
  }

  /* ---------- chat xp ---------- */
  function chatXp(state, cfg, now) {
    const today = dayKey(now, cfg);
    if (state.stats.chatDay !== today) { state.stats.chatDay = today; state.stats.chatXp = 0; }
    if (state.stats.chatXp >= cfg.xp.chatDailyCap) return { xp: 0, levelUps: [] };
    state.stats.chatXp += cfg.xp.perChat;
    return { xp: cfg.xp.perChat, levelUps: addXp(state, cfg.xp.perChat, cfg, now) };
  }

  /* ---------- cosmetics store ---------- */
  function buyItem(state, cfg, now, itemId) {
    const it = itemById(cfg, itemId); if (!it) throw new EconError('not_found', 'Unknown item');
    if (!it.price) throw new EconError('not_for_sale', 'This item is only available from boxes, events or VIP');
    if (state.inventory[itemId] && !state.inventory[itemId].exp) throw new EconError('owned', 'You already own this');
    if (it.vip && vipTier(state, now) < it.vip) throw new EconError('vip_required', `Requires ${vipCfg(cfg, it.vip).name}`);
    if (state.diamonds < it.price) throw new EconError('insufficient', 'Not enough diamonds');
    state.diamonds -= it.price; grant(state, itemId, now);
    return { item: it, cost: it.price };
  }
  function equip(state, cfg, now, slot, itemId) {
    if (!(slot in state.equipped)) throw new EconError('bad_input', 'Unknown slot');
    if (itemId == null || itemId === '') { state.equipped[slot] = null; return { slot, itemId: null }; }
    const it = itemById(cfg, itemId); if (!it || it.type !== slot) throw new EconError('bad_input', 'Item does not fit that slot');
    const rec = state.inventory[itemId]; if (!rec || (rec.exp && rec.exp <= now)) throw new EconError('not_owned', 'You don\'t own this item');
    state.equipped[slot] = itemId; return { slot, itemId };
  }

  /* ---------- mystery boxes (odds always disclosed via gachaOdds) ---------- */
  function gachaOdds(cfg) {
    return cfg.gacha.boxes.map(b => ({ id: b.id, name: b.name, cost: b.cost, cost10: b.cost10, odds: b.odds, pity: b.pity, pools: cfg.gacha.pools, dupeRefund: cfg.gacha.dupeRefund }));
  }
  function pickRarity(box, pity, rng) {
    if (pity.sinceLegendary + 1 >= box.pity.legendary) return 'legendary';
    let r = rng(), acc = 0, rarity = 'common';
    for (const k of RARITIES) { acc += box.odds[k]; if (r < acc) { rarity = k; break; } }
    if (rarity !== 'legendary' && rarity !== 'epic' && pity.sinceEpic + 1 >= box.pity.epic) rarity = 'epic';
    return rarity;
  }
  function rollGacha(state, cfg, now, boxId, count, rng, free) {
    const box = cfg.gacha.boxes.find(b => b.id === boxId); if (!box) throw new EconError('not_found', 'Unknown box');
    count = Number(count) === 10 ? 10 : 1;
    const cost = free ? 0 : count === 10 ? box.cost10 : box.cost;
    if (state.diamonds < cost) throw new EconError('insufficient', 'Not enough diamonds');
    state.diamonds -= cost;
    const pity = state.gacha[boxId] || (state.gacha[boxId] = { sinceEpic: 0, sinceLegendary: 0, total: 0 });
    const results = [];
    for (let n = 0; n < count; n++) {
      const rarity = pickRarity(box, pity, rng);
      pity.total++;
      pity.sinceEpic = rarity === 'epic' || rarity === 'legendary' ? 0 : pity.sinceEpic + 1;
      pity.sinceLegendary = rarity === 'legendary' ? 0 : pity.sinceLegendary + 1;
      const pool = cfg.gacha.pools[rarity], drop = pool[Math.floor(rng() * pool.length) % pool.length];
      if (drop.diamonds) { state.diamonds += drop.diamonds; results.push({ rarity, diamonds: drop.diamonds }); continue; }
      const it = itemById(cfg, drop.item);
      if (grant(state, drop.item, now)) results.push({ rarity, item: it });
      else { const refund = cfg.gacha.dupeRefund[rarity]; state.diamonds += refund; results.push({ rarity, item: it, duplicate: true, diamonds: refund }); }
    }
    state.stats.boxesOpened += count;
    return { box: { id: box.id, name: box.name }, cost, results, pity: { ...pity } };
  }

  /* ---------- purchases + spend limits ---------- */
  function flashSale(cfg, now) {
    const fs = cfg.flashSale; if (!fs || !fs.packs.length) return null;
    const win = fs.windowHours * 3600000, slot = Math.floor(now / win);
    return { packId: fs.packs[slot % fs.packs.length], bonusPct: fs.bonusPct, endsInMs: (slot + 1) * win - now };
  }
  function rollPurchaseDay(state, cfg, now) { const today = dayKey(now, cfg); if (state.purchases.day !== today) { state.purchases.day = today; state.purchases.usdToday = 0; } }
  function purchaseQuote(state, cfg, now, packId) {
    const p = cfg.diamondPacks.find(x => x.id === packId); if (!p) throw new EconError('not_found', 'Unknown pack');
    const fs = flashSale(cfg, now);
    const flash = fs && fs.packId === p.id ? Math.round(p.diamonds * fs.bonusPct / 100) : 0;
    const first = state.purchases.count === 0 ? Math.round(p.diamonds * (cfg.firstPurchaseMultiplier - 1)) : 0;
    const today = dayKey(now, cfg), usdToday = state.purchases.day === today ? state.purchases.usdToday : 0;
    return { pack: p, base: p.diamonds, bonus: p.bonus, flash, first, total: p.diamonds + p.bonus + flash + first, usd: p.usd, capLeftUsd: Math.max(0, state.limits.dailyCapUsd - usdToday) };
  }
  function creditPurchase(state, cfg, now, packId) {
    rollPurchaseDay(state, cfg, now);
    const q = purchaseQuote(state, cfg, now, packId);
    if (state.purchases.usdToday + q.usd > state.limits.dailyCapUsd + 1e-9) throw new EconError('cap_reached', `Daily purchase limit of $${state.limits.dailyCapUsd} reached`);
    state.diamonds += q.total;
    state.purchases.count++; state.purchases.usdToday += q.usd; state.purchases.usdTotal += q.usd;
    return q;
  }
  function setDailyCap(state, cfg, now, usd) {
    usd = int(usd, 0, 100000);
    if (usd <= state.limits.dailyCapUsd) { state.limits.dailyCapUsd = usd; state.limits.pending = null; return { dailyCapUsd: usd, pending: null }; }
    state.limits.pending = { usd, at: now + cfg.capRaiseCooldownHours * 3600000 };
    return { dailyCapUsd: state.limits.dailyCapUsd, pending: state.limits.pending };
  }

  /* ---------- weekly event ---------- */
  function eventStatus(state, cfg, now) {
    const ev = cfg.events[0]; if (!ev) return null;
    const key = ev.id + ':' + weekKey(now, cfg);
    const mine = state.event.key === key ? state.event : { progress: 0, claimed: false };
    return { ...ev, key, progress: Math.min(ev.goal, mine.progress), claimed: mine.claimed, done: mine.progress >= ev.goal, endsInMs: weekEndsMs(now, cfg) };
  }
  function progressEvent(state, cfg, now, type, amount) {
    const ev = cfg.events[0]; if (!ev || ev.type !== type) return;
    const key = ev.id + ':' + weekKey(now, cfg);
    if (state.event.key !== key) state.event = { key, progress: 0, claimed: false };
    state.event.progress += amount;
  }
  function claimEvent(state, cfg, now) {
    const st = eventStatus(state, cfg, now); if (!st) throw new EconError('not_found', 'No active event');
    if (!st.done) throw new EconError('not_ready', 'Event goal not reached yet');
    if (st.claimed) throw new EconError('already_claimed', 'Event reward already claimed');
    state.event.claimed = true; state.diamonds += st.reward.diamonds || 0;
    if (st.reward.item) grant(state, st.reward.item, now);
    return { diamonds: st.reward.diamonds || 0, item: st.reward.item ? itemById(cfg, st.reward.item) : null };
  }

  /* ---------- creators ---------- */
  function convertBeans(beans, amount, cfg) {
    amount = int(amount, 1, 1e12); if (amount > beans) throw new EconError('insufficient', 'Not enough beans');
    return { beans: amount, diamonds: Math.floor(amount * cfg.beanToDiamondRate) };
  }
  function payoutQuote(beans, amount, cfg) {
    amount = int(amount, 1, 1e12); if (amount > beans) throw new EconError('insufficient', 'Not enough beans');
    if (amount < cfg.minPayoutBeans) throw new EconError('below_min', `Minimum payout is ${cfg.minPayoutBeans} beans`);
    return { beans: amount, usd: Math.round(amount * cfg.beanUsd * 100) / 100 };
  }

  /* ---------- hosts, agencies, families ---------- */
  function hostTier(beans30d, cfg) { return [...cfg.hostTiers].reverse().find(t => beans30d >= t.min30d) || cfg.hostTiers[0]; }
  function hostBonusBeans(beans, beans30d, cfg) { return Math.floor(beans * hostTier(beans30d, cfg).bonusPct / 100); }
  function agencyCommission(beans, cfg) { return Math.floor(beans * cfg.agencyCommissionPct / 100); }
  function localHour(now, cfg) { return new Date(now + (cfg.dayOffsetMinutes || 0) * 60000).getUTCHours(); }
  function warStatus(cfg, now) {
    const f = cfg.families, h = localHour(now, cfg), active = h >= f.warStartHour && h < f.warEndHour;
    const base = dayKey(now, cfg) * DAY - (cfg.dayOffsetMinutes || 0) * 60000;
    let startsAt = base + f.warStartHour * 3600000, endsAt = base + f.warEndHour * 3600000;
    if (now >= endsAt) { startsAt += DAY; endsAt += DAY; }
    return { active, multiplier: active ? f.warMultiplier : 1, startsInMs: Math.max(0, startsAt - now), endsInMs: active ? endsAt - now : null };
  }
  function familyLevel(xp, cfg) {
    const f = cfg.families; let level = 1, rem = xp; const need = (l) => Math.round(f.levelBase * Math.pow(l, f.levelExp));
    while (level < 50 && rem >= need(level)) { rem -= need(level); level++; }
    return { level, into: rem, need: need(level), pct: rem / need(level) };
  }
  const weekId = (now, cfg) => weekKey(now, cfg);

  /* ---------- client-facing summary ---------- */
  function summary(state, cfg, now) {
    ensure(state, cfg, now);
    const tier = vipTier(state, now), t = vipCfg(cfg, tier);
    return {
      diamonds: state.diamonds, xp: state.xp, level: levelInfo(state.xp, cfg),
      vip: tier ? { tier, name: t.name, expires: state.vip.expires, rebateClaimed: state.vip.lastRebateDay === dayKey(now, cfg) } : null,
      inventory: state.inventory, equipped: state.equipped,
      daily: dailyStatus(state, cfg, now), watch: watchStatus(state, cfg, now), event: eventStatus(state, cfg, now),
      gacha: state.gacha, firstPurchase: state.purchases.count === 0, flashSale: flashSale(cfg, now),
      limits: state.limits, stats: state.stats
    };
  }

  return {
    DEFAULT_CONFIG, RARITIES, EconError, mergeConfig, dayKey, nextResetMs,
    newState, ensure, levelInfo, xpNeed, addXp, grant,
    vipTier, vipQuote, buyVip, claimVipRebate,
    dailyStatus, claimDaily, watchStatus, tickWatch, claimWatchChest,
    giftById, giftFx, sendGift, chatXp, itemById, buyItem, equip,
    gachaOdds, rollGacha, flashSale, purchaseQuote, creditPurchase, setDailyCap,
    eventStatus, claimEvent, convertBeans, payoutQuote, summary,
    hostTier, hostBonusBeans, agencyCommission, warStatus, familyLevel, weekId, localHour
  };
});
