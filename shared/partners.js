/*
 * x3STAR partner links — Chaturbate affiliate tours.
 * Shared by the server (go-link redirects, admin preview) and the browser (standalone/local mode).
 *
 * Tour codes come from the Chaturbate affiliate "Linking Codes" page. They are the same for every
 * affiliate; what identifies YOU is the campaign code (partners.CB.campaign in the economy config).
 * `track` is Chaturbate's sub-ID: it shows up in your Chaturbate stats, so we fill it with the
 * on-site placement (and traffic source) the click came from.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.X3Partners = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CB_BASE = 'https://chaturbate.com/in/';

  /* Every tour: label, extra query params ({room} = target room), fallback when a program lacks it. */
  const TOURS = {
    home:            { label: 'Home page' },
    home_np:         { label: 'Home page (no join popup)', fb: 'home' },
    home_female:     { label: 'Home page: Female', fb: 'top_female' },
    home_female_np:  { label: 'Home page: Female (no join popup)', fb: 'home_female' },
    home_couple:     { label: 'Home page: Couple', fb: 'top_couple' },
    home_couple_np:  { label: 'Home page: Couple (no join popup)', fb: 'home_couple' },
    home_male:       { label: 'Home page: Male', fb: 'top_male' },
    home_male_np:    { label: 'Home page: Male (no join popup)', fb: 'home_male' },
    home_trans:      { label: 'Home page: Trans', fb: 'top_trans' },
    home_trans_np:   { label: 'Home page: Trans (no join popup)', fb: 'home_trans' },
    top:             { label: 'Current top room' },
    top_np:          { label: 'Current top room (no join popup)', fb: 'top' },
    top_female:      { label: 'Current top room: Female', fb: 'top' },
    top_female_np:   { label: 'Current top room: Female (no join popup)', fb: 'top_female' },
    top_couple:      { label: 'Current top room: Couple', fb: 'top' },
    top_couple_np:   { label: 'Current top room: Couple (no join popup)', fb: 'top_couple' },
    top_male:        { label: 'Current top room: Male', fb: 'top' },
    top_male_np:     { label: 'Current top room: Male (no join popup)', fb: 'top_male' },
    top_trans:       { label: 'Current top room: Trans', fb: 'top' },
    top_trans_np:    { label: 'Current top room: Trans (no join popup)', fb: 'top_trans' },
    full:            { label: 'Full video mode', params: { signup_notice: '1' }, fb: 'top' },
    full_female:     { label: 'Full video mode: Female', params: { signup_notice: '1' }, fb: 'full' },
    full_couple:     { label: 'Full video mode: Couple', params: { signup_notice: '1' }, fb: 'full' },
    full_male:       { label: 'Full video mode: Male', params: { signup_notice: '1' }, fb: 'full' },
    full_trans:      { label: 'Full video mode: Trans', params: { signup_notice: '1' }, fb: 'full' },
    full_room:       { label: 'Full video mode: a room', params: { signup_notice: '1', b: '{room}' }, room: true, fb: 'room_home' },
    random_female:   { label: 'Random room: Female', fb: 'top_female' },
    random_couple:   { label: 'Random room: Couple', fb: 'top_couple' },
    random_male:     { label: 'Random room: Male', fb: 'top_male' },
    random_trans:    { label: 'Random room: Trans', fb: 'top_trans' },
    region_na:       { label: 'Region: North American cams', fb: 'home' },
    region_sa:       { label: 'Region: South American cams', fb: 'home' },
    region_euro:     { label: 'Region: Euro / Russian cams', fb: 'home' },
    region_asia:     { label: 'Region: Asian cams', fb: 'home' },
    region_other:    { label: 'Region: Other cams', fb: 'home' },
    join:            { label: 'Join page', params: { redirect_to_room: '-welcomepage-' }, fb: 'home' },
    join_female:     { label: 'Join page → Female cams', params: { next: '/female-cams/' }, fb: 'join' },
    join_couple:     { label: 'Join page → Couple cams', params: { next: '/couple-cams/' }, fb: 'join' },
    join_male:       { label: 'Join page → Male cams', params: { next: '/male-cams/' }, fb: 'join' },
    join_trans:      { label: 'Join page → Trans cams', params: { next: '/trans-cams/' }, fb: 'join' },
    room:            { label: 'A room (even if offline)', params: { room: '{room}' }, room: true, fb: 'room_home' },
    room_home:       { label: 'A room (home page if offline)', params: { room: '{room}' }, room: true, fb: 'home' },
    broadcaster:     { label: 'Broadcaster sign-up form' },
    contest:         { label: 'Contest details', fb: 'home' },
    affiliate:       { label: 'The affiliate program', fb: 'broadcaster' }
  };

  /* Tour codes per Chaturbate program, exactly as listed on the Linking Codes page. */
  const PROGRAMS = {
    revshare: {
      label: 'Revshare',
      terms: '20% of money spent + $50 per broadcaster + 5% referred affiliate income',
      tours: {
        broadcaster: 'NwNd', contest: 'jb4g',
        top: 'hr8m', top_np: 'VKKA', top_couple: '43Qk', top_couple_np: 'yDHd', top_female: 'uhEc', top_female_np: '6hnx',
        top_male: 'EyCi', top_male_np: 'm58x', top_trans: '2MTk', top_trans_np: 'w217',
        full: 'dU9X', full_couple: 'GORs', full_female: 'gLDS', full_male: '4xFT', full_trans: '4auy', full_room: 'Limj',
        home: 'grq0', home_np: 'IGtl', home_couple: '0G9g', home_couple_np: 'DqyZ', home_female: 'IsSO', home_female_np: 'EuIR',
        home_male: 'R2Xc', home_male_np: 'YKzf', home_trans: 'khMd', home_trans_np: 'vj0T',
        join: '3Mc9', join_couple: 'JpRc', join_female: 'JpRf', join_male: 'JpRm', join_trans: 'JpRt',
        random_couple: 'goZq', random_female: '41Ea', random_male: '9rL0', random_trans: 'sxJR',
        region_asia: 'AZcr', region_euro: 'ERcr', region_na: 'NAcr', region_other: 'ORcr', region_sa: 'SAcr',
        affiliate: '07kX', room: 'dT8X', room_home: 'LQps'
      }
    },
    pps: {
      label: 'Pay per sign-up',
      terms: '$1.00 per registration + $50.00 per broadcaster + 5% referred affiliate income',
      tours: {
        broadcaster: '5zjT', contest: 'PFml',
        top: 'ZmU7', top_np: 'tdBw', top_couple: 'ypQj', top_couple_np: 'bCMX', top_female: 'OgA6', top_female_np: 'YSRU',
        top_male: 'OCGj', top_male_np: 'uxJr', top_trans: 'pn6o', top_trans_np: '9bn1',
        full: 'dM8p', full_couple: '7Xqm', full_female: 'eQof', full_male: 'jC8b', full_trans: 'NPcg', full_room: 'hdfU',
        home: 'g4pe', home_np: 'IGtJ', home_couple: 'ZLaY', home_couple_np: '3u46', home_female: 'wFE6', home_female_np: '0fQq',
        home_male: 'EyB0', home_male_np: 'SVAj', home_trans: 'xC0v', home_trans_np: 'Vgtp',
        random_couple: 'gT8O', random_female: 'bfpW', random_male: 'RDvD', random_trans: 'z7da',
        region_asia: 'AZcp', region_euro: 'ERcp', region_na: 'NAcp', region_other: 'ORcp', region_sa: 'SAcp',
        affiliate: '9O7D', room: 'ZQAI', room_home: 'yiMH'
      }
    },
    tokens: {
      label: 'Tokens',
      terms: '10 tokens per registration + 500 tokens per broadcaster',
      tours: {
        broadcaster: '5bpG',
        top: 'OT2s', top_couple: 'w6Ri', top_female: 'HuFr', top_male: 'S7yg', top_trans: 'SoLH',
        full: 'dEyE', full_couple: 'g8XR', full_female: 'J2in', full_male: 'PIlC', full_trans: 'z5Dr', full_room: '7Rae',
        home: '4uT2',
        region_asia: 'AZct', region_euro: 'ERct', region_na: 'NAct', region_other: 'ORct', region_sa: 'SAct',
        room: 'O1Tt', room_home: '7Bge'
      }
    }
  };

  /* Default on-site placements. `slot` says where the fan app renders it. */
  const DEFAULT_PLACEMENTS = {
    footer_female:     { slot: 'footer', tour: 'home_female', label: 'Female cams', on: true },
    footer_couple:     { slot: 'footer', tour: 'home_couple', label: 'Couple cams', on: true },
    footer_trans:      { slot: 'footer', tour: 'home_trans', label: 'Trans cams', on: true },
    footer_male:       { slot: 'footer', tour: 'home_male', label: 'Male cams', on: true },
    footer_house:      { slot: 'footer', tour: 'room_home', label: 'Our Chaturbate room', on: true },
    footer_join:       { slot: 'footer', tour: 'join', label: 'Join Chaturbate free', on: true },
    ad_banner:         { slot: 'ad:728x90', tour: 'top_female', label: 'The #1 room on Chaturbate is live now', sub: 'Free to watch · no sign-up needed', on: true },
    ad_tower:          { slot: 'ad:300x600', tour: 'full_female', label: 'Full-screen live cams.', sub: 'Thousands of rooms on Chaturbate', on: true },
    ad_wide:           { slot: 'ad:970x250', tour: 'home_np', label: 'Can’t decide? Thousands more live.', sub: 'Partner · Chaturbate', on: true },
    apply_broadcaster: { slot: 'apply', tour: 'broadcaster', label: 'Broadcast on Chaturbate too', on: true }
  };

  const DEFAULTS = {
    CB: {
      enabled: true,
      program: 'revshare',        // revshare | pps | tokens
      campaign: 'Ji03i',          // your affiliate campaign code
      houseRoom: 'cock_da_hammer',// your own Chaturbate room
      roomTour: 'room_home',      // tour used for creator "Also live on Chaturbate" links
      track: '{source}_{placement}', // Chaturbate sub-ID; placeholders {placement} {source} {creator}
      liveGrid: true              // "Live now on Chaturbate" grid (online-rooms API) on Home / Live / Niches
    },
    placements: DEFAULT_PLACEMENTS
  };

  const ROOM_RE = /^[A-Za-z0-9_]{1,60}$/;
  const CAMPAIGN_RE = /^[A-Za-z0-9]{1,20}$/;
  const cleanTrack = (s) => String(s || '').replace(/[^A-Za-z0-9_-]+/g, '').replace(/^[_-]+|[_-]+$/g, '').slice(0, 40) || 'default';

  /** The tour code a program uses for a tour key, following fallbacks. Returns { key, code } or null. */
  function resolveTour(program, key) {
    const prog = PROGRAMS[program];
    if (!prog) return null;
    const seen = new Set();
    let k = key;
    while (k && TOURS[k] && !seen.has(k)) {
      seen.add(k);
      if (prog.tours[k]) return { key: k, code: prog.tours[k] };
      k = TOURS[k].fb || (k === 'home' ? null : 'home');
    }
    return null;
  }

  /**
   * Build a Chaturbate affiliate URL.
   * cfg: the `partners` config ({ CB, placements }).
   * opts: { tour, room, placement, source, creator }
   * Returns { url, tour, code } or null when it cannot be built (disabled, bad campaign, room tour without a valid room).
   */
  function cbUrl(cfg, opts) {
    const cb = (cfg && cfg.CB) || {};
    if (!cb.enabled || !CAMPAIGN_RE.test(cb.campaign || '')) return null;
    const t = resolveTour(cb.program, opts.tour);
    if (!t) return null;
    const def = TOURS[t.key];
    const room = String(opts.room || '');
    if (def.room && !ROOM_RE.test(room)) return null;
    const track = cleanTrack(String(cb.track || '{placement}')
      .replace(/\{placement\}/g, opts.placement || '')
      .replace(/\{source\}/g, opts.source || 'x3s')
      .replace(/\{creator\}/g, opts.creator || ''));
    const q = [['tour', t.code], ['campaign', cb.campaign], ['track', track]];
    for (const [k, v] of Object.entries(def.params || {})) q.push([k, v.replace('{room}', room)]);
    // Chaturbate's own links leave '/' and '-' unescaped in these values; encodeURIComponent keeps them readable except '/'.
    const qs = q.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%2F/g, '/')}`).join('&');
    return { url: `${CB_BASE}?${qs}`, tour: t.key, code: t.code };
  }

  /** URL for an on-site placement key. */
  function placementUrl(cfg, key, opts) {
    const p = cfg && cfg.placements && cfg.placements[key];
    if (!p || !p.on) return null;
    const def = TOURS[p.tour];
    const room = def && def.room ? (p.room || (cfg.CB || {}).houseRoom) : '';
    return cbUrl(cfg, { tour: p.tour, room, placement: key, source: opts && opts.source, creator: '' });
  }

  /** URL for a creator's own Chaturbate room. */
  function roomUrl(cfg, room, opts) {
    const cb = (cfg && cfg.CB) || {};
    const tour = TOURS[cb.roomTour] && TOURS[cb.roomTour].room ? cb.roomTour : 'room_home';
    return cbUrl(cfg, { tour, room, placement: (opts && opts.placement) || 'room', source: opts && opts.source, creator: opts && opts.creator });
  }

  /** Throws Error(message) when the config is unusable. */
  function validate(cfg) {
    const fail = (m) => { throw Object.assign(new Error(m), { status: 400, code: 'bad_config' }); };
    if (!cfg || typeof cfg !== 'object') fail('partners config missing');
    const cb = cfg.CB || {};
    if (!PROGRAMS[cb.program]) fail(`Chaturbate program must be one of ${Object.keys(PROGRAMS).join(', ')}`);
    if (cb.enabled && !CAMPAIGN_RE.test(cb.campaign || '')) fail('Chaturbate campaign code must be 1–20 letters or digits');
    if (cb.houseRoom && !ROOM_RE.test(cb.houseRoom)) fail('House room must be letters, digits or underscores');
    if (!TOURS[cb.roomTour] || !TOURS[cb.roomTour].room) fail('Creator room tour must be one of: room, room_home, full_room');
    if (typeof cb.track !== 'string' || cb.track.length > 80) fail('Track format must be a short string');
    if (cb.liveGrid !== undefined && typeof cb.liveGrid !== 'boolean') fail('Live grid setting must be true or false');
    for (const [k, p] of Object.entries(cfg.placements || {})) {
      if (!/^[a-z0-9_]{1,40}$/.test(k)) fail(`Placement key "${k}" must be lowercase letters, digits or underscores`);
      if (!p || !TOURS[p.tour]) fail(`Placement ${k}: unknown tour "${p && p.tour}"`);
      if (typeof p.label !== 'string' || !p.label.trim() || p.label.length > 120) fail(`Placement ${k}: label is required (max 120 chars)`);
      if (p.room && !ROOM_RE.test(p.room)) fail(`Placement ${k}: room must be letters, digits or underscores`);
    }
  }

  return { CB_BASE, TOURS, PROGRAMS, DEFAULTS, DEFAULT_PLACEMENTS, resolveTour, cbUrl, placementUrl, roomUrl, validate, cleanTrack };
});
