'use strict';
/* Chaturbate partner link builder: codes, fallbacks, track tags, validation. */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../shared/partners.js');
const cfg = (cb = {}, placements) => ({ CB: { ...P.DEFAULTS.CB, ...cb }, placements: placements || P.DEFAULTS.placements });

test('revshare links match the Chaturbate linking codes exactly', () => {
  const c = cfg();
  assert.equal(P.cbUrl(c, { tour: 'home', placement: '' }).url, 'https://chaturbate.com/in/?tour=grq0&campaign=Ji03i&track=x3s');
  assert.equal(P.cbUrl(c, { tour: 'join_female', placement: 'p' }).url, 'https://chaturbate.com/in/?tour=JpRf&campaign=Ji03i&track=x3s_p&next=/female-cams/');
  assert.equal(P.cbUrl(c, { tour: 'join', placement: 'p' }).url, 'https://chaturbate.com/in/?tour=3Mc9&campaign=Ji03i&track=x3s_p&redirect_to_room=-welcomepage-');
  assert.equal(P.cbUrl(c, { tour: 'full', placement: 'p' }).url, 'https://chaturbate.com/in/?tour=dU9X&campaign=Ji03i&track=x3s_p&signup_notice=1');
  assert.equal(P.cbUrl(c, { tour: 'full_room', room: 'cock_da_hammer', placement: 'p' }).url, 'https://chaturbate.com/in/?tour=Limj&campaign=Ji03i&track=x3s_p&signup_notice=1&b=cock_da_hammer');
  assert.equal(P.placementUrl(c, 'footer_house', {}).url, 'https://chaturbate.com/in/?tour=LQps&campaign=Ji03i&track=x3s_footer_house&room=cock_da_hammer');
});

test('each program uses its own codes and falls back when a link type is missing', () => {
  assert.equal(P.cbUrl(cfg({ program: 'pps' }), { tour: 'broadcaster' }).code, '5zjT');
  assert.equal(P.cbUrl(cfg({ program: 'tokens' }), { tour: 'broadcaster' }).code, '5bpG');
  assert.equal(P.cbUrl(cfg({ program: 'revshare' }), { tour: 'broadcaster' }).code, 'NwNd');
  const tokJoin = P.cbUrl(cfg({ program: 'tokens' }), { tour: 'join_female' });   // tokens has no join pages → home
  assert.deepEqual([tokJoin.tour, tokJoin.code], ['home', '4uT2']);
  assert.ok(!tokJoin.url.includes('next='), 'fallback drops the join-page params');
  const tokHomeF = P.cbUrl(cfg({ program: 'tokens' }), { tour: 'home_female' });  // → top_female
  assert.deepEqual([tokHomeF.tour, tokHomeF.code], ['top_female', 'HuFr']);
  assert.equal(P.cbUrl(cfg({ program: 'pps' }), { tour: 'home_female_np' }).code, '0fQq');
});

test('every program code is a known tour and every placement resolves in every program', () => {
  for (const [name, prog] of Object.entries(P.PROGRAMS)) {
    for (const k of Object.keys(prog.tours)) assert.ok(P.TOURS[k], `${name}.${k} is a known tour`);
    for (const k of Object.keys(P.DEFAULT_PLACEMENTS)) assert.ok(P.placementUrl(cfg({ program: name }), k, {}), `${name} resolves ${k}`);
  }
});

test('room links need a valid room name; track tags are sanitised', () => {
  const c = cfg();
  assert.equal(P.roomUrl(c, 'bad room!', {}), null);
  assert.equal(P.roomUrl(c, 'luna_vex', { source: 'reddit spring/24', creator: 'luna' }).url, 'https://chaturbate.com/in/?tour=LQps&campaign=Ji03i&track=redditspring24_room&room=luna_vex');
  assert.equal(P.roomUrl(cfg({ roomTour: 'room', track: '{creator}' }), 'luna_vex', { creator: 'luna' }).url, 'https://chaturbate.com/in/?tour=dT8X&campaign=Ji03i&track=luna&room=luna_vex');
  assert.equal(P.cleanTrack('___'), 'default');
});

test('disabled, missing campaign and off placements produce no link', () => {
  assert.equal(P.cbUrl(cfg({ enabled: false }), { tour: 'home' }), null);
  assert.equal(P.cbUrl(cfg({ campaign: '' }), { tour: 'home' }), null);
  assert.equal(P.placementUrl(cfg({}, { x: { slot: 'footer', tour: 'home', label: 'x', on: false } }), 'x', {}), null);
});

test('validate rejects bad settings', () => {
  assert.doesNotThrow(() => P.validate(cfg()));
  assert.throws(() => P.validate(cfg({ program: 'nope' })), /program/);
  assert.throws(() => P.validate(cfg({ campaign: 'Ji03i&x=1' })), /campaign/);
  assert.throws(() => P.validate(cfg({ roomTour: 'home' })), /room tour/);
  assert.throws(() => P.validate(cfg({}, { a: { tour: 'nope', label: 'x' } })), /unknown tour/);
  assert.throws(() => P.validate(cfg({}, { a: { tour: 'home', label: '' } })), /label/);
});
