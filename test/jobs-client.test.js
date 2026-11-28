'use strict';
/*
 * Isolated client control-flow checks at X3Jobs.mount's DOM/API boundary.
 * This small fixture is not a browser: it does not prove HTML parsing, native
 * validation, layout, focus behavior or real authentication/inquiry persistence.
 * The real HTTP/SQLite jobs suite covers the server boundary separately.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor() {
    this._html = ''; this.isConnected = true; this.children = []; this.dataset = {};
    this.handlers = {}; this.classList = { add() {}, remove() {} };
    this.textContent = ''; this.disabled = false;
  }
  set innerHTML(html) {
    if (this.form) this.form.isConnected = false;
    this._html = html; this.children = []; this.form = null; this.status = null; this.buttons = [];
    if (html.includes('data-jobs-status')) this.status = new Element();
    if (html.includes('<form ')) {
      this.form = new Element(); this.form.elements = {};
      for (const name of ['message', 'portfolioUrl', 'email', 'password']) {
        const value = name === 'message' ? (html.match(/<textarea[^>]*>([^]*?)<\/textarea>/) || [])[1] || ''
          : name === 'portfolioUrl' ? (html.match(/name="portfolioUrl"[^>]*value="([^"]*)"/) || [])[1] || '' : '';
        this.form.elements[name] = { value };
      }
      this.form.reportValidity = () => true;
      this.form.button = new Element();
    }
    for (const match of html.matchAll(/data-job-inquire="(\d+)"/g)) {
      const button = new Element(); button.dataset.jobInquire = match[1];
      button.slot = new Element(); button.parentElement = { querySelector: () => button.slot };
      this.buttons.push(button);
    }
    if (!this.form && html.includes('<button') && !this.buttons.length) this.button = new Element();
  }
  get innerHTML() { return this._html + this.children.map(child => child.innerHTML).join(''); }
  querySelector(selector) {
    if (selector === 'form') return this.form;
    if (selector === 'button') return this.button;
    if (selector === '[data-jobs-status]') return this.status;
    if (selector === 'input,textarea') return this.form ? { focus() {} } : null;
    return null;
  }
  querySelectorAll(selector) {
    if (selector === '[data-job-inquire]') return this.buttons;
    if (selector === '.jobs-load-error') return this.children.filter(child => child.className === 'jobs-load-error');
    return [];
  }
  addEventListener(type, handler) { this.handlers[type] = handler; }
  appendChild(child) { this.children.push(child); child.parent = this; return child; }
  focus() { this.focused = true; }
  remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
}

const source = fs.readFileSync(path.join(__dirname, '..', 'public/assets/jobs.js'), 'utf8');
function client(api, extra = {}) {
  const events = [];
  const window = { X3API: api, dispatchEvent: event => events.push(event), ...extra };
  const document = { readyState: 'loading', addEventListener() {}, querySelectorAll: () => [], createElement: () => new Element() };
  class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  vm.runInNewContext(source, { window, document, URL, Date, WeakMap, Promise, CustomEvent });
  return { ...window, events };
}
const job = { id: 1, creatorId: 'luna', kind: 'hiring', title: 'Weekly editor', description: 'Edit a weekly content package.', category: 'Editing', workMode: 'remote', location: '', compensation: 'Discuss scope first', expiresAt: 1999999999999 };
const user = { name: 'Applicant', email: 'applicant@example.test', creatorId: null };
const submit = form => form.handlers.submit({ preventDefault() {} });
const flush = () => new Promise(resolve => setImmediate(resolve));
async function inquiryForm(context, host) {
  await context.X3Jobs.mount(host, { creatorId: 'luna', jobs: [job] });
  await host.buttons[0].handlers.click();
  const form = host.buttons[0].slot.form;
  form.elements.message.value = 'I can help with weekly editing.';
  return form;
}

test('jobs render both listing kinds and encode text without exposing account contact data', async () => {
  let reads = 0;
  const context = client({ get: async () => { reads++; return { user }; } }), host = new Element();
  await context.X3Jobs.mount(host, { creatorId: 'luna', jobs: [{ ...job, title: 'Editor <script>' }, { ...job, id: 2, kind: 'available', title: 'Design support' }] });
  assert.match(host.innerHTML, /Editor &lt;script&gt;/);
  assert.match(host.innerHTML, /Apply \/ collaborate/);
  assert.match(host.innerHTML, /Request work/);
  assert.ok(!host.innerHTML.includes(user.email));
  assert.equal(reads, 0, 'account data is requested only when the visitor chooses to inquire');
});

test('a confirmed inquiry prevents double submission while the request is pending and afterward', async () => {
  let calls = 0, confirm;
  const request = new Promise(resolve => { confirm = resolve; });
  const context = client({ get: async () => ({ user }), post: async () => { calls++; return request; } }), host = new Element();
  const form = await inquiryForm(context, host);
  const pending = submit(form); await flush();
  await submit(form); assert.equal(calls, 1);
  confirm({ ok: true, inquiry: { id: 10 } }); await pending;
  assert.equal(form.button.disabled, true);
  assert.equal(form.button.textContent, 'Inquiry sent');
  assert.match(host.buttons[0].slot.status.textContent, /Inquiry received/);
  await submit(form); assert.equal(calls, 1);
});

test('network failure and malformed success receipts allow retry without discarding the draft', async () => {
  let attempts = 0;
  const context = client({ get: async () => ({ user }), post: async () => {
    attempts++;
    if (attempts === 1) throw new Error('Connection interrupted');
    if (attempts === 2) return { inquiry: { id: 1 } };
    return { ok: true, inquiry: { id: 1 } };
  } }), host = new Element();
  const form = await inquiryForm(context, host);
  for (let attempt = 0; attempt < 2; attempt++) {
    await submit(form);
    assert.equal(form.button.disabled, false);
    assert.equal(form.elements.message.value, 'I can help with weekly editing.');
  }
  await submit(form);
  assert.equal(attempts, 3);
  assert.equal(form.button.textContent, 'Inquiry sent');
});

test('duplicate and closed listings lock correctly while a full inbox does not claim an inquiry was recorded', async () => {
  for (const code of ['already_inquired', 'listing_closed', 'inbox_full']) {
    const context = client({ get: async () => ({ user }), post: async () => { throw Object.assign(new Error(code), { status: 409, code }); } }), host = new Element();
    const form = await inquiryForm(context, host);
    await submit(form);
    assert.equal(form.button.disabled, code !== 'inbox_full');
    if (code === 'already_inquired') assert.equal(form.button.textContent, 'Inquiry already recorded');
    if (code === 'listing_closed') assert.equal(form.button.textContent, 'Listing closed');
    if (code === 'inbox_full') assert.equal(form.button.textContent, 'Send private inquiry');
  }
});

test('an expired session retains the inquiry draft through confirmed sign-in and emits an account refresh', async () => {
  let attempts = 0;
  const context = client({ get: async () => ({ user }), post: async route => {
    if (route === '/api/auth/login') return { user };
    if (++attempts === 1) throw Object.assign(new Error('Sign in again'), { status: 401 });
    return { ok: true, inquiry: { id: 10 } };
  } }), host = new Element();
  const original = await inquiryForm(context, host);
  original.elements.portfolioUrl.value = 'https://portfolio.example.test/work';
  await submit(original);
  const slot = host.buttons[0].slot, login = slot.form;
  login.elements.email.value = 'applicant@example.test';
  login.elements.password.value = 'isolated-fixture-only';
  await submit(login);
  assert.equal(login.elements.password.value, '');
  assert.equal(context.events.length, 1);
  assert.equal(context.events[0].type, 'x3star:session-changed');
  assert.equal(context.events[0].detail.user.name, 'Applicant');
  assert.equal(slot.form.elements.message.value, 'I can help with weekly editing.');
  assert.equal(slot.form.elements.portfolioUrl.value, 'https://portfolio.example.test/work');
  await submit(slot.form);
  assert.equal(slot.form.button.textContent, 'Inquiry sent');
});

test('late board responses cannot replace a newer mount, another tab or a detached view', async () => {
  let resolveOld, resolveNew, calls = 0;
  const old = new Promise(resolve => { resolveOld = resolve; });
  const fresh = new Promise(resolve => { resolveNew = resolve; });
  const context = client({ get: () => ++calls === 1 ? old : fresh }), host = new Element();
  const first = context.X3Jobs.mount(host, { creatorId: 'luna' });
  const second = context.X3Jobs.mount(host, { creatorId: 'raven' });
  resolveNew({ jobs: [{ ...job, creatorId: 'raven', title: 'Current listing' }] }); await second;
  resolveOld({ jobs: [{ ...job, title: 'Stale listing' }] }); await first;
  assert.match(host.innerHTML, /Current listing/);
  assert.ok(!host.innerHTML.includes('Stale listing'));
  for (const detached of [false, true]) {
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const next = client({ get: () => pending }), panel = new Element();
    const loading = next.X3Jobs.mount(panel, { creatorId: 'luna' });
    if (detached) panel.isConnected = false; else next.X3Jobs.cancel(panel);
    panel.innerHTML = 'Other content';
    finish({ jobs: [job] }); await loading;
    assert.equal(panel.innerHTML, 'Other content');
  }
});

test('failed refresh preserves server-rendered listings and retry does not accumulate banners', async () => {
  const context = client({ get: async () => { throw new Error('Connection interrupted'); } }), host = new Element();
  host.innerHTML = '<article>Server-rendered listing</article>';
  await context.X3Jobs.mount(host, { creatorId: 'luna' });
  assert.ok(host.innerHTML.startsWith('<article>Server-rendered listing</article>'));
  assert.equal(host.children.length, 1);
  await host.children[0].button.handlers.click();
  assert.equal(host.children.length, 1);
  assert.ok(host.innerHTML.startsWith('<article>Server-rendered listing</article>'));
});

test('standalone mode never fetches or fabricates a published jobs board', async () => {
  let reads = 0;
  const context = client({ get: async () => { reads++; return { jobs: [job] }; } }, { X3STAR: {} }), host = new Element();
  await context.X3Jobs.mount(host, { creatorId: 'luna', jobs: [job] });
  assert.equal(reads, 0);
  assert.match(host.innerHTML, /standalone preview does not contain published listings/);
  assert.ok(!host.innerHTML.includes(job.title));
});
