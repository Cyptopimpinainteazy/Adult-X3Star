/* x3STAR API client — shared by the fan app, Creator Studio and Admin. */
(function (root) {
  'use strict';
  class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
  async function req(method, path, body, isForm) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) { if (isForm) opts.body = body; else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); } }
    let res;
    try { res = await fetch(path, opts); } catch (e) { throw new ApiError(0, 'network', 'Network error — check your connection'); }
    let data = null; try { data = await res.json(); } catch {}
    if (!res.ok) throw new ApiError(res.status, data && data.error ? data.error.code : 'http_' + res.status, data && data.error ? data.error.message : res.statusText);
    return data;
  }
  root.X3API = {
    ApiError,
    get: (p) => req('GET', p),
    post: (p, b = {}) => req('POST', p, b),
    put: (p, b = {}) => req('PUT', p, b),
    patch: (p, b = {}) => req('PATCH', p, b),
    del: (p) => req('DELETE', p),
    upload: (p, fields, file) => { const fd = new FormData(); Object.entries(fields || {}).forEach(([k, v]) => fd.append(k, v)); fd.append('file', file); return req('POST', p, fd, true); }
  };
})(typeof self !== 'undefined' ? self : this);
