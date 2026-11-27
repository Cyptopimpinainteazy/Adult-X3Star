'use strict';
const express = require('express');
const A = require('../auth');
const J = require('../jobs');
const router = express.Router();
router.get('/creators/:id/jobs', (req, res) => res.json({ jobs: J.listPublic(req.params.id) }));
router.post('/jobs/:id/inquiries', A.requireUser, A.rateLimit('job_inquiry', 20, 3600000), (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(201).json({ ok: true, inquiry: J.inquire(req.params.id, req.user, req.body) });
});
module.exports = router;
