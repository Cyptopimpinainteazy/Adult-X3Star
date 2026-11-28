/* =====================================================================
   x3STAR — gamification layer
   Diamonds · XP/levels · daily check-in · watch-time chests · gifts with
   combos and full-screen effects · entrances · PK battles · VIP ·
   mystery boxes · cosmetics (filters, frames, bubbles, entrances, name
   colors, badges) · weekly events · families · guest queue.

   Runs in two modes:
     API mode   (served by server/) — economy is authoritative on the server
     Local mode (static / standalone) — same rules engine, state in localStorage
   ===================================================================== */
(() => {
'use strict';
const X = window.X3STAR, E = window.X3Economy;
if (!X || !E) { console.error('[x3game] core or economy engine missing'); return; }
const U = X.ui, BOOT = window.X3STAR_BOOT || null, API = !!(BOOT && BOOT.api && window.X3API);
const { $, $$, el, esc, fmt, toast, openModal, store, track } = U;
const now = () => Date.now();
const cfg = (BOOT && BOOT.economy) || E.DEFAULT_CONFIG;
const itemById = (id) => E.itemById(cfg, id);
const giftById = (id) => E.giftById(cfg, id);
const RCOL = { common: '#b9b2bb', rare: '#5ab8ff', epic: '#c41dff', legendary: '#ffc547' };
const clock = (ms) => { ms = Math.max(0, ms); const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0'); };
const dclock = (ms) => { const d = Math.floor(ms / 86400000); return d ? `${d}d ${clock(ms % 86400000)}` : clock(ms); };
const dm = (n) => `💎 ${fmt.num(n)}`;

/* =====================================================================
   Economy client
   ===================================================================== */
const Econ = {
  me: API ? (BOOT.me || null) : { name: 'you', role: 'fan', local: true },
  summary: null, state: null,
  init() {
    if (API) { this.summary = this.me ? this.me.econ : null; return; }
    let s = store.get('econ', null);
    if (!s) s = E.newState(cfg, now());
    this.state = E.ensure(s, cfg, now()); this.save();
  },
  save() { if (!API) { store.set('econ', this.state); this.summary = E.summary(this.state, cfg, now()); } },
  refreshLocal() { if (!API) { E.ensure(this.state, cfg, now()); this.summary = E.summary(this.state, cfg, now()); } },
  signedIn() { return !API || !!this.me; },
  async run(path, body, localFn) {
    if (API) {
      if (!this.me) { openAuth('Sign in to collect diamonds and rewards'); throw Object.assign(new Error('Sign in first'), { code: 'auth_required', silent: true }); }
      const res = await X3API.post('/api/econ/' + path, body || {});
      this.summary = res.econ; return res.result;
    }
    const r = localFn(this.state, cfg, now()); this.save(); return r;
  }
};
const S = () => Econ.summary;
const rng = Math.random;

const actions = {
  daily: () => Econ.run('daily', {}, (s, c, t) => E.claimDaily(s, c, t, rng)),
  watch: (seconds) => Econ.run('watch', { seconds }, (s, c, t) => E.tickWatch(s, c, t, seconds)),
  chest: (i) => Econ.run('watch/claim', { i }, (s, c, t) => E.claimWatchChest(s, c, t, i)),
  buy: (itemId) => Econ.run('store/buy', { itemId }, (s, c, t) => E.buyItem(s, c, t, itemId)),
  equip: (slot, itemId) => Econ.run('equip', { slot, itemId }, (s, c, t) => E.equip(s, c, t, slot, itemId)),
  vip: (tier) => Econ.run('vip', { tier }, (s, c, t) => E.buyVip(s, c, t, tier)),
  rebate: () => Econ.run('vip/rebate', {}, (s, c, t) => E.claimVipRebate(s, c, t)),
  gacha: (boxId, count) => Econ.run('gacha', { boxId, count }, (s, c, t) => E.rollGacha(s, c, t, boxId, count, rng, false)),
  event: () => Econ.run('event/claim', {}, (s, c, t) => E.claimEvent(s, c, t)),
  limit: (usd) => Econ.run('limits', { dailyCapUsd: usd }, (s, c, t) => E.setDailyCap(s, c, t, usd)),
  purchase: (packId) => Econ.run('purchase', { packId }, (s, c, t) => ({ ...E.creditPurchase(s, c, t, packId), test: true })),
  gift: async (creatorId, giftId, qty) => {
    const r = await Econ.run('gift', { creatorId, giftId, qty }, (s, c, t) => E.sendGift(s, c, t, giftId, qty));
    if (!API) X.bus.emit({ type: 'gift', site: 'X3', room: creatorId, user: X.ui.meName(), giftId, qty, diamonds: r.cost, own: true, level: lvl(), vip: vipT(), cosmetics: S().equipped });
    return r;
  }
};
const lvl = () => (S() ? S().level.level : 1);
const vipT = () => (S() && S().vip ? S().vip.tier : 0);

/** Wrap an action: handle errors, HUD refresh, level-ups. */
async function act(fn, { ok, from } = {}) {
  try {
    const before = S() ? S().diamonds : 0;
    const r = await fn();
    paintHUD(before, from);
    if (r && r.levelUps && r.levelUps.length) showLevelUps(r.levelUps);
    if (r && r.box && r.box.results) setTimeout(() => showBoxReveal(r.box), 900);
    if (ok) toast(typeof ok === 'function' ? ok(r) : ok, 'ok');
    refreshViews();
    return r;
  } catch (e) {
    if (!e.silent) {
      if (e.code === 'insufficient') { toast('Not enough diamonds'); openTopUp(); }
      else toast(e.message || 'Something went wrong');
    }
    return null;
  }
}

/* =====================================================================
   HUD — diamonds + level in the nav
   ===================================================================== */
function mountHUD() {
  const right = $('.nav-right'); if (!right || $('#hud')) return;
  const hud = el(`<div class="hud" id="hud">
    <button class="hud-dm" id="hudDm" aria-label="Diamonds — open rewards"><span class="gem">💎</span><b id="hudDmN">0</b><i>+</i></button>
    <button class="hud-lv" id="hudLv" aria-label="Level"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" class="bg"/><circle cx="18" cy="18" r="15.5" class="fg" id="hudRing"/></svg><span id="hudLvN">1</span></button>
    <button class="btn btn--sm btn--primary" id="hudSignin" hidden>Sign in</button>
  </div>`);
  right.insertBefore(hud, right.firstChild);
  $('#hudDm').onclick = () => { location.hash = '#rewards'; };
  $('#hudLv').onclick = () => { location.hash = '#rewards'; setTimeout(() => $('#levelRoad') && $('#levelRoad').scrollIntoView({ behavior: 'smooth', block: 'center' }), 500); };
  $('#hudSignin').onclick = () => openAuth();
  paintHUD();
}
let hudShown = 0;
function paintHUD(before, from) {
  const s = S(), signed = Econ.signedIn();
  $('#hudDm').hidden = !signed; $('#hudLv').hidden = !signed; $('#hudSignin').hidden = signed;
  if (!s) return;
  const target = s.diamonds, n = $('#hudDmN');
  const start = before != null ? before : hudShown;
  if (target !== start && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const t0 = performance.now(), dur = 900;
    const step = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); n.textContent = fmt.num(start + (target - start) * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    const chip = $('#hudDm'); chip.classList.remove('up', 'down'); void chip.offsetWidth; chip.classList.add(target > start ? 'up' : 'down');
    if (target > start && from) flyGems(from, Math.min(14, 4 + Math.round(Math.log2(target - start + 1))));
  } else n.textContent = fmt.num(target);
  hudShown = target;
  $('#hudLvN').textContent = s.level.level;
  const C = 2 * Math.PI * 15.5; $('#hudRing').style.strokeDasharray = C; $('#hudRing').style.strokeDashoffset = C * (1 - s.level.pct);
  $('#hudLv').title = `Level ${s.level.level} · ${fmt.num(s.level.into)} / ${fmt.num(s.level.need)} XP`;
  $('#hudLv').classList.toggle('vip', !!s.vip);
}
function flyGems(fromEl, count) {
  const src = (fromEl.getBoundingClientRect ? fromEl : document.body).getBoundingClientRect(), dst = $('#hudDm').getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const g = el('<span class="fly-gem">💎</span>'); document.body.appendChild(g);
    const sx = src.left + src.width / 2 + (Math.random() - .5) * 60, sy = src.top + src.height / 2 + (Math.random() - .5) * 40;
    const mx = (sx + dst.left) / 2 + (Math.random() - .5) * 200, my = Math.min(sy, dst.top) - 80 - Math.random() * 80;
    g.animate([{ transform: `translate(${sx}px,${sy}px) scale(.6)`, opacity: 0 }, { transform: `translate(${mx}px,${my}px) scale(1.3)`, opacity: 1, offset: .4 }, { transform: `translate(${dst.left + 14}px,${dst.top + 8}px) scale(.5)`, opacity: .9 }],
      { duration: 900 + i * 45, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' }).onfinish = () => g.remove();
  }
}

/* =====================================================================
   Intro: cinematic splash → daily check-in
   ===================================================================== */
function intro() {
  if (store.sget('introSeen', false)) { maybeDaily(); return; }
  store.sset('introSeen', true);
  const live = X.models.length, s = S(), streak = s ? s.daily.streak : 0;
  const pk = PK.state, pkTxt = pk && pk.phase === 'live' ? `PK live · ${clock(pk.endsAt - now())} left` : 'PK battles every few minutes';
  const sp = el(`<div class="splash" role="dialog" aria-label="Welcome">
    <div class="splash-rays"></div>
    <div class="splash-in"><div class="splash-logo"><em>x3</em>STAR</div>
      <div class="splash-lines"><span>${live} live now</span><span>${esc(pkTxt)}</span><span>${streak ? `🔥 ${streak}-day streak` : 'Day 1 reward waiting'}</span></div>
      <button class="btn btn--primary btn--lg" id="splashGo">Enter the floor</button></div></div>`);
  document.body.appendChild(sp);
  const close = () => { sp.classList.add('out'); setTimeout(() => { sp.remove(); maybeDaily(); }, 500); };
  $('#splashGo', sp).onclick = close; setTimeout(close, 3600);
}
function maybeDaily() { const s = S(); if (s && !s.daily.claimed && Econ.signedIn()) setTimeout(openDaily, 300); else if (API && !Econ.me) setTimeout(() => openAuth('Create a free account — 100 💎 welcome gift + daily rewards'), 900); }

function openDaily() {
  const s = S(); if (!s) return openAuth();
  const d = s.daily, rewards = cfg.daily;
  const api = openModal(`<div class="modal-h"><span class="eyebrow">Daily check-in</span><h3>${d.claimed ? 'Checked in ✓' : `Day ${d.idx + 1} reward`}</h3><p>${d.streak ? `🔥 ${d.streak}-day streak — don't break it.` : 'Check in every day. Day 7 opens a free Velvet Box.'}</p></div>
    <div class="modal-b"><div class="cal">${rewards.map((r, i) => `<div class="cal-d ${i < (d.claimed ? d.idx + 1 : d.idx) ? 'done' : ''} ${i === d.idx && !d.claimed ? 'today' : ''} ${r.box ? 'box' : ''}"><small>Day ${i + 1}</small><b>${r.box ? '🎁' : '💎'}</b><span>${r.diamonds}${r.box ? ' + box' : ''}</span></div>`).join('')}</div>
    ${d.claimed ? `<div class="next-reset">Next reward in <b class="mono" data-cd="${now() + d.resetInMs}"></b></div><button class="btn btn--block" data-x>Close</button>` : `<button class="btn btn--primary btn--lg btn--block" data-claim><span class="chest">🎁</span> Claim ${rewards[d.idx].diamonds} 💎</button>`}
    ${vipT() && !s.vip.rebateClaimed ? `<button class="btn btn--block" data-rebate>Claim VIP daily rebate</button>` : ''}</div>`, { cls: 'modal--daily' });
  const r = api.root;
  const x = $('[data-x]', r); if (x) x.onclick = api.close;
  const c = $('[data-claim]', r); if (c) c.onclick = async () => {
    c.disabled = true; c.classList.add('opening');
    const res = await act(() => actions.daily(), { from: c });
    if (!res) { c.disabled = false; c.classList.remove('opening'); return; }
    burstAt(c, 22); track('daily_claim', { day: res.day });
    setTimeout(() => { api.close(); toast(`+${res.diamonds} 💎 · Day ${res.day} · 🔥 ${res.streak}`, 'ok'); }, 900);
  };
  const rb = $('[data-rebate]', r); if (rb) rb.onclick = () => act(() => actions.rebate(), { from: rb, ok: (x) => `VIP rebate +${x.diamonds} 💎` }).then(() => rb.remove());
}

/* =====================================================================
   Watch-time chests (floating timer)
   ===================================================================== */
const Watch = { acc: 0, sent: 0, lastActive: now(), timer: 0 };
['mousemove', 'keydown', 'scroll', 'touchstart', 'click'].forEach(ev => addEventListener(ev, () => { Watch.lastActive = now(); }, { passive: true }));
function watching() {
  if (document.hidden || !Econ.signedIn() || !S()) return false;
  if (now() - Watch.lastActive > 120000) return false;
  const r = document.body.dataset.route || 'home';
  return ['home', 'live', 'chat', 'profiles', 'member', 'leaderboard'].includes(r) || !!document.querySelector('.scrim .pm-media video');
}
function mountWatch() {
  const chip = el(`<button class="wchip" id="wchip" aria-label="Watch-time chest"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="bg"/><circle cx="22" cy="22" r="19" class="fg" id="wRing"/></svg><span class="ico">🎁</span><span class="lbl" id="wLbl">—</span></button>`);
  document.body.appendChild(chip);
  chip.onclick = openChests;
  setInterval(() => {
    if (!watching()) return paintWatch();
    Watch.acc++;
    if (!API) { if (Watch.acc >= 5) { const n = Watch.acc; Watch.acc = 0; actions.watch(n).then(r => { if (r && r.levelUps && r.levelUps.length) showLevelUps(r.levelUps); paintHUD(); }); } }
    else if (Watch.acc >= 30) { const n = Watch.acc; Watch.acc = 0; actions.watch(n).then(r => { if (r && r.levelUps && r.levelUps.length) showLevelUps(r.levelUps); paintHUD(); }).catch(() => {}); }
    paintWatch();
  }, 1000);
  paintWatch();
}
function paintWatch() {
  const chip = $('#wchip'), s = S(); if (!chip) return;
  chip.hidden = !s || !Econ.signedIn(); if (!s) return;
  const w = s.watch, local = w.seconds + Watch.acc;
  const next = w.chests.find(c => !c.claimed && local < c.min * 60);
  const ready = w.chests.filter(c => !c.claimed && local >= c.min * 60).length;
  const C = 2 * Math.PI * 19, ring = $('#wRing');
  ring.style.strokeDasharray = C;
  if (ready) { chip.classList.add('ready'); $('#wLbl').textContent = ready > 1 ? `Open ×${ready}` : 'Open!'; ring.style.strokeDashoffset = 0; }
  else if (next) {
    chip.classList.remove('ready');
    const prev = w.chests[next.i - 1], from = prev ? prev.min * 60 : 0, span = next.min * 60 - from;
    ring.style.strokeDashoffset = C * (1 - Math.max(0, local - from) / span);
    $('#wLbl').textContent = clock((next.min * 60 - local) * 1000);
  } else { chip.classList.remove('ready'); $('#wLbl').textContent = 'Done today'; ring.style.strokeDashoffset = 0; }
  chip.classList.toggle('paused', !watching() && !ready && !!next);
}
async function openChests() {
  if (!Econ.signedIn()) return openAuth();
  if (Watch.acc > 0) { const n = Watch.acc; Watch.acc = 0; await act(() => actions.watch(n)); }
  const s = S(), w = s.watch;
  const api = openModal(`<div class="modal-h"><span class="eyebrow">Watch-time chests</span><h3>Keep watching, keep earning.</h3><p>Chests unlock as you watch today. Watched: <b class="mono">${clock(w.seconds * 1000)}</b> · resets in <span class="mono" data-cd="${now() + w.resetInMs}"></span></p></div>
    <div class="modal-b"><div class="chests">${w.chests.map(c => `<div class="chest-c ${c.claimed ? 'claimed' : c.ready ? 'ready' : ''}"><span class="ico">${c.claimed ? '✓' : '🎁'}</span><b>${c.min} min</b><small>${c.diamonds} 💎 · ${c.xp} XP</small>${c.ready ? `<button class="btn btn--sm btn--green" data-i="${c.i}">Open</button>` : c.claimed ? '<em>Opened</em>' : `<em>${clock((c.min * 60 - w.seconds) * 1000)}</em>`}</div>`).join('')}</div>
    ${vipT() ? `<p class="note">VIP bonus applied: +${Math.round(cfg.vip[vipT() - 1].dailyBonus * 100)}% diamonds.</p>` : `<p class="note">VIPs earn up to +50% from every chest. <a href="#rewards" data-vip style="color:var(--pink-2)">See VIP</a></p>`}</div>`);
  $$('[data-i]', api.root).forEach(b => b.onclick = async () => {
    b.disabled = true; const r = await act(() => actions.chest(+b.dataset.i), { from: b });
    if (r) { burstAt(b, 14); b.parentElement.classList.remove('ready'); b.parentElement.classList.add('claimed'); b.replaceWith(el('<em>Opened</em>')); toast(`Chest opened: +${r.diamonds} 💎`, 'ok'); }
    paintWatch();
  });
  const v = $('[data-vip]', api.root); if (v) v.onclick = api.close;
}

/* =====================================================================
   Level-ups
   ===================================================================== */
function showLevelUps(ups) {
  const top = ups[ups.length - 1], total = ups.reduce((a, u) => a + u.diamonds, 0), items = ups.filter(u => u.item).map(u => itemById(u.item));
  const ov = el(`<div class="lvup" role="status"><div class="lvup-in"><small>LEVEL UP</small><b>${top.level}</b><span>+${total} 💎${items.length ? ' · ' + items.map(i => esc(i.name)).join(', ') + ' unlocked' : ''}</span></div></div>`);
  document.body.appendChild(ov); burstAt(ov.firstElementChild, 30);
  track('level_up', { level: top.level });
  setTimeout(() => { ov.classList.add('out'); setTimeout(() => ov.remove(), 600); }, 2600);
}

/* =====================================================================
   FX layer — gift animations, banners, entrances
   ===================================================================== */
const fx = el('<div class="fx" aria-hidden="true"></div>'); document.body.appendChild(fx);
const fsQueue = []; let fsBusy = false;
function burstAt(target, n = 16) {
  const r = (target.getBoundingClientRect ? target : document.body).getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < n; i++) {
    const p = el(`<i class="spark" style="left:${cx}px;top:${cy}px;background:${['#ff2d87', '#c41dff', '#ffd1e6', '#2bff98'][i % 4]}"></i>`); fx.appendChild(p);
    const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 120;
    p.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d - 3}px,${Math.sin(a) * d - 3}px) scale(0)`, opacity: 0 }], { duration: 700 + Math.random() * 400, easing: 'cubic-bezier(.16,1,.3,1)' }).onfinish = () => p.remove();
  }
}
function stageRect() { const s = $('#stageVideo'); return s && s.offsetParent ? s.getBoundingClientRect() : { left: innerWidth * .2, top: innerHeight * .2, width: innerWidth * .6, height: innerHeight * .5 }; }
function floatGift(icon, qty) {
  const r = stageRect(), n = Math.min(qty, 8);
  for (let i = 0; i < n; i++) setTimeout(() => {
    const g = el(`<span class="fgift">${icon}</span>`); fx.appendChild(g);
    const x = r.left + r.width * (0.6 + Math.random() * 0.35), y = r.top + r.height * .9;
    g.animate([{ transform: `translate(${x}px,${y}px) scale(.4)`, opacity: 0 }, { transform: `translate(${x - 20 + Math.random() * 40}px,${y - r.height * .4}px) scale(1.2)`, opacity: 1, offset: .35 }, { transform: `translate(${x - 40 + Math.random() * 80}px,${y - r.height * .85}px) scale(.8)`, opacity: 0 }], { duration: 1800, easing: 'ease-out' }).onfinish = () => g.remove();
  }, i * 140);
}
function burstGift(icon) {
  const r = stageRect(), g = el(`<span class="bgift">${icon}</span>`); g.style.left = r.left + r.width / 2 + 'px'; g.style.top = r.top + r.height / 2 + 'px'; fx.appendChild(g);
  burstAt({ getBoundingClientRect: () => ({ left: r.left + r.width / 2, top: r.top + r.height / 2, width: 0, height: 0 }) }, 26);
  setTimeout(() => g.remove(), 1500);
}
function banner(html, cls = '') {
  const b = el(`<div class="gbanner ${cls}">${html}</div>`); fx.appendChild(b);
  setTimeout(() => b.remove(), 5200);
}
function fullscreenGift(m, g) {
  fsQueue.push([m, g]); if (fsBusy) return;
  const nextFs = () => {
    const it = fsQueue.shift(); if (!it) { fsBusy = false; return; }
    fsBusy = true; const [mm, gg] = it;
    const ov = el(`<div class="fsgift"><div class="fs-rays"></div><span class="fs-icon">${gg.icon}</span><div class="fs-cap"><b>${esc(mm.user)}</b> sent <em>${esc(gg.name)}</em>${mm.qty > 1 ? ' ×' + mm.qty : ''}<small>${mm.room && X.byId[mm.room] ? 'to ' + esc(X.byId[mm.room].name) : ''}</small></div></div>`);
    fx.appendChild(ov); burstAt(ov.querySelector('.fs-icon'), 40);
    setTimeout(() => { ov.classList.add('out'); setTimeout(() => { ov.remove(); nextFs(); }, 500); }, 2600);
  };
  nextFs();
}
const idChip = (m) => `${m.vip ? `<span class="vipb v${m.vip}">${['', '◆', '◆◆', '♛'][m.vip]}</span>` : ''}${m.level ? `<span class="lvb">Lv ${m.level}</span>` : ''}`;
function onGiftMsg(m) {
  const g = giftById(m.giftId); if (!g) return;
  const fxKind = E.giftFx(g), inRoom = m.room && m.room === X.stage.id && document.body.dataset.route === 'live';
  const mine = !!m.own || !!(Econ.me && m.user === Econ.me.name);
  if (fxKind === 'fullscreen' && (inRoom || mine)) fullscreenGift(m, g);
  if (fxKind === 'banner' || fxKind === 'fullscreen') banner(`${idChip(m)}<b>${esc(m.user)}</b> sent <span class="bi">${g.icon}</span> ${esc(g.name)}${m.qty > 1 ? ' ×' + m.qty : ''} ${m.room && X.byId[m.room] ? 'to <b>' + esc(X.byId[m.room].name) + '</b>' : ''}`, fxKind === 'fullscreen' ? 'gold' : '');
  if (inRoom || mine) { if (fxKind === 'burst') burstGift(g.icon); else if (fxKind === 'float') floatGift(g.icon, m.qty || 1); }
  if (m.room) { Fans.add(m.room, m.user, m.diamonds || g.price * (m.qty || 1)); if (m.room === X.stage.id) paintFans(); }
  if (!API && PK.state && PK.state.phase === 'live') { const side = PK.state.a.id === m.room ? 'a' : PK.state.b.id === m.room ? 'b' : null; if (side) PK.add(side, m.diamonds || g.price * (m.qty || 1), m.user); }
}
function onEnter(m) {
  if (!m.room || m.room !== X.stage.id || document.body.dataset.route !== 'live') return;
  const it = itemById(m.entrance) || null, txt = it && it.text ? it.text : 'entered';
  const box = $('#stageVideo'); if (!box) return;
  const b = el(`<div class="entrance v${m.vip || 0} ${m.entrance || ''}">${idChip(m)}<b>${esc(m.user)}</b> ${esc(txt)}</div>`);
  box.appendChild(b); setTimeout(() => b.remove(), 4600);
}

/* =====================================================================
   Top fans (per-room, daily) for the stage
   ===================================================================== */
const Fans = {
  day: E.dayKey(now(), cfg), rooms: {},
  add(room, user, d) { const k = E.dayKey(now(), cfg); if (k !== this.day) { this.day = k; this.rooms = {}; } const r = this.rooms[room] || (this.rooms[room] = {}); r[user] = (r[user] || 0) + d; },
  top(room) { return Object.entries(this.rooms[room] || {}).sort((a, b) => b[1] - a[1]).slice(0, 5); }
};
function paintFans() {
  const box = $('#stageFans'); if (!box) return;
  const top = Fans.top(X.stage.id);
  box.innerHTML = top.length ? top.map(([u, d], i) => `<span class="tf r${i}">${['🥇', '🥈', '🥉', '4', '5'][i]} ${esc(u)} <b>${fmt.k(d)}</b></span>`).join('') : '<span class="tf empty">Be her first gifter today — top fans get shout-outs</span>';
}

/* =====================================================================
   Gift panel + combos
   ===================================================================== */
const QTY = [1, 10, 66, 99, 520, 1314];
let gp = { creator: null, gift: 'rose', qty: 1, combo: null };
function openGifts(creatorId) {
  if (!Econ.signedIn()) return openAuth('Sign in to send gifts');
  gp.creator = creatorId || X.stage.id || X.models[0].id;
  const m = X.byId[gp.creator]; if (!m) return;
  let sheet = $('#giftSheet');
  if (!sheet) {
    sheet = el(`<div class="gsheet" id="giftSheet" role="dialog" aria-modal="true" aria-label="Send a gift"><div class="gs-in">
      <div class="gs-h"><div class="gs-to"><span class="ava-sm" id="gsAva"></span><div><small>Gift to</small><b id="gsName"></b></div></div><button class="gs-bal" id="gsBal"></button><button class="icon-btn" id="gsX" aria-label="Close"><svg class="icon"><use href="#i-x"/></svg></button></div>
      <div class="gs-tabs seg"><button data-t="all" class="on">All</button><button data-t="big">Big</button><button data-t="vip">VIP</button></div>
      <div class="gs-grid" id="gsGrid"></div>
      <div class="gs-f"><div class="gs-qty" id="gsQty"></div><button class="btn btn--primary btn--lg" id="gsSend">Send</button></div></div></div>`);
    document.body.appendChild(sheet);
    $('#gsX').onclick = closeGifts; sheet.addEventListener('mousedown', e => { if (e.target === sheet) closeGifts(); });
    $('#gsBal').onclick = () => { closeGifts(); openTopUp(); };
    $$('.gs-tabs button', sheet).forEach(b => b.onclick = () => { $$('.gs-tabs button', sheet).forEach(x => x.classList.toggle('on', x === b)); paintGiftGrid(b.dataset.t); });
    $('#gsSend').onclick = () => sendGift($('#gsSend'));
  }
  $('#gsAva').style.backgroundImage = `url(${U.poster(m)})`; $('#gsName').textContent = m.name;
  paintGiftGrid('all'); paintGiftFoot();
  sheet.classList.add('open'); document.body.classList.add('locked');
}
function closeGifts() { const s = $('#giftSheet'); if (s) s.classList.remove('open'); if (!document.querySelector('.scrim')) document.body.classList.remove('locked'); }
function paintGiftGrid(tab) {
  const list = cfg.gifts.filter(g => tab === 'vip' ? g.vip : tab === 'big' ? g.price >= 520 : true);
  $('#gsGrid').innerHTML = list.map(g => { const locked = g.vip && vipT() < g.vip; return `<button class="gift ${g.id === gp.gift ? 'on' : ''} ${locked ? 'locked' : ''}" data-g="${g.id}"><span class="orb">${g.icon}</span><b>${esc(g.name)}</b><small>💎 ${fmt.num(g.price)}</small>${g.vip ? `<em>${esc(cfg.vip[g.vip - 1].name)}</em>` : ''}</button>`; }).join('');
  $$('#gsGrid .gift').forEach(b => b.onclick = () => { if (b.classList.contains('locked')) { toast(`Unlock with ${cfg.vip[giftById(b.dataset.g).vip - 1].name}`); return; } gp.gift = b.dataset.g; $$('#gsGrid .gift').forEach(x => x.classList.toggle('on', x === b)); paintGiftFoot(); });
}
function paintGiftFoot() {
  $('#gsBal').innerHTML = `💎 <b>${fmt.num(S().diamonds)}</b> <span>Top up</span>`;
  const g = giftById(gp.gift);
  $('#gsQty').innerHTML = QTY.map(q => `<button class="${q === gp.qty ? 'on' : ''}" data-q="${q}">×${q}</button>`).join('');
  $$('#gsQty button').forEach(b => b.onclick = () => { gp.qty = +b.dataset.q; paintGiftFoot(); });
  const cost = g.price * gp.qty; $('#gsSend').innerHTML = `Send · 💎 ${fmt.num(cost)}`; $('#gsSend').disabled = cost > S().diamonds && false;
}
async function sendGift(btn, isCombo) {
  const g = giftById(gp.gift), qty = gp.qty;
  const r = await act(() => actions.gift(gp.creator, gp.gift, qty));
  if (!r) return;
  if ($('#gsBal')) paintGiftFoot();
  track('gift', { model: gp.creator, gift: gp.gift, qty, diamonds: r.cost });
  if (r.familyPoints) toast(`+${fmt.num(r.familyPoints)} family points${r.war ? ' (war ×' + cfg.families.warMultiplier + ')' : ''}`, 'ok');
  combo(g, qty, isCombo);
}
function combo(g, qty, isCombo) {
  let c = gp.combo;
  if (!c || !isCombo || c.gift !== g.id) {
    if (c) { clearTimeout(c.t); c.node.remove(); }
    c = gp.combo = { gift: g.id, count: 0, node: el(`<button class="combo" aria-label="Combo — send again"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="36" class="bg"/><circle cx="40" cy="40" r="36" class="fg"/></svg><span class="ci">${g.icon}</span><b>×1</b><small>COMBO</small></button>`) };
    document.body.appendChild(c.node);
    c.node.onclick = () => sendGift(c.node, true);
  }
  c.count++;
  $('b', c.node).textContent = '×' + c.count * qty;
  c.node.classList.remove('hit'); void c.node.offsetWidth; c.node.classList.add('hit');
  if (c.count > 1 && c.count % 5 === 0) burstAt(c.node, 18);
  const ring = $('.fg', c.node), C = 2 * Math.PI * 36; ring.style.strokeDasharray = C;
  ring.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: C }], { duration: cfg.comboWindowMs, fill: 'forwards' });
  clearTimeout(c.t); c.t = setTimeout(() => { c.node.classList.add('out'); setTimeout(() => c.node.remove(), 300); if (gp.combo === c) gp.combo = null; }, cfg.comboWindowMs);
}

