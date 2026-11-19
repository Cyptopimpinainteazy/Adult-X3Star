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
    "font-src 'self' https://fonts.gstatic.com data:", "img-src 'self' data: blob: https://v.bngprm.com https://*.highwebmedia.com https://*.mmcdn.com", "media-src 'self' data: blob:",
    "connect-src 'self' ws: wss: data:", "frame-ancestors 'self'", "base-uri 'self'", "form-action 'self'"
  ].join('; '));
  if (cfg.COOKIE_SECURE) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});
app.use('/api/admin/partner-videos/import', express.json({ limit: '5mb' }));
app.use(/^\/api\/admin\/affiliates\/[A-Za-z0-9]+\/stats\/import$/, express.json({ limit: '2mb' }));
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

/* affiliate go-links: log the click, then forward to the partner/affiliate URL */
const D = require('./db');
const clickParams = (req) => ({ campaign: String(req.query.c || '').slice(0, 80), source: String(req.query.s || '').slice(0, 80) });
function logClick(req, site, creatorId, placement, campaign, source) {
  const ipHash = require('node:crypto').createHash('sha256').update(String(req.ip || '') + (process.env.CLICK_SALT || 'x3s')).digest('hex').slice(0, 16);
  D.run('INSERT INTO clicks (site, creator_id, placement, campaign, source, user_id, ip_hash, created_at) VALUES (?,?,?,?,?,?,?,?)', site, creatorId, placement, campaign, source, req.user ? req.user.id : null, ipHash, Date.now());
}
const trackSource = (source, campaign) => [source, campaign].filter(Boolean).join('-') || 'x3s';
/* site-level partner placements (footer links, partner ads, broadcaster sign-up) */
app.get('/go/p/:placement', (req, res, next) => {
  const pc = S.econConfig().partners, key = String(req.params.placement);
  const { campaign, source } = clickParams(req);
  const built = /^[a-z0-9_]{1,40}$/.test(key) && require('./affiliates').isLive('CB') ? S.P.placementUrl(pc, key, { source: trackSource(source, campaign) }) : null;
  if (!built) return next(new A.HttpError(404, 'not_found', 'Link not available'));
  logClick(req, 'CB', '', key, campaign, source);
  res.redirect(302, built.url);
});
/* "Live now on Chaturbate" grid: count the click, then your affiliate link to that room */
app.get('/go/CB/r/:room', (req, res, next) => {
  const pc = S.econConfig().partners, room = String(req.params.room);
  const { campaign, source } = clickParams(req);
  const built = require('./cblive').ROOM_RE.test(room) && require('./affiliates').isLive('CB') ? S.P.roomUrl(pc, room, { source: trackSource(source, campaign), placement: 'live_grid' }) : null;
  if (!built) return next(new A.HttpError(404, 'not_found', 'Link not available'));
  logClick(req, 'CB', '', 'live_grid', campaign, source);
  res.redirect(302, built.url);
});
/* partner links from the Affiliates registry */
app.get('/go/a/:id', (req, res, next) => {
  const AF = require('./affiliates');
  const l = /^\d{1,9}$/.test(req.params.id) ? D.get("SELECT l.* FROM affiliate_links l JOIN affiliate_partners p ON p.id = l.partner_id WHERE l.id = ? AND l.active = 1 AND p.status = 'active'", Number(req.params.id)) : null;
  if (!l) return next(new A.HttpError(404, 'not_found', 'Link not available'));
  const { campaign, source } = clickParams(req);
  const url = AF.fillLink(l.url, { placement: 'a' + l.id, source, campaign });
  if (!/^https:\/\//.test(url)) return next(new A.HttpError(500, 'bad_affiliate_url', 'Affiliate URL must be https'));
  logClick(req, l.partner_id, '', 'a' + l.id, campaign, source);
  res.redirect(302, url);
});
/* partner videos (BongaCams feed): log, then forward to the feed's own tracking link */
app.get('/go/v/:id', (req, res, next) => {
  const v = /^[A-Z]{2}\d{5,12}$/.test(req.params.id) ? D.get('SELECT * FROM partner_videos WHERE id = ? AND hidden = 0', req.params.id) : null;
  if (!v || !require('./affiliates').isLive(v.site) || !/^https:\/\/bongacams\.com\/track\?/.test(v.url)) return next(new A.HttpError(404, 'not_found', 'Video not available'));
  const { campaign, source } = clickParams(req);
  logClick(req, v.site, 'v:' + v.id, 'video', campaign, source);
  res.redirect(302, v.url);
});
/* a creator's room on another site ("Also live on …") */
app.get('/go/:site/:creator', (req, res, next) => {
  const site = String(req.params.site).toUpperCase(), cfgNow = S.econConfig(), aff = (cfgNow.affiliates || {})[site];
  const c = D.get("SELECT * FROM creators WHERE id = ? AND status = 'approved'", req.params.creator);
  const handle = c ? (D.J(c.handles, {})[site] || '') : '';
  if (!aff || !handle || !require('./affiliates').isLive(site)) return next(new A.HttpError(404, 'not_found', 'Link not available'));
  const { campaign, source } = clickParams(req);
  let url = null;
  if (site === 'CB' && cfgNow.partners && cfgNow.partners.CB && cfgNow.partners.CB.enabled) {
    const built = S.P.roomUrl(cfgNow.partners, handle, { source: trackSource(source, campaign), creator: c.id });
    url = built && built.url;
  } else if (aff.url) {
    url = aff.url.replace(/\{room\}/g, encodeURIComponent(handle)).replace(/\{campaign\}/g, encodeURIComponent(campaign || 'x3star')).replace(/\{source\}/g, encodeURIComponent(source || 'site'));
  }
  if (!url) return next(new A.HttpError(404, 'not_found', 'Link not available'));
  if (!/^https:\/\//.test(url)) return next(new A.HttpError(500, 'bad_affiliate_url', 'Affiliate URL must be https'));
  logClick(req, site, c.id, 'room', campaign, source);
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
  return { api: true, creators: rows.filter(c => c.live), offline: rows.filter(c => !c.live), me: req.user ? S.publicUser(req.user) : null, economy: S.econConfig(), partners: S.partnerPlacements(), payments: cfg.PAYMENTS_MODE, demoTraffic: cfg.DEMO_TRAFFIC };
}
const sendIndex = (req, res) => {
  const json = JSON.stringify(bootPayload(req)).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16));
  res.setHeader('Cache-Control', 'no-store');
  res.type('html').send(indexHtml().replace('<!--X3STAR_BOOT-->', `<script>window.X3STAR_BOOT=${json};</script>`));
};
app.get(['/', '/index.html'], sendIndex);

/* indexable pages + crawler files */
const baseUrl = (req) => `${req.protocol}://${req.get('host')}`;
app.get(['/cam-model-guide', '/become-a-cam-model'], (req, res) => {
  if (req.path !== '/cam-model-guide') return res.redirect(301, '/cam-model-guide');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('html').send(require('./pages/guide').renderGuide({ econ: S.econConfig(), baseUrl: baseUrl(req) }));
});
app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /api/\nDisallow: /admin\nDisallow: /studio\nDisallow: /go/\nDisallow: /uploads/\nSitemap: ${baseUrl(req)}/sitemap.xml\n`));
app.get('/sitemap.xml', (req, res) => {
  const b = baseUrl(req), day = new Date().toISOString().slice(0, 10);
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/cam-model-guide'].map(p => `  <url><loc>${b}${p}</loc><lastmod>${day}</lastmod></url>`).join('\n')}\n</urlset>\n`);
});
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
  require('./affiliates').ensureDefaults();
  const feed = require('./feeds').importDirIfEmpty(path.join(__dirname, '..', 'seed', 'partner-feeds'));
  if (feed) console.log(`Imported partner videos: ${feed.added} added, ${feed.skipped} skipped`);
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
