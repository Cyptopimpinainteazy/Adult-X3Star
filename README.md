# Adult-X3Star

Hybrid adult + crypto platform. Reels → age-gated bridge → tracked Chaturbate Revshare + multi-network CPA offers, with creator coins, dropship, and unified chat.

## Current stack

- **Frontend**: `frontend/x3star_landing.html` — production-grade landing with live room grid, hover video previews, niches, profiles, unified chat/tips, coin exchange, dropship, age gate.
- **Attribution**: Hydra track scheme (`track=hydra_reel_[niche]` + unique `sid` UUID).
- **Postbacks**: `backend/postback-webhook.js` — click recorder + Chaturbate (or any) postback receiver with niche stats.
- **Proxy**: `backend/cb-proxy-example.js` — CORS proxy for Chaturbate Users Online API v2.
- **Funnel docs**: `docs/x3star_reels_funnel.md` — locked Reels conversion architecture, tour codes, niche recommendations.

## Campaign

- Chaturbate Revshare (campaign `Ji03i`)
- Primary tours: `6hnx`, `gLDS`, `EuIR`, `JpRf`
- Track format: `hydra_reel_[niche]`

## Quick start

```bash
# Postback webhook
node backend/postback-webhook.js

# Chaturbate rooms proxy
node backend/cb-proxy-example.js
```

Open `frontend/x3star_landing.html` locally or serve it.

## Repo

https://github.com/Cyptopimpinainteazy/Adult-X3Star