/* =====================================================================
   Stage extras: gift bar, filters, top fans, guest queue, pinned product
   ===================================================================== */
function onStage(m) {
  const v = $('#stageVideo'); if (!v) return;
  if (!$('#stageBar')) {
    const bar = el(`<div class="stage-bar" id="stageBar">
      <button class="btn btn--primary" id="sbGift"><span style="font-size:16px">🎁</span> Gifts</button>
      <div class="qgifts" id="sbQuick"></div>
      <select class="sel" id="sbFilter" aria-label="View filter"></select>
      <button class="btn btn--sm" id="sbGuest">Join guest queue</button>
    </div>`);
    $('#stageGoal').parentElement.insertBefore(bar, $('#stageGoal'));
    const fans = el('<div class="stage-fans" id="stageFans"></div>'); bar.after(fans);
    $('#sbGift').onclick = () => openGifts(X.stage.id);
    $('#sbFilter').onchange = (e) => applyFilter(e.target.value, true);
    $('#sbGuest').onclick = guestQueue;
  }
  $('#sbQuick').innerHTML = ['rose', 'heart', 'champagne', 'ring'].map(id => { const g = giftById(id); return `<button class="qg" data-g="${id}" title="${esc(g.name)} · 💎 ${g.price}">${g.icon}<small>${g.price}</small></button>`; }).join('');
  $$('#sbQuick .qg').forEach(b => b.onclick = () => { gp.creator = X.stage.id; gp.gift = b.dataset.g; gp.qty = 1; sendGift(b, gp.combo && gp.combo.gift === b.dataset.g); });
  paintFilterSelect(); applyFilter(store.get('viewFilter', ''), false); paintFans();
  if (WS()) WS().sendRaw({ type: 'join', room: m.id });
  else if (Econ.signedIn() && S() && (S().equipped.entrance || vipT())) setTimeout(() => onEnter({ room: m.id, user: X.ui.meName(), level: lvl(), vip: vipT(), entrance: S().equipped.entrance || `ent_vip${vipT()}` }), 700);
  loadPinned(m.id);
}
function paintFilterSelect() {
  const sel = $('#sbFilter'); if (!sel) return;
  const owned = cfg.items.filter(i => i.type === 'filter' && S() && S().inventory[i.id]);
  const cur = store.get('viewFilter', '');
  sel.innerHTML = `<option value="">No filter</option>` + owned.map(i => `<option value="${i.id}" ${i.id === cur ? 'selected' : ''}>${esc(i.name)}</option>`).join('') + `<option value="__shop">Get filters…</option>`;
}
function applyFilter(id, save) {
  const box = $('#stageVideo'); if (!box) return;
  if (id === '__shop') { location.hash = '#rewards'; setTimeout(() => shopTab('filter'), 600); return paintFilterSelect(); }
  const it = id ? itemById(id) : null;
  if (it && (!S() || !S().inventory[id])) id = '';
  box.style.setProperty('--vf', it ? it.css : 'none');
  box.dataset.overlay = it && it.overlay ? it.overlay : '';
  box.classList.toggle('filtered', !!it);
  if (save) { store.set('viewFilter', id); if (id) toast(`${it.name} filter on`, 'ok'); }
}
async function loadPinned(id) {
  const old = $('#stagePin'); if (old) old.remove();
  if (!API) return;
  try {
    const { creator } = await X3API.get('/api/creators/' + encodeURIComponent(id));
    if (!creator.pinned || X.stage.id !== id) return;
    const p = creator.pinned, pin = el(`<button class="stage-pin" id="stagePin">${p.image ? `<img src="${p.image}" alt="">` : '<span>🛍️</span>'}<div><small>Pinned by ${esc(creator.name.split(' ')[0])}</small><b>${esc(p.name)}</b><em>${fmt.usd(p.price)}</em></div></button>`);
    $('#stageVideo').appendChild(pin); pin.onclick = () => X.openProfile(id, 'store');
  } catch {}
}
let guest = null;
function guestQueue() {
  if (!Econ.signedIn()) return openAuth();
  const b = $('#sbGuest');
  if (guest) { clearInterval(guest.t); guest = null; b.textContent = 'Join guest queue'; b.classList.remove('btn--primary'); toast('Left the guest queue'); return; }
  let pos = Math.max(1, Math.round(rand(3, 9)) - vipT() * 2);
  guest = { pos, t: setInterval(() => {
    if (Math.random() < 0.45) guest.pos--;
    b.textContent = guest.pos > 0 ? `Queue #${guest.pos} · leave` : 'You\'re up!';
    if (guest.pos <= 0) {
      clearInterval(guest.t); guest = null; b.textContent = 'Join guest queue'; b.classList.remove('btn--primary');
      const box = $('#stageVideo'), spot = el(`<div class="guest-spot"><span class="pill-live">GUEST</span><b>${esc(X.ui.meName())}</b><small>${esc(X.byId[X.stage.id].name.split(' ')[0])} picked you — say hi in chat</small></div>`);
      box.appendChild(spot); burstAt(spot, 20); setTimeout(() => spot.remove(), 15000); track('guest_pick', { room: X.stage.id });
    }
  }, 2500) };
  b.classList.add('btn--primary'); b.textContent = `Queue #${pos} · leave`; toast(vipT() ? 'Joined with VIP priority' : 'Joined the guest queue', 'ok');
}
const rand = (a, b) => a + Math.random() * (b - a);

