// server/dubbing/segment-processor.js — تحويل transcript إلى timeline مقاطع
// transcript: [{text,offset,duration} | {text,start,duration}] → segments موحدة مع متحدثين.
function toSeconds(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function normalizeTranscript(list) {
  return (list || []).map((l, i) => {
    const start = l.start !== undefined ? toSeconds(l.start) : toSeconds(l.offset || 0) / 1000;
    const dur = toSeconds(l.duration || l.dur || 2) / (l.offset !== undefined ? 1000 : 1);
    return { start, end: start + Math.min(15, Math.max(1, dur || 2)), text: String(l.text || l.original || '').trim(), idx: i };
  }).filter((s) => s.text.length > 0).sort((a, b) => a.start - b.start);
}

// دمج المقاطع القصيرة جدًا (< 1.2 ثانية) مع التالي حتى تكون قابلة للنطق
function mergeShortSegments(segs, minDur = 1.2) {
  const out = [];
  let i = 0;
  while (i < segs.length) {
    const cur = { ...segs[i] };
    while (cur.end - cur.start < minDur && i + 1 < segs.length) {
      i++;
      cur.text += ' ' + segs[i].text;
      cur.end = segs[i].end;
    }
    cur.duration = cur.end - cur.start;
    out.push(cur);
    i++;
  }
  return out;
}

// كشف متحدثين启发式: فجوة صمت > 2.5 ثانية ⇒ احتمال متحدث جديد (تناوب بسيط)
// البنية تسمح لاحقًا بحقن diarization حقيقي دون تغيير الواجهة.
function detectSpeakers(segs, silenceGap = 2.5) {
  let speaker = 0;
  let prevEnd = -10;
  return segs.map((s) => {
    if (s.start - prevEnd > silenceGap) speaker = (speaker + 1) % 4;
    prevEnd = s.end;
    return { ...s, speaker: `speaker_${speaker + 1}` };
  });
}

function buildTimeline(transcript) {
  const norm = normalizeTranscript(transcript);
  const merged = mergeShortSegments(norm);
  return detectSpeakers(merged);
}

module.exports = { normalizeTranscript, mergeShortSegments, detectSpeakers, buildTimeline };
