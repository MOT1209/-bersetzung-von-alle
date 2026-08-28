// server/routes-video.js — بثّ الفيديو المترجم (خيار «تشغيل بترجمات مدمجة»)
// حماية من السباق: تنزيل واحد لكل videoId يُشارَك بين المستهلكين المتزامنين +
// عدّ مراجع يحرس الحذف حتى ينتهي آخر مستهلك من البث (لتفادي حذف ملف لا يزال يُقرأ).
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { downloadVideo } = require('./downloader');

const router = express.Router();

// ===== حالة التنزيل لكل فيديو =====
// videoId → { promise, file, size, refs, cleanupTimer, settled }
//   - promise: وعد التنزيل/الفحص (يكتمل سواء نجح أو فشل)
//   - settled: true عندما انتهى الوعد (نجاح أو فشل) — لا حاجة للانتظار بعد الآن
//   - refs: عدد المستهلكين النشطين للبث
const inFlight = new Map();

// ===== مساعدة إصدار المرجع =====
// تُستدعى مرة واحدة فقط لكل طلب (.hammer via per-request `released` flag)
// لتمنع النقصان المزدوج عند إطلاق finish+close أو error+close معًا.
const releaseRef = (id) => {
  const e = inFlight.get(id);
  if (!e) return;
  e.refs = Math.max(0, e.refs - 1);
  if (e.refs === 0) {
    // لا يبقى أحد يقرأ الملف — جدول الحذف مع مهلة سماح قصيرة
    if (e.cleanupTimer) clearTimeout(e.cleanupTimer);
    e.cleanupTimer = setTimeout(() => {
      // تحقق نهائي أن لا أحد اشترَك في الأثناء
      const cur = inFlight.get(id);
      if (cur && cur.refs === 0) {
        inFlight.delete(id);
        fs.promises.unlink(cur.file).catch(() => { /* الملف رُفع أو لا يوجد — تجاهل */ });
      }
    }, 5000);
    if (e.cleanupTimer.unref) e.cleanupTimer.unref();
  }
};

// ===== تحليل طلب Range =====
// يُعيد { start, end } أو null إذا الرأس غائب/غير صالح
// يحتسب end غير المحدد كـ size-1
function parseRange(rangeHeader, size) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) return null;
  const spec = rangeHeader.slice(6).trim();
  if (!spec) return null;

  if (spec.startsWith('-')) {
    // bytes=-<suffix> → آخر N بايت
    const suffix = parseInt(spec.slice(1), 10);
    if (isNaN(suffix) || suffix <= 0) return null;
    const start = Math.max(0, size - suffix);
    return { start, end: size - 1 };
  }

  const parts = spec.split('-');
  if (parts.length !== 2) return null;
  const start = parseInt(parts[0], 10);
  const end = parts[1] === '' ? size - 1 : parseInt(parts[1], 10);
  if (isNaN(start) || isNaN(end)) return null;
  if (start > end || start < 0 || end >= size) return null;
  return { start, end };
}

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

    // إذا الملف مكتمل مسبقاً (من طلب سابق) نتجاوز التنزيل ونشاركه
    let stat = null;
    try { stat = await fs.promises.stat(outPath); } catch (e) { /* غير موجود */ }
    const alreadyThere = stat && stat.size > 0;

    // قفل لكل فيديو: أول قادم يُنزّل، الباقون ينتظرون نفس الوعد ويتلقّون نفس الملف
    let entry = inFlight.get(videoId);
    if (!entry || entry.settled) {
      if (alreadyThere) {
        // لا حاجة لتنزيل — نبني وعدًا محلولاً فوراً
        entry = { promise: Promise.resolve(stat), file: outPath, size: stat.size, refs: 0, cleanupTimer: null, settled: true };
      } else {
        entry = {
          promise: downloadVideo('https://www.youtube.com/watch?v=' + videoId, outPath, 240000)
            .then(() => fs.promises.stat(outPath))
            .catch((e) => {
              // تنظيف الفشل وإزالة من الخريطة لإعادة المحاولة لاحقاً
              inFlight.delete(videoId);
              throw e;
            }),
          file: outPath,
          size: 0,
          refs: 0,
          cleanupTimer: null,
          settled: false,
        };
      }
      inFlight.set(videoId, entry);
    }

    // ننتظر اكتمال التنزيل (نجاحاً أو فشلاً) — الجميع يحصل على نفس الوعد
    const finalStat = await entry.promise;
    // الوعد اكتمل الآن (ناجح أو مرفوض)
    entry.settled = true;
    entry.size = finalStat.size;

    // تسجيل كمستهلك نشط
    entry.refs += 1;

    // إلغاء أي حذف سابق كان مجدولاً (مستهلك جديد أعاد إحياء الملف)
    if (entry.cleanupTimer) {
      clearTimeout(entry.cleanupTimer);
      entry.cleanupTimer = null;
    }

    // ===== دعم Range Requests =====
    const fileSize = entry.size;
    const range = parseRange(req.headers.range, fileSize);

    if (range && req.headers.range) {
      // طلب جزئي — 206 Partial Content
      const start = range.start;
      const end = range.end;
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunkSize);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Disposition', `inline; filename="aralink-${videoId}.mp4"`);

      const stream = fs.createReadStream(entry.file, { start, end });

      // حماية من النقصان المزدوج: علامة واحد لكل طلب
      let released = false;
      const safeRelease = () => {
        if (!released) {
          released = true;
          releaseRef(videoId);
        }
      };

      stream.on('error', (err) => {
        console.error('[video] read stream error:', err && err.message);
        safeRelease();
        if (!res.headersSent) {
          res.status(422).json({ error: 'video-download-failed' });
        } else {
          res.destroy();
        }
      });

      stream.pipe(res);

      res.on('finish', safeRelease);
      res.on('close', () => {
        if (!res.writableEnded) safeRelease();
      });
    } else {
      // طلب كامل — 200 OK (يدعم Range للمستقبلات القادرة)
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Disposition', `inline; filename="aralink-${videoId}.mp4"`);

      const stream = fs.createReadStream(entry.file);

      // حماية من النقصان المزدوج: علامة واحد لكل طلب
      let released = false;
      const safeRelease = () => {
        if (!released) {
          released = true;
          releaseRef(videoId);
        }
      };

      stream.on('error', (err) => {
        console.error('[video] read stream error:', err && err.message);
        safeRelease();
        if (!res.headersSent) {
          res.status(422).json({ error: 'video-download-failed' });
        } else {
          res.destroy();
        }
      });

      stream.pipe(res);

      res.on('finish', safeRelease);
      res.on('close', () => {
        if (!res.writableEnded) safeRelease();
      });
    }
  } catch (e) {
    console.error('[video] download failed:', e && e.message);
    // لا داعي للحذف هنا — وعد التنزيل هو من يتعامل مع الفشل
    if (!res.headersSent) return res.status(422).json({ error: 'video-download-failed' });
  }
});

module.exports = router;
