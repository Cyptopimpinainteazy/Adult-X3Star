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
  const nav = [['overview', 'Overview'], ['applications', 'Applications', 'applications'], ['users', 'Users'], ['creators', 'Creators'], ['moderation', 'Moderation', 'uploads'], ['payouts', 'Payouts', 'payouts'], ['reports', 'Reports', 'reports'], ['traffic', 'Traffic'], ['economy', 'Economy'], ['ledger', 'Ledger'], ['audit', 'Audit log']];
  app.innerHTML = `<div class="shell"><aside class="side" id="side"><div class="brand">x3<span>STAR</span><small>Admin</small></div>
    ${nav.map(([k, l, c]) => `<a class="nav" href="#${k}" data-v="${k}">${l}${c ? `<span class="cnt" data-cnt="${c}" hidden></span>` : ''}</a>`).join('')}
    <div class="foot"><span>${esc(me.name)} · admin</span><a href="/" target="_blank" rel="noopener">Open fan app ↗</a><a href="/studio" target="_blank" rel="noopener">Creator Studio ↗</a><button class="btn sm" id="out">Sign out</button></div></aside>
    <button class="btn burger" id="burger" aria-label="Menu">☰</button><main class="main" id="main"></main></div>`;
  $('#out').onclick = async () => { await X3API.post('/api/auth/logout'); location.href = '/'; };
  $('#burger').onclick = () => $('#side').classList.toggle('open');
  router({ overview, applications, users, creators, moderation, payouts, reports, traffic, economy, ledger, audit }, 'overview');
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

/* ---------------- traffic ---------------- */
async function traffic() {
  const t = await X3API.get('/api/admin/traffic?days=14');
  main().innerHTML = head('Affiliate <em>traffic</em>', 'Clicks on "Also live on" links. Each click is logged, then forwarded to your affiliate URL for that site (set them in Economy → Affiliates).') + `
    <div class="grid g3"><div class="panel kpi"><small>Clicks · 14d</small><b>${fmt.num(t.total)}</b></div><div class="panel kpi"><small>Unique visitors</small><b>${fmt.num(t.unique)}</b></div><div class="panel kpi"><small>Top site</small><b>${esc(t.bySite[0] ? t.bySite[0].site : '—')}</b><span>${t.bySite[0] ? fmt.num(t.bySite[0].clicks) + ' clicks' : ''}</span></div></div>
    <div class="panel pad" style="margin-top:16px"><h3 class="t">Clicks per day</h3>${bars(t.series, (v, i) => `${new Date(Date.now() - (t.days - 1 - i) * 864e5).toISOString().slice(5, 10)} · ${v}`, 'blue')}</div>
    <div class="grid g3" style="margin-top:16px"><div class="panel pad"><h3 class="t">By site</h3><ul class="list">${t.bySite.map(x => `<li><span>${esc(x.site)}</span><b>${fmt.num(x.clicks)}</b></li>`).join('') || '<li class="dim">No clicks yet</li>'}</ul></div>
      <div class="panel pad"><h3 class="t">By creator</h3><ul class="list">${t.byCreator.map(x => `<li><span>${esc(x.name || x.creator_id)}</span><b>${fmt.num(x.clicks)}</b></li>`).join('') || '<li class="dim">No clicks yet</li>'}</ul></div>
      <div class="panel pad"><h3 class="t">By campaign</h3><ul class="list">${t.byCampaign.map(x => `<li><span>${esc(x.campaign)} <span class="dim">· ${esc(x.source)}</span></span><b>${fmt.num(x.clicks)}</b></li>`).join('') || '<li class="dim">No clicks yet</li>'}</ul></div></div>`;
}

/* ---------------- economy ---------------- */
async function economy() {
  const { overrides, effective } = await X3API.get('/api/admin/config');
  const q = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), effective);
  const quick = [['welcomeDiamonds', 'Welcome diamonds'], ['beanUsd', 'Bean cash-out value (USD)'], ['minPayoutBeans', 'Minimum payout (beans)'], ['payoutWeeklyCapBeans', 'Weekly payout cap (beans)'], ['firstPurchaseMultiplier', 'First purchase multiplier'], ['defaultDailyCapUsd', 'Default daily purchase cap (USD)'], ['vipRenewRate', 'VIP renew price (fraction of list)'], ['agencyCommissionPct', 'Agency commission (%)'], ['dayOffsetMinutes', 'Day reset offset (minutes from UTC)']];
  main().innerHTML = head('Economy', 'Every number in the diamond economy. Changes apply instantly to the server and every fan app on next load.', '<button class="btn pri" id="saveQ">Save quick settings</button>') + `
    <div class="grid g3">${quick.map(([k, l]) => `<label class="panel pad field"><span>${esc(l)}</span><input class="inp" type="number" step="any" data-q="${k}" value="${esc(q(k))}"></label>`).join('')}</div>
    <div class="panel pad" style="margin-top:16px"><h3 class="t">Affiliates <small>{room} {campaign} {source} placeholders · https only</small></h3><div class="grid g2">${Object.entries(effective.affiliates || {}).map(([site, a]) => `<label class="field"><span>${esc(a.name)} (${site})</span><input class="inp" data-aff="${site}" value="${esc(a.url)}" placeholder="https://… your affiliate link with {room}"></label>`).join('')}</div></div>
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
