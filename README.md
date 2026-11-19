# Adult-X3star

**x3STAR** is a gamified adult live-cam platform: a dark, luxury fan app, a creator coin exchange, creator stores, and a Bigo-style economy (diamonds, gifts, levels, VIP, PK battles, mystery boxes, families), plus a **Creator Studio** and an **Admin dashboard**. It all runs on one Node server with SQLite. There is no build step and no frontend framework.

> 18+ only. All performers must complete ID and age verification before streaming. Read [Compliance](#compliance-before-launch) before going live.

## What's in the box

**Fan app** (`/`)
- Live floor with hover-preview profile cards, a per-creator coin with sparkline, and a unified multi-site chat
- **Gamification:** cinematic intro splash → 7-day check-in streak → watch-time chests on a floating timer → level-ups (1–99) with full-screen celebrations
- **Gifts:** 14 gifts from 💎1 to 💎19,999, ×1/×10/×66/×99/×520/×1314 quick quantities, **combo** button, floating / burst / banner / full-screen effects, room-wide marquees for big gifts
- **PK battles** between live creators (server-run rounds, live score bar, MVPs, WIN stamp, cooldown timer)
- **Rewards center:** diamond store (2× first top-up, rotating flash pack with countdown), **VIP** tiers with 40% renewals and daily rebates, **mystery boxes** with published odds and pity, **cosmetics shop** (view/camera filters, avatar frames, chat bubbles, entrance effects, name colours, badges), weekly event, level road
- Entrance banners, VIP/level badges and cosmetics in chat; a filter selector on the live stage; guest queue
- **Families** (fan clans) with weekly war points and ×1.5 war hours
- **24h Stories** rail and a vertical **Clips** feed with in-feed gifting and sponsored slots
- Creator pages with gallery, store, top gifters, tip menu, schedule and "Also live on" affiliate links
- Everything from the original build: exchange terminal, leaderboards, creator stores and cart, private-show booking, blog and member lounge, rewarded ads, campaign tracking, legal page templates

**Creator Studio** (`/studio`)
- Analytics: beans (14-day), when fans gift (by hour), top fans, best gifts, host-tier progress
- Profile editor: name, ticker, niche, tags, bio, colours, tip menu, goal, weekly schedule, other-site usernames
- **Uploads:** avatar, cover, gallery, 24h stories and product images, with drag-and-drop, progress bars and moderation status
- Store manager with product images and "pin to live stage"
- Earnings: payouts (minimum + weekly cap, gated on KYC) and beans → diamonds conversion
- Go-live toggle (KYC-gated) and **camera preview with owned filters**
- Agency view for agents (hosts, commission, payouts)

**Admin** (`/admin`)
- Overview: KPIs, queues, 14-day signups / gifts / revenue, top creators and gifters
- Applications (approval creates the account and shows a one-time temporary password), users (role, ban, grant diamonds/items), creators (status, KYC, live, featured, viewer baseline, "open their Studio")
- **Content moderation** queue: nothing a creator uploads is public until approved
- **Partners**: your Chaturbate affiliate links (program, campaign code, your room, every placement on the site with its live URL and click count)
- Payouts, reports, affiliate **traffic** analytics, the full **economy editor** (quick fields, affiliate URL templates, JSON overrides with validation), ledger, audit log

## Quick start

Requires **Node.js 22.13+**, which ships `node:sqlite`.

```bash
git clone https://github.com/Cyptopimpinainteazy/Adult-X3star.git
cd Adult-X3star
cp .env.example .env        # set ADMIN_EMAIL / ADMIN_PASSWORD
npm install
npm start                   # http://localhost:8080
```

On first start the server creates the admin account. With `SEED_DEMO=1` it also seeds 16 demo creators, demo fans with 14 days of gift history, three families and an agent, and prints the demo logins once:

| Role | Login |
|---|---|
| Admin | `ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| Fan (5,000 💎) | `fan@demo.x3star.local` |
| Creator | `luna@demo.x3star.local` (also `raven@`, `sable@`, …) |
| Agent | `agent@demo.x3star.local` |

The demo password is `DEMO_PASSWORD`, or a random one printed in the console. Every demo row is flagged `demo=1`.

```bash
npm test                    # 22 tests: economy engine + end-to-end API
npm run dev                 # restart on file changes
npm run build:standalone    # dist/x3star-standalone.html — fan app as one offline file
```

## Architecture

```
shared/economy.js     Rules engine (UMD): diamonds, XP, VIP, daily, chests, gifts, boxes, purchases,
                      events, host tiers, agency, family wars. Server = authoritative, browser = offline mode.
server/
  index.js            Express app, security headers + CSP, same-origin guard, boot-data injection, /go links
  db.js               SQLite schema (users, sessions, creators, uploads, products, gifts, orders, payouts,
                      families, applications, reports, clicks, audit, settings)
  auth.js             scrypt passwords, opaque session tokens, role guards, rate limiting
  services.js         Economy config (defaults + admin overrides), per-user state transactions, mapping
  uploads.js          multer storage, type allow-list, magic-byte check, moderated serving
  ws.js               Realtime hub: chat, gifts, entrances, PK rounds, optional demo traffic
  routes/             public · econ · studio · social (families, PK, agency) · admin
  seed.js             First-run admin + demo data
public/
  index.html          Fan app (core UI)        assets/game.js + game.css   Gamification layer
  studio.html         Creator Studio           assets/studio.js
  admin.html          Admin dashboard          assets/admin.js
  assets/api.js       Fetch client             assets/dash.js + dash.css   Dashboard helpers
docs/ECONOMY.md       Every number and loop    docs/API.md                 Endpoints + WS protocol
```

The server injects `window.X3STAR_BOOT` (live creators, the signed-in user, economy config) into the fan app. Without it, as in the standalone file or a static host, the app runs in **local mode**: the same rules engine, with state in `localStorage` and simulated chat and PK traffic.

## Configuration

See [`.env.example`](.env.example). The important ones:

| Variable | Default | |
|---|---|---|
| `PAYMENTS_MODE` | `test` | `test` credits diamond purchases instantly and flags orders `test=1`. `disabled` blocks purchases. |
| `AUTO_APPROVE_UPLOADS` | `0` | Keep at 0 so every upload goes through moderation |
| `DEMO_TRAFFIC` | `1` | Simulated chat, gifts and entrances so rooms feel alive. **Turn off in production.** |
| `SEED_DEMO` | `1` | Seed demo data into an empty database |
| `COOKIE_SECURE`, `TRUST_PROXY` | prod: on | Set behind a TLS-terminating proxy |
| `DATA_DIR` | `./data` | SQLite database + uploads. **Back this up.** |

All economy values (prices, odds, rewards, payout rates, affiliate links) are edited live in **Admin → Economy**.

### Chaturbate affiliate links

Your Chaturbate linking codes are built in (`shared/partners.js`): all three programs (Revshare, Pay per sign-up, Tokens) with campaign `Ji03i` and your room `cock_da_hammer`. The default program is **Revshare**; switch it in **Admin → Partners**.

- **Where links appear:** footer "More live cams" (Female, Couple, Trans, Male, your room, Join free), one partner creative in each ad slot's rotation (marked *Partner*), and "Broadcast on Chaturbate too" under the creator application. Creators who enter their Chaturbate room in Studio → Profile also get an "Also live on Chaturbate" link on their profile.
- **Counting:** every link goes through `/go/p/<placement>` or `/go/CB/<creator>`, so the click is logged in Admin → Traffic before the redirect.
- **Chaturbate stats:** each link carries `track=<source>_<placement>` (e.g. `reddit-spring_footer_female`), so your Chaturbate affiliate stats break down by where on the site the click came from and which campaign brought the visitor. Change the format in Admin → Partners.
- If a program doesn't offer a link type (Tokens has no join pages, for example), the nearest one it does offer is used and Admin → Partners says which.

### BongaCams videos and links

- **Videos page** (`#videos`, linked from Clips and the footer): teaser clips from your BongaCams video export (affiliate ID `846478`), with hover-scrub previews, tag chips and per-performer filtering. Each click goes through `/go/v/<id>` (counted in Admin → Traffic → Top partner videos) and then to the clip's own tracking link.
- **Feed file:** `seed/partner-feeds/bongacams-videos.txt` is imported automatically on first start. Import newer exports in **Admin → Partners → BongaCams video feed** or with `npm run import:feed -- file.txt`. Re-imports update clips and keep your hide choices.
- **Content filter:** clips whose title or tags imply a minor or non-consent (schoolgirl, teen, step-family, forced, asleep…) are never imported; the importer lists what it skipped.
- **Creator links:** "Also live on BongaCams" uses `https://bongacams.com/track?c=846478&csurl=…/{room}` by default (Admin → Economy → Affiliates).

## Going to production

1. Run behind a TLS proxy (Caddy, nginx or Cloudflare) with `NODE_ENV=production`, `COOKIE_SECURE=1` and `TRUST_PROXY=1`. Forward WebSocket upgrades on `/ws`.
2. Set `DEMO_TRAFFIC=0` and `SEED_DEMO=0`, and delete demo rows (`demo=1`) if you seeded them.
3. **Payments:** add a provider in `server/routes/econ.js`. The order flow is already split into create-order → `fulfilOrder(orderId, extRef)`. Call `fulfilOrder` only from your provider's verified webhook. Use a processor that accepts adult merchants (high-risk MCC 5967).
4. **Streaming:** the stage shows each creator's approved preview clip. Live video needs a media server (for example an RTMP/WebRTC SFU). Point creators' encoders at it and swap the stage `<video>` source for the HLS/WebRTC URL.
5. **External chat:** add a relay that normalises each site's event feed into the WS message format (see `docs/API.md`) and calls `broadcast()`.
6. Back up `DATA_DIR`, rotate the admin password, and review rate limits for your traffic.

## Compliance before launch

This codebase has hooks for compliance but does not make you compliant. Before launch:

- **Age and ID verification** for every performer (an integration with a KYC provider), and **18 U.S.C. § 2257** record-keeping. Fill in the custodian of records on the Legal page.
- **Age verification for viewers** where required by law (several US states, the UK and others mandate more than a click-through gate).
- Counsel-reviewed **Terms, Privacy and DMCA** text. The Legal page ships as a clearly marked template.
- Payment-processor content and chargeback rules.
- **Paid mystery boxes:** odds disclosure is built in, but some jurisdictions restrict or ban paid loot boxes. You can make boxes earned-diamonds-only in those regions.
- Moderation staffing: the upload queue, reports and payout approvals are all manual by design.

## Roadmap

- Payment provider integrations (card + crypto) on the existing order/fulfilment flow
- Media server integration for real live video, **multi-guest** rooms and **audio-only** live
- Chat relays for Chaturbate / Stripchat / BongaCams / CAM4 event APIs
- 3D/V-Tuber avatar streaming and AR beauty filters on the broadcast side
- Push notifications for reminders, creator alerts and family wars

## License

Proprietary. All rights reserved.
