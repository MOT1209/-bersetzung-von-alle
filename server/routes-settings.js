// server/routes-settings.js — مسارات API للإعدادات (قراءة/حفظ مفاتيح .env)
// يُركّب على /api/settings في server.js بدون حد طلبات (يقرأ/يكتب ملفًا محليًا فقط)
const express = require('express');
const { getSettings, saveSettings } = require('./envSettings');
const { getRules, addRule, removeRule } = require('./extractionRules');

const router = express.Router();

// ===== GET /api/settings — عرض الإعدادات الحالية (المفاتيح مقنّعة) =====
router.get('/', async (req, res) => {
  try {
    res.json(await getSettings());
  } catch (e) {
    console.error('[settings] GET error:', e.message);
    res.status(500).json({ error: 'server-error' });
  }
});

// ===== POST /api/settings — حفظ الإعدادات وتطبيقها فورًا =====
router.post('/', async (req, res) => {
  try {
    const result = await saveSettings(req.body);
    res.json(result);
  } catch (e) {
    console.error('[settings] POST error:', e.message);
    if (e.code === 'invalid-settings') {
      return res.status(400).json({ error: 'invalid-settings' });
    }
    res.status(500).json({ error: 'server-error' });
  }
});

// ===== قواعد الاستخراج المخصصة (المواقع الصعبة) =====

// GET /api/settings/rules — عرض القواعد
router.get('/rules', async (req, res) => {
  try {
    res.json({ rules: await getRules() });
  } catch (e) {
    console.error('[rules] GET error:', e.message);
    res.status(500).json({ error: 'server-error' });
  }
});

// POST /api/settings/rules — إضافة/تحديث قاعدة { domain, titleSelector?, contentSelectors? }
router.post('/rules', async (req, res) => {
  try {
    const result = await addRule(req.body);
    res.json(result);
  } catch (e) {
    console.error('[rules] POST error:', e.message);
    if (e.code === 'invalid-rule' || e.code === 'too-many-rules') {
      return res.status(400).json({ error: e.code });
    }
    res.status(500).json({ error: 'server-error' });
  }
});

// DELETE /api/settings/rules/:domain — حذف قاعدة
router.delete('/rules/:domain', async (req, res) => {
  try {
    res.json(await removeRule(req.params.domain));
  } catch (e) {
    console.error('[rules] DELETE error:', e.message);
    res.status(500).json({ error: 'server-error' });
  }
});

module.exports = router;
