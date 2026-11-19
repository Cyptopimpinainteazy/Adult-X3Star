'use strict';
/* Admin: overview KPIs, applications, users, creators, moderation, payouts, reports, economy config, ledger, audit. */
const express = require('express');
const crypto = require('node:crypto');
const { all, get, run, tx, J, audit } = require('../db');
const A = require('../auth');
const S = require('../services');
const U = require('../uploads');
const { HttpError, bad, str, intIn, oneOf } = require('./common');

const r = express.Router();
r.use(A.requireRole('admin'));
const DAY = 86400000;
const sum = (sql, ...p) => (get(sql, ...p) || {}).v || 0;

r.get('/overview', (_req, res) => {
  const now = Date.now(), d14 = now - 14 * DAY, d1 = now - DAY, d7 = now - 7 * DAY;
  const series = (sql) => { const rows = all(sql, d14, DAY, d14); return Array.from({ length: 14 }, (_, i) => (rows.find(x => x.d === i) || {}).v || 0); };
  const econ = S.econConfig();
  res.json({
    counts: {
      users: sum('SELECT COUNT(*) AS v FROM users'), fans: sum("SELECT COUNT(*) AS v FROM users WHERE role='fan'"),
      creators: sum("SELECT COUNT(*) AS v FROM creators WHERE status='approved'"), live: sum("SELECT COUNT(*) AS v FROM creators WHERE live=1 AND status='approved'"),
      agents: sum("SELECT COUNT(*) AS v FROM users WHERE role='agent'"), families: sum('SELECT COUNT(*) AS v FROM families'),
      online24h: sum('SELECT COUNT(*) AS v FROM users WHERE last_seen > ?', d1)
    },
    queues: {
      applications: sum("SELECT COUNT(*) AS v FROM applications WHERE status='pending'"), uploads: sum("SELECT COUNT(*) AS v FROM uploads WHERE status='pending'"),
      kyc: sum("SELECT COUNT(*) AS v FROM creators WHERE kyc='pending'"), payouts: sum("SELECT COUNT(*) AS v FROM payouts WHERE status IN ('pending','approved')"),
      reports: sum("SELECT COUNT(*) AS v FROM reports WHERE status='open'")
    },
    money: {
      revenue24h: sum("SELECT COALESCE(SUM(usd),0) AS v FROM orders WHERE status='paid' AND test=0 AND paid_at > ?", d1),
      revenue7d: sum("SELECT COALESCE(SUM(usd),0) AS v FROM orders WHERE status='paid' AND test=0 AND paid_at > ?", d7),
      testRevenue7d: sum("SELECT COALESCE(SUM(usd),0) AS v FROM orders WHERE status='paid' AND test=1 AND paid_at > ?", d7),
      diamondsGifted24h: sum('SELECT COALESCE(SUM(diamonds),0) AS v FROM gifts WHERE created_at > ?', d1),
      diamondsGifted7d: sum('SELECT COALESCE(SUM(diamonds),0) AS v FROM gifts WHERE created_at > ?', d7),
      beansOutstanding: sum('SELECT COALESCE(SUM(beans),0) AS v FROM creators'),
      beansOutstandingUsd: Math.round(sum('SELECT COALESCE(SUM(beans),0) AS v FROM creators') * econ.beanUsd * 100) / 100,
      payoutsPendingUsd: sum("SELECT COALESCE(SUM(usd),0) AS v FROM payouts WHERE status IN ('pending','approved')")
    },
    series: {
      signups: series('SELECT CAST((created_at - ?) / ? AS INTEGER) AS d, COUNT(*) AS v FROM users WHERE created_at > ? GROUP BY d'),
      gifts: series('SELECT CAST((created_at - ?) / ? AS INTEGER) AS d, SUM(diamonds) AS v FROM gifts WHERE created_at > ? GROUP BY d'),
      revenue: series("SELECT CAST((paid_at - ?) / ? AS INTEGER) AS d, SUM(usd) AS v FROM orders WHERE status='paid' AND paid_at > ? GROUP BY d")
    },
    topCreators: all('SELECT c.id, c.name, SUM(g.diamonds) AS diamonds, COUNT(DISTINCT g.from_user) AS gifters FROM gifts g JOIN creators c ON c.id = g.creator_id WHERE g.created_at > ? GROUP BY c.id ORDER BY diamonds DESC LIMIT 8', d7),
    topGifters: all('SELECT u.id, u.name, SUM(g.diamonds) AS diamonds FROM gifts g JOIN users u ON u.id = g.from_user WHERE g.created_at > ? GROUP BY u.id ORDER BY diamonds DESC LIMIT 8', d7)
  });
});

