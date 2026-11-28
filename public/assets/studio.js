/* x3STAR Creator Studio */
(() => {
'use strict';
const { $, $$, el, esc, fmt, toast, modal, confirmBox, bars, uploadWithProgress, guard, router } = window.Dash;
const app = $('#app');
let me = null, D = null;   // D = /api/studio payload
const SITES = { CB: 'Chaturbate', SC: 'Stripchat', BC: 'BongaCams', C4: 'CAM4' };
const NICHES = ['BigBoobs', 'Goth/Emo/Punk', 'Femdom', 'Other'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ---------------- login gate ---------------- */
function gate(msg) {
  app.innerHTML = `<div class="gate"><form class="panel gate-card" id="lg"><span class="eyebrow">x3STAR</span><h1>Creator <em style="color:var(--pink-2)">Studio</em></h1>
    ${msg ? `<p class="mute" style="margin:-6px 0 16px">${esc(msg)}</p>` : ''}
    <label class="field"><span>Email</span><input class="inp" name="email" type="email" autocomplete="email" required></label>
    <label class="field" style="margin-top:12px"><span>Password</span><input class="inp" name="password" type="password" autocomplete="current-password" required></label>
    <p class="note" id="lgErr" style="color:var(--red);min-height:18px"></p>
    <button class="btn pri lg" style="width:100%">Sign in</button>
    <p class="note" style="margin-top:14px">Not a creator yet? <a href="/#creators" style="color:var(--pink-2)">Apply on x3STAR</a>.</p></form></div>`;
  $('#lg').onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    try { await X3API.post('/api/auth/login', { email: f.email.value, password: f.password.value }); boot(); }
    catch (ex) { $('#lgErr').textContent = ex.message; }
  };
}

async function boot() {
  try { me = (await X3API.get('/api/me')).user; } catch { me = null; }
  if (!me) return gate();
  if (!['creator', 'agent', 'admin'].includes(me.role)) return gate('This account is a fan account. Creator Studio needs an approved creator profile.');
  if (me.role !== 'agent') { try { D = await X3API.get('/api/studio' + location.search); } catch (e) { if (me.role === 'admin') return gate('Admins: open Studio with ?as=<creatorId> — or sign in with a creator account.'); return gate(e.message); } }
  shell();
}
async function reload() { if (me.role !== 'agent') D = await X3API.get('/api/studio' + location.search); }

/* ---------------- shell ---------------- */
function shell() {
  const isAgent = me.role === 'agent';
  const pending = D ? D.uploads.filter(u => u.status === 'pending').length : 0;
  app.innerHTML = `<div class="shell"><aside class="side" id="side">
      <div class="brand">x3<span>STAR</span><small>Studio</small></div>
      ${isAgent ? '' : `<a class="nav" href="#overview" data-v="overview">Overview</a><a class="nav" href="#profile" data-v="profile">Profile</a><a class="nav" href="#media" data-v="media">Media & stories ${pending ? `<span class="cnt">${pending}</span>` : ''}</a><a class="nav" href="#store" data-v="store">Store</a><a class="nav" href="#jobs" data-v="jobs">Jobs & available work</a><a class="nav" href="#earnings" data-v="earnings">Earnings</a><a class="nav" href="#live" data-v="live">Go live & filters</a>`}
      ${isAgent || me.role === 'admin' ? '<a class="nav" href="#agency" data-v="agency">Agency</a>' : ''}
      <div class="foot"><span>${esc(me.name)} · <span class="mono">${esc(me.role)}</span></span>${D ? `<a href="/#member-${esc(D.creator.id)}" target="_blank" rel="noopener" style="color:var(--pink-2)">View public profile ↗</a>` : ''}<a href="/">← Back to x3STAR</a><button class="btn sm" id="out">Sign out</button></div>
    </aside><button class="btn burger" id="burger" aria-label="Menu">☰</button><main class="main" id="main"></main></div>`;
  $('#out').onclick = async () => { await X3API.post('/api/auth/logout'); location.href = '/'; };
  $('#burger').onclick = () => $('#side').classList.toggle('open');
  const views = isAgent ? { agency } : { overview, profile, media, store, jobs, earnings, live, agency };
  router(views, isAgent ? 'agency' : 'overview');
}
const main = () => $('#main');
const head = (title, sub, actions = '') => `<div class="ph"><div><span class="eyebrow">${esc(D ? D.creator.name : me.name)}</span><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="row">${actions}</div></div>`;

/* ---------------- overview ---------------- */
function overview() {
  const c = D.creator, a = D.analytics, e = D.economy;
  const nt = a.nextTier, tierPct = nt ? Math.min(100, a.beans30d / nt.min30d * 100) : 100;
  const hours = Array.from({ length: 24 }, (_, h) => (a.hours.find(x => x.h === h) || {}).diamonds || 0);
  main().innerHTML = head('Tonight\'s <em>numbers</em>', `${c.live ? '<span class="tag live">● live</span>' : '<span class="tag">offline</span>'} · KYC <span class="tag ${esc(c.kyc)}">${esc(c.kyc)}</span> · Host tier <b>${esc(a.tier.name)}</b>`, `<a class="btn" href="#media">Upload</a><a class="btn pri" href="#live">${c.live ? 'Live settings' : 'Go live'}</a>`) + `
    <div class="grid g5"><div class="panel kpi"><small>Beans balance</small><b>${fmt.num(c.beans)}</b><span>≈ ${fmt.usd(c.beans * e.beanUsd)}</span></div>
      <div class="panel kpi"><small>Beans · 30d</small><b>${fmt.num(a.beans30d)}</b><span>${fmt.usd(a.beans30d * e.beanUsd)}</span></div>
      <div class="panel kpi"><small>Unique gifters · 30d</small><b>${fmt.num(a.uniqueGifters)}</b><span>people who gifted you</span></div>
      <div class="panel kpi"><small>Lifetime beans</small><b>${fmt.k(c.beansTotal)}</b><span>${fmt.usd(c.beansTotal * e.beanUsd)}</span></div>
      <div class="panel kpi ${nt ? '' : 'alert'}"><small>Host tier</small><b style="font-size:18px">${esc(a.tier.name)} · +${a.tier.bonusPct}%</b><div class="prog"><i style="width:${tierPct}%"></i></div><span>${nt ? `${fmt.num(nt.min30d - a.beans30d)} beans to ${esc(nt.name)}` : 'Top tier'}</span></div></div>
    <div class="grid g2" style="margin-top:16px">
      <div class="panel pad"><h3 class="t">Beans · last 14 days <small>${fmt.num(a.series.reduce((s, x) => s + x.beans, 0))} total</small></h3>${bars(a.series.map(x => x.beans), (v, i) => `${a.series[i].day} · ${fmt.num(v)} beans · ${a.series[i].gifts} gifts`)}<div class="axis"><span>${a.series[0].day}</span><span>today</span></div></div>
      <div class="panel pad"><h3 class="t">When fans gift <small>30 days · by hour</small></h3>${bars(hours, (v, h) => `${(h % 12) || 12}${h < 12 ? 'am' : 'pm'} · ${fmt.num(v)} 💎`, 'blue')}<div class="axis"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div><p class="note">Schedule your streams around your tallest bars — that's when your regulars spend.</p></div>
    </div>
    <div class="grid g3" style="margin-top:16px">
      <div class="panel pad"><h3 class="t">Top fans <small>7 days</small></h3>${c.topFans.length ? `<ul class="list">${c.topFans.map((f, i) => `<li><span>${i + 1}. ${esc(f.name)}</span><b>💎 ${fmt.num(f.diamonds)}</b></li>`).join('')}</ul>` : '<p class="note">No gifts yet this week.</p>'}</div>
      <div class="panel pad"><h3 class="t">Best gifts <small>30 days</small></h3>${a.byGift.length ? `<ul class="list">${a.byGift.slice(0, 8).map(g => { const gg = e.gifts.find(x => x.id === g.gift_id) || {}; return `<li><span>${gg.icon || '🎁'} ${esc(gg.name || g.gift_id)} ×${fmt.num(g.qty)}</span><b>${fmt.num(g.diamonds)}</b></li>`; }).join('')}</ul>` : '<p class="note">No gifts yet.</p>'}</div>
      <div class="panel pad"><h3 class="t">Recent gifts</h3>${D.recentGifts.length ? `<ul class="list">${D.recentGifts.slice(0, 10).map(g => { const gg = e.gifts.find(x => x.id === g.gift_id) || {}; return `<li><span>${esc(g.name)} · ${gg.icon || '🎁'} ×${g.qty}</span><b class="up">+${fmt.num(g.beans + g.bonus_beans)}</b></li>`; }).join('')}</ul>` : '<p class="note">Gifts will appear here live.</p>'}</div>
    </div>`;
}

/* ---------------- profile ---------------- */
function profile() {
  const c = D.creator;
  const av = D.uploads.find(u => u.kind === 'avatar'), cv = D.uploads.find(u => u.kind === 'cover');
  main().innerHTML = head('Your <em>profile</em>', 'What fans see on your card, member page and store.', '<button class="btn pri" id="save">Save profile</button>') + `
    <div class="grid g3">
      <div class="panel pad" style="grid-column:span 2"><form id="pf" class="grid g2" onsubmit="return false">
        <label class="field"><span>Display name</span><input class="inp" name="name" value="${esc(c.name)}" maxlength="40"></label>
        <label class="field"><span>Coin ticker</span><input class="inp" name="ticker" value="${esc(c.ticker)}" maxlength="5" style="text-transform:uppercase"></label>
        <label class="field"><span>Niche</span><select class="inp" name="niche">${NICHES.map(n => `<option ${n === c.niche ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>Tags (comma, up to 6)</span><input class="inp" name="tags" value="${esc(c.tags.join(', '))}"></label>
        <label class="field" style="grid-column:1/-1"><span>Bio</span><textarea class="inp" name="bio" maxlength="600">${esc(c.bio)}</textarea></label>
        <label class="field"><span>Public city / region (optional)</span><input class="inp" name="networkCity" value="${esc(c.networkCity || '')}" maxlength="80" placeholder="e.g. Denver"><small class="note">Shown in talent search. Use a broad area; leave blank to keep it private.</small></label>
        <label class="field"><span>Public U.S. state (optional)</span><select class="inp" name="networkState"><option value="">Not shared / outside the U.S.</option>${(D.networkStates || []).map(s => `<option value="${esc(s.slug)}"${s.slug === c.networkState ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select><small class="note">Your choice is public and self-declared. Never enter a home address.</small></label>
        <div class="field" style="grid-column:1/-1"><span>Where you stream</span><div class="chips">${Object.entries(SITES).map(([k, v]) => `<button type="button" class="chip ${c.sites.includes(k) ? 'on' : ''}" data-site="${k}">${v}</button>`).join('')}<span class="chip on" style="pointer-events:none">x3STAR</span></div></div>
        <div class="field" style="grid-column:1/-1"><span>Usernames on other sites (powers "Also live on" links)</span><div class="grid g4">${Object.entries(SITES).map(([k, v]) => `<input class="inp" name="h_${k}" placeholder="${v} username" value="${esc((c.handles || {})[k] || '')}" maxlength="40">`).join('')}</div></div>
        <label class="field"><span>Card color 1</span><input class="inp" type="color" name="hue0" value="${esc(c.hues[0])}" style="padding:4px"></label>
        <label class="field"><span>Card color 2</span><input class="inp" type="color" name="hue1" value="${esc(c.hues[1])}" style="padding:4px"></label>
        <label class="field"><span>Goal label</span><input class="inp" name="goalLabel" value="${esc(c.goal.label || '')}" maxlength="60" placeholder="e.g. Lights-low ASMR"></label>
        <label class="field"><span>Goal target (tokens)</span><input class="inp" type="number" name="goalTarget" value="${esc(c.goal.target || 2500)}" min="10"></label>
        <label class="field" style="grid-column:1/-1"><span>Offline note (shown when you're off air)</span><input class="inp" name="back" value="${esc(c.back || '')}" maxlength="40" placeholder="Back tonight 10 PM"></label>
      </form></div>
      <div class="grid" style="align-content:start">
        <div class="panel pad"><h3 class="t">Avatar</h3><div class="row"><div class="ava" style="background-image:url(${av ? esc(av.url) : ''})"></div><div><label class="btn sm">Upload<input type="file" accept="image/*" hidden data-up="avatar"></label>${av ? `<p class="note">Status: <span class="tag ${av.status}">${av.status}</span></p>` : '<p class="note">Square image, at least 400×400.</p>'}</div></div></div>
        <div class="panel pad"><h3 class="t">Cover</h3><div class="cover" style="background-image:url(${cv ? esc(cv.url) : ''})"></div><div class="row" style="margin-top:10px"><label class="btn sm">Upload<input type="file" accept="image/*" hidden data-up="cover"></label>${cv ? `<span class="tag ${cv.status}">${cv.status}</span>` : ''}</div><p class="note">Shown on your card and member page. Portrait 3:4 works best.</p></div>
      </div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="panel pad"><h3 class="t">Tip menu <button class="btn sm" id="tmAdd">+ Add</button></h3><div id="tm">${c.tipMenu.map(t => tmRow(t)).join('')}</div></div>
      <div class="panel pad"><h3 class="t">Weekly schedule <button class="btn sm" id="schAdd">+ Add</button></h3><div id="sch">${c.schedule.map(s => schRow(s)).join('')}</div></div>
    </div>`;
  $$('[data-site]').forEach(b => b.onclick = () => b.classList.toggle('on'));
  $('#tmAdd').onclick = () => $('#tm').appendChild(el(tmRow({ label: '', price: 50 })));
  $('#schAdd').onclick = () => $('#sch').appendChild(el(schRow({ day: 'Fri', time: '22:00', title: '' })));
  main().addEventListener('click', (e) => { const x = e.target.closest('[data-del-row]'); if (x) x.parentElement.remove(); });
  $$('[data-up]').forEach(inp => inp.onchange = () => upload(inp.files[0], inp.dataset.up).then(() => profile()));
  $('#save').onclick = async () => {
    const f = $('#pf');
    const body = {
      name: f.name.value, ticker: f.ticker.value.toUpperCase(), niche: f.niche.value, bio: f.bio.value, back: f.back.value,
      networkCity: f.networkCity.value.trim(), networkState: f.networkState.value,
      tags: f.tags.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 6),
      sites: $$('[data-site].on').map(b => b.dataset.site), hues: [f.hue0.value, f.hue1.value],
      handles: Object.fromEntries(Object.keys(SITES).map(k => [k, f['h_' + k].value.trim()])),
      goal: f.goalLabel.value.trim() ? { label: f.goalLabel.value.trim(), target: Number(f.goalTarget.value) || 2500 } : undefined,
      tipMenu: $$('#tm .tm-row').map(r => ({ label: $('[name=l]', r).value.trim(), price: Number($('[name=p]', r).value) })).filter(t => t.label),
      schedule: $$('#sch .sch-row').map(r => ({ day: $('[name=d]', r).value, time: $('[name=t]', r).value, title: $('[name=ti]', r).value.trim() })).filter(s => s.title)
    };
    await guard(() => X3API.put('/api/studio/profile' + location.search, body), 'Profile saved'); await reload();
  };
}
const tmRow = (t) => `<div class="tm-row"><input class="inp" name="l" value="${esc(t.label)}" placeholder="Menu item" maxlength="40"><input class="inp" name="p" type="number" min="1" value="${esc(t.price)}"><button class="btn sm" type="button" data-del-row aria-label="Remove">✕</button></div>`;
const schRow = (s) => `<div class="sch-row"><select class="inp" name="d">${DAYS.map(d => `<option ${d === s.day ? 'selected' : ''}>${d}</option>`).join('')}</select><input class="inp" name="t" type="time" value="${esc(s.time)}"><input class="inp" name="ti" value="${esc(s.title)}" placeholder="Show title" maxlength="60"><button class="btn sm" type="button" data-del-row aria-label="Remove">✕</button></div>`;

async function upload(file, kind, caption = '', onProgress) {
  if (!file) return null;
  const r = await guard(() => uploadWithProgress('/api/studio/upload' + location.search, { kind, caption }, file, onProgress));
  toast(r.upload.status === 'approved' ? 'Uploaded and live' : 'Uploaded — visible to fans after review', 'ok');
  await reload(); return r.upload;
}

/* ---------------- media ---------------- */
let mediaTab = 'all';
function media() {
  const list = D.uploads.filter(u => mediaTab === 'all' ? true : mediaTab === 'pending' ? u.status === 'pending' : u.kind === mediaTab);
  main().innerHTML = head('Media & <em>stories</em>', 'Gallery posts appear on your member page and in Clips. Stories disappear after 24 hours. Everything is reviewed before it goes public.') + `
    <div class="panel pad" style="margin-bottom:16px"><div class="row" style="margin-bottom:12px"><div class="tabs" id="kindTabs" style="margin:0"><button data-k="gallery" class="on">Gallery post</button><button data-k="story">24h story</button></div><input class="inp" id="cap" placeholder="Caption (optional)" maxlength="200" style="flex:1;min-width:200px"></div>
      <label class="drop" id="drop"><b>Drop photos or videos</b>JPG · PNG · WEBP · GIF · MP4 · WEBM · MOV — up to 50 MB each<input type="file" id="files" accept="image/*,video/*" multiple hidden></label><div id="queue"></div></div>
    <div class="tabs" id="mTabs">${[['all', 'All'], ['pending', 'In review'], ['gallery', 'Gallery'], ['story', 'Stories'], ['avatar', 'Avatar'], ['cover', 'Cover'], ['product', 'Products']].map(([k, l]) => `<button data-t="${k}" class="${k === mediaTab ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${list.length ? `<div class="media-grid">${list.map(u => `<div class="panel mcard"><div class="mv">${u.type === 'video' ? `<video src="${esc(u.url)}" muted playsinline preload="metadata" controls></video>` : `<img src="${esc(u.url)}" alt="" loading="lazy">`}<span class="tag ${u.status}">${u.status}</span><span class="tag kind">${u.kind}</span></div>
      <div class="mb">${u.status === 'rejected' && u.rejectReason ? `<span style="color:var(--red)">${esc(u.rejectReason)}</span>` : ''}<input class="inp" value="${esc(u.caption)}" data-cap="${u.id}" placeholder="Caption" style="height:34px"><div class="row" style="justify-content:space-between"><span class="dim">${fmt.bytes(u.size)} · ${u.kind === 'story' ? (Date.now() - u.at > 864e5 ? 'expired' : 'expires ' + new Date(u.at + 864e5).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })) : fmt.ago(u.at)}</span><button class="btn sm red" data-del="${u.id}">Delete</button></div></div></div>`).join('')}</div>` : '<div class="panel empty">Nothing here yet.</div>'}`;
  let kind = 'gallery';
  $$('#kindTabs button').forEach(b => b.onclick = () => { kind = b.dataset.k; $$('#kindTabs button').forEach(x => x.classList.toggle('on', x === b)); });
  $$('#mTabs button').forEach(b => b.onclick = () => { mediaTab = b.dataset.t; media(); });
  const drop = $('#drop'), files = $('#files');
  const run = async (fl) => {
    for (const f of fl) {
      const row = el(`<div style="margin-top:12px"><div class="row" style="justify-content:space-between"><span>${esc(f.name)}</span><span class="dim mono">${fmt.bytes(f.size)}</span></div><div class="prog"><i></i></div></div>`); $('#queue').appendChild(row);
      try { await upload(f, kind, $('#cap').value, (p) => { $('i', row).style.width = (p * 100).toFixed(0) + '%'; }); $('i', row).style.width = '100%'; } catch { $('i', row).style.background = 'var(--red)'; }
    }
    setTimeout(media, 600);
  };
  files.onchange = () => run([...files.files]);
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => run([...e.dataTransfer.files]));
  $$('[data-cap]').forEach(i => i.onchange = () => guard(() => X3API.patch('/api/studio/upload/' + i.dataset.cap + location.search, { caption: i.value }), 'Caption saved'));
  $$('[data-del]').forEach(b => b.onclick = async () => { if (await confirmBox('Delete this file?', 'It will be removed from your profile, stories and clips.', 'Delete', true)) { await guard(() => X3API.del('/api/studio/upload/' + b.dataset.del + location.search), 'Deleted'); await reload(); media(); } });
}

/* ---------------- store ---------------- */
function store() {
  const c = D.creator, imgs = D.uploads.filter(u => u.kind === 'product' && u.type === 'image');
  main().innerHTML = head('Your <em>store</em>', 'Products appear on your member page, in the catalog and as a pin on your live stage.', '<button class="btn pri" id="add">+ Add product</button>') + `
    ${D.products.length ? `<div class="panel tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Product</th><th>Kind</th><th class="r">Price</th><th>Partner</th><th>Status</th><th></th></tr></thead><tbody>${D.products.map(p => `<tr><td>${p.image ? `<img src="${esc(p.image)}" alt="" style="width:44px;height:44px;border-radius:10px;object-fit:cover">` : '<span class="dim">—</span>'}</td><td><b>${esc(p.name)}</b><div class="note">${esc(p.note)}</div></td><td>${esc(p.kind)}</td><td class="r num">${fmt.usd(p.price)}</td><td class="dim">${esc(p.partner)}</td><td>${p.active ? '<span class="tag approved">active</span>' : '<span class="tag">hidden</span>'} ${c.pinnedProductId === p.id ? '<span class="tag live">pinned</span>' : ''}</td><td class="r"><div class="row" style="justify-content:flex-end"><button class="btn sm" data-pin="${p.id}">${c.pinnedProductId === p.id ? 'Unpin' : 'Pin to stage'}</button><button class="btn sm" data-edit="${p.id}">Edit</button><button class="btn sm red" data-del="${p.id}">Delete</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="panel empty">No products yet. Add toys, lingerie or merch — partners fulfil, you earn on every order.</div>'}`;
  const form = (p = {}) => {
    const m = modal(`<h3>${p.id ? 'Edit' : 'Add'} product</h3>
      <label class="field"><span>Name</span><input class="inp" name="name" value="${esc(p.name || '')}" maxlength="80"></label>
      <div class="grid g2"><label class="field"><span>Kind</span><select class="inp" name="kind">${['Toy', 'Lingerie', 'Merch', 'Custom'].map(k => `<option ${k === p.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></label><label class="field"><span>Price (USD)</span><input class="inp" name="price" type="number" min="1" step="0.01" value="${esc(p.price || 49)}"></label></div>
      <label class="field"><span>Description</span><textarea class="inp" name="note" maxlength="300">${esc(p.note || '')}</textarea></label>
      <label class="field"><span>Fulfilment partner</span><input class="inp" name="partner" value="${esc(p.partner || '')}" maxlength="60" placeholder="e.g. Lovense, Print on demand"></label>
      <div class="field"><span>Image</span><div class="row"><select class="inp" name="uploadId" style="flex:1"><option value="">No image</option>${imgs.map(u => `<option value="${u.id}" ${u.id === p.uploadId ? 'selected' : ''}>#${u.id} ${esc(u.caption || '')} (${u.status})</option>`).join('')}</select><label class="btn sm">Upload new<input type="file" accept="image/*" hidden id="pimg"></label></div></div>
      ${p.id ? `<label class="row"><input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''}> Visible in store</label>` : ''}
      <div class="row" style="justify-content:flex-end"><button class="btn" data-n>Cancel</button><button class="btn pri" data-y>Save</button></div>`);
    $('#pimg', m.root).onchange = async (e) => { const u = await upload(e.target.files[0], 'product'); if (u) { const o = el(`<option value="${u.id}" selected>#${u.id} (${u.status})</option>`); $('[name=uploadId]', m.root).appendChild(o); } };
    $('[data-n]', m.root).onclick = m.close;
    $('[data-y]', m.root).onclick = async () => {
      const g = (n) => $(`[name=${n}]`, m.root);
      const body = { name: g('name').value, kind: g('kind').value, price: Number(g('price').value), note: g('note').value, partner: g('partner').value, uploadId: g('uploadId').value || null };
      if (p.id) body.active = g('active').checked;
      await guard(() => p.id ? X3API.put('/api/studio/products/' + p.id + location.search, body) : X3API.post('/api/studio/products' + location.search, body), 'Saved');
      m.close(); await reload(); store();
    };
  };
  $('#add').onclick = () => form();
  $$('[data-edit]').forEach(b => b.onclick = () => form(D.products.find(p => p.id === +b.dataset.edit)));
  $$('[data-del]').forEach(b => b.onclick = async () => { if (await confirmBox('Delete product?', 'It will disappear from your store.', 'Delete', true)) { await guard(() => X3API.del('/api/studio/products/' + b.dataset.del + location.search), 'Deleted'); await reload(); store(); } });
  $$('[data-pin]').forEach(b => b.onclick = async () => { const id = +b.dataset.pin; await guard(() => X3API.post('/api/studio/pin' + location.search, { productId: c.pinnedProductId === id ? null : id }), c.pinnedProductId === id ? 'Unpinned' : 'Pinned to your stage'); await reload(); store(); });
}

/* ---------------- jobs and available work ---------------- */
const JOB_CATEGORIES = { editing: 'Editing', moderation: 'Moderation', design: 'Design', photography: 'Photography', collaboration: 'Collaboration', other: 'Other' };
const JOB_MODES = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };
let jobsView = 0;
async function jobs() {
  const version = ++jobsView;
  main().innerHTML = head('Your <em>jobs board</em>', 'Post openings for your team or list work you are available to do.') + '<div class="panel pad" role="status">Loading your listings…</div>';
  try {
    const { jobs: listings } = await X3API.get('/api/studio/jobs' + location.search);
    if (version !== jobsView || location.hash !== '#jobs') return;
    main().innerHTML = head('Your <em>jobs board</em>', 'Hiring and available-work posts appear on your profile while open and unexpired.', `<a class="btn" href="/stars/${encodeURIComponent(D.creator.id)}/jobs" target="_blank" rel="noopener">View public board ↗</a><button class="btn pri" id="add-job">+ Add listing</button>`) +
      `<p class="note">Inquiries stay in your private Studio inbox. Publishing a listing does not send emails, collect payments or confirm a booking.</p>` +
      (listings.length ? `<div class="grid g2">${listings.map(j => `<article class="panel pad"><div class="row" style="justify-content:space-between"><span class="tag">${j.kind === 'hiring' ? 'Hiring / collaborations' : 'Available for work'}</span><span class="tag ${j.status === 'open' ? 'approved' : ''}">${esc(j.status)}${j.status === 'open' && j.expiresAt <= Date.now() ? ' · expired' : ''}</span></div><h2 style="font:500 25px var(--serif)">${esc(j.title)}</h2><p class="note">${esc(JOB_CATEGORIES[j.category] || j.category)} · ${esc(JOB_MODES[j.workMode] || j.workMode)}${j.location ? ' · ' + esc(j.location) : ''}</p><p class="mute" style="font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere">${esc(j.description)}</p><b>${esc(j.compensation)}</b><p class="note">Expires ${fmt.date(j.expiresAt)}</p><div class="row" style="flex-wrap:wrap"><button class="btn sm" data-inbox="${j.id}">Inquiries${Number.isInteger(j.inquiryCount) ? ' · ' + j.inquiryCount : ''}</button>${j.status !== 'archived' ? `<button class="btn sm" data-edit-job="${j.id}">Edit</button>${j.status === 'open' ? `<button class="btn sm" data-close-job="${j.id}">Close listing</button>` : ''}<button class="btn sm red" data-archive-job="${j.id}">Archive</button>` : ''}</div></article>`).join('')}</div>` : '<div class="panel empty">Your board is ready. Add a hiring post or an available-for-work listing when you have something real to share.</div>');
    $('#add-job').onclick = () => jobForm();
    $$('[data-edit-job]').forEach(b => b.onclick = () => jobForm(listings.find(j => j.id === +b.dataset.editJob)));
    $$('[data-inbox]').forEach(b => b.onclick = () => jobInbox(listings.find(j => j.id === +b.dataset.inbox)));
    $$('[data-close-job]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      try { await X3API.put('/api/studio/jobs/' + b.dataset.closeJob + location.search, { status: 'closed' }); toast('Listing closed', 'ok'); if (location.hash === '#jobs') jobs(); }
      catch (e) { toast(e.message, 'err'); b.disabled = false; }
    });
    $$('[data-archive-job]').forEach(b => b.onclick = async () => {
      if (!await confirmBox('Archive this listing?', 'It will leave the public board. Its private inquiry records will be retained.', 'Archive', true)) return;
      b.disabled = true;
      try { await X3API.del('/api/studio/jobs/' + b.dataset.archiveJob + location.search); toast('Listing archived', 'ok'); if (location.hash === '#jobs') jobs(); }
      catch (e) { toast(e.message, 'err'); b.disabled = false; }
    });
  } catch (e) {
    if (version !== jobsView || location.hash !== '#jobs') return;
    main().innerHTML = head('Your <em>jobs board</em>', '') + `<div class="panel pad"><p role="alert">${esc(e.message)}</p><button class="btn" id="retry-jobs">Try again</button></div>`;
    $('#retry-jobs').onclick = jobs;
  }
}
function jobForm(job = {}) {
  const dateInput = new Date(job.expiresAt > Date.now() ? job.expiresAt : Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const options = (values, selected) => Object.entries(values).map(([value, label]) => `<option value="${value}"${selected === value ? ' selected' : ''}>${label}</option>`).join('');
  const m = modal(`<form id="job-editor"><h3>${job.id ? 'Edit' : 'Add'} listing</h3><label class="field"><span>What are you posting?</span><select class="inp" name="kind">${options({ hiring: 'Hiring / seeking collaborators', available: 'Available for work' }, job.kind || 'hiring')}</select></label><label class="field"><span>Title</span><input class="inp" name="title" required minlength="3" maxlength="100" value="${esc(job.title || '')}" placeholder="e.g. Video editor for weekly clips"></label><label class="field"><span>Description and scope</span><textarea class="inp" name="description" required minlength="20" maxlength="3000" rows="5">${esc(job.description || '')}</textarea></label><div class="grid g2"><label class="field"><span>Category</span><select class="inp" name="category">${options(JOB_CATEGORIES, job.category || 'other')}</select></label><label class="field"><span>Work arrangement</span><select class="inp" name="workMode">${options(JOB_MODES, job.workMode || 'remote')}</select></label></div><label class="field"><span>Broad location (optional; avoid a home address)</span><input class="inp" name="location" maxlength="100" value="${esc(job.location || '')}" placeholder="e.g. Colorado or US time zones"></label><label class="field"><span>Compensation / rate / budget</span><input class="inp" name="compensation" required minlength="3" maxlength="160" value="${esc(job.compensation || '')}" placeholder="State the terms or explain what needs discussion"></label><div class="grid g2"><label class="field"><span>Status</span><select class="inp" name="status">${options({ draft: 'Draft — only you can see it', open: 'Open — publish on profile', closed: 'Closed — hide from profile' }, job.status || 'draft')}</select></label><label class="field"><span>Expires on (UTC, within 180 days)</span><input class="inp" name="expiry" type="date" required value="${dateInput}" min="${new Date().toISOString().slice(0, 10)}" max="${new Date(Date.now() + 179 * 86400000).toISOString().slice(0, 10)}"></label></div><p class="note" id="job-editor-error" role="alert"></p><div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-cancel>Cancel</button><button class="btn pri" type="submit">Save listing</button></div></form>`);
  $('[data-cancel]', m.root).onclick = m.close;
  const arrangement = $('[name=workMode]', m.root), locationInput = $('[name=location]', m.root);
  const locationRequired = () => { locationInput.required = arrangement.value !== 'remote'; locationInput.minLength = locationInput.required ? 2 : 0; };
  arrangement.onchange = locationRequired; locationRequired();
  $('#job-editor', m.root).onsubmit = async e => {
    e.preventDefault();
    const form = e.target, f = form.elements, save = $('button[type=submit]', form);
    if (save.disabled || !form.reportValidity()) return;
    const body = { kind: f.kind.value, title: f.title.value, description: f.description.value, category: f.category.value, workMode: f.workMode.value, location: f.location.value, compensation: f.compensation.value, status: f.status.value, expiresAt: new Date(f.expiry.value + 'T23:59:59.000Z').getTime() };
    save.disabled = true;
    $('#job-editor-error', m.root).textContent = '';
    try {
      const result = job.id ? await X3API.put('/api/studio/jobs/' + job.id + location.search, body) : await X3API.post('/api/studio/jobs' + location.search, body);
      if (!result || !result.job) throw new Error('The server did not confirm the saved listing.');
      m.close(); toast('Listing saved', 'ok'); if (location.hash === '#jobs') jobs();
    } catch (error) { if (m.root.isConnected) { $('#job-editor-error', m.root).textContent = error.message; save.disabled = false; } }
  };
}
async function jobInbox(job) {
  const m = modal(`<h3>${esc(job.title)} — private inquiries</h3><div data-inquiries role="status">Loading…</div><div class="row" style="justify-content:flex-end"><button class="btn" data-done>Done</button></div>`);
  $('[data-done]', m.root).onclick = m.close;
  const box = $('[data-inquiries]', m.root);
  try {
    const { inquiries } = await X3API.get('/api/studio/jobs/' + job.id + '/inquiries' + location.search);
    if (!box.isConnected) return;
    box.innerHTML = inquiries.length ? inquiries.map(i => `<article class="panel pad" style="margin:14px 0"><b>${esc(i.applicant.name)}</b><p class="note"><a href="${esc('mailto:' + encodeURIComponent(i.applicant.email))}">${esc(i.applicant.email)}</a> · ${fmt.date(i.createdAt)}</p><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(i.message)}</p>${i.portfolioUrl ? `<p><a href="${esc(i.portfolioUrl)}" target="_blank" rel="noopener noreferrer">View portfolio ↗</a></p>` : ''}<label class="field"><span>Review status</span><select class="inp" data-inquiry-status="${i.id}">${['new', 'reviewing', 'closed'].map(s => `<option${s === i.status ? ' selected' : ''}>${s}</option>`).join('')}</select></label></article>`).join('') : '<p class="mute">No inquiries for this listing yet.</p>';
    $$('[data-inquiry-status]', box).forEach(select => {
      let previous = select.value;
      select.onchange = async () => {
        select.disabled = true;
        try { await X3API.patch('/api/studio/jobs/' + job.id + '/inquiries/' + select.dataset.inquiryStatus + location.search, { status: select.value }); previous = select.value; toast('Review status updated', 'ok'); }
        catch (e) { select.value = previous; toast(e.message, 'err'); }
        finally { select.disabled = false; }
      };
    });
  } catch (e) { if (box.isConnected) box.innerHTML = `<p role="alert">${esc(e.message)}</p>`; }
}

/* ---------------- earnings ---------------- */
function earnings() {
  const c = D.creator, e = D.economy, a = D.analytics;
  const weekLeft = Math.max(0, e.payoutWeeklyCapBeans - a.payoutWeekUsed);
  main().innerHTML = head('Your <em>earnings</em>', `Every diamond gifted becomes a bean. Beans cash out at ${fmt.usd(e.beanUsd * 1000)} per 1,000 or convert back into diamonds.`) + `
    <div class="grid g4"><div class="panel kpi"><small>Beans available</small><b>${fmt.num(c.beans)}</b><span>≈ ${fmt.usd(c.beans * e.beanUsd)}</span></div><div class="panel kpi"><small>Minimum payout</small><b>${fmt.num(e.minPayoutBeans)}</b><span>${fmt.usd(e.minPayoutBeans * e.beanUsd)}</span></div><div class="panel kpi"><small>Weekly cap left</small><b>${fmt.k(weekLeft)}</b><span>of ${fmt.k(e.payoutWeeklyCapBeans)} beans</span></div><div class="panel kpi"><small>Host bonus</small><b>+${a.tier.bonusPct}%</b><span>${esc(a.tier.name)} — paid on every gift</span></div></div>
    <div class="grid g2" style="margin-top:16px">
      <form class="panel pad" id="po"><h3 class="t">Request payout</h3>${c.kyc !== 'verified' ? '<p class="note" style="color:var(--amber)">Payouts unlock once your ID verification is approved.</p>' : ''}
        <label class="field"><span>Beans</span><input class="inp" name="beans" type="number" min="${e.minPayoutBeans}" max="${c.beans}" value="${Math.min(c.beans, Math.max(e.minPayoutBeans, 0))}"></label>
        <p class="note">You'll receive <b id="poUsd">${fmt.usd(Math.min(c.beans, e.minPayoutBeans) * e.beanUsd)}</b>.</p>
        <label class="field"><span>Payout method</span><input class="inp" name="method" placeholder="e.g. USDC (Base) 0x… · Paxum email · bank wire ref" maxlength="120"></label>
        <button class="btn pri" style="margin-top:12px" ${c.kyc !== 'verified' ? 'disabled' : ''}>Request payout</button></form>
      <form class="panel pad" id="cv"><h3 class="t">Convert beans → diamonds</h3><p class="note">Re-spend inside x3STAR — VIP, gifts to other creators, cosmetics. Rate: 1 bean = ${e.beanToDiamondRate} 💎. Your diamonds: <b>${fmt.num(D.myEcon.diamonds)}</b></p>
        <label class="field"><span>Beans to convert</span><input class="inp" name="beans" type="number" min="1" max="${c.beans}" value="${Math.min(1000, c.beans)}"></label>
        <button class="btn" style="margin-top:12px">Convert</button></form>
    </div>
    <div class="panel tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr><th>Requested</th><th class="r">Beans</th><th class="r">USD</th><th>Method</th><th>Status</th><th>Note</th></tr></thead><tbody>${D.payouts.length ? D.payouts.map(p => `<tr><td>${fmt.date(p.created_at)}</td><td class="r num">${fmt.num(p.beans)}</td><td class="r num">${fmt.usd(p.usd)}</td><td class="dim">${esc(p.method)}</td><td><span class="tag ${p.status}">${p.status}</span></td><td class="dim">${esc(p.note)}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">No payouts yet.</td></tr>'}</tbody></table></div>`;
  $('#po [name=beans]').oninput = (ev) => { $('#poUsd').textContent = fmt.usd((Number(ev.target.value) || 0) * e.beanUsd); };
  $('#po').onsubmit = async (ev) => { ev.preventDefault(); const f = ev.target; await guard(() => X3API.post('/api/studio/payout' + location.search, { beans: Number(f.beans.value), method: f.method.value }), 'Payout requested'); await reload(); earnings(); };
  $('#cv').onsubmit = async (ev) => { ev.preventDefault(); const f = ev.target; const r = await guard(() => X3API.post('/api/studio/convert' + location.search, { beans: Number(f.beans.value) })); toast(`+${fmt.num(r.result.diamonds)} 💎 added to your wallet`, 'ok'); await reload(); earnings(); };
}

/* ---------------- go live + camera filters ---------------- */
let camStream = null;
function live() {
  const c = D.creator, filters = D.economy.items, owned = D.myEcon.inventory;
  main().innerHTML = head('Go <em>live</em>', 'Flip your status, preview your camera with filters, and check your stage setup.') + `
    <div class="grid g2">
      <div class="panel pad"><h3 class="t">Status</h3><div class="row" style="justify-content:space-between"><div><b style="font:500 24px var(--serif)">${c.live ? 'You\'re live' : 'You\'re offline'}</b><p class="note">${c.kyc === 'verified' ? 'Fans see the LIVE badge and you enter PK battles while live.' : 'ID verification must be approved before you can go live.'}</p></div><button class="switch ${c.live ? 'on' : ''}" id="liveSw" role="switch" aria-checked="${c.live}" aria-label="Live status" ${c.kyc !== 'verified' ? 'disabled' : ''}></button></div>
        <h3 class="t" style="margin-top:22px">Broadcast setup</h3><p class="note">Video goes out through your broadcasting software (OBS or similar) to your media server; x3STAR shows your preview clip and pulls chat and tips from every connected site. Your stream key and ingest URL come from your media server, not from this page.</p>
        <ul class="list"><li><span>Tip menu items</span><b>${c.tipMenu.length}</b></li><li><span>Goal</span><b>${esc(c.goal.label || '—')}</b></li><li><span>Pinned product</span><b>${c.pinnedProductId ? '#' + c.pinnedProductId : '—'}</b></li><li><span>Gallery videos (stage preview)</span><b>${D.uploads.filter(u => u.kind === 'gallery' && u.type === 'video' && u.status === 'approved').length}</b></li></ul></div>
      <div class="panel pad"><h3 class="t">Camera preview <button class="btn sm" id="camBtn">Start camera</button></h3><div class="cam" id="cam"><div class="msg">Camera is off. Your preview never leaves this browser.</div></div>
        <div class="chips" style="margin-top:12px" id="flts"><button class="chip on" data-f="">No filter</button>${filters.map(f => `<button class="chip ${owned[f.id] ? '' : 'locked'}" data-f="${f.id}" title="${owned[f.id] ? 'Owned' : 'Unlock in Rewards'}">${esc(f.name)}${owned[f.id] ? '' : ' 🔒'}</button>`).join('')}</div>
        <p class="note">Filters you own in Rewards work here too. Locked ones preview for 5 seconds.</p></div>
    </div>`;
  $('#liveSw').onclick = async () => { const on = !c.live; await guard(() => X3API.post('/api/studio/live' + location.search, { live: on }), on ? 'You\'re live — fans can see you on the floor' : 'You\'re offline'); await reload(); live(); };
  $('#camBtn').onclick = async () => {
    const cam = $('#cam');
    if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; cam.innerHTML = '<div class="msg">Camera is off.</div>'; $('#camBtn').textContent = 'Start camera'; return; }
    try { camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false }); cam.innerHTML = '<video autoplay playsinline muted></video><div class="ovl"></div>'; $('video', cam).srcObject = camStream; $('#camBtn').textContent = 'Stop camera'; }
    catch (e) { cam.innerHTML = `<div class="msg">Camera unavailable: ${esc(e.message)}. Allow camera access, and use HTTPS or localhost.</div>`; }
  };
  let revert = 0;
  $$('#flts .chip').forEach(b => b.onclick = () => {
    const f = filters.find(x => x.id === b.dataset.f), v = $('#cam video'), o = $('#cam .ovl');
    $$('#flts .chip').forEach(x => x.classList.toggle('on', x === b));
    if (v) v.style.filter = f ? f.css : 'none'; if (o) o.className = 'ovl ' + (f && f.overlay ? f.overlay : '');
    clearTimeout(revert);
    if (f && !owned[f.id]) { toast(`Previewing ${f.name} — unlock it in Rewards to keep it`); revert = setTimeout(() => $('#flts .chip[data-f=""]').click(), 5000); }
  });
}

