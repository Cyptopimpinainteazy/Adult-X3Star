'use strict';
/* Isolated DOM/fetch lifecycle fixtures. These do not prove browser rendering or provider playback. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor() {
    this.handlers = {}; this.children = []; this.dataset = {}; this.attributes = {};
    this.hidden = false; this.isConnected = true; this.textContent = '';
    this.classes = new Set();
    this.classList = { add: (...names) => names.forEach(name => this.classes.add(name)), remove: (...names) => names.forEach(name => this.classes.delete(name)), contains: name => this.classes.has(name) };
  }
  addEventListener(type, handler) { (this.handlers[type] ||= new Set()).add(handler); }
  removeEventListener(type, handler) { this.handlers[type]?.delete(handler); }
  dispatch(type, extra = {}) { for (const handler of [...(this.handlers[type] || [])]) handler({ type, target: this, preventDefault() {}, ...extra }); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(child) { this.children.push(child); child.parent = this; child.parentElement = this; return child; }
  remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  replaceChildren() { for (const child of this.children) child.isConnected = false; this.children = []; }
  contains(other) { return this === other || this.children.some(child => child.contains(other)); }
  getBoundingClientRect() { return this.rect || { top: 10, left: 10, bottom: 250, right: 300, width: 290, height: 240 }; }
  querySelector(selector) { return this.parts?.[selector] || null; }
}
function card(id) {
  const item = new Element();
  item.dataset.previewUrl = '/api/network/talent/' + id + '/preview';
  item.dataset.creatorName = id;
  item.parts = {};
  for (const selector of ['[data-preview-toggle]', '[data-preview-stage]', '[data-preview-status]', '[data-preview-room]']) {
    const part = item.appendChild(new Element()); item.parts[selector] = part;
  }
  item.parts['[data-preview-stage]'].hidden = true;
  item.parts['[data-preview-toggle]'].hidden = true;
  return item;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const muted = (room = 'luna') => ({ available: true, kind: 'iframe', site: 'CB', src: `https://chaturbate.com/in/?tour=9&campaign=Test&room=${room}&disable_sound=1`, href: `/go/CB/r/${room}`, muted: true, checkedAt: Date.now() });
function fixture({ age = false, fetcher = async () => muted(), reduced = false, saveData = false, storageFails = false, withPhoto = false } = {}) {
  const cards = [card('luna'), card('raven')], document = new Element(), window = new Element();
  const images = [], requests = [], timers = new Map(), observers = []; let timerId = 0;
  document.readyState = 'loading'; document.hidden = false;
  document.querySelectorAll = selector => selector === '[data-talent-card]' ? cards : selector === '[data-talent-photo]' ? images : [];
  document.createElement = tag => { const element = new Element(); element.tagName = tag.toUpperCase(); return element; };
  document.children = cards;
  if (withPhoto) { const photo = cards[0].appendChild(new Element()); images.push(photo.appendChild(new Element())); }
  const values = new Map(age ? [['x3s:age', '1']] : []);
  window.location = { origin: 'https://network.example' }; window.innerHeight = 900; window.innerWidth = 1200;
  window.sessionStorage = { getItem: key => { if (storageFails) throw new Error('storage unavailable'); return values.get(key) || null; }, setItem: (key, value) => { if (storageFails) throw new Error('storage unavailable'); values.set(key, value); } };
  window.matchMedia = query => ({ matches: query.includes('prefers-reduced-motion') ? reduced : true });
  class IntersectionObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {} disconnect() { this.disconnected = true; }
  }
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/assets/talent-previews.js'), 'utf8');
  vm.runInNewContext(source, { window, document, navigator: { connection: { saveData } }, URL, Date, AbortController, IntersectionObserver,
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => fetcher(url, options) }; },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id) });
  const controller = window.X3TalentPreviews.mount(document);
  const tick = async max => { const due = [...timers].filter(([, timer]) => timer.ms <= max); for (const [id, timer] of due) { if (timers.delete(id)) timer.fn(); } await flush(); };
  return { cards, document, window, requests, timers, observers, controller, values, tick, images };
}

test('age confirmation precedes all preview requests and remains compatible with the app flag', async () => {
  const view = fixture();
  const [first] = view.cards, toggle = first.querySelector('[data-preview-toggle]');
  first.dispatch('pointerenter', { pointerType: 'mouse' }); await view.tick(500);
  assert.equal(view.requests.length, 0);
  assert.match(toggle.textContent, /18\+/);
  toggle.dispatch('click'); await flush();
  assert.equal(view.values.get('x3s:age'), '1');
  assert.equal(view.requests.length, 1);
  assert.equal(first.querySelector('[data-preview-stage]').children.length, 1);
  view.controller.destroy();
});

test('hover uses a dwell, keeps only one player and releases frame listeners on leave or window blur', async () => {
  const view = fixture({ age: true, fetcher: async url => muted(url.includes('raven') ? 'raven' : 'luna') });
  const [first, second] = view.cards;
  first.dispatch('pointerenter', { pointerType: 'mouse' });
  assert.equal(view.requests.length, 0);
  await view.tick(500);
  const oldFrame = first.querySelector('[data-preview-stage]').children[0];
  assert.ok(oldFrame);
  oldFrame.dispatch('load');
  assert.match(first.querySelector('[data-preview-status]').textContent, /frame from Chaturbate.*mute requested/);
  second.dispatch('pointerenter', { pointerType: 'mouse' });
  assert.equal(first.querySelector('[data-preview-stage]').children.length, 0);
  assert.equal(oldFrame.handlers.load.size, 0, 'removed frame no longer has controller listeners');
  await view.tick(500);
  assert.equal(second.querySelector('[data-preview-stage]').children.length, 1);
  view.window.dispatch('blur');
  assert.equal(second.querySelector('[data-preview-stage]').children.length, 0);
  assert.equal(second.querySelector('[data-preview-toggle]').getAttribute('aria-expanded'), 'false');
  second.dispatch('pointerenter', { pointerType: 'mouse' }); await view.tick(500);
  assert.equal(view.requests.length, 2, 'inactive window cannot restart a hover preview');
  view.controller.destroy();
});

test('superseded and detached-card responses cannot restart a preview even when fetch ignores abort', async () => {
  let finish;
  const view = fixture({ age: true, fetcher: url => url.includes('/luna/') ? new Promise(resolve => { finish = resolve; }) : muted('raven') });
  const [first, second] = view.cards;
  first.querySelector('[data-preview-toggle]').dispatch('click'); await flush();
  second.querySelector('[data-preview-toggle]').dispatch('click'); await flush();
  assert.equal(view.requests[0].options.signal.aborted, true);
  finish(muted()); await flush();
  assert.equal(first.querySelector('[data-preview-stage]').children.length, 0);
  assert.equal(second.querySelector('[data-preview-stage]').children.length, 1);
  view.controller.destroy();

  let release;
  const detached = fixture({ age: true, fetcher: () => new Promise(resolve => { release = resolve; }) });
  detached.cards[0].querySelector('[data-preview-toggle]').dispatch('click'); await flush();
  detached.cards[0].isConnected = false;
  release(muted()); await flush();
  assert.equal(detached.cards[0].querySelector('[data-preview-stage]').children.length, 0);
  assert.equal(detached.requests[0].options.signal.aborted, true);
  detached.controller.destroy();
});

test('leave, focus exit, Escape, outside interaction, offscreen, hidden and pagehide cancel active players', async () => {
  const actions = [
    view => view.cards[0].dispatch('pointerleave', { pointerType: 'mouse' }),
    view => view.cards[0].dispatch('focusout', { relatedTarget: new Element() }),
    view => view.document.dispatch('keydown', { key: 'Escape' }),
    view => view.document.dispatch('pointerdown', { target: new Element() }),
    view => view.observers[0].callback([{ target: view.cards[0], isIntersecting: false, intersectionRatio: 0 }]),
    view => { view.document.hidden = true; view.document.dispatch('visibilitychange'); },
    view => view.window.dispatch('pagehide')
  ];
  for (const act of actions) {
    const view = fixture({ age: true });
    const first = view.cards[0], stage = first.querySelector('[data-preview-stage]');
    first.querySelector('[data-preview-toggle]').dispatch('click'); await flush();
    const frame = stage.children[0]; assert.ok(frame);
    act(view); frame.dispatch('load');
    assert.equal(stage.children.length, 0);
    assert.equal(stage.hidden, true);
    assert.equal(first.querySelector('[data-preview-toggle]').getAttribute('aria-expanded'), 'false');
    assert.equal(view.requests[0].options.signal.aborted, true);
    assert.equal(view.values.get('x3s:age'), '1', 'cleanup retains existing age confirmation');
    view.controller.destroy();
    assert.equal(view.observers[0].disconnected, true);
  }
});

test('reduced motion and save-data suppress automatic previews while explicit touch controls still work', async () => {
  for (const preferences of [{ reduced: true }, { saveData: true }]) {
    const view = fixture({ age: true, ...preferences });
    const first = view.cards[0], toggle = first.querySelector('[data-preview-toggle]');
    first.dispatch('pointerenter', { pointerType: 'mouse' }); toggle.dispatch('focus'); await view.tick(500);
    assert.equal(view.requests.length, 0);
    first.dispatch('pointerenter', { pointerType: 'touch' }); await view.tick(500);
    assert.equal(view.requests.length, 0);
    toggle.dispatch('click'); await flush();
    assert.equal(first.querySelector('[data-preview-stage]').children.length, 1);
    view.controller.destroy();
  }
  const blockedStorage = fixture({ storageFails: true });
  blockedStorage.cards[0].querySelector('[data-preview-toggle]').dispatch('click'); await flush();
  assert.equal(blockedStorage.requests.length, 1, 'explicit age confirmation works for the page when storage is unavailable');
  blockedStorage.controller.destroy();
});

test('invalid provider descriptors never create a frame or an external room link', async () => {
  const invalid = [
    { src: 'https://evil.example/in/?campaign=Test&room=luna&disable_sound=1' },
    { src: 'https://chaturbate.com:444/in/?campaign=Test&room=luna&disable_sound=1' },
    { src: 'https://user:secret@chaturbate.com/in/?campaign=Test&room=luna&disable_sound=1' },
    { src: 'http://chaturbate.com/in/?campaign=Test&room=luna&disable_sound=1' },
    { src: 'https://chaturbate.com/in/?campaign=Test&room=raven&disable_sound=1' },
    { src: 'https://chaturbate.com/in/?campaign=Test&room=luna&room=raven&disable_sound=1' },
    { src: 'https://chaturbate.com/in/?campaign=Test&room=luna&username=raven&disable_sound=1' },
    { src: 'https://chaturbate.com/in/?campaign=Test&room=luna&disable_sound=0' },
    { href: 'https://evil.example/go/CB/r/luna' },
    { href: '/go/BC/r/luna' },
    { muted: false }, { kind: 'video' }, { checkedAt: Date.now() - 180000 },
    { site: 'BC', src: 'https://bongacams2.com/chat-frame.php?c=12345&model=luna', href: '/go/BC/r/luna', muted: false },
    { site: 'BC', src: 'https://unlisted.bngpt.com/chat-frame.php?c=12345&model=luna', href: '/go/BC/r/luna', muted: false }
  ];
  for (const extra of invalid) {
    const view = fixture({ age: true, fetcher: async () => ({ ...muted(), ...extra }) });
    view.cards[0].querySelector('[data-preview-toggle]').dispatch('click'); await flush();
    assert.equal(view.cards[0].querySelector('[data-preview-stage]').children.length, 0, JSON.stringify(extra));
    assert.equal(view.cards[0].querySelector('[data-preview-room]').hidden, true);
    assert.match(view.cards[0].querySelector('[data-preview-status]').textContent, /Preview unavailable/);
    view.controller.destroy();
  }
});

test('errors, request/frame timeouts and photo failures preserve the card fallback', async () => {
  const offline = fixture({ age: true, fetcher: async () => ({ available: false, reason: 'offline' }) });
  offline.cards[0].querySelector('[data-preview-toggle]').dispatch('click'); await flush();
  assert.equal(offline.cards[0].querySelector('[data-preview-status]').textContent, 'Room offline.');
  offline.controller.destroy();
  for (const mode of ['request', 'frame', 'error']) {
    const view = fixture({ age: true, fetcher: mode === 'request' ? () => new Promise(() => {}) : async () => muted(), withPhoto: true });
    const first = view.cards[0], stage = first.querySelector('[data-preview-stage]');
    view.images[0].dispatch('error');
    assert.equal(view.images[0].hidden, true);
    assert.equal(view.images[0].parentElement.classList.contains('photo-unavailable'), true);
    first.querySelector('[data-preview-toggle]').dispatch('click'); await flush();
    if (mode === 'error') stage.children[0].dispatch('error'); else await view.tick(12000);
    assert.equal(stage.children.length, 0);
    assert.match(first.querySelector('[data-preview-status]').textContent, /Preview unavailable/);
    assert.equal(first.querySelector('[data-preview-toggle]').disabled, undefined, 'retry remains available');
    view.controller.destroy();
  }
});

test('BC shows a provider prompt and requires a separate explicit sound-aware Play action', async () => {
  const view = fixture({ age: true, fetcher: async () => ({ available: true, kind: 'iframe', site: 'BC', src: 'https://bongacams.com/chat-frame.php?c=12345&model=luna', href: '/go/BC/r/luna', muted: false, checkedAt: Date.now() }) });
  const [first] = view.cards, stage = first.querySelector('[data-preview-stage]'), toggle = first.querySelector('[data-preview-toggle]');
  toggle.dispatch('focus'); await view.tick(500);
  assert.equal(stage.children.length, 0, 'focus cannot start a potentially audible provider');
  assert.match(toggle.textContent, /Play.*sound may play/);
  toggle.dispatch('click'); await flush();
  assert.equal(view.requests.length, 2, 'explicit Play rechecks the room');
  assert.equal(stage.children.length, 1);
  assert.match(first.querySelector('[data-preview-status]').textContent, /sound may play/);
  toggle.dispatch('click');
  assert.equal(stage.children.length, 0);
  view.controller.destroy();
});
