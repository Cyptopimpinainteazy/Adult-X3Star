'use strict';
/* Progressive talent-card previews. Provider rooms resolve only after visitor interaction. */
(() => {
  const SITES = { CB: 'Chaturbate', BC: 'BongaCams' };
  const HOSTS = {
    CB: new Set(['chaturbate.com', 'www.chaturbate.com']),
    BC: new Set(['bongacams.com', 'bngprm.com', 'bngpt.com'])
  };
  const DWELL = 400, REQUEST_TIMEOUT = 10000, FRAME_TIMEOUT = 12000;
  let mounted = null;

  function resolverUrl(value) {
    try {
      const url = new URL(value, window.location.origin);
      return url.origin === window.location.origin && !url.username && !url.password && !url.search && !url.hash && /^\/api\/network\/talent\/[a-z0-9-]{1,80}\/preview$/.test(url.pathname) ? url.pathname : null;
    } catch { return null; }
  }
  function roomUrl(value, site) {
    try {
      const url = new URL(value, window.location.origin);
      const match = url.pathname.match(/^\/go\/(CB|BC)\/r\/([A-Za-z0-9_.-]{1,60})$/);
      return url.origin === window.location.origin && !url.username && !url.password && !url.search && !url.hash && match && (!site || match[1] === site) ? url.pathname : null;
    } catch { return null; }
  }
  function descriptor(value) {
    if (!value || value.available !== true || value.kind !== 'iframe' || !SITES[value.site] || typeof value.muted !== 'boolean') return null;
    if (!Number.isSafeInteger(value.checkedAt) || Date.now() - value.checkedAt > 120000 || value.checkedAt - Date.now() > 30000) return null;
    const href = roomUrl(value.href, value.site);
    if (!href) return null;
    try {
      const src = new URL(value.src);
      const hostAllowed = value.site === 'CB' ? HOSTS.CB.has(src.hostname) : HOSTS.BC.has(src.hostname) || src.hostname.endsWith('.bongacams.com');
      if (src.protocol !== 'https:' || src.username || src.password || src.port || !hostAllowed || src.hash) return null;
      const room = href.split('/').pop(), roomKey = value.site === 'CB' ? 'room' : 'model', campaignKey = value.site === 'CB' ? 'campaign' : 'c';
      if (src.pathname !== (value.site === 'CB' ? '/in/' : '/chat-frame.php')) return null;
      if (src.searchParams.getAll(roomKey).length !== 1 || src.searchParams.get(roomKey) !== room || src.searchParams.getAll(campaignKey).length !== 1) return null;
      if (!(value.site === 'CB' ? /^[A-Za-z0-9]{1,20}$/ : /^\d{3,12}$/).test(src.searchParams.get(campaignKey))) return null;
      for (const key of src.searchParams.keys()) {
        if (/^(room|model|campaign|c|username|user|performer)(\[|$)/i.test(key) && key !== roomKey && key !== campaignKey) return null;
      }
      if (value.site === 'CB' && (!value.muted || src.searchParams.getAll('disable_sound').length !== 1 || src.searchParams.get('disable_sound') !== '1')) return null;
      if (value.site === 'BC' && value.muted) return null;
      return { ...value, src: src.href, href };
    } catch { return null; }
  }

  function mount(root = document) {
    if (mounted) mounted.destroy();
    const listeners = [], entries = [];
    let active = null, dwell = null, observer = null, destroyed = false, confirmedHere = false;
    let windowFocused = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
    const listen = (element, event, handler) => { element.addEventListener(event, handler); listeners.push(() => element.removeEventListener(event, handler)); };
    const ageConfirmed = () => {
      if (confirmedHere) return true;
      try { return window.sessionStorage.getItem('x3s:age') === '1'; } catch { return false; }
    };
    const say = (entry, message) => { entry.status.textContent = message; };
    const restingButton = entry => {
      entry.button.textContent = ageConfirmed() ? 'Preview room' : "I’m 18+ — enable room previews";
      entry.button.setAttribute('aria-expanded', 'false');
    };
    const visible = entry => {
      if (destroyed || document.hidden || !windowFocused || !entry.card.isConnected || entry.inView === false) return false;
      const rect = entry.card.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
    };
    const clearDwell = () => { if (dwell) clearTimeout(dwell.timer); dwell = null; };
    function stop(message = '') {
      clearDwell();
      if (!active) return;
      const old = active; active = null;
      clearTimeout(old.requestTimer); clearTimeout(old.frameTimer);
      old.abort.abort();
      old.frameCleanup?.forEach(remove => remove());
      if (old.frame) { old.frame.removeAttribute('src'); old.frame.remove(); }
      old.entry.stage.replaceChildren(); old.entry.stage.hidden = true;
      old.entry.card.classList.remove('is-previewing', 'is-preview-loading', 'is-preview-ready');
      old.entry.room.hidden = true; old.entry.room.removeAttribute('href');
      if (old.entry.presence) old.entry.presence.textContent = old.entry.presenceText;
      restingButton(old.entry); say(old.entry, message);
    }
    function valid(state) {
      if (active !== state) return false;
      if (!ageConfirmed() || !visible(state.entry)) { stop(); return false; }
      return true;
    }
    function openFrame(state, data) {
      if (!valid(state)) return;
      const entry = state.entry, frame = document.createElement('iframe');
      state.phase = 'loading'; state.frame = frame;
      entry.card.classList.add('is-preview-loading');
      entry.stage.hidden = false;
      frame.title = `${entry.card.dataset.creatorName || 'Creator'} live room on ${SITES[data.site]}`;
      frame.allow = 'autoplay; fullscreen'; frame.referrerPolicy = 'no-referrer'; frame.tabIndex = -1;
      frame.setAttribute('scrolling', 'no');
      state.frameCleanup = [];
      const frameListen = (event, handler) => { frame.addEventListener(event, handler); state.frameCleanup.push(() => frame.removeEventListener(event, handler)); };
      frameListen('load', () => {
        if (!valid(state)) return;
        clearTimeout(state.frameTimer); state.phase = 'loaded';
        entry.card.classList.remove('is-preview-loading'); entry.card.classList.add('is-previewing');
        say(entry, `Room frame from ${SITES[data.site]}${data.muted ? ' · mute requested' : ' · sound may play'}.`);
      });
      frameListen('error', () => { if (active === state) stop('Preview unavailable.'); });
      entry.button.textContent = 'Stop room preview'; entry.button.setAttribute('aria-expanded', 'true');
      say(entry, `Opening room on ${SITES[data.site]}${data.muted ? ' · mute requested' : ' · sound may play'}…`);
      state.frameTimer = setTimeout(() => { if (active === state) stop('Preview unavailable.'); }, FRAME_TIMEOUT);
      frame.src = data.src; entry.stage.appendChild(frame);
    }
    async function request(entry, allowSound = false) {
      if (!ageConfirmed() || !visible(entry)) return;
      stop();
      const state = { entry, abort: new AbortController(), phase: 'resolving', frame: null };
      active = state;
      entry.stage.hidden = false; entry.card.classList.add('is-preview-loading');
      entry.button.textContent = 'Cancel room preview'; entry.button.setAttribute('aria-expanded', 'true');
      entry.room.hidden = true; say(entry, 'Checking live room…');
      state.requestTimer = setTimeout(() => { if (active === state) stop('Preview unavailable.'); }, REQUEST_TIMEOUT);
      try {
        const response = await fetch(entry.url, { headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store', signal: state.abort.signal });
        if (!response.ok) throw new Error('Unavailable');
        const result = await response.json();
        if (!valid(state)) return;
        clearTimeout(state.requestTimer);
        if (result && result.available === false) { stop(result.reason === 'offline' ? 'Room offline.' : 'Preview unavailable.'); return; }
        const data = descriptor(result);
        if (!data) { stop('Preview unavailable.'); return; }
        state.data = data;
        if (entry.presence) entry.presence.textContent = `Room on ${SITES[data.site]}`;
        entry.room.href = data.href; entry.room.textContent = `Open room on ${SITES[data.site]} ↗`; entry.room.hidden = false;
        if (!data.muted && !allowSound) {
          state.phase = 'ready'; entry.card.classList.remove('is-preview-loading'); entry.card.classList.add('is-preview-ready');
          entry.button.textContent = 'Play room preview · sound may play';
          say(entry, `Room available on ${SITES[data.site]}. Press Play; sound may play.`);
          return;
        }
        openFrame(state, data);
      } catch {
        if (active === state) stop('Preview unavailable.');
      }
    }
    const automaticAllowed = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !(navigator.connection && navigator.connection.saveData);
    function schedule(entry) {
      if (!automaticAllowed() || !visible(entry) || active?.entry === entry) return;
      if (!ageConfirmed()) { say(entry, 'Confirm you are 18+ to enable room previews.'); return; }
      stop();
      dwell = { entry, timer: setTimeout(() => { dwell = null; request(entry); }, DWELL) };
    }

    for (const image of root.querySelectorAll('[data-talent-photo]')) {
      const failed = () => { image.hidden = true; image.parentElement?.classList.add('photo-unavailable'); };
      listen(image, 'error', failed);
      if (image.complete && image.naturalWidth === 0) failed();
    }
    for (const card of root.querySelectorAll('[data-talent-card]')) {
      const url = resolverUrl(card.dataset.previewUrl);
      const button = card.querySelector('[data-preview-toggle]'), stage = card.querySelector('[data-preview-stage]');
      const status = card.querySelector('[data-preview-status]'), room = card.querySelector('[data-preview-room]');
      if (!url || !button || !stage || !status || !room) continue;
      const presence = card.querySelector('[data-preview-presence]');
      const entry = { card, url, button, stage, status, room, presence, presenceText: presence?.textContent, inView: true }; entries.push(entry);
      button.hidden = false; card.classList.add('has-preview-controls'); restingButton(entry);
      listen(card, 'pointerenter', event => { if (event.pointerType === 'mouse' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) schedule(entry); });
      listen(card, 'pointerleave', event => { if (event.pointerType === 'mouse' && (active?.entry === entry || dwell?.entry === entry)) stop(); });
      listen(button, 'focus', () => schedule(entry));
      listen(card, 'focusout', event => { if (!card.contains(event.relatedTarget) && (active?.entry === entry || dwell?.entry === entry)) stop(); });
      listen(button, 'click', () => {
        clearDwell();
        if (!ageConfirmed()) {
          confirmedHere = true;
          try { window.sessionStorage.setItem('x3s:age', '1'); } catch { /* Explicit confirmation applies to this page even if storage is blocked. */ }
          for (const other of entries) if (other !== active?.entry) restingButton(other);
        }
        if (active?.entry === entry) {
          if (active.phase === 'ready') request(entry, true); else stop();
        } else request(entry);
      });
    }
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(changes => {
        for (const change of changes) {
          const entry = entries.find(item => item.card === change.target);
          if (!entry) continue;
          entry.inView = change.isIntersecting && change.intersectionRatio >= 0.25;
          if (!entry.inView && (active?.entry === entry || dwell?.entry === entry)) stop();
        }
      }, { threshold: [0, 0.25] });
      entries.forEach(entry => observer.observe(entry.card));
    }
    listen(document, 'pointerdown', event => { const entry = active?.entry || dwell?.entry; if (entry && !entry.card.contains(event.target)) stop(); });
    listen(document, 'keydown', event => { if (event.key === 'Escape') stop(); });
    listen(document, 'visibilitychange', () => { if (document.hidden) stop(); });
    listen(window, 'blur', () => { windowFocused = false; stop(); });
    listen(window, 'focus', () => { windowFocused = true; });
    const stopOffscreen = () => { const entry = active?.entry || dwell?.entry; if (entry && !visible(entry)) stop(); };
    listen(window, 'scroll', stopOffscreen);
    listen(window, 'resize', stopOffscreen);
    listen(window, 'pagehide', () => stop());
    const api = { destroy() { stop(); destroyed = true; observer?.disconnect(); listeners.forEach(remove => remove()); if (mounted === api) mounted = null; } };
    mounted = api;
    return api;
  }
  window.X3TalentPreviews = { mount };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
  else mount();
})();
