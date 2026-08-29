/* ---------- الدبلجة: تشغيل الفيديو بصوت مترجَم بدل الصوت الأصلي ---------- */
//
// الفكرة: لا نُنتج ملفًا مدبلجًا واحدًا — نكتم صوت فيديو يوتيوب، ثم نشغّل مقطعًا
// صوتيًا لكل سطر ترجمة عند طابعه الزمني. هذا يبقي التزامن مع تحكّم المستخدم
// (تقديم/تأخير/إيقاف) بلا إعادة توليد، ويجعل الدبلجة تبدأ خلال ثوانٍ.
//
// الجلب كسول ومسبق: نطلب من الخادم دفعة المقاطع الواقعة ضمن نافذة أمام موضع
// التشغيل فقط. توليد فيديو كامل مقدّمًا يعني انتظارًا طويلًا وحمولة ضخمة.
import { state, postJson } from './utils.js';
import { showToast, showError, targetLang, dubBtn, dubPlayer, dubStatus } from './ui.js';
import { getYtPlayer } from './media.js';

const BATCH_SIZE   = 20;   // مقاطع لكل طلب (الخادم يقبل 40 كحد أقصى)
const PREFETCH_SEC = 45;   // نجلب ما يقع خلال هذه المهلة أمام موضع التشغيل
// بلا هذا الحدّ يخرج طلبٌ لكل مقطع يدخل النافذة (مقطع كل ٣ ثوانٍ ⇒ ٢٠ طلبًا في
// الدقيقة). ننتظر تجمّع دفعة، ما لم يقترب موعد أوّلها فنجلب ما تجمّع فورًا.
const MIN_BATCH    = 8;    // أقل عدد يستحق طلبًا
const URGENT_SEC   = 12;   // مقطعٌ أقرب من ذلك يُجلب فورًا مهما قلّت الدفعة
const TICK_MS      = 200;  // دقة الجدولة — أدقّ من مدة أي مقطع
const START_TOL    = 2.5;  // تسامح البدء: لا نشغّل مقطعًا فات موعده بأكثر من ذلك
const MAX_TRIES    = 2;    // محاولات توليد المقطع قبل اعتباره فاشلًا نهائيًا

let active   = false;
let timer    = null;
let segments = [];   // [{ start, text, parts, state, tries }]
let fetching = false;
let playing  = null; // { idx, queue } — المقطع الجاري وبقية أجزائه

/* ---------- تحويل مقاطع النتيجة إلى مقاطع دبلجة ---------- */
function buildSegments(captions) {
  return (captions || [])
    .map((c) => ({
      start: Number(c.start) || 0,
      text:  (c.translated || c.original || '').trim(),
      parts: [],     // روابط blob لأجزاء السطر، تُشغَّل بالتتابع
      state: 'idle', // idle | loading | ready | played | failed
      tries: 0,
    }))
    .filter((s) => s.text.length > 0)
    .sort((a, b) => a.start - b.start);
}

function playerTime() {
  const p = getYtPlayer();
  if (!p || typeof p.getCurrentTime !== 'function') return null;
  try { return p.getCurrentTime() || 0; } catch { return null; }
}

function setStatus(text) {
  if (!dubStatus) return;
  dubStatus.textContent = text || '';
  dubStatus.hidden = !text;
}

/* ---------- الجلب المسبق ---------- */
// النافذة تبدأ من الوقت الحالي: ما فات موعده لا يُطلب، لكنه يبقى idle لا failed —
// المستخدم قد يعود للخلف، وحرق المقطع نهائيًا يعني صمتًا دائمًا عند إعادة المشاهدة.
// force: جلب فوري بلا انتظار تجمّع دفعة — للانطلاقة الأولى، حيث الانتظار يعني
// أن يضغط المستخدم «دبلجة» فلا يحدث شيء.
async function prefetch(now, force = false) {
  if (fetching) return false;
  const pending = [];
  for (let i = 0; i < segments.length && pending.length < BATCH_SIZE; i++) {
    const s = segments[i];
    if (s.state !== 'idle') continue;
    if (s.start < now - START_TOL) continue;          // فات موعده — لا نطلبه الآن
    if (s.start > now + PREFETCH_SEC) break;          // مرتّبة زمنيًا
    pending.push(i);
  }
  if (pending.length === 0) return false;
  // دفعة صغيرة وبعيدة: انتظر تجمّعها بدل إنفاق طلب عليها
  const urgent = force || segments[pending[0]].start <= now + URGENT_SEC;
  if (pending.length < MIN_BATCH && !urgent) return false;

  fetching = true;
  for (const i of pending) segments[i].state = 'loading';
  try {
    const { status, data } = await postJson('/api/dub', {
      lang: targetLang.value,
      segments: pending.map((i) => ({ start: segments[i].start, text: segments[i].text })),
    });
    if (status !== 200) {
      // خطأ من الخادم (لغة غير مدعومة، حدّ معدّل): أعِدها idle وأبلغ المُستدعي
      for (const i of pending) segments[i].state = 'idle';
      return { error: (data && data.error) || 'server-error', status };
    }
    const out = (data && data.segments) || [];
    pending.forEach((segIdx, k) => {
      const seg = segments[segIdx];
      const parts = (out[k] && out[k].audio) || [];
      if (parts.length === 0) {
        seg.tries++;
        seg.state = seg.tries >= MAX_TRIES ? 'failed' : 'idle';
        return;
      }
      seg.parts = parts.map((b64) => 'data:audio/mpeg;base64,' + b64);
      seg.state = 'ready';
    });
    return true;
  } catch {
    // فشل الشبكة: أعِد المقاطع إلى idle لتُجرَّب في الدورة التالية
    for (const i of pending) if (segments[i].state === 'loading') segments[i].state = 'idle';
    return false;
  } finally {
    fetching = false;
  }
}

