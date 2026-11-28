'use strict';
/* Paid employer directory. A receipt records off-platform reconciliation, never a card charge. */
const crypto = require('node:crypto');
const cfg = require('./config');
const { all, get, run, tx, J, audit } = require('./db');
const { HttpError, bad, oneOf } = require('./routes/common');
const { getState } = require('./content/states');
const DAY = 86400000;
const CATEGORIES = [
  'broadcasting',
  'production',
  'editing',
  'moderation',
  'design',
  'photography',
  'marketing',
  'technology',
  'operations',
  'other'
];
const BASE = { priceCents: 4900, currency: 'USD', durationDays: 30, invoiceInstructions: '', enabled: true };
function text(v, label, min, max) {
  if (typeof v !== 'string') throw bad(label + ' must be text');
  const s = v.trim();
  if (s.length < min || s.length > max) throw bad(label + ' must be ' + min + '–' + max + ' characters');
  return s;
}
function number(v, label, min, max) {
  if (!Number.isSafeInteger(v) || v < min || v > max)
    throw bad(label + ' must be an integer between ' + min + ' and ' + max);
  return v;
}
function id(v) {
  if (!/^\d+$/.test(String(v)) || !Number.isSafeInteger(Number(v)) || Number(v) < 1)
    throw bad('Invalid listing or employer ID');
  return Number(v);
}
function state(v = '') {
  if (v === '') return '';
  const s = typeof v === 'string' && getState(v);
  if (!s) throw bad('Choose a valid US state');
  return s.slug;
}
function https(v, label) {
  const s = text(v, label, 0, 500);
  if (!s) return '';
  let u;
  try {
    u = new URL(s);
  } catch {
    throw bad(label + ' must be a valid HTTPS URL');
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.href.length > 500)
    throw bad(label + ' must use HTTPS without credentials');
  return u.href;
}
function testAllowed() {
  return cfg.JOB_BILLING_MODE === 'test' && cfg.NODE_ENV !== 'production';
}
function config() {
  const saved = J((get("SELECT value FROM settings WHERE key='employer_directory'") || {}).value, {});
  const p = { ...BASE, ...saved };
  return {
    ...p,
    billingMode: cfg.JOB_BILLING_MODE,
    testPaymentsAllowed: testAllowed(),
    available:
      p.enabled && (testAllowed() || (cfg.JOB_BILLING_MODE === 'manual' && p.invoiceInstructions.trim().length >= 10))
  };
}
function requireAdmin(actor) {
  if (!actor || actor.role !== 'admin' || actor.banned) throw new HttpError(403, 'forbidden', 'Admin access required');
}
function profileOut(r) {
  return r
    ? {
        id: r.id,
        companyName: r.company_name,
        website: r.website,
        location: r.location,
        state: r.state,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }
    : null;
}
function profileFor(user, required = true) {
  const p = get('SELECT * FROM employer_accounts WHERE user_id=?', user.id);
  if (!p && required) throw bad('Save your company profile first', 'employer_required');
  return p;
}
function activeProfile(user) {
  const p = profileFor(user);
  if (p.status !== 'active') throw new HttpError(403, 'employer_suspended', 'This employer account is suspended');
  return p;
}
function saveProfile(user, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Company profile must be an object');
  const cur = profileFor(user, false);
  const now = Date.now();
  const b = {
    companyName: text(body.companyName ?? (cur && cur.company_name), 'Company name', 2, 100),
    website: https(body.website ?? (cur ? cur.website : ''), 'Website'),
    location: text(body.location ?? (cur ? cur.location : ''), 'Location', 0, 100),
    state: state(body.state ?? (cur ? cur.state : ''))
  };
  run(
    'INSERT INTO employer_accounts(user_id,company_name,website,location,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET company_name=excluded.company_name,website=excluded.website,location=excluded.location,state=excluded.state,updated_at=excluded.updated_at',
    user.id,
    b.companyName,
    b.website,
    b.location,
    b.state,
    now,
    now
  );
  return profileOut(profileFor(user));
}
function orderOut(r) {
  return r
    ? {
        id: r.id,
        listingId: r.listing_id,
        priceCents: r.price_cents,
        currency: r.currency,
        durationDays: r.duration_days,
        invoiceInstructions: r.invoice_instructions,
        status: r.status,
        test: !!r.test,
        reference: r.reference || '',
        refundReference: r.refund_reference || '',
        createdAt: r.created_at,
        paidAt: r.paid_at,
        activatedAt: r.activated_at,
        expiresAt: r.expires_at
      }
    : null;
}
function reviewToken(row) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        row.company_name,
        row.title,
        row.description,
        row.category,
        row.work_mode,
        row.location,
        row.state,
        row.compensation
      ])
    )
    .digest('hex');
}
function listingOut(r, publicOnly = false) {
  const o = r.active_order_id
    ? get('SELECT * FROM employer_listing_orders WHERE id=? AND listing_id=?', r.active_order_id, r.id)
    : null;
  const out = {
    id: r.id,
    companyName: r.company_name,
    title: r.title,
    description: r.description,
    category: r.category,
    workMode: r.work_mode,
    location: r.location,
    state: r.state,
    compensation: r.compensation,
    publishedAt: o && o.activated_at,
    expiresAt: o && o.expires_at,
    test: !!(o && o.test)
  };
  if (!publicOnly)
    Object.assign(out, {
      employerId: r.employer_id,
      status: r.status,
      reviewStatus: r.review_status,
      reviewNote: r.review_note,
      reviewToken: reviewToken(r),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      activeOrderId: r.active_order_id,
      inquiryCount: get('SELECT COUNT(*) AS n FROM employer_listing_inquiries WHERE listing_id=?', r.id).n
    });
  return out;
}
function owned(user, listingId) {
  const p = profileFor(user);
  const r = get('SELECT * FROM employer_listings WHERE id=? AND employer_id=?', id(listingId), p.id);
  if (!r) throw new HttpError(404, 'not_found', 'Listing not found');
  return r;
}
function ownedOrder(user, orderId) {
  const r = get(
    'SELECT o.* FROM employer_listing_orders o JOIN employer_listings l ON l.id=o.listing_id JOIN employer_accounts e ON e.id=l.employer_id WHERE o.id=? AND e.user_id=?',
    String(orderId),
    user.id
  );
  if (!r) throw new HttpError(404, 'not_found', 'Order not found');
  return r;
}
function employerDashboard(user) {
  const p = profileFor(user, false);
  return {
    profile: profileOut(p),
    listings: p
      ? all(
          "SELECT * FROM employer_listings WHERE employer_id=? ORDER BY (status='archived'),updated_at DESC,id DESC LIMIT 100",
          p.id
        ).map((r) => listingOut(r))
      : [],
    orders: p
      ? all(
          "SELECT o.* FROM employer_listing_orders o JOIN employer_listings l ON l.id=o.listing_id WHERE l.employer_id=? ORDER BY (l.status='archived'),(o.id=l.active_order_id) DESC,o.created_at DESC,o.id DESC LIMIT 100",
          p.id
        ).map(orderOut)
      : [],
    plan: config(),
    billingMode: cfg.JOB_BILLING_MODE
  };
}
function listingBody(body, cur = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Listing must be an object');
  const b = { ...(cur ? listingOut(cur) : {}), ...body };
  const workMode = oneOf(b.workMode ?? 'remote', 'Work mode', ['remote', 'hybrid', 'onsite']);
  const selectedState = state(b.state ?? '');
  if (workMode !== 'remote' && !selectedState) throw bad('Choose a state for on-site or hybrid work');
  return {
    title: text(b.title, 'Title', 3, 100),
    description: text(b.description, 'Description', 20, 5000),
    category: oneOf(b.category ?? 'other', 'Category', CATEGORIES),
    workMode,
    location: text(b.location ?? '', 'Location', workMode === 'remote' ? 0 : 2, 100),
    state: selectedState,
    compensation: text(b.compensation, 'Compensation', 3, 160)
  };
}
function createListing(user, body) {
  const p = activeProfile(user),
    b = listingBody(body);
  return tx(() => {
    if (get("SELECT COUNT(*) AS n FROM employer_listings WHERE employer_id=? AND status!='archived'", p.id).n >= 20)
      throw bad('Archive a listing before adding another; the limit is 20');
    const now = Date.now();
    const info = run(
      'INSERT INTO employer_listings(employer_id,company_name,title,description,category,work_mode,location,state,compensation,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      p.id,
      p.company_name,
      b.title,
      b.description,
      b.category,
      b.workMode,
      b.location,
      b.state,
      b.compensation,
      now,
      now
    );
    audit(user.id, 'employer.listing.create', Number(info.lastInsertRowid), { employerId: p.id });
    return listingOut(owned(user, Number(info.lastInsertRowid)));
  });
}
function updateListing(user, listingId, body) {
  const p = activeProfile(user);
  const cur = owned(user, listingId);
  if (cur.status === 'archived') throw new HttpError(409, 'archived', 'Archived listings cannot be edited');
  const b = listingBody(body, cur);
  run(
    "UPDATE employer_listings SET company_name=?,title=?,description=?,category=?,work_mode=?,location=?,state=?,compensation=?,review_status='pending',review_note='',updated_at=? WHERE id=? AND employer_id=?",
    p.company_name,
    b.title,
    b.description,
    b.category,
    b.workMode,
    b.location,
    b.state,
    b.compensation,
    Date.now(),
    cur.id,
    p.id
  );
  audit(user.id, 'employer.listing.edit', cur.id, {});
  return listingOut(owned(user, cur.id));
}
function activate(orderId) {
  const o = get('SELECT * FROM employer_listing_orders WHERE id=?', orderId);
  if (!o || o.status !== 'paid' || o.activated_at !== null) return;
  const l = get(
    "SELECT l.* FROM employer_listings l JOIN employer_accounts e ON e.id=l.employer_id JOIN users u ON u.id=e.user_id WHERE l.id=? AND l.active_order_id=? AND l.status='open' AND l.review_status='approved' AND e.status='active' AND u.banned=0",
    o.listing_id,
    o.id
  );
  if (!l) return;
  const now = Date.now();
  run(
    'UPDATE employer_listing_orders SET activated_at=?,expires_at=? WHERE id=? AND activated_at IS NULL',
    now,
    now + o.duration_days * DAY,
    o.id
  );
}
function submitListing(user, listingId) {
  const p = activeProfile(user),
    l = owned(user, listingId);
  if (l.status === 'archived') throw new HttpError(409, 'archived', 'Archived listings cannot be submitted');
  listingBody({}, l);
  return tx(() => {
    if (l.status !== 'open' || l.company_name !== p.company_name || l.review_status === 'rejected')
      run(
        "UPDATE employer_listings SET company_name=?,status='open',review_status='pending',review_note='',updated_at=? WHERE id=?",
        p.company_name,
        Date.now(),
        l.id
      );
    if (l.active_order_id) activate(l.active_order_id);
    return listingOut(owned(user, l.id));
  });
}
function cancelOrder(user, orderId) {
  return tx(() => {
    const order = ownedOrder(user, orderId);
    if (order.status === 'cancelled') return orderOut(order);
    if (order.status !== 'pending')
      throw new HttpError(409, 'order_closed', 'Only unpaid pending invoices can be cancelled');
    run("UPDATE employer_listing_orders SET status='cancelled' WHERE id=? AND status='pending'", order.id);
    audit(user.id, 'employer.order.cancelled', order.id, {});
    return orderOut(get('SELECT * FROM employer_listing_orders WHERE id=?', order.id));
  });
}
function cancelPendingForListing(user, listing) {
  if (!listing.active_order_id) return;
  const order = get(
    "SELECT * FROM employer_listing_orders WHERE id=? AND listing_id=? AND status='pending'",
    listing.active_order_id,
    listing.id
  );
  if (order) cancelOrder(user, order.id);
}
function closeListing(user, listingId) {
  return tx(() => {
    const listing = owned(user, listingId);
    if (listing.status === 'archived') throw new HttpError(409, 'archived', 'Listing is archived');
    run("UPDATE employer_listings SET status='closed',updated_at=? WHERE id=?", Date.now(), listing.id);
    cancelPendingForListing(user, listing);
    return listingOut(owned(user, listing.id));
  });
}
function archiveListing(user, listingId) {
  return tx(() => {
    const listing = owned(user, listingId);
    run("UPDATE employer_listings SET status='archived',updated_at=? WHERE id=?", Date.now(), listing.id);
    cancelPendingForListing(user, listing);
    return { ok: true };
  });
}
function createOrder(user, listingId) {
  return tx(() => {
    activeProfile(user);
    const l = owned(user, listingId);
    if (l.status === 'archived') throw new HttpError(409, 'archived', 'Listing is archived');
    const plan = config();
    if (!plan.available)
      throw new HttpError(503, 'billing_unavailable', 'Employer billing is not available in this mode');
    let current = l.active_order_id
      ? get('SELECT * FROM employer_listing_orders WHERE id=? AND listing_id=?', l.active_order_id, l.id)
      : null;
    const isTest = testAllowed();
    if (current && current.status === 'pending' && !!current.test !== isTest) {
      run("UPDATE employer_listing_orders SET status='cancelled' WHERE id=?", current.id);
      audit(user.id, 'employer.order.mode_replaced', current.id, { test: !!current.test, newTest: isTest });
      current = null;
    }
    if (current && current.test && !isTest) current = null;
    if (current && current.status === 'pending') return orderOut(current);
    if (current && current.status === 'paid' && (!current.expires_at || current.expires_at > Date.now()))
      throw new HttpError(409, 'active_term', 'This listing already has a paid term or is awaiting review');
    if (l.status !== 'open' || l.review_status !== 'approved')
      throw new HttpError(
        409,
        'review_required',
        'Submit the listing and wait for approval before creating an invoice'
      );
    const orderId = 'ad_' + crypto.randomBytes(12).toString('hex');
    run(
      'INSERT INTO employer_listing_orders(id,listing_id,price_cents,currency,duration_days,invoice_instructions,test,created_at) VALUES(?,?,?,?,?,?,?,?)',
      orderId,
      l.id,
      plan.priceCents,
      plan.currency,
      plan.durationDays,
      plan.invoiceInstructions,
      testAllowed() ? 1 : 0,
      Date.now()
    );
    run('UPDATE employer_listings SET active_order_id=?,updated_at=? WHERE id=?', orderId, Date.now(), l.id);
    audit(user.id, 'employer.order.create', orderId, { listingId: l.id, test: testAllowed() });
    return orderOut(get('SELECT * FROM employer_listing_orders WHERE id=?', orderId));
  });
}
function markPaid(actor, o, reference) {
  return tx(() => {
    const current = get('SELECT * FROM employer_listing_orders WHERE id=?', o.id);
    if (current.status === 'paid') {
      if (current.reference !== reference)
        throw new HttpError(409, 'reference_mismatch', 'This order was already confirmed with a different reference');
      return orderOut(current);
    }
    if (current.status !== 'pending') throw new HttpError(409, 'order_closed', 'This order cannot be paid');
    const l = get('SELECT * FROM employer_listings WHERE id=? AND active_order_id=?', current.listing_id, current.id);
    if (!l || l.status === 'archived') throw new HttpError(409, 'order_inactive', 'This invoice is no longer active');
    if (get('SELECT 1 FROM employer_payment_events WHERE reference=?', reference))
      throw new HttpError(409, 'reference_used', 'That payment reference was already recorded');
    run(
      "INSERT INTO employer_payment_events(reference,order_id,kind,actor_id,created_at) VALUES(?,?,'payment',?,?)",
      reference,
      current.id,
      actor.id,
      Date.now()
    );
    run(
      "UPDATE employer_listing_orders SET status='paid',reference=?,paid_at=? WHERE id=?",
      reference,
      Date.now(),
      current.id
    );
    activate(current.id);
    audit(actor.id, 'employer.payment.recorded', current.id, { reference, test: !!current.test });
    return orderOut(get('SELECT * FROM employer_listing_orders WHERE id=?', current.id));
  });
}
function testPay(user, orderId) {
  if (!testAllowed())
    throw new HttpError(503, 'test_disabled', 'Test payment is only available in explicit development test mode');
  const o = ownedOrder(user, orderId);
  if (!o.test) throw bad('This is not a test order');
  return markPaid(user, o, 'test:' + o.id);
}
function confirmPayment(actor, orderId, body) {
  requireAdmin(actor);
  const o = get('SELECT * FROM employer_listing_orders WHERE id=?', String(orderId));
  if (!o) throw new HttpError(404, 'not_found', 'Order not found');
  if (cfg.JOB_BILLING_MODE !== 'manual' || o.test)
    throw new HttpError(
      503,
      'manual_disabled',
      'Manual confirmation requires configured manual invoice mode and a live invoice'
    );
  if (!body || body.amountCents !== o.price_cents || body.currency !== o.currency)
    throw bad('Receipt amount and currency must match the invoice snapshot');
  return markPaid(actor, o, text(body.reference, 'Payment reference', 3, 160));
}
function recordRefund(actor, orderId, body) {
  requireAdmin(actor);
  const o = get('SELECT * FROM employer_listing_orders WHERE id=?', String(orderId));
  if (!o) throw new HttpError(404, 'not_found', 'Order not found');
  const reference = text(body && body.reference, 'Refund reference', 3, 160);
  const note = text(body && body.note !== undefined ? body.note : '', 'Refund note', 0, 1000);
  return tx(() => {
    const current = get('SELECT * FROM employer_listing_orders WHERE id=?', o.id);
    if (current.status === 'refunded') {
      if (current.refund_reference !== reference)
        throw new HttpError(409, 'reference_mismatch', 'A different refund reference is already recorded');
      return orderOut(current);
    }
    if (current.status !== 'paid') throw new HttpError(409, 'not_paid', 'Only a paid invoice can be marked refunded');
    if (get('SELECT 1 FROM employer_payment_events WHERE reference=?', reference))
      throw new HttpError(409, 'reference_used', 'That receipt reference was already recorded');
    run(
      "INSERT INTO employer_payment_events(reference,order_id,kind,actor_id,created_at) VALUES(?,?,'refund',?,?)",
      reference,
      o.id,
      actor.id,
      Date.now()
    );
    run("UPDATE employer_listing_orders SET status='refunded',refund_reference=? WHERE id=?", reference, o.id);
    audit(actor.id, 'employer.refund.recorded', o.id, { reference, note, test: !!o.test });
    return orderOut(get('SELECT * FROM employer_listing_orders WHERE id=?', o.id));
  });
}
const publicJoin =
  ' FROM employer_listings l JOIN employer_accounts e ON e.id=l.employer_id JOIN users u ON u.id=e.user_id JOIN employer_listing_orders o ON o.id=l.active_order_id AND o.listing_id=l.id ';
