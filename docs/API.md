# x3STAR API

JSON over HTTPS. Sessions use an `httpOnly` cookie (`x3s_sid`). State-changing requests must come from the same origin (the `Origin` header is checked) and be JSON or multipart. Errors look like `{ "error": { "code": "...", "message": "..." } }`.

## Public
| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{ ok, payments, demoTraffic, clients }` |
| GET | `/api/config` | Effective economy config + gacha odds |
| GET | `/api/creators` · `/api/creators/:id` | Approved creators. `:id` adds gallery, products, pinned product, top fans |
| GET | `/api/stories` | Approved stories from the last 24 h, grouped by creator |
| GET | `/api/clips` | Approved gallery videos for the Clips feed |
| GET | `/api/leaderboard/gifters?days=7` | Top gifters |
| GET | `/api/families` · `/api/families/:id` | Family leaderboard (week points), roster |
| GET | `/api/pk` · `/api/war` | Current PK battle, family war window |
| POST | `/api/apply` | Creator/agent application `{ email, stage, niche, hours, sites[], note, adult:true, agentCode?, state?, landingPath?, campaign? }`; returns `201 {ok:true}` after storage |
| GET | `/go/:site/:creator?c=&s=` | Logs a click on a creator's "Also live on" link and redirects (302). Chaturbate uses the partner config; other sites use their URL template |
| GET | `/go/a/:id?c=&s=` | Logs a click on an Affiliates-registry link and redirects (302) — active partners only |
| GET | `/go/v/:id?c=&s=` | Logs a partner-video click and redirects (302) to the clip's BongaCams tracking link |
| GET | `/api/partner-videos?tag=&performer=&limit=&offset=` | Partner videos (newest first) with the top tags |
| GET | `/go/p/:placement?c=&s=` | Logs a click on a site partner placement (footer, partner ad, apply page) and redirects (302) to the Chaturbate affiliate URL |

## Casting attribution

`state` is optional: a US state slug or two-letter code, stored as the canonical slug (for example `CO` → `colorado`). `landingPath` is an optional `/casting` or `/casting/<known-state-slug>` entry path, without a query, fragment or external origin. It is independent of the applicant's selected state. Both are returned in `GET /api/admin/applications` and shown in Admin.

`campaign` is an optional object. Supported keys are `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `ref`, plus legacy aliases `source`, `medium`, `campaign`, `content`, `term` (strings up to 160 characters). Optional `first_seen` is a nonnegative safe-integer timestamp. Unknown keys, nested data, arrays, null and oversized values return `400`. Legacy applications omitting the new fields still work. The existing limit is five application attempts per hour/IP; duplicate pending email returns `409`, and missing adulthood confirmation returns `400 age_required`. A successful receipt confirms review-queue storage, not acceptance or email delivery.

## Public editorial HTML

`GET /casting` · `GET /casting/:state` · `GET /blog` · `GET /blog/:slug` · `GET /cam-model-guide` · `GET /robots.txt` · `GET /sitemap.xml`. These are HTML/crawler routes rather than JSON APIs. Unknown state/article slugs return `404`. Trailing-slash casting/journal URLs redirect permanently to the canonical path while retaining query attribution. State pages awaiting developed local guidance use both HTML and HTTP `noindex` directives and are omitted from the sitemap. `SITE_URL` configures the canonical public origin.

Partner application links use existing `/go/p/apply_broadcaster` or available Admin affiliate placements, with `s=casting_<state>[_<utm_source>]` and optional `c=<utm_campaign>`. The existing partner track-tag length/character limit still applies. Internal Admin traffic keeps the source and campaign separately; an exit click does not confirm an external registration.

## Auth & account
`POST /api/auth/register { email, name, password, adult:true, ref? }` · `POST /api/auth/login` · `POST /api/auth/logout` · `POST /api/auth/password { current, next }` · `GET /api/me` · `POST /api/me/avatar` (multipart `file`) · `GET /api/me/history` · `POST /api/reports { targetType, targetId, reason }`

