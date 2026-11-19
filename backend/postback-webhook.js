/**
 * x3STAR Postback Webhook + Click Recorder
 * 
 * 1. Bridge calls POST /api/click when generating a hydra link
 * 2. Set this as your Chaturbate postback URL:
 *    https://yourdomain.com/api/postback?sid={sid}&amount={amount}&track={track}&event={event}&username={username}
 */

const express = require('express');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory stores (swap for Redis/Postgres in production)
const clicks = new Map();      // sid -> click data
const conversions = new Map(); // sid -> conversion

// Record click from bridge
app.post('/api/click', (req, res) => {
  const { sid, niche, tour, creator, source } = req.body;
  if (!sid) return res.status(400).json({ error: 'sid required' });

  clicks.set(sid, {
    sid,
    niche: niche || null,
    tour: tour || null,
    creator: creator || null,
    source: source || 'bridge',
    createdAt: Date.now()
  });

  console.log('[CLICK]', sid, niche);
  res.json({ ok: true, sid });
});

// Postback receiver (Chaturbate fires GET or POST)
function handlePostback(req, res) {
  const q = { ...req.query, ...req.body };
  const { sid, amount, track, event, username } = q;

  if (!sid) {
    console.warn('[POSTBACK] missing sid', q);
    return res.status(400).send('missing sid');
  }

  const click = clicks.get(sid) || {};
  const niche = click.niche || (track ? String(track).replace(/^hydra_reel_/, '') : null);

  const conversion = {
    sid,
    amount: parseFloat(amount) || 0,
    track: track || null,
    event: event || 'conversion',
    username: username || null,
    niche,
    creator: click.creator || null,
    tour: click.tour || null,
    receivedAt: Date.now()
  };

  conversions.set(sid, conversion);
  console.log('[POSTBACK]', conversion);

  // TODO: 
  // - credit creator coin balance
  // - update niche performance stats
  // - persist to database
  // - optionally notify via WebSocket

  res.status(200).send('OK');
}

app.get('/api/postback', handlePostback);
app.post('/api/postback', handlePostback);

// Stats for dashboard
app.get('/api/stats', (req, res) => {
  const byNiche = {};
  let totalRevenue = 0;

  for (const c of conversions.values()) {
    const n = c.niche || 'unknown';
    if (!byNiche[n]) byNiche[n] = { conversions: 0, revenue: 0 };
    byNiche[n].conversions++;
    byNiche[n].revenue += c.amount;
    totalRevenue += c.amount;
  }

  res.json({
    clicks: clicks.size,
    conversions: conversions.size,
    totalRevenue,
    byNiche,
    recent: Array.from(conversions.values()).slice(-20).reverse()
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`x3STAR Postback webhook on :${PORT}`);
  console.log(`Postback URL: http://localhost:${PORT}/api/postback?sid={sid}&amount={amount}&track={track}&event={event}`);
});
