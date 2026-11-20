/* x3STAR Admin dashboard */
(() => {
'use strict';
const { $, $$, el, esc, fmt, toast, modal, confirmBox, promptBox, bars, guard, router } = window.Dash;
const app = $('#app');
let me = null, Q = {};

function gate(msg) {
  app.innerHTML = `<div class="gate"><form class="panel gate-card" id="lg"><span class="eyebrow">x3STAR</span><h1>Admin</h1>${msg ? `<p class="mute" style="margin:-6px 0 16px">${esc(msg)}</p>` : ''}
    <label class="field"><span>Email</span><input class="inp" name="email" type="email" autocomplete="email" required></label>
    <label class="field" style="margin-top:12px"><span>Password</span><input class="inp" name="password" type="password" autocomplete="current-password" required></label>
    <p class="note" id="lgErr" style="color:var(--red);min-height:18px"></p><button class="btn pri lg" style="width:100%">Sign in</button></form></div>`;
  $('#lg').onsubmit = async (e) => { e.preventDefault(); const f = e.target; try { await X3API.post('/api/auth/login', { email: f.email.value, password: f.password.value }); boot(); } catch (ex) { $('#lgErr').textContent = ex.message; } };
}
async function boot() {
  try { me = (await X3API.get('/api/me')).user; } catch { me = null; }
  if (!me) return gate();
  if (me.role !== 'admin') return gate('This account does not have admin access.');
  shell();
}
async function refreshCounts() {
  try { const o = await X3API.get('/api/admin/overview'); Q = o.queues; ['applications', 'uploads', 'payouts', 'reports'].forEach(k => { const n = $(`[data-cnt="${k}"]`); if (n) { n.textContent = Q[k] || ''; n.hidden = !Q[k]; } }); return o; } catch { return null; }
}
function shell() {
  const nav = [['overview', 'Overview'], ['applications', 'Applications', 'applications'], ['users', 'Users'], ['creators', 'Creators'], ['moderation', 'Moderation', 'uploads'], ['payouts', 'Payouts', 'payouts'], ['reports', 'Reports', 'reports'], ['affiliates', 'Affiliates'], ['traffic', 'Traffic'], ['partners', 'Partners'], ['economy', 'Economy'], ['ledger', 'Ledger'], ['audit', 'Audit log']];
  app.innerHTML = `<div class="shell"><aside class="side" id="side"><div class="brand">x3<span>STAR</span><small>Admin</small></div>
    ${nav.map(([k, l, c]) => `<a class="nav" href="#${k}" data-v="${k}">${l}${c ? `<span class="cnt" data-cnt="${c}" hidden></span>` : ''}</a>`).join('')}
    <div class="foot"><span>${esc(me.name)} · admin</span><a href="/" target="_blank" rel="noopener">Open fan app ↗</a><a href="/studio" target="_blank" rel="noopener">Creator Studio ↗</a><button class="btn sm" id="out">Sign out</button></div></aside>
    <button class="btn burger" id="burger" aria-label="Menu">☰</button><main class="main" id="main"></main></div>`;
  $('#out').onclick = async () => { await X3API.post('/api/auth/logout'); location.href = '/'; };
  $('#burger').onclick = () => $('#side').classList.toggle('open');
  router({ overview, applications, users, creators, moderation, payouts, reports, affiliates, traffic, partners, economy, ledger, audit }, 'overview');
  refreshCounts(); setInterval(refreshCounts, 30000);
}
const main = () => $('#main');
const head = (title, sub, actions = '') => `<div class="ph"><div><span class="eyebrow">x3STAR admin</span><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="row">${actions}</div></div>`;
const tabs = (id, list, cur) => `<div class="tabs" id="${id}">${list.map(([k, l]) => `<button data-t="${k}" class="${k === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const wireTabs = (id, fn) => $$(`#${id} button`).forEach(b => b.onclick = () => fn(b.dataset.t));

/* ---------------- overview ---------------- */
async function overview() {
  main().innerHTML = head('Tonight on the <em>floor</em>', 'Live platform health, money and the queues that need you.');
  const o = await refreshCounts(); if (!o) return;
  const c = o.counts, m = o.money, q = o.queues, s = o.series;
  const days = (i) => new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(5, 10);
  main().innerHTML = head('Tonight on the <em>floor</em>', 'Live platform health, money and the queues that need you.', '<button class="btn" id="rf">Refresh</button>') + `
    <div class="grid g5">${[['Users', c.users, `${c.online24h} active · 24h`], ['Creators', c.creators, `${c.live} live now`], ['Revenue · 7d', fmt.usd(m.revenue7d), m.testRevenue7d ? `+ ${fmt.usd(m.testRevenue7d)} test` : 'live payments'], ['Diamonds gifted · 7d', fmt.k(m.diamondsGifted7d), `${fmt.k(m.diamondsGifted24h)} today`], ['Beans owed', fmt.k(m.beansOutstanding), `${fmt.usd(m.beansOutstandingUsd)} liability`]].map(([k, v, sub]) => `<div class="panel kpi"><small>${k}</small><b>${typeof v === 'number' ? fmt.num(v) : v}</b><span>${sub}</span></div>`).join('')}</div>
    <div class="grid g5" style="margin-top:16px">${[['Applications', q.applications, 'applications'], ['Uploads to review', q.uploads, 'moderation'], ['KYC pending', q.kyc, 'creators'], ['Payouts', q.payouts, 'payouts'], ['Open reports', q.reports, 'reports']].map(([k, v, href]) => `<a class="panel kpi ${v ? 'alert' : ''}" href="#${href}"><small>${k}</small><b>${fmt.num(v)}</b><span>${v ? 'Needs review →' : 'All clear'}</span></a>`).join('')}</div>
    <div class="grid g3" style="margin-top:16px">
      <div class="panel pad"><h3 class="t">Signups <small>14d</small></h3>${bars(s.signups, (v, i) => `${days(i)} · ${v}`, 'blue')}</div>
      <div class="panel pad"><h3 class="t">Diamonds gifted <small>14d</small></h3>${bars(s.gifts, (v, i) => `${days(i)} · ${fmt.num(v)}`)}</div>
      <div class="panel pad"><h3 class="t">Revenue <small>14d · incl. test</small></h3>${bars(s.revenue, (v, i) => `${days(i)} · ${fmt.usd(v)}`, 'green')}</div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="panel pad"><h3 class="t">Top creators <small>7d diamonds</small></h3><ul class="list">${o.topCreators.map(x => `<li><span>${esc(x.name)} <span class="dim">· ${x.gifters} gifters</span></span><b>${fmt.num(x.diamonds)}</b></li>`).join('') || '<li class="dim">No gifts yet</li>'}</ul></div>
      <div class="panel pad"><h3 class="t">Top gifters <small>7d diamonds</small></h3><ul class="list">${o.topGifters.map(x => `<li><span>${esc(x.name)}</span><b>${fmt.num(x.diamonds)}</b></li>`).join('') || '<li class="dim">No gifts yet</li>'}</ul></div>
    </div>`;
  $('#rf').onclick = overview;
}

/* ---------------- applications ---------------- */
let appTab = 'pending';
async function applications() {
  const { rows } = await X3API.get('/api/admin/applications?status=' + appTab);
  main().innerHTML = head('Creator <em>applications</em>', 'Approving creates (or upgrades) the account and a creator profile with KYC pending.') + tabs('aTabs', [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']], appTab) +
    (rows.length ? `<div class="grid g2">${rows.map(a => `<div class="panel pad"><div class="row" style="justify-content:space-between"><b style="font:500 22px var(--serif)">${esc(a.data.stage || '—')}</b><span class="tag ${a.status}">${a.status}</span></div>
      <ul class="list"><li><span>Email</span><b>${esc(a.email)}</b></li><li><span>Type</span><b>${esc(a.kind)}</b></li><li><span>Niche</span><b>${esc(a.data.niche || '—')}</b></li><li><span>Hours / week</span><b>${esc(a.data.hours ?? '—')}</b></li><li><span>Platforms</span><b>${esc((a.data.sites || []).join(', ') || '—')}</b></li>${a.data.agentCode ? `<li><span>Agent code</span><b>${esc(a.data.agentCode)}</b></li>` : ''}<li><span>Campaign</span><b>${esc(Object.entries(a.data.campaign || {}).filter(([k]) => k !== 'first_seen').map(([k, v]) => k + '=' + v).join(' ') || 'direct')}</b></li><li><span>Applied</span><b>${fmt.ago(a.created_at)}</b></li></ul>
      ${a.data.note ? `<p class="mute" style="font-size:13px">“${esc(a.data.note)}”</p>` : ''}${a.status === 'pending' ? `<div class="row"><button class="btn grn" data-ok="${a.id}">Approve</button><button class="btn red" data-no="${a.id}">Reject</button></div>` : ''}</div>`).join('')}</div>` : '<div class="panel empty">No applications here.</div>');
  wireTabs('aTabs', (t) => { appTab = t; applications(); });
  $$('[data-ok]').forEach(b => b.onclick = async () => {
    const r = await guard(() => X3API.post('/api/admin/applications/' + b.dataset.ok, { status: 'approved' }), 'Approved');
    if (r.tempPassword) { const m = modal(`<h3>Account created</h3><p class="mute" style="margin:0">Send these sign-in details to the creator securely. The password is shown only once.</p><div class="panel pad mono" style="font-size:13px">Temporary password: <b>${esc(r.tempPassword)}</b><br>Creator profile: <b>${esc(r.creatorId || '—')}</b></div><button class="btn pri" data-x>Done</button>`); $('[data-x]', m.root).onclick = m.close; }
    applications(); refreshCounts();
  });
  $$('[data-no]').forEach(b => b.onclick = async () => { if (await confirmBox('Reject application?', 'The applicant can apply again later.', 'Reject', true)) { await guard(() => X3API.post('/api/admin/applications/' + b.dataset.no, { status: 'rejected' }), 'Rejected'); applications(); refreshCounts(); } });
}

/* ---------------- users ---------------- */
let uq = '', urole = '';
async function users() {
  const { rows } = await X3API.get(`/api/admin/users?q=${encodeURIComponent(uq)}&role=${urole}`);
  main().innerHTML = head('Users', `${rows.length} shown`) + `<div class="row" style="margin-bottom:14px"><input class="inp" id="uq" placeholder="Search email or username" value="${esc(uq)}" style="max-width:320px"><select class="inp" id="ur" style="max-width:160px"><option value="">All roles</option>${['fan', 'creator', 'agent', 'admin'].map(r => `<option ${r === urole ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
    <div class="panel tbl-wrap"><table class="tbl"><thead><tr><th>User</th><th>Role</th><th class="r">Level</th><th class="r">VIP</th><th class="r">💎</th><th class="r">Gifted</th><th class="r">Spent</th><th>Last seen</th><th></th></tr></thead><tbody>${rows.map(u => `<tr><td><b>${esc(u.name)}</b> ${u.demo ? '<span class="tag demo">demo</span>' : ''} ${u.banned ? '<span class="tag banned">banned</span>' : ''}<div class="note">${esc(u.email)}</div></td>
      <td><select class="inp" data-role="${u.id}" style="height:32px;width:110px">${['fan', 'creator', 'agent', 'admin'].map(r => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
      <td class="r num">${u.level}</td><td class="r num">${u.vip || '—'}</td><td class="r num">${fmt.num(u.diamonds)}</td><td class="r num">${fmt.num(u.gifted)}</td><td class="r num">${fmt.usd(u.spentUsd)}</td><td class="dim">${fmt.ago(u.lastSeen)}</td>
      <td class="r"><div class="row" style="justify-content:flex-end"><button class="btn sm" data-grant="${u.id}">Grant</button><button class="btn sm ${u.banned ? '' : 'red'}" data-ban="${u.id}" data-b="${u.banned ? 1 : 0}">${u.banned ? 'Unban' : 'Ban'}</button></div></td></tr>`).join('') || '<tr><td colspan="9" class="empty">No users match.</td></tr>'}</tbody></table></div>`;
  let t; $('#uq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { uq = e.target.value; users(); }, 350); };
  $('#ur').onchange = (e) => { urole = e.target.value; users(); };
  $$('[data-role]').forEach(s => s.onchange = () => guard(() => X3API.post('/api/admin/users/' + s.dataset.role, { role: s.value }), 'Role updated'));
  $$('[data-ban]').forEach(b => b.onclick = async () => { const ban = b.dataset.b !== '1'; if (!ban || await confirmBox('Ban this user?', 'They are signed out everywhere and cannot sign in.', 'Ban', true)) { await guard(() => X3API.post('/api/admin/users/' + b.dataset.ban, { banned: ban }), ban ? 'Banned' : 'Unbanned'); users(); } });
  $$('[data-grant]').forEach(b => b.onclick = async () => {
    const v = await promptBox('Grant to user', [{ name: 'diamonds', label: 'Diamonds (negative to remove)', type: 'number', value: 100 }, { name: 'item', label: 'Item id (optional, e.g. frm_halo)', value: '' }, { name: 'reason', label: 'Reason (audit log)', value: 'Support credit' }], 'Grant');
    if (!v) return; const body = { reason: v.reason }; if (Number(v.diamonds)) body.grantDiamonds = Number(v.diamonds); if (v.item.trim()) body.grantItem = v.item.trim();
    await guard(() => X3API.post('/api/admin/users/' + b.dataset.grant, body), 'Granted'); users();
  });
}

/* ---------------- creators ---------------- */
async function creators() {
  const { rows } = await X3API.get('/api/admin/creators');
  main().innerHTML = head('Creators', 'Approve KYC before a creator can go live or cash out.') + `<div class="panel tbl-wrap"><table class="tbl"><thead><tr><th>Creator</th><th>Status</th><th>KYC</th><th>Live</th><th>Featured</th><th class="r">Base viewers</th><th class="r">Beans</th><th class="r">Beans · 30d</th><th></th></tr></thead><tbody>${rows.map(c => `<tr><td><b>${esc(c.name)}</b> <span class="mono dim">$${esc(c.ticker)}</span> ${c.demo ? '<span class="tag demo">demo</span>' : ''}<div class="note">${esc(c.email || 'no account')} · ${esc(c.niche)}</div></td>
    <td><select class="inp" data-f="status" data-id="${esc(c.id)}" style="height:32px;width:120px">${['pending', 'approved', 'suspended'].map(s => `<option ${s === c.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
    <td><select class="inp" data-f="kyc" data-id="${esc(c.id)}" style="height:32px;width:110px">${['pending', 'verified', 'rejected'].map(s => `<option ${s === c.kyc ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
    <td><button class="switch ${c.live ? 'on' : ''}" data-tg="live" data-id="${esc(c.id)}" aria-label="Live"></button></td><td><button class="switch ${c.featured ? 'on' : ''}" data-tg="featured" data-id="${esc(c.id)}" aria-label="Featured"></button></td>
    <td class="r"><input class="inp" type="number" min="0" value="${c.baseViewers}" data-bv="${esc(c.id)}" style="height:32px;width:100px;text-align:right"></td><td class="r num">${fmt.num(c.beans)}</td><td class="r num">${fmt.num(c.beans30d)}</td>
    <td class="r"><a class="btn sm" href="/studio?as=${encodeURIComponent(c.id)}" target="_blank" rel="noopener">Studio</a></td></tr>`).join('')}</tbody></table></div>`;
  $$('[data-f]').forEach(s => s.onchange = () => guard(() => X3API.post('/api/admin/creators/' + s.dataset.id, { [s.dataset.f]: s.value }), 'Updated').then(refreshCounts));
  $$('[data-tg]').forEach(b => b.onclick = async () => { const on = !b.classList.contains('on'); await guard(() => X3API.post('/api/admin/creators/' + b.dataset.id, { [b.dataset.tg]: on }), 'Updated'); b.classList.toggle('on', on); });
  $$('[data-bv]').forEach(i => i.onchange = () => guard(() => X3API.post('/api/admin/creators/' + i.dataset.bv, { baseViewers: Number(i.value) }), 'Updated'));
}

/* ---------------- moderation ---------------- */
let modTab = 'pending';
async function moderation() {
  const { rows } = await X3API.get('/api/admin/uploads?status=' + modTab);
  main().innerHTML = head('Content <em>moderation</em>', 'Nothing a creator uploads is public until it is approved here. Check age, consent and identity match against KYC.', modTab === 'pending' && rows.length ? '<button class="btn grn" id="allOk">Approve all shown</button>' : '') + tabs('mTabs', [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']], modTab) +
    (rows.length ? `<div class="media-grid">${rows.map(u => `<div class="panel mcard"><div class="mv">${u.type === 'video' ? `<video src="${esc(u.url)}" muted playsinline controls preload="metadata"></video>` : `<img src="${esc(u.url)}" alt="" loading="lazy">`}<span class="tag ${u.status}">${u.status}</span><span class="tag kind">${esc(u.kind)}</span></div>
      <div class="mb"><span><b>${esc(u.owner)}</b>${u.creatorId ? ` · ${esc(u.creatorId)}` : ''}</span><span class="dim">${fmt.bytes(u.size)} · ${fmt.ago(u.at)}</span>${u.caption ? `<span>“${esc(u.caption)}”</span>` : ''}${u.reason ? `<span style="color:var(--red)">${esc(u.reason)}</span>` : ''}
      <div class="row">${u.status !== 'approved' ? `<button class="btn sm grn" data-ok="${u.id}">Approve</button>` : ''}${u.status !== 'rejected' ? `<button class="btn sm red" data-no="${u.id}">Reject</button>` : ''}<button class="btn sm" data-del="${u.id}">Delete</button></div></div></div>`).join('')}</div>` : '<div class="panel empty">Queue is empty.</div>');
  wireTabs('mTabs', (t) => { modTab = t; moderation(); });
  const act = async (id, body, msg) => { await guard(() => X3API.post('/api/admin/uploads/' + id, body), msg); moderation(); refreshCounts(); };
  $$('[data-ok]').forEach(b => b.onclick = () => act(b.dataset.ok, { status: 'approved' }, 'Approved'));
  $$('[data-no]').forEach(b => b.onclick = async () => { const v = await promptBox('Reject upload', [{ name: 'reason', label: 'Reason shown to the creator', type: 'select', value: 'Does not meet content guidelines', options: ['Does not meet content guidelines', 'Face does not match verified ID', 'Third party visible without release', 'Watermark / reposted content', 'Low quality'] }], 'Reject'); if (v) act(b.dataset.no, { status: 'rejected', reason: v.reason }, 'Rejected'); });
  $$('[data-del]').forEach(b => b.onclick = async () => { if (await confirmBox('Delete permanently?', 'The file is removed from disk.', 'Delete', true)) act(b.dataset.del, { delete: true }, 'Deleted'); });
  const all = $('#allOk'); if (all) all.onclick = async () => { if (await confirmBox(`Approve ${rows.length} uploads?`, 'Only do this after reviewing each one.', 'Approve all')) { for (const u of rows) await X3API.post('/api/admin/uploads/' + u.id, { status: 'approved' }); toast('Approved', 'ok'); moderation(); refreshCounts(); } };
}

/* ---------------- payouts ---------------- */
let poTab = 'pending';
async function payouts() {
  const { rows } = await X3API.get('/api/admin/payouts?status=' + poTab);
  main().innerHTML = head('Payouts', 'Approve, then mark paid once the transfer is sent. Rejecting returns the beans to the creator.') + tabs('pTabs', [['pending', 'Pending'], ['approved', 'Approved'], ['paid', 'Paid'], ['rejected', 'Rejected']], poTab) +
    `<div class="panel tbl-wrap"><table class="tbl"><thead><tr><th>Requested</th><th>Payee</th><th class="r">Beans</th><th class="r">USD</th><th>Method</th><th>Note</th><th></th></tr></thead><tbody>${rows.map(p => `<tr><td>${fmt.date(p.created_at)}</td><td><b>${esc(p.creator || p.agent || '—')}</b><div class="note">${p.creator ? 'creator' : 'agent'}</div></td><td class="r num">${fmt.num(p.beans)}</td><td class="r num">${fmt.usd(p.usd)}</td><td class="mono" style="font-size:12px">${esc(p.method)}</td><td class="dim">${esc(p.note)}</td>
      <td class="r"><div class="row" style="justify-content:flex-end">${p.status === 'pending' ? `<button class="btn sm" data-s="approved" data-id="${p.id}">Approve</button>` : ''}${['pending', 'approved'].includes(p.status) ? `<button class="btn sm grn" data-s="paid" data-id="${p.id}">Mark paid</button><button class="btn sm red" data-s="rejected" data-id="${p.id}">Reject</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Nothing here.</td></tr>'}</tbody></table></div>`;
  wireTabs('pTabs', (t) => { poTab = t; payouts(); });
  $$('[data-s]').forEach(b => b.onclick = async () => { const v = await promptBox(`Mark ${b.dataset.s}`, [{ name: 'note', label: b.dataset.s === 'paid' ? 'Transaction reference' : 'Note', value: '' }], 'Confirm'); if (!v) return; await guard(() => X3API.post('/api/admin/payouts/' + b.dataset.id, { status: b.dataset.s, note: v.note }), 'Updated'); payouts(); refreshCounts(); });
}

/* ---------------- reports ---------------- */
let rTab = 'open';
async function reports() {
  const { rows } = await X3API.get('/api/admin/reports?status=' + rTab);
  main().innerHTML = head('Reports') + tabs('rTabs', [['open', 'Open'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed']], rTab) +
    `<div class="panel tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Reporter</th><th>Target</th><th>Reason</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td>${fmt.date(r.created_at)}</td><td>${esc(r.reporter || '—')}</td><td><span class="tag">${esc(r.target_type)}</span> <span class="mono">${esc(r.target_id)}</span></td><td>${esc(r.reason)}</td><td class="r">${r.status === 'open' ? `<div class="row" style="justify-content:flex-end"><button class="btn sm grn" data-s="resolved" data-id="${r.id}">Resolve</button><button class="btn sm" data-s="dismissed" data-id="${r.id}">Dismiss</button></div>` : `<span class="tag ${r.status}">${r.status}</span>`}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No reports.</td></tr>'}</tbody></table></div>`;
  wireTabs('rTabs', (t) => { rTab = t; reports(); });
  $$('[data-s]').forEach(b => b.onclick = async () => { await guard(() => X3API.post('/api/admin/reports/' + b.dataset.id, { status: b.dataset.s }), 'Updated'); reports(); refreshCounts(); });
}

/* ---------------- affiliates: rankings, partners, links, stats ---------------- */
let affDays = 30, affSort = 'earnings';
const PAYOUT_LABEL = { revshare: 'Revenue share', per_join: 'Per join', per_spender: 'Per spender', hybrid_join: 'Per join + revshare', hybrid_spender: 'Per spender + revshare', commission: 'Commission on sales', flat: 'Flat fee', unknown: 'Not set' };
const SLOT_LABEL = { footer: 'Footer · More live cams', apply: 'Creator apply page', 'ad:728x90': 'Ad · 728×90 banner', 'ad:300x600': 'Ad · 300×600 tower', 'ad:970x250': 'Ad · 970×250 footer', none: 'Not placed (link only)' };
const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusTag = (s) => `<span class="tag ${s === 'active' ? 'live' : s}">${esc(s)}</span>`;
function spark(clicks, earnings) {
  const max = Math.max(1, ...clicks), w = 96, h = 28, n = clicks.length, bw = w / n;
  const emax = Math.max(0.01, ...earnings);
  const line = earnings.map((e, i) => `${(i + 0.5) * bw},${h - 2 - (e / emax) * (h - 4)}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${clicks.map((c, i) => `<rect x="${i * bw + 0.5}" y="${h - (c / max) * h}" width="${Math.max(1, bw - 1)}" height="${(c / max) * h}" fill="rgba(90,184,255,.45)"/>`).join('')}${earnings.some(e => e > 0) ? `<polyline points="${line}" fill="none" stroke="var(--green)" stroke-width="1.5"/>` : ''}</svg>`;
}
async function affiliates() {
  const [rk, reg] = await Promise.all([X3API.get('/api/admin/affiliates/rankings?days=' + affDays), X3API.get('/api/admin/affiliates')]);
  const cols = [['rank', '#'], ['name', 'Partner'], ['clicks', 'Clicks'], ['unique', 'Unique'], ['joins', 'Sign-ups'], ['joinRate', 'Join rate'], ['conversions', 'Spenders / orders'], ['earnings', 'Earnings'], ['epc', 'EPC'], ['perJoin', '$ / sign-up']];
  const rows = rk.partners.slice().sort((a, b) => affSort === 'name' ? a.name.localeCompare(b.name) : affSort === 'rank' ? a.rank - b.rank : (b[affSort] || 0) - (a[affSort] || 0));
  const best = rk.partners.filter(p => p.clicks >= 20 && p.earnings > 0).sort((a, b) => b.epc - a.epc)[0];
  main().innerHTML = head('Affiliate <em>rankings</em>', 'Every partner you promote, ranked. Clicks come from x3STAR\'s own click log; sign-ups, spenders and earnings come from what each partner reports. Enter them per day or import the partner\'s CSV under Manage.', '<button class="btn pri" id="affAdd">Add partner</button>') +
    tabs('affDays', [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '12 months']], String(affDays)) + `
    <div class="grid g3" style="grid-template-columns:repeat(4,1fr)">
      <div class="panel kpi"><small>Earnings · ${affDays}d</small><b>${money(rk.totals.earnings)}</b><span>${fmt.num(rk.totals.conversions)} spenders / orders</span></div>
      <div class="panel kpi"><small>Partner clicks</small><b>${fmt.num(rk.totals.clicks)}</b><span>${fmt.num(rk.totals.joins)} sign-ups</span></div>
      <div class="panel kpi"><small>Earnings per click</small><b>${money(rk.totals.epc)}</b><span>all partners</span></div>
      <div class="panel kpi"><small>Best EPC</small><b>${best ? esc(best.name) : '—'}</b><span>${best ? money(best.epc) + ' per click' : 'needs 20+ clicks and reported earnings'}</span></div>
    </div>
    <div class="panel tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr>${cols.map(([k, l]) => `<th class="${k === 'name' ? '' : 'r'}" data-sort="${k}" style="cursor:pointer;${affSort === k ? 'color:var(--pink-2)' : ''}">${l}${affSort === k ? ' ↓' : ''}</th>`).join('')}<th>Clicks / earnings</th><th></th></tr></thead><tbody>
      ${rows.map(p => `<tr>
        <td class="r"><b style="font:500 20px var(--serif)">${p.rank}</b></td>
        <td style="min-width:230px"><button class="pv-link" data-manage="${esc(p.id)}" style="all:unset;cursor:pointer;font-weight:700">${esc(p.name)}</button> ${statusTag(p.status)}<div class="dim" title="${esc(p.program || '')}" style="font-size:11px;margin-top:3px;max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.program || PAYOUT_LABEL[p.payout] || '')}</div></td>
        <td class="r">${fmt.num(p.clicks)}</td><td class="r">${fmt.num(p.unique)}</td><td class="r">${fmt.num(p.joins)}</td><td class="r">${p.clicks ? p.joinRate + '%' : '—'}</td>
        <td class="r">${fmt.num(p.conversions)}</td><td class="r"><b>${money(p.earnings)}</b>${p.reportedDays ? `<div class="dim" style="font-size:10.5px">${p.reportedDays} day${p.reportedDays === 1 ? '' : 's'} reported</div>` : '<div class="dim" style="font-size:10.5px">nothing reported</div>'}</td>
        <td class="r">${p.clicks ? money(p.epc) : '—'}</td><td class="r">${p.joins ? money(p.perJoin) : '—'}</td>
        <td>${spark(p.series.clicks, p.series.earnings)}</td>
        <td class="r"><div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">${p.dashboardUrl ? `<a class="btn sm" href="${esc(p.dashboardUrl)}" target="_blank" rel="noopener noreferrer">Stats ↗</a>` : ''}<button class="btn sm" data-manage="${esc(p.id)}">Manage</button></div></td></tr>`).join('')}
    </tbody></table></div>
    <p class="note" style="margin-top:10px">EPC = earnings ÷ clicks — the fairest way to compare partners that pay differently. Blue bars are daily clicks, the green line is daily earnings. Pending, paused and rejected partners show no links on the site.</p>`;
  wireTabs('affDays', (d) => { affDays = Number(d); affiliates(); });
  $$('[data-sort]').forEach(th => th.onclick = () => { affSort = th.dataset.sort; affiliates(); });
  $$('[data-manage]').forEach(b => b.onclick = () => managePartner(reg, b.dataset.manage));
  $('#affAdd').onclick = () => editPartner(reg, null);
}
function partnerForm(reg, p) {
  const opt = (list, cur, labels) => list.map(v => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(labels ? labels[v] || v : v)}</option>`).join('');
  return `<div class="grid g2" style="gap:12px">
    ${p ? '' : '<label class="field"><span>Code (2–8 letters/digits)</span><input class="inp mono" name="id" maxlength="8" placeholder="e.g. SM"></label>'}
    <label class="field"><span>Name</span><input class="inp" name="name" maxlength="60" value="${esc(p ? p.name : '')}"></label>
    <label class="field"><span>Status</span><select class="inp" name="status">${opt(reg.statuses, p ? p.status : 'pending')}</select></label>
    <label class="field"><span>Type</span><select class="inp" name="kind">${opt(reg.kinds, p ? p.kind : 'cam', { cam: 'Cam network', shop: 'Shop / products', other: 'Other' })}</select></label>
    <label class="field"><span>Payout plan</span><select class="inp" name="payout">${opt(reg.payouts, p ? p.payout : 'unknown', PAYOUT_LABEL)}</select></label>
    <label class="field"><span>Revenue share / commission %</span><input class="inp" type="number" step="any" min="0" max="100" name="revshare_pct" value="${esc(p ? p.revshare_pct : 0)}"></label>
    <label class="field"><span>$ per join</span><input class="inp" type="number" step="any" min="0" name="per_join_usd" value="${esc(p ? p.per_join_usd : 0)}"></label>
    <label class="field"><span>$ per spender</span><input class="inp" type="number" step="any" min="0" name="per_spender_usd" value="${esc(p ? p.per_spender_usd : 0)}"></label>
    <label class="field"><span>Affiliate ID / campaign</span><input class="inp mono" name="affiliate_id" maxlength="80" value="${esc(p ? p.affiliate_id : '')}"></label>
    <label class="field"><span>Website</span><input class="inp" name="website" placeholder="https://" value="${esc(p ? p.website : '')}"></label>
    <label class="field"><span>Partner stats dashboard</span><input class="inp" name="dashboard_url" placeholder="https://" value="${esc(p ? p.dashboard_url : '')}"></label>
    <label class="field" style="grid-column:1/-1"><span>Program (as the partner describes it)</span><input class="inp" name="program" maxlength="300" value="${esc(p ? p.program : '')}"></label>
    <label class="field" style="grid-column:1/-1"><span>Notes</span><textarea class="inp" name="notes" maxlength="2000">${esc(p ? p.notes : '')}</textarea></label></div>`;
}
const formData = (root) => Object.fromEntries($$('[name]', root).map(i => [i.name, i.type === 'number' ? Number(i.value || 0) : i.value]));
function editPartner(reg, p) {
  const m = modal(`<h3>${p ? 'Edit ' + esc(p.name) : 'Add affiliate partner'}</h3>${partnerForm(reg, p)}<div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-n>Cancel</button><button class="btn pri" data-y>${p ? 'Save' : 'Add partner'}</button></div>`);
  m.root.style.width = 'min(760px, calc(100vw - 32px))';
  $('[data-n]', m.root).onclick = m.close;
  $('[data-y]', m.root).onclick = async () => {
    const body = formData(m.root);
    await guard(() => p ? X3API.put('/api/admin/affiliates/' + p.id, body) : X3API.post('/api/admin/affiliates', body), p ? 'Partner saved' : 'Partner added');
    m.close(); affiliates();
  };
}
async function managePartner(reg, id) {
  const fresh = await X3API.get('/api/admin/affiliates'); Object.assign(reg, fresh);
  const p = reg.partners.find(x => x.id === id); if (!p) return;
  const { rows } = await X3API.get('/api/admin/affiliates/' + id + '/stats');
  const m = modal(`<div class="row" style="justify-content:space-between"><h3 style="margin:0">${esc(p.name)} ${statusTag(p.status)}</h3><div class="row"><button class="btn sm" data-edit>Edit details</button>${p.builtin ? '' : '<button class="btn sm red" data-del>Delete</button>'}</div></div>
    <p class="note" style="margin:6px 0 14px">${esc(p.program || PAYOUT_LABEL[p.payout])}${p.affiliate_id ? ` · ID <span class="mono">${esc(p.affiliate_id)}</span>` : ''}${p.notes ? '<br>' + esc(p.notes) : ''}</p>
    ${p.id === 'CB' ? '<p class="note">Chaturbate links and placements are set up in <a href="#partners" style="color:var(--pink-2)">Partners</a>. Links added here are extra.</p>' : ''}
    <h4 style="margin:10px 0 8px">Links on the site</h4>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>On</th><th>Text</th><th>Where</th><th>URL</th><th class="r">Clicks · 30d</th><th></th></tr></thead><tbody>
      ${p.links.map(l => `<tr data-l="${l.id}"><td><button class="switch ${l.active ? 'on' : ''}" data-lon aria-label="Link on"></button></td><td>${esc(l.label)}${l.sub ? `<div class="dim" style="font-size:11px">${esc(l.sub)}</div>` : ''}</td><td>${esc(SLOT_LABEL[l.slot] || l.slot)}</td><td style="max-width:240px"><span class="mono dim" style="font-size:11px;word-break:break-all">${esc(l.url)}</span></td><td class="r">${fmt.num(l.clicks30d)}</td><td class="r"><button class="btn sm" data-ldel>Remove</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No links yet.</td></tr>'}
    </tbody></table></div>
    <div class="grid g2" style="gap:10px;margin-top:10px" id="newLink">
      <input class="inp" name="label" placeholder="Link text, e.g. Shop realistic dolls" maxlength="120">
      <select class="inp" name="slot">${reg.slots.map(s => `<option value="${s}">${esc(SLOT_LABEL[s])}</option>`).join('')}</select>
      <input class="inp mono" name="url" placeholder="https://… your affiliate link (optional {placement} {source} {campaign})" style="grid-column:1/-1">
      <input class="inp" name="sub" placeholder="Subtitle (ads only, optional)" maxlength="120"><button class="btn pri" data-ladd>Add link</button>
    </div>
    ${p.status !== 'active' ? `<p class="note" style="margin-top:8px">This partner is <b>${esc(p.status)}</b>, so its links stay hidden on the site until you set it to active.</p>` : ''}
    <h4 style="margin:22px 0 8px">Reported results</h4>
    <div class="grid g2" style="gap:10px;grid-template-columns:repeat(5,1fr)" id="newStat">
      <label class="field"><span>Day</span><input class="inp" type="date" name="day" value="${new Date().toISOString().slice(0, 10)}"></label>
      <label class="field"><span>Sign-ups</span><input class="inp" type="number" min="0" name="joins" value="0"></label>
      <label class="field"><span>${p.kind === 'shop' ? 'Orders' : 'Spenders'}</span><input class="inp" type="number" min="0" name="conversions" value="0"></label>
      <label class="field"><span>${p.kind === 'shop' ? 'Sales $' : 'Revenue $'}</span><input class="inp" type="number" step="any" min="0" name="sales" value="0"></label>
      <label class="field"><span>Your earnings $</span><input class="inp" type="number" step="any" min="0" name="earnings" value="0"></label>
    </div>
    <div class="row" style="margin-top:10px"><button class="btn pri" data-sadd>Save day</button><label class="btn" style="cursor:pointer">Import CSV<input type="file" accept=".csv,text/csv,text/plain" data-csv hidden></label><span class="note">CSV columns: date, earnings (required), plus any of signups/joins, spenders/orders, revenue/sales.</span></div>
    <div class="tbl-wrap" style="max-height:240px;overflow:auto;margin-top:10px"><table class="tbl"><thead><tr><th>Day</th><th class="r">Sign-ups</th><th class="r">${p.kind === 'shop' ? 'Orders' : 'Spenders'}</th><th class="r">${p.kind === 'shop' ? 'Sales' : 'Revenue'}</th><th class="r">Earnings</th><th>Source</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="mono">${esc(r.day)}</td><td class="r">${fmt.num(r.joins)}</td><td class="r">${fmt.num(r.conversions)}</td><td class="r">${money(r.sales)}</td><td class="r"><b>${money(r.earnings)}</b></td><td><span class="tag">${esc(r.source)}</span></td><td class="r"><button class="btn sm" data-sdel="${esc(r.day)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Nothing reported yet.</td></tr>'}
    </tbody></table></div>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-n>Close</button></div>`);
  m.root.style.width = 'min(900px, calc(100vw - 32px))'; m.root.style.maxHeight = 'calc(100vh - 40px)'; m.root.style.overflow = 'auto';
  const reopen = () => { m.close(); managePartner(reg, id); };
  $('[data-n]', m.root).onclick = () => { m.close(); affiliates(); };
  $('[data-edit]', m.root).onclick = () => { m.close(); editPartner(reg, p); };
  const del = $('[data-del]', m.root); if (del) del.onclick = async () => { if (!(await confirmBox('Delete ' + p.name + '?', 'Its links and reported results are removed. Click history stays in Traffic.', 'Delete', true))) return; await guard(() => X3API.del('/api/admin/affiliates/' + id), 'Partner deleted'); m.close(); affiliates(); };
  $$('[data-lon]', m.root).forEach(b => b.onclick = async () => { const lid = b.closest('tr').dataset.l; await guard(() => X3API.put('/api/admin/affiliates/links/' + lid, { active: !b.classList.contains('on') })); b.classList.toggle('on'); });
  $$('[data-ldel]', m.root).forEach(b => b.onclick = async () => { await guard(() => X3API.del('/api/admin/affiliates/links/' + b.closest('tr').dataset.l), 'Link removed'); reopen(); });
  $('[data-ladd]', m.root).onclick = async () => { await guard(() => X3API.post('/api/admin/affiliates/' + id + '/links', formData($('#newLink', m.root))), 'Link added'); reopen(); };
  $('[data-sadd]', m.root).onclick = async () => { const d = formData($('#newStat', m.root)); await guard(() => X3API.put('/api/admin/affiliates/' + id + '/stats/' + d.day, d), 'Saved'); reopen(); };
  $$('[data-sdel]', m.root).forEach(b => b.onclick = async () => { await guard(() => X3API.del('/api/admin/affiliates/' + id + '/stats/' + b.dataset.sdel), 'Deleted'); reopen(); });
  $('[data-csv]', m.root).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const csv = await f.text(); const r = await guard(() => X3API.post('/api/admin/affiliates/' + id + '/stats/import', { csv })); toast(`Imported ${r.imported} day${r.imported === 1 ? '' : 's'}`, 'ok'); reopen(); };
}

/* ---------------- traffic ---------------- */
async function traffic() {
  const t = await X3API.get('/api/admin/traffic?days=14');
  main().innerHTML = head('Affiliate <em>traffic</em>', 'Clicks on partner links: creator "Also live on" rooms plus the footer, ad and apply-page placements set in Partners. Each click is logged here, then forwarded to the affiliate URL.') + `
    <div class="grid g3"><div class="panel kpi"><small>Clicks · 14d</small><b>${fmt.num(t.total)}</b></div><div class="panel kpi"><small>Unique visitors</small><b>${fmt.num(t.unique)}</b></div><div class="panel kpi"><small>Top site</small><b>${esc(t.bySite[0] ? t.bySite[0].site : '—')}</b><span>${t.bySite[0] ? fmt.num(t.bySite[0].clicks) + ' clicks' : ''}</span></div></div>
    <div class="panel pad" style="margin-top:16px"><h3 class="t">Clicks per day</h3>${bars(t.series, (v, i) => `${new Date(Date.now() - (t.days - 1 - i) * 864e5).toISOString().slice(5, 10)} · ${v}`, 'blue')}</div>
    <div class="grid g3" style="margin-top:16px"><div class="panel pad"><h3 class="t">By site</h3><ul class="list">${t.bySite.map(x => `<li><span>${esc(x.site)}</span><b>${fmt.num(x.clicks)}</b></li>`).join('') || '<li class="dim">No clicks yet</li>'}</ul></div>
      <div class="panel pad"><h3 class="t">By creator</h3><ul class="list">${t.byCreator.map(x => `<li><span>${esc(x.name || x.creator_id)}</span><b>${fmt.num(x.clicks)}</b></li>`).join('') || '<li class="dim">No clicks yet</li>'}</ul></div>
      <div class="panel pad"><h3 class="t">Top partner videos</h3><ul class="list">${(t.byVideo || []).map(x => `<li><span>${esc(x.performer || x.id)} <span class="dim">· ${esc((x.title || '').slice(0, 40))}</span></span><b>${fmt.num(x.clicks)}</b></li>`).join('') || '<li class="dim">No clicks yet</li>'}</ul></div>
      <div class="panel pad"><h3 class="t">By placement</h3><ul class="list">${(t.byPlacement || []).map(x => `<li><span class="mono">${esc(x.placement)}</span><b>${fmt.num(x.clicks)}</b></li>`).join('') || '<li class="dim">No clicks yet</li>'}</ul></div>
      <div class="panel pad"><h3 class="t">By campaign</h3><ul class="list">${t.byCampaign.map(x => `<li><span>${esc(x.campaign)} <span class="dim">· ${esc(x.source)}</span></span><b>${fmt.num(x.clicks)}</b></li>`).join('') || '<li class="dim">No clicks yet</li>'}</ul></div></div>`;
}

/* ---------------- partners (Chaturbate affiliate) ---------------- */
async function partners() {
  const [d, t, cfgRes] = await Promise.all([X3API.get('/api/admin/partners'), X3API.get('/api/admin/traffic?days=30'), X3API.get('/api/admin/config')]);
  const cb = d.config, overrides = cfgRes.overrides;
  const clicks = Object.fromEntries((t.byPlacement || []).map(x => [x.placement, x.clicks]));
  const progs = d.programs, tourOpts = (sel, roomOnly) => d.tours.filter(x => !roomOnly || x.room).map(x => `<option value="${esc(x.key)}" ${x.key === sel ? 'selected' : ''}>${esc(x.label)}</option>`).join('');
  const slotName = { footer: 'Footer · More live cams', 'ad:728x90': 'Ad · 728×90 banner', 'ad:300x600': 'Ad · 300×600 tower', 'ad:970x250': 'Ad · 970×250 footer', apply: 'Creator apply page' };
  main().innerHTML = head('Partner <em>links</em>', 'Your Chaturbate affiliate links. Every link on the site goes through /go/… so the click is counted here first, and carries a <span class="mono">track</span> tag so the same placement shows up in your Chaturbate stats.', '<button class="btn pri" id="pSave">Save partner settings</button>') + `
    <div class="panel pad"><div class="row" style="justify-content:space-between"><div><h3 class="t" style="margin:0">Chaturbate</h3><p class="note" style="margin:4px 0 0">Turn off to hide every Chaturbate link on the site.</p></div><button class="switch ${cb.enabled ? 'on' : ''}" id="pOn" role="switch" aria-checked="${cb.enabled}" aria-label="Chaturbate links on"></button></div>
      <div class="row" style="justify-content:space-between;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)"><div><b>Live now on Chaturbate grid</b><p class="note" style="margin:4px 0 0">Real live rooms (thumbnails, viewers, tags) from Chaturbate's online-rooms feed on Home, Live and Niches. Clicks use your room link and count as <span class="mono">live_grid</span>.</p></div><button class="switch ${cb.liveGrid !== false ? 'on' : ''}" id="pGrid" role="switch" aria-label="Live grid on"></button></div></div>
    <div class="panel pad" style="margin-top:12px"><div class="row" style="justify-content:space-between;gap:16px;flex-wrap:wrap"><div><h3 class="t" style="margin:0">BongaCams live rooms</h3><p class="note" style="margin:4px 0 0">Adds a BongaCams tab to "Live right now", from BongaCash's Models Online API. Clicks use your BongaCams tracking link (Economy → Affiliates → BongaCams) and count as <span class="mono">live_grid</span>.</p></div>
      <div class="row"><label class="field" style="margin:0"><span>BongaCash affiliate ID</span><input class="inp mono" id="pBcId" value="${esc(((cfgRes.effective.partners || {}).BC || {}).affiliateId || '')}" maxlength="12" style="width:130px"></label><button class="switch ${((cfgRes.effective.partners || {}).BC || {}).liveGrid !== false ? 'on' : ''}" id="pBcGrid" role="switch" aria-label="BongaCams live grid on"></button></div></div></div>
    <h3 class="t" style="margin:22px 0 10px">Program <small>which payout plan your links earn under</small></h3>
    <div class="grid g3">${Object.entries(progs).map(([k, p]) => `<label class="panel pad" style="cursor:pointer;display:flex;gap:12px;align-items:flex-start;${k === cb.program ? 'border-color:var(--pink)' : ''}"><input type="radio" name="prog" value="${k}" ${k === cb.program ? 'checked' : ''} style="margin-top:4px"><span><b>${esc(p.label)}</b><span class="note" style="display:block;margin-top:4px">${esc(p.terms)}</span><span class="note" style="display:block;margin-top:6px">${p.tours.length} link types</span></span></label>`).join('')}</div>
    <div class="grid g2" style="margin-top:16px">
      <label class="panel pad field"><span>Campaign code</span><input class="inp mono" id="pCamp" value="${esc(cb.campaign)}" maxlength="20"></label>
      <label class="panel pad field"><span>Your Chaturbate room</span><input class="inp mono" id="pHouse" value="${esc(cb.houseRoom || '')}" maxlength="60" placeholder="room name"></label>
      <label class="panel pad field"><span>Creator "Also live on Chaturbate" link opens</span><select class="inp" id="pRoomTour">${tourOpts(cb.roomTour, true)}</select></label>
      <label class="panel pad field"><span>Track tag <small class="dim">{placement} {source} {creator}</small></span><input class="inp mono" id="pTrack" value="${esc(cb.track)}" maxlength="80"></label>
    </div>
    ${d.roomSample ? `<p class="note mono" style="margin:10px 2px;word-break:break-all">Creator room example: ${esc(d.roomSample)}</p>` : ''}
    <div class="panel tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr><th>On</th><th>Where</th><th>Text</th><th>Links to</th><th class="r">Clicks · 30d</th><th>Resolved URL</th></tr></thead><tbody>
      ${d.placements.map(p => `<tr data-pl="${esc(p.key)}">
        <td><button class="switch ${p.on ? 'on' : ''}" data-pon aria-label="Show ${esc(p.key)}"></button></td>
        <td><b>${esc(slotName[p.slot] || p.slot)}</b><div class="dim mono" style="font-size:11px">${esc(p.key)}</div></td>
        <td><input class="inp" data-plabel value="${esc(p.label)}" maxlength="120" style="min-width:180px"></td>
        <td><select class="inp" data-ptour style="min-width:200px">${tourOpts(p.tour)}</select>${p.usedTour && p.usedTour !== p.tour ? `<div class="note" style="margin-top:4px">Not in this program — uses “${esc((d.tours.find(x => x.key === p.usedTour) || {}).label || p.usedTour)}”</div>` : ''}</td>
        <td class="r">${fmt.num(clicks[p.key] || 0)}</td>
        <td style="max-width:320px">${p.url ? `<a class="mono" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" style="font-size:11px;word-break:break-all;color:var(--mute)">${esc(p.url)} ↗</a>` : '<span class="dim">Not available</span>'}</td></tr>`).join('')}
    </tbody></table></div>
    <div id="pvAdmin" style="margin-top:28px"></div>
    <p class="note" style="margin-top:10px">Links for "a room" use your Chaturbate room above. Creators add their own Chaturbate room name in Studio → Profile; their profile then shows an "Also live on Chaturbate" link. Test a link in a private window before you advertise it.</p>`;
  partnerVideosPanel();
  $('#pOn').onclick = (e) => e.currentTarget.classList.toggle('on');
  $('#pGrid').onclick = (e) => e.currentTarget.classList.toggle('on');
  $('#pBcGrid').onclick = (e) => e.currentTarget.classList.toggle('on');
  $$('[data-pon]').forEach(b => b.onclick = () => b.classList.toggle('on'));
  $$('input[name=prog]').forEach(r => r.onchange = () => $$('input[name=prog]').forEach(x => x.closest('label').style.borderColor = x.checked ? 'var(--pink)' : ''));
  $('#pSave').onclick = async () => {
    const ov = JSON.parse(JSON.stringify(overrides));
    ov.partners = ov.partners || {};
    ov.partners.CB = { enabled: $('#pOn').classList.contains('on'), program: ($('input[name=prog]:checked') || {}).value, campaign: $('#pCamp').value.trim(), houseRoom: $('#pHouse').value.trim(), roomTour: $('#pRoomTour').value, track: $('#pTrack').value.trim(), liveGrid: $('#pGrid').classList.contains('on') };
    ov.partners.BC = { liveGrid: $('#pBcGrid').classList.contains('on'), affiliateId: $('#pBcId').value.trim() };
    ov.partners.placements = Object.fromEntries($$('[data-pl]').map(tr => { const cur = d.placements.find(p => p.key === tr.dataset.pl); return [tr.dataset.pl, { slot: cur.slot, tour: $('[data-ptour]', tr).value, label: $('[data-plabel]', tr).value.trim(), sub: cur.sub || '', on: $('[data-pon]', tr).classList.contains('on'), ...(cur.room ? { room: cur.room } : {}) }]; }));
    await guard(() => X3API.put('/api/admin/config', { overrides: ov }), 'Partner links saved');
    partners();
  };
}

async function partnerVideosPanel() {
  const box = $('#pvAdmin'); if (!box) return;
  const d = await X3API.get('/api/admin/partner-videos');
  let filter = '';
  const rows = () => d.videos.filter(v => !filter || (v.performer + ' ' + v.title + ' ' + v.tags.join(' ')).toLowerCase().includes(filter));
  const paint = () => {
    const list = rows();
    $('#pvRows').innerHTML = list.map(v => `<tr data-id="${esc(v.id)}"><td><img src="${esc(v.thumbs[0])}" alt="" loading="lazy" style="width:96px;height:60px;object-fit:cover;border-radius:8px;display:block;background:#000"></td>
      <td><b>${esc(v.performer)}</b><div class="dim mono" style="font-size:11px">${esc(v.id)}</div></td><td style="max-width:380px">${esc(v.title)}<div class="dim" style="font-size:11px;margin-top:3px">${esc(v.tags.slice(0, 6).join(' · '))}</div></td>
      <td class="r">${fmt.num(v.clicks30d)}</td><td><button class="switch ${v.hidden ? '' : 'on'}" data-pvon aria-label="Show ${esc(v.id)}"></button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No videos.</td></tr>';
    $$('[data-pvon]', box).forEach(b => b.onclick = async () => { const id = b.closest('tr').dataset.id, v = d.videos.find(x => x.id === id); const hidden = b.classList.contains('on'); await guard(() => X3API.patch('/api/admin/partner-videos/' + encodeURIComponent(id), { hidden }), hidden ? 'Hidden from the site' : 'Shown on the site'); v.hidden = hidden; b.classList.toggle('on', !hidden); });
  };
  box.innerHTML = `<div class="row" style="justify-content:space-between;align-items:flex-end;margin-bottom:12px"><div><h3 class="t" style="margin:0">BongaCams video feed <small>${fmt.num(d.total)} videos · ${fmt.num(d.hidden)} hidden · shown on the fan app's Videos page</small></h3><p class="note" style="margin:4px 0 0">Import the video export file from your BongaCams affiliate account. Re-importing updates existing clips and keeps your hide choices. Clips whose title or tags imply a minor or non-consent are never imported.</p></div>
      <div class="row"><input class="inp" id="pvFilter" placeholder="Filter by performer, title, tag" style="width:240px"><label class="btn pri" style="cursor:pointer">Import feed file<input type="file" id="pvFile" accept=".txt,text/plain" hidden></label></div></div>
    <div id="pvResult"></div>
    <div class="panel tbl-wrap"><table class="tbl"><thead><tr><th>Preview</th><th>Performer</th><th>Title</th><th class="r">Clicks · 30d</th><th>On site</th></tr></thead><tbody id="pvRows"></tbody></table></div>`;
  $('#pvFilter').oninput = (e) => { filter = e.target.value.trim().toLowerCase(); paint(); };
  $('#pvFile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast('Feed file is over 5 MB', 'err');
    const text = await f.text();
    const r = await guard(() => X3API.post('/api/admin/partner-videos/import', { text, name: f.name }));
    $('#pvResult').innerHTML = `<div class="panel pad" style="margin-bottom:12px"><b>${fmt.num(r.added)} added · ${fmt.num(r.updated)} updated · ${fmt.num(r.skipped.length)} skipped</b>${r.skipped.length ? `<ul class="list" style="margin-top:8px">${r.skipped.slice(0, 20).map(s => `<li><span class="mono">${esc(s.id)}</span><span class="dim">${esc(s.reason)}</span></li>`).join('')}</ul>` : ''}</div>`;
    const fresh = await X3API.get('/api/admin/partner-videos'); Object.assign(d, fresh); paint();
  };
  paint();
}

/* ---------------- economy ---------------- */
async function economy() {
  const { overrides, effective } = await X3API.get('/api/admin/config');
  const q = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), effective);
  const quick = [['welcomeDiamonds', 'Welcome diamonds'], ['beanUsd', 'Bean cash-out value (USD)'], ['minPayoutBeans', 'Minimum payout (beans)'], ['payoutWeeklyCapBeans', 'Weekly payout cap (beans)'], ['firstPurchaseMultiplier', 'First purchase multiplier'], ['defaultDailyCapUsd', 'Default daily purchase cap (USD)'], ['vipRenewRate', 'VIP renew price (fraction of list)'], ['agencyCommissionPct', 'Agency commission (%)'], ['dayOffsetMinutes', 'Day reset offset (minutes from UTC)']];
  main().innerHTML = head('Economy', 'Every number in the diamond economy. Changes apply instantly to the server and every fan app on next load.', '<button class="btn pri" id="saveQ">Save quick settings</button>') + `
    <div class="grid g3">${quick.map(([k, l]) => `<label class="panel pad field"><span>${esc(l)}</span><input class="inp" type="number" step="any" data-q="${k}" value="${esc(q(k))}"></label>`).join('')}</div>
    <div class="panel pad" style="margin-top:16px"><h3 class="t">Affiliates <small>{room} {campaign} {source} placeholders · https only</small></h3><p class="note" style="margin:0 0 12px">Chaturbate links are managed in <a href="#partners" style="color:var(--pink-2)">Partners</a>${(effective.partners && effective.partners.CB && effective.partners.CB.enabled) ? '' : ' (currently turned off there, so the template below is used)'}.</p><div class="grid g2">${Object.entries(effective.affiliates || {}).filter(([site]) => site !== 'CB' || !(effective.partners && effective.partners.CB && effective.partners.CB.enabled)).map(([site, a]) => `<label class="field"><span>${esc(a.name)} (${site})</span><input class="inp" data-aff="${site}" value="${esc(a.url)}" placeholder="https://… your affiliate link with {room}"></label>`).join('')}</div></div>
    <div class="panel pad" style="margin-top:16px"><h3 class="t">Advanced overrides <small>JSON merged over defaults · gifts, VIP, boxes, odds, packs, items…</small></h3><textarea class="inp code" id="ov">${esc(JSON.stringify(overrides, null, 2))}</textarea><div class="row" style="margin-top:10px"><button class="btn pri" id="saveJ">Validate & save JSON</button><button class="btn" id="showEff">View effective config</button><span class="note">Box odds must sum to 1. Arrays replace the default list entirely.</span></div></div>`;
  const save = async (ov) => { await guard(() => X3API.put('/api/admin/config', { overrides: ov }), 'Economy updated'); economy(); };
  $('#saveQ').onclick = () => {
    const ov = JSON.parse(JSON.stringify(overrides));
    $$('[data-q]').forEach(i => { const v = Number(i.value); if (Number.isFinite(v) && v !== q(i.dataset.q)) ov[i.dataset.q] = v; });
    $$('[data-aff]').forEach(i => { const cur = (effective.affiliates || {})[i.dataset.aff] || {}; if (i.value.trim() !== (cur.url || '')) { ov.affiliates = ov.affiliates || {}; ov.affiliates[i.dataset.aff] = { name: cur.name, url: i.value.trim() }; } });
    save(ov);
  };
  $('#saveJ').onclick = () => { let ov; try { ov = JSON.parse($('#ov').value || '{}'); } catch (e) { return toast('JSON error: ' + e.message, 'err'); } save(ov); };
  $('#showEff').onclick = () => { const m = modal(`<h3>Effective config</h3><textarea class="inp code" readonly>${esc(JSON.stringify(effective, null, 2))}</textarea><button class="btn" data-x>Close</button>`); m.root.style.width = 'min(900px,100%)'; $('[data-x]', m.root).onclick = m.close; };
}

/* ---------------- ledger + audit ---------------- */
async function ledger() {
  const { gifts, orders } = await X3API.get('/api/admin/ledger');
  main().innerHTML = head('Ledger', 'Latest gifts and diamond purchases.') + `<div class="grid g2">
    <div class="panel tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Fan</th><th>Creator</th><th>Gift</th><th class="r">💎</th><th class="r">Beans</th></tr></thead><tbody>${gifts.map(g => `<tr><td class="dim">${fmt.ago(g.created_at)}</td><td>${esc(g.fan)}</td><td>${esc(g.creator)}</td><td>${esc(g.gift_id)} ×${g.qty}</td><td class="r num">${fmt.num(g.diamonds)}</td><td class="r num">${fmt.num(g.beans + g.bonus_beans)}</td></tr>`).join('')}</tbody></table></div>
    <div class="panel tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Fan</th><th>Pack</th><th class="r">USD</th><th class="r">💎</th><th>Status</th></tr></thead><tbody>${orders.map(o => `<tr><td class="dim">${fmt.ago(o.created_at)}</td><td>${esc(o.fan)}</td><td class="mono">${esc(o.pack_id)}</td><td class="r num">${fmt.usd(o.usd)}</td><td class="r num">${fmt.num(o.diamonds)}</td><td><span class="tag ${o.status}">${o.status}</span>${o.test ? ' <span class="tag demo">test</span>' : ''}</td></tr>`).join('')}</tbody></table></div></div>`;
}
async function audit() {
  const { rows } = await X3API.get('/api/admin/audit');
  main().innerHTML = head('Audit log', 'Every admin action, newest first.') + `<div class="panel tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>${rows.map(a => `<tr><td>${fmt.date(a.created_at)}</td><td>${esc(a.actor || 'system')}</td><td class="mono">${esc(a.action)}</td><td class="mono">${esc(a.target)}</td><td class="mono dim" style="font-size:11.5px;max-width:420px;overflow:hidden;text-overflow:ellipsis">${esc(JSON.stringify(a.data))}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No actions yet.</td></tr>'}</tbody></table></div>`;
}

boot();
})();