/* =====================================================================
   PK battles
   ===================================================================== */
const PK = {
  state: null, local: !API,
  set(st) { this.state = st; if (st) this.skew = (st.now || now()) - now(); paintPK(); },
  add(side, d, user) { const s = this.state; if (!s || s.phase !== 'live') return; s[side].score += d; s.mvp = s.mvp || []; const m = s.mvp.find(x => x.name === user); if (m) m.diamonds += d; else s.mvp.push({ name: user, diamonds: d, side }); s.mvp.sort((a, b) => b.diamonds - a.diamonds); paintPK(); },
  localTick() {
    const s = this.state, t = now();
    if (!s || (s.phase === 'result' && t >= s.nextAt)) {
      const live = [...X.models].sort(() => Math.random() - .5);
      this.state = { id: Math.random().toString(36).slice(2), phase: 'live', a: { id: live[0].id, name: live[0].name, score: 0 }, b: { id: live[1].id, name: live[1].name, score: 0 }, endsAt: t + cfg.pk.durationSec * 1000, mvp: [] };
    } else if (s.phase === 'live' && t >= s.endsAt) {
      s.phase = 'result'; s.winner = s.a.score === s.b.score ? 'draw' : s.a.score > s.b.score ? 'a' : 'b'; s.nextAt = t + cfg.pk.cooldownSec * 1000;
    } else if (s.phase === 'live' && Math.random() < 0.5) {
      const side = Math.random() < 0.5 ? 'a' : 'b', g = cfg.gifts[Math.floor(Math.pow(Math.random(), 2.4) * 9)];
      this.add(side, g.price * (g.price < 50 ? [1, 5, 10][Math.floor(Math.random() * 3)] : 1), ['nightowl_88', 'quietwhale', 'blk_card', 'vanta', 'gold_tooth', 'k1ngpin'][Math.floor(Math.random() * 6)]);
    }
    paintPK();
  }
};
function mountPK() {
  const host = $('#sec-stage .wrap'); if (!host || $('#pk')) return;
  const sec = el(`<div class="pk panel reveal in" id="pk"><div class="pk-h"><span class="eyebrow">PK battle</span><span class="pk-t mono" id="pkT">—</span></div>
    <div class="pk-arena"><div class="pk-side a" id="pkA"></div><div class="pk-vs">VS</div><div class="pk-side b" id="pkB"></div></div>
    <div class="pk-bar"><i id="pkBarA"></i><i id="pkBarB"></i><span id="pkSa">0</span><span id="pkSb">0</span></div>
    <div class="pk-f"><div class="pk-mvp" id="pkMvp"></div><div class="pk-note" id="pkNote">${API ? '' : 'Demo battle — other viewers simulated'}</div></div><div class="pk-res" id="pkRes" hidden></div></div>`);
  host.appendChild(sec);
}
function paintPK() {
  const s = PK.state, box = $('#pk'); if (!box || !s || !s.a) return;
  const t = now() + (PK.skew || 0);
  const side = (k) => { const c = s[k], m = X.byId[c.id]; return `<div class="pk-ava" style="background-image:url(${m ? U.poster(m) : ''})"></div><b>${esc(c.name)}</b><div class="pk-btns"><button class="btn btn--sm btn--green" data-pk="${c.id}" data-g="rose">🌹 ×10</button><button class="btn btn--sm" data-pk="${c.id}" data-g="champagne">🍾</button><button class="btn btn--sm btn--primary" data-pk="${c.id}" data-open>🎁</button></div>`; };
  if (box.dataset.pk !== s.id) {
    box.dataset.pk = s.id; $('#pkA').innerHTML = side('a'); $('#pkB').innerHTML = side('b');
    $$('#pk [data-pk]').forEach(b => b.onclick = () => { if (b.dataset.open !== undefined) return openGifts(b.dataset.pk); gp.creator = b.dataset.pk; gp.gift = b.dataset.g; gp.qty = b.dataset.g === 'rose' ? 10 : 1; sendGift(b); });
  }
  const tot = s.a.score + s.b.score, pa = tot ? s.a.score / tot * 100 : 50;
  $('#pkBarA').style.width = pa + '%'; $('#pkBarB').style.width = (100 - pa) + '%';
  $('#pkSa').textContent = fmt.num(s.a.score); $('#pkSb').textContent = fmt.num(s.b.score);
  $('#pkT').textContent = s.phase === 'live' ? clock(s.endsAt - t) : s.phase === 'result' ? `Next PK in ${clock(s.nextAt - t)}` : 'Waiting for creators';
  box.classList.toggle('hot', s.phase === 'live' && s.endsAt - t < 30000);
  $('#pkMvp').innerHTML = (s.mvp || []).slice(0, 3).map((m, i) => `<span>${['🥇', '🥈', '🥉'][i]} ${esc(m.name)} <b>${fmt.k(m.diamonds)}</b></span>`).join('') || '<span class="dim">No gifts yet — be MVP</span>';
  const res = $('#pkRes');
  if (s.phase === 'result') {
    res.hidden = false;
    const w = s.winner === 'draw' ? null : s[s.winner];
    res.innerHTML = w ? `<div class="stamp win">WIN</div><b>${esc(w.name)}</b><small>takes the PK · ${fmt.num(w.score)} 💎</small>` : '<div class="stamp">DRAW</div>';
    if (res.dataset.id !== s.id) { res.dataset.id = s.id; burstAt(res, 30); }
    box.querySelectorAll('.pk-side').forEach(x => x.classList.toggle('lose', !!w && !x.classList.contains(s.winner)));
  } else { res.hidden = true; box.querySelectorAll('.pk-side').forEach(x => x.classList.remove('lose')); }
}
setInterval(() => { if (PK.local) PK.localTick(); else paintPK(); }, 1000);

