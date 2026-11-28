# Connected talent network

## Feature specification

The user supplied https://juicystarz.com/ as the reference after requesting paid employer listings and free hiring/available-work boards on star profiles. Its public homepage, talent search, producer directory, jobs hub and location posts show a connected discovery → profile → opportunity → contact structure. This is an original X3Star implementation of that structure using existing local records, not a copy of the reference's assets, ads or claims.

Target users are creators finding collaborators or presenting availability, applicants finding work, and employers advertising reviewed paid openings. Default presentation is a dedicated `/network` hub alongside the existing app; no homepage preference reply was received, so the stated dedicated-hub default was used. Existing free profile boards and paid employer placement remain distinct. No new account roles or payment flows are introduced.

Requirements:
- `/network` connects searchable talent, free profile opportunities, paid company jobs, casting and guides.
- `/talent` and `/talent/:id` show approved creators with active nonbanned owners. Search uses actual names, niches, tags and optional self-declared public city/state. No demographic inference, synthetic verification badges or invented location.
- Creator Studio can set or clear a broad public city (maximum 80 characters) and a known state slug. Both default blank. Location is never inferred from IP, billing or private applications.
- `/opportunities` aggregates only existing open, unexpired star-board posts; filters distinguish hiring, availability and collaboration category. Each result links to the existing board's private inquiry flow. These posts are free profile posts, not paid employer advertisements.
- `/companies` and `/companies/:id` expose only company identities snapshotted in currently public approved paid employer listings. No unreviewed company-profile edit, owner identity, contact email, receipt or private inquiry becomes public.
- Search/pagination inputs are bounded, scalar and parameterized; wildcard text is literal. Unknown records return 404. Hidden, expired, suspended or banned records disappear immediately. Public dynamic results use no-store.
- All new HTML works without JavaScript, escapes stored content, includes meaningful empty states, labels demos/test ads, and uses original X3Star styling without external media. Search variants and demo/test-only profiles stay noindex. No fabricated JobPosting or identity verification claims.
- State casting pages link to real matching talent and approved paid jobs. No empty city landing-page generation.

Public seams under test are real HTTP APIs and rendered pages against temporary SQLite, plus the existing Studio profile API. Boundary cases include inactive owners, expired posts, payment/review gates, private data omission, escaping, literal searches, query limits, migration defaults, owner/Admin location scope, and clearing location.

Out of scope: copying competitor records/assets; explicit media; new full direct messaging, social follows/reviews, demographic profiling, live merchant integration, deployment, rewriting the existing homepage before a preference reply, or changing unrelated wiki/IDE/live-QA files.

## Implementation plan

Goal: ship a usable connected talent-network hub powered by the existing creator and employer systems.
Scope: additive SQLite fields, public read services/routes, Studio location editing, server-rendered pages, navigation, meaningful HTTP integration tests and documentation.

### Subtask 1 — Expose discovery data

#### Context
Existing creators, free boards and reviewed paid employer jobs already hold the required content.
#### What to implement
Add optional creator public location, bounded talent/opportunity/company search, individual metadata profiles, API routes and eligibility filters. Reuse the existing employer publication gate.
#### Where
`server/network.js`, `server/routes/network.js`, `server/db.js`, `server/services.js`, `server/routes/studio.js`, `server/employer-directory.js`, `test/network.test.js`.
#### Acceptance criteria
- [x] Read APIs expose eligible records only, with no private contacts; Studio location supports own/Admin scope and clearing; paid gates cannot drift.
#### Out of scope
New roles, paid plan changes, fake profiles and inferred location.
#### Depends on
None.
#### Technical notes
Return bounded result objects with totals and stable pages. Additive default-blank columns preserve old SQLite data. Test via actual HTTP and temporary SQLite.
#### Definition of done
- [x] Tests, syntax checks and independent review pass; public contracts documented.

### Subtask 2 — Render connected public pages

