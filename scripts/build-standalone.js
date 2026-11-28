'use strict';
/*
 * Builds dist/x3star-standalone.html — the fan app as ONE self-contained file
 * (CSS, JS, economy engine and the placeholder video inlined). It runs without
 * the server in local mode: economy state lives in localStorage, chat/PK traffic
 * is simulated. Use it for static previews and design review.
 */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let html = read('public/index.html');
const inlineScript = (src, file) => { const code = read(file).replace(/<\/script/gi, '<\\/script'); html = html.replace(`<script src="${src}"></script>`, () => `<script>\n${code}\n</script>`); };
html = html.replace('<link rel="stylesheet" href="assets/game.css">', () => `<style>\n${read('public/assets/game.css')}\n</style>`);
html = html.replace('<link rel="stylesheet" href="assets/jobs.css">', () => `<style>\n${read('public/assets/jobs.css')}\n</style>`);
inlineScript('shared/partners.js', 'shared/partners.js');
inlineScript('shared/economy.js', 'shared/economy.js');
inlineScript('assets/api.js', 'public/assets/api.js');
inlineScript('assets/jobs.js', 'public/assets/jobs.js');
inlineScript('assets/game.js', 'public/assets/game.js');
const video = fs.readFileSync(path.join(root, 'public/media/loop.mp4')).toString('base64');
html = html.replace('<!--X3STAR_BOOT-->', () => `<script>window.X3STAR_LOOP_SRC = 'data:video/mp4;base64,${video}';</script>`);
for (const ref of ['assets/game.css', 'assets/jobs.css', 'assets/jobs.js', 'shared/partners.js', 'shared/economy.js', 'assets/api.js', 'assets/game.js']) if (html.includes(`"${ref}"`)) throw new Error('Failed to inline ' + ref);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist/x3star-standalone.html');
fs.writeFileSync(out, html);
console.log(`Wrote ${path.relative(root, out)} (${Math.round(html.length / 1024)} KB)`);