/* =====================================================================
   Realtime bridge (raw WS events)
   ===================================================================== */
const WS = () => X.bus.adapters && [...X.bus.adapters.values()].find(a => a.sendRaw);
X.bus.onRaw((m) => {
  if (!m || !m.type) return;
  if (m.type === 'gift') onGiftMsg(m);
  else if (m.type === 'enter') onEnter(m);
  else if (m.type === 'pk' && m.state) PK.set(m.state);
  else if (m.type === 'hello') { if (m.pk) PK.set(m.pk); }
  else if (m.type === 'error' && m.message) toast(m.message);
});

/* chat identity decoration (used by core addMsg / stage chat) */
function decorate(m) {
  const c = m.cosmetics || (m.own && S() ? S().equipped : null) || {};
  const level = m.level || (m.own ? lvl() : 0), vip = m.vip || (m.own ? vipT() : 0);
  const badge = c.badge ? itemById(c.badge) : null;
  return {
    pre: `${vip ? `<span class="vipb v${vip}">${['', '◆', '◆◆', '♛'][vip]}</span>` : ''}${level ? `<span class="lvb">Lv ${level}</span>` : ''}${badge ? `<span class="bdg" title="${esc(badge.name)}">${esc(badge.icon || '✦')}</span>` : ''}`,
    nameClass: c.namecolor ? 'nc-' + c.namecolor : '',
    bubbleClass: c.bubble ? 'bub ' + c.bubble : ''
  };
}

/* =====================================================================
   Auth (API mode)
   ===================================================================== */
function openAuth(reason) {
  if (!API) return;
  const api = openModal(`<div class="modal-h"><span class="eyebrow">x3STAR account</span><h3>${esc(reason || 'Sign in')}</h3></div>
    <div class="modal-b"><div class="seg" id="authTabs"><button data-v="login" class="on">Sign in</button><button data-v="register">Create account</button></div>
    <form id="authForm" class="auth-f" autocomplete="on">
      <label data-reg hidden>Username<input class="txt" name="name" autocomplete="username" maxlength="24"></label>
      <label>Email<input class="txt" name="email" type="email" autocomplete="email" required></label>
      <label>Password<input class="txt" name="password" type="password" autocomplete="current-password" minlength="8" required></label>
      <label class="attest" data-reg hidden><input type="checkbox" name="adult"> I am 18 or older and agree to the Terms.</label>
      <p class="note" id="authErr" role="alert"></p>
      <button class="btn btn--primary btn--lg btn--block" id="authGo">Sign in</button>
      <p class="note" data-reg hidden>New accounts get <b>100 💎</b> and a 7-day check-in streak to start.</p>
    </form></div>`);
  const r = api.root; let mode = 'login';
  $$('#authTabs button', r).forEach(b => b.onclick = () => { mode = b.dataset.v; $$('#authTabs button', r).forEach(x => x.classList.toggle('on', x === b)); $$('[data-reg]', r).forEach(x => x.hidden = mode !== 'register'); $('#authGo', r).textContent = mode === 'login' ? 'Sign in' : 'Create account'; });
  $('#authForm', r).onsubmit = async (e) => {
    e.preventDefault(); const f = e.target, err = $('#authErr', r), go = $('#authGo', r); err.textContent = ''; go.disabled = true;
    try {
      const ref = (() => { try { return JSON.parse(localStorage.getItem('x3s:campaign') || '{}').ref; } catch { return undefined; } })();
      if (mode === 'login') await X3API.post('/api/auth/login', { email: f.email.value, password: f.password.value });
      else await X3API.post('/api/auth/register', { name: f.name.value, email: f.email.value, password: f.password.value, adult: f.adult.checked, ref });
      track(mode === 'login' ? 'login' : 'signup');
      location.reload();
    } catch (ex) { err.textContent = ex.message; go.disabled = false; }
  };
}
async function signOut() { if (API) { await X3API.post('/api/auth/logout'); location.reload(); } }

/* =====================================================================
   Top-up (diamond store) — shared modal + rewards section
   ===================================================================== */
function packCards() {
  const s = S(), fs = s && s.flashSale;
  return cfg.diamondPacks.map(p => {
    const flash = fs && fs.packId === p.id, first = s && s.firstPurchase;
    const extra = (flash ? Math.round(p.diamonds * fs.bonusPct / 100) : 0) + (first ? Math.round(p.diamonds * (cfg.firstPurchaseMultiplier - 1)) : 0);
    return `<button class="pack ${flash ? 'flash' : ''}" data-pack="${p.id}">${flash ? `<span class="pk-flag">FLASH +${fs.bonusPct}% · <span data-cd="${now() + fs.endsInMs}"></span></span>` : first ? '<span class="pk-flag first">2× FIRST TOP-UP</span>' : ''}
      <span class="pack-gem">💎</span><b>${fmt.num(p.diamonds)}</b>${p.bonus + extra ? `<small>+${fmt.num(p.bonus + extra)} bonus</small>` : '<small>&nbsp;</small>'}<em>${fmt.usd(p.usd)}</em></button>`;
  }).join('');
}
function wirePacks(root) { $$('[data-pack]', root).forEach(b => b.onclick = () => confirmPurchase(b.dataset.pack)); }
function openTopUp() {
  if (!Econ.signedIn()) return openAuth('Sign in to top up');
  const api = openModal(`<div class="modal-h"><span class="eyebrow">Diamond store</span><h3>Top up 💎</h3><p>Balance ${dm(S().diamonds)}</p></div><div class="modal-b"><div class="packs">${packCards()}</div>${testNote()}</div>`, { cls: 'modal--xl' });
  wirePacks(api.root);
}
const testNote = () => (!API || (BOOT && BOOT.payments === 'test')) ? '<p class="note">TEST MODE — purchases credit instantly and nothing is charged. Connect a payment provider before launch.</p>' : '';
function confirmPurchase(packId) {
  let q; try { q = API ? null : E.purchaseQuote(Econ.state, cfg, now(), packId); } catch (e) { return toast(e.message); }
  const p = cfg.diamondPacks.find(x => x.id === packId), s = S();
  const api = openModal(`<div class="modal-h"><h3>${fmt.num(p.diamonds)} 💎 for ${fmt.usd(p.usd)}</h3><p>Daily limit: $${s.limits.dailyCapUsd} · change it in Account → Spending</p></div>
    <div class="modal-b"><div class="summary"><div><span>Diamonds</span><b>${fmt.num(p.diamonds)}</b></div><div><span>Pack bonus</span><b>+${fmt.num(p.bonus)}</b></div>${s.firstPurchase ? `<div><span>First top-up 2×</span><b class="up">+${fmt.num(Math.round(p.diamonds * (cfg.firstPurchaseMultiplier - 1)))}</b></div>` : ''}${s.flashSale && s.flashSale.packId === p.id ? `<div><span>Flash sale</span><b class="up">+${fmt.num(Math.round(p.diamonds * s.flashSale.bonusPct / 100))}</b></div>` : ''}</div>
    <button class="btn btn--primary btn--lg btn--block" data-buy>Buy for ${fmt.usd(p.usd)}</button>${testNote()}</div>`);
  $('[data-buy]', api.root).onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    const r = await act(() => actions.purchase(packId), { from: b });
    if (r) { burstAt(b, 30); track('purchase', { pack: packId, usd: p.usd, test: !!r.test }); setTimeout(() => { api.close(); toast(`+${fmt.num(r.total)} 💎 added`, 'ok'); }, 700); } else b.disabled = false;
  };
}

/* =====================================================================
   Mystery box reveal
   ===================================================================== */
function showBoxReveal(res) {
  const api = openModal(`<div class="modal-h"><span class="eyebrow">${esc(res.box.name)}</span><h3>${res.results.length > 1 ? '10 pulls' : 'Your pull'}</h3></div>
    <div class="modal-b"><div class="reveal-grid ${res.results.length > 1 ? 'ten' : ''}">${res.results.map((x, i) => `<div class="rcard" style="--rc:${RCOL[x.rarity]};--i:${i}"><div class="rc-in"><div class="rc-back">✦</div><div class="rc-front"><small>${x.rarity.toUpperCase()}</small>${x.item ? `<b>${esc(x.item.name)}</b><span>${esc(x.item.type)}</span>` : `<b>💎 ${fmt.num(x.diamonds)}</b>`}${x.duplicate ? `<em>Duplicate → +${x.diamonds} 💎</em>` : ''}</div></div></div>`).join('')}</div>
    <p class="note">Pity: epic in ${cfg.gacha.boxes.find(b => b.id === res.box.id).pity.epic - res.pity.sinceEpic} · legendary in ${cfg.gacha.boxes.find(b => b.id === res.box.id).pity.legendary - res.pity.sinceLegendary} pulls.</p>
    <button class="btn btn--block" data-x>Collect</button></div>`, { cls: res.results.length > 1 ? 'modal--xl' : '' });
  $$('.rcard', api.root).forEach((c, i) => setTimeout(() => { c.classList.add('flip'); if (['epic', 'legendary'].includes(res.results[i].rarity)) burstAt(c, res.results[i].rarity === 'legendary' ? 30 : 14); }, 350 + i * 220));
  $('[data-x]', api.root).onclick = api.close;
}

/* =====================================================================
   Rewards page
   ===================================================================== */
