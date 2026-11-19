// Simple Node.js Express proxy for Chaturbate Users Online API
// Run: node cb-proxy-example.js
// Then point the frontend fetch to http://localhost:3001/api/rooms

const express = require('express');
const fetch = require('node-fetch'); // or native fetch in Node 18+
const app = express();
const PORT = 3001;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.get('/api/rooms', async (req, res) => {
  try {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '8.8.8.8';
    const url = `https://chaturbate.com/api/public/affiliates/onlinerooms/?wm=Ji03i&format=json&gender=f&limit=12&client_ip=${encodeURIComponent(clientIp)}`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; x3STAR/1.0)' }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Proxy failed', details: err.message });
  }
});

app.listen(PORT, () => console.log(`x3STAR CB Proxy running on http://localhost:${PORT}/api/rooms`));
