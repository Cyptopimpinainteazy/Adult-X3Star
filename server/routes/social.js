'use strict';
/* Families (fan clans + weekly family wars), PK state, and the agency program. */
const express = require('express');
const { all, get, run, tx } = require('../db');
const A = require('../auth');
const S = require('../services');
const hub = require('../ws');
const { HttpError, bad, str } = require('./common');

const r = express.Router();
const WEEK = () => { const c = S.econConfig(), now = Date.now(); const dayStart = S.E.dayKey(now, c); const wk = S.E.weekId(now, c); return (wk * 7 - 3) * 86400000 - (c.dayOffsetMinutes || 0) * 60000; };

function familyOut(f, withMembers) {
  const c = S.econConfig(), since = WEEK();
  const week = (get('SELECT COALESCE(SUM(family_points),0) AS p FROM gifts WHERE family_id = ? AND created_at > ?', f.id, since) || {}).p || 0;
  const members = (get('SELECT COUNT(*) AS n FROM users WHERE family_id = ?', f.id) || {}).n || 0;
  const owner = get('SELECT name FROM users WHERE id = ?', f.owner_id);
  const out = { id: f.id, name: f.name, tag: f.tag, motto: f.motto, owner: owner ? owner.name : null, members, maxMembers: c.families.maxMembers, xp: f.xp, level: S.E.familyLevel(f.xp, c), weekPoints: week };
  if (withMembers) out.roster = all(`SELECT u.name, COALESCE(SUM(CASE WHEN g.created_at > ? THEN g.family_points END),0) AS week, COALESCE(SUM(g.family_points),0) AS total
    FROM users u LEFT JOIN gifts g ON g.from_user = u.id AND g.family_id = u.family_id WHERE u.family_id = ? GROUP BY u.id ORDER BY week DESC, total DESC`, since, f.id);
  return out;
}

r.get('/pk', (_req, res) => res.json({ pk: hub.pkPublic() }));
r.get('/war', (_req, res) => res.json({ war: S.E.warStatus(S.econConfig(), Date.now()) }));

r.get('/families', (_req, res) => {
  const list = all('SELECT * FROM families').map(f => familyOut(f, false)).sort((a, b) => b.weekPoints - a.weekPoints || b.xp - a.xp);
  res.json({ families: list, war: S.E.warStatus(S.econConfig(), Date.now()) });
});
r.get('/families/:id', (req, res) => {
  const f = get('SELECT * FROM families WHERE id = ?', Number(req.params.id)); if (!f) throw new HttpError(404, 'not_found', 'Family not found');
  res.json({ family: familyOut(f, true) });
});
r.post('/families', A.requireUser, (req, res) => {
  if (req.user.family_id) throw bad('Leave your current family first');
  const name = str(req.body.name, 'Family name', 3, 24), tag = str(req.body.tag, 'Tag', 2, 5).toUpperCase(), motto = str(req.body.motto || '', 'Motto', 0, 80);
  if (!/^[A-Z0-9]{2,5}$/.test(tag)) throw bad('Tag must be 2–5 letters or numbers');
  if (get('SELECT 1 FROM families WHERE name = ? OR tag = ?', name, tag)) throw new HttpError(409, 'taken', 'That family name or tag is taken');
  const c = S.econConfig();
  const out = tx(() => {
    const o = S.withEcon(req.user.id, 'family_create', (s) => { if (s.diamonds < c.families.createCost) throw new S.E.EconError('insufficient', `Creating a family costs ${c.families.createCost} 💎`); s.diamonds -= c.families.createCost; return { cost: c.families.createCost }; });
    const info = run('INSERT INTO families (name, tag, motto, owner_id, created_at) VALUES (?,?,?,?,?)', name, tag, motto, req.user.id, Date.now());
    run('UPDATE users SET family_id = ? WHERE id = ?', Number(info.lastInsertRowid), req.user.id);
    return { ...o, id: Number(info.lastInsertRowid) };
  });
  res.status(201).json({ family: familyOut(get('SELECT * FROM families WHERE id = ?', out.id), true), econ: out.summary });
});
r.post('/families/:id/join', A.requireUser, (req, res) => {
  if (req.user.family_id) throw bad('Leave your current family first');
  const f = get('SELECT * FROM families WHERE id = ?', Number(req.params.id)); if (!f) throw new HttpError(404, 'not_found', 'Family not found');
  const n = (get('SELECT COUNT(*) AS n FROM users WHERE family_id = ?', f.id) || {}).n;
  if (n >= S.econConfig().families.maxMembers) throw bad('This family is full');
  run('UPDATE users SET family_id = ? WHERE id = ?', f.id, req.user.id);
  res.json({ family: familyOut(f, true) });
});
r.post('/families/leave', A.requireUser, (req, res) => {
  const f = req.user.family_id ? get('SELECT * FROM families WHERE id = ?', req.user.family_id) : null;
  if (!f) throw bad('You are not in a family');
  tx(() => {
    run('UPDATE users SET family_id = NULL WHERE id = ?', req.user.id);
    if (f.owner_id === req.user.id) {
      const heir = get('SELECT id FROM users WHERE family_id = ? ORDER BY last_seen DESC LIMIT 1', f.id);
      if (heir) run('UPDATE families SET owner_id = ? WHERE id = ?', heir.id, f.id); else run('DELETE FROM families WHERE id = ?', f.id);
    }
  });
  res.json({ ok: true });
});

/* ---------- agency program ---------- */
r.get('/agency', A.requireRole('agent'), (req, res) => {
  const c = S.econConfig(), since30 = Date.now() - 30 * 86400000;
  const hosts = all(`SELECT cr.id, cr.name, cr.live, cr.kyc, cr.beans_total,
      COALESCE((SELECT SUM(g.beans) FROM gifts g WHERE g.creator_id = cr.id AND g.created_at > ?),0) AS beans30d,
      COALESCE((SELECT SUM(e.beans) FROM agent_earnings e WHERE e.creator_id = cr.id AND e.agent_id = ?),0) AS commission
    FROM creators cr JOIN users u ON u.id = cr.user_id WHERE u.agent_id = ? ORDER BY beans30d DESC`, since30, req.user.id, req.user.id);
  const earned = (get('SELECT COALESCE(SUM(beans),0) AS b FROM agent_earnings WHERE agent_id = ?', req.user.id) || {}).b || 0;
  const paid = (get("SELECT COALESCE(SUM(beans),0) AS b FROM payouts WHERE agent_id = ? AND status != 'rejected'", req.user.id) || {}).b || 0;
  res.json({ code: req.user.ref_code, commissionPct: c.agencyCommissionPct, hosts, earnedBeans: earned, availableBeans: earned - paid, beanUsd: c.beanUsd, minPayoutBeans: c.minPayoutBeans });
});
r.post('/agency/payout', A.requireRole('agent'), (req, res) => {
  const c = S.econConfig(), method = str(req.body.method, 'Payout method', 2, 120);
  const out = tx(() => {
    const earned = (get('SELECT COALESCE(SUM(beans),0) AS b FROM agent_earnings WHERE agent_id = ?', req.user.id) || {}).b || 0;
    const paid = (get("SELECT COALESCE(SUM(beans),0) AS b FROM payouts WHERE agent_id = ? AND status != 'rejected'", req.user.id) || {}).b || 0;
    const q = S.E.payoutQuote(earned - paid, req.body.beans, c);
    run('INSERT INTO payouts (agent_id, beans, usd, method, created_at) VALUES (?,?,?,?,?)', req.user.id, q.beans, q.usd, method, Date.now());
    return q;
  });
  res.status(201).json({ result: out });
});

module.exports = r;
