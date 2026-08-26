// popup.js — إضافة أرا لينك: ترجم الصفحة الحالية أو رابطًا مخصصًا
// يفتح أرا لينك في تبويب جديد مع ?url=<الرابط> — الواجهة تلتقطه وتبدأ الترجمة تلقائيًا

const HOST_KEY = 'aralinkHost';
let host = 'http://localhost:3999';
chrome.storage.local.get(HOST_KEY, (res) => {
  if (res && res[HOST_KEY]) host = res[HOST_KEY];
  const inp = document.getElementById('host-input');
  if (inp) inp.value = host;
});

function aralinkUrl(targetUrl) {
  return host + '/?url=' + encodeURIComponent(targetUrl);
}

function openAraLink(targetUrl) {
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    document.getElementById('status').textContent = '⚠️ رابط غير صالح';
    return;
  }
  chrome.tabs.create({ url: aralinkUrl(targetUrl) });
  window.close();
}

// زر «ترجمة الصفحة الحالية»
document.getElementById('current-btn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url) openAraLink(tab.url);
  else document.getElementById('status').textContent = 'تعذر قراءة الرابط الحالي';
});

// زر «ترجم» للرابط المخصص
document.getElementById('go-btn').addEventListener('click', () => {
  openAraLink(document.getElementById('url-input').value.trim());
});
document.getElementById('url-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') openAraLink(e.target.value.trim());
});

// عنوان الخادم القابل للتكوين
const hostInput = document.getElementById('host-input');
hostInput.value = host;
hostInput.addEventListener('change', () => {
  const v = hostInput.value.trim().replace(/\/+$/, '');
  if (/^https?:\/\/[^\s]+$/i.test(v)) {
    host = v;
    chrome.storage.local.set({ [HOST_KEY]: v });
    document.getElementById('status').textContent = '✓ حُفظ العنوان';
  } else {
    document.getElementById('status').textContent = '⚠️ عنوان غير صالح';
  }
});

// فتح أرا لينك مباشرة
document.getElementById('open-link').addEventListener('click', () => {
  chrome.tabs.create({ url: host + '/' });
});
