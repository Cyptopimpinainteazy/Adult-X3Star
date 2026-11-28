'use strict';
/* Admin: overview KPIs, applications, users, creators, moderation, payouts, reports, economy config, ledger, audit. */
const express = require('express');
const crypto = require('node:crypto');
const { all, get, run, tx, J, audit } = require('../db');
const A = require('../auth');
const S = require('../services');
const U = require('../uploads');
const { HttpError, bad, str, intIn, numIn, oneOf } = require('./common');
const AF = require('../affiliates');

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
/* partner (Chaturbate) catalog + resolved preview URLs for every placement */
r.get('/partners', (_req, res) => {
  const pc = S.econConfig().partners, P = S.P;
  const placements = Object.entries(pc.placements || {}).map(([key, p]) => {
    const built = P.cbUrl(pc, { tour: p.tour, room: P.TOURS[p.tour] && P.TOURS[p.tour].room ? (p.room || pc.CB.houseRoom) : '', placement: key, source: 'x3s' });
    return { key, ...p, url: built ? built.url : null, usedTour: built ? built.tour : null };
  });
  const sample = P.roomUrl(pc, pc.CB.houseRoom || 'example_room', { source: 'x3s', creator: 'sample' });
  res.json({ config: pc.CB, placements, roomSample: sample ? sample.url : null,
    tours: Object.entries(P.TOURS).map(([key, t]) => ({ key, label: t.label, room: !!t.room })),
    programs: Object.fromEntries(Object.entries(P.PROGRAMS).map(([k, v]) => [k, { label: v.label, terms: v.terms, tours: Object.keys(v.tours) }])) });
});
/* ---------- affiliate registry, links, stats, rankings ---------- */
const httpsOrEmpty = (v, name) => { const s = str(v, name, 0, 500); if (s && !/^https:\/\/[^\s]+$/.test(s)) throw bad(`${name} must start with https://`); return s; };
function partnerBody(b, cur) {
  const v = (k, d) => (b[k] !== undefined ? b[k] : cur ? cur[k] : d);
  return {
    name: str(v('name', ''), 'Name', 2, 60), kind: oneOf(v('kind', 'cam'), 'Kind', AF.KINDS), status: oneOf(v('status', 'pending'), 'Status', AF.STATUSES),
    website: httpsOrEmpty(v('website', ''), 'Website'), dashboard_url: httpsOrEmpty(v('dashboard_url', ''), 'Dashboard URL'),
    affiliate_id: str(v('affiliate_id', ''), 'Affiliate ID', 0, 80), payout: oneOf(v('payout', 'unknown'), 'Payout plan', AF.PAYOUTS),
    revshare_pct: numIn(v('revshare_pct', 0), 'Revenue share %', 0, 100), per_join_usd: numIn(v('per_join_usd', 0), 'Per join $', 0, 10000), per_spender_usd: numIn(v('per_spender_usd', 0), 'Per spender $', 0, 10000),
    program: str(v('program', ''), 'Program', 0, 300), notes: str(v('notes', ''), 'Notes', 0, 2000)
  };
}
function linkBody(b, cur) {
  const v = (k, d) => (b[k] !== undefined ? b[k] : cur ? cur[k] : d);
  const url = str(v('url', ''), 'Link URL', 10, 1000);
  if (!/^https:\/\/[^\s]+$/.test(url)) throw bad('Link URL must start with https://');
  return { label: str(v('label', ''), 'Link text', 2, 120), sub: str(v('sub', ''), 'Subtitle', 0, 120), url, slot: oneOf(v('slot', 'footer'), 'Placement', AF.SLOTS), active: v('active', 1) ? 1 : 0, sort: intIn(v('sort', 0), 'Order', -1000, 1000) };
}
const loadPartner = (id) => { const p = AF.partnerById(String(id).toUpperCase()); if (!p) throw new HttpError(404, 'not_found', 'No such partner'); return p; };