## Fan economy (`/api/econ`, signed in)
| POST | Body | Result |
|---|---|---|
| `/daily` | — | Day reward, streak, level-ups, free box on day 7 |
| `/watch` | `{ seconds }` | Heartbeat (≤ 75 s counted) |
| `/watch/claim` | `{ i }` | Opens chest i |
| `/gift` | `{ creatorId, giftId, qty }` | Deducts diamonds, credits beans, broadcasts over WS, adds PK points and family points |
| `/store/buy` · `/equip` | `{ itemId }` · `{ slot, itemId\|null }` | Cosmetics |
| `/vip` · `/vip/rebate` | `{ tier }` | VIP purchase/renewal, daily rebate |
| `/gacha` | `{ boxId, count: 1\|10 }` | Results with rarity, pity state |
| `/event/claim` | — | Weekly event reward |
| `/limits` | `{ dailyCapUsd }` | Lowering is immediate; raising waits for the cooldown |
| `/purchase` | `{ packId }` | `PAYMENTS_MODE=test` credits instantly |

Every response includes `econ`: the full economy summary (balance, level, VIP, daily, watch, event, inventory, equipped, limits).

## Creator Studio (`/api/studio`, role creator; admins can pass `?as=<creatorId>`)
`GET /` (profile, uploads, products, payouts, analytics) · `PUT /profile` · `POST /live { live }` (needs KYC) · `POST /upload` (multipart `file`, `kind`: avatar\|cover\|gallery\|story\|product, `caption`) · `PATCH /upload/:id { caption }` · `DELETE /upload/:id` · `POST|PUT|DELETE /products[/:id]` · `POST /pin { productId }` · `POST /convert { beans }` · `POST /payout { beans, method }` (needs KYC; minimum and weekly cap apply)

## Paid employer directory

Public: `GET /api/directory/jobs?q=&category=&state=&workMode=&page=&pageSize=` → `{jobs,total,page,pageSize,pages}`; `GET /api/directory/jobs/:id` → `{job}`. Results require approved/open content, active employer/nonbanned owner, paid unrefunded order, activation and future expiry. Test ads appear only in explicit development test mode. Applicants browse and send `POST /api/directory/jobs/:id/inquiries {message,portfolioUrl?}` free while signed in. Duplicate/self/closed/unavailable and unsafe portfolio requests are rejected; contact/message data stays private.

Employer capability is separate from `users.role`; a normal signed-in account can create a company profile:

| Method | Path | Body / response |
| --- | --- | --- |
| GET | `/api/employer` | `{profile,listings,orders,plan,billingMode}`; private no-store |
| PUT | `/api/employer/profile` | `{companyName,website?,location?,state?}` → `{profile}` |
| POST | `/api/employer/listings` | `{title,description,category,workMode,location,state,compensation}` → `{listing}` draft |
| PUT | `/api/employer/listings/:id` | Listing fields → `{listing}`; resets content review |
| POST | `/api/employer/listings/:id/submit` · `/close` | Request review / hide listing → `{listing}` |
| DELETE | `/api/employer/listings/:id` | Archive, retain inquiry history → `{ok:true}` |
| POST | `/api/employer/listings/:id/orders` | Approved submitted listing → `{order}` at server price; caller price/payment/expiry flags ignored |
| POST | `/api/employer/orders/:id/test-pay` | Explicit development test receipt only → `{order}` |
| POST | `/api/employer/orders/:id/cancel` | Owner's unpaid invoice only → `{order}`; no funds moved |
| GET | `/api/employer/listings/:id/inquiries` | Owner-private `{inquiries}` |
| PATCH | `/api/employer/listings/:id/inquiries/:inquiryId` | `{status:new|reviewing|closed}` → `{inquiry}` |

Admin-only routes under `/api/admin/employer-directory`:

