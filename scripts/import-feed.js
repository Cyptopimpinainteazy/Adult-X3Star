'use strict';
/* Import a BongaCams video export file: npm run import:feed -- path/to/feed.txt */
const fs = require('node:fs');
const path = require('node:path');
const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error('Usage: npm run import:feed -- <feed.txt>'); process.exit(1); }
const F = require('../server/feeds');
const { videos, skipped } = F.parseBongaFeed(fs.readFileSync(file, 'utf8'));
const r = F.importVideos(videos, path.basename(file));
console.log(`${r.added} added, ${r.updated} updated, ${skipped.length} skipped`);
skipped.forEach(s => console.log(`  skipped ${s.id}: ${s.reason}`));
require('../server/db').db.close();
