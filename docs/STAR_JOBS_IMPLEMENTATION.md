# Per-star jobs boards

## Feature specification

Every approved star has a board supporting both `hiring` (team openings / collaborations) and `available` (work they offer). A star manages its own listings and private inquiries in Creator Studio. Public boards show only open, unexpired listings; draft, closed and archived listings stay private. Boards work for offline stars too. No demo openings are invented.

Listings contain title, description, category, remote/on-site/hybrid mode, optional broad location, compensation text, status and expiry. Default expiry is 30 days; at most 180 days. Authenticated users can submit one private inquiry per listing, with message and optional HTTPS portfolio link, and cannot inquire about their own listing. Owner/admin can review inquiries and change new/reviewing/closed status. Applicant account name/email and message stay private to the owner/admin. No payments, hiring decisions, emails, third-party forwarding or identity checks are added.

Creator ownership is enforced on every Studio operation using existing myCreator behavior; admin ?as remains supported. Suspended or banned owners cannot expose new public listings. Reads/writes are bounded and parameterized, archived listings retain inquiry history, duplicates are database-enforced, schema initialization is additive and restart-safe.

## Public seams and file plan

Use real HTTP and temporary SQLite for listing CRUD/publication, inquiry storage/privacy, duplicate and authorization failures, expiry and restart recovery. Browser evidence is separate; the supplied browser tool was unavailable in the prior task. Preserve all pre-existing wiki/IDE files.

New: server/jobs.js; server/routes/jobs.js; test/jobs.test.js; test/star-jobs-pages.test.js; test/jobs-client.test.js; public/assets/jobs.js; public/assets/jobs.css; server/pages/jobs.js. Modify: server/db.js; server/routes/studio.js; server/services.js; server/index.js; server/pages/editorial.js (reuse layout export only); public/index.html; public/assets/game.js; public/assets/studio.js; scripts/build-standalone.js; README.md; docs/API.md. Intentional evidence: audit-artifacts/star-jobs-local.json. No file removals.

API contract: GET /api/creators/:id/jobs -> {jobs}; POST /api/jobs/:id/inquiries -> {ok:true,inquiry}; GET/POST /api/studio/jobs; PUT/DELETE /api/studio/jobs/:id (DELETE archives); GET /api/studio/jobs/:id/inquiries; PATCH /api/studio/jobs/:id/inquiries/:inquiryId. Public job fields camelCase: id,creatorId,kind,title,description,category,workMode,location,compensation,status,expiresAt,createdAt,updatedAt. Private inquiry: id,jobId,userId,message,portfolioUrl,status,createdAt,updatedAt,applicant:{name,email}. Public listing/profile never includes inquiries/contact data. Public GET /stars/:id/jobs uses server-rendered non-graphic HTML and no JobPosting metadata. Board is linked from profile modal and full profile; offline full-profile resolution gets a safe fallback rather than fake live status/market values.

Verification: node --test test/jobs.test.js; npm test; npm run build:standalone; node --check on changed/all JavaScript; git diff --check; real restart/public-route checks; independent read-only diff review. Branch feat/star-jobs-board from 7ba83d4; draft PR targets feat/casting-seo.

## Execution evidence

Implemented both listing directions, private inquiries, Studio management, profile integration and shareable boards. The full Node24 suite passed 74 tests: 55 existing checks, 11 new real HTTP/SQLite checks (including actual process restart), and 8 explicitly isolated client control-flow checks. Standalone generation, syntax checks on 47 JavaScript files and parsing of 8 inline scripts passed. Independent review found no remaining blocking issue after fixes for archive ordering, private-response caching, mailto URI encoding, offline gift goals and session identity refresh.

Actual browser rendering and interaction remain unverified: cua_repl.getState returned apps=[], browsers=[] and "The browser access host is unavailable". Restoring browser access is the exact next action required for desktop/mobile UI verification. Isolated DOM fixtures do not establish real browser behavior. No production deployment, hiring acceptance, payment or email delivery is claimed.

## Ordered execution plan

### Subtask 1 — Persist jobs and private inquiries

