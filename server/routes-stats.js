// server/routes-stats.js — dashboard statistics endpoints
// All routes are mounted under /api/stats in server.js with requireAdmin middleware.

const express = require('express');
const router = express.Router();
const { getSummary, getTimeseries, getProviders, getLanguages, getHourly } = require('./stats');

// GET /api/stats/summary — totals, today, week, byType
router.get('/summary', async (req, res, next) => {
  try {
    const data = await getSummary();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/timeseries?days=7 — daily counts (max 30)
router.get('/timeseries', async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 30);
    const data = await getTimeseries(days);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/providers — translation provider breakdown
router.get('/providers', async (req, res, next) => {
  try {
    const data = await getProviders();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/languages — source/target language usage
router.get('/languages', async (req, res, next) => {
  try {
    const data = await getLanguages();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/hourly — translations by hour of day (0-23)
router.get('/hourly', async (req, res, next) => {
  try {
    const data = await getHourly();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
