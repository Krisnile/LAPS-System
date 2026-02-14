// Global language switcher
// Replaces text for elements that have data-en / data-zh attributes.
// Also updates input placeholders, titles, alt text, and option text.

(function(){
  'use strict';

  function getStoredLang(){
    return localStorage.getItem('site_lang') || 'zh';
  }

  function setStoredLang(lang){
    localStorage.setItem('site_lang', lang);
  }

  function applyLang(lang){
    // Document language attribute
    try{ document.documentElement.lang = (lang === 'en')? 'en':'zh'; }catch(e){}

    // Elements with data-en/data-zh
    document.querySelectorAll('[data-en]').forEach(function(el){
      var en = el.getAttribute('data-en');
      var zh = el.getAttribute('data-zh') || en;
      var text = (lang === 'en')? en : zh;

      // For form controls and some elements, set attributes instead of textContent
      var tag = (el.tagName || '').toUpperCase();
      if(tag === 'INPUT' || tag === 'TEXTAREA'){
        // If placeholder exists, update it; otherwise update value
        if(el.hasAttribute('placeholder')){
          el.setAttribute('placeholder', text);
        } else if(el.type && (el.type === 'button' || el.type === 'submit' || el.type === 'reset')){
          el.value = text;
        } else {
          // avoid overriding user-entered values
          if(!el.value) el.value = text;
        }
      } else if(tag === 'IMG'){
        if(el.hasAttribute('alt')) el.setAttribute('alt', text);
      } else if(tag === 'OPTION'){
        el.textContent = text;
      } else {
        // Default: update visible text
        // Preserve inner HTML structure only if element has no child elements
        if(el.children && el.children.length === 0){
          el.textContent = text;
        } else {
          // For complex nodes, only update attributes like title if present
          if(el.hasAttribute('title')) el.setAttribute('title', text);
        }
      }
    });

    // Update special attributes for elements that use data-en for titles/alt
    document.querySelectorAll('[data-en-title]').forEach(function(el){
      var en = el.getAttribute('data-en-title');
      var zh = el.getAttribute('data-zh-title') || en;
      el.setAttribute('title', (lang === 'en')? en : zh);
    });

    // Set the language select value if exists
    var sel = document.getElementById('langSelect');
    if(sel) sel.value = lang;

    // Emit an event so other scripts can react
    var ev;
    try{ ev = new CustomEvent('languageChanged', { detail: { lang: lang } }); }catch(e){ ev = document.createEvent('Event'); ev.initEvent('languageChanged', true, true); ev.detail = { lang: lang }; }
    document.dispatchEvent(ev);
  }

  // Init on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function(){
    var lang = getStoredLang();
    applyLang(lang);

    // Wire up selector if present
    var sel = document.getElementById('langSelect');
    if(sel){
      // ensure click doesn't close dropdown when interacting
      sel.addEventListener('click', function(evt){ evt.stopPropagation(); });
      sel.addEventListener('change', function(){
        var v = sel.value || 'zh';
        setStoredLang(v);
        applyLang(v);
      });
    }
  });

  // Expose helper
  window.langSwitcher = {
    applyLang: applyLang,
    getStoredLang: getStoredLang,
    setStoredLang: setStoredLang
  };

})();
