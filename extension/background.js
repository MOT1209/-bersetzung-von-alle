// background.js — إضافة ترجِم (معالج سياقي: زر يمين على أي صفحة)
// يُسجَّل قائمة سياقية «ترجم هذه الصفحة عبر ترجِم»
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'aralink-translate',
    title: 'ترجم هذه الصفحة عبر ترجِم',
    contexts: ['page', 'link']
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  const target = info.linkUrl || info.pageUrl;
  if (!target) return;
  // نفتح ترجِم — مع حفظ عنوان الخادم في التخزين المشترك مع الـ popup
  chrome.storage.local.get('aralinkHost', ({ aralinkHost }) => {
    const host = aralinkHost || 'http://localhost:3999';
    chrome.tabs.create({ url: host + '/?url=' + encodeURIComponent(target) });
  });
});
