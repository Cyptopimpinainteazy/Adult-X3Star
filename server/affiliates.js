'use strict';
/*
 * Affiliate partner registry + rankings.
 *
 * partners  — every network/store you promote (cam networks, shops), its status, payout plan and dashboard.
 * links     — partner links you place on the site (footer, apply page, ad rotation). Clicks go through /go/a/<id>.
 * stats     — what the partner reports back per day (sign-ups, spenders/orders, sales, your earnings), entered by
 *             hand or imported from the partner's CSV export. Clicks come from x3STAR's own click log.
 */
const { all, get, run, tx } = require('./db');

const STATUSES = ['active', 'pending', 'paused', 'rejected'];
const KINDS = ['cam', 'shop', 'other'];
const PAYOUTS = ['revshare', 'per_join', 'per_spender', 'hybrid_join', 'hybrid_spender', 'commission', 'flat', 'unknown'];
const SLOTS = ['footer', 'apply', 'ad:728x90', 'ad:300x600', 'ad:970x250', 'none'];
const ID_RE = /^[A-Z0-9]{2,8}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/* Built-in partners. CB/BC link generation lives in shared/partners.js and the BongaCams feed; here they get a
   status, payout plan and dashboard so they rank alongside everything else. */
const DEFAULTS = [
  { id: 'CB', name: 'Chaturbate', kind: 'cam', status: 'active', website: 'https://chaturbate.com', dashboard_url: 'https://chaturbate.com/affiliates/', affiliate_id: 'Ji03i', payout: 'revshare', revshare_pct: 20, per_join_usd: 0, per_spender_usd: 0, program: 'Revshare: 20% of money spent + $50 per broadcaster + 5% referred affiliate income', notes: 'Campaign Ji03i, room cock_da_hammer. Links and placements: Admin → Partners.', builtin: 1 },
  { id: 'BC', name: 'BongaCams', kind: 'cam', status: 'active', website: 'https://bongacams.com', dashboard_url: 'https://bongacash.com', affiliate_id: '846478', payout: 'unknown', revshare_pct: 0, per_join_usd: 0, per_spender_usd: 0, program: '', notes: 'Video export feed + "Also live on BongaCams" links. Set the payout plan you chose in BongaCash.', builtin: 1 },
  { id: 'SM', name: 'Streamate (CamBuilder)', kind: 'cam', status: 'pending', website: 'https://www.cambuilder.com', dashboard_url: 'https://www.cambuilder.com', affiliate_id: '', payout: 'hybrid_join', revshare_pct: 30, per_join_usd: 30, per_spender_usd: 0, program: '$30 per join + 30% lifetime revenue share', notes: 'Waiting for approval. Add link codes once approved.', builtin: 0 },
  { id: 'SD', name: 'Sex doll store (GoAffPro)', kind: 'shop', status: 'pending', website: '', dashboard_url: 'https://sexdollpartner.goaffpro.com/products', affiliate_id: '', payout: 'commission', revshare_pct: 0, per_join_usd: 0, per_spender_usd: 0, program: '', notes: 'Paste your referral link and commission rate from the GoAffPro portal.', builtin: 0 }
];

