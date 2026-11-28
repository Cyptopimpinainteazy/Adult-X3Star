# Casting and editorial SEO implementation

## Feature specification

Build an online, adults-only creator recruiting funnel for both x3STAR applications and clearly labeled affiliate partner applications. Reuse the existing application queue and affiliate redirects. Serve /casting, all 50 /casting/:state pages, /blog and eight original /blog/:slug articles as useful server-rendered pages without live media or an interaction gate. No local office, audition appointment, guaranteed earnings, current vacancy or automatic email promises.

Six authored state guides (California, Colorado, Florida, Nevada, New York, Texas) begin indexable; the remaining conversion pages use noindex,follow until they have substantial reviewed local guidance. Canonical URLs exclude tracking parameters. A configured SITE_URL controls production canonical origin. Use real content dates in the sitemap, exclude nonindexable states, and use visible-matching WebPage/BreadcrumbList/BlogPosting metadata. Do not add JobPosting markup.

Application fields state and landingPath are optional, bounded and validated; campaign attribution keeps compatible existing fields within a bounded allowlist. Admin shows the state and entry page. Success confirms storage and review only. Partner buttons use the existing available placements, disclose affiliate relationship and preserve bounded campaign/source data.

## Public test seams

Real HTTP routes and response HTML; real POST /api/apply followed by authenticated GET /api/admin/applications; existing /go redirects with manual redirect handling. Tests use temporary real SQLite databases. Browser checks exercise the dedicated safe-for-work funnel, validation, mobile layout and successful submission. No production submissions or partner-media retrieval.

## Implementation plan

New: server/content/states.js, server/content/articles.js, server/pages/editorial.js, server/routes/editorial.js, public/assets/editorial.css, public/assets/casting.js, test/editorial.test.js, test/casting-apply.test.js. Modify: server/index.js, server/config.js, server/routes/public.js, public/assets/admin.js, server/pages/guide.js, public/index.html, .env.example, README.md, docs/API.md. Preserve all pre-existing untracked workspace/wiki files. No files removed.

Commands: installed Node 24 via explicit PATH; node --test test/editorial.test.js; node --test test/casting-apply.test.js; npm test; npm run build:standalone; node --check on changed JavaScript; local browser checks; independent read-only diff review. Scope excludes payment/streaming integrations, legal advice, unverifiable earnings claims, deployment, and production configuration changes.

## Execution status

Implemented the routes, 50 state destinations, six indexable state profiles, eight articles, application attribution and navigation. Full local HTTP/SQLite suite passed 55 tests; focused checks passed 9. Standalone generation and JavaScript syntax checks passed. Two independent reviewers found no remaining blocking issue after fixing state-preserving header navigation and explicit receipt validation.

Browser validation remains blocked: the supplied cua_repl browser tool returned "The browser access host is unavailable". Desktop/mobile rendering and actual browser form interaction have not been verified. HTTP and isolated client-logic checks do not replace that evidence. No production deployment, search indexing or partner-conversion claim is made.

## Ordered subtasks

### Subtask 1 — Add crawlable casting routes

#### Context
The app currently exposes only a guide and hash-based journal.

#### What to implement
Render an accessible casting hub/state form and shared editorial layout with stable canonical URLs and existing affiliate choices.

#### Where
server/pages/editorial.js; server/routes/editorial.js; server/index.js; server/config.js; public/assets/editorial.css; public/assets/casting.js; test/editorial.test.js

#### Acceptance criteria
- [x] Hub lists all 50 states; unknown states return 404.
- [x] Pages contain useful HTML and accessible form controls without live media.
- [x] Partner choices reflect active configuration; canonical URLs omit campaign queries.

#### Out of scope
Payments, streaming, legal advice, production deployment and unrelated workspace files.

#### Depends on
None

#### Technical notes
Use existing Express/router patterns; escape all text and JSON-LD; avoid collecting IDs/photos/precise addresses.

#### Definition of done
- [x] Available public-interface checks executed; browser limitation recorded above.
- [x] Relevant tests and syntax/build checks pass.
- [x] Independently reviewed with material findings resolved.
- [x] Public commands and behavior documented.

### Subtask 2 — Publish state guidance and original articles

#### Context
Public search content needs distinct useful information.

#### What to implement
Add a 50-state directory, six substantive sourced state profiles and eight original recruiting articles with stable dates and related links.

#### Where
server/content/states.js; server/content/articles.js; server/pages/editorial.js; test/editorial.test.js

#### Acceptance criteria
- [x] Exactly 50 state routes work, with six editorial profiles indexable.
- [x] Eight full articles have unique metadata and match visible BlogPosting data.
- [x] Sitemap contains only canonical indexable routes with truthful dates.

#### Out of scope
Payments, streaming, legal advice, production deployment and unrelated workspace files.

#### Depends on
Subtask 1 — Add crawlable casting routes

#### Technical notes
Use primary-source links and practical non-graphic content; avoid keyword-swapped articles and fictional testimonials.

#### Definition of done
- [x] Available public-interface checks executed; browser limitation recorded above.
- [x] Relevant tests and syntax/build checks pass.
- [x] Independently reviewed with material findings resolved.
- [x] Public commands and behavior documented.

### Subtask 3 — Persist application attribution

#### Context
The same queue must support new landing-page sources.

#### What to implement
Validate optional state and local landingPath, preserve bounded compatible campaign data, display source in Admin and remove unsupported email promise.

#### Where
server/routes/public.js; public/assets/admin.js; public/index.html; test/casting-apply.test.js

#### Acceptance criteria
- [x] State/source survives POST then authenticated Admin retrieval.
- [x] Missing adulthood, invalid state/path and duplicate pending submission fail clearly.
- [x] Existing legacy applications still work.

#### Out of scope
Payments, streaming, legal advice, production deployment and unrelated workspace files.

#### Depends on
Subtask 1 — Add crawlable casting routes

#### Technical notes
Reuse applications.data JSON; no schema migration; preserve rate limits and authorization.

#### Definition of done
- [x] Available public-interface checks executed; browser limitation recorded above.
- [x] Relevant tests and syntax/build checks pass.
- [x] Independently reviewed with material findings resolved.
- [x] Public commands and behavior documented.

### Subtask 4 — Verify the funnel and document operation

#### Context
A running local page and end-to-end submission evidence are required.

#### What to implement
Link guide/app to casting/articles, document SITE_URL and indexing policy, run full checks, independently review diff and restart only this local server.

#### Where
README.md; docs/API.md; .env.example; server/pages/guide.js; public/index.html; audit-artifacts/

#### Acceptance criteria
- [x] Focused and full suites pass; standalone build passes.
- [ ] Browser desktop/mobile and actual form submission: blocked by unavailable browser access host; API persistence verified with real HTTP/SQLite.
- [x] Independent review findings fixed; changes scoped and committed.

#### Out of scope
Payments, streaming, legal advice, production deployment and unrelated workspace files.

#### Depends on
Subtasks 1–3

#### Technical notes
Never print credentials; do not deploy or claim search rankings, partner signup or real-money proof.

#### Definition of done
- [x] Available public-interface checks executed; browser limitation recorded above.
- [x] Relevant tests and syntax/build checks pass.
- [x] Independently reviewed with material findings resolved.
- [x] Public commands and behavior documented.