- `GET /` → `{settings,employers,listings,orders,metrics}` with separate recorded live/test fees and bounded actionable queues.
- `GET /lookup?type=listing|order|employer&id=...` retrieves any exact historical/current record for Admin action beyond those queues, returning `{listing}`, `{order}` or `{profile}`.
- `PUT /settings {priceCents,currency:'USD',durationDays,invoiceInstructions,enabled}` changes future invoices; billing mode comes from server configuration.
- `POST /listings/:id/review {decision:'approved'|'rejected',note?,reviewToken}` binds approval to the current reviewed content hash; missing/stale token fails.
- `POST /orders/:id/confirm {reference,amountCents,currency}` records a manual-mode live receipt matching the immutable invoice snapshot. Unique reference and idempotent replay; not a card charge.
- `POST /orders/:id/refund {reference,note?}` records an off-platform full refund and removes that invoice’s paid access; no automatic transfer.
- `POST /employers/:id/status {status:'active'|'suspended'}` controls employer directory access.

Plan fields include `priceCents,currency,durationDays,invoiceInstructions,enabled,billingMode,available,testPaymentsAllowed`. `available` governs **new orders**; `testPaymentsAllowed` separately governs existing test receipts. Order fields include immutable `priceCents,currency,durationDays,invoiceInstructions`, status/test/reference, and activation/expiry. Employer listing statuses are draft/open/closed/archived with separate pending/approved/rejected review. Invoice statuses are pending/paid/cancelled/refunded. Current pending/active records are prioritized within bounded owner/Admin views. Listing term starts once payment and approval permit initial publication; replays, edits, reapproval and reopening do not extend it. New order after expiry is a renewal. Old test orders are hidden and replaced appropriately when switching to manual billing.

HTML routes: `/jobs`, `/jobs/:id` and `/employers`. No applicant fee, mail delivery, automatic acceptance, hosted card checkout or automatic refund is performed.

## Talent network

Public JSON routes use `Cache-Control: no-store` and never return account emails, applicant messages, identity documents, billing receipts or owner IDs:

| Method | Path | Result |
|---|---|---|
| GET | `/api/network/talent?q=&state=&intent=&page=&pageSize=` | `{talent,total,page,pageSize,pages}`; approved creators with active nonbanned owners; `intent` is blank, `hiring` or `available` |
| GET | `/api/network/talent/:id` | `{creator,jobs}` metadata plus current public board posts; unknown/hidden creator `404` |
| GET | `/api/network/opportunities?q=&state=&location=&kind=&category=&workMode=&page=&pageSize=` | `{jobs,total,page,pageSize,pages}` from open unexpired free star boards; each job adds public creator metadata |
| GET | `/api/network/companies?q=&state=&page=&pageSize=` | `{companies,total,page,pageSize,pages}`; only identities from currently eligible paid/reviewed employer openings |
| GET | `/api/network/companies/:id` | Public company listing snapshot and eligible jobs; no current paid opening means `404` |

All searches use scalar bounded values, literal text matching and stable pagination (page 1–1000, pageSize 1–50). Unknown filter values or malformed IDs return `400`. Talent metadata includes `id,name,niche,tags,bio,networkCity,networkState,live,demo,availableCount,hiringCount,opportunityCount,profileUrl,boardUrl`. Opportunity `kind` remains `hiring` or `available`; collaborations use `category=collaboration`. Opportunity state refers to the posting creator's optional self-declared state; location searches the post's broad location and creator's public city. Paid employer state continues to refer to the reviewed listing.

Existing `GET /api/studio` now supplies `networkStates:[{slug,name}]`. `PUT /api/studio/profile` additionally accepts `networkCity` (optional string ≤80, blank clears) and `networkState` (blank or known U.S. state, normalized to slug). Defaults are blank, and updates keep existing creator/Admin `?as=` ownership rules. The fields appear only in authorized Studio responses and the owner-gated network metadata, rather than weaker legacy creator endpoints. No location is inferred or separately verified.

HTML routes: `/network`, `/talent`, `/talent/:id`, `/opportunities`, `/companies`, `/companies/:id`. Trailing-slash redirects preserve query strings. Free profile opportunities link to `/stars/:id/jobs#job-<id>` for existing private inquiries; paid jobs link to `/jobs/:id`. No new message-delivery service or payment integration is introduced.

## Per-star jobs boards

