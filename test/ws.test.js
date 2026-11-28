'use strict';
/* Real HTTP/WebSocket sessions against an isolated SQLite database. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocket } = require('ws');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'x3star-ws-auth-'));
const demoPassword = crypto.randomBytes(24).toString('hex');
Object.assign(process.env, {
  DATA_DIR: dataDir, DB_FILE: path.join(dataDir, 'test.db'), NODE_ENV: 'test',
  SEED_DEMO: '1', DEMO_TRAFFIC: '0', DEMO_PASSWORD: demoPassword,
  ADMIN_EMAIL: 'admin@ws.test', ADMIN_PASSWORD: crypto.randomBytes(24).toString('hex'),
  COOKIE_SECURE: '0', PAYMENTS_MODE: 'disabled', TRUST_PROXY: '0'
});
const { start } = require('../server/index');
const sockets = new Set();
let server, base;
let accountCount = 0;

function socket(headers) {
  const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws', { headers });
  sockets.add(ws);
  ws.once('close', () => sockets.delete(ws));
  return ws;
}

function rejectedUpgrade(origin) {
  return new Promise((resolve, reject) => {
    const ws = socket({ Origin: origin });
    const timer = setTimeout(() => { ws.terminate(); reject(new Error('Upgrade timed out')); }, 3000);
    ws.on('error', () => {});
    ws.once('unexpected-response', (_request, response) => {
      clearTimeout(timer);
      response.resume();
      ws.terminate();
      resolve(response.statusCode);
    });
    ws.once('open', () => {
      clearTimeout(timer);
      ws.terminate();
      reject(new Error('Cross-origin WebSocket upgrade was accepted'));
    });
  });
}

function message(ws, predicate) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); ws.off('message', receive); ws.off('error', failed); };
    const failed = error => { cleanup(); reject(error); };
    const receive = raw => {
      const data = JSON.parse(raw);
      if (predicate(data)) { cleanup(); resolve(data); }
    };
    const timer = setTimeout(() => failed(new Error('WebSocket message timed out')), 3000);
    ws.on('message', receive);
    ws.on('error', failed);
  });
}

async function connect(cookie, origin = base) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (origin !== null) headers.Origin = origin;
  const ws = socket(headers);
  const hello = await message(ws, data => data.type === 'hello');
  return { ws, hello };
}

async function request(method, url, body, cookie) {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(base + url, { method, headers, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

async function account() {
  const number = ++accountCount, password = crypto.randomBytes(24).toString('hex');
  const created = await request('POST', '/api/auth/register', {
    email: `ws${number}@session.test`, name: `ws_user_${number}`, password, adult: true
  });
  assert.equal(created.status, 201);
  return { cookie: created.cookie, user: created.data.user, password };
}

test.before(async () => {
  require('../server/seed').seed({ quiet: true });
  server = await start(0, '127.0.0.1');
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  for (const ws of sockets) ws.terminate();
  if (server) await new Promise(resolve => server.close(resolve));
  require('../server/db').db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('WebSocket upgrades reject foreign, opaque and malformed browser origins', async () => {
  for (const origin of ['https://hostile.example.test', base.replace('http:', 'https:'), 'null', 'not-an-origin']) {
    assert.equal(await rejectedUpgrade(origin), 403);
  }
});

test('same-origin browsers and originless clients can connect and valid sessions can chat', async () => {
  const browser = await connect();
  assert.equal(browser.hello.user, null);
  const guest = await connect(null, null);
  assert.equal(guest.hello.user, null);
  const user = await account();
  const { ws, hello } = await connect(user.cookie);
  assert.equal(hello.user.name, user.user.name);
  const reply = message(ws, data => data.type === 'chat' || data.type === 'error');
  ws.send(JSON.stringify({ type: 'chat', text: 'Authenticated session' }));
  const chat = await reply;
  assert.equal(chat.type, 'chat');
  assert.equal(chat.user, user.user.name);
});

test('logging out revokes chat permission on an already-open WebSocket', async () => {
  const user = await account();
  const { ws } = await connect(user.cookie);
  assert.equal((await request('POST', '/api/auth/logout', {}, user.cookie)).status, 200);
  const reply = message(ws, data => data.type === 'chat' || data.type === 'error');
  ws.send(JSON.stringify({ type: 'chat', text: 'Revoked session must not post' }));
  assert.equal((await reply).code, 'auth_required');
});

test('changing a password revokes old sockets while the replacement session remains usable', async () => {
  const user = await account();
  const { ws } = await connect(user.cookie);
  const changed = await request('POST', '/api/auth/password', {
    current: user.password, next: crypto.randomBytes(24).toString('hex')
  }, user.cookie);
  assert.equal(changed.status, 200);
  const reply = message(ws, data => data.type === 'chat' || data.type === 'error');
  ws.send(JSON.stringify({ type: 'chat', text: 'Old password session' }));
  assert.equal((await reply).code, 'auth_required');
  const replacement = await connect(changed.cookie);
  assert.equal(replacement.hello.user.name, user.user.name);
  const freshReply = message(replacement.ws, data => data.type === 'chat' || data.type === 'error');
  replacement.ws.send(JSON.stringify({ type: 'chat', text: 'Replacement session' }));
  assert.equal((await freshReply).type, 'chat');
});

test('logging out also removes authenticated VIP entrance privileges on room joins', async () => {
  const login = await request('POST', '/api/auth/login', { email: 'fan@demo.x3star.local', password: demoPassword });
  assert.equal(login.status, 200);
  assert.equal((await request('POST', '/api/econ/vip', { tier: 1 }, login.cookie)).status, 200);
  const { ws } = await connect(login.cookie);
  const entrance = message(ws, data => data.type === 'enter');
  ws.send(JSON.stringify({ type: 'join', room: 'luna' }));
  assert.equal((await entrance).user, 'demo_fan');
  assert.equal((await request('POST', '/api/auth/logout', {}, login.cookie)).status, 200);

  const seen = [];
  const collect = raw => seen.push(JSON.parse(raw));
  ws.on('message', collect);
  const pong = message(ws, data => data.type === 'pong');
  ws.send(JSON.stringify({ type: 'join', room: 'luna' }));
  ws.send(JSON.stringify({ type: 'ping' }));
  await pong; // Ordered messages prove the join was handled before the assertion.
  ws.off('message', collect);
  assert.equal(seen.some(data => data.type === 'enter'), false);
});
