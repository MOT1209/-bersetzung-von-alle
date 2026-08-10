// server/routes-settings.js — مسارات API للإعدادات (قراءة/حفظ مفاتيح .env)
// يُركّب على /api/settings في server.js بدون حد طلبات (يقرأ/يكتب ملفًا محليًا فقط)
const express = require('express');
const { getSettings, saveSettings } = require('./envSettings');

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

module.exports = router;
