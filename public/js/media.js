/* ---------- مشغل يوتيوب + WebVTT + SRT + TTS ---------- */
import { state, detectArabic, postJson } from './utils.js';
import {
  resultEmbed, localPlayer, capBar, capPanel, capPanelList,
  ttsPlayer, listenBtn, localBtn, srtBtn,
} from './ui.js';

/* ---------- WebVTT + VTT clock ---------- */
export function vttClock(sec) {
  let value = Math.max(0, sec || 0);
  let ms = Math.round((value - Math.floor(value)) * 1000);
  if (ms === 1000) { value += 1; ms = 0; }
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = Math.floor(value % 60);
  const p = (n) => String(n).padStart(2, '0');
  return p(h) + ':' + p(m) + ':' + p(s) + '.' + String(ms).padStart(3, '0');
}

export function buildWebVtt(captions) {
  let out = 'WEBVTT\n\n';
  (captions || []).forEach((c, i) => {
    const s = c.start || 0;
    const e = s + (c.duration || 2000);
    out += (i + 1) + '\n';
    out += vttClock(s) + ' --> ' + vttClock(e) + '\n';
    out += (c.translated || c.original || '') + '\n\n';
  });
  return out;
}

/* ---------- SRT helpers ---------- */
export function formatSrtTime(seconds) {
  const s = Math.max(0, seconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 1000);
  const pad = (n, w) => String(n).padStart(w, '0');
  return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(sec, 2) + ',' + pad(ms, 3);
}

export function buildSrt(captions) {
  return captions.map((c, i) => {
    const start = formatSrtTime(c.start);
    const end   = formatSrtTime(c.start + (c.duration || 2));
    return (i + 1) + '\n' + start + ' --> ' + end + '\n' + (c.translated || c.original) + '\n';
  }).join('\n');
}

export function downloadSrt() {
  const data = state.current;
  if (!data || data.type !== 'youtube' || !Array.isArray(data.captions)) return;
  const srt  = buildSrt(data.captions);
  const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'translation.srt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- YouTube IFrame API ---------- */
let ytPlayer     = null;
let capSyncTimer = null;
let localVideoUrl = null;

export function teardownPlayers() {
  try { resultEmbed.innerHTML = ''; } catch {}
  capPanel.hidden     = true;
  capPanelList.innerHTML = '';
  if (localPlayer.src) { localPlayer.pause(); localPlayer.removeAttribute('src'); localPlayer.load(); }
  localPlayer.hidden  = true;
}

export function loadYouTubeApi() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve(true);
    if (window.__ytApiLoading) {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (window.YT && window.YT.Player) { clearInterval(iv); resolve(true); }
        else if (Date.now() - t0 > 8000)   { clearInterval(iv); resolve(false); }
      }, 100);
      return;
    }
    window.__ytApiLoading = true;
    window.onYouTubeIframeAPIReady = () => resolve(true);
    const tag  = document.createElement('script');
    tag.src    = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    setTimeout(() => resolve(false), 8000);
  });
}

export async function setupYtPlayer(videoId) {
  let wrap = document.getElementById('player-embed');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'player-embed';
    resultEmbed.appendChild(wrap);
  }
  wrap.innerHTML = '';
  localPlayer.hidden = true;
  capBar.hidden = true;
  capBar.textContent = '';
  stopCaptionSync();

  const ok = await loadYouTubeApi();
  if (!ok || !window.YT || !window.YT.Player) {
    const frame = document.createElement('iframe');
    frame.src   = 'https://www.youtube.com/embed/' + encodeURIComponent(videoId) + '?rel=0&playsinline=1';
    frame.title = 'مشغل فيديو يوتيوب';
    frame.loading = 'lazy';
    frame.allowFullscreen = true;
    frame.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    wrap.appendChild(frame);
    return;
  }
  try {
    ytPlayer = new YT.Player(wrap, {
      videoId:    String(videoId),
      playerVars: { rel: 0, playsinline: 1 },
      events: {
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) startCaptionSync();
          else if (e.data !== YT.PlayerState.BUFFERING) stopCaptionSync();
        }
      }
    });
  } catch { /* يبقى حاوية فارغة */ }
}

/* ---------- Caption sync ---------- */
let capPanelItems = [];

export function startCaptionSync() {
  if (capSyncTimer) return;
  const data = state.current;
  const caps = (data && data.captions) || [];
  if (!caps.length) return;
  capBar.hidden = false;
  capSyncTimer = setInterval(() => {
    if (!ytPlayer || typeof ytPlayer.getCurrentTime !== 'function') return;
    let t = 0;
    try { t = ytPlayer.getCurrentTime() || 0; } catch { return; }
    let shown = false;
    for (let i = 0; i < caps.length; i++) {
      const c = caps[i];
      if (t >= (c.start || 0) && t < (c.start || 0) + (c.duration || 2)) {
        const txt = c.translated || c.original || '';
        if (capBar.textContent !== txt) capBar.textContent = txt;
        highlightCaptionPanel(i);
        shown = true;
        break;
      }
    }
    if (!shown && capBar.textContent) { capBar.textContent = ''; highlightCaptionPanel(-1); }
  }, 250);
}

export function stopCaptionSync() {
  if (capSyncTimer) { clearInterval(capSyncTimer); capSyncTimer = null; }
}

