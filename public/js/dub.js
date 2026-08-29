/* ---------- الدبلجة: تشغيل الفيديو بصوت مترجَم بدل الصوت الأصلي ---------- */
//
// الفكرة: لا نُنتج ملفًا مدبلجًا واحدًا — نكتم صوت فيديو يوتيوب، ثم نشغّل مقطعًا
// صوتيًا لكل سطر ترجمة عند طابعه الزمني. هذا يبقي التزامن مع تحكّم المستخدم
// (تقديم/تأخير/إيقاف) بلا إعادة توليد، ويجعل الدبلجة تبدأ خلال ثوانٍ.
//
// الجلب كسول ومسبق: نطلب من الخادم دفعة المقاطع الواقعة ضمن نافذة أمام موضع
// التشغيل فقط. توليد فيديو كامل مقدّمًا يعني انتظارًا طويلًا وحمولة ضخمة.
import { state, postJson } from './utils.js';
import { showToast, targetLang, dubBtn } from './ui.js';
import { getYtPlayer } from './media.js';

const BATCH_SIZE   = 20;   // مقاطع لكل طلب (الخادم يقبل 40 كحد أقصى)
const PREFETCH_SEC = 30;   // نجلب ما يقع خلال هذه المهلة أمام موضع التشغيل
const TICK_MS      = 250;  // دقة الجدولة — أدقّ من مدة أي مقطع
const START_TOL    = 1.5;  // تسامح البدء: لا نشغّل مقطعًا فات موعده بأكثر من ذلك

let active     = false;
let timer      = null;
let segments   = [];       // [{ start, text, audio: HTMLAudioElement|null, state }]
let currentAud = null;
let currentIdx = -1;
let fetching   = false;

/* ---------- تحويل مقاطع النتيجة إلى مقاطع دبلجة ---------- */
function buildSegments(captions) {
  return (captions || [])
    .map((c) => ({
      start: Number(c.start) || 0,
      text:  (c.translated || c.original || '').trim(),
      audio: null,
      state: 'idle', // idle | loading | ready | failed
    }))
    .filter((s) => s.text.length > 0)
    .sort((a, b) => a.start - b.start);
}

function playerTime() {
  const p = getYtPlayer();
  if (!p || typeof p.getCurrentTime !== 'function') return null;
  try { return p.getCurrentTime() || 0; } catch { return null; }
}

/* ---------- الجلب المسبق ---------- */
async function prefetch(now) {
  if (fetching) return;
  const pending = [];
  for (let i = 0; i < segments.length && pending.length < BATCH_SIZE; i++) {
    const s = segments[i];
    if (s.state !== 'idle') continue;
    if (s.start < now - START_TOL) { s.state = 'failed'; continue; } // فات موعده
    if (s.start > now + PREFETCH_SEC) break;                          // مرتّبة زمنيًا
    pending.push(i);
  }
  if (pending.length === 0) return;

  fetching = true;
  for (const i of pending) segments[i].state = 'loading';
  try {
    const { data } = await postJson('/api/dub', {
      lang: targetLang.value,
      segments: pending.map((i) => ({ start: segments[i].start, text: segments[i].text })),
    });
    const out = (data && data.segments) || [];
    pending.forEach((segIdx, k) => {
      const seg = segments[segIdx];
      const b64 = out[k] && out[k].audio;
      if (!b64) { seg.state = 'failed'; return; }
      seg.audio = new Audio('data:audio/mpeg;base64,' + b64);
      seg.state = 'ready';
    });
  } catch {
    // فشل الشبكة: أعِد المقاطع إلى idle لتُجرَّب في الدورة التالية
    for (const i of pending) if (segments[i].state === 'loading') segments[i].state = 'idle';
  } finally {
    fetching = false;
  }
}

/* ---------- الجدولة ---------- */
function stopCurrent() {
  if (!currentAud) return;
  try { currentAud.pause(); currentAud.currentTime = 0; } catch { /* تجاهل */ }
  currentAud = null;
}

function tick() {
  const now = playerTime();
  if (now === null) return;

  prefetch(now);

  // ابحث عن آخر مقطع بدأ موعده وما زال ضمن التسامح
  let idx = -1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].start > now) break;
    idx = i;
  }
  if (idx === -1 || idx === currentIdx) return;

  const seg = segments[idx];
  // تجاوز فات موعده بكثير (قفز المستخدم للأمام) — لا تشغّله متأخرًا
  if (now - seg.start > START_TOL) { currentIdx = idx; return; }
  if (seg.state !== 'ready' || !seg.audio) { currentIdx = idx; return; }

  stopCurrent(); // مقطع سابق ما زال يتكلم: الجديد أولى بالتزامن
  currentIdx = idx;
  currentAud = seg.audio;
  try {
    currentAud.currentTime = 0;
    currentAud.play().catch(() => { /* منع تشغيل تلقائي — يزول بأول تفاعل */ });
  } catch { /* تجاهل */ }
}

/* ---------- التشغيل/الإيقاف ---------- */
export function stopDubbing() {
  active = false;
  if (timer) { clearInterval(timer); timer = null; }
  stopCurrent();
  segments = [];
  currentIdx = -1;
  fetching = false;
  const p = getYtPlayer();
  if (p && typeof p.unMute === 'function') { try { p.unMute(); } catch { /* تجاهل */ } }
  if (dubBtn) { dubBtn.classList.remove('active'); dubBtn.textContent = '🎙️ دبلجة'; }
}

export function toggleDubbing() {
  if (active) { stopDubbing(); showToast('أُوقفت الدبلجة — عاد الصوت الأصلي'); return; }

  const data = state.current;
  if (!data || data.type !== 'youtube') return;

  const p = getYtPlayer();
  // الاحتياطي عند تعذّر تحميل واجهة يوتيوب هو iframe عادي بلا تحكّم برمجي،
  // فلا وقت حالي نتزامن معه ولا كتم للصوت الأصلي — الدبلجة مستحيلة حينها.
  if (!p || typeof p.getCurrentTime !== 'function' || typeof p.mute !== 'function') {
    showToast('الدبلجة غير متاحة — تعذّر تحميل مشغّل يوتيوب');
    return;
  }

  segments = buildSegments(data.captions);
  if (segments.length === 0) { showToast('لا توجد ترجمات لدبلجتها'); return; }

  try { p.mute(); } catch { /* تجاهل */ }
  active = true;
  currentIdx = -1;
  if (dubBtn) { dubBtn.classList.add('active'); dubBtn.textContent = '🎙️ إيقاف الدبلجة'; }
  showToast('الدبلجة تعمل — الصوت الأصلي مكتوم');

  prefetch(playerTime() || 0);
  timer = setInterval(tick, TICK_MS);
}

export function isDubbing() { return active; }
