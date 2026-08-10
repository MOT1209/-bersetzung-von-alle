// server/routes-video.js — بثّ الفيديو المترجم (خيار «تشغيل بترجمات مدمجة»)
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { downloadVideo } = require('./downloader');

const router = express.Router();

// ===== GET /api/video/:videoId — تنزيل فيديو يوتيوب (≤720p) وبثّه مؤقتًا =====
router.get('/video/:videoId', async (req, res) => {
  const videoId = String(req.params.videoId || '');
  if (!/^[\w-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'invalid-url' });
  }

  // مسار مطلق (Windows: لا تستخدم /tmp — يُحل إلى C:\tmp)
  const dir = path.join(os.tmpdir(), 'aralink');
  const outPath = path.join(dir, `video-${videoId}.mp4`);

  try {
    await fs.promises.mkdir(dir, { recursive: true });

    // إن وُجد ملف سابق من تنزيل مكتمل نعيد استخدامه (موفر زمن)
    let stat = null;
    try { stat = await fs.promises.stat(outPath); } catch (e) { /* غير موجود */ }
    if (!stat || !stat.size) {
      await downloadVideo('https://www.youtube.com/watch?v=' + videoId, outPath, 240000);
      stat = await fs.promises.stat(outPath);
    }

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `inline; filename="aralink-${videoId}.mp4"`);

    const stream = fs.createReadStream(outPath);
    stream.on('error', () => { if (!res.headersSent) res.status(422).json({ error: 'video-download-failed' }); });
    stream.pipe(res);
    res.on('finish', () => {
      // تنظيف الملف المؤقت بعد إرسال كامل (مع مهلة أمان)
      setTimeout(() => fs.promises.unlink(outPath).catch(() => {}), 5000);
    });
    res.on('close', () => {
      if (!res.writableEnded) fs.promises.unlink(outPath).catch(() => {});
    });
  } catch (e) {
    console.error('[video] download failed:', e && e.message);
    fs.promises.unlink(outPath).catch(() => {});
    if (!res.headersSent) return res.status(422).json({ error: 'video-download-failed' });
  }
});

module.exports = router;
