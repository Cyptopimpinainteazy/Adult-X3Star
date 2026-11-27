'use strict';
const router = require('express').Router();
const N = require('../network');
router.use('/network', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
router.get('/network/talent', (req, res) => res.json(N.searchTalent(req.query)));
router.get('/network/talent/:id', (req, res) => res.json(N.talentProfile(req.params.id)));
router.get('/network/opportunities', (req, res) => res.json(N.searchOpportunities(req.query)));
router.get('/network/companies', (req, res) => res.json(N.searchCompanies(req.query)));
router.get('/network/companies/:id', (req, res) => res.json(N.companyProfile(req.params.id)));
module.exports = router;
