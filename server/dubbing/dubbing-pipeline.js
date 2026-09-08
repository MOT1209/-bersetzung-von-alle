// server/dubbing/dubbing-pipeline.js — خط أنابيب الدبلجة الكامل (يوتيوب → MP4 مدبلج)
// المراحل: metadata → transcript (GeminiVideo → captions → Whisper) → segments →
// ترجمة → TTS لكل مقطع → timing → mix → mux → subtitles. كل مرحلة تُخزَّن في
// projects/{projectId}/ فلا تُعاد عند تكرار نفس الفيديو/اللغة.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const { extractVideoId, getTranscript } = require('../youtube');
const { buildTimeline } = require('./segment-processor');
const { mapSpeakersToVoices } = require('./voice-manager');
const { fitAudioToSlot } = require('./timing-engine');
const { mixSegments } = require('./audio-mixer');
const { buildSrt, buildVtt, muxVideo, extractOriginalAudio } = require('./export-service');
const { downloadVideo } = require('../downloader');
const config = require('../config');

const PROJECTS_DIR = path.join(__dirname, '..', '..', 'projects');

// ===== Gemini quota cooldown: لا نضرب الحصة الميتة داخل نفس الـ job =====
let geminiVideoCooldownUntil = 0;
function geminiCooling() { return Date.now() < geminiVideoCooldownUntil; }
function geminiBackoff(ms = 10 * 60 * 1000) { geminiVideoCooldownUntil = Date.now() + ms; }

