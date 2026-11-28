'use strict';
/* Environment configuration. Reads .env (if present) without extra dependencies. */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');
const JOB_BILLING_MODE = process.env.JOB_BILLING_MODE || 'disabled';
if (!['disabled', 'manual', 'test'].includes(JOB_BILLING_MODE)) throw new Error('JOB_BILLING_MODE must be disabled, manual or test');
let SITE_URL = '';
if (process.env.SITE_URL) {
  const site = new URL(process.env.SITE_URL);
  if (!['https:', 'http:'].includes(site.protocol) || site.username || site.password || site.pathname !== '/' || site.search || site.hash) throw new Error('SITE_URL must be an http(s) origin without a path, credentials or query');
  SITE_URL = site.origin;
}

module.exports = {
  ROOT,
  SITE_URL,
  JOB_BILLING_MODE,
  PUBLIC_DIR: path.join(ROOT, 'public'),
  SHARED_DIR: path.join(ROOT, 'shared'),
  DATA_DIR,
  UPLOAD_DIR: path.join(DATA_DIR, 'uploads'),
  SITE_FILES_DIR: path.join(DATA_DIR, 'site-files'),   // ownership/verification files served at the site root
  DB_FILE: process.env.DB_FILE ? path.resolve(ROOT, process.env.DB_FILE) : path.join(DATA_DIR, 'x3star.db'),
  PORT: num(process.env.PORT, 8080),
  HOST: process.env.HOST || '0.0.0.0',
  NODE_ENV: process.env.NODE_ENV || 'development',
  COOKIE_SECURE: bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
  SESSION_DAYS: num(process.env.SESSION_DAYS, 30),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  SEED_DEMO: bool(process.env.SEED_DEMO, true),
  DEMO_PASSWORD: process.env.DEMO_PASSWORD || '',
  DEMO_TRAFFIC: bool(process.env.DEMO_TRAFFIC, true),
  AUTO_APPROVE_UPLOADS: bool(process.env.AUTO_APPROVE_UPLOADS, false),
  MAX_UPLOAD_MB: num(process.env.MAX_UPLOAD_MB, 50),
  PAYMENTS_MODE: (process.env.PAYMENTS_MODE || 'test').toLowerCase(),   // test | disabled
  TRUST_PROXY: bool(process.env.TRUST_PROXY, false)
};