#### Context
There is no jobs/inbox data model; creator applications have unrelated account-creation semantics.

#### What to implement
Add additive SQLite tables/indexes, bounded service validation, public and owner-scoped routes, real HTTP tests and restart checks.

#### Where
server/db.js; server/jobs.js; server/routes/jobs.js; server/routes/studio.js; server/services.js; test/jobs.test.js

#### Acceptance criteria
- [x] Only open unexpired approved-owner listings are public; cross-owner/fan mutation fails; private inquiries stay private; duplicate/self/closed/expired submissions reject; restart retains data.

#### Out of scope
Payments, hiring decisions, email delivery, third-party applicant forwarding and production deployment.

#### Depends on
None

#### Technical notes
Use existing creator resolver and auth, transactions, rate limits, foreign keys and UNIQUE constraints.

#### Definition of done
- [x] Meaningful public-interface tests pass with real SQLite/HTTP.
- [x] Build/syntax checks pass and independent review findings are resolved.
- [x] Changes documented, scoped and preserved without unrelated work.

### Subtask 2 — Render boards on every star profile

#### Context
Current profile data and modal need a coherent board; offline stars currently fail profile lookup.

#### What to implement
Add one shared public renderer/inquiry flow, full profile section, modal tab, board links and safe offline profile/market handling.

#### Where
public/assets/jobs.js; public/assets/jobs.css; public/index.html; public/assets/game.js; scripts/build-standalone.js

#### Acceptance criteria
- [x] Both listing kinds visible with distinct actions; signed-in inquiry flow handles errors and repeats; offline stars reachable; standalone does not invent jobs.

#### Out of scope
Payments, hiring decisions, email delivery, third-party applicant forwarding and production deployment.

#### Depends on
Subtask 1 — Persist jobs and private inquiries

#### Technical notes
Escape all text, honor detached views and prevent stale responses replacing current tab content. Separate actual browser evidence from isolated logic tests.

#### Definition of done
- [x] Meaningful public-interface tests pass with real SQLite/HTTP.
- [x] Build/syntax checks pass and independent review findings are resolved.
- [x] Changes documented, scoped and preserved without unrelated work.

### Subtask 3 — Manage jobs from Creator Studio

#### Context
Stars need ownership-controlled authoring and private applicant review.

#### What to implement
Add Studio Jobs view with create/edit/draft/publish/close/archive and private inbox statuses; preserve admin as selection on boot.

#### Where
public/assets/studio.js

#### Acceptance criteria
- [x] Owner can manage both kinds and review only their inbox; admin as works; validation/retry errors are visible.

#### Out of scope
Payments, hiring decisions, email delivery, third-party applicant forwarding and production deployment.

#### Depends on
Subtask 1 — Persist jobs and private inquiries

#### Technical notes
Reuse Dash modal/guard/router; keep confirmations for archive; no mail sent or employment decisions implied.

#### Definition of done
- [x] Meaningful public-interface tests pass with real SQLite/HTTP.
- [x] Build/syntax checks pass and independent review findings are resolved.
- [x] Changes documented, scoped and preserved without unrelated work.

### Subtask 4 — Expose and verify public boards

#### Context
A shareable non-graphic board lets every approved star be reached independently of the app hash route.

#### What to implement
Add /stars/:id/jobs HTML, connect links, document routes, execute all gates, independently review and save evidence.

#### Where
server/pages/jobs.js; server/index.js; server/pages/editorial.js; README.md; docs/API.md; audit-artifacts/

#### Acceptance criteria
- [x] Unknown/suspended star 404; existing site still passes gates; privacy/source hashes recorded; browser availability honestly reported.

#### Out of scope
Payments, hiring decisions, email delivery, third-party applicant forwarding and production deployment.

#### Depends on
Subtasks 1–3

#### Technical notes
No automatic SEO indexing/schema claims for user-created listings; no deployment/merge or invented vacancies.

#### Definition of done
- [x] Meaningful public-interface tests pass with real SQLite/HTTP.
- [x] Build/syntax checks pass and independent review findings are resolved.
- [x] Changes documented, scoped and preserved without unrelated work.
