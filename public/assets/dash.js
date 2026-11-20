/* Shared helpers for Creator Studio and Admin. */
(function (root) {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = {
    num: (n) => Math.round(Number(n) || 0).toLocaleString('en-US'),
    usd: (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    k: (n) => { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n)); },
    date: (ts) => ts ? new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—',
    ago: (ts) => { if (!ts) return '—'; const s = (Date.now() - ts) / 1000; if (s < 60) return 'now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; },
    bytes: (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' B'
  };
  function toast(msg, kind = '') {
    let box = $('.toasts'); if (!box) { box = el('<div class="toasts" aria-live="polite"></div>'); document.body.appendChild(box); }
    const t = el(`<div class="toast ${kind}">${esc(msg)}</div>`); box.appendChild(t); setTimeout(() => t.remove(), 3600);
  }
  function modal(html) {
    const s = el(`<div class="scrim" role="dialog" aria-modal="true"><div class="modal">${html}</div></div>`); document.body.appendChild(s);
    const close = () => s.remove();
    s.addEventListener('mousedown', e => { if (e.target === s) close(); });
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
    setTimeout(() => { const f = $('input,textarea,select,button', s); f && f.focus(); }, 30);
    return { root: $('.modal', s), close };
  }
  function confirmBox(title, body, okLabel = 'Confirm', danger) {
    return new Promise((resolve) => {
      const m = modal(`<h3>${esc(title)}</h3><p class="mute" style="margin:0">${esc(body)}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-n>Cancel</button><button class="btn ${danger ? 'red' : 'pri'}" data-y>${esc(okLabel)}</button></div>`);
      $('[data-n]', m.root).onclick = () => { m.close(); resolve(false); };
      $('[data-y]', m.root).onclick = () => { m.close(); resolve(true); };
    });
  }
  function promptBox(title, fields, okLabel = 'Save') {
    return new Promise((resolve) => {
      const m = modal(`<h3>${esc(title)}</h3>${fields.map(f => `<label class="field"><span>${esc(f.label)}</span>${f.type === 'select' ? `<select class="inp" name="${f.name}">${f.options.map(o => `<option value="${esc(o.value ?? o)}" ${String(o.value ?? o) === String(f.value) ? 'selected' : ''}>${esc(o.label ?? o)}</option>`).join('')}</select>` : f.type === 'textarea' ? `<textarea class="inp" name="${f.name}">${esc(f.value || '')}</textarea>` : `<input class="inp" name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}>`}</label>`).join('')}<div class="row" style="justify-content:flex-end"><button class="btn" data-n>Cancel</button><button class="btn pri" data-y>${esc(okLabel)}</button></div>`);
      $('[data-n]', m.root).onclick = () => { m.close(); resolve(null); };
      $('[data-y]', m.root).onclick = () => { const out = {}; fields.forEach(f => { out[f.name] = $(`[name="${f.name}"]`, m.root).value; }); m.close(); resolve(out); };
    });
  }
  function bars(values, labelFn, cls = '') {
    const max = Math.max(1, ...values);
    return `<div class="bars ${cls}">${values.map((v, i) => `<i style="height:${Math.max(2, v / max * 100)}%" data-t="${esc(labelFn ? labelFn(v, i) : fmt.num(v))}"></i>`).join('')}</div>`;
  }
  /** XHR upload with progress (fetch has no upload progress). */
  function uploadWithProgress(url, fields, file, onProgress) {
    return new Promise((resolve, reject) => {
      const fd = new FormData(); Object.entries(fields || {}).forEach(([k, v]) => fd.append(k, v)); fd.append('file', file);
      const x = new XMLHttpRequest(); x.open('POST', url); x.withCredentials = true;
      x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      x.onload = () => { let d = null; try { d = JSON.parse(x.responseText); } catch {} if (x.status >= 200 && x.status < 300) resolve(d); else reject(new Error(d && d.error ? d.error.message : 'Upload failed (' + x.status + ')')); };
      x.onerror = () => reject(new Error('Network error during upload'));
      x.send(fd);
    });
  }
  async function guard(fn, okMsg) { try { const r = await fn(); if (okMsg) toast(okMsg, 'ok'); return r; } catch (e) { toast(e.message || 'Something went wrong', 'err'); throw e; } }
  /** Simple hash router for dashboards. */
  function router(views, fallback, onChange) {
    const go = () => { const k = (location.hash || '').replace(/^#/, '') || fallback; const v = views[k] ? k : fallback; $$('.side a.nav').forEach(a => a.classList.toggle('on', a.dataset.v === v)); $('.side') && $('.side').classList.remove('open'); onChange && onChange(v); views[v](); window.scrollTo(0, 0); };
    addEventListener('hashchange', go); go(); return go;
  }
  root.Dash = { $, $$, el, esc, fmt, toast, modal, confirmBox, promptBox, bars, uploadWithProgress, guard, router };
})(window);
