'use strict';
/* Public metadata discovery, kept separate from streaming and paid directory ownership. */
const { all, get, J } = require('./db');
const { bad, HttpError, oneOf } = require('./routes/common');
const { getState } = require('./content/states');
const Jobs = require('./jobs');
const Employers = require('./employer-directory');
const Media = require('./talent-media');
const creatorColumns =
  'c.id,c.name,c.niche,c.tags,c.bio,c.network_city,c.network_state,c.live,c.demo,c.user_id,c.avatar_upload_id,c.cover_upload_id,c.handles';
const creatorJoin = ' FROM creators c JOIN users u ON u.id=c.user_id ';
const creatorGate = "c.status='approved' AND u.banned=0";
function filters(query = {}) {
  if (Object.keys(query).some((key) => /[\[\]]/.test(key))) throw bad('Malformed network filter');
  const scalar = (key) => {
    if (query[key] !== undefined && typeof query[key] !== 'string') throw bad('Invalid ' + key + ' filter');
    return query[key] || '';
  };
  const text = (key, max = 100) => {
    const value = scalar(key).trim();
    if (value.length > max) throw bad(key + ' is too long');
    return value;
  };
  const selected = text('state', 40);
  let state = '';
  if (selected) {
    const found = getState(selected);
    if (!found) throw bad('Choose a valid state');
    state = found.slug;
  }
  const integer = (key, fallback, max) => {
    const raw = scalar(key);
    if (!raw) return fallback;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1 || Number(raw) > max)
      throw bad(key + ' is outside the allowed range');
    return Number(raw);
  };
  return {
    q: text('q'),
    state,
    intent: text('intent', 20),
    kind: text('kind', 20),
    category: text('category', 40),
    workMode: text('workMode', 20),
    location: text('location'),
    page: integer('page', 1, 1000),
    pageSize: integer('pageSize', 20, 50)
  };
}
const literal = (value) => '%' + value.replace(/[\\%_]/g, '\\$&') + '%';
function creatorOut(row, counts = {}, media = { photo: null, previewUrl: null }) {
  const tags = J(row.tags, []);
  return {
    id: row.id,
    name: row.name,
    niche: row.niche,
    tags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string') : [],
    bio: row.bio,
    networkCity: row.network_city || '',
    networkState: row.network_state || '',
    live: !!row.live,
    demo: !!row.demo,
    photo: media.photo,
    previewUrl: media.previewUrl,
    availableCount: counts.available || 0,
    hiringCount: counts.hiring || 0,
    opportunityCount: (counts.available || 0) + (counts.hiring || 0),
    profileUrl: '/talent/' + encodeURIComponent(row.id),
    boardUrl: '/stars/' + encodeURIComponent(row.id) + '/jobs'
  };
}
function countsFor(ids) {
  if (!ids.length) return new Map();
  const rows = all(
    "SELECT creator_id,SUM(kind='available') AS available,SUM(kind='hiring') AS hiring FROM creator_jobs WHERE creator_id IN (" +
      ids.map(() => '?').join(',') +
      ") AND status='open' AND expires_at>? GROUP BY creator_id",
    ...ids,
    Date.now()
  );
  return new Map(rows.map((row) => [row.creator_id, { available: row.available, hiring: row.hiring }]));
}
function searchTalent(query = {}) {
  const f = filters(query),
    parts = [creatorGate],
    params = [];
  if (f.state) {
    parts.push('c.network_state=?');
    params.push(f.state);
  }
  if (f.q) {
    parts.push(
      "(c.name LIKE ? ESCAPE '\\' OR c.bio LIKE ? ESCAPE '\\' OR c.niche LIKE ? ESCAPE '\\' OR c.tags LIKE ? ESCAPE '\\' OR c.network_city LIKE ? ESCAPE '\\')"
    );
    for (let n = 0; n < 5; n++) params.push(literal(f.q));
  }
  if (f.intent) {
    oneOf(f.intent, 'Intent', ['hiring', 'available']);
    parts.push(
      "EXISTS(SELECT 1 FROM creator_jobs j WHERE j.creator_id=c.id AND j.status='open' AND j.expires_at>? AND j.kind=?)"
    );
    params.push(Date.now(), f.intent);
  }
  const where = parts.join(' AND '),
    total = get('SELECT COUNT(*) AS n' + creatorJoin + 'WHERE ' + where, ...params).n;
  const rows = all(
    'SELECT ' +
      creatorColumns +
      creatorJoin +
      'WHERE ' +
      where +
      ' ORDER BY c.featured DESC,c.name COLLATE NOCASE,c.id LIMIT ? OFFSET ?',
    ...params,
    f.pageSize,
    (f.page - 1) * f.pageSize
  );
  const counts = countsFor(rows.map((row) => row.id)),
    media = Media.forRows(rows);
  return {
    talent: rows.map((row) => creatorOut(row, counts.get(row.id), media.get(row.id))),
    total,
    page: f.page,
    pageSize: f.pageSize,
    pages: Math.ceil(total / f.pageSize)
  };
}
function publicCreatorRow(creatorId) {
  if (typeof creatorId !== 'string' || creatorId.length > 80)
    throw new HttpError(404, 'not_found', 'Creator not found');
  const row = get('SELECT ' + creatorColumns + creatorJoin + 'WHERE c.id=? AND ' + creatorGate, creatorId);
  if (!row) throw new HttpError(404, 'not_found', 'Creator not found');
  return row;
}
function talentProfile(creatorId) {
  const row = publicCreatorRow(creatorId);
  const jobs = Jobs.listPublic(row.id),
    counts = {
      available: jobs.filter((job) => job.kind === 'available').length,
      hiring: jobs.filter((job) => job.kind === 'hiring').length
    };
  return { creator: creatorOut(row, counts, Media.forRows([row]).get(row.id)), jobs };
}
function talentPreview(creatorId, ip) {
  return Media.resolvePreview(() => publicCreatorRow(creatorId), ip);
}
function searchOpportunities(query = {}) {
  const f = filters(query),
    parts = [creatorGate, "j.status='open'", 'j.expires_at>?'],
    params = [Date.now()];
  if (f.state) {
    parts.push('c.network_state=?');
    params.push(f.state);
  }
  if (f.kind) {
    oneOf(f.kind, 'Kind', Jobs.KINDS);
    parts.push('j.kind=?');
    params.push(f.kind);
  }
  if (f.category) {
    oneOf(f.category, 'Category', Jobs.CATEGORIES);
    parts.push('j.category=?');
    params.push(f.category);
  }
  if (f.workMode) {
    oneOf(f.workMode, 'Work mode', Jobs.WORK_MODES);
    parts.push('j.work_mode=?');
    params.push(f.workMode);
  }
  if (f.location) {
    parts.push("(j.location LIKE ? ESCAPE '\\' OR c.network_city LIKE ? ESCAPE '\\')");
    params.push(literal(f.location), literal(f.location));
  }
  if (f.q) {
    parts.push("(j.title LIKE ? ESCAPE '\\' OR j.description LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')");
    for (let n = 0; n < 3; n++) params.push(literal(f.q));
  }
  const from =
    ' FROM creator_jobs j JOIN creators c ON c.id=j.creator_id JOIN users u ON u.id=c.user_id WHERE ' +
    parts.join(' AND ');
  const total = get('SELECT COUNT(*) AS n' + from, ...params).n;
  const jobs = all(
    'SELECT j.*,c.name AS creator_name,c.network_city,c.network_state,c.demo' +
      from +
      ' ORDER BY j.updated_at DESC,j.id DESC LIMIT ? OFFSET ?',
    ...params,
    f.pageSize,
    (f.page - 1) * f.pageSize
  ).map((row) => ({
    id: row.id,
    creatorId: row.creator_id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    category: row.category,
    workMode: row.work_mode,
    location: row.location,
    compensation: row.compensation,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    creator: {
      id: row.creator_id,
      name: row.creator_name,
      networkCity: row.network_city || '',
      networkState: row.network_state || '',
      demo: !!row.demo
    }
  }));
  return { jobs, total, page: f.page, pageSize: f.pageSize, pages: Math.ceil(total / f.pageSize) };
}
function searchCompanies(query = {}) {
  return Employers.searchPublicCompanies(query);
}
function companyProfile(employerId) {
  return Employers.publicCompanyProfile(employerId);
}
module.exports = { searchTalent, talentProfile, talentPreview, searchOpportunities, searchCompanies, companyProfile };