#### Context
Discovery must connect to profiles and existing inquiry flows.
#### What to implement
Build original X3Star network, talent, opportunities and company pages with filters, useful empty states, pagination, demo labels and separate paid/free sections.
#### Where
`server/pages/network.js`, `public/assets/network.css`, `test/network-pages.test.js`.
#### Acceptance criteria
- [x] Public pages remain readable without JavaScript; links/filter state work; stored data is escaped; no copied media or unsupported badges.
#### Out of scope
New chat, follows/reviews and external media.
#### Depends on
Subtask 1 — Expose discovery data.
#### Technical notes
Reuse existing editorial HTML helpers and board/private-inquiry URLs. Use text/initials rather than media previews.
#### Definition of done
- [x] Rendered-page tests and independent review pass; actual browser status reported honestly.

### Subtask 3 — Connect existing entry points

#### Context
The new hub must be discoverable from the current app, casting funnel and Studio.
#### What to implement
Mount APIs and page routes, add navigation and state links, expose Studio city/state controls, update crawler configuration where justified, and document routes.
#### Where
`server/index.js`, `server/pages/editorial.js`, `public/assets/editorial.css`, `public/index.html`, `public/assets/studio.js`, `README.md`, `docs/API.md`.
#### Acceptance criteria
- [x] Existing routes and free/paid workflows remain functional; new hub reachable; Admin-selected Studio profile save targets that creator; location defaults hidden.
#### Out of scope
Root replacement without a preference reply and unrelated untracked files.
#### Depends on
Subtasks 1 and 2.
#### Technical notes
Keep selected creator query on profile saves; canonicalize trailing slash preserving search; no-store dynamic discovery; keep empty/demo variants out of crawler indexing.
#### Definition of done
- [x] Full existing tests/build and focused integration checks pass; docs reflect actual behavior.

### Subtask 4 — Verify the running result

#### Context
Implementation claims need real execution evidence and independent review.
#### What to implement
Run focused then full suites, build, syntax/inline checks, independent diff review and live local HTTP readback. Attempt browser verification using available approved tooling. Commit scoped files and open a stacked draft PR.
#### Where
Tests, `audit-artifacts/talent-network-local.json`, this execution record and Git.
#### Acceptance criteria
- [x] All code findings fixed and checks rerun; no deployment or browser/payment success claimed without evidence.
#### Out of scope
Live external account changes and real payments.
#### Depends on
Subtasks 1–3.
#### Technical notes
Use Node 24, real temporary SQLite/HTTP and preserve unrelated work. Two separate agent reviews are available.
#### Definition of done
- [x] Relevant implementation/build/tests/integration are proven; external limitations recorded; commit and draft PR match.

## Execution evidence

Six connected public views, including the hub, are implemented using existing creator boards and employer entitlements. Independent review found and resolved an API mount-prefix mismatch and a legacy serializer exposure of the newly introduced location fields. The fields now appear only in authorized Studio and owner-gated network metadata. Page review also fixed company pluralization, state-code selection and page-size preservation.

Final Node 24.22.1 gates: `npm test` passed 102/102 with zero skipped or failed; `npm run build:standalone` passed; all 58 JavaScript files passed `node --check`; eight inline scripts parsed; diff whitespace checks passed. Two agents independently reviewed code they did not author. Independent affected-suite runs passed 45 tests.

The existing local database migrated and the app restarted successfully at localhost:8080. Live readback confirmed `/network`, `/talent`, `/talent/luna`, `/opportunities`, `/companies`, the three public network APIs, the local stylesheet, jobs/employer pages and Colorado casting all respond 200. Unknown profiles return 404 and private endpoints require sign-in. The 16 existing demo profiles are labeled, have blank location defaults, and no fake jobs/company ads were inserted.

Browser QA remains externally blocked: `cua.getState()` returned no apps/browsers and "The browser access host is unavailable". Restoring that host is required for actual visual/keyboard verification. No production deployment or live payment was performed; billing remains the existing explicit test/manual implementation. No new direct-message, social-follow or review system is claimed. Source hashes and safe live readback are preserved in `audit-artifacts/talent-network-local.json`; commit and draft PR identify the published source.
