'use strict';
const express = require('express');
const cfg = require('../config');
const S = require('../services');
const { STATES, getState } = require('../content/states');
const { ARTICLES, getArticle } = require('../content/articles');
const { renderCasting, renderBlog, UPDATED, esc } = require('../pages/editorial');
const r = express.Router();
const originFor = req => cfg.SITE_URL || new URL(`${req.protocol}://${req.get('host')}`).origin;

r.use(['/casting', '/blog'], (req, res, next) => {
  if (req.originalUrl.split('?')[0].endsWith('/')) {
    const q = req.originalUrl.indexOf('?');
    return res.redirect(301, req.originalUrl.slice(0, q === -1 ? undefined : q).replace(/\/+$/, '') + (q === -1 ? '' : req.originalUrl.slice(q)));
  }
  next();
});
function casting(req, res) {
  const state = req.params.state ? getState(req.params.state) : null;
  if (req.params.state && (!state || state.slug !== req.params.state)) return res.status(404).type('text').send('State guide not found');
  res.setHeader('Cache-Control', 'no-store');
  if (state && !state.indexable) res.setHeader('X-Robots-Tag', 'noindex, follow');
  res.type('html').send(renderCasting({ state, origin: originFor(req), partners: S.partnerPlacements(), campaign: typeof req.query.utm_campaign === 'string' ? req.query.utm_campaign : '' }));
}
r.get('/casting', casting);
r.get('/casting/:state', casting);
r.get('/blog', (req, res) => res.type('html').send(renderBlog({ origin: originFor(req) })));
r.get('/blog/:slug', (req, res) => {
  const article = getArticle(req.params.slug);
  if (!article) return res.status(404).type('text').send('Article not found');
  res.type('html').send(renderBlog({ origin: originFor(req), article }));
});
r.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nDisallow: /api/\nDisallow: /admin\nDisallow: /studio\nDisallow: /go/\nDisallow: /uploads/\nSitemap: ${originFor(req)}/sitemap.xml\n`));
r.get('/sitemap.xml', (req, res) => {
  const origin = originFor(req);
  const entries = [['/'], ['/cam-model-guide'], ['/casting', UPDATED], ['/blog', UPDATED], ...STATES.filter(s => s.indexable).map(s => ['/casting/' + s.slug, s.updated]), ...ARTICLES.map(a => ['/blog/' + a.slug, a.updated])];
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(([p, date]) => `  <url><loc>${esc(origin + p)}</loc>${date ? `<lastmod>${date}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
});
module.exports = { router: r, originFor };