/* ---------- تشغيل أجزاء سطر واحد بالتتابع ---------- */
function stopCurrent() {
  playing = null;
  if (!dubPlayer) return;
  try { dubPlayer.pause(); dubPlayer.removeAttribute('src'); dubPlayer.load(); } catch { /* تجاهل */ }
}

function playNextPart() {
  if (!playing || !dubPlayer) return;
  const src = playing.queue.shift();
  if (!src) { playing = null; return; }
  try {
    dubPlayer.src = src;
    dubPlayer.play().catch(() => { /* منع تشغيل تلقائي — يزول بأول تفاعل */ });
  } catch { playing = null; }
}

function startSegment(idx) {
  const seg = segments[idx];
  stopCurrent(); // سطر سابق ما زال يتكلم: الجديد أولى بالتزامن
  seg.state = 'played';
  playing = { idx, queue: seg.parts.slice() };
  playNextPart();
}

/* ---------- الجدولة ---------- */
// القاعدة الحاكمة: لا يُوسَم مقطعٌ بشيء لمجرد مرور موعده. المقطع الذي لم يجهز بعد
// يُترك كما هو ليُلتقط في دورة لاحقة — كان وسمُه مبكرًا هو سبب الصمت الكامل.
function tick() {
  const now = playerTime();
  if (now === null) return;

  prefetch(now);

  // آخر سطر بدأ موعده، ما زال ضمن التسامح، وجاهز ولم يُشغَّل بعد
  let idx = -1;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s.start > now) break;
    if (now - s.start > START_TOL) continue;
    if (s.state !== 'ready') continue;
    idx = i;
  }
  if (idx === -1) return;
  if (playing && playing.idx === idx) return;

  startSegment(idx);
}

/* ---------- التشغيل/الإيقاف ---------- */
export function stopDubbing() {
  active = false;
  if (timer) { clearInterval(timer); timer = null; }
  stopCurrent();
  segments = [];
  fetching = false;
  setStatus('');
  const p = getYtPlayer();
  if (p && typeof p.unMute === 'function') { try { p.unMute(); } catch { /* تجاهل */ } }
  if (dubBtn) {
    dubBtn.classList.remove('active');
    dubBtn.disabled = false;
    dubBtn.textContent = '🎙️ دبلجة';
  }
}

export async function toggleDubbing() {
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

  active = true;
  if (dubBtn) {
    dubBtn.classList.add('active');
    dubBtn.disabled = true;
    dubBtn.textContent = '🎙️ جارٍ التحضير…';
  }

  // نوقف الفيديو أثناء تحضير الدفعة الأولى: gTTS يستغرق ثوانٍ، وبلا هذا الإيقاف
  // تمرّ أوائل السطور قبل جاهزية صوتها فتُفقد دبلجتها.
  try { p.pauseVideo(); } catch { /* تجاهل */ }
  setStatus('جارٍ تحضير الدبلجة…');

  const startAt = playerTime() ?? 0;
  const res = await prefetch(startAt, true);
  if (!active) return; // أوقفها المستخدم أثناء التحضير

  if (res && res.error) {
    stopDubbing();
    showError(res.error === 'dub-lang-unsupported' ? 'dub-lang-unsupported' : res.error, res.status);
    return;
  }
  // لا شيء جاهز: خطأ فعلي فقط إن كان هناك ما يُجلب أصلًا. أوّل ترجمة بعيدة عن
  // موضع التشغيل ليست فشلًا — الجدولة ستجلبها حين تقترب.
  const upcoming = segments.some((s) => s.start >= startAt - START_TOL);
  if (!segments.some((s) => s.state === 'ready') && (!upcoming || res !== false)) {
    stopDubbing();
    showError('dub-failed', 502);
    return;
  }

  if (dubBtn) { dubBtn.disabled = false; dubBtn.textContent = '🎙️ إيقاف الدبلجة'; }
  setStatus('الدبلجة تعمل — الصوت الأصلي مكتوم');
  try { p.mute(); p.playVideo(); } catch { /* تجاهل */ }

  timer = setInterval(tick, TICK_MS);
}

export function isDubbing() { return active; }

/* أجزاء السطر الواحد تتتابع على نفس العنصر — نمط tts-player نفسه */
if (dubPlayer) dubPlayer.addEventListener('ended', playNextPart);
