# Circular talent photos and live room previews

## Scope and design

The user requests a circular model photo on the front of each talent card, changing to a live view of that model's room on hover. Apply this to the talent cards on `/network` and `/talent`, retaining profile and inquiry links. Prefer approved avatar images assigned to that creator, then approved image covers; missing or failed photos retain a circular initials placeholder. Never use another model's picture.

The native app's current `live` flag is a Studio status toggle; its video source is a gallery upload or generic demo loop. Neither is a native live transport. Real partner room adapters already exist for CB and BC. Reuse those adapters and current enabled/active affiliate gates, matching only the eligible creator's explicitly saved same-provider handle to a fresh public room. Stale, private/group/VIP, offline, suspended, banned, demo, mismatched or unavailable rooms must not be substituted or advertised as playable live media.

Public contracts: talent metadata adds `photo:{url,alt}|null` and `previewUrl:string|null`. A same-origin `GET /api/network/talent/:id/preview` rechecks eligibility and resolves a minimal typed descriptor: `{available:true,kind:'iframe',site,src,href,muted,checkedAt}` or `{available:false,reason,href?}`. Photo attribution requires the exact creator association and either that creator as upload owner or an authorized Admin uploader, preserving existing Admin Studio uploads on behalf of a model. No provider demographics, location, private contacts or raw feed objects are returned. Recheck the creator after asynchronous lookup. Validate exact HTTPS provider hosts, campaign/affiliate identity and the same room selector; no arbitrary URL configuration or SSR provider calls.

Interaction: circular photo at rest, a live-preview stage within that same card when active, name/actions still accessible. Mouse hover and keyboard focus request one preview after a short dwell; touch and keyboard have an explicit toggle button. Respect reduced-motion/save-data for automatic starts. Only one preview can run. Stop and remove the frame on leave, focus exit, Escape, outside interaction, offscreen, pagehide, hidden document, error or timeout. Abort superseded requests; late responses cannot restart removed/old cards. Preserve ordinary profile navigation. Reuse the app's existing `x3s:age` session confirmation before live media starts. Provider embeds disclose their host; gallery/demo loops are not presented as live.

CB uses the existing adapter's `disable_sound=1` request. BC's current feed embed has no verified silent-autoplay contract, so it requires an explicit Play action labeled that sound may be present. Actual provider playback/muting still needs browser/provider verification. No new native streaming service, credential setup, account changes, fake photographs or third-party content import is in scope.

## Source and verification boundaries