let shopType = 'filter';
function shopTab(t) { shopType = t; paintShop(); const s = $('#shop'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function renderRewards() {
  const root = $('#rewardsInner'); if (!root) return;
  if (!Econ.signedIn()) { root.innerHTML = `<div class="panel" style="padding:60px 30px;text-align:center"><h3 style="font:500 38px var(--serif);margin:0 0 10px">Sign in to start earning.</h3><p style="color:var(--mute);margin:0 0 24px">New accounts get 100 💎, a daily check-in streak and watch-time chests.</p><button class="btn btn--primary btn--lg" id="rwAuth">Create free account</button></div>`; $('#rwAuth').onclick = () => openAuth(); return; }
  Econ.refreshLocal();
  const s = S(), d = s.daily, ev = s.event;
  root.innerHTML = `
    <div class="rw-top">
      <div class="panel rw-card rw-wallet"><span class="eyebrow">Your wallet</span><div class="rw-big">💎 <b id="rwDm">${fmt.num(s.diamonds)}</b></div>
        <div class="rw-lv"><span class="lvb big">Lv ${s.level.level}</span><div class="goal-bar"><i style="width:${(s.level.pct * 100).toFixed(1)}%"></i></div><small class="mono">${fmt.num(s.level.into)} / ${fmt.num(s.level.need)} XP</small></div>
        <div class="rw-row">${s.vip ? `<span class="vipb v${s.vip.tier}">${esc(s.vip.name)}</span><small>expires in <span class="mono" data-cd="${s.vip.expires}"></span></small>` : '<small>No VIP — <a href="#vipSec" data-jump="vipSec" style="color:var(--pink-2)">see perks</a></small>'}</div>
        <div class="rw-actions"><button class="btn btn--primary" data-topup>Top up</button><button class="btn" data-daily>${d.claimed ? `Next check-in <span class="mono" data-cd="${now() + d.resetInMs}"></span>` : `Check in · Day ${d.idx + 1}`}</button></div></div>
      <div class="panel rw-card"><span class="eyebrow">Watch-time chests · today</span><div class="chest-line">${s.watch.chests.map(c => `<div class="cl ${c.claimed ? 'claimed' : c.ready ? 'ready' : ''}"><i>${c.claimed ? '✓' : '🎁'}</i><small>${c.min}m</small></div>`).join('')}</div>
        <p class="note">Watched <b class="mono">${clock(s.watch.seconds * 1000)}</b> today. ${s.watch.next ? `Next chest in <b class="mono">${clock(s.watch.nextInSec * 1000)}</b> of watching.` : 'All chests unlocked.'}</p><button class="btn btn--block ${s.watch.readyCount ? 'btn--green' : ''}" data-chests>${s.watch.readyCount ? `Open ${s.watch.readyCount} chest${s.watch.readyCount > 1 ? 's' : ''}` : 'View chests'}</button></div>
      ${ev ? `<div class="panel rw-card rw-event"><span class="eyebrow">Weekly event · ends in <span class="mono" data-cd="${now() + ev.endsInMs}"></span></span><h3>${esc(ev.name)}</h3><p>${esc(ev.desc)}</p><div class="goal-bar"><i style="width:${(ev.progress / ev.goal * 100).toFixed(1)}%"></i></div><small class="mono">${fmt.num(ev.progress)} / ${fmt.num(ev.goal)} 💎</small>
        <div class="rw-row"><small>Reward: ${ev.reward.diamonds} 💎${ev.reward.item ? ' + ' + esc(itemById(ev.reward.item).name) + ' badge' : ''}</small></div><button class="btn btn--block ${ev.done && !ev.claimed ? 'btn--green' : ''}" data-event ${ev.done && !ev.claimed ? '' : 'disabled'}>${ev.claimed ? 'Claimed ✓' : ev.done ? 'Claim reward' : 'Gift to progress'}</button></div>` : ''}
    </div>

    <div class="section-head" style="margin-top:70px"><div><span class="eyebrow">Diamond store</span><h2>Top up <em>💎</em></h2></div><p>${s.firstPurchase ? 'Your first top-up is doubled. ' : ''}A new flash pack every ${cfg.flashSale.windowHours} hours.</p></div>
    <div class="packs" id="packs">${packCards()}</div>${testNote()}

    <div class="section-head" id="vipSec" style="margin-top:70px"><div><span class="eyebrow">VIP</span><h2>Get <em>noticed</em>.</h2></div><p>VIP names glow in chat, arrive with an entrance banner, unlock exclusive gifts and earn more from every reward.</p></div>
    <div class="vips">${cfg.vip.map(v => { const q = E.vipQuote(API ? { vip: s.vip ? { tier: s.vip.tier, expires: s.vip.expires } : null } : Econ.state, cfg, now(), v.tier); const cur = s.vip && s.vip.tier === v.tier; return `<div class="vipc panel v${v.tier} ${cur ? 'cur' : ''}"><span class="vipb v${v.tier}">${['', '◆', '◆◆', '♛'][v.tier]} ${esc(v.name)}</span><div class="vp">💎 ${fmt.num(q.price)}${q.isRenew ? ` <s>${fmt.num(v.price)}</s>` : ''}<small>/ ${v.days} days</small></div><ul>${v.perks.map(p => `<li>${esc(p)}</li>`).join('')}</ul>${cur ? `<small class="mono">Active · <span data-cd="${s.vip.expires}"></span> left</small>` : ''}<button class="btn btn--block ${v.tier === 3 ? 'btn--primary' : ''}" data-vip="${v.tier}" ${s.vip && s.vip.tier > v.tier ? 'disabled' : ''}>${cur ? `Renew · ${Math.round(cfg.vipRenewRate * 100)}% price` : s.vip && s.vip.tier > v.tier ? 'Included' : 'Get ' + esc(v.name)}</button>${cur && !s.vip.rebateClaimed ? `<button class="btn btn--sm btn--green btn--block" data-rebate>Claim ${v.dailyRebate} 💎 rebate</button>` : ''}</div>`; }).join('')}</div>

    <div class="section-head" style="margin-top:70px"><div><span class="eyebrow">Mystery boxes</span><h2>Open <em>something</em>.</h2></div><p>Every drop rate is listed. Pity guarantees an epic and a legendary within a set number of pulls. Duplicates turn into diamonds.</p></div>
    <div class="boxes">${cfg.gacha.boxes.map(b => { const p = (s.gacha[b.id] || { sinceEpic: 0, sinceLegendary: 0 }); return `<div class="boxc panel ${b.id}"><div class="box-ico">${b.id === 'black' ? '🖤' : '🎁'}</div><h3>${esc(b.name)}</h3>
      <div class="pity"><span>Epic guaranteed in <b>${b.pity.epic - p.sinceEpic}</b></span><span>Legendary in <b>${b.pity.legendary - p.sinceLegendary}</b></span></div>
      <div class="box-btns"><button class="btn" data-box="${b.id}" data-n="1">×1 · 💎 ${b.cost}</button><button class="btn btn--primary" data-box="${b.id}" data-n="10">×10 · 💎 ${fmt.num(b.cost10)}</button></div>
      <details class="odds"><summary>Drop rates</summary><table>${E.RARITIES.map(r => `<tr><td style="color:${RCOL[r]}">${r}</td><td>${(b.odds[r] * 100).toFixed(1)}%</td><td>${cfg.gacha.pools[r].map(x => x.item ? esc(itemById(x.item).name) : x.diamonds + ' 💎').join(' · ')}</td></tr>`).join('')}</table><p class="note">Each item in a tier is equally likely. Duplicates refund ${E.RARITIES.map(r => cfg.gacha.dupeRefund[r] + ' 💎 (' + r + ')').join(', ')}.</p></details></div>`; }).join('')}</div>

    <div class="section-head" id="shop" style="margin-top:70px"><div><span class="eyebrow">Cosmetics</span><h2>Filters, frames &amp; <em>flex</em>.</h2></div></div>
    <div class="seg shop-tabs" id="shopTabs">${[['filter', 'Filters'], ['frame', 'Frames'], ['bubble', 'Chat bubbles'], ['entrance', 'Entrances'], ['namecolor', 'Name colors'], ['badge', 'Badges']].map(([k, l]) => `<button data-t="${k}" class="${k === shopType ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="shop" id="shopGrid"></div>

    <div class="section-head" id="levelRoad" style="margin-top:70px"><div><span class="eyebrow">Level road</span><h2>Level <em>${s.level.level}</em> of ${cfg.levelCurve.max}.</h2></div><p>XP from watching (${cfg.xp.perWatchMinute}/min), chatting, check-ins and every diamond you gift. Each level pays diamonds; milestones unlock cosmetics.</p></div>
    <div class="road">${Array.from({ length: 60 }, (_, i) => i + 1).map(L => { const it = cfg.levelRewards.items[L] ? itemById(cfg.levelRewards.items[L]) : null; return `<div class="rd ${L <= s.level.level ? 'done' : ''} ${L === s.level.level + 1 ? 'next' : ''} ${it ? 'ms' : ''}"><b>${L}</b><small>${it ? esc(it.name) : '+' + cfg.levelRewards.diamondsPerLevel * L + ' 💎'}</small></div>`; }).join('')}</div>`;
  wirePacks(root);
  $('[data-topup]', root).onclick = openTopUp;
  $('[data-daily]', root).onclick = openDaily;
  $('[data-chests]', root).onclick = openChests;
  const evb = $('[data-event]', root); if (evb) evb.onclick = () => act(() => actions.event(), { from: evb, ok: (r) => `Event reward: +${r.diamonds} 💎${r.item ? ' + ' + r.item.name : ''}` });
  $$('[data-vip]', root).forEach(b => b.onclick = () => buyVipFlow(+b.dataset.vip, b));
  $$('[data-rebate]', root).forEach(b => b.onclick = () => act(() => actions.rebate(), { from: b, ok: (r) => `VIP rebate +${r.diamonds} 💎` }));
  $$('[data-box]', root).forEach(b => b.onclick = async () => { b.disabled = true; const r = await act(() => actions.gacha(b.dataset.box, +b.dataset.n)); b.disabled = false; if (r) { showBoxReveal(r); track('gacha', { box: b.dataset.box, n: +b.dataset.n }); } });
  $$('#shopTabs button', root).forEach(b => b.onclick = () => { shopType = b.dataset.t; $$('#shopTabs button', root).forEach(x => x.classList.toggle('on', x === b)); paintShop(); });
  $$('[data-jump]', root).forEach(a => a.onclick = (e) => { e.preventDefault(); $('#' + a.dataset.jump).scrollIntoView({ behavior: 'smooth' }); });
  paintShop();
  const road = $('.road', root), cur = $('.rd.next', root) || $('.rd.done:last-of-type', root); if (road && cur) road.scrollLeft = cur.offsetLeft - road.clientWidth / 2;
}
function buyVipFlow(tier, btn) {
  const v = cfg.vip[tier - 1], s = S();
  const api = openModal(`<div class="modal-h"><span class="vipb v${tier}">${esc(v.name)}</span><h3 style="margin-top:12px">${v.days} days of ${esc(v.name)}</h3><p>Renew within ${cfg.vipRenewGraceDays} days of expiry for ${Math.round(cfg.vipRenewRate * 100)}% of the price.</p></div>
    <div class="modal-b"><ul class="perks">${v.perks.map(p => `<li>${esc(p)}</li>`).join('')}</ul><button class="btn btn--primary btn--lg btn--block" data-go>Confirm</button><p class="note">Balance ${dm(s.diamonds)}</p></div>`);
  $('[data-go]', api.root).onclick = async (e) => { const r = await act(() => actions.vip(tier), { from: e.currentTarget }); if (r) { api.close(); toast(`${v.name} active for ${v.days} days`, 'ok'); burstAt(btn, 30); track('vip', { tier }); } };
}
function previewFor(it) {
  const m = X.byId[X.stage.id] || X.models[0];
  switch (it.type) {
    case 'filter': return `<div class="pv pv-filter" style="--vf:${it.css};background-image:url(${U.poster(m)})" data-overlay="${it.overlay || ''}"></div>`;
    case 'frame': return `<div class="pv pv-frame"><span class="fr-ava ${it.id}">${esc(X.ui.meName()[0].toUpperCase())}</span></div>`;
    case 'bubble': return `<div class="pv pv-bub"><span class="bub ${it.id}">hey 💕 that set was fire</span></div>`;
    case 'entrance': return `<div class="pv pv-ent"><span class="entrance static v${it.vip || 0} ${it.id}"><span class="lvb">Lv ${lvl()}</span><b>${esc(X.ui.meName())}</b> ${esc(it.text || 'entered')}</span></div>`;
    case 'namecolor': return `<div class="pv pv-nc"><b class="nc-${it.id}">${esc(X.ui.meName())}</b></div>`;
    default: return `<div class="pv pv-badge"><span class="bdg big">${esc(it.icon || '✦')}</span></div>`;
  }
}
function paintShop() {
  const grid = $('#shopGrid'); if (!grid || !S()) return;
  const s = S();
  grid.innerHTML = cfg.items.filter(i => i.type === shopType).map(it => {
    const own = s.inventory[it.id], eq = s.equipped[it.type] === it.id;
    const how = it.price ? `💎 ${fmt.num(it.price)}` : it.vip ? `${esc(cfg.vip[it.vip - 1].name)} perk` : Object.values(cfg.levelRewards.items).includes(it.id) ? 'Level reward' : cfg.events.some(e => e.reward.item === it.id) ? 'Event reward' : 'Mystery box';
    return `<div class="shop-i panel ${eq ? 'eq' : ''}" style="--rc:${RCOL[it.rarity]}">${previewFor(it)}<div class="si-b"><small style="color:${RCOL[it.rarity]}">${it.rarity}</small><b>${esc(it.name)}</b>${own && own.exp ? `<small class="mono">expires <span data-cd="${own.exp}"></span></small>` : ''}
      ${own ? `<button class="btn btn--sm btn--block ${eq ? '' : 'btn--primary'}" data-eq="${it.id}">${eq ? 'Unequip' : 'Equip'}</button>` : it.price ? `<button class="btn btn--sm btn--block" data-buy="${it.id}">${how}</button>` : `<span class="how">${how}</span>`}</div></div>`;
  }).join('');
  $$('[data-buy]', grid).forEach(b => b.onclick = () => act(() => actions.buy(b.dataset.buy), { ok: (r) => `${r.item.name} unlocked` }).then(r => { if (r) { track('store_buy', { item: b.dataset.buy }); burstAt(b, 14); } }));
  $$('[data-eq]', grid).forEach(b => b.onclick = () => { const it = itemById(b.dataset.eq), on = S().equipped[it.type] !== it.id; act(() => actions.equip(it.type, on ? it.id : null), { ok: on ? `${it.name} equipped` : `${it.name} removed` }).then(() => { if (it.type === 'filter') { store.set('viewFilter', on ? it.id : ''); } }); });
}

/* =====================================================================
   Families page
   ===================================================================== */
const LOCAL_FAMILIES = [{ id: 1, name: 'Velvet Syndicate', tag: 'VLV', motto: 'Gift loud, stay classy', members: 18, maxMembers: 50, weekPoints: 48210, level: { level: 6 } }, { id: 2, name: 'Night Shift', tag: 'NITE', motto: 'We never sleep', members: 31, maxMembers: 50, weekPoints: 61980, level: { level: 8 } }, { id: 3, name: 'Black Card Club', tag: 'BCC', motto: 'Whales only', members: 9, maxMembers: 50, weekPoints: 37400, level: { level: 9 } }];
async function renderFamilies() {
  const root = $('#familiesInner'); if (!root) return;
  let list = LOCAL_FAMILIES, war = E.warStatus(cfg, now()), mine = null;
  if (API) { try { const r = await X3API.get('/api/families'); list = r.families; war = r.war; } catch (e) { toast(e.message); } mine = Econ.me && Econ.me.family; }
  else { const id = store.get('family', null); mine = id ? LOCAL_FAMILIES.find(f => f.id === id) : null; list = [...LOCAL_FAMILIES].sort((a, b) => b.weekPoints - a.weekPoints); }
  root.innerHTML = `<div class="war panel ${war.active ? 'on' : ''}"><div><span class="eyebrow">${war.active ? 'Family war — live' : 'Next family war'}</span><h3>${war.active ? `Every family gift counts <em>×${war.multiplier}</em>` : 'Gifts count ×' + cfg.families.warMultiplier + ' during war hours'}</h3></div><div class="war-t mono" data-cd="${now() + (war.active ? war.endsInMs : war.startsInMs)}"></div></div>
    <div class="fam-grid"><div class="panel fam-mine" id="famMine"></div><div class="panel lb-scroll"><table class="lbt"><thead><tr><th>Rank</th><th>Family</th><th class="r">Members</th><th class="r">Level</th><th class="r">Week points</th><th></th></tr></thead><tbody>${list.map((f, i) => `<tr class="${mine && mine.id === f.id ? 'me' : ''}"><td class="rk">#${i + 1}</td><td><div class="who-cell"><span class="ftag">${esc(f.tag)}</span><div>${esc(f.name)}<small>${esc(f.motto || '')}</small></div></div></td><td class="r mono">${f.members}/${f.maxMembers}</td><td class="r mono">${f.level.level}</td><td class="r mono up">${fmt.num(f.weekPoints)}</td><td class="r">${!mine ? `<button class="btn btn--sm" data-join="${f.id}">Join</button>` : f.id === (mine && mine.id) ? '<span class="mono" style="color:var(--pink-2);font-size:11px">YOURS</span>' : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
  const box = $('#famMine');
  if (mine) {
    let detail = mine;
    if (API) { try { detail = (await X3API.get('/api/families/' + mine.id)).family; } catch {} }
    box.innerHTML = `<span class="eyebrow">Your family</span><h3><span class="ftag">${esc(detail.tag)}</span> ${esc(detail.name)}</h3><p class="note">${esc(detail.motto || '')}</p>${detail.level ? `<div class="goal-bar" style="margin:12px 0 6px"><i style="width:${((detail.level.pct || 0) * 100).toFixed(1)}%"></i></div><small class="mono">Level ${detail.level.level}</small>` : ''}
      ${detail.roster ? `<ol class="lb" style="margin-top:16px">${detail.roster.slice(0, 10).map(m => `<li><b>${esc(m.name)}</b><span>${fmt.num(m.week)}</span></li>`).join('')}</ol>` : ''}<button class="btn btn--sm btn--red" data-leave style="margin-top:14px">Leave family</button>`;
    $('[data-leave]', box).onclick = async () => { if (API) { try { await X3API.post('/api/families/leave'); location.reload(); } catch (e) { toast(e.message); } } else { store.set('family', null); renderFamilies(); } };
  } else {
    box.innerHTML = `<span class="eyebrow">Families</span><h3>Run with a crew.</h3><p class="note">Family gifts stack into weekly war points. Join one, or start your own for ${fmt.num(cfg.families.createCost)} 💎.</p>
      <form id="famNew" class="auth-f" style="margin-top:12px"><input class="txt" name="name" placeholder="Family name" maxlength="24"><input class="txt" name="tag" placeholder="Tag (2–5)" maxlength="5"><input class="txt" name="motto" placeholder="Motto" maxlength="80"><button class="btn btn--primary btn--block">Create · 💎 ${fmt.num(cfg.families.createCost)}</button></form>`;
    $('#famNew').onsubmit = async (e) => {
      e.preventDefault(); if (!Econ.signedIn()) return openAuth();
      const f = e.target;
      if (API) { try { await X3API.post('/api/families', { name: f.name.value, tag: f.tag.value, motto: f.motto.value }); location.reload(); } catch (ex) { toast(ex.message); } }
      else { toast('Creating families needs the server — join one of the demo families here'); }
    };
  }
  $$('[data-join]', root).forEach(b => b.onclick = async () => { if (!Econ.signedIn()) return openAuth(); if (API) { try { await X3API.post(`/api/families/${b.dataset.join}/join`); location.reload(); } catch (e) { toast(e.message); } } else { store.set('family', +b.dataset.join); toast('Joined', 'ok'); renderFamilies(); } });
}

/* =====================================================================
   Member page (API gallery + products + top fans) and account profile
   ===================================================================== */
async function onMember(id, root) {
  const jobsHost = $('[data-creator-jobs]', root);
  if (!API) { if (jobsHost && window.X3Jobs) window.X3Jobs.mount(jobsHost, { creatorId: id }); return; }
  try {
    const { creator } = await X3API.get('/api/creators/' + encodeURIComponent(id));
    if (!root.isConnected || !jobsHost || $('[data-creator-jobs]', root) !== jobsHost || jobsHost.dataset.creatorJobs !== id) return;
    if (window.X3Jobs) window.X3Jobs.mount(jobsHost, { creatorId: id, jobs: creator.jobs || [] });
    const host = $('.member-cols > div', root); if (!host) return;
    const gal = el(`<div class="mgal"><h3 class="serif" style="font-size:26px;font-weight:500;margin:34px 0 14px">Gallery <small class="mono" style="font-size:12px;color:var(--dim)">${creator.gallery.length}</small></h3>${creator.gallery.length ? `<div class="gal-grid">${creator.gallery.map(g => `<button class="gal-i" data-src="${g.url}" data-type="${g.type}">${g.type === 'video' ? `<video src="${g.url}" muted playsinline preload="metadata"></video><span class="gal-play">▶</span>` : `<img src="${g.url}" alt="${esc(g.caption)}" loading="lazy">`}</button>`).join('')}</div>` : '<p class="note">No gallery posts yet.</p>'}</div>`);
    host.insertBefore(gal, $('.thread', host));
    $$('.gal-i', gal).forEach(b => b.onclick = () => { openModal(`<div class="lightbox">${b.dataset.type === 'video' ? `<video src="${b.dataset.src}" controls autoplay playsinline></video>` : `<img src="${b.dataset.src}" alt="">`}</div>`, { cls: 'modal--xl' }); });
    const side = $('.member-cols aside', root);
    if (side) side.insertBefore(el(`<div class="side-card panel"><h4>Top gifters <span>7 days</span></h4>${creator.topFans.length ? `<ol class="lb">${creator.topFans.map(f => `<li><b>${esc(f.name)}</b><span>💎 ${fmt.num(f.diamonds)}</span></li>`).join('')}</ol>` : '<p class="note">No gifts yet this week.</p>'}<button class="btn btn--sm btn--primary btn--block" style="margin-top:10px" data-gift>Send a gift</button></div>`), side.firstChild);
    const gb = $('[data-gift]', side); if (gb) gb.onclick = () => openGifts(id);
  } catch { if (root.isConnected && jobsHost && $('[data-creator-jobs]', root) === jobsHost && window.X3Jobs) window.X3Jobs.mount(jobsHost, { creatorId: id }); }
}
function onAccount(root) {
  if (!root || !Econ.signedIn() || $('#acctProfile', root)) return;
  const s = S(); if (!s) return;
  const eq = s.equipped, frame = eq.frame || '', badge = eq.badge ? itemById(eq.badge) : null;
  const me = Econ.me || {};
  const card = el(`<div class="panel acct-profile" id="acctProfile">
    <div class="ap-ava"><span class="fr-ava big ${frame}" ${me.avatar ? `style="background-image:url(${me.avatar})"` : ''}>${me.avatar ? '' : esc(X.ui.meName()[0].toUpperCase())}</span>${API ? '<label class="btn btn--sm" style="margin-top:10px">Upload photo<input type="file" accept="image/*" hidden id="apUp"></label>' : ''}${me.avatarStatus === 'pending' ? '<small class="note">Photo in review</small>' : ''}</div>
    <div class="ap-b"><div class="ap-name">${s.vip ? `<span class="vipb v${s.vip.tier}">${esc(s.vip.name)}</span>` : ''}<span class="lvb big">Lv ${s.level.level}</span>${badge ? `<span class="bdg big">${esc(badge.icon)}</span>` : ''}<b class="${eq.namecolor ? 'nc-' + eq.namecolor : ''}">${esc(me.name || X.ui.meName())}</b>${me.family ? `<span class="ftag">${esc(me.family.tag)}</span>` : ''}</div>
      <div class="kv" style="grid-template-columns:repeat(4,1fr)"><div><small>Diamonds</small><b>${fmt.num(s.diamonds)}</b></div><div><small>Gifted</small><b>${fmt.num(s.stats.giftedDiamonds)}</b></div><div><small>Streak</small><b>🔥 ${s.daily.streak}</b></div><div><small>Items</small><b>${Object.keys(s.inventory).length}</b></div></div>
      <div class="ap-spend"><div><b>Spending limit</b><small>Daily diamond purchases capped at $${s.limits.dailyCapUsd}. Lowering applies now; raising applies after ${cfg.capRaiseCooldownHours}h.${s.limits.pending ? ` Pending: $${s.limits.pending.usd} in <span class="mono" data-cd="${s.limits.pending.at}"></span>.` : ''}</small></div><div style="display:flex;gap:8px"><input class="txt" id="apCap" type="number" min="0" max="100000" value="${s.limits.dailyCapUsd}" style="min-width:0;width:110px"><button class="btn btn--sm" id="apCapGo">Set</button></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><a class="btn btn--sm btn--primary" href="#rewards">Rewards center</a><a class="btn btn--sm" href="#families">Families</a>${API && me.role === 'creator' ? '<a class="btn btn--sm" href="/studio">Creator Studio</a>' : ''}${API && me.role === 'admin' ? '<a class="btn btn--sm" href="/admin">Admin</a>' : ''}${API && me.role === 'agent' ? '<a class="btn btn--sm" href="/studio#agency">Agency</a>' : ''}${API ? '<button class="btn btn--sm btn--red" id="apOut">Sign out</button>' : ''}</div></div></div>`);
  root.insertBefore(card, root.firstChild);
  $('#apCapGo').onclick = () => act(() => actions.limit(Math.max(0, Math.round(+$('#apCap').value || 0))), { ok: (r) => r.pending ? `Raise to $${r.pending.usd} takes effect in ${cfg.capRaiseCooldownHours}h` : `Daily limit set to $${r.dailyCapUsd}` }).then(() => { card.remove(); onAccount(root); });
  const out = $('#apOut'); if (out) out.onclick = signOut;
  const up = $('#apUp'); if (up) up.onchange = async () => { const f = up.files[0]; if (!f) return; try { await X3API.upload('/api/me/avatar', {}, f); toast('Photo uploaded — visible to others after review', 'ok'); location.reload(); } catch (e) { toast(e.message); } };
}

/* =====================================================================
   Stories (24h) + Clips feed
   ===================================================================== */
async function loadStories() {
  if (API) { try { return (await X3API.get('/api/stories')).groups; } catch { return []; } }
  return X.models.slice(0, 8).map((m, i) => ({ creator: { id: m.id, name: m.name, avatar: U.poster(m) }, items: [{ id: m.id + '-s1', type: 'image', url: U.poster(m), caption: ['Tonight at 10 🖤', 'New set just dropped', 'Goal is almost there…', 'Who\'s coming to my PK?'][i % 4], at: now() - (i + 1) * 3600000 }] }));
}
/* Live partner rooms for the story circles: top rooms (women first) from every live grid that's on, interleaved. */
async function liveCircleRooms(max = 16) {
  const sites = ((window.X3STAR_BOOT && X3STAR_BOOT.liveSites) || []).filter(s => LIVE_SITES[s]);
  if (!API || !sites.length) return [];
  const lists = await Promise.all(sites.map(s => X3API.get(LIVE_SITES[s].api + '?gender=f&limit=' + max)
    .then(d => (d.enabled ? d.rooms : []).filter(r => r.show === 'public').map(r => ({ ...r, site: s })))
    .catch(() => [])));
  const out = [];
  for (let i = 0; out.length < max && lists.some(l => l[i]); i++) lists.forEach(l => { if (l[i] && out.length < max) out.push(l[i]); });
  return out;
}
const campaignQs = () => { const c = (window.X3STAR && X3STAR.campaign) || {}, p = new URLSearchParams(); if (c.utm_campaign) p.set('c', c.utm_campaign); if (c.utm_source) p.set('s', c.utm_source); const s = p.toString(); return s ? '?' + s : ''; };
let storyTimer = null;
async function renderStories() {
  const rail = $('#storyRail'); if (!rail) return;
  const [allGroups, live] = await Promise.all([loadStories(), liveCircleRooms()]);
  // Only stories with a real picture get a circle; demo creators' gradient placeholders are left out.
  const groups = API ? allGroups.filter(g => g.creator.avatar) : allGroups;
  const seen = new Set(store.get('storySeen', []));
  if (!groups.length && !live.length) { rail.hidden = true; return; }
  rail.hidden = false;
  rail.innerHTML = groups.map((g, i) => `<button class="story-b ${g.items.every(it => seen.has(String(it.id))) ? 'seen' : ''}" data-i="${i}"><span><i style="background-image:url(${g.creator.avatar || (X.byId[g.creator.id] ? U.poster(X.byId[g.creator.id]) : '')})"></i></span><small>${esc(g.creator.name.split(' ')[0])}</small></button>`).join('')
    + live.map((r, i) => `<button class="story-b live" data-live="${i}" aria-label="${esc(r.name)}, live on ${esc(LIVE_SITES[r.site].name)}"><span><i style="background-image:url('${esc(r.thumb)}')"></i><b class="story-live">LIVE</b></span><small>${esc(r.name)}</small></button>`).join('');
  $$('.story-b[data-i]', rail).forEach(b => b.onclick = () => openStory(groups, +b.dataset.i, 0));
  $$('.story-b[data-live]', rail).forEach(b => b.onclick = () => {
    const r = live[+b.dataset.live], same = live.filter(x => x.site === r.site);
    if (X.track) X.track('story_live_open', { room: r.room, site: r.site });
    openCbRoom(same, same.indexOf(r), campaignQs(), LIVE_SITES[r.site].name);
  });
  clearTimeout(storyTimer);
  if (live.length) storyTimer = setTimeout(() => { if (!document.hidden && rail.offsetParent) renderStories(); }, 120000);
}
function openStory(groups, gi, ii) {
  const g = groups[gi]; if (!g) return renderStories();
  const it = g.items[ii]; if (!it) return openStory(groups, gi + 1, 0);
  const seen = new Set(store.get('storySeen', [])); seen.add(String(it.id)); store.set('storySeen', [...seen].slice(-400));
  let v = $('.sview'); if (v) v.remove();
  v = el(`<div class="sview" role="dialog" aria-label="Story"><div class="sv-frame">${it.type === 'video' ? `<video src="${it.url}" autoplay playsinline muted></video>` : `<img src="${it.url}" alt="">`}
    <div class="sv-bars">${g.items.map((_, k) => `<i><b style="width:${k < ii ? 100 : 0}%"></b></i>`).join('')}</div>
    <div class="sv-h"><span class="ava-sm" style="background-image:url(${g.creator.avatar || ''})"></span><b>${esc(g.creator.name)}</b><small>${fmt.ago(it.at)}</small><button class="icon-btn" style="margin-left:auto" data-x aria-label="Close"><svg class="icon"><use href="#i-x"/></svg></button></div>
    <button class="sv-tap l" aria-label="Previous"></button><button class="sv-tap r" aria-label="Next"></button>
    ${it.caption ? `<div class="sv-cap">${esc(it.caption)}</div>` : ''}
    <div class="sv-act"><button class="btn btn--primary" data-gift>🎁 Gift</button><button class="btn" data-open>View profile</button></div></div></div>`);
  document.body.appendChild(v); document.body.classList.add('locked');
  const dur = it.type === 'video' ? 15000 : 5000, bar = $$('.sv-bars i b', v)[ii];
  const anim = bar.animate([{ width: '0%' }, { width: '100%' }], { duration: dur, fill: 'forwards' });
  const close = () => { anim.cancel(); v.remove(); if (!document.querySelector('.scrim')) document.body.classList.remove('locked'); renderStories(); };
  anim.onfinish = () => openStory(groups, gi, ii + 1);
  $('[data-x]', v).onclick = close;
  $('.sv-tap.l', v).onclick = () => { anim.cancel(); ii > 0 ? openStory(groups, gi, ii - 1) : openStory(groups, Math.max(0, gi - 1), 0); };
  $('.sv-tap.r', v).onclick = () => { anim.cancel(); openStory(groups, gi, ii + 1); };
  $('[data-gift]', v).onclick = () => { close(); openGifts(g.creator.id); };
  $('[data-open]', v).onclick = () => { close(); if (X.byId[g.creator.id]) X.openProfile(g.creator.id); else location.hash = '#member-' + g.creator.id; };
  track('story_view', { creator: g.creator.id });
}
async function renderClips() {
  const root = $('#clipsInner'); if (!root) return;
  let clips = [];
  if (API) { try { clips = (await X3API.get('/api/clips')).clips; } catch {} }
  else clips = X.models.map(m => ({ id: 'c-' + m.id, creator: { id: m.id, name: m.name }, type: 'video', url: U.videoSrc(m), poster: U.poster(m), caption: m.bio, likes: null }));
  const items = [];
  clips.forEach((c, i) => { items.push(c); if (i % 4 === 3) items.push({ sponsor: true }); });
  root.innerHTML = (API ? '<div class="pv-cta"><a href="#videos">More videos from partner creators →</a></div>' : '') + `<div class="clips" id="clipFeed">${items.length ? items.map((c, i) => c.sponsor
    ? `<div class="clip sponsor" data-i="${i}"><div class="clip-empty"><div><b class="serif" style="font-size:34px;font-style:italic">x3STAR VIP</b><p>Black VIP unlocks the Galaxy gift and a holographic name.</p><a class="btn btn--primary" href="#rewards">See VIP</a></div></div><div class="clip-meta"><b>Sponsored</b></div></div>`
    : `<div class="clip" data-i="${i}" data-c="${esc(c.creator.id)}">${c.type === 'video' ? `<video src="${c.url}" ${c.poster ? `poster="${c.poster}"` : ''} loop muted playsinline preload="none"></video>` : `<img src="${c.url}" alt="">`}
      <div class="clip-meta"><b>${esc(c.creator.name)}</b><p>${esc(c.caption || '')}</p></div>
      <div class="clip-rail"><button data-like><span>♥</span>${c.likes != null ? fmt.k(c.likes) : 'Like'}</button><button data-gift><span>🎁</span>Gift</button><button data-open><span>👤</span>Profile</button></div></div>`).join('') : '<div class="clip"><div class="clip-empty">No clips yet — creators post them from Creator Studio.</div></div>'}</div>`;
  const io = new IntersectionObserver(es => es.forEach(e => { const vid = $('video', e.target); if (!vid) return; if (e.intersectionRatio > .6) vid.play().catch(() => {}); else vid.pause(); }), { threshold: [0, .6, 1] });
  $$('.clip', root).forEach(c => { io.observe(c); const id = c.dataset.c; if (!id) return;
    $('[data-gift]', c).onclick = () => openGifts(id);
    $('[data-open]', c).onclick = () => (X.byId[id] ? X.openProfile(id) : (location.hash = '#member-' + id));
    $('[data-like]', c).onclick = (e) => { const b = e.currentTarget; b.classList.toggle('on'); $('span', b).style.color = b.classList.contains('on') ? 'var(--pink)' : ''; burstAt(b, 8); };
  });
}

/* =====================================================================
   Live now on Chaturbate — real live rooms from the online-rooms API.
   Clicks go through /go/CB/r/<room> (counted, then the affiliate link).
   ===================================================================== */
const CB_TABS = [['women', 'Women', { gender: 'f' }], ['couples', 'Couples', { gender: 'c' }], ['trans', 'Trans', { gender: 't' }], ['men', 'Men', { gender: 'm' }],
  ['bigboobs', 'Big boobs', { gender: 'f', tag: 'bigboobs' }], ['goth', 'Goth', { gender: 'f', tag: 'goth' }], ['femdom', 'Femdom', { tag: 'femdom' }]];
/* Each partner site's grid: API endpoint, category tabs, display name. BongaCams has no tag filter, so gender tabs only. */
const LIVE_SITES = {
  CB: { name: 'Chaturbate', api: '/api/cb/live', tabs: CB_TABS },
  BC: { name: 'BongaCams', api: '/api/bc/live', tabs: CB_TABS.slice(0, 4) }
};
const cbl = { site: '', tab: 'women', shown: 12, data: null, timer: null, loading: false };
async function renderCbLive(force) {
  const sec = $('#sec-cblive'), root = $('#cbLiveInner'); if (!sec || !root) return;
  const sites = ((window.X3STAR_BOOT && X3STAR_BOOT.liveSites) || ['CB']).filter(s => LIVE_SITES[s]);
  if (!API || !sites.length) { sec.hidden = true; return; }
  if (!sites.includes(cbl.site)) cbl.site = sites[0];
  const site = LIVE_SITES[cbl.site];
  if (!site.tabs.some(t => t[0] === cbl.tab)) cbl.tab = site.tabs[0][0];
  if (cbl.loading) return; cbl.loading = true;
  const [, , q] = site.tabs.find(t => t[0] === cbl.tab) || site.tabs[0];
  try { cbl.data = await X3API.get(site.api + '?' + new URLSearchParams({ ...q, limit: 48 })); }
  catch { cbl.data = { enabled: true, rooms: [], error: 'Live rooms are unavailable right now' }; }
  cbl.loading = false;
  const d = cbl.data;
  if (!d.enabled) { sec.hidden = true; return; }
  sec.hidden = false;
  const camp = (window.X3STAR && X3STAR.campaign) || {};
  const qs = (() => { const p = new URLSearchParams(); if (camp.utm_campaign) p.set('c', camp.utm_campaign); if (camp.utm_source) p.set('s', camp.utm_source); const s = p.toString(); return s ? '?' + s : ''; })();
  const rooms = d.rooms.slice(0, cbl.shown);
  root.innerHTML = `<div class="pv-head"><div><span class="eyebrow">Partner rooms · ${esc(site.name)}</span><h2>Live <em>right now</em>.</h2></div><p>${d.rooms.length ? `${fmt.num(d.total)} rooms streaming in this category. Free to watch — hover to preview, tap a room to watch it here.` : (d.error || 'Nobody is live in this category right now. Try another tab.')}</p></div>
    ${sites.length > 1 ? `<div class="live-sites" role="tablist" aria-label="Partner site">${sites.map(k => `<button class="${k === cbl.site ? 'on' : ''}" role="tab" aria-selected="${k === cbl.site}" data-livesite="${k}">${esc(LIVE_SITES[k].name)}</button>`).join('')}</div>` : ''}
    <div class="pv-chips" role="tablist">${site.tabs.map(([k, l]) => `<button class="pv-chip ${k === cbl.tab ? 'on' : ''}" role="tab" aria-selected="${k === cbl.tab}" data-cbtab="${k}">${esc(l)}</button>`).join('')}</div>
    <div class="cb-grid">${rooms.map((r, i) => `<article class="cb-card" tabindex="0" role="button" aria-label="Open ${esc(r.name)}'s live room" data-cbi="${i}">
      <img src="${esc(r.thumb)}" alt="" loading="lazy" decoding="async">
      <span class="cb-badges">${r.show === 'public' ? '<b class="cb-live">LIVE</b>' : `<b class="cb-priv">${esc(r.show)}</b>`}${r.hd ? '<b>HD</b>' : ''}${r.isNew ? '<b class="cb-new">NEW</b>' : ''}${r.interactive ? '<b title="Interactive toy">⚡</b>' : ''}</span>
      <span class="cb-viewers">👁 ${fmt.num(r.viewers)}</span>
      ${r.embed ? '<span class="cb-hint">▶ Hover to watch</span>' : ''}
      <span class="cb-glass"><span class="cb-name">${esc(r.name)}${r.age ? `<i>${r.age}</i>` : ''}</span>${r.subject ? `<span class="cb-subj">${esc(r.subject)}</span>` : ''}${r.tags.length ? `<span class="cb-tags">${r.tags.slice(0, 3).map(t => `#${esc(t)}`).join(' ')}</span>` : ''}</span>
    </article>`).join('')}</div>
    ${d.rooms.length > cbl.shown ? '<div class="pv-more"><button class="btn btn--ghost" id="cbMore">Show more live rooms</button></div>' : ''}
    <p class="pv-note">Partner rooms hosted on ${esc(site.name)}. All performers are 18+. x3STAR may earn a commission when you join there.</p>`;
  $$('[data-livesite]', root).forEach(b => b.onclick = () => { cbl.site = b.dataset.livesite; cbl.shown = 12; renderCbLive(true); });
  $$('[data-cbtab]', root).forEach(b => b.onclick = () => { cbl.tab = b.dataset.cbtab; cbl.shown = 12; renderCbLive(true); });
  const more = $('#cbMore'); if (more) more.onclick = () => { cbl.shown += 12; renderCbLive(true); };
  const list = rooms;
  $$('.cb-card', root).forEach(card => {
    const r = list[Number(card.dataset.cbi)];
    const open = () => openCbRoom(list, Number(card.dataset.cbi), qs, site.name);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    if (!r.embed || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let t;
    card.addEventListener('mouseenter', () => { t = setTimeout(() => {
      $$('.cb-card iframe', root).forEach(f => f.remove());
      const f = document.createElement('iframe');
      f.src = r.embed; f.title = `${r.name} live preview`; f.loading = 'lazy'; f.allow = 'autoplay; fullscreen'; f.referrerPolicy = 'no-referrer-when-downgrade';
      f.setAttribute('scrolling', 'no'); f.tabIndex = -1;
      card.insertBefore(f, card.querySelector('.cb-badges')); card.classList.add('playing');
      if (X.track) X.track('cb_live_preview', { room: r.room, site: cbl.site });
    }, 550); });
    card.addEventListener('mouseleave', () => { clearTimeout(t); const f = card.querySelector('iframe'); if (f) f.remove(); card.classList.remove('playing'); });
  });
  clearInterval(cbl.timer);
  cbl.timer = setInterval(() => { if (!document.hidden && !sec.hidden && sec.offsetParent) renderCbLive(true); }, 90000);
}

/* A live Chaturbate room in an x3STAR window: the stream (or thumbnail) on top with a see-through
   overlay, room details below, "Watch full room" through the counted affiliate link, and next/prev. */
function openCbRoom(list, i, qs, siteName = 'Chaturbate') {
  const r = list[i]; if (!r) return;
  if (X.track) X.track('cb_room_open', { room: r.room, site: siteName });
  const api = X.ui.openModal(`<div class="profile-modal cb-room">
    <div class="pm-media cb-room-media">
      ${r.embed ? `<iframe src="${esc(r.embed)}" title="${esc(r.name)} live on ${esc(siteName)}" allow="autoplay; fullscreen" scrolling="no" referrerpolicy="no-referrer-when-downgrade"></iframe>` : `<img src="${esc(r.thumb)}" alt="">`}
      <div class="top"><span class="pill-live">${r.show === 'public' ? 'LIVE' : esc(r.show.toUpperCase())}</span><span class="viewers num">👁 ${fmt.num(r.viewers)}</span>${r.hd ? '<span class="viewers">HD</span>' : ''}</div>
      <div class="cb-room-glass"><b>${esc(r.name)}${r.age ? ` <i>${r.age}</i>` : ''}</b><span>${r.location ? esc(r.location) + ' · ' : ''}live ${r.minutesOnline >= 60 ? Math.floor(r.minutesOnline / 60) + 'h ' + (r.minutesOnline % 60) + 'm' : r.minutesOnline + 'm'}</span></div>
    </div>
    <div class="pm-body">
      <span class="eyebrow">Partner room · ${esc(siteName)}</span>
      <h3>${esc(r.name)}</h3>
      ${r.subject ? `<p class="bio">${esc(r.subject)}</p>` : ''}
      ${r.tags.length ? `<div class="cb-room-tags">${r.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="cb-room-stats"><div><b>${fmt.num(r.viewers)}</b><small>watching</small></div>${r.followers ? `<div><b>${fmt.num(r.followers)}</b><small>followers</small></div>` : `<div><b>${r.location ? esc(r.location.split(',').pop().trim()) : '—'}</b><small>from</small></div>`}<div><b>${r.age || '—'}</b><small>age</small></div></div>
      <a class="btn btn--primary" href="${esc(r.href + qs)}" target="_blank" rel="sponsored noopener" data-cbgo>Watch full room on ${esc(siteName)} ↗</a>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn" data-cbnav="-1" ${i ? '' : 'disabled'}>← Previous</button><button class="btn" data-cbnav="1" ${i < list.length - 1 ? '' : 'disabled'}>Next room →</button></div>
      <p class="pv-note" style="margin:0">Free to watch. Chatting and tipping happen on ${esc(siteName)}; joining is free. x3STAR may earn a commission.</p>
    </div></div>`, { cls: 'modal--xl' });
  $('[data-cbgo]', api.root).addEventListener('click', () => { if (X.track) X.track('cb_live_click', { room: r.room, site: siteName, from: 'window' }); });
  $$('[data-cbnav]', api.root).forEach(b => b.onclick = () => { api.close(); setTimeout(() => openCbRoom(list, i + Number(b.dataset.cbnav), qs, siteName), 330); });
}

/* =====================================================================
   Partner videos (BongaCams feed). Thumbnails scrub on hover / cycle in
   view on touch; every click goes through /go/v/<id> so it is counted
   before the visitor lands on the partner site.
   ===================================================================== */
const pv = { tag: '', performer: '', offset: 0, items: [], total: 0, tags: [], loading: false };
async function renderVideos(more) {
  const root = $('#videosInner'); if (!root) return;
  if (!API) { root.innerHTML = `<div class="pv-head"><div><span class="eyebrow">Partner videos</span><h2>More to <em>watch</em>.</h2></div></div><p class="pv-note">Partner videos load from the x3STAR server.</p>`; return; }
  if (pv.loading) return; pv.loading = true;
  if (!more) { pv.offset = 0; pv.items = []; }
  try {
    const q = new URLSearchParams({ limit: 24, offset: pv.offset }); if (pv.tag) q.set('tag', pv.tag); if (pv.performer) q.set('performer', pv.performer);
    const d = await X3API.get('/api/partner-videos?' + q);
    pv.items = pv.items.concat(d.videos); pv.total = d.total; pv.tags = d.tags; pv.offset = pv.items.length;
  } catch { pv.loading = false; root.innerHTML = '<p class="pv-note">Videos could not be loaded. Try again in a moment.</p>'; return; }
  pv.loading = false;
  const camp = (window.X3STAR && X3STAR.campaign) || {};
  const qs = (() => { const q = new URLSearchParams(); if (camp.utm_campaign) q.set('c', camp.utm_campaign); if (camp.utm_source) q.set('s', camp.utm_source); const s = q.toString(); return s ? '?' + s : ''; })();
  const chip = (t, on) => `<button class="pv-chip ${on ? 'on' : ''}" data-tag="${esc(t)}">${esc(t || 'All')}</button>`;
  root.innerHTML = `<div class="pv-head"><div><span class="eyebrow">Partner videos · BongaCams</span><h2>More to <em>watch</em>.</h2></div><p>${fmt.num(pv.total)} ${pv.performer ? `clips from <b>${esc(pv.performer)}</b> <button class="pv-x" data-perf="">✕</button>` : 'teaser clips'}. Hover to preview; tap through to watch the full video on BongaCams.</p></div>
    <div class="pv-chips">${chip('', !pv.tag)}${pv.tags.map(t => chip(t.tag, pv.tag.toLowerCase() === t.tag.toLowerCase())).join('')}</div>
    <div class="pv-grid">${pv.items.map(v => `<article class="pv-card">
      <a class="pv-media" href="${esc(v.href + qs)}" target="_blank" rel="sponsored noopener" data-pv="${esc(v.id)}" data-thumbs="${esc(JSON.stringify(v.thumbs))}"><img src="${esc(v.thumbs[0])}" alt="" loading="lazy"><span class="pv-bar"><i></i></span><span class="pv-play">▶ Watch</span></a>
      <div class="pv-body"><button class="pv-perf" data-perf="${esc(v.performer)}">${esc(v.performer)}</button><p>${esc(v.title)}</p>${v.tags.length ? `<div class="pv-tags">${v.tags.slice(0, 4).map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}</div></article>`).join('') || '<p class="pv-note">No videos match this filter.</p>'}</div>
    ${pv.items.length < pv.total ? '<div class="pv-more"><button class="btn btn--ghost" id="pvMore">Load more</button></div>' : ''}
    <p class="pv-note">Partner content hosted on BongaCams. x3STAR may earn a commission when you sign up there.</p>`;
  $$('[data-tag]', root).forEach(b => b.onclick = () => { pv.tag = b.dataset.tag; renderVideos(); });
  $$('[data-perf]', root).forEach(b => b.onclick = () => { pv.performer = b.dataset.perf; pv.tag = ''; renderVideos(); root.scrollIntoView({ behavior: 'smooth' }); });
  const moreBtn = $('#pvMore'); if (moreBtn) moreBtn.onclick = () => renderVideos(true);
  const frame = (a, i) => { const th = JSON.parse(a.dataset.thumbs); const k = ((i % th.length) + th.length) % th.length; const img = $('img', a); if (img.dataset.k != k) { img.src = th[k]; img.dataset.k = k; } $('.pv-bar i', a).style.width = ((k + 1) / th.length * 100) + '%'; };
  $$('.pv-media', root).forEach(a => {
    const n = JSON.parse(a.dataset.thumbs).length;
    a.addEventListener('mousemove', (e) => { const r = a.getBoundingClientRect(); frame(a, Math.floor((e.clientX - r.left) / r.width * n)); });
    a.addEventListener('mouseleave', () => frame(a, 0));
    a.addEventListener('click', () => { if (X.track) X.track('partner_video_click', { id: a.dataset.pv }); });
  });
  if (matchMedia('(hover: none)').matches) {
    const timers = new Map();
    const io = new IntersectionObserver(es => es.forEach(e => { const a = e.target;
      if (e.isIntersecting && !timers.has(a)) { let i = 0; timers.set(a, setInterval(() => frame(a, ++i), 900)); }
      else if (!e.isIntersecting && timers.has(a)) { clearInterval(timers.get(a)); timers.delete(a); frame(a, 0); } }), { threshold: .6 });
    $$('.pv-media', root).forEach(a => io.observe(a));
  }
}

/* =====================================================================
   Countdown ticker for every [data-cd] element
   ===================================================================== */
setInterval(() => { $$('[data-cd]').forEach(n => { const ms = +n.dataset.cd - now(); n.textContent = ms > 0 ? dclock(ms) : '0:00'; }); }, 1000);

/* =====================================================================
   Wiring
   ===================================================================== */
function refreshViews() {
  const r = document.body.dataset.route;
  if (r === 'rewards') renderRewards();
  if (r === 'account') { const a = $('#acctProfile'); if (a) { const root = a.parentElement; a.remove(); onAccount(root); } }
  paintWatch(); paintFilterSelect();
}
function onRoute(r) {
  if (r.name === 'rewards') renderRewards();
  if (r.name === 'families') renderFamilies();
  if (r.name === 'clips') renderClips();
  if (r.name === 'videos') renderVideos();
  if (['home', 'live', 'niches'].includes(r.name)) renderCbLive();
  if (['home', 'profiles', 'live'].includes(r.name)) renderStories();
  if (r.name === 'live') mountPK();
  if (r.name !== 'live') { const c = gp.combo; if (c) { c.node.remove(); gp.combo = null; } }
  paintWatch();
}

function onProfile(id, root, api) {
  const m = X.byId[id]; if (!m) return;
  const body = $('.pm-body', root); if (!body) return;
  const acts = el(`<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn--primary btn--sm" data-gift>🎁 Send a gift</button></div>`);
  const camp = (() => { try { return JSON.parse(localStorage.getItem('x3s:campaign') || '{}'); } catch { return {}; } })();
  const go = Object.entries(m.go || {});
  if (go.length) acts.appendChild(el(`<div class="also" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;font:500 11px var(--mono);color:var(--mute)">Also live on ${go.map(([site, g]) => `<a class="sb sb--${site}" style="height:24px;padding:0 9px" href="${g.href}?c=${encodeURIComponent(camp.utm_campaign || '')}&s=${encodeURIComponent(camp.utm_source || '')}" target="_blank" rel="noopener sponsored">${esc(g.name)} ↗</a>`).join('')}</div>`));
  body.insertBefore(acts, $('.tabs', body));
  $('[data-gift]', acts).onclick = () => { api.close(); openGifts(id); };
}
window.X3Game = { onProfile, decorate, onStage, onMember, onAccount, onRoute, openGifts, openTopUp, openDaily, openAuth, econ: Econ, actions };
Econ.init();
addEventListener('x3star:session-changed', event => {
  if (!API || !event.detail || !event.detail.user) return;
  Econ.me = event.detail.user;
  BOOT.me = Econ.me;
  Econ.init();
  if ($('#hud')) paintHUD();
});
addEventListener('x3star:entered', intro, { once: true });
X.onReady(() => {
  mountHUD(); mountWatch(); renderStories();
  const r = document.body.dataset.route;
  if (r === 'live') { mountPK(); if (X.stage.id) onStage(X.byId[X.stage.id]); }
  onRoute({ name: r });
});
// keep HUD current when other tabs change local state
addEventListener('storage', (e) => { if (!API && e.key === 'x3s:econ') { Econ.init(); paintHUD(); } });
setInterval(() => { if (!API) { Econ.refreshLocal(); } paintHUD(); }, 15000);
})();
