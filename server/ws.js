'use strict';
/* Realtime hub: unified chat, gifts, entrances, PK battles, optional demo traffic. */
const { WebSocketServer } = require('ws');
const crypto = require('node:crypto');
const cfg = require('./config');
const { all, get } = require('./db');
const { parseCookies, userForToken, COOKIE } = require('./auth');
const S = require('./services');

let wss = null;
const clients = new Set();
const id = () => crypto.randomBytes(6).toString('hex');

function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(msg) { const data = JSON.stringify(msg); for (const ws of clients) if (ws.readyState === 1) ws.send(data); }

/* ---------------- PK battles ---------------- */
const pk = { id: null, phase: 'idle', a: null, b: null, endsAt: 0, nextAt: 0, winner: null, mvp: {} };
const liveCreators = () => all("SELECT id, name FROM creators WHERE status = 'approved' AND live = 1");
function pkPublic() {
  const mvp = Object.entries(pk.mvp).sort((x, y) => y[1].d - x[1].d).slice(0, 3).map(([name, v]) => ({ name, diamonds: v.d, side: v.side }));
  return { id: pk.id, phase: pk.phase, a: pk.a, b: pk.b, endsAt: pk.endsAt, nextAt: pk.nextAt, winner: pk.winner, mvp, now: Date.now() };
}
function pkStart() {
  const live = liveCreators(); if (live.length < 2) { pk.phase = 'idle'; return; }
  const shuffled = live.sort(() => Math.random() - 0.5);
  const c = S.econConfig().pk;
  Object.assign(pk, { id: id(), phase: 'live', a: { id: shuffled[0].id, name: shuffled[0].name, score: 0 }, b: { id: shuffled[1].id, name: shuffled[1].name, score: 0 }, endsAt: Date.now() + c.durationSec * 1000, nextAt: 0, winner: null, mvp: {} });
  broadcast({ type: 'pk', state: pkPublic() });
}
function pkEnd() {
  const c = S.econConfig().pk;
  pk.phase = 'result';
  pk.winner = pk.a.score === pk.b.score ? 'draw' : pk.a.score > pk.b.score ? 'a' : 'b';
  pk.nextAt = Date.now() + c.cooldownSec * 1000;
  broadcast({ type: 'pk', state: pkPublic() });
}
/** Add points when a gift lands on a creator who is in the live PK. Returns side or null. */
function pkGift(creatorId, diamonds, userName) {
  if (pk.phase !== 'live') return null;
  const side = pk.a.id === creatorId ? 'a' : pk.b.id === creatorId ? 'b' : null;
  if (!side) return null;
  pk[side].score += diamonds;
  const m = pk.mvp[userName] || (pk.mvp[userName] = { d: 0, side }); m.d += diamonds;
  broadcast({ type: 'pk', state: pkPublic() });
  return side;
}
function pkTick() {
  const now = Date.now();
  if (pk.phase === 'live' && now >= pk.endsAt) pkEnd();
  else if ((pk.phase === 'result' && now >= pk.nextAt) || pk.phase === 'idle') pkStart();
}

