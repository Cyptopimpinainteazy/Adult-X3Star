'use strict';
/* Public editorial routes against a real HTTP server and temporary SQLite. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'x3-editorial-'));
Object.assign(process.env, { DATA_DIR: dir, SITE_URL: 'https://creators.example', SEED_DEMO: '0', DEMO_TRAFFIC: '0', ADMIN_PASSWORD: 'editorial-test-only-123', COOKIE_SECURE: '0' });
require('../server/seed').seed({ quiet: true });
const { start } = require('../server/index');
let server, base;
test.before(async () => { server = await start(0, '127.0.0.1'); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { await new Promise(r => server.close(r)); require('../server/db').db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('casting hub is crawlable and offers every US state with a direct application', async () => {
  const res = await fetch(base + '/casting?utm_source=search');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<h1[^>]*>[^]*creator[^]*<\/h1>/i);
  const states = new Set([...html.matchAll(/href="\/casting\/([a-z-]+)"/g)].map(m => m[1]));
  assert.equal(states.size, 50);
  assert.match(html, /rel="canonical" href="https:\/\/creators\.example\/casting"/);
  assert.match(html, /id="casting-form"/);
  assert.match(html, /name="adult"/);
  assert.match(html, /\/go\/p\/apply_broadcaster/);
  assert.doesNotMatch(html, /<iframe|\/assets\/game\.js|\/api\/cb\/live/);
});

test('all state landing pages work; only developed profiles invite indexing', async () => {
  const hub = await (await fetch(base + '/casting')).text();
  const slugs = [...new Set([...hub.matchAll(/href="\/casting\/([a-z-]+)"/g)].map(m => m[1]))];
  let indexed = 0, withheld = 0;
  const titles = new Set();
  for (const slug of slugs) {
    const res = await fetch(base + '/casting/' + slug);
    assert.equal(res.status, 200, slug);
    const html = await res.text();
    assert.match(html, /class="button small" href="#apply"/);
    assert.match(html, /type="submit" disabled/);
    titles.add(html.match(/<title>(.*?)<\/title>/)[1]);
    assert.match(html, new RegExp('rel="canonical" href="https://creators\\.example/casting/' + slug + '"'));
    if (res.headers.get('x-robots-tag')) {
      withheld++;
      assert.match(html, /content="noindex,follow"/);
    } else {
      indexed++;
      assert.match(html, /Official planning resources/);
    }
  }
  assert.equal(titles.size, 50);
  assert.equal(indexed, 6);
  assert.equal(withheld, 44);
  assert.equal((await fetch(base + '/casting/atlantis')).status, 404);
  assert.equal((await fetch(base + '/casting/constructor')).status, 404);
});

test('journal articles are full HTML with visible metadata matching BlogPosting', async () => {
  const res = await fetch(base + '/blog');
  assert.equal(res.status, 200);
  const html = await res.text();
  const slugs = [...new Set([...html.matchAll(/href="\/blog\/([a-z0-9-]+)"/g)].map(m => m[1]))];
  assert.equal(slugs.length, 8);
  for (const slug of slugs) {
    const page = await fetch(base + '/blog/' + slug + '?utm_source=test');
    assert.equal(page.status, 200, slug);
    const body = await page.text();
    const schemas = JSON.parse(body.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1]);
    const article = schemas.find(s => s['@type'] === 'BlogPosting');
    assert.equal(article.url, 'https://creators.example/blog/' + slug);
    assert.equal(article.author.name, 'x3STAR Editorial');
    assert.ok(body.includes('<time datetime="' + article.datePublished + '">'));
    assert.ok(body.replace(/<[^>]*>/g, ' ').split(/\s+/).length > 400, slug);
    assert.doesNotMatch(body, /JobPosting|<iframe|\/assets\/game\.js/);
    assert.ok(schemas.some(s => s['@type'] === 'BreadcrumbList'));
  }
  assert.equal((await fetch(base + '/blog/not-a-real-article')).status, 404);
  assert.equal((await fetch(base + '/blog/__proto__')).status, 404);
});

test('sitemap lists canonical indexable pages with maintained content dates', async () => {
  const response = await fetch(base + '/sitemap.xml', { headers: { host: 'untrusted.example' } });
  assert.equal(response.status, 200);
  const xml = await response.text();
  assert.equal((xml.match(/<loc>/g) || []).length, 18);
  assert.match(xml, /<loc>https:\/\/creators\.example\/casting\/colorado<\/loc><lastmod>2026-11-27<\/lastmod>/);
  assert.doesNotMatch(xml, /casting\/alabama|untrusted\.example|utm_|\/go\//);
  const robots = await (await fetch(base + '/robots.txt')).text();
  assert.match(robots, /Sitemap: https:\/\/creators\.example\/sitemap.xml/);
  assert.doesNotMatch(robots, /Disallow: \/casting/);
});

test('duplicate trailing slashes redirect permanently and preserve attribution', async () => {
  for (const url of ['/casting/', '/casting/colorado/', '/blog/', '/blog/creator-application-checklist/']) {
    const response = await fetch(base + url + '?utm_source=search', { redirect: 'manual' });
    assert.equal(response.status, 301, url);
    assert.equal(response.headers.get('location'), url.slice(0, -1) + '?utm_source=search');
  }
});

test('paused partners disappear from the funnel and outbound links keep attribution', async () => {
  const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@x3star.local', password: 'editorial-test-only-123' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const before = await (await fetch(base + '/casting/colorado?utm_campaign=creator_launch')).text();
  assert.match(before, /rel="sponsored noopener"/);
  assert.match(before, /s=casting_colorado&amp;c=creator_launch/);
  const redirect = await fetch(base + '/go/p/apply_broadcaster?s=casting_colorado&c=creator_launch', { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  const dest = new URL(redirect.headers.get('location'));
  assert.equal(dest.hostname, 'chaturbate.com');
  assert.equal(dest.searchParams.get('track'), 'casting_colorado-creator_launch_apply_br');
  const traffic = await (await fetch(base + '/api/admin/traffic', { headers: { cookie } })).json();
  assert.equal(traffic.total, 1);
  assert.equal(traffic.byCampaign[0].source, 'casting_colorado');
  const pause = await fetch(base + '/api/admin/affiliates/CB', { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'paused' }) });
  assert.equal(pause.status, 200);
  const after = await (await fetch(base + '/casting/colorado')).text();
  assert.doesNotMatch(after, /data-partner|\/go\/p\/apply_broadcaster/);
});