/* ---------------- agency ---------------- */
async function agency() {
  let A;
  try { A = await X3API.get('/api/agency'); } catch (e) { main().innerHTML = head('Agency') + `<div class="panel empty">${esc(e.message)}</div>`; return; }
  main().innerHTML = head('Your <em>agency</em>', `You earn ${A.commissionPct}% on top of every gift your recruited hosts receive — paid by the platform, never taken from your hosts.`) + `
    <div class="grid g4"><div class="panel kpi"><small>Your agent code</small><b>${esc(A.code)}</b><span>Hosts enter it when they apply</span></div><div class="panel kpi"><small>Hosts</small><b>${A.hosts.length}</b><span>${A.hosts.filter(h => h.live).length} live now</span></div><div class="panel kpi"><small>Commission earned</small><b>${fmt.num(A.earnedBeans)}</b><span>${fmt.usd(A.earnedBeans * A.beanUsd)}</span></div><div class="panel kpi"><small>Available</small><b>${fmt.num(A.availableBeans)}</b><span>${fmt.usd(A.availableBeans * A.beanUsd)}</span></div></div>
    <div class="grid g2" style="margin-top:16px"><div class="panel tbl-wrap"><table class="tbl"><thead><tr><th>Host</th><th>Status</th><th class="r">Beans · 30d</th><th class="r">Your commission</th></tr></thead><tbody>${A.hosts.length ? A.hosts.map(h => `<tr><td><b>${esc(h.name)}</b></td><td>${h.live ? '<span class="tag live">live</span>' : '<span class="tag">offline</span>'} <span class="tag ${h.kyc}">${h.kyc}</span></td><td class="r num">${fmt.num(h.beans30d)}</td><td class="r num up">${fmt.num(h.commission)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">No hosts yet — share your code.</td></tr>'}</tbody></table></div>
      <form class="panel pad" id="apo"><h3 class="t">Request payout</h3><label class="field"><span>Beans</span><input class="inp" name="beans" type="number" min="${A.minPayoutBeans}" value="${Math.max(A.minPayoutBeans, 0)}"></label><label class="field" style="margin-top:10px"><span>Method</span><input class="inp" name="method" placeholder="USDC address, Paxum email…" maxlength="120"></label><button class="btn pri" style="margin-top:12px">Request</button><p class="note">Minimum ${fmt.num(A.minPayoutBeans)} beans.</p></form></div>`;
  $('#apo').onsubmit = async (e) => { e.preventDefault(); const f = e.target; await guard(() => X3API.post('/api/agency/payout', { beans: Number(f.beans.value), method: f.method.value }), 'Payout requested'); agency(); };
}

boot();
})();