function publicWhere() {
  return {
    sql: "l.status='open' AND l.review_status='approved' AND e.status='active' AND u.banned=0 AND o.status='paid' AND o.activated_at IS NOT NULL AND o.expires_at>? AND (o.test=0 OR ?=1)",
    params: [Date.now(), testAllowed() ? 1 : 0]
  };
}
function publicJob(listingId) {
  const p = publicWhere();
  const l = get('SELECT l.*' + publicJoin + 'WHERE l.id=? AND ' + p.sql, id(listingId), ...p.params);
  if (!l) throw new HttpError(404, 'not_found', 'Job not found');
  return listingOut(l, true);
}
function search(query = {}) {
  if (Object.keys(query).some((key) => /[\[\]]/.test(key))) throw bad('Malformed directory filter');
  const p = publicWhere();
  const clauses = [p.sql],
    params = [...p.params];
  const scalar = (key) => {
    if (query[key] !== undefined && typeof query[key] !== 'string') throw bad('Invalid ' + key + ' filter');
    return query[key] || '';
  };
  const q = text(scalar('q'), 'Search', 0, 100),
    category = scalar('category'),
    workMode = scalar('workMode'),
    selectedState = scalar('state');
  if (category) {
    oneOf(category, 'Category', CATEGORIES);
    clauses.push('l.category=?');
    params.push(category);
  }
  if (workMode) {
    oneOf(workMode, 'Work mode', ['remote', 'hybrid', 'onsite']);
    clauses.push('l.work_mode=?');
    params.push(workMode);
  }
  if (selectedState) {
    clauses.push('l.state=?');
    params.push(state(selectedState));
  }
  if (q) {
    clauses.push('(l.title LIKE ? OR l.description LIKE ? OR l.company_name LIKE ?)');
    const term = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    for (let n = 0; n < 3; n++) params.push(term);
    clauses[clauses.length - 1] =
      "(l.title LIKE ? ESCAPE '\\' OR l.description LIKE ? ESCAPE '\\' OR l.company_name LIKE ? ESCAPE '\\')";
  }
  const parse = (key, def, max) => {
    const v = scalar(key);
    if (!v) return def;
    if (!/^\d+$/.test(v)) throw bad(key + ' must be a positive integer');
    return number(Number(v), key, 1, max);
  };
  const page = parse('page', 1, 1000),
    pageSize = parse('pageSize', 20, 50),
    where = clauses.join(' AND ');
  const total = get('SELECT COUNT(*) AS n' + publicJoin + 'WHERE ' + where, ...params).n;
  const jobs = all(
    'SELECT l.*' + publicJoin + 'WHERE ' + where + ' ORDER BY o.activated_at DESC,l.id DESC LIMIT ? OFFSET ?',
    ...params,
    pageSize,
    (page - 1) * pageSize
  ).map((l) => listingOut(l, true));
  return { jobs, total, page, pageSize, pages: Math.ceil(total / pageSize) };
}
const inquirySelect =
  'SELECT i.*,u.name AS applicant_name,u.email AS applicant_email FROM employer_listing_inquiries i JOIN users u ON u.id=i.user_id';