function projectDir(projectId) {
  const safe = String(projectId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'p';
  return path.join(PROJECTS_DIR, safe);
}
function errAr(code) {
  const map = {
    'no-transcript': 'تعذر الحصول على نص الفيديو — لا توجد ترجمة نصية وفشل التفريغ الصوتي.',
    'translate-failed': 'موفر الترجمة غير متاح حاليًا — أعد المحاولة بعد قليل.',
    'tts-failed': 'تعذر توليد الصوت — خدمة النطق مزدحمة، أعد المحاولة.',
    'download-failed': 'تعذر تنزيل الفيديو — قد يكون محجوبًا على الخادم.',
    'youtube-blocked': 'يوتيوب رفض الطلب من هذا الخادم — جرب لاحقًا.',
  };
  return map[code] || 'تعذر إكمال الدبلجة — أعد المحاولة.';
}

async function getVideoMetadata(videoId) {
  try {
    const bin = require('../downloader').ytDlpBin();
    const { stdout } = await execFileAsync(bin,
      ['--no-warnings', '--no-playlist', '--dump-json', '--no-cache-dir', `https://www.youtube.com/watch?v=${videoId}`],
      { timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
    const j = JSON.parse(stdout);
    return { title: j.title || videoId, duration: Number(j.duration) || 0, channel: j.channel || '' };
  } catch { return { title: videoId, duration: 0, channel: '' }; }
}

async function resolveTranscript(videoId, targetLang, onStage) {
  // 1) Gemini Video (إن لم يكن في cooldown)
  if (!geminiCooling()) {
    try {
      const gv = require('../geminiVideo');
      if (gv.isAvailable()) {
        onStage && onStage('transcribing', 'فهم الفيديو بالذكاء الاصطناعي…');
        const r = await gv.translateYouTubeVideo(videoId, targetLang);
        if (r.captions && r.captions.length) return { transcript: r.captions, source: 'gemini', sourceLang: r.sourceLang };
      }
    } catch (e) {
      if (e && (e.code === 'gemini-rate-limited' || /429|quota/i.test(e.message || ''))) geminiBackoff();
    }
  }
  // 2) ترجمات يوتيوب النصية
  try {
    onStage && onStage('transcribing', 'جلب ترجمات يوتيوب…');
    const list = await getTranscript(videoId);
    return { transcript: list.map((l) => ({ text: l.text, start: (l.offset || 0) / 1000, duration: (l.duration || 2000) / 1000 })), source: 'captions', sourceLang: 'auto' };
  } catch (e) {
    if (e && e.code !== 'no-transcript') throw e;
  }
  // 3) تفريغ صوتي Whisper
  onStage && onStage('transcribing', 'تفريغ الصوت (لا توجد ترجمة نصية)…');
  const { transcribeVideoAudio } = require('../audio');
  const { chunks } = await transcribeVideoAudio(videoId);
  return { transcript: chunks.map((c) => ({ text: c.text, start: c.start, duration: c.duration })), source: 'audio', sourceLang: 'auto' };
}

async function runDubbingJob(job, jobs) {
  const { updateJob, pushLog } = jobs;
  const { url, targetLang = 'ar', mode = 'full-dub' } = job.params;
  const videoId = extractVideoId(String(url || ''));
  if (!videoId) throw Object.assign(new Error('invalid-url'), { code: 'invalid-url' });
  const dir = projectDir(job.projectId);
  fs.mkdirSync(dir, { recursive: true });
  const stage = (st, label, pct) => {
    updateJob(job.id, { status: st === 'completed' || st === 'failed' ? st : 'processing', stage: label, progress: pct });
    pushLog(job.id, label);
  };

  try {
    stage('analyzing', 'تحليل الفيديو…', 5);
    const metaPath = path.join(dir, 'meta.json');
    let meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : null;
    if (!meta || meta.videoId !== videoId) {
      meta = { videoId, ...(await getVideoMetadata(videoId)) };
      fs.writeFileSync(metaPath, JSON.stringify(meta));
    }

    // تنزيل الفيديو الأصلي (يُعاد استخدامه بين اللغات)
    stage('analyzing', 'تنزيل الفيديو الأصلي…', 12);
    const sourceMp4 = path.join(dir, 'source.mp4');
    if (!fs.existsSync(sourceMp4) || !fs.statSync(sourceMp4).size) {
      await downloadVideo(`https://www.youtube.com/watch?v=${videoId}`, sourceMp4, 300000, config.MAX_VIDEO_BYTES);
    }

    // transcript (مخزّن)
    const trPath = path.join(dir, 'transcript.json');
    let tres;
    if (fs.existsSync(trPath)) {
      tres = JSON.parse(fs.readFileSync(trPath, 'utf8'));
    } else {
      tres = await resolveTranscript(videoId, targetLang, (s, l) => stage(s, l, 25));
      fs.writeFileSync(trPath, JSON.stringify(tres));
    }

    // segments + speakers
    stage('translating', 'تجهيز المقاطع…', 38);
    const timeline = buildTimeline(tres.transcript);
    const voiceMap = mapSpeakersToVoices(timeline.map((s) => s.speaker));

    // ترجمة المقاطع (مع كاش translate.js تلقائيًا + fallback داخلي)
    const translate = require('../translate');
    let sourceLang = tres.sourceLang && tres.sourceLang !== 'auto' ? tres.sourceLang : null;
    if (!sourceLang) {
      const sample = timeline.slice(0, 5).map((s) => s.text).join(' ').slice(0, 500);
      try { sourceLang = await translate.detectLanguage(sample); } catch { sourceLang = 'en'; }
    }
    const segsPath = path.join(dir, `translation-${targetLang}.json`);
    let segments;
    if (fs.existsSync(segsPath)) {
      segments = JSON.parse(fs.readFileSync(segsPath, 'utf8'));
    } else {
      segments = [];
      for (let i = 0; i < timeline.length; i++) {
        const s = timeline[i];
        stage('translating', `ترجمة المقاطع ${i + 1}/${timeline.length}…`, 38 + Math.round((i / timeline.length) * 22));
        const { translated } = await translate.translateTextWithMeta(s.text, targetLang, sourceLang);
        segments.push({ ...s, original: s.text, translated, voice: voiceMap[s.speaker] || voiceMap[Object.keys(voiceMap)[0]] });
      }
      fs.writeFileSync(segsPath, JSON.stringify(segments));
    }

    // TTS لكل مقطع (مخزّن لكل لغة)
    const tts = require('../tts');
    const clipsDir = path.join(dir, `tts-${targetLang}`);
    fs.mkdirSync(clipsDir, { recursive: true });
    const clips = [];
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      stage('voicing', `توليد الصوت ${i + 1}/${segments.length}…`, 62 + Math.round((i / segments.length) * 15));
      const rawPath = path.join(clipsDir, `seg-${String(i).padStart(3, '0')}-raw.mp3`);
      const fitPath = path.join(clipsDir, `seg-${String(i).padStart(3, '0')}.mp3`);
      try {
        if (!fs.existsSync(rawPath) || !fs.statSync(rawPath).size) {
          const buf = await tts.textToMp3Buffer(s.translated || s.original, targetLang);
          fs.writeFileSync(rawPath, buf);
        }
        const slotSec = Math.max(1, (s.end - s.start) || s.duration || 2);
        await fitAudioToSlot(rawPath, fitPath, slotSec);
        segments[i].audio = path.basename(fitPath);
        clips.push({ file: fitPath, start: s.start });
      } catch (e) {
        pushLog(job.id, `TTS فشل للمقطع ${i}: ${e.message}`);
        // مقطع فاشل يُتخطى — لا يُسقط المهمة كلها
      }
    }
    if (!clips.length) throw Object.assign(new Error('tts-failed'), { code: 'tts-failed' });
    fs.writeFileSync(segsPath, JSON.stringify(segments));

    // Mix
    stage('rendering', 'مزج الصوت…', 80);
    let originalAudio = null;
    if (mode === 'voice-over' || mode === 'mix') {
      originalAudio = path.join(dir, 'source-bg.wav');
      if (!fs.existsSync(originalAudio)) await extractOriginalAudio(sourceMp4, originalAudio);
    }
    const totalSec = Math.max(...segments.map((s) => s.end)) + 2;
    const dubbedMp3 = path.join(dir, `dubbing-${targetLang}.mp3`);
    await mixSegments(clips, dubbedMp3, { mode, totalSec, originalAudio });

    // Mux + subtitles
    stage('rendering', 'دمج الفيديو النهائي…', 90);
    const finalMp4 = path.join(dir, `dubbed-${targetLang}.mp4`);
    await muxVideo(sourceMp4, dubbedMp3, finalMp4);
    const srt = buildSrt(segments.map((s) => ({ ...s, text: s.original })));
    const vtt = buildVtt(segments.map((s) => ({ ...s, text: s.original })));
    fs.writeFileSync(path.join(dir, `subtitles-${targetLang}.srt`), srt);
    fs.writeFileSync(path.join(dir, `subtitles-${targetLang}.vtt`), vtt);

    const stat = fs.statSync(finalMp4);
    const result = {
      videoUrl: `/api/projects/${job.projectId}/dubbed-${targetLang}.mp4`,
      audioUrl: `/api/projects/${job.projectId}/dubbing-${targetLang}.mp3`,
      srtUrl: `/api/projects/${job.projectId}/subtitles-${targetLang}.srt`,
      vttUrl: `/api/projects/${job.projectId}/subtitles-${targetLang}.vtt`,
      sourceLang, targetLang, mode, segments: segments.length,
      sizeBytes: stat.size, title: meta.title,
    };
    updateJob(job.id, { status: 'completed', stage: 'مكتمل ✓', progress: 100, result });
    return result;
  } catch (e) {
    const code = (e && e.code) || 'server-error';
    updateJob(job.id, { status: 'failed', stage: 'فشل', progress: 100, error: code, errorAr: errAr(code) });
    throw e;
  }
}

module.exports = { runDubbingJob, projectDir, PROJECTS_DIR };