export function buildCaptionPanel() {
  const data = state.current;
  const caps = (data && data.captions) || [];
  capPanelList.innerHTML = '';
  capPanelItems = [];
  if (!caps.length) { capPanel.hidden = true; return; }
  caps.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'cap-item cap-clickable';
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.setAttribute('aria-label', 'انتقل إلى ' + formatTime(c.start || 0));
    const t = document.createElement('span');
    t.className = 'cap-time';
    t.dir = 'ltr';
    t.textContent = formatTime(c.start || 0);
    const s = document.createElement('span');
    s.className = 'cap-text';
    s.textContent = c.translated || c.original || '';
    row.appendChild(t);
    row.appendChild(s);
    row.addEventListener('click', () => {
      if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
        try { ytPlayer.seekTo(c.start || 0, true); } catch {}
      }
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        row.click();
      }
    });
    capPanelList.appendChild(row);
    capPanelItems.push(row);
  });
  capPanel.hidden = false;
}

export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function highlightCaptionPanel(idx) {
  capPanelItems.forEach((el, i) => el.classList.toggle('active', i === idx));
  if (idx >= 0 && capPanelItems[idx]) {
    const el = capPanelItems[idx];
    if (typeof el.scrollIntoView === 'function')
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

/* ---------- تشغيل فيديو محلي مع WebVTT ---------- */
export async function playLocalVideo() {
  const data = state.current;
  if (!data || data.type !== 'youtube' || localBtn.disabled) return;

  localBtn.disabled = true;
  const oldLabel = localBtn.textContent;
  localBtn.textContent = '⏳ جاري تنزيل الفيديو…';
  try {
    const res = await fetch('/api/video/' + encodeURIComponent(data.videoId), { signal: AbortSignal.timeout(300000) });
    if (!res.ok) {
      let code = 'video-download-failed';
      try { const err = await res.json(); if (err && err.error) code = err.error; } catch {}
      showError(code, res.status);                          // ← imported in app.js scope
      return;
    }
    const blob = await res.blob();
    if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
    localVideoUrl = URL.createObjectURL(blob);

    const vttBlob = new Blob([buildWebVtt(data.captions)], { type: 'text/vtt;charset=utf-8' });
    const vttUrl  = URL.createObjectURL(vttBlob);
    const oldTrack = localPlayer.querySelector('track');
    if (oldTrack) oldTrack.remove();
    const track = document.createElement('track');
    track.kind    = 'subtitles';
    track.src     = vttUrl;
    track.srclang = 'ar';
    track.label   = 'العربية';
    track.default = true;
    localPlayer.appendChild(track);

    localPlayer.src      = localVideoUrl;
    localPlayer.hidden   = false;
    stopCaptionSync();
    capBar.hidden = true;
    localPlayer.play().catch(() => {});
  } catch {
    showError('video-download-failed', 422);
  } finally {
    localBtn.disabled  = false;
    localBtn.textContent = oldLabel;
  }
}

/* ---------- TTS ---------- */
export async function listenToResult() {
  const data = state.current;
  if (!data || listenBtn.disabled) return;
  let text = '';
  if (data.type === 'youtube')       text = (data.captions     || []).map((c) => c.translated || c.original || '').join(' ');
  else if (data.type === 'article')  text = (data.translatedBlocks || []).map((b) => (b && b.content) || '').join(' ');
  else                               text = data.translated || '';
  text = text.trim();
  if (!text) return;
  listenBtn.disabled = true;
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, lang: targetLang.value }),   // targetLang imported from ui.js in app.js
      signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) {
      let code = 'tts-failed';
      try { const err = await res.json(); if (err && err.error) code = err.error; } catch {}
      showError(code, res.status);
      return;
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    ttsPlayer.src = url;
    ttsPlayer.onended = () => URL.revokeObjectURL(url);
    ttsPlayer.onerror = () => URL.revokeObjectURL(url);
    ttsPlayer.play().catch(() => {});
  } catch { showError('tts-failed', 502); }
  finally { listenBtn.disabled = false; }
}

let wordAudioUrl = null;
export async function pronounceWord(word) {
  if (!word) return;
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: word, lang: targetLang.value }),
      signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) { showToast('تعذر نطق الكلمة'); return; }
    const blob = await res.blob();
    if (!blob || !blob.size) { showToast('تعذر نطق الكلمة'); return; }
    if (wordAudioUrl) URL.revokeObjectURL(wordAudioUrl);
    wordAudioUrl = URL.createObjectURL(blob);
    ttsPlayer.src = wordAudioUrl;
    ttsPlayer.play().catch(() => {});
  } catch { showToast('تعذر نطق الكلمة'); }
}

export function handleResultDblClick(e) {
  if (!state.current || state.activeTab !== 'translated') return;
  const sel = window.getSelection && window.getSelection().toString();
  if (sel && sel.trim().length <= 180) { pronounceWord(sel.trim()); return; }
  if (e.target && e.target.closest && e.target.closest('.result-body, .blk, .compare-col')) {
    const text = e.target.textContent || '';
    const word = (text.split(/[\s\n،.،!؟]+/).filter(Boolean).pop() || '').replace(/[^\p{L}\p{N}'_-]/gu, '');
    if (word && word.length <= 180) pronounceWord(word);
  }
}