Public fields: `{ id, creatorId, kind, title, description, category, workMode, location, compensation, status, expiresAt, createdAt, updatedAt }`. `kind` is `hiring` or `available`. Categories: `editing`, `moderation`, `design`, `photography`, `collaboration`, `other`. `workMode`: `remote`, `hybrid`, `onsite`. No public response includes applicant contacts or messages.

| Method | Path | Result |
|---|---|---|
| GET | `/api/creators/:id/jobs` | `{jobs}`: open, unexpired listings from an approved, nonbanned owner; unknown/unavailable creator is `404` |
| POST | `/api/jobs/:id/inquiries` | Signed in; `{message, portfolioUrl?}` → `201 {ok:true,inquiry}`; account name/email shared privately with owner/Admin |
| GET | `/api/studio/jobs` | Owner/Admin `{jobs}` including drafts/closed/archived and private `inquiryCount`; up to 100, nonarchived first |
| POST | `/api/studio/jobs` | Listing fields → `201 {job}`; default status `draft`, default expiry 30 days |
| PUT | `/api/studio/jobs/:id` | Partial listing fields → `{job}`; owner only; reopening needs future expiry |
| DELETE | `/api/studio/jobs/:id` | Archives; retains inquiries; returns `{ok:true}` |
| GET | `/api/studio/jobs/:id/inquiries` | Owner/Admin `{inquiries}` with applicant account name/email, message, portfolio link and review status |
| PATCH | `/api/studio/jobs/:id/inquiries/:inquiryId` | `{status:"new"|"reviewing"|"closed"}` → `{inquiry}`; owner-scoped listing and inquiry |
| GET | `/stars/:id/jobs` | Public non-graphic HTML board, including offline stars; `noindex,follow`, no media or applicant data |

Studio requests support Admin `?as=<creatorId>`; creator accounts always resolve to their own profile. Listing IDs are scoped to the resolved creator. Archive retains data and rejects later editing; use a new listing when needed. Limits: title 3–100, description 20–3000, compensation 3–160 characters; location at most 100 and required (2+) for hybrid/on-site. `expiresAt` is an integer timestamp in the future within 180 days when supplied. Open listings require future expiry. Maximum 20 nonarchived listings per star. Inquiry message is 10–2000 characters; optional portfolio URL is at most 500 characters, HTTPS, without credentials. Inquiry limit is 20 attempts/hour/IP and 100 accepted inquiries/listing. Duplicate inquiry returns `409 already_inquired`; closed/expired listings return `409 listing_closed`; self-inquiry is `400`. Private responses use `Cache-Control: no-store`. No mail delivery, applicant acceptance, payment or external forwarding is performed.

## Agency (role agent)
`GET /api/agency` · `POST /api/agency/payout { beans, method }`

## Admin (`/api/admin`, role admin)
`GET /overview` · `GET /applications?status=` · `POST /applications/:id { status }` (approval returns `tempPassword` for new accounts) · `GET /users?q=&role=` · `POST /users/:id { role?, banned?, grantDiamonds?, grantItem?, reason? }` · `GET /creators` · `POST /creators/:id { status?, kyc?, featured?, live?, baseViewers? }` · `GET /uploads?status=` · `POST /uploads/:id { status, reason? } | { delete:true }` · `GET /payouts?status=` · `POST /payouts/:id { status, note? }` · `GET /reports` · `POST /reports/:id` · `GET /traffic?days=` · `GET|PUT /config { overrides }` · `GET /ledger` · `GET /audit`

## WebSocket `/ws`
Server → client: `hello`, `chat`, `gift`, `enter`, `pk`, `error`. Client → server: `{ type:'join', room }`, `{ type:'chat', room, text }` (signed in, rate-limited, earns chat XP), `{ type:'ping' }`.

Gift message: `{ type:'gift', id, site:'X3', room, user, giftId, qty, diamonds, fx, level, vip, cosmetics }`.

To merge external sites (Chaturbate, Stripchat, …) into the same stream, run a relay that turns each site's event feed into `chat` / `tip` messages (`{ type:'tip', site:'CB', room, user, amount, text }`) and broadcasts them through `server/ws.js` → `broadcast()`.
