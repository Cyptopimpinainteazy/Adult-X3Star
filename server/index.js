'use strict';
/* x3STAR server: static apps, REST API, uploads, realtime hub. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const cfg = require('./config');
require('./db');
const A = require('./auth');
const S = require('./services');
const U = require('./uploads');
const hub = require('./ws');
const { all } = require('./db');
const { seed } = require('./seed');

const app = express();
app.disable('x-powered-by');
if (cfg.TRUST_PROXY) app.set('trust proxy', 1);

/* security headers */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:", "img-src 'self' data: blob:", "media-src 'self' data: blob:",
    "connect-src 'self' ws: wss: data:", "frame-ancestors 'self'", "base-uri 'self'", "form-action 'self'"
  ].join('; '));
  if (cfg.COOKIE_SECURE) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});
app.use(express.json({ limit: '256kb' }));
app.use(A.attachUser);

/* CSRF guard: state-changing API calls must be same-origin JSON or multipart from our pages */
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return next(new A.HttpError(403, 'bad_origin', 'Cross-origin request blocked')); } catch { return next(new A.HttpError(403, 'bad_origin', 'Cross-origin request blocked')); } }
  const ct = String(req.headers['content-type'] || '');
  if (!ct.startsWith('application/json') && !ct.startsWith('multipart/form-data') && req.headers['content-length'] && req.headers['content-length'] !== '0') return next(new A.HttpError(415, 'bad_content_type', 'Use application/json'));
  next();
});

/* API */
app.use('/api', require('./routes/public'));
app.use('/api/econ', require('./routes/econ').router);
app.use('/api/studio', require('./routes/studio'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/social'));
app.use('/api', (_req, _res, next) => next(new A.HttpError(404, 'not_found', 'No such endpoint')));

/* affiliate go-links: log the click, forward to the configured affiliate URL */
app.get('/go/:site/:creator', (req, res, next) => {
  const site = String(req.params.site).toUpperCase(), aff = (S.econConfig().affiliates || {})[site];
  const c = require('./db').get("SELECT * FROM creators WHERE id = ? AND status = 'approved'", req.params.creator);
  const handle = c ? (require('./db').J(c.handles, {})[site] || '') : '';
  if (!aff || !aff.url || !handle) return next(new A.HttpError(404, 'not_found', 'Link not available'));
  const campaign = String(req.query.c || '').slice(0, 80), source = String(req.query.s || '').slice(0, 80);
  const ipHash = require('node:crypto').createHash('sha256').update(String(req.ip || '') + (process.env.CLICK_SALT || 'x3s')).digest('hex').slice(0, 16);
  require('./db').run('INSERT INTO clicks (site, creator_id, campaign, source, user_id, ip_hash, created_at) VALUES (?,?,?,?,?,?,?)', site, c.id, campaign, source, req.user ? req.user.id : null, ipHash, Date.now());
  const url = aff.url.replace(/\{room\}/g, encodeURIComponent(handle)).replace(/\{campaign\}/g, encodeURIComponent(campaign || 'x3star')).replace(/\{source\}/g, encodeURIComponent(source || 'site'));
  if (!/^https:\/\//.test(url)) return next(new A.HttpError(500, 'bad_affiliate_url', 'Affiliate URL must be https'));
  res.redirect(302, url);
});

/* uploads (moderated) */
app.get('/uploads/:file', U.serveUpload);

/* fan app with server-injected boot data */
let indexTpl = null;
function indexHtml() {
  if (!indexTpl || cfg.NODE_ENV !== 'production') indexTpl = fs.readFileSync(path.join(cfg.PUBLIC_DIR, 'index.html'), 'utf8');
  return indexTpl;
}
function bootPayload(req) {
  const rows = all("SELECT * FROM creators WHERE status = 'approved' ORDER BY featured DESC, base_viewers DESC").map(c => S.publicCreator(c));
  return { api: true, creators: rows.filter(c => c.live), offline: rows.filter(c => !c.live), me: req.user ? S.publicUser(req.user) : null, economy: S.econConfig(), payments: cfg.PAYMENTS_MODE, demoTraffic: cfg.DEMO_TRAFFIC };
}
const sendIndex = (req, res) => {
  const json = JSON.stringify(bootPayload(req)).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16));
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(indexHtml().replace('<!--X3STAR_BOOT-->', `<script>window.X3STAR_BOOT=${json};</script>`));
};
app.get(['/', '/index.html'], sendIndex);
app.use('/shared', express.static(cfg.SHARED_DIR, { maxAge: cfg.NODE_ENV === 'production' ? '1h' : 0 }));
app.use(express.static(cfg.PUBLIC_DIR, { index: false, extensions: ['html'], maxAge: cfg.NODE_ENV === 'production' ? '1h' : 0 }));

/* errors */
app.use((err, req, res, _next) => {
  const econCodes = { insufficient: 402, vip_required: 403, not_owned: 403, not_found: 404, already_claimed: 409, owned: 409, not_ready: 409, cap_reached: 400, downgrade: 409, not_for_sale: 400, no_vip: 403, bad_input: 400, below_min: 400 };
  const status = err.status || (err.name === 'EconError' ? econCodes[err.code] || 400 : err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error(err);
  const body = { error: { code: err.code || (status === 400 ? 'bad_request' : 'server_error'), message: status >= 500 ? 'Something went wrong' : err.message } };
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return res.status(status).json(body);
  res.status(status).type('text').send(body.error.message);
});

function start(port = cfg.PORT, host = cfg.HOST) {
  seed();
  const server = http.createServer(app);
  hub.init(server);
  return new Promise((resolve) => server.listen(port, host, () => {
    const addr = server.address();
    console.log(`x3STAR listening on http://${addr.address === '0.0.0.0' ? 'localhost' : addr.address}:${addr.port}  (payments: ${cfg.PAYMENTS_MODE}, demo traffic: ${cfg.DEMO_TRAFFIC ? 'on' : 'off'})`);
    resolve(server);
  }));
}

if (require.main === module) start();
module.exports = { app, start };
