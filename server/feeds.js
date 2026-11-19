'use strict';
/*
 * Partner video feeds.
 *
 * BongaCams "video export" format (one record per clip, fields separated by "|"):
 *   <id>|<thumb1>;<thumb2>;…;|<affiliate tracking URL>|<title, optionally followed by lines:
 *   "Full video includes" + one tag per line — the feed cuts long descriptions mid-word>|
 * A record can span several lines; a new record starts on a line beginning with "<digits>|".
 */
const { all, get, run, tx, J } = require('./db');

/* Titles that imply a minor or non-consent are never imported, whatever the source says. */
const BLOCK_RE = /\b(school\s*-?\s*girls?|school\s*-?\s*boys?|teen(s|age|ager|agers)?|under\s*-?\s*age(d)?|minors?|child(ren)?|kids?|young\s+girls?|little\s+girls?|loli(ta)?|jail\s*bait|pre\s*-?\s*teens?|barely\s+legal|incest|step\s*-?\s*(daughter|sister|son|brother)|rape[ds]?|raping|forced|non\s*-?\s*consent(ual)?|drugged|unconscious|passed\s+out|asleep|sleeping)\b/i;
const THUMB_RE = /^https:\/\/v\.bngprm\.com\/[A-Za-z0-9/_.-]+\.jpg$/;
const TRACK_RE = /^https:\/\/bongacams\.com\/track\?[A-Za-z0-9=&%._~-]+$/;
const START_RE = /^\d{5,12}\|/;

function cleanTitle(raw, performer) {
  let t = String(raw || '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^\d+\s*\.\s*teas(er|e)\s*\.\s*/i, '');                 // "49. Teaser. …" → "…"
  if (!t || /^[\d\s:._-]+$/.test(t) || !/[A-Za-zÀ-ɏ]{2,}/.test(t)) t = `${performer} — new clip`;
  return t.slice(0, 160);
}

/**
 * Parse a BongaCams video export. Returns { videos, skipped } where skipped = [{ id, reason }].
 * Each video: { id, site, performer, title, tags[], thumbs[], url }.
 */
function parseBongaFeed(text) {
  const records = [];
  for (const line of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    if (START_RE.test(line)) records.push(line);
    else if (records.length && line.trim()) records[records.length - 1] += '\n' + line;
  }
  const parsed = [], skipped = [];
  for (const rec of records) {
    const parts = rec.split('|');
    const id = parts[0].trim();
    const thumbs = (parts[1] || '').split(';').map(s => s.trim()).filter(Boolean);
    const url = (parts[2] || '').trim();
    const body = parts.slice(3).join('|').replace(/\|\s*$/, '');
    if (!thumbs.length || !thumbs.every(t => THUMB_RE.test(t))) { skipped.push({ id, reason: 'bad thumbnail URLs' }); continue; }
    if (!TRACK_RE.test(url)) { skipped.push({ id, reason: 'tracking link is not a bongacams.com/track URL' }); continue; }
    let performer = '';
    try { const cs = new URL(url).searchParams.get('csurl') || ''; const m = new URL(cs).pathname.match(/^\/(?:tubechat\/)?([A-Za-z0-9_.-]{1,60})\//); performer = m ? m[1] : ''; } catch {}
    if (!performer) { skipped.push({ id, reason: 'no performer in tracking link' }); continue; }
    const lines = body.split('\n').map(s => s.trim()).filter(Boolean);
    const incl = lines.findIndex(l => /^full video in(cl|lc)udes$/i.test(l));
    const titleRaw = incl === -1 ? lines.join(' ') : lines.slice(0, incl).join(' ');
    const tagsRaw = incl === -1 ? [] : lines.slice(incl + 1);
    if (BLOCK_RE.test(titleRaw) || tagsRaw.some(t => BLOCK_RE.test(t))) { skipped.push({ id, reason: 'blocked words in title or tags' }); continue; }
    parsed.push({ id: 'BC' + id, site: 'BC', performer, title: cleanTitle(titleRaw, performer), tagsRaw, thumbs: thumbs.slice(0, 10), url });
  }
  // The feed truncates descriptions, so the last tag may be cut ("Blon", "Deepthr"). Keep it only if the
  // same tag appears complete somewhere else in the feed.
  const vocab = new Map();
  for (const v of parsed) v.tagsRaw.slice(0, -1).forEach(t => vocab.set(t.toLowerCase(), (vocab.get(t.toLowerCase()) || 0) + 1));
  const videos = parsed.map(({ tagsRaw, ...v }) => {
    const tags = tagsRaw.filter((t, i) => i < tagsRaw.length - 1 || vocab.has(t.toLowerCase()))
      .map(t => t.replace(/\s+/g, ' ').slice(0, 40)).filter(t => t.length > 1);
    return { ...v, tags: [...new Map(tags.map(t => [t.toLowerCase(), t])).values()].slice(0, 16) };
  });
  return { videos, skipped };
}

/** Insert or update videos. Admin hide flags are preserved. Returns counts. */
function importVideos(videos, source) {
  const now = Date.now();
  let added = 0, updated = 0;
  tx(() => {
    for (const v of videos) {
      const ex = get('SELECT id FROM partner_videos WHERE id = ?', v.id);
      if (ex) { run('UPDATE partner_videos SET performer=?, title=?, tags=?, thumbs=?, url=?, source=?, updated_at=? WHERE id=?', v.performer, v.title, JSON.stringify(v.tags), JSON.stringify(v.thumbs), v.url, source, now, v.id); updated++; }
      else { run('INSERT INTO partner_videos (id, site, performer, title, tags, thumbs, url, source, hidden, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,0,?,?)', v.id, v.site, v.performer, v.title, JSON.stringify(v.tags), JSON.stringify(v.thumbs), v.url, source, now, now); added++; }
    }
  });
  return { added, updated };
}

function publicVideo(r) {
  return { id: r.id, site: r.site, performer: r.performer, title: r.title, tags: J(r.tags, []), thumbs: J(r.thumbs, []), href: `/go/v/${r.id}` };
}

/** Import every *.txt in dir when the table is empty (first boot). */
function importDirIfEmpty(dir) {
  const fs = require('node:fs'), path = require('node:path');
  if (!fs.existsSync(dir) || (get('SELECT COUNT(*) AS n FROM partner_videos') || {}).n) return null;
  const out = { added: 0, updated: 0, skipped: 0 };
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.txt')).sort()) {
    const { videos, skipped } = parseBongaFeed(fs.readFileSync(path.join(dir, f), 'utf8'));
    const r = importVideos(videos, f);
    out.added += r.added; out.updated += r.updated; out.skipped += skipped.length;
  }
  return out;
}

module.exports = { parseBongaFeed, importVideos, publicVideo, importDirIfEmpty, BLOCK_RE };