/* ---------------- demo traffic ---------------- */
const DEMO_USERS = ['nightowl_88', 'velvetdrip', 'k1ngpin', 'midnightrider', 'shadowtip', 'blk_card', 'neonwolf', 'quietwhale', 'dr.feelgood', 'satoshi_simp', 'heelsandhex', 'lowkey_lex', 'vanta', 'cashmere_cole', 'm0nolith', 'sugarvault', 'ghostfacepay', 'hexrider', 'obsidian_ox', 'gold_tooth', 'nocturne', 'the_regular'];
const DEMO_LINES = ['🔥🔥🔥', 'that lighting tho', 'goal when?', 'just got here', 'the playlist tonight is elite', 'best room on the floor rn', 'say hi to chat 💕', 'love the new set', 'PK time let\'s go', 'family war tonight?', 'who\'s MVP rn', 'VIP gang ♛'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const demoLevel = (name) => 5 + ([...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 45);
function demoTick() {
  const live = liveCreators(); if (!live.length) return;
  const c = pick(live), user = pick(DEMO_USERS), r = Math.random();
  const lvl = demoLevel(user), vip = lvl > 40 ? 3 : lvl > 30 ? 2 : lvl > 22 ? 1 : 0;
  const base = { id: id(), site: pick(['CB', 'SC', 'BC', 'C4', 'X3']), room: c.id, user, level: lvl, vip, demo: true, ts: Date.now() };
  if (r < 0.14) {
    const gifts = S.econConfig().gifts.filter(g => !g.vip || g.vip <= vip);
    const g = Math.random() < 0.85 ? pick(gifts.slice(0, 7)) : pick(gifts);
    const qty = g.price < 50 ? pick([1, 1, 5, 10, 66]) : 1, diamonds = g.price * qty;
    broadcast({ ...base, site: 'X3', type: 'gift', giftId: g.id, qty, diamonds, text: `sent ${g.name}` });
    pkGift(c.id, diamonds, user);
  } else if (r < 0.18) {
    broadcast({ ...base, site: 'X3', type: 'enter', entrance: vip ? `ent_vip${vip}` : pick(['ent_spark', 'ent_rose', 'ent_lambo']) });
  } else {
    broadcast({ ...base, type: 'chat', text: pick(DEMO_LINES) });
  }
}

/* ---------------- connection handling ---------------- */
function verifyOrigin({ origin, req }, done) {
  if (!origin) return done(true); // Non-browser clients may omit Origin.
  try {
    const source = new URL(origin);
    let protocol = req.socket.encrypted ? 'https' : 'http';
    if (cfg.TRUST_PROXY && req.headers['x-forwarded-proto']) protocol = req.headers['x-forwarded-proto'].split(',')[0].trim();
    const expected = cfg.SITE_URL || `${protocol}://${req.headers.host}`;
    done(['http:', 'https:'].includes(source.protocol) && source.origin === expected, 403);
  } catch { done(false, 403); }
}

function init(server) {
  wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024, verifyClient: verifyOrigin });
  wss.on('connection', (ws, req) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const user = userForToken(token);
    ws.user = user ? { id: user.id, name: user.name } : null;
    ws.room = null; ws.lastChat = 0; ws.alive = true;
    clients.add(ws);
    send(ws, { type: 'hello', user: ws.user, pk: pkPublic(), demo: cfg.DEMO_TRAFFIC });
    ws.on('pong', () => { ws.alive = true; });
    ws.on('close', () => clients.delete(ws));
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m !== 'object') return;
      if (m.type === 'ping') return send(ws, { type: 'pong', ts: Date.now() });
      if (m.type === 'join') {
        const room = typeof m.room === 'string' && get("SELECT id FROM creators WHERE id = ? AND status = 'approved'", m.room) ? m.room : null;
        ws.room = room;
        const u = userForToken(token);
        if (room && u) {
          const ident = S.chatIdentity(u);
          if (ident.entrance || ident.vip) broadcast({ type: 'enter', id: id(), site: 'X3', room, user: u.name, level: ident.level, vip: ident.vip, entrance: ident.entrance || `ent_vip${ident.vip}`, ts: Date.now() });
        }
        return;
      }
      if (m.type === 'chat') {
        const u = userForToken(token);
        if (!u) return send(ws, { type: 'error', code: 'auth_required', message: 'Sign in to chat' });
        const now = Date.now(); if (now - ws.lastChat < 900) return send(ws, { type: 'error', code: 'rate_limited', message: 'Slow down' });
        const text = String(m.text || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 280); if (!text) return;
        const room = typeof m.room === 'string' && get("SELECT id FROM creators WHERE id = ? AND status = 'approved'", m.room) ? m.room : null;
        ws.lastChat = now;
        let ident;
        try { S.withEcon(u.id, 'chat_xp', (s, c, t) => S.E.chatXp(s, c, t)); ident = S.chatIdentity(get('SELECT * FROM users WHERE id = ?', u.id)); } catch { ident = S.chatIdentity(u); }
        broadcast({ type: 'chat', id: id(), site: 'X3', room, user: u.name, text, level: ident.level, vip: ident.vip, cosmetics: ident.cosmetics, ts: now });
      }
    });
  });
  setInterval(() => { for (const ws of clients) { if (!ws.alive) { ws.terminate(); clients.delete(ws); continue; } ws.alive = false; try { ws.ping(); } catch {} } }, 30000).unref();
  setInterval(pkTick, 1000).unref();
  if (cfg.DEMO_TRAFFIC) (function loop() { setTimeout(() => { try { demoTick(); } catch {} loop(); }, 700 + Math.random() * 1600).unref(); })();
}

module.exports = { init, broadcast, pkGift, pkPublic, clientCount: () => clients.size };