Primary-source research reviewed on 2026-11-27. [Chaturbate affiliate terms](https://chaturbate.com/terms/appendix-b/) and its [syndication explanation](https://support.chaturbate.com/hc/en-us/articles/22668646607252-DMCA-on-Chaturbate) describe real-time online-room syndication. Its detailed [Users Online API](https://chaturbate.com/affiliates/promotools/api_usersonline/) and [embed configurator](https://chaturbate.com/affiliates/promotools/interactive_embed_video/) require login, so current detailed mute behavior was not independently verified. The implementation reuses the existing adapter's mute request and does not claim actual muted playback was observed.

[BongaCash tools](https://bongacash.com/promo) describe model-specific live embeds. The explicit silent-autoplay statement concerns its separate Out-Stream product; the [embedded-room configurator](https://bongacash.com/promo/embed-chats) requires login. No undocumented BC mute query parameter is invented. [Chrome's autoplay documentation](https://developer.chrome.com/blog/autoplay/) explains delegated iframe autoplay; it is not an iframe mute control. BC therefore requires an explicitly labeled Play action.

Local source inspection found only gallery/demo video in `public/index.html` (`videoSrc`) and a status toggle in Studio, without native media ingest/playback infrastructure. The existing local database contains 16 demo creators and zero approved profile photos. Runtime cards must show that absence honestly until actual owner photos and live sources are available. No model photo, live session or external account was fabricated for this change.

## Execution plan

Goal: render circular approved photos and give each eligible talent card a truthful, controlled live-room preview.
Scope: existing network service/API, new client controller, card HTML/styles, real HTTP tests, isolated interaction fixtures and documentation.

### Subtask 1 — Resolve eligible card media
#### Context
Network metadata currently omits media, while the existing live app plays clips rather than a native stream.
#### What to implement
Batch approved owner-scoped avatar/cover lookup; add preview URLs and a fresh same-room partner resolver with eligibility and URL checks.
#### Where
`server/network.js`, `server/talent-media.js`, `server/routes/network.js`, `server/cblive.js`, `server/bclive.js`, `test/talent-media.test.js`, relevant existing network tests.
#### Acceptance criteria
- [x] Only approved owned images and genuine fresh public matching rooms are returned; privacy, ban, configuration and stale/error cases are enforced.
#### Out of scope
Native ingest infrastructure, unverified stream guesses, copied model photos and billing changes.
#### Depends on
None.
#### Technical notes
Add an opt-in strict-public-status mode to the existing adapters and separate its cache entries; unknown upstream status must not default to public for previews. Default legacy feed behavior stays compatible. No network calls while rendering lists. External provider adapters may be isolated at their existing fetcher boundary in tests; actual HTTP/SQLite and upload moderation stay real. Provider mocks are not production playback proof.
#### Definition of done
- [x] Focused positive/negative tests, syntax checks and independent review pass.

### Subtask 2 — Build card preview interaction
#### Context
Cards need a circular front photo and a live room view without trapping navigation or leaving background players running.
#### What to implement
Update card markup/style and add one preview controller with hover, focus, explicit touch/button actions, age confirmation, load states and complete cancellation/cleanup.
#### Where
`server/pages/network.js`, `public/assets/network.css`, `public/assets/talent-previews.js`, `test/talent-previews-client.test.js`, `test/network-pages.test.js`.
#### Acceptance criteria
- [x] Correct photo fallback; one player; no eager iframe; usable keyboard/touch; stale callbacks cannot restart media; silent auto-start only where requested by the supported adapter.
#### Out of scope
Replacing legacy live-app cards or adding a video library, simulated live video or new external assets.
#### Depends on
Subtask 1 contract.
#### Technical notes
Use same-origin resolver and fixed provider URL validation; safe text/attributes; no autoplay before the existing age confirmation; preserve card links. Limited DOM fixtures must not be labeled browser evidence.
#### Definition of done
- [x] Rendered HTML and meaningful lifecycle/error tests pass; independent review finds no blocker.

### Subtask 3 — Verify the running cards
#### Context
The local preview must reflect actual source availability and preserve all previous functionality.
#### What to implement
Run focused/full tests, standalone build, syntax/inline checks and independent review; attempt approved browser verification; restart/read back the app; update docs and source evidence; commit scoped files and open a stacked draft PR.
#### Where
`README.md`, `docs/API.md`, this execution note, `audit-artifacts/talent-card-previews-local.json`, Git.
#### Acceptance criteria
- [x] Relevant tests/build pass; local missing media and missing provider configuration are reported truthfully; no real payment/deployment or provider-playback claim without proof.
#### Out of scope
Unrelated wiki/IDE/live-QA files, native streaming deployment and live affiliate account changes.
#### Depends on
Subtasks 1–2.
#### Technical notes
Use Node 24 and temporary real SQLite/HTTP fixtures. Preserve existing dirty work and current data; never fabricate local photos/ads.
#### Definition of done
- [x] Implementation, build, tests and integration are proven; external/browser/source limitations recorded; commit and draft PR identify the reviewed result.

## Execution evidence

Implemented circular 132px approved profile photos with initials fallback, same-card room frames, preserved profile/actions and an on-demand single-player controller. Models without photos or a linked supported room remain usable. Current local data still has 16 demo profiles, zero approved photos and zero preview candidates; no model photo or room association was fabricated.

Final Node v24.22.1 gates passed: `npm test` — 120/120 (zero failed/skipped); `npm run build:standalone`; `node --check` for 62 JavaScript files; parsing 8 inline scripts; and diff whitespace checks. Ten new real HTTP/SQLite media tests exercise actual uploads/moderation, authorized Admin upload-on-behalf, ownership, strict-public cache/inflight separation, precise room/URL checks and post-request eligibility/configuration changes. Provider responses inside those tests are isolated at the existing fetcher boundary. Eight client lifecycle tests use limited DOM/API fixtures and are not browser proof. Existing rendered HTTP pages also passed. Two independent reviewers found no remaining code finding; 43 affected tests were independently rerun.

A separate real configured-provider metadata read exercised the actual adapters in strict-public mode: CB returned 60 fresh public room records without an error, with the expected chaturbate.com `/in/` embed schema; BC returned 0 without an error. This proves a point-in-time feed/normalization check, not a linked model or iframe playback. No provider image, iframe video or account action was requested during that check.

The local app restarted successfully. `/network`, `/talent`, profile, styles and controller script respond 200; list pages contain circular-photo markup and deferred controls without eager iframes/videos. The demo resolver responds `{available:false,reason:'demo'}` with no-store; unknown models 404 and private endpoints 401. Evidence and source hashes are in `audit-artifacts/talent-card-previews-local.json`.

Browser verification remains blocked: the available browser tool returned no enabled surfaces and "The browser access host is unavailable". Restoring that host is the next step for visual, real player, autoplay and audio checks. Populating the local cards requires actual approved model photos and explicitly linked real rooms; native x3STAR livestream transport still needs a genuine playback source. No deployment or real payment was performed. Commit and draft PR identify the reviewed implementation.
