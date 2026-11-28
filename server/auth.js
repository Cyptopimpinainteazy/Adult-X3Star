'use strict';
/* Password hashing (scrypt), sessions (opaque token in httpOnly cookie), role guards, rate limiting. */
const crypto = require('node:crypto');
const { get, run } = require('./db');
const cfg = require('./config');

const COOKIE = 'x3s_sid';
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${key.toString('base64')}`;
}
function verifyPassword(pw, stored) {
  const [alg, n, saltB64, keyB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const key = Buffer.from(keyB64, 'base64');
  const test = crypto.scryptSync(pw, Buffer.from(saltB64, 'base64'), key.length, { N: Number(n), r: SCRYPT.r, p: SCRYPT.p });
  return crypto.timingSafeEqual(key, test);
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  run('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)', sha(token), userId, now + cfg.SESSION_DAYS * 86400000, now);
  return token;
}
function destroySession(token) { if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha(token)); }
function userForToken(token) {
  if (!token) return null;
  const row = get(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`, sha(token), Date.now());
  if (!row || row.banned) return null;
  return row;
}
function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    const k = part.slice(0, i).trim(); if (!k) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { out[k] = part.slice(i + 1).trim(); }
  }
  return out;
}
function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: cfg.COOKIE_SECURE, maxAge: cfg.SESSION_DAYS * 86400000, path: '/' });
}
function clearSessionCookie(res) { res.clearCookie(COOKIE, { path: '/' }); }

/** Attach req.user (or null) from the session cookie. */
function attachUser(req, _res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  req.sessionToken = token || null;
  req.user = userForToken(token);
  if (req.user) {
    const now = Date.now();
    if (!req.user.last_seen || now - req.user.last_seen > 60000) run('UPDATE users SET last_seen = ? WHERE id = ?', now, req.user.id);
  }
  next();
}
class HttpError extends Error { constructor(status, code, message) { super(message || code); this.status = status; this.code = code; } }
const requireUser = (req, _res, next) => (req.user ? next() : next(new HttpError(401, 'auth_required', 'Sign in to continue')));
const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'auth_required', 'Sign in to continue'));
  if (!roles.includes(req.user.role) && req.user.role !== 'admin') return next(new HttpError(403, 'forbidden', 'You do not have access to this'));
  next();
};

/* Fixed-window rate limiter keyed by IP + bucket name. */
const buckets = new Map();
function rateLimit(name, max, windowMs) {
  return (req, _res, next) => {
    const key = name + ':' + (req.ip || req.socket.remoteAddress);
    const now = Date.now(); let b = buckets.get(key);
    if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
    if (++b.n > max) return next(new HttpError(429, 'rate_limited', 'Too many requests — slow down'));
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); }, 60000).unref();
setInterval(() => run('DELETE FROM sessions WHERE expires_at < ?', Date.now()), 3600000).unref();

module.exports = { COOKIE, hashPassword, verifyPassword, createSession, destroySession, userForToken, parseCookies, setSessionCookie, clearSessionCookie, attachUser, requireUser, requireRole, rateLimit, HttpError };
