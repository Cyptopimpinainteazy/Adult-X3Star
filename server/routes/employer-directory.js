'use strict';
const express = require('express');
const A = require('../auth');
const E = require('../employer-directory');
const router = express.Router();
const noStore = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
router.get('/directory/jobs', (req, res) => res.json(E.search(req.query)));
router.get('/directory/jobs/:id', (req, res) => res.json({ job: E.publicJob(req.params.id) }));
router.post(
  '/directory/jobs/:id/inquiries',
  A.requireUser,
  noStore,
  A.rateLimit('directory_inquiry', 20, 3600000),
  (req, res) => res.status(201).json({ ok: true, inquiry: E.sendInquiry(req.user, req.params.id, req.body) })
);
router.use('/employer', A.requireUser, noStore);
router.get('/employer', (req, res) => res.json(E.employerDashboard(req.user)));
router.put('/employer/profile', (req, res) => res.json({ profile: E.saveProfile(req.user, req.body) }));
router.post('/employer/listings', A.rateLimit('employer_listing', 60, 3600000), (req, res) =>
  res.status(201).json({ listing: E.createListing(req.user, req.body) })
);
router.put('/employer/listings/:id', (req, res) =>
  res.json({ listing: E.updateListing(req.user, req.params.id, req.body) })
);
router.post('/employer/listings/:id/submit', (req, res) =>
  res.json({ listing: E.submitListing(req.user, req.params.id) })
);
router.post('/employer/listings/:id/close', (req, res) =>
  res.json({ listing: E.closeListing(req.user, req.params.id) })
);
router.delete('/employer/listings/:id', (req, res) => res.json(E.archiveListing(req.user, req.params.id)));
router.post('/employer/listings/:id/orders', A.rateLimit('employer_order', 30, 3600000), (req, res) =>
  res.status(201).json({ order: E.createOrder(req.user, req.params.id) })
);
router.post('/employer/orders/:id/test-pay', (req, res) => res.json({ order: E.testPay(req.user, req.params.id) }));
router.post('/employer/orders/:id/cancel', (req, res) => res.json({ order: E.cancelOrder(req.user, req.params.id) }));
router.get('/employer/listings/:id/inquiries', (req, res) =>
  res.json({ inquiries: E.listInquiries(req.user, req.params.id) })
);
router.patch('/employer/listings/:id/inquiries/:inquiryId', (req, res) =>
  res.json({ inquiry: E.reviewInquiry(req.user, req.params.id, req.params.inquiryId, req.body && req.body.status) })
);
router.use('/admin/employer-directory', A.requireRole('admin'), noStore);
router.get('/admin/employer-directory', (_req, res) => res.json(E.adminDashboard()));
router.get('/admin/employer-directory/lookup', (req, res) => res.json(E.adminLookup(req.user, req.query)));
router.put('/admin/employer-directory/settings', (req, res) =>
  res.json({ settings: E.saveSettings(req.user, req.body) })
);
router.post('/admin/employer-directory/listings/:id/review', (req, res) =>
  res.json({ listing: E.reviewListing(req.user, req.params.id, req.body) })
);
router.post('/admin/employer-directory/orders/:id/confirm', (req, res) =>
  res.json({ order: E.confirmPayment(req.user, req.params.id, req.body) })
);
router.post('/admin/employer-directory/orders/:id/refund', (req, res) =>
  res.json({ order: E.recordRefund(req.user, req.params.id, req.body) })
);
router.post('/admin/employer-directory/employers/:id/status', (req, res) =>
  res.json({ profile: E.setEmployerStatus(req.user, req.params.id, req.body && req.body.status) })
);
module.exports = router;
