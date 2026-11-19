'use strict';
/*
 * Seeds an empty database.
 *  • Admin account from ADMIN_EMAIL / ADMIN_PASSWORD (a password is generated and printed if not set).
 *  • With SEED_DEMO=1: 16 demo creators, demo fans with 14 days of gift history, families, an agent,
 *    and store products. Every demo row is flagged demo=1 so it can be filtered or removed.
 * Run directly with `npm run seed`, or automatically on first server start.
 */
const crypto = require('node:crypto');
const cfg = require('./config');
const { get, run, tx } = require('./db');
const A = require('./auth');
const S = require('./services');

const LIVE = [
  ['luna', 'Luna Vex', 'LUNA', 'BigBoobs', ['Natural', 'Lovense', 'Chatty'], 3120, 0.0421, ['#ff2d87', '#7a2cff'], 0, ['CB', 'SC', 'X3'], 'Late-night host with a soft voice and a wicked laugh. Tip-controlled toy on all night; goals unlock the good playlist.'],
  ['raven', 'Raven Noir', 'RAVN', 'Goth/Emo/Punk', ['Alt', 'Tattoos', 'ASMR'], 2480, 0.0386, ['#c41dff', '#1a0730'], 40, ['SC', 'C4', 'X3'], 'Black lipstick, black candles, black humor. Whisper streams on Sundays, chaos the rest of the week.'],
  ['sable', 'Mistress Sable', 'SABL', 'Femdom', ['Leather', 'Discipline', 'Tasks'], 1960, 0.0912, ['#ff1f4b', '#2a0010'], -30, ['CB', 'BC', 'X3'], 'You will address her properly. Task boards, tribute goals and a waitlist for private sessions.'],
  ['cherry', 'Cherry Bomb', 'CHRY', 'Goth/Emo/Punk', ['Punk', 'Piercings', 'Dance'], 1740, 0.0247, ['#ff4fa3', '#3d0b2a'], 15, ['CB', 'X3'], 'Riot-grrrl energy, safety pins and a subwoofer. Dance goals every 500 tokens.'],
  ['velvet', 'Velvet Kai', 'VLVT', 'BigBoobs', ['Curvy', 'Lingerie', 'Try-on'], 2210, 0.0558, ['#ff6aa8', '#5b0a3a'], 10, ['SC', 'BC', 'X3'], 'Lingerie try-on hauls you help pick. Everything she wears is in her store by morning.'],
  ['nyx', 'Nyx Hollow', 'NYX', 'Goth/Emo/Punk', ['Emo', 'Cosplay', 'Night owl'], 980, 0.0163, ['#9a4dff', '#0e0620'], 60, ['C4', 'X3'], 'Cosplay drops, eyeliner tutorials and 4 a.m. confessions. New coin, early holders get shout-outs.'],
  ['scarlett', 'Scarlett Rae', 'SCAR', 'Femdom', ['Heels', 'Findom', 'Roleplay'], 1430, 0.1240, ['#ff2d55', '#200008'], -40, ['CB', 'SC', 'X3'], 'Expensive taste, zero patience. Tribute leaderboard resets at midnight.'],
  ['jade', 'Jade Ember', 'JADE', 'BigBoobs', ['Redhead', 'Yoga', 'Toys'], 2650, 0.0474, ['#ff5a3c', '#3a0a14'], -20, ['CB', 'SC', 'BC', 'X3'], 'Morning yoga, evening shows. Fire-red hair and the most generous goal board on the floor.']
];
const OFFLINE = [
  ['mila', 'Mila Frost', 'MILA', 'BigBoobs', ['Blonde', 'Lingerie', 'Chatty'], ['#ff8ac0', '#1a0812'], '9:00 PM'],
  ['ash', 'Ash Vesper', 'ASHV', 'Goth/Emo/Punk', ['Alt', 'Tattoos', 'Gamer'], ['#a14dff', '#0a0414'], '10:30 PM'],
  ['regina', 'Regina Lux', 'RGNA', 'Femdom', ['Latex', 'Findom', 'Tasks'], ['#ff2d55', '#140006'], 'Tomorrow 8 PM'],
  ['kiko', 'Kiko Hex', 'KIKO', 'Goth/Emo/Punk', ['Emo', 'Cosplay', 'ASMR'], ['#d65cff', '#12051c'], '11:00 PM'],
  ['bella', 'Bella Noire', 'BELA', 'BigBoobs', ['Curvy', 'Lovense', 'Try-on'], ['#ff5c8a', '#1d0510'], 'Tomorrow 2 PM'],
  ['vera', 'Vera Strix', 'VERA', 'Femdom', ['Heels', 'Discipline', 'Roleplay'], ['#ff3b3b', '#160404'], 'Sat 9 PM'],
  ['sky', 'Sky Rivera', 'SKY', 'BigBoobs', ['Dance', 'Lovense', 'Natural'], ['#ff6a3c', '#1a0a04'], '12:00 AM'],
  ['onyx', 'Onyx Rae', 'ONYX', 'Goth/Emo/Punk', ['Punk', 'Piercings', 'Night owl'], ['#7a5cff', '#06041a'], 'Sun 10 PM']
];
const FANS = ['nightowl_88', 'velvetdrip', 'k1ngpin', 'midnightrider', 'shadowtip', 'blk_card', 'neonwolf', 'quietwhale', 'dr.feelgood', 'satoshi_simp', 'heelsandhex', 'lowkey_lex', 'vanta', 'cashmere_cole', 'm0nolith', 'sugarvault', 'ghostfacepay', 'hexrider', 'obsidian_ox', 'redline_rx', 'gold_tooth', 'ivory_tower', 'nocturne', 'cobalt_kid'];
const TIP_MENU = [{ label: 'Say your name', price: 25 }, { label: 'Song request', price: 66 }, { label: 'Spin the wheel', price: 111 }, { label: 'Dance break', price: 150 }, { label: 'Outfit change', price: 250 }, { label: 'Pin your message', price: 500 }];
const GOALS = { luna: 'Lights-low ASMR', raven: 'Candle-lit whisper set', sable: 'Task wheel marathon', cherry: 'Mosh-pit dance set', velvet: 'Lingerie try-on haul', nyx: 'Cosplay drop', scarlett: 'Tribute night', jade: 'Sunrise yoga flow' };

