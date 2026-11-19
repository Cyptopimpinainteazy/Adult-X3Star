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
| POST | `/api/apply` | Creator/agent application `{ email, stage, niche, hours, sites[], note, adult:true, agentCode? }` |
| GET | `/go/:site/:creator?c=&s=` | Logs a click on a creator's "Also live on" link and redirects (302). Chaturbate uses the partner config; other sites use their URL template |
| GET | `/go/p/:placement?c=&s=` | Logs a click on a site partner placement (footer, partner ad, apply page) and redirects (302) to the Chaturbate affiliate URL |

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

## Agency (role agent)
`GET /api/agency` · `POST /api/agency/payout { beans, method }`

## Admin (`/api/admin`, role admin)
`GET /overview` · `GET /applications?status=` · `POST /applications/:id { status }` (approval returns `tempPassword` for new accounts) · `GET /users?q=&role=` · `POST /users/:id { role?, banned?, grantDiamonds?, grantItem?, reason? }` · `GET /creators` · `POST /creators/:id { status?, kyc?, featured?, live?, baseViewers? }` · `GET /uploads?status=` · `POST /uploads/:id { status, reason? } | { delete:true }` · `GET /payouts?status=` · `POST /payouts/:id { status, note? }` · `GET /reports` · `POST /reports/:id` · `GET /traffic?days=` · `GET|PUT /config { overrides }` · `GET /ledger` · `GET /audit`

## WebSocket `/ws`
Server → client: `hello`, `chat`, `gift`, `enter`, `pk`, `error`. Client → server: `{ type:'join', room }`, `{ type:'chat', room, text }` (signed in, rate-limited, earns chat XP), `{ type:'ping' }`.

Gift message: `{ type:'gift', id, site:'X3', room, user, giftId, qty, diamonds, fx, level, vip, cosmetics }`.

To merge external sites (Chaturbate, Stripchat, …) into the same stream, run a relay that turns each site's event feed into `chat` / `tip` messages (`{ type:'tip', site:'CB', room, user, amount, text }`) and broadcasts them through `server/ws.js` → `broadcast()`.
