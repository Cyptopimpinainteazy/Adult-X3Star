'use strict';
/* BongaCams video export parser. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'x3s-feed-'));
const { parseBongaFeed } = require('../server/feeds');

const thumbs = (id) => Array.from({ length: 10 }, (_, i) => `https://v.bngprm.com/mv/0e1/101/307/v${id}/abc_image_${i}.jpg`).join(';') + ';';
const link = (perf, id) => `https://bongacams.com/track?c=846478&ps=video_export&csurl=https%3A%2F%2Fbongacams.com%2Ftubechat%2F${perf}%2Fv${id}`;
const rec = (id, perf, body) => `${id}|${thumbs(id)}|${link(perf, id)}|${body}|`;

test('parses single- and multi-line records, cleans titles, drops truncated last tags', () => {
  const text = [
    rec('3079930', 'Manuela420sexy', 'sexy'),
    rec('3078586', 'wild41', '49. Teaser. Title one\nFull video includes\nBlowjob\nBlonde\nEye Contact\nBlon'),
    rec('3078591', 'wild41', '50.Teaser.Title two\nFull video inlcudes\nBlonde\nPOV\nBlowjob'),
    rec('3078382', 'VelvetNightX', '19-05-26-11-17')
  ].join('\n');
  const { videos, skipped } = parseBongaFeed(text);
  assert.equal(skipped.length, 0);
  assert.equal(videos.length, 4);
  assert.deepEqual(videos[0], { id: 'BC3079930', site: 'BC', performer: 'Manuela420sexy', title: 'sexy', thumbs: thumbs('3079930').split(';').filter(Boolean), url: link('Manuela420sexy', '3079930'), tags: [] });
  assert.equal(videos[1].title, 'Title one');
  assert.deepEqual(videos[1].tags, ['Blowjob', 'Blonde', 'Eye Contact']);       // "Blon" was cut off by the feed
  assert.equal(videos[2].title, 'Title two');
  assert.deepEqual(videos[2].tags, ['Blonde', 'POV', 'Blowjob']);               // "Blowjob" appears complete elsewhere → kept
  assert.equal(videos[3].title, 'VelvetNightX — new clip');
});

test('blocks titles or tags implying minors or non-consent', () => {
  for (const t of ['Naughty Schoolgirl rides', 'Teen fun', 'Step-sister surprise', 'Forced', 'She was asleep']) {
    const { videos, skipped } = parseBongaFeed(rec('3000001', 'x', t));
    assert.equal(videos.length, 0, t); assert.match(skipped[0].reason, /blocked/);
  }
  const tagged = parseBongaFeed(rec('3000002', 'x', 'Fine title\nFull video includes\nBlonde\nSchool girl\nPOV'));
  assert.equal(tagged.videos.length, 0);
});

test('rejects foreign links and thumbnails', () => {
  assert.match(parseBongaFeed(`3000003|${thumbs('3000003')}|https://evil.example/track?c=1|t|`).skipped[0].reason, /tracking link/);
  assert.match(parseBongaFeed(`3000004|https://evil.example/a.jpg;|${link('x', '3000004')}|t|`).skipped[0].reason, /thumbnail/);
});

test('the bundled feed file imports cleanly', () => {
  const { videos, skipped } = parseBongaFeed(fs.readFileSync(path.join(__dirname, '..', 'seed', 'partner-feeds', 'bongacams-videos.txt'), 'utf8'));
  assert.equal(videos.length + skipped.length, 100);
  assert.ok(videos.length >= 95);
  assert.ok(videos.every(v => v.url.startsWith('https://bongacams.com/track?c=846478') && v.thumbs.length === 10 && v.performer));
});
