# Paid employer jobs directory

## Confirmed intent and scope

User requests a sitewide jobs directory inspired by SexyJobs where employers pay to list. Retain the existing free per-star boards; central employer placement is separately paid. Applicants browse and inquire free. Employer capability uses an employer_accounts row linked to an existing user, with no changes to user role CHECK or fake creator accounts. Initial local test price is 4900 USD cents for 30 days (optional user price clarification pending); Admin may edit future pricing.

Build /jobs and /jobs/:id public search/detail HTML, /employers employer portal, and Admin employer directory controls. Directory filters include search, category, US state, work mode and bounded pagination. Public employer ads require review approval, a paid unrefunded entitlement, active nonbanned owner, open status and an unexpired term. Employer edits reset review; an existing paid term does not restart. Employer company details are snapshotted into listing review so later profile edits cannot silently replace an approved publisher identity.

Billing is separate from diamond orders. Dedicated invoice/order snapshots use integer priceCents, currency USD, durationDays and test flag. No browser-supplied price, paid flag, expiry or review state is authoritative. Test payments work only in explicit development test mode and do not appear as live revenue or production ads. Manual mode requires configured invoice instructions; only Admin records a received payment with matching amount/currency, unique reference and actor/audit. Confirmation is idempotent. Recording an off-platform refund revokes the entitlement but does not move money. No live card checkout/provider webhook is fabricated. Approved merchant account/credentials are an external dependency for hosted checkout. Invoice mode can operate with owner-provided off-platform instructions.

Term begins when payment and approval first allow publication. Retries, content edits, closing/reopening and reapproval cannot extend a paid period. Renewal is allowed after expiry with a new order. Public queries exclude cancelled/refunded/unpaid/unapproved/expired/suspended/banned ads. Applicant account name/email/message/portfolio stay private to employer owner/Admin. No automated employment decisions or mail delivery.

## Public-interface seams and contracts

Real HTTP/SQLite tests for owner setup, listing CRUD, review+payment publication gates, immutable order snapshots, duplicate payment/refund behavior, private inquiries, cross-owner access, expiry and actual restart. Isolated client fixtures are not browser proof. Existing browser tool currently unavailable.

Backend API (all JSON; private responses no-store):
- GET /api/directory/jobs and /api/directory/jobs/:id public.
- POST /api/directory/jobs/:id/inquiries authenticated, same signed-in private inquiry semantics as star boards.
- GET /api/employer -> {profile,listings,orders,plan,billingMode}; PUT /api/employer/profile.
- POST /api/employer/listings; PUT /api/employer/listings/:id; POST /api/employer/listings/:id/submit; POST /api/employer/listings/:id/close; DELETE /api/employer/listings/:id archive.
- POST /api/employer/listings/:id/orders -> {order}; POST /api/employer/orders/:id/test-pay explicit development test only; POST /api/employer/orders/:id/cancel for unpaid owner invoices.
- GET /api/employer/listings/:id/inquiries; PATCH /api/employer/listings/:id/inquiries/:inquiryId.
- GET /api/admin/employer-directory/lookup?type=listing|order|employer&id=... -> exact record for actions beyond bounded queue views.
- GET /api/admin/employer-directory -> {settings,listings,orders,metrics}; PUT /api/admin/employer-directory/settings.
- POST /api/admin/employer-directory/listings/:id/review {decision:approved|rejected,note?,reviewToken}.
- POST /api/admin/employer-directory/orders/:id/confirm {reference,amountCents,currency}; POST /api/admin/employer-directory/orders/:id/refund {reference,note?}.

Backend exports from server/employer-directory.js: config() -> pricing/plan; search(query) -> {jobs,total,page,pageSize,pages}; publicJob(id); employerDashboard(user); saveProfile(user,body); createListing/updateListing/submitListing/closeListing/archiveListing(user,id,body?); createOrder(user,listingId); testPay(user,orderId); sendInquiry(user,listingId,body); listInquiries/reviewInquiry(user,listingId,inquiryId,status); adminDashboard(); adminLookup(actor,query); saveSettings(actor,body); reviewListing(actor,listingId,body); confirmPayment(actor,orderId,body); recordRefund(actor,orderId,body). Agent may refine names only after notifying root/frontend.

Public job fields: id,companyName,title,description,category,workMode,location,state,compensation,publishedAt,expiresAt,test. Private listing adds status,reviewStatus,reviewNote,reviewToken,createdAt,updatedAt,activeOrderId. Order fields: id,listingId,priceCents,currency,durationDays,invoiceInstructions,status,test,reference,createdAt,paidAt,activatedAt,expiresAt. Dashboard plan: {priceCents,currency,durationDays,invoiceInstructions,enabled,testPaymentsAllowed}, billingMode test|manual|disabled. Job category allowlist: broadcasting,production,editing,moderation,design,photography,marketing,technology,operations,other. Existing creator categories stay unchanged. Employer jobs only hiring; free available-for-work remains on star profiles. State known slug optional for remote; onsite/hybrid location required. Compensation required. Full public details are escaped HTML with canonical metadata, no invented JobPosting claims. Search/filter variants noindex; empty directory isn't advertised as stocked.

## Execution evidence

Implemented the public directory, employer portal, separate company capability, server-priced invoices, Admin settings/review/receipt/refund controls, private inquiries and exact Admin record lookup. Initial local settings are 4900 USD cents for 30 days in explicit development test mode. No real invoice payment, card charge or external refund was performed.