r.get('/affiliates/rankings', (req, res) => res.json(AF.rankings(intIn(req.query.days || 30, 'days', 1, 365))));
r.get('/affiliates', (_req, res) => {
  const links = all('SELECT * FROM affiliate_links ORDER BY sort, id');
  const clicks = Object.fromEntries(all("SELECT placement, COUNT(*) AS n FROM clicks WHERE placement LIKE 'a%' AND created_at > ? GROUP BY placement", Date.now() - 30 * 864e5).map(x => [x.placement, x.n]));
  res.json({ statuses: AF.STATUSES, kinds: AF.KINDS, payouts: AF.PAYOUTS, slots: AF.SLOTS,
    partners: all('SELECT * FROM affiliate_partners ORDER BY name').map(p => ({ ...p, builtin: !!p.builtin, links: links.filter(l => l.partner_id === p.id).map(l => ({ ...l, active: !!l.active, clicks30d: clicks['a' + l.id] || 0, href: `/go/a/${l.id}` })) })) });
});
r.post('/affiliates', (req, res) => {
  const b = req.body || {}, id = String(b.id || '').trim().toUpperCase();
  if (!AF.ID_RE.test(id)) throw bad('Code must be 2–8 capital letters or digits, e.g. SM or DOLLS');
  if (AF.partnerById(id)) throw bad(`A partner with code ${id} already exists`);
  const p = partnerBody(b), now = Date.now();
  run(`INSERT INTO affiliate_partners (id, name, kind, status, website, dashboard_url, affiliate_id, payout, revshare_pct, per_join_usd, per_spender_usd, program, notes, builtin, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
    id, p.name, p.kind, p.status, p.website, p.dashboard_url, p.affiliate_id, p.payout, p.revshare_pct, p.per_join_usd, p.per_spender_usd, p.program, p.notes, now, now);
  audit(req.user.id, 'affiliate.create', id, { name: p.name, status: p.status });
  res.json({ partner: AF.partnerById(id) });
});
r.put('/affiliates/:id', (req, res) => {
  const cur = loadPartner(req.params.id), p = partnerBody(req.body || {}, cur);
  run('UPDATE affiliate_partners SET name=?, kind=?, status=?, website=?, dashboard_url=?, affiliate_id=?, payout=?, revshare_pct=?, per_join_usd=?, per_spender_usd=?, program=?, notes=?, updated_at=? WHERE id=?',
    p.name, p.kind, p.status, p.website, p.dashboard_url, p.affiliate_id, p.payout, p.revshare_pct, p.per_join_usd, p.per_spender_usd, p.program, p.notes, Date.now(), cur.id);
  audit(req.user.id, 'affiliate.update', cur.id, { status: p.status, statusBefore: cur.status });
  res.json({ partner: AF.partnerById(cur.id) });
});
r.delete('/affiliates/:id', (req, res) => {
  const cur = loadPartner(req.params.id);
  if (cur.builtin) throw bad(`${cur.name} is built in; pause it instead`);
  run('DELETE FROM affiliate_partners WHERE id = ?', cur.id);
  audit(req.user.id, 'affiliate.delete', cur.id, { name: cur.name });
  res.json({ ok: true });
});
r.post('/affiliates/:id/links', (req, res) => {
  const p = loadPartner(req.params.id), l = linkBody(req.body || {});
  const info = run('INSERT INTO affiliate_links (partner_id, label, sub, url, slot, active, sort, created_at) VALUES (?,?,?,?,?,?,?,?)', p.id, l.label, l.sub, l.url, l.slot, l.active, l.sort, Date.now());
  audit(req.user.id, 'affiliate.link.create', p.id, { label: l.label, slot: l.slot });
  res.json({ link: get('SELECT * FROM affiliate_links WHERE id = ?', Number(info.lastInsertRowid)) });
});
r.put('/affiliates/links/:linkId', (req, res) => {
  const cur = get('SELECT * FROM affiliate_links WHERE id = ?', Number(req.params.linkId)); if (!cur) throw new HttpError(404, 'not_found', 'No such link');
  const l = linkBody(req.body || {}, cur);
  run('UPDATE affiliate_links SET label=?, sub=?, url=?, slot=?, active=?, sort=? WHERE id=?', l.label, l.sub, l.url, l.slot, l.active, l.sort, cur.id);
  audit(req.user.id, 'affiliate.link.update', cur.partner_id, { id: cur.id });
  res.json({ link: get('SELECT * FROM affiliate_links WHERE id = ?', cur.id) });
});
r.delete('/affiliates/links/:linkId', (req, res) => {
  const cur = get('SELECT * FROM affiliate_links WHERE id = ?', Number(req.params.linkId)); if (!cur) throw new HttpError(404, 'not_found', 'No such link');
  run('DELETE FROM affiliate_links WHERE id = ?', cur.id);
  audit(req.user.id, 'affiliate.link.delete', cur.partner_id, { id: cur.id, label: cur.label });
  res.json({ ok: true });
});
r.get('/affiliates/:id/stats', (req, res) => {
  const p = loadPartner(req.params.id);
  res.json({ rows: all('SELECT day, joins, conversions, sales_usd AS sales, earnings_usd AS earnings, source FROM affiliate_stats WHERE partner_id = ? ORDER BY day DESC LIMIT 400', p.id) });
});
r.put('/affiliates/:id/stats/:day', (req, res) => {
  const p = loadPartner(req.params.id), day = String(req.params.day), b = req.body || {};
  if (!AF.DAY_RE.test(day) || !Number.isFinite(Date.parse(day + 'T00:00:00Z'))) throw bad('Day must be YYYY-MM-DD');
  if (Date.parse(day + 'T00:00:00Z') > Date.now() + 864e5) throw bad('Day cannot be in the future');
  AF.upsertStat(p.id, { day, joins: intIn(b.joins || 0, 'Sign-ups', 0, 1e7), conversions: intIn(b.conversions || 0, 'Spenders/orders', 0, 1e7), sales: numIn(b.sales || 0, 'Sales $', 0, 1e9), earnings: numIn(b.earnings || 0, 'Earnings $', 0, 1e9) }, 'manual');
  audit(req.user.id, 'affiliate.stats', p.id, { day });
  res.json({ ok: true });
});
r.delete('/affiliates/:id/stats/:day', (req, res) => {
  const p = loadPartner(req.params.id);
  run('DELETE FROM affiliate_stats WHERE partner_id = ? AND day = ?', p.id, String(req.params.day));
  res.json({ ok: true });
});
r.post('/affiliates/:id/stats/import', (req, res) => {
  const p = loadPartner(req.params.id);
  const text = req.body && typeof req.body.csv === 'string' ? req.body.csv : '';
  const rows = AF.parseStatsCsv(text);
  if (rows.length > 3660) throw bad('At most 3660 rows per import');
  const n = AF.importStats(p.id, rows, 'csv');
  audit(req.user.id, 'affiliate.stats.import', p.id, { rows: n });
  res.json({ imported: n });
});

/* ---------- partner video feed (BongaCams export) ---------- */
r.get('/partner-videos', (_req, res) => {
  const F = require('../feeds');
  const since = Date.now() - 30 * 864e5;
  const clicks = Object.fromEntries(all("SELECT substr(creator_id, 3) AS id, COUNT(*) AS n FROM clicks WHERE creator_id LIKE 'v:%' AND created_at > ? GROUP BY creator_id", since).map(x => [x.id, x.n]));
  const rows = all('SELECT * FROM partner_videos ORDER BY id DESC');
  res.json({ total: rows.length, hidden: rows.filter(r => r.hidden).length, videos: rows.map(r => ({ ...F.publicVideo(r), hidden: !!r.hidden, source: r.source, url: r.url, clicks30d: clicks[r.id] || 0 })) });
});
r.post('/partner-videos/import', (req, res) => {
  const F = require('../feeds');
  const text = req.body && typeof req.body.text === 'string' ? req.body.text : '';
  if (!text.trim()) throw bad('Send { text: "<feed file contents>" }');
  const name = String((req.body && req.body.name) || 'upload').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 80) || 'upload';
  const { videos, skipped } = F.parseBongaFeed(text);
  if (!videos.length) throw bad(skipped.length ? `No usable videos: ${skipped[0].reason}` : 'No videos found. Expected the BongaCams video export format (id|thumbnails|link|title|).');
  const r = F.importVideos(videos, name);
  audit(req.user.id, 'partner_videos.import', name, { ...r, skipped: skipped.length });
  res.json({ ...r, skipped });
});
r.patch('/partner-videos/:id', (req, res) => {
  const v = get('SELECT id FROM partner_videos WHERE id = ?', String(req.params.id));
  if (!v) throw new HttpError(404, 'not_found', 'No such video');
  if (typeof (req.body || {}).hidden !== 'boolean') throw bad('Send { hidden: true|false }');
  run('UPDATE partner_videos SET hidden = ?, updated_at = ? WHERE id = ?', req.body.hidden ? 1 : 0, Date.now(), v.id);
  audit(req.user.id, req.body.hidden ? 'partner_videos.hide' : 'partner_videos.show', v.id, {});
  res.json({ ok: true });
});
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
    byCreator: all('SELECT c.name, k.creator_id, COUNT(*) AS clicks FROM clicks k LEFT JOIN creators c ON c.id = k.creator_id WHERE k.created_at > ? AND length(k.creator_id) > 0 AND instr(k.creator_id, ?) = 0 GROUP BY k.creator_id ORDER BY clicks DESC LIMIT 20', since, ':'),
    byVideo: all("SELECT substr(k.creator_id, 3) AS id, v.performer, v.title, COUNT(*) AS clicks FROM clicks k LEFT JOIN partner_videos v ON v.id = substr(k.creator_id, 3) WHERE k.created_at > ? AND k.creator_id LIKE 'v:%' GROUP BY k.creator_id ORDER BY clicks DESC LIMIT 20", since),
    byPlacement: all("SELECT CASE WHEN placement = '' THEN 'room' ELSE placement END AS placement, COUNT(*) AS clicks FROM clicks WHERE created_at > ? GROUP BY 1 ORDER BY clicks DESC", since),
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