/* ---------- applications ---------- */
r.get('/applications', (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  res.json({ rows: all('SELECT * FROM applications WHERE status = ? ORDER BY id DESC LIMIT 200', status).map(a => ({ ...a, data: J(a.data, {}) })) });
});
r.post('/applications/:id', (req, res) => {
  const a = get('SELECT * FROM applications WHERE id = ?', Number(req.params.id)); if (!a) throw new HttpError(404, 'not_found', 'Application not found');
  if (a.status !== 'pending') throw bad('Already decided');
  const decision = oneOf(req.body.status, 'status', ['approved', 'rejected']);
  let tempPassword = null, creatorId = null;
  tx(() => {
    if (decision === 'approved') {
      const data = J(a.data, {}), now = Date.now();
      let u = get('SELECT * FROM users WHERE email = ?', a.email);
      if (!u) {
        tempPassword = crypto.randomBytes(9).toString('base64url');
        let name = String(data.stage || 'creator').replace(/[^A-Za-z0-9_.]/g, '').slice(0, 20) || 'creator';
        while (get('SELECT 1 FROM users WHERE name = ?', name)) name = name.slice(0, 18) + Math.floor(Math.random() * 90 + 10);
        const info = run('INSERT INTO users (email, name, pass_hash, role, econ, ref_code, created_at) VALUES (?,?,?,?,?,?,?)', a.email, name, A.hashPassword(tempPassword), a.kind === 'agent' ? 'agent' : 'creator', JSON.stringify(S.E.newState(S.econConfig(), now)), S.refCode(), now);
        u = get('SELECT * FROM users WHERE id = ?', Number(info.lastInsertRowid));
      } else if (u.role === 'fan') run('UPDATE users SET role = ? WHERE id = ?', a.kind === 'agent' ? 'agent' : 'creator', u.id);
      if (a.kind === 'creator') {
        if (data.agentCode) { const agent = get("SELECT id FROM users WHERE ref_code = ? AND role = 'agent'", data.agentCode); if (agent) run('UPDATE users SET agent_id = ? WHERE id = ?', agent.id, u.id); }
        const existing = get('SELECT id FROM creators WHERE user_id = ?', u.id);
        if (existing) creatorId = existing.id;
        else {
          creatorId = S.uniqueSlug(data.stage);
          run(`INSERT INTO creators (id, user_id, name, ticker, niche, sites, status, kyc, live, base_viewers, price, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            creatorId, u.id, data.stage, S.uniqueTicker(data.stage), data.niche || 'Other', JSON.stringify([...(data.sites || []), 'X3']), 'approved', 'pending', 0, 120, 0.01, now);
        }
      }
      run('UPDATE applications SET user_id = ? WHERE id = ?', u.id, a.id);
    }
    run('UPDATE applications SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?', decision, Date.now(), req.user.id, a.id);
    audit(req.user.id, 'application.' + decision, a.id, { email: a.email, kind: a.kind, creatorId });
  });
  res.json({ ok: true, tempPassword, creatorId });
});

/* ---------- users ---------- */
r.get('/users', (req, res) => {
  const q = String(req.query.q || '').trim(), role = String(req.query.role || '');
  const where = [], p = [];
  if (q) { where.push('(email LIKE ? OR name LIKE ?)'); p.push(`%${q}%`, `%${q}%`); }
  if (['fan', 'creator', 'agent', 'admin'].includes(role)) { where.push('role = ?'); p.push(role); }
  const rows = all(`SELECT * FROM users ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 200`, ...p);
  const c = S.econConfig(), now = Date.now();
  res.json({ rows: rows.map(u => { const s = S.loadEcon(u); return { id: u.id, email: u.email, name: u.name, role: u.role, banned: !!u.banned, demo: !!u.demo, diamonds: s.diamonds, level: S.E.levelInfo(s.xp, c).level, vip: S.E.vipTier(s, now), spentUsd: s.purchases.usdTotal, gifted: s.stats.giftedDiamonds, created: u.created_at, lastSeen: u.last_seen }; }) });
});
r.post('/users/:id', (req, res) => {
  const u = get('SELECT * FROM users WHERE id = ?', Number(req.params.id)); if (!u) throw new HttpError(404, 'not_found', 'User not found');
  const b = req.body || {};
  tx(() => {
    if (b.role !== undefined) { if (u.id === req.user.id && b.role !== 'admin') throw bad('You cannot remove your own admin role'); run('UPDATE users SET role = ? WHERE id = ?', oneOf(b.role, 'role', ['fan', 'creator', 'agent', 'admin']), u.id); }
    if (b.banned !== undefined) { if (u.id === req.user.id) throw bad('You cannot ban yourself'); run('UPDATE users SET banned = ? WHERE id = ?', b.banned ? 1 : 0, u.id); if (b.banned) run('DELETE FROM sessions WHERE user_id = ?', u.id); }
    if (b.grantDiamonds !== undefined) { const n = intIn(b.grantDiamonds, 'grantDiamonds', -1000000, 1000000); S.withEcon(u.id, 'admin_grant', (s) => { s.diamonds = Math.max(0, s.diamonds + n); return { by: req.user.id, amount: n, reason: String(b.reason || '').slice(0, 200) }; }); }
    if (b.grantItem) { const it = S.E.itemById(S.econConfig(), String(b.grantItem)); if (!it) throw bad('Unknown item'); S.withEcon(u.id, 'admin_item', (s, c, now) => { S.E.grant(s, it.id, now); return { item: it.id, by: req.user.id }; }); }
    audit(req.user.id, 'user.update', u.id, b);
  });
  res.json({ ok: true });
});

/* ---------- creators ---------- */
r.get('/creators', (_req, res) => {
  res.json({ rows: all('SELECT c.*, u.email, u.name AS username FROM creators c LEFT JOIN users u ON u.id = c.user_id ORDER BY c.created_at DESC').map(c => ({
    id: c.id, name: c.name, ticker: c.ticker, niche: c.niche, status: c.status, kyc: c.kyc, live: !!c.live, featured: !!c.featured, beans: c.beans, beansTotal: c.beans_total, baseViewers: c.base_viewers, email: c.email, username: c.username, demo: !!c.demo, created: c.created_at, beans30d: S.beans30d(c.id)
  })) });
});
r.post('/creators/:id', (req, res) => {
  const c = get('SELECT * FROM creators WHERE id = ?', req.params.id); if (!c) throw new HttpError(404, 'not_found', 'Creator not found');
  const b = req.body || {};
  if (b.status !== undefined) run('UPDATE creators SET status = ?, live = CASE WHEN ? = \'approved\' THEN live ELSE 0 END WHERE id = ?', oneOf(b.status, 'status', ['pending', 'approved', 'suspended']), b.status, c.id);
  if (b.kyc !== undefined) run('UPDATE creators SET kyc = ? WHERE id = ?', oneOf(b.kyc, 'kyc', ['pending', 'verified', 'rejected']), c.id);
  if (b.featured !== undefined) run('UPDATE creators SET featured = ? WHERE id = ?', b.featured ? 1 : 0, c.id);
  if (b.live !== undefined) run('UPDATE creators SET live = ? WHERE id = ?', b.live ? 1 : 0, c.id);
  if (b.baseViewers !== undefined) run('UPDATE creators SET base_viewers = ? WHERE id = ?', intIn(b.baseViewers, 'baseViewers', 0, 1000000), c.id);
  audit(req.user.id, 'creator.update', c.id, b);
  res.json({ ok: true });
});

/* ---------- moderation ---------- */
r.get('/uploads', (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  res.json({ rows: all('SELECT up.*, u.name AS owner FROM uploads up JOIN users u ON u.id = up.owner_id WHERE up.status = ? ORDER BY up.id DESC LIMIT 200', status).map(x => ({ id: x.id, kind: x.kind, creatorId: x.creator_id, owner: x.owner, mime: x.mime, type: x.mime.startsWith('video/') ? 'video' : 'image', url: S.uploadUrl(x), size: x.size, caption: x.caption, status: x.status, reason: x.reject_reason, at: x.created_at })) });
});
r.post('/uploads/:id', (req, res) => {
  const u = get('SELECT * FROM uploads WHERE id = ?', Number(req.params.id)); if (!u) throw new HttpError(404, 'not_found', 'Upload not found');
  if (req.body.delete === true) {
    tx(() => { run('UPDATE creators SET avatar_upload_id = NULL WHERE avatar_upload_id = ?', u.id); run('UPDATE creators SET cover_upload_id = NULL WHERE cover_upload_id = ?', u.id); run('UPDATE users SET avatar_upload_id = NULL WHERE avatar_upload_id = ?', u.id); run('UPDATE products SET upload_id = NULL WHERE upload_id = ?', u.id); run('DELETE FROM uploads WHERE id = ?', u.id); });
    U.deleteUploadFile(u); audit(req.user.id, 'upload.delete', u.id, {}); return res.json({ ok: true });
  }
  const status = oneOf(req.body.status, 'status', ['approved', 'rejected']);
  run('UPDATE uploads SET status = ?, reviewed_by = ?, reject_reason = ? WHERE id = ?', status, req.user.id, status === 'rejected' ? str(req.body.reason || 'Does not meet content guidelines', 'reason', 1, 200) : null, u.id);
  audit(req.user.id, 'upload.' + status, u.id, { reason: req.body.reason });
  res.json({ ok: true });
});

/* ---------- payouts ---------- */
r.get('/payouts', (req, res) => {
  const status = ['pending', 'approved', 'paid', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  res.json({ rows: all(`SELECT p.*, c.name AS creator, u.name AS agent FROM payouts p LEFT JOIN creators c ON c.id = p.creator_id LEFT JOIN users u ON u.id = p.agent_id WHERE p.status = ? ORDER BY p.id DESC LIMIT 200`, status) });
});
r.post('/payouts/:id', (req, res) => {
  const p = get('SELECT * FROM payouts WHERE id = ?', Number(req.params.id)); if (!p) throw new HttpError(404, 'not_found', 'Payout not found');
  const status = oneOf(req.body.status, 'status', ['approved', 'paid', 'rejected']);
  if (p.status === 'paid' || p.status === 'rejected') throw bad('Payout already closed');
  tx(() => {
    run('UPDATE payouts SET status = ?, note = ?, decided_at = ?, decided_by = ? WHERE id = ?', status, str(req.body.note || '', 'note', 0, 300), Date.now(), req.user.id, p.id);
    if (status === 'rejected' && p.creator_id) run('UPDATE creators SET beans = beans + ? WHERE id = ?', p.beans, p.creator_id);
    audit(req.user.id, 'payout.' + status, p.id, { beans: p.beans, usd: p.usd });
  });
  res.json({ ok: true });
});

/* ---------- reports ---------- */
r.get('/reports', (req, res) => {
  const status = ['open', 'resolved', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
  res.json({ rows: all('SELECT r.*, u.name AS reporter FROM reports r LEFT JOIN users u ON u.id = r.reporter_id WHERE r.status = ? ORDER BY r.id DESC LIMIT 200', status) });
});
r.post('/reports/:id', (req, res) => {
  run('UPDATE reports SET status = ?, decided_by = ? WHERE id = ?', oneOf(req.body.status, 'status', ['resolved', 'dismissed']), req.user.id, Number(req.params.id));
  audit(req.user.id, 'report.' + req.body.status, req.params.id, {});
  res.json({ ok: true });
});

/* ---------- economy config ---------- */
r.get('/config', (_req, res) => res.json({ overrides: S.econOverrides(), effective: S.econConfig(), defaults: S.E.DEFAULT_CONFIG }));
r.put('/config', (req, res) => {
  const overrides = req.body && typeof req.body.overrides === 'object' && !Array.isArray(req.body.overrides) ? req.body.overrides : null;
  if (!overrides) throw bad('Send { overrides: {...} }');
  const eff = S.setEconOverrides(overrides);
  audit(req.user.id, 'config.update', 'economy', { keys: Object.keys(overrides) });
  res.json({ effective: eff });
});

/* ---------- affiliate traffic ---------- */
r.get('/traffic', (req, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query.days) || 14)), since = Date.now() - days * DAY;
  const daily = all('SELECT CAST((created_at - ?) / ? AS INTEGER) AS d, COUNT(*) AS v FROM clicks WHERE created_at > ? GROUP BY d', since, DAY, since);
  res.json({
    days, total: sum('SELECT COUNT(*) AS v FROM clicks WHERE created_at > ?', since), unique: sum('SELECT COUNT(DISTINCT ip_hash) AS v FROM clicks WHERE created_at > ?', since),
    series: Array.from({ length: days }, (_, i) => (daily.find(x => x.d === i) || {}).v || 0),
    bySite: all('SELECT site, COUNT(*) AS clicks FROM clicks WHERE created_at > ? GROUP BY site ORDER BY clicks DESC', since),
    byCreator: all('SELECT c.name, k.creator_id, COUNT(*) AS clicks FROM clicks k LEFT JOIN creators c ON c.id = k.creator_id WHERE k.created_at > ? GROUP BY k.creator_id ORDER BY clicks DESC LIMIT 20', since),
    byCampaign: all("SELECT CASE WHEN campaign = '' THEN '(none)' ELSE campaign END AS campaign, CASE WHEN source = '' THEN '(direct)' ELSE source END AS source, COUNT(*) AS clicks FROM clicks WHERE created_at > ? GROUP BY campaign, source ORDER BY clicks DESC LIMIT 30", since)
  });
});

/* ---------- ledger + audit ---------- */
r.get('/ledger', (_req, res) => {
  res.json({
    gifts: all('SELECT g.*, u.name AS fan, c.name AS creator FROM gifts g JOIN users u ON u.id = g.from_user JOIN creators c ON c.id = g.creator_id ORDER BY g.id DESC LIMIT 150'),
    orders: all('SELECT o.*, u.name AS fan FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 150')
  });
});
r.get('/audit', (_req, res) => res.json({ rows: all('SELECT a.*, u.name AS actor FROM audit a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 300').map(x => ({ ...x, data: J(x.data, {}) })) }));

module.exports = r;