Final local gates: npm test 90/90 passed; standalone generation passed; node --check passed for 53 JavaScript files; 8 source/standalone inline scripts parsed; git diff --check passed. The new employer suite uses real temporary SQLite and HTTP, including actual process restart, mode transitions, controlled-clock expiry, duplicate/replay/refund gates, stale moderation tokens and 205-record history/lookup regressions. Independent review reported no remaining code finding after the fixes.

Live local readback confirmed /jobs, /employers and their assets/API respond, anonymous private endpoints return401, and Admin settings show test mode with zero real/test fee revenue. Actual browser rendering/interaction remains unverified: cua_repl.getState returned apps=[], browsers=[], “The browser access host is unavailable”. Restoring browser access is the next action needed for UI verification. Hosted live card checkout additionally requires an approved merchant configuration/provider integration; none was fabricated. No production deployment performed.

## Files and ordered execution plan

Backend owner: new server/employer-directory.js, server/routes/employer-directory.js, test/employer-directory.test.js; modify server/db.js and server/config.js only. Root mounts returned router under /api before API404. Frontend owner: server/pages/directory.js, public/employers.html, public/assets/employer.js, public/assets/directory.css, public/assets/jobs.js and its client tests (optional source flag to reuse private-inquiry UI), test/directory-pages.test.js. Root: server/index.js, server/pages/editorial.js, public/assets/admin.js, public/index.html navigation, README.md, docs/API.md, .env.example, local ignored .env test-mode setting, docs/EMPLOYER_DIRECTORY_RESEARCH.md, docs/EMPLOYER_DIRECTORY_IMPLEMENTATION.md, audit-artifacts/employer-directory-local.json. Preserve unrelated wiki/IDE/CASTING_LIVE_QA files. No files deleted.

### Subtask 1 — Persist employer billing and publication

#### Context
Existing creator and diamond schemas cannot safely represent corporate ownership or paid ad entitlements.

#### What to implement
Add additive employer tables, service/route validation, separate integer-cent orders, review/payment gates, private inquiries and real HTTP restart tests.

#### Where
Backend-owned files above

#### Acceptance criteria
- [x] Unpaid or unreviewed ads cannot publish; price/payment spoofing and cross-owner requests fail; receipts/refunds idempotent; test not live; edits do not extend paid time.

#### Out of scope
Live hosted checkout without approved credentials, deployment, automatic refunds, hiring decisions, applicant fees and unrelated workspace changes.

#### Depends on
None

#### Technical notes
Keep legacy star board behavior and roles unchanged; transactions/unique receipt constraints; public data no contacts.

#### Definition of done
- [x] Public-interface tests, build and syntax gates pass.
- [x] Independent findings resolved and limitations recorded.
- [x] Changes documented, scoped, committed and reviewable.

### Subtask 2 — Build directory and employer portal

#### Context
Employers need a coherent drafting/payment/inquiry workflow and applicants need browsing.

#### What to implement
Render searchable public pages, registration/sign-in, company profile, listing management, invoices/test receipt UI and private inbox.

#### Where
Frontend-owned files above

#### Acceptance criteria
- [x] Portal exposes real backend state; test/manual/disabled flows clearly labeled; applicant inquiries private; no false payment confirmation.

#### Out of scope
Live hosted checkout without approved credentials, deployment, automatic refunds, hiring decisions, applicant fees and unrelated workspace changes.

#### Depends on
Subtask 1

#### Technical notes
Reuse API/jobs components, local assets and escaped text; preserve SSR when refresh fails.

#### Definition of done
- [x] Public-interface tests, build and syntax gates pass.
- [x] Independent findings resolved and limitations recorded.
- [x] Changes documented, scoped, committed and reviewable.

### Subtask 3 — Expose Admin controls and navigation

#### Context
Owner must set pricing, review ads and reconcile off-platform receipts.

#### What to implement
Add Admin pricing/review/invoice controls with separate test/live revenue metrics and source navigation links.

#### Where
Root-owned UI/index/docs files above

#### Acceptance criteria
- [x] Price changes affect new orders; Admin-only actions; receipt amount/currency explicit; recorded refunds do not imply automated money movement.

#### Out of scope
Live hosted checkout without approved credentials, deployment, automatic refunds, hiring decisions, applicant fees and unrelated workspace changes.

#### Depends on
Subtask 1

#### Technical notes
No external account signup, real charge, checkout secrets or provider webhook invented.

#### Definition of done
- [x] Public-interface tests, build and syntax gates pass.
- [x] Independent findings resolved and limitations recorded.
- [x] Changes documented, scoped, committed and reviewable.

### Subtask 4 — Verify and preserve the implementation

#### Context
The result must run locally with honest execution evidence.

#### What to implement
Run full suites, build, syntax/inline checks, independent read-only review and live local readback; document actual billing and external prerequisites.

#### Where
Tests; docs; audit-artifacts

#### Acceptance criteria
- [x] Tests/build pass; source hashes preserved; draft PR; no deployment/production revenue claims; browser availability reported.

#### Out of scope
Live hosted checkout without approved credentials, deployment, automatic refunds, hiring decisions, applicant fees and unrelated workspace changes.

#### Depends on
Subtasks 1–3

#### Technical notes
Use Node24 and real temporary SQLite/HTTP; preserve all unrelated dirty work.

#### Definition of done
- [x] Public-interface tests, build and syntax gates pass.
- [x] Independent findings resolved and limitations recorded.
- [x] Changes documented, scoped, committed and reviewable.
