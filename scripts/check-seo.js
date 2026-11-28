'use strict';
/* Read-only HTTP check. Fetches the sitemap and HTML, never live players or outbound links. */
const assert = require('node:assert/strict');
const decode = text => text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[name]));

async function checkSeo(target = 'http://127.0.0.1:8080') {
  const base = new URL(target);
  assert.ok(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password && base.pathname === '/' && !base.search && !base.hash, 'Pass a plain HTTP(S) origin');
  const get = async path => {
    const endpoint = new URL(base.origin + path);
    assert.equal(endpoint.origin, base.origin, 'Fetch must stay on the supplied test server');
    const response = await fetch(endpoint, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200, path + ': expected HTTP 200');
    return { response, text: await response.text() };
  };
  const { text: sitemap } = await get('/sitemap.xml');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(decode(match[1])));
  assert.ok(urls.length > 0, 'Sitemap must list canonical pages');
  assert.equal(new Set(urls.map(url => url.href)).size, urls.length, 'Duplicate sitemap URL');
  const origin = urls[0].origin;
  const titles = new Set(), descriptions = new Set();
  let articles = 0, topics = 0;
  for (const url of urls) {
    assert.ok(['http:', 'https:'].includes(url.protocol), 'Sitemap URLs must use HTTP(S)');
    assert.equal(url.origin, origin, 'Mixed sitemap origins');
    assert.ok(!url.search && !url.hash && !url.username && !url.password, 'Sitemap URL must be canonical');
    const { response, text: html } = await get(url.pathname);
    assert.match(response.headers.get('content-type') || '', /^text\/html/, url.pathname);
    const head = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1];
    assert.ok(head, url.pathname + ': missing head');
    const title = decode(head.match(/<title>([^<]+)<\/title>/i)?.[1] || '');
    const description = decode(head.match(/<meta name="description" content="([^"]+)"/i)?.[1] || '');
    assert.ok(title && description, url.pathname + ': missing search metadata');
    assert.ok(!titles.has(title) && !descriptions.has(description), url.pathname + ': duplicate search metadata');
    titles.add(title); descriptions.add(description);
    const canonicals = [...head.matchAll(/<link rel="canonical" href="([^"]+)"/gi)];
    assert.equal(canonicals.length, 1, url.pathname + ': expected one canonical');
    assert.equal(decode(canonicals[0][1]), url.href, url.pathname + ': canonical mismatch');
    assert.doesNotMatch(head, /<meta name="robots" content="[^"]*noindex/i, url.pathname);
    assert.doesNotMatch(response.headers.get('x-robots-tag') || '', /noindex/i, url.pathname);
    assert.match(html, /<h1[ >]/i, url.pathname + ': missing initial heading');
    for (const name of ['twitter:title', 'twitter:description']) assert.ok(head.includes('name="' + name + '"'), url.pathname + ': missing ' + name);
    const scripts = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length, url.pathname + ': missing structured data');
    for (const script of scripts) JSON.parse(script[1]);
    if (url.pathname.startsWith('/blog/topics/')) topics++;
    else if (url.pathname.startsWith('/blog/')) articles++;
  }
  return { ok: true, target: base.origin, canonicalOrigin: origin, pagesChecked: urls.length, articlesChecked: articles, topicGuidesChecked: topics, uniqueTitles: titles.size, uniqueDescriptions: descriptions.size, scope: 'Initial HTML and sitemap only; no browser, indexing, rankings or traffic verification.' };
}

if (require.main === module) checkSeo(process.argv[2]).then(report => console.log(JSON.stringify(report, null, 2))).catch(error => { console.error('SEO check failed: ' + error.message); process.exitCode = 1; });
module.exports = { checkSeo };