function ensureDefaults() {
  const now = Date.now();
  for (const p of DEFAULTS) {
    if (get('SELECT id FROM affiliate_partners WHERE id = ?', p.id)) continue;
    run(`INSERT INTO affiliate_partners (id, name, kind, status, website, dashboard_url, affiliate_id, payout, revshare_pct, per_join_usd, per_spender_usd, program, notes, builtin, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, p.id, p.name, p.kind, p.status, p.website, p.dashboard_url, p.affiliate_id, p.payout, p.revshare_pct, p.per_join_usd, p.per_spender_usd, p.program, p.notes, p.builtin, now, now);
  }
}

const partnerById = (id) => get('SELECT * FROM affiliate_partners WHERE id = ?', id);
/** Is a partner allowed to show links? Unknown partners (not in the registry) are allowed, for backward compatibility. */
function isLive(id) { const p = partnerById(id); return !p || p.status === 'active'; }

/** Fill a link template's {placement} {source} {campaign} placeholders (URL-encoded). */
function fillLink(url, { placement = '', source = '', campaign = '' }) {
  return url.replace(/\{placement\}/g, encodeURIComponent(placement)).replace(/\{source\}/g, encodeURIComponent(source || 'x3s')).replace(/\{campaign\}/g, encodeURIComponent(campaign || 'x3star'));
}

/** Links the fan app renders, from active partners only: key -> { slot, label, sub, site, href }. */
function sitePlacements() {
  const out = {};
  for (const l of all(`SELECT l.*, p.name AS pname, p.kind AS pkind FROM affiliate_links l JOIN affiliate_partners p ON p.id = l.partner_id
                       WHERE l.active = 1 AND p.status = 'active' AND l.slot != 'none' ORDER BY l.sort, l.id`)) {
    out['a' + l.id] = { slot: l.slot, label: l.label, sub: l.sub || l.pname, site: l.partner_id, siteName: l.pname, kind: l.pkind, href: `/go/a/${l.id}` };
  }
  return out;
}

const DAY = 864e5;
const dayStr = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Rank partners over the last `days` days.
 * Clicks: x3STAR's click log (site = partner id). Everything else: partner-reported daily stats.
 */
function rankings(days) {
  const now = Date.now(), since = now - days * DAY, sinceDay = dayStr(since + DAY);
  const partners = all('SELECT * FROM affiliate_partners ORDER BY name');
  const clicks = Object.fromEntries(all('SELECT site, COUNT(*) AS clicks, COUNT(DISTINCT ip_hash) AS uniq FROM clicks WHERE created_at > ? GROUP BY site', since).map(r => [r.site, r]));
  const stats = Object.fromEntries(all('SELECT partner_id, SUM(joins) AS joins, SUM(conversions) AS conversions, SUM(sales_usd) AS sales, SUM(earnings_usd) AS earnings, COUNT(*) AS days FROM affiliate_stats WHERE day >= ? GROUP BY partner_id', sinceDay).map(r => [r.partner_id, r]));
  const start = Math.floor(since / DAY) + 1;
  const series = {};
  for (const r of all('SELECT site, CAST(created_at / ? AS INTEGER) AS d, COUNT(*) AS v FROM clicks WHERE created_at > ? GROUP BY site, d', DAY, since)) {
    const i = r.d - start; if (i < 0 || i >= days) continue;
    (series[r.site] = series[r.site] || { clicks: Array(days).fill(0), earnings: Array(days).fill(0) }).clicks[i] += r.v;
  }
  for (const r of all('SELECT partner_id, day, earnings_usd FROM affiliate_stats WHERE day >= ?', sinceDay)) {
    const i = Math.floor(Date.parse(r.day + 'T00:00:00Z') / DAY) - start;
    if (i >= 0 && i < days) (series[r.partner_id] = series[r.partner_id] || { clicks: Array(days).fill(0), earnings: Array(days).fill(0) }).earnings[i] += r.earnings_usd;
  }
  const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
  const rows = partners.map(p => {
    const c = clicks[p.id] || { clicks: 0, uniq: 0 }, s = stats[p.id] || { joins: 0, conversions: 0, sales: 0, earnings: 0, days: 0 };
    return {
      id: p.id, name: p.name, kind: p.kind, status: p.status, payout: p.payout, program: p.program, dashboardUrl: p.dashboard_url,
      clicks: c.clicks, unique: c.uniq, joins: s.joins || 0, conversions: s.conversions || 0, sales: round(s.sales || 0), earnings: round(s.earnings || 0), reportedDays: s.days,
      epc: c.clicks ? round((s.earnings || 0) / c.clicks, 3) : 0,
      joinRate: c.clicks ? round((s.joins || 0) / c.clicks * 100, 2) : 0,
      perJoin: s.joins ? round(s.earnings / s.joins) : 0,
      perConversion: s.conversions ? round(s.earnings / s.conversions) : 0,
      series: series[p.id] || { clicks: Array(days).fill(0), earnings: Array(days).fill(0) }
    };
  });
  rows.sort((a, b) => b.earnings - a.earnings || b.epc - a.epc || b.clicks - a.clicks);
  rows.forEach((r, i) => { r.rank = i + 1; });
  const tot = rows.reduce((t, r) => ({ clicks: t.clicks + r.clicks, joins: t.joins + r.joins, conversions: t.conversions + r.conversions, sales: t.sales + r.sales, earnings: t.earnings + r.earnings }), { clicks: 0, joins: 0, conversions: 0, sales: 0, earnings: 0 });
  tot.earnings = round(tot.earnings); tot.sales = round(tot.sales); tot.epc = tot.clicks ? round(tot.earnings / tot.clicks, 3) : 0;
  return { days, since: sinceDay, totals: tot, partners: rows };
}

/** Parse a CSV of daily stats. Header row required; columns matched by name. Returns [{ day, joins, conversions, sales, earnings }]. */
function parseStatsCsv(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) throw Object.assign(new Error('CSV needs a header row and at least one data row'), { status: 400, code: 'bad_input' });
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if ((ch === ',' || ch === ';' || ch === '\t') && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); };
  const head = split(lines[0]).map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
  const col = (...names) => head.findIndex(h => names.includes(h));
  const iDay = col('date', 'day'), iJ = col('joins', 'signups', 'registrations', 'regs', 'freejoins'), iC = col('spenders', 'conversions', 'orders', 'purchases', 'buyers', 'transactions');
  const iS = col('revenue', 'sales', 'salesusd', 'amount', 'gross', 'ordertotal', 'spend', 'total'), iE = col('earnings', 'commission', 'payout', 'income', 'profit');
  if (iDay < 0 || iE < 0) throw Object.assign(new Error('CSV needs at least a "date" and an "earnings" (or commission/payout) column'), { status: 400, code: 'bad_input' });
  const num = (s) => { const n = Number(String(s || '0').replace(/[$,\s]/g, '')); return Number.isFinite(n) && n >= 0 ? n : NaN; };
  return lines.slice(1).map((l, i) => {
    const c = split(l), d = c[iDay];
    const day = DAY_RE.test(d) ? d : (() => { const t = Date.parse(d); return Number.isFinite(t) ? dayStr(t) : ''; })();
    const row = { day, joins: iJ >= 0 ? num(c[iJ]) : 0, conversions: iC >= 0 && iC !== iS ? num(c[iC]) : 0, sales: iS >= 0 ? num(c[iS]) : 0, earnings: num(c[iE]) };
    if (!row.day || [row.joins, row.conversions, row.sales, row.earnings].some(n => Number.isNaN(n))) throw Object.assign(new Error(`CSV row ${i + 2} has a bad date or number`), { status: 400, code: 'bad_input' });
    row.joins = Math.round(row.joins); row.conversions = Math.round(row.conversions);
    return row;
  });
}

function upsertStat(partnerId, r, source) {
  run(`INSERT INTO affiliate_stats (partner_id, day, joins, conversions, sales_usd, earnings_usd, source, updated_at) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(partner_id, day) DO UPDATE SET joins=excluded.joins, conversions=excluded.conversions, sales_usd=excluded.sales_usd, earnings_usd=excluded.earnings_usd, source=excluded.source, updated_at=excluded.updated_at`,
    partnerId, r.day, r.joins, r.conversions, r.sales, r.earnings, source, Date.now());
}
const importStats = (partnerId, rows, source) => tx(() => { rows.forEach(r => upsertStat(partnerId, r, source)); return rows.length; });

module.exports = { STATUSES, KINDS, PAYOUTS, SLOTS, ID_RE, DAY_RE, ensureDefaults, partnerById, isLive, fillLink, sitePlacements, rankings, parseStatsCsv, upsertStat, importStats };
