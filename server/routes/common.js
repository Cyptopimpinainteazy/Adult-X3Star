'use strict';
const { HttpError } = require('../auth');

const bad = (msg, code = 'bad_input') => new HttpError(400, code, msg);
function str(v, name, min = 0, max = 200) {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  if (s.length < min) throw bad(min > 0 && !s ? `${name} is required` : `${name} must be at least ${min} characters`);
  if (s.length > max) throw bad(`${name} must be at most ${max} characters`);
  return s;
}
function intIn(v, name, lo, hi) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw bad(`${name} must be a whole number between ${lo} and ${hi}`);
  return n;
}
function numIn(v, name, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw bad(`${name} must be between ${lo} and ${hi}`);
  return n;
}
function oneOf(v, name, list) { if (!list.includes(v)) throw bad(`${name} must be one of: ${list.join(', ')}`); return v; }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME = /^[A-Za-z0-9_.]{3,24}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const NICHES = ['BigBoobs', 'Goth/Emo/Punk', 'Femdom', 'Other'];
const SITES = ['CB', 'SC', 'BC', 'C4', 'X3'];

module.exports = { HttpError, bad, str, intIn, numIn, oneOf, EMAIL, NAME, HEX, NICHES, SITES };
