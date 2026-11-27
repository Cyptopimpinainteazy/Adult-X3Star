'use strict';
/* Per-star opportunity listings and owner-private inquiries. */
const { all, get, run, tx, audit } = require('./db');
const { HttpError, bad, oneOf } = require('./routes/common');
const DAY = 86400000;
const KINDS = ['hiring', 'available'];
const CATEGORIES = ['editing', 'moderation', 'design', 'photography', 'collaboration', 'other'];
const WORK_MODES = ['remote', 'hybrid', 'onsite'];
const STATUSES = ['draft', 'open', 'closed'];

function text(value, label, min, max) {
  if (typeof value !== 'string') throw bad(label + ' must be text');
  const v = value.trim();
  if (v.length < min || v.length > max) throw bad(label + ' must be ' + min + '–' + max + ' characters');
  return v;
}
function id(value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw bad('Invalid listing or inquiry ID');
  return Number(value);
}
function jobOut(row) {
  return { id: row.id, creatorId: row.creator_id, kind: row.kind, title: row.title, description: row.description, category: row.category, workMode: row.work_mode, location: row.location, compensation: row.compensation, status: row.status, expiresAt: row.expires_at, createdAt: row.created_at, updatedAt: row.updated_at };
}
function inquiryOut(row) {
  return { id: row.id, jobId: row.job_id, userId: row.user_id, message: row.message, portfolioUrl: row.portfolio_url, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, applicant: { name: row.applicant_name, email: row.applicant_email } };
}
function getPublicCreator(creatorId) {
  const c = get("SELECT c.id, c.name, c.live FROM creators c JOIN users u ON u.id = c.user_id WHERE c.id = ? AND c.status = 'approved' AND u.banned = 0", creatorId);
  if (!c) throw new HttpError(404, 'not_found', 'Creator not found');
  return { id: c.id, name: c.name, live: !!c.live, jobsUrl: '/stars/' + encodeURIComponent(c.id) + '/jobs' };
}
function publicRows(creatorId) {
  return all("SELECT j.* FROM creator_jobs j JOIN creators c ON c.id = j.creator_id JOIN users u ON u.id = c.user_id WHERE j.creator_id = ? AND j.status = 'open' AND j.expires_at > ? AND c.status = 'approved' AND u.banned = 0 ORDER BY j.updated_at DESC, j.id DESC LIMIT 20", creatorId, Date.now()).map(jobOut);
}
function listPublic(creatorId) { getPublicCreator(creatorId); return publicRows(creatorId); }
function listOwned(creatorId) {
  return all("SELECT j.*, (SELECT COUNT(*) FROM creator_job_inquiries i WHERE i.job_id = j.id) AS inquiry_count FROM creator_jobs j WHERE j.creator_id = ? ORDER BY (j.status = 'archived'), j.updated_at DESC, j.id DESC LIMIT 100", creatorId).map(row => ({ ...jobOut(row), inquiryCount: row.inquiry_count }));
}
function owned(creatorId, jobId) {
  const row = get('SELECT * FROM creator_jobs WHERE id = ? AND creator_id = ?', id(jobId), creatorId);
  if (!row) throw new HttpError(404, 'not_found', 'Listing not found');
  return row;
}
function jobBody(body, current = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Listing must be an object');
  const b = { ...(current ? jobOut(current) : {}), ...body };
  const now = Date.now();
  const expiresAt = b.expiresAt === undefined ? now + 30 * DAY : b.expiresAt;
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0 || expiresAt > now + 180 * DAY || (body.expiresAt !== undefined && expiresAt <= now)) throw bad('Expiry must be a future timestamp within 180 days');
  const status = oneOf(b.status ?? 'draft', 'Status', STATUSES);
  if (status === 'open' && expiresAt <= now) throw bad('Set a future expiry before reopening this listing');
  const workMode = oneOf(b.workMode ?? 'remote', 'Work mode', WORK_MODES);
  return { kind: oneOf(b.kind, 'Kind', KINDS), title: text(b.title, 'Title', 3, 100), description: text(b.description, 'Description', 20, 3000), category: oneOf(b.category ?? 'other', 'Category', CATEGORIES), workMode, location: text(b.location ?? '', 'Location', workMode === 'remote' ? 0 : 2, 100), compensation: text(b.compensation, 'Compensation', 3, 160), status, expiresAt };
}
function canPublish(creatorId, status) {
  if (status !== 'open') return;
  const c = get("SELECT 1 FROM creators c JOIN users u ON u.id = c.user_id WHERE c.id = ? AND c.status = 'approved' AND u.banned = 0", creatorId);
  if (!c) throw new HttpError(403, 'creator_unavailable', 'Only an approved, active creator can publish listings');
}
function create(creator, body, actorId) {
  const b = jobBody(body); canPublish(creator.id, b.status);
  return tx(() => {
    if (get("SELECT COUNT(*) AS n FROM creator_jobs WHERE creator_id = ? AND status != 'archived'", creator.id).n >= 20) throw bad('Archive a listing before adding another; the limit is 20');
    const now = Date.now();
    const inserted = run('INSERT INTO creator_jobs (creator_id, kind, title, description, category, work_mode, location, compensation, status, expires_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', creator.id, b.kind, b.title, b.description, b.category, b.workMode, b.location, b.compensation, b.status, b.expiresAt, now, now);
    const result = jobOut(get('SELECT * FROM creator_jobs WHERE id = ?', Number(inserted.lastInsertRowid)));
    audit(actorId, 'job.create', result.id, { creatorId: creator.id, kind: b.kind, status: b.status });
    return result;
  });
}
function update(creator, jobId, body, actorId) {
  const current = owned(creator.id, jobId);
  if (current.status === 'archived') throw new HttpError(409, 'archived', 'Archived listings cannot be edited');
  const b = jobBody(body, current); canPublish(creator.id, b.status);
  run('UPDATE creator_jobs SET kind=?, title=?, description=?, category=?, work_mode=?, location=?, compensation=?, status=?, expires_at=?, updated_at=? WHERE id=? AND creator_id=?', b.kind, b.title, b.description, b.category, b.workMode, b.location, b.compensation, b.status, b.expiresAt, Date.now(), current.id, creator.id);
  audit(actorId, 'job.update', current.id, { creatorId: creator.id, status: b.status });
  return jobOut(owned(creator.id, current.id));
}
function archive(creatorId, jobId, actorId) {
  const row = owned(creatorId, jobId);
  run("UPDATE creator_jobs SET status='archived', updated_at=? WHERE id=? AND creator_id=?", Date.now(), row.id, creatorId);
  audit(actorId, 'job.archive', row.id, { creatorId });
}
const inquirySelect = 'SELECT i.*, u.name AS applicant_name, u.email AS applicant_email FROM creator_job_inquiries i JOIN users u ON u.id = i.user_id';
function listInquiries(creatorId, jobId) {
  const job = owned(creatorId, jobId);
  return all(inquirySelect + ' WHERE i.job_id = ? ORDER BY i.created_at DESC, i.id DESC LIMIT 100', job.id).map(inquiryOut);
}
function setInquiryStatus(creatorId, jobId, inquiryId, status, actorId) {
  const job = owned(creatorId, jobId);
  status = oneOf(status, 'Inquiry status', ['new', 'reviewing', 'closed']);
  const row = get('SELECT * FROM creator_job_inquiries WHERE id = ? AND job_id = ?', id(inquiryId), job.id);
  if (!row) throw new HttpError(404, 'not_found', 'Inquiry not found');
  run('UPDATE creator_job_inquiries SET status=?, updated_at=? WHERE id=? AND job_id=?', status, Date.now(), row.id, job.id);
  audit(actorId, 'job.inquiry.status', row.id, { creatorId, jobId: job.id, status });
  return inquiryOut(get(inquirySelect + ' WHERE i.id = ?', row.id));
}
function inquire(jobId, user, body) {
  const message = text(body && body.message, 'Message', 10, 2000);
  let portfolioUrl = text(body && body.portfolioUrl !== undefined ? body.portfolioUrl : '', 'Portfolio link', 0, 500);
  if (portfolioUrl) {
    let parsed; try { parsed = new URL(portfolioUrl); } catch { throw bad('Portfolio link must be a valid HTTPS URL'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw bad('Portfolio link must use HTTPS without credentials');
    portfolioUrl = parsed.href;
    if (portfolioUrl.length > 500) throw bad('Portfolio link must be at most 500 characters');
  }
  return tx(() => {
    const job = get("SELECT j.*, c.user_id AS owner_id, c.status AS creator_status, u.banned AS owner_banned FROM creator_jobs j JOIN creators c ON c.id = j.creator_id JOIN users u ON u.id = c.user_id WHERE j.id = ?", id(jobId));
    if (!job || job.creator_status !== 'approved' || job.owner_banned) throw new HttpError(404, 'not_found', 'Listing not found');
    if (job.status !== 'open' || job.expires_at <= Date.now()) throw new HttpError(409, 'listing_closed', 'This listing is no longer accepting inquiries');
    if (job.owner_id === user.id) throw bad('You cannot inquire about your own listing');
    if (get('SELECT 1 FROM creator_job_inquiries WHERE job_id = ? AND user_id = ?', job.id, user.id)) throw new HttpError(409, 'already_inquired', 'You have already sent an inquiry for this listing');
    if (get('SELECT COUNT(*) AS n FROM creator_job_inquiries WHERE job_id = ?', job.id).n >= 100) throw new HttpError(409, 'inbox_full', 'This listing is not accepting more inquiries');
    const now = Date.now();
    const inserted = run('INSERT INTO creator_job_inquiries (job_id,user_id,message,portfolio_url,created_at,updated_at) VALUES (?,?,?,?,?,?)', job.id, user.id, message, portfolioUrl, now, now);
    return inquiryOut(get(inquirySelect + ' WHERE i.id = ?', Number(inserted.lastInsertRowid)));
  });
}
module.exports = { KINDS, CATEGORIES, WORK_MODES, getPublicCreator, listPublic, publicRows, listOwned, create, update, archive, listInquiries, setInquiryStatus, inquire };
