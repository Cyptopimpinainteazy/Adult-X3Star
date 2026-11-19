# x3STAR economy

All rules live in one file, [`shared/economy.js`](../shared/economy.js). The server runs it as the source of truth, and the browser runs the same file in offline/standalone mode. Every number below can be changed in **Admin → Economy**, either with the quick fields or with JSON overrides merged over `DEFAULT_CONFIG`.

## Currencies

| Currency | Who holds it | How it's earned | How it's spent |
|---|---|---|---|
| 💎 Diamonds | Fans (and creators' fan wallets) | Purchase packs, daily check-in, watch-time chests, level-ups, weekly event, mystery-box drops, VIP daily rebate, creator bean conversion, admin grants | Gifts, VIP, mystery boxes, cosmetics, creating a family |
| Beans | Creators, agents | 1 bean per diamond gifted (`beansPerDiamond`), plus the host-tier bonus | Cash out at `beanUsd` (default $0.008, i.e. 125 beans = $1), or convert to diamonds |
| XP | Fans | Watching (`perWatchMinute`), gifting (1 XP per diamond), chatting (daily cap), check-ins | Levels 1–99; each level pays `diamondsPerLevel × level`; milestones unlock cosmetics |
| Site tokens / $X3STAR | Unchanged from the original build | Tips via connected sites; creator-coin exchange | Tips and coin trading |

## Retention loops

- **Daily check-in:** a 7-day ladder (10 → 100 💎). Day 7 opens a free Velvet Box. Missing a day resets the streak. The intro splash leads straight into the check-in modal.
- **Watch-time chests:** 7 chests unlock after 1, 3, 5, 10, 20, 40 and 60 minutes of active viewing per day. Time only counts while the tab is visible and the user has interacted in the last 2 minutes. The server accepts at most 75 seconds per heartbeat and caps the day at 240 minutes.
- **Levels:** XP for level L is `round(base × L^exp)` with base 60 and exp 1.45. Level-ups trigger a full-screen animation and pay out immediately.
- **Weekly event:** "Neon Week". Gift 520 💎 in a Monday–Sunday week to earn 100 💎 and a badge.
- **Combos:** sending the same gift again within 3.2 s builds a ×N combo with escalating effects.
- **PK battles:** two live creators go head to head for 3 minutes, scored by gifts, with MVPs, a WIN stamp and a 20-second cooldown. Rounds run on the server.
- **Families:** fan clans. Creating one costs 2,000 💎. Family gifts earn weekly war points, and gifts during war hours (20:00–22:00 local) count ×1.5.
- **Guest queue:** fans queue to be picked by the creator, and VIPs jump the line. The UI is in place; the actual video call needs streaming infrastructure (see the roadmap).

## Monetisation

- **Diamond packs:** six packs from $0.99 to $99.99 with bonus diamonds. The **first purchase is doubled**. A rotating **flash pack** gets +20% for each 6-hour window, with a countdown.
- **VIP:** VIP, VIP+ and Black VIP at 1,200 / 4,800 / 19,800 💎 for 30 days. Perks include a badge, chat bubble, entrance banner, +10/25/50% on daily and chest diamonds, a daily rebate, exclusive gifts (Velvet Crown, Galaxy) and frames. **Renewing within 3 days of expiry costs 40%** of list price, Bigo's renewal hook.
- **Mystery boxes:** Velvet (60 💎) and Black (300 💎), each with a ×10 discount. **Drop rates are published** in the box UI and via `/api/config`. Pity guarantees an epic and a legendary within a set number of pulls, and duplicates refund diamonds.
- **Cosmetics:** view and camera **filters**, avatar frames, chat bubbles, entrance effects, name colours and badges. Some are for sale, some come only from boxes, VIP, levels or events.
- **Host tiers:** Rising, Official (+5%), Star (+10%) and Icon (+15%) bonus beans on every gift, based on beans earned in the last 30 days. The platform funds the bonus.
- **Agency:** agents earn `agencyCommissionPct` (default 20%) of their recruited hosts' gift beans. The platform funds this too; it is never deducted from hosts.
- **Affiliate go-links:** "Also live on" buttons route through `/go/<site>/<creator>`, log the click with its campaign, and forward to your affiliate URL template.

## Default unit economics

A fan buys 980 + 120 bonus 💎 for $14.99, about $0.0136 per diamond. A creator receives 1 bean per diamond gifted, worth $0.008. So with default settings the creator earns roughly **59% of what the fan paid per gifted diamond**, before host-tier bonus and before payment-processor fees. Change `beanUsd` to move that split.

## Spending safeguards (built in)

- **Daily purchase cap per user:** $200 by default. Users can lower it instantly; raising it takes effect after a 24-hour cooldown.
- **Odds disclosure** for every mystery box and **pity counters** shown to the user.
- **Purchase history** at `/api/me/history`, and a `TEST MODE` label whenever purchases aren't charged.

Loot boxes bought with real money are restricted or banned in some jurisdictions (for example Belgium). Check local rules before turning on paid boxes in those regions. One option is to set box `cost` so boxes can only be bought with earned diamonds.