function ensureAdmin() {
  if (get("SELECT 1 FROM users WHERE role = 'admin'")) return null;
  const email = (cfg.ADMIN_EMAIL || 'admin@x3star.local').toLowerCase();
  const password = cfg.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
  const now = Date.now();
  run('INSERT INTO users (email, name, pass_hash, role, econ, ref_code, created_at) VALUES (?,?,?,?,?,?,?)', email, 'admin', A.hashPassword(password), 'admin', JSON.stringify(S.E.newState(S.econConfig(), now)), S.refCode(), now);
  return { email, password: cfg.ADMIN_PASSWORD ? '(from ADMIN_PASSWORD)' : password };
}

function seedDemo() {
  if (get('SELECT 1 FROM creators LIMIT 1')) return null;
  const econ = S.econConfig(), now = Date.now(), DAY = 86400000;
  const password = cfg.DEMO_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const hash = A.hashPassword(password);
  const mkUser = (email, name, role, extra = {}) => {
    const info = run('INSERT INTO users (email, name, pass_hash, role, econ, ref_code, demo, created_at, agent_id) VALUES (?,?,?,?,?,?,1,?,?)', email, name, hash, role, JSON.stringify(S.E.newState(econ, now)), S.refCode(), now - 60 * DAY, extra.agentId || null);
    return Number(info.lastInsertRowid);
  };
  return tx(() => {
    const agentId = mkUser('agent@demo.x3star.local', 'velvet_agency', 'agent');
    const creatorUsers = {};
    LIVE.forEach(([id, name, ticker, niche, tags, viewers, price, hues, vhue, sites, bio], i) => {
      const uid = mkUser(`${id}@demo.x3star.local`, id + '_x3', 'creator', { agentId: i % 3 === 0 ? agentId : null });
      creatorUsers[id] = uid;
      run(`INSERT INTO creators (id, user_id, name, ticker, niche, tags, bio, sites, hues, vhue, price, status, kyc, live, featured, base_viewers, tip_menu, goal, demo, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,'approved','verified',1,?,?,?,?,1,?)`,
        id, uid, name, ticker, niche, JSON.stringify(tags), bio, JSON.stringify(sites), JSON.stringify(hues), vhue, price, i < 2 ? 1 : 0, viewers, JSON.stringify(TIP_MENU), JSON.stringify({ label: GOALS[id], target: 2500 }), now - (3 + i * 3) * 30 * DAY);
      run('UPDATE creators SET handles = ? WHERE id = ?', JSON.stringify(Object.fromEntries(sites.filter(s => s !== 'X3').map(s => [s, id + '_x3']))), id);
    });
    OFFLINE.forEach(([id, name, ticker, niche, tags, hues, back]) => {
      const uid = mkUser(`${id}@demo.x3star.local`, id + '_x3', 'creator');
      run(`INSERT INTO creators (id, user_id, name, ticker, niche, tags, bio, sites, hues, price, status, kyc, live, base_viewers, tip_menu, back_at, demo, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,'approved','verified',0,?,?,?,1,?)`,
        id, uid, name, ticker, niche, JSON.stringify(tags), `${name} is off air — back ${back}.`, '["X3"]', JSON.stringify(hues), 0.02, 400, JSON.stringify(TIP_MENU), back, now - 90 * DAY);
    });
    // products
    const all8 = LIVE.map(x => x[0]);
    all8.forEach(id => {
      const first = LIVE.find(x => x[0] === id)[1].replace('Mistress ', '').split(' ')[0];
      [['Lovense Lush 3', 'Toy', 139, `Pairs with ${first}'s room — your tips drive it live.`, 'Lovense'],
       [`${first}'s Pick — Lace Bodysuit`, 'Lingerie', 68, 'The exact set from her last try-on stream. XS–3X.', 'Lingerie partner'],
       [`${first} × x3STAR Hoodie`, 'Merch', 85, 'Heavyweight black, tonal embroidery. Ships unbranded.', 'Print on demand'],
       ['Signed Polaroid Set', 'Custom', 45, '3 signed instant prints with a handwritten note.', 'Ships from creator']]
        .forEach(([n, k, p, note, partner]) => run('INSERT INTO products (creator_id, name, kind, price, note, partner, created_at) VALUES (?,?,?,?,?,?,?)', id, n, k, p, note, partner, now));
    });
    // families
    const famIds = [];
    [['Velvet Syndicate', 'VLV', 'Gift loud, stay classy'], ['Night Shift', 'NITE', 'We never sleep'], ['Black Card Club', 'BCC', 'Whales only']].forEach(([name, tag, motto], i) => {
      const owner = mkUser(`${FANS[i]}@demo.x3star.local`, FANS[i], 'fan');
      const info = run('INSERT INTO families (name, tag, motto, owner_id, created_at) VALUES (?,?,?,?,?)', name, tag, motto, owner, now - 40 * DAY);
      famIds.push(Number(info.lastInsertRowid)); run('UPDATE users SET family_id = ? WHERE id = ?', famIds[i], owner);
    });
    // fans + 14 days of gift history
    const fanIds = [];
    FANS.forEach((name, i) => {
      let id = get('SELECT id FROM users WHERE name = ?', name);
      id = id ? id.id : mkUser(`${name}@demo.x3star.local`, name, 'fan');
      if (i >= 3 && i % 2 === 0) run('UPDATE users SET family_id = ? WHERE id = ?', famIds[i % 3], id);
      fanIds.push(id);
    });
    const r = (seed => () => (seed = (seed * 9301 + 49297) % 233280) / 233280)(42);
    const gifts = econ.gifts.filter(g => !g.vip);
    for (let n = 0; n < 900; n++) {
      const fi = Math.floor(Math.pow(r(), 1.8) * fanIds.length), fan = fanIds[fi];
      const cid = all8[Math.floor(r() * all8.length)];
      const g = r() < 0.9 ? gifts[Math.floor(Math.pow(r(), 2.2) * 8)] : gifts[Math.floor(r() * gifts.length)];
      const qty = g.price < 50 ? [1, 1, 5, 10, 66][Math.floor(r() * 5)] : 1, d = g.price * qty;
      const fam = get('SELECT family_id FROM users WHERE id = ?', fan).family_id;
      const ts = now - Math.floor(Math.pow(r(), 1.3) * 14 * DAY);
      const info = run('INSERT INTO gifts (from_user, creator_id, gift_id, qty, diamonds, beans, family_id, family_points, created_at) VALUES (?,?,?,?,?,?,?,?,?)', fan, cid, g.id, qty, d, d, fam, fam ? d : 0, ts);
      run('UPDATE creators SET beans = beans + ?, beans_total = beans_total + ? WHERE id = ?', d, d, cid);
      if (fam) run('UPDATE families SET xp = xp + ? WHERE id = ?', d, fam);
      const owner = get('SELECT u.agent_id FROM creators c JOIN users u ON u.id = c.user_id WHERE c.id = ?', cid);
      if (owner && owner.agent_id) run('INSERT INTO agent_earnings (agent_id, creator_id, beans, gift_row, created_at) VALUES (?,?,?,?,?)', owner.agent_id, cid, S.E.agencyCommission(d, econ), Number(info.lastInsertRowid), ts);
    }
    for (let d = 0; d < 14; d++) for (let k = 0; k < 2 + Math.floor(r() * 4); k++) {
      const pack = econ.diamondPacks[Math.floor(Math.pow(r(), 1.5) * econ.diamondPacks.length)], ts = now - d * DAY - Math.floor(r() * DAY);
      run("INSERT INTO orders (id, user_id, pack_id, usd, diamonds, provider, status, test, created_at, paid_at) VALUES (?,?,?,?,?,'test','paid',1,?,?)", 'ord_demo_' + d + '_' + k, fanIds[Math.floor(r() * fanIds.length)], pack.id, pack.usd, pack.diamonds + pack.bonus, ts, ts);
    }
    const fanUser = mkUser('fan@demo.x3star.local', 'demo_fan', 'fan');
    S.withEcon(fanUser, 'admin_grant', (s) => { s.diamonds += 5000; return { reason: 'demo starter balance' }; });
    run("INSERT INTO applications (kind, email, data, created_at) VALUES ('creator', 'newface@example.com', ?, ?)", JSON.stringify({ stage: 'Rosa Night', niche: 'BigBoobs', hours: 25, sites: ['CB', 'SC'], note: 'Moving over from two other sites, ~400 regulars.' }), now - 3600000);
    run("INSERT INTO reports (reporter_id, target_type, target_id, reason, created_at) VALUES (?, 'message', 'demo-msg', 'Spam links in chat', ?)", fanIds[2], now - 7200000);
    return { password, fan: 'fan@demo.x3star.local', creator: 'luna@demo.x3star.local', agent: 'agent@demo.x3star.local' };
  });
}

function seed({ quiet } = {}) {
  const admin = ensureAdmin();
  const demo = cfg.SEED_DEMO ? seedDemo() : null;
  if (!quiet && (admin || demo)) {
    console.log('\n──────────── x3STAR first-run accounts ────────────');
    if (admin) console.log(`  Admin   ${admin.email}  /  ${admin.password}`);
    if (demo) console.log(`  Demo    ${demo.fan} · ${demo.creator} · ${demo.agent}  /  ${demo.password}`);
    console.log('  These are printed once. Change them after signing in.');
    console.log('────────────────────────────────────────────────────\n');
  }
  return { admin, demo };
}

if (require.main === module) seed();
module.exports = { seed };