function inquiryOut(r) {
  return {
    id: r.id,
    listingId: r.listing_id,
    userId: r.user_id,
    message: r.message,
    portfolioUrl: r.portfolio_url,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    applicant: { name: r.applicant_name, email: r.applicant_email }
  };
}
function sendInquiry(user, listingId, body) {
  const message = text(body && body.message, 'Message', 10, 2000),
    portfolio = https(body && body.portfolioUrl !== undefined ? body.portfolioUrl : '', 'Portfolio link');
  return tx(() => {
    const job = publicJob(listingId);
    const owner = get(
      'SELECT e.user_id FROM employer_listings l JOIN employer_accounts e ON e.id=l.employer_id WHERE l.id=?',
      job.id
    );
    if (owner.user_id === user.id) throw bad('You cannot inquire about your own listing');
    if (get('SELECT 1 FROM employer_listing_inquiries WHERE listing_id=? AND user_id=?', job.id, user.id))
      throw new HttpError(409, 'already_inquired', 'You already sent an inquiry for this listing');
    if (get('SELECT COUNT(*) AS n FROM employer_listing_inquiries WHERE listing_id=?', job.id).n >= 100)
      throw new HttpError(409, 'inbox_full', 'This listing is not accepting more inquiries');
    const now = Date.now(),
      r = run(
        'INSERT INTO employer_listing_inquiries(listing_id,user_id,message,portfolio_url,created_at,updated_at) VALUES(?,?,?,?,?,?)',
        job.id,
        user.id,
        message,
        portfolio,
        now,
        now
      );
    return inquiryOut(get(inquirySelect + ' WHERE i.id=?', Number(r.lastInsertRowid)));
  });
}
function listInquiries(user, listingId) {
  const l = owned(user, listingId);
  return all(inquirySelect + ' WHERE i.listing_id=? ORDER BY i.created_at DESC,i.id DESC LIMIT 100', l.id).map(
    inquiryOut
  );
}
function reviewInquiry(user, listingId, inquiryId, status) {
  const l = owned(user, listingId);
  oneOf(status, 'Inquiry status', ['new', 'reviewing', 'closed']);
  const r = get('SELECT * FROM employer_listing_inquiries WHERE id=? AND listing_id=?', id(inquiryId), l.id);
  if (!r) throw new HttpError(404, 'not_found', 'Inquiry not found');
  run('UPDATE employer_listing_inquiries SET status=?,updated_at=? WHERE id=?', status, Date.now(), r.id);
  return inquiryOut(get(inquirySelect + ' WHERE i.id=?', r.id));
}
function saveSettings(actor, body) {
  requireAdmin(actor);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('Settings must be an object');
  const allowed = ['priceCents', 'currency', 'durationDays', 'invoiceInstructions', 'enabled'];
  for (const k of Object.keys(body)) if (!allowed.includes(k)) throw bad('Unsupported employer setting: ' + k);
  const current = config(),
    b = { ...current, ...body };
  const saved = {
    priceCents: number(b.priceCents, 'Price cents', 100, 10000000),
    currency: oneOf(b.currency, 'Currency', ['USD']),
    durationDays: number(b.durationDays, 'Duration days', 1, 180),
    invoiceInstructions: text(b.invoiceInstructions, 'Invoice instructions', 0, 2000),
    enabled: b.enabled
  };
  if (typeof saved.enabled !== 'boolean') throw bad('Enabled must be true or false');
  run(
    "INSERT INTO settings(key,value,updated_at) VALUES('employer_directory',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
    JSON.stringify(saved),
    Date.now()
  );
  audit(actor.id, 'employer.settings.update', 'employer_directory', saved);
  return config();
}
function reviewListing(actor, listingId, body) {
  requireAdmin(actor);
  const decision = oneOf(body && body.decision, 'Review decision', ['approved', 'rejected']);
  const note = text(body && body.note !== undefined ? body.note : '', 'Review note', 0, 1000);
  if (!body || typeof body.reviewToken !== 'string' || !/^[a-f0-9]{64}$/.test(body.reviewToken))
    throw bad('Reload the listing preview before reviewing it');
  return tx(() => {
    const listing = get('SELECT * FROM employer_listings WHERE id=?', id(listingId));
    if (!listing) throw new HttpError(404, 'not_found', 'Listing not found');
    if (listing.status === 'archived') throw new HttpError(409, 'archived', 'Listing is archived');
    if (body.reviewToken !== reviewToken(listing))
      throw new HttpError(
        409,
        'review_changed',
        'The listing changed after preview. Reload and review the current content.'
      );
    run(
      'UPDATE employer_listings SET review_status=?,review_note=?,updated_at=? WHERE id=?',
      decision,
      note,
      Date.now(),
      listing.id
    );
    if (listing.active_order_id) activate(listing.active_order_id);
    audit(actor.id, 'employer.listing.review', listing.id, { decision, note, reviewToken: body.reviewToken });
    return listingOut(get('SELECT * FROM employer_listings WHERE id=?', listing.id));
  });
}
function setEmployerStatus(actor, employerId, status) {
  requireAdmin(actor);
  oneOf(status, 'Employer status', ['active', 'suspended']);
  const e = get('SELECT * FROM employer_accounts WHERE id=?', id(employerId));
  if (!e) throw new HttpError(404, 'not_found', 'Employer not found');
  return tx(() => {
    run('UPDATE employer_accounts SET status=?,updated_at=? WHERE id=?', status, Date.now(), e.id);
    if (status === 'active')
      for (const listing of all(
        "SELECT active_order_id FROM employer_listings WHERE employer_id=? AND status='open' AND review_status='approved' AND active_order_id IS NOT NULL",
        e.id
      ))
        activate(listing.active_order_id);
    audit(actor.id, 'employer.status', e.id, { status });
    return profileOut(get('SELECT * FROM employer_accounts WHERE id=?', e.id));
  });
}
function adminLookup(actor, query) {
  requireAdmin(actor);
  const type = oneOf(query && query.type, 'Lookup type', ['listing', 'order', 'employer']);
  if (!query || typeof query.id !== 'string') throw bad('Lookup ID must be text');
  if (type === 'order') {
    const orderId = text(query.id, 'Order ID', 1, 80);
    if (!/^[A-Za-z0-9_-]+$/.test(orderId)) throw bad('Invalid order ID');
    const order = get('SELECT * FROM employer_listing_orders WHERE id=?', orderId);
    if (!order) throw new HttpError(404, 'not_found', 'Order not found');
    return { order: orderOut(order) };
  }
  const recordId = id(query.id);
  if (type === 'listing') {
    const listing = get('SELECT * FROM employer_listings WHERE id=?', recordId);
    if (!listing) throw new HttpError(404, 'not_found', 'Listing not found');
    return { listing: listingOut(listing) };
  }
  const employer = get('SELECT * FROM employer_accounts WHERE id=?', recordId);
  if (!employer) throw new HttpError(404, 'not_found', 'Employer not found');
  return { profile: profileOut(employer) };
}
function adminDashboard() {
  const metrics = {
    liveRevenueCents: get(
      "SELECT COALESCE(SUM(price_cents),0) AS n FROM employer_listing_orders WHERE status='paid' AND test=0"
    ).n,
    testRevenueCents: get(
      "SELECT COALESCE(SUM(price_cents),0) AS n FROM employer_listing_orders WHERE status='paid' AND test=1"
    ).n,
    pendingOrders: get("SELECT COUNT(*) AS n FROM employer_listing_orders WHERE status='pending'").n,
    pendingReview: get("SELECT COUNT(*) AS n FROM employer_listings WHERE status='open' AND review_status='pending'").n,
    refundedOrders: get("SELECT COUNT(*) AS n FROM employer_listing_orders WHERE status='refunded'").n
  };
  return {
    settings: config(),
    employers: all('SELECT * FROM employer_accounts ORDER BY updated_at DESC,id DESC LIMIT 200').map(profileOut),
    listings: all(
      "SELECT * FROM employer_listings ORDER BY (status='open' AND review_status='pending') DESC,CASE WHEN status='open' AND review_status='pending' THEN created_at END ASC,updated_at DESC,id DESC LIMIT 200"
    ).map((l) => listingOut(l)),
    orders: all(
      "SELECT * FROM employer_listing_orders ORDER BY CASE WHEN status='pending' AND test=0 THEN 0 WHEN status='pending' THEN 1 ELSE 2 END,CASE WHEN status='pending' THEN created_at END ASC,created_at DESC,id DESC LIMIT 200"
    ).map(orderOut),
    metrics
  };
}
module.exports = {
  CATEGORIES,
  config,
  search,
  publicJob,
  employerDashboard,
  saveProfile,
  createListing,
  updateListing,
  submitListing,
  closeListing,
  archiveListing,
  createOrder,
  testPay,
  cancelOrder,
  sendInquiry,
  listInquiries,
  reviewInquiry,
  adminDashboard,
  adminLookup,
  saveSettings,
  reviewListing,
  confirmPayment,
  recordRefund,
  setEmployerStatus
};
