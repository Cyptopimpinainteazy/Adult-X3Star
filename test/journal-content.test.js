'use strict';
/* Structural/content checks supplement full editorial review; counts alone are not quality proof. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { ARTICLES, NEW_ARTICLES, getArticle } = require('../server/content/articles');
const words = article => article.sections.flatMap(section => [...section.paragraphs, ...(section.list || [])]).join(' ').trim().split(/\s+/).filter(Boolean);

test('industry collection adds exactly fifty complete posts while retaining the eight original guides', () => {
  assert.equal(NEW_ARTICLES.length, 50);
  assert.equal(ARTICLES.length, 58);
  assert.equal(new Set(ARTICLES.map(a => a.slug)).size, 58);
  assert.equal(new Set(ARTICLES.map(a => a.title)).size, 58);
  const coverage = { creators: 0, affiliates: 0, hiring: 0 };
  for (const article of NEW_ARTICLES) {
    assert.equal(article.collection, 'industry-50');
    assert.ok(Object.hasOwn(coverage, article.audience), article.slug);
    coverage[article.audience]++;
    assert.match(article.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(article.description.length >= 80 && article.description.length <= 220, article.slug + ' description');
    assert.ok(article.sections.length >= 4, article.slug + ' developed sections');
    for (const section of article.sections) {
      assert.ok(section.heading && section.paragraphs.length >= 1 && section.paragraphs.length + (section.list || []).length >= 2, article.slug + ' section content');
      for (const paragraph of section.paragraphs) assert.ok(typeof paragraph === 'string' && paragraph.trim().length > 40);
      for (const item of section.list || []) assert.ok(typeof item === 'string' && item.trim().length > 10);
    }
    const count = words(article).length;
    assert.ok(count >= 600, article.slug + ': ' + count + ' body words');
    assert.equal(article.minutes, Math.ceil(count / 220), article.slug + ' reading time');
    assert.equal(article.author, 'x3STAR Editorial');
    assert.equal(article.published, '2026-11-27');
    assert.equal(article.updated, '2026-11-27');
    assert.doesNotMatch(words(article).join(' '), /\blorem ipsum\b|\bTODO\b|\bTBD\b/);
  }
  assert.deepEqual(coverage, { creators: 18, affiliates: 16, hiring: 16 });
  for (const slug of ['creator-application-checklist', 'x3star-or-partner-application', 'protect-your-creator-identity', 'starter-streaming-equipment', 'first-month-creator-budget', 'test-your-streaming-schedule', 'secure-your-creator-accounts', 'first-stream-rehearsal']) {
    assert.ok(getArticle(slug));
    assert.notEqual(getArticle(slug).collection, 'industry-50');
  }
});

test('every article has valid related reading and no copied body paragraphs across the new collection', () => {
  const seen = new Map();
  for (const article of ARTICLES) {
    assert.ok(article.related.length >= 2, article.slug);
    assert.equal(new Set(article.related).size, article.related.length);
    for (const slug of article.related) {
      assert.notEqual(slug, article.slug);
      assert.ok(getArticle(slug), article.slug + ' points to missing ' + slug);
    }
    for (const source of article.sources || []) {
      const url = new URL(source.url);
      assert.equal(url.protocol, 'https:');
      assert.equal(url.username + url.password, '');
      assert.ok(source.title.length > 5);
    }
    if (article.collection !== 'industry-50') continue;
    for (const section of article.sections) for (const paragraph of section.paragraphs) {
      const normalized = paragraph.toLowerCase().replace(/\s+/g, ' ').trim();
      assert.ok(!seen.has(normalized), article.slug + ' repeats a full paragraph from ' + seen.get(normalized));
      seen.set(normalized, article.slug);
    }
  }
});
