/* Employer workspace: company profile, reviewed paid placements and private inquiries. */
(() => {
  'use strict';
  const { $, $$, esc, fmt, toast, modal, confirmBox } = window.Dash;
  const app = $('#employer-app');
  const categories = { broadcasting: 'Broadcasting', production: 'Production', editing: 'Editing', moderation: 'Moderation', design: 'Design', photography: 'Photography', marketing: 'Marketing', technology: 'Technology', operations: 'Operations', other: 'Other' };
  const modes = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };
  const cash = order => new Intl.NumberFormat('en-US', { style: 'currency', currency: order.currency || 'USD' }).format(order.priceCents / 100);
  const stateValue = text => text.trim().toLowerCase().replace(/\s+/g, '-');
  const options = (values, selected) => Object.entries(values).map(([key, label]) => `<option value="${key}"${selected === key ? ' selected' : ''}>${label}</option>`).join('');
  let me, D, generation = 0, tab = 'listings', routeListener;
  function clearRouter() { if (routeListener) { removeEventListener('hashchange', routeListener); routeListener = null; } }
  const main = () => $('#employer-main');
  const heading = (title, description, actions = '') => `<div class="ph"><div><span class="eyebrow">x3STAR employers</span><h1>${title}</h1><p>${description}</p></div><div class="row">${actions}</div></div>`;

  async function boot() {
    const version = ++generation;
    clearRouter();
    app.innerHTML = '<div class="employer-loading" role="status">Loading employer workspace…</div>';
    try {
      const response = await X3API.get('/api/me');
      if (version !== generation) return;
      me = response && response.user;
      if (!me) return gate();
      D = await X3API.get('/api/employer');
      if (version !== generation) return;
      if (!D || !D.plan) throw new Error('The employer workspace could not be loaded.');
      shell();
    } catch (error) { if (version === generation) gate(error.message); }
  }
  function gate(message = '', register = false) {
    clearRouter();
    app.innerHTML = `<div class="employer-gate"><div><a class="eyebrow" href="/jobs">x3STAR jobs</a><h1>Your next hire<br><em>starts here.</em></h1><p class="mute">Create a company profile, prepare an opening, request review and purchase its directory listing period.</p><div class="employer-stages"><span>1 · Draft</span><span>2 · Review</span><span>3 · Invoice</span><span>4 · Publish</span></div><p class="note">Applicants browse and inquire free. You can use your existing x3STAR account; you do not need a creator profile.</p><nav><a href="/jobs">Browse jobs ↗</a><a href="/casting">Creator casting ↗</a></nav></div><form class="panel" id="employer-auth"><h2>${register ? 'Create your account' : 'Sign in'}</h2>${message ? `<p class="employer-error" role="alert">${esc(message)}</p>` : ''}${register ? '<label class="field"><span>Account username</span><input class="inp" name="name" minlength="3" maxlength="24" pattern="[A-Za-z0-9_.]{3,24}" autocomplete="username" required></label>' : ''}<label class="field"><span>Email</span><input class="inp" name="email" type="email" maxlength="160" autocomplete="email" required></label><label class="field"><span>Password</span><input class="inp" name="password" type="password" minlength="${register ? 12 : 1}" maxlength="200" autocomplete="${register ? 'new-password' : 'current-password'}" required></label>${register ? '<label class="employer-checkbox"><input name="adult" type="checkbox" required><span>I am 18 or older. I understand that company and listing review happen separately.</span></label>' : ''}<p class="employer-error" id="auth-error" role="alert"></p><button class="btn pri lg" type="submit" style="width:100%">${register ? 'Create account' : 'Sign in'}</button><p class="note">${register ? 'Already registered?' : 'New here?'} <button type="button" id="switch-auth" style="color:#ff91b8">${register ? 'Sign in instead' : 'Create an account'}</button></p><p class="note">No payment is collected when you create an account.</p></form></div>`;
    $('#switch-auth').onclick = () => gate('', !register);
    $('#employer-auth').onsubmit = async event => {
      event.preventDefault();
      const form = event.target, button = $('button[type=submit]', form), fields = form.elements;
      if (button.disabled || !form.reportValidity()) return;
      button.disabled = true; $('#auth-error').textContent = '';
      try {
        const body = { email: fields.email.value.trim(), password: fields.password.value };
        if (register) Object.assign(body, { name: fields.name.value.trim(), adult: fields.adult.checked });
        const response = await X3API.post('/api/auth/' + (register ? 'register' : 'login'), body);
        fields.password.value = '';
        if (!response || !response.user) throw new Error('Sign-in was not confirmed. Please try again.');
        dispatchEvent(new CustomEvent('x3star:session-changed', { detail: { user: response.user } }));
        boot();
      } catch (error) { if (form.isConnected) { fields.password.value = ''; $('#auth-error').textContent = error.message; button.disabled = false; } }
    };
  }
  function shell() {
    app.innerHTML = `<div class="shell"><aside class="side" id="employer-side"><div class="brand">x3<span>STAR</span><small>Employers</small></div><a class="nav" href="#listings" data-v="listings">Your listings</a><a class="nav" href="#invoices" data-v="invoices">Invoices & receipts</a><a class="nav" href="#company" data-v="company">Company profile</a><div class="foot"><span>${esc(me.name)}</span><a href="/jobs">View the jobs directory ↗</a><a href="/">Back to x3STAR</a><button class="btn sm" id="employer-out">Sign out</button></div></aside><button class="btn burger" id="employer-burger" aria-label="Menu">☰</button><main class="main" id="employer-main"></main></div>`;
    $('#employer-out').onclick = async event => { const button = event.currentTarget; if (button.disabled) return; button.disabled = true; ++generation; try { const response = await X3API.post('/api/auth/logout'); if (!response || response.ok !== true) throw new Error('Sign-out was not confirmed.'); me = null; D = null; location.hash = ''; gate(); } catch (error) { toast('Sign-out was not confirmed. You are still signed in; please retry. ' + error.message, 'err'); if (button.isConnected) button.disabled = false; } };
    $('#employer-burger').onclick = () => $('#employer-side').classList.toggle('open');
    const views = { listings, invoices, company };
    clearRouter();
    routeListener = () => { const requested = location.hash.replace(/^#/, '') || (D.profile ? 'listings' : 'company'); tab = views[requested] ? requested : 'listings'; $$('.side a.nav').forEach(a => a.classList.toggle('on', a.dataset.v === tab)); $('#employer-side').classList.remove('open'); views[tab](); window.scrollTo(0, 0); };
    addEventListener('hashchange', routeListener); routeListener();
  }
  async function reload() {
    const version = generation;
    const updated = await X3API.get('/api/employer');
    if (version !== generation || !me) return;
    if (!updated || !updated.plan) throw new Error('The workspace refresh was not confirmed.');
    D = updated;
    ({ listings, invoices, company })[tab]();
  }
  function billingNotice() {
    if (D.billingMode === 'test') return '<div class="employer-notice test"><b>Test billing — no real charges.</b> Test invoices and receipts do not count as live sales. A test listing is labeled publicly.' + (D.plan.testPaymentsAllowed === true ? '' : ' Test receipts and test publication are unavailable on this service.') + (D.plan.enabled ? '' : ' New invoice requests are paused.') + '</div>';
    if (D.billingMode === 'manual') return `<div class="employer-notice">Manual invoices: follow the invoice instructions, then wait for Admin to record receipt. No card details are collected here.${!D.plan.enabled ? ' New invoice requests are paused; existing payments can still be reconciled.' : !D.plan.available ? ' New invoice requests are unavailable until payment instructions are configured.' : ''}</div>`;
    return '<div class="employer-notice">Paid listing billing is not enabled yet. You can prepare and submit a draft; no payment or publication is promised.</div>';
  }
  function company() {
    const profile = D.profile || {};
    main().innerHTML = heading('Your <em>company</em>', 'These details identify the employer when a listing is submitted for review.') + `<form class="panel pad employer-profile-form" id="company-form"><label class="field"><span>Company or trading name</span><input class="inp" name="companyName" minlength="2" maxlength="100" required value="${esc(profile.companyName || '')}"></label><label class="field"><span>Company website (optional; HTTPS)</span><input class="inp" name="website" type="url" maxlength="500" value="${esc(profile.website || '')}" placeholder="https://…"></label><label class="field"><span>Broad location (optional)</span><input class="inp" name="location" maxlength="100" value="${esc(profile.location || '')}" placeholder="City or region, no home address"></label><label class="field"><span>U.S. state (optional)</span><input class="inp" name="state" maxlength="40" value="${esc(profile.state || '')}" placeholder="Colorado or CO"></label><p class="note full">Company details are copied into a listing’s review record. Saving your profile does not silently replace the identity on an already-reviewed listing. Your account email remains private.</p><p class="employer-error full" id="company-error" role="alert"></p><button class="btn pri" type="submit">Save company profile</button></form>`;
    $('#company-form').onsubmit = async event => {
      event.preventDefault(); const form = event.target, f = form.elements, button = $('button[type=submit]', form);
      if (button.disabled || !form.reportValidity()) return;
      button.disabled = true; $('#company-error').textContent = '';
      try {
        const response = await X3API.put('/api/employer/profile', { companyName: f.companyName.value.trim(), website: f.website.value.trim(), location: f.location.value.trim(), state: stateValue(f.state.value) });
        if (!response || !response.profile) throw new Error('The company profile was not confirmed.');
        toast('Company profile saved', 'ok'); await reload();
      } catch (error) { if (form.isConnected) { $('#company-error').textContent = error.message; button.disabled = false; } }
    };
  }
  function listings() {
    if (!D.profile) { main().innerHTML = heading('Prepare your <em>first opening</em>', 'Start with your company profile so reviewers and applicants know who is posting.') + '<a class="btn pri" href="#company">Set up your company</a>'; return; }
    const rows = D.listings || [], orders = D.orders || [];
    main().innerHTML = heading('Your <em>openings</em>', 'Draft the role, request review, then purchase its directory period.', '<button class="btn pri" id="employer-new">+ Add opening</button>') + billingNotice() + (D.profile.status === 'suspended' ? '<div class="employer-notice">Employer posting is suspended. Contact the directory operator before requesting or paying an invoice.</div>' : '') + `<div class="employer-stages"><span>Draft the role</span><span>Submit for review</span><span>Get an invoice</span><span>Payment confirmed → publish</span></div><p class="note">Current price: ${cash(D.plan)} for ${D.plan.durationDays} days. A paid period starts when approval and payment first allow publication. Editing or reopening does not restart it.</p>` + (rows.length ? `<div class="grid g2">${rows.map(job => {
      const order = orders.find(o => String(o.id) === String(job.activeOrderId));
      const entitled = order && order.status === 'paid' && order.expiresAt > Date.now() && (!order.test || D.plan.testPaymentsAllowed === true);
      const visible = D.profile.status === 'active' && job.status === 'open' && job.reviewStatus === 'approved' && entitled;
      return `<article class="panel employer-listing"><div class="row"><span class="tag ${esc(job.status)}">${esc(job.status)}</span><span class="tag ${esc(job.reviewStatus)}">Review: ${esc(job.reviewStatus)}</span>${order && order.test ? '<span class="tag test">test billing</span>' : ''}</div><h2>${esc(job.title)}</h2><p class="meta">${esc(job.companyName || D.profile.companyName)} · ${esc(categories[job.category] || job.category)} · ${esc(modes[job.workMode] || job.workMode)}</p><p class="desc">${esc(job.description)}</p><b>${esc(job.compensation)}</b><p class="meta">${job.expiresAt ? 'Paid period ends ' + fmt.date(job.expiresAt) : 'Listing period has not started'}</p>${job.reviewNote ? `<p class="employer-notice">Review note: ${esc(job.reviewNote)}</p>` : ''}<div class="row"><button class="btn sm" data-inbox="${job.id}">Private inquiries</button>${job.status !== 'archived' ? `<button class="btn sm" data-edit="${job.id}">Edit</button>${job.status !== 'open' || job.reviewStatus !== 'approved' ? `<button class="btn sm" data-submit="${job.id}">Submit for review</button>` : ''}${job.status === 'open' && job.reviewStatus === 'approved' && !entitled ? `<button class="btn sm pri" data-order="${job.id}"${D.plan.available ? '' : ' disabled'}>Get invoice</button>` : ''}${job.status === 'open' ? `<button class="btn sm" data-close="${job.id}">Close</button>` : ''}<button class="btn sm red" data-archive="${job.id}">Archive</button>` : ''}${visible ? `<a class="btn sm" href="/jobs/${job.id}" target="_blank" rel="noopener">View public opening ↗</a>` : ''}</div></article>`;
    }).join('')}</div>` : '<div class="panel empty">No openings yet. Add a real role with a clear scope and compensation.</div>');
    $('#employer-new').onclick = () => listingForm();
    $$('[data-edit]').forEach(button => button.onclick = () => listingForm(rows.find(job => String(job.id) === button.dataset.edit)));
    $$('[data-inbox]').forEach(button => button.onclick = () => inbox(rows.find(job => String(job.id) === button.dataset.inbox)));
    $$('[data-submit]').forEach(button => button.onclick = () => action(button, () => X3API.post('/api/employer/listings/' + button.dataset.submit + '/submit'), 'Opening submitted for review'));
    $$('[data-close]').forEach(button => button.onclick = () => action(button, () => X3API.post('/api/employer/listings/' + button.dataset.close + '/close'), 'Opening closed'));
    $$('[data-order]').forEach(button => button.onclick = () => action(button, async () => { const response = await X3API.post('/api/employer/listings/' + button.dataset.order + '/orders'); if (!response || !response.order) throw new Error('The invoice was not confirmed.'); location.hash = '#invoices'; return response; }, 'Invoice ready'));
    $$('[data-archive]').forEach(button => button.onclick = async () => {
      if (await confirmBox('Archive this opening?', 'It leaves the public directory. Private inquiry records are retained; archiving does not issue a refund.', 'Archive', true)) action(button, () => X3API.del('/api/employer/listings/' + button.dataset.archive), 'Opening archived');
    });
  }
  async function action(button, request, message) {
    if (button.disabled) return;
    button.disabled = true;
    try { const response = await request(); if (!response || !(response.listing || response.order || response.ok === true)) throw new Error('The action was not confirmed by the server.'); toast(message, 'ok'); await reload(); }
    catch (error) { toast(error.message, 'err'); if (button.isConnected) button.disabled = false; }
  }
  function listingForm(job = {}) {
    const m = modal(`<form id="employer-editor"><h3>${job.id ? 'Edit' : 'Add'} opening</h3><label class="field"><span>Job title</span><input class="inp" name="title" required minlength="3" maxlength="100" value="${esc(job.title || '')}" placeholder="e.g. Video editor for weekly campaigns"></label><label class="field"><span>Role, responsibilities and requirements</span><textarea class="inp" name="description" required minlength="20" maxlength="5000" rows="6">${esc(job.description || '')}</textarea></label><div class="grid g2"><label class="field"><span>Category</span><select class="inp" name="category">${options(categories, job.category || 'other')}</select></label><label class="field"><span>Arrangement</span><select class="inp" name="workMode">${options(modes, job.workMode || 'remote')}</select></label></div><div class="grid g2"><label class="field"><span>Broad location</span><input class="inp" name="location" maxlength="100" value="${esc(job.location || D.profile.location || '')}" placeholder="City or region"></label><label class="field"><span>U.S. state</span><input class="inp" name="state" maxlength="40" value="${esc(job.state || D.profile.state || '')}" placeholder="Colorado or CO"></label></div><label class="field"><span>Compensation / range / terms</span><input class="inp" name="compensation" required minlength="3" maxlength="160" value="${esc(job.compensation || '')}" placeholder="Explain the rate or budget and what is included"></label><p class="note">Applicants are not charged. ${job.id ? 'Editing sends this opening back for review and does not pause or extend an existing paid period.' : 'Save a draft first, then submit it for review. Directory placement is separately invoiced.'}</p><p class="employer-error" id="editor-error" role="alert"></p><div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-cancel>Cancel</button><button class="btn pri" type="submit">Save draft</button></div></form>`);
    $('[data-cancel]', m.root).onclick = m.close;
    const form = $('#employer-editor', m.root), f = form.elements;
    const arrangement = () => { const required = f.workMode.value !== 'remote'; f.location.required = required; f.location.minLength = required ? 2 : 0; f.state.required = required; };
    f.workMode.onchange = arrangement; arrangement();
    form.onsubmit = async event => {
      event.preventDefault(); const button = $('button[type=submit]', form);
      if (button.disabled || !form.reportValidity()) return;
      button.disabled = true; $('#editor-error', m.root).textContent = '';
      const body = { title: f.title.value.trim(), description: f.description.value.trim(), category: f.category.value, workMode: f.workMode.value, location: f.location.value.trim(), state: stateValue(f.state.value), compensation: f.compensation.value.trim() };
      try { const response = job.id ? await X3API.put('/api/employer/listings/' + job.id, body) : await X3API.post('/api/employer/listings', body); if (!response || !response.listing) throw new Error('The saved draft was not confirmed.'); m.close(); toast('Draft saved', 'ok'); await reload(); }
      catch (error) { if (form.isConnected) { $('#editor-error', m.root).textContent = error.message; button.disabled = false; } }
    };
  }
  function invoices() {
    const orders = D.orders || [];
    main().innerHTML = heading('Invoices &amp; <em>receipts</em>', 'Each invoice preserves the price and duration quoted when it was created.', '<button class="btn" id="invoice-refresh">Refresh receipt status</button>') + billingNotice() + (orders.length ? orders.map(order => `<article class="panel employer-invoice"><div class="row" style="justify-content:space-between"><h3>Invoice <span class="mono">${esc(order.id)}</span></h3><span class="tag ${esc(order.status)}">${esc(order.status)}</span></div><p class="note">Opening #${order.listingId} · created ${fmt.date(order.createdAt)}</p><div class="employer-terms"><b>${cash(order)}</b><span>${order.durationDays} listing days · ${esc(order.currency)}</span>${order.test ? '<span class="tag test">TEST · no real charge</span>' : ''}</div>${order.status === 'pending' ? order.test ? '<p class="note">This is a development invoice. Completing a test receipt charges no money. Review approval is still required before a test listing is visible.</p>' : `<p class="note">Use this invoice ID as the payment reference. Follow the owner’s instructions below, then wait for Admin to record receipt. No payment is collected by this page.</p><div class="employer-instructions">${esc(order.invoiceInstructions || 'This invoice has no payment instructions. Contact the directory operator before paying.')}</div>` : ''}${order.status === 'paid' ? `<p class="note">${order.test ? 'Test receipt recorded' : 'Admin recorded receipt'} ${fmt.date(order.paidAt)}${order.reference ? ' · reference ' + esc(order.reference) : ''}. ${order.activatedAt ? 'Listing period ends ' + fmt.date(order.expiresAt) + '.' : 'The listing period has not started; review/publication conditions still apply.'}</p>` : ''}${order.status === 'refunded' ? `<p class="note">${order.test ? 'A test receipt reversal has been recorded. No real payment or refund occurred.' : 'An off-platform full refund has been recorded and this invoice’s placement entitlement was revoked. This portal does not transfer funds.'}</p>` : ''}<div class="row">${order.status === 'pending' && order.test && D.plan.testPaymentsAllowed === true ? `<button class="btn pri" data-test-pay="${esc(order.id)}">Complete test receipt — no charge</button>` : ''}${order.status === 'pending' ? `<button class="btn" data-cancel-order="${esc(order.id)}">Cancel unpaid invoice</button>` : ''}</div></article>`).join('') : '<div class="panel empty">No invoices yet. Submit an opening for review, then request an invoice after approval.</div>');
    $('#invoice-refresh').onclick = async () => { try { await reload(); } catch (error) { toast(error.message, 'err'); } };
    $$('[data-cancel-order]').forEach(button => button.onclick = async () => { if (await confirmBox('Cancel this unpaid invoice?', 'Only cancel if you have not paid. If payment was already sent, contact the directory operator; cancelling does not return money.', 'Cancel invoice', true)) action(button, async () => { const response = await X3API.post('/api/employer/orders/' + encodeURIComponent(button.dataset.cancelOrder) + '/cancel'); if (!response || !response.order || response.order.status !== 'cancelled') throw new Error('Invoice cancellation was not confirmed.'); return response; }, 'Unpaid invoice cancelled'); });
    $$('[data-test-pay]').forEach(button => button.onclick = () => action(button, async () => { const response = await X3API.post('/api/employer/orders/' + encodeURIComponent(button.dataset.testPay) + '/test-pay'); if (!response || !response.order || response.order.status !== 'paid' || !response.order.test) throw new Error('The test receipt was not confirmed.'); return response; }, 'Test receipt recorded — no money charged'));
  }
  async function inbox(job) {
    const m = modal(`<h3>${esc(job.title)} — private inquiries</h3><div data-inbox-content role="status">Loading…</div><div class="row" style="justify-content:flex-end"><button class="btn" data-done>Done</button></div>`);
    $('[data-done]', m.root).onclick = m.close;
    const box = $('[data-inbox-content]', m.root);
    try {
      const response = await X3API.get('/api/employer/listings/' + job.id + '/inquiries');
      if (!box.isConnected) return;
      const inquiries = response && response.inquiries;
      if (!Array.isArray(inquiries)) throw new Error('The private inbox was not confirmed.');
      box.innerHTML = inquiries.length ? inquiries.map(inquiry => `<article class="panel employer-inquiry"><b>${esc(inquiry.applicant.name)}</b><p class="note"><a href="${esc('mailto:' + encodeURIComponent(inquiry.applicant.email))}">${esc(inquiry.applicant.email)}</a> · ${fmt.date(inquiry.createdAt)}</p><p>${esc(inquiry.message)}</p>${inquiry.portfolioUrl ? `<p><a href="${esc(inquiry.portfolioUrl)}" target="_blank" rel="noopener noreferrer">View portfolio ↗</a></p>` : ''}<label class="field"><span>Review status</span><select class="inp" data-review-inquiry="${inquiry.id}">${options({ new: 'New', reviewing: 'Reviewing', closed: 'Closed' }, inquiry.status)}</select></label></article>`).join('') : '<p class="note">No inquiries for this opening yet.</p>';
      $$('[data-review-inquiry]', box).forEach(select => { let previous = select.value; select.onchange = async () => { select.disabled = true; try { const result = await X3API.patch('/api/employer/listings/' + job.id + '/inquiries/' + select.dataset.reviewInquiry, { status: select.value }); if (!result || !result.inquiry) throw new Error('The review status was not confirmed.'); previous = select.value; toast('Review status saved', 'ok'); } catch (error) { select.value = previous; toast(error.message, 'err'); } finally { select.disabled = false; } }; });
    } catch (error) { if (box.isConnected) box.innerHTML = `<p class="employer-error" role="alert">${esc(error.message)}</p>`; }
  }
  boot();
})();
