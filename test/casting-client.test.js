'use strict';
/* Limited form/HTTP fixtures, not browser rendering or mail-delivery evidence. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture({ publisher = true, result = { ok: true }, responseOk = true, landingPath = '/casting/colorado', search = '?utm_source=search&utm_content=affiliate-tracking-links-explained' } = {}) {
  const button = { disabled: true, textContent: '' };
  const status = { textContent: '', dataset: {}, removeAttribute() {}, focus() {} };
  const handlers = {}, calls = [], values = new Map();
  const form = { dataset: publisher ? { kind: 'agent' } : { landingPath },
    elements: { stage: { value: 'Example Publisher' }, email: { value: 'publisher@example.test' }, adult: { checked: true },
      website: { value: 'https://publication.example' }, audience: { value: 'Adult creator professionals' }, note: { value: 'Original guides and interviews' },
      ...(!publisher ? { state: { value: 'colorado' }, hours: { value: '5' }, experience: { selectedOptions: [{ text: 'New to online creation' }] } } : {}) },
    querySelector: () => button, addEventListener: (name, fn) => { handlers[name] = fn; }, reportValidity: () => true,
    reset() { this.resets = (this.resets || 0) + 1; } };
  const context = { URL, URLSearchParams, Date, console,
    location: { origin: 'https://journal.example', search },
    sessionStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) },
    document: { querySelectorAll: () => [], getElementById: id => id === 'casting-form' ? form : status },
    fetch: async (url, options) => { calls.push({ url, options, body: JSON.parse(options.body) }); return { ok: responseOk, json: async () => result }; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/assets/casting.js'), 'utf8'), context);
  return { form, button, status, calls, submit: () => handlers.submit({ preventDefault() {} }) };
}

test('publisher form uses agent review, preserves article attribution and avoids casting-only fields', async () => {
  const view = fixture();
  assert.equal(view.button.disabled, false);
  await view.submit();
  assert.equal(view.calls.length, 1);
  assert.equal(view.calls[0].url, '/api/apply');
  const body = view.calls[0].body;
  assert.equal(body.kind, 'agent');
  assert.equal(body.adult, true);
  assert.equal(body.hours, 0);
  assert.equal(body.state, '');
  assert.equal(Object.hasOwn(body, 'landingPath'), false);
  assert.match(body.note, /Publisher\/referral inquiry/);
  assert.match(body.note, /Audience: Adult creator professionals/);
  assert.equal(body.campaign.utm_source, 'search');
  assert.equal(body.campaign.utm_content, 'affiliate-tracking-links-explained');
  assert.match(view.status.textContent, /private x3STAR review queue/);
  assert.match(view.status.textContent, /does not approve a partnership/);
  assert.equal(view.button.disabled, true);
  await view.submit();
  assert.equal(view.calls.length, 1, 'confirmed inquiry cannot accidentally submit again');
});

test('publisher receipt requires explicit confirmation and permits retry after rejected or malformed responses', async () => {
  for (const options of [{ result: {}, responseOk: true }, { result: { error: { message: 'Try again later' } }, responseOk: false }]) {
    const view = fixture(options);
    await view.submit();
    assert.equal(view.form.resets || 0, 0);
    assert.equal(view.form.dataset.submitted, undefined);
    assert.equal(view.button.disabled, false);
    assert.equal(view.button.textContent, 'Send publisher inquiry');
    assert.equal(view.status.dataset.error, 'true');
    await view.submit();
    assert.equal(view.calls.length, 2);
  }
});

test('existing creator form retains its state, landing path and experience payload', async () => {
  const view = fixture({ publisher: false });
  await view.submit();
  const body = view.calls[0].body;
  assert.equal(body.kind, 'creator');
  assert.equal(body.state, 'colorado');
  assert.equal(body.landingPath, '/casting/colorado');
  assert.equal(body.hours, 5);
  assert.match(body.note, /Experience: New to online creation/);
  assert.match(view.status.textContent, /Application received/);
});

test('Denver ad form sends its campaign variant and exact landing path with a confirmed receipt', async () => {
  const view = fixture({ publisher: false, landingPath: '/casting/colorado/denver', search: '?utm_source=trafficjunky&utm_medium=display&utm_campaign=denver_creator_casting&utm_content=denver_intro' });
  await view.submit();
  const body = view.calls[0].body;
  assert.equal(body.landingPath, '/casting/colorado/denver');
  assert.equal(body.state, 'colorado');
  assert.equal(body.campaign.utm_source, 'trafficjunky');
  assert.equal(body.campaign.utm_medium, 'display');
  assert.equal(body.campaign.utm_campaign, 'denver_creator_casting');
  assert.equal(body.campaign.utm_content, 'denver_intro');
  assert.equal(view.status.dataset.success, 'true');
  assert.match(view.status.textContent, /review queue/);
});
