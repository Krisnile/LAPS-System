/**
 * 将顶栏/齿轮中的界面偏好异步同步到服务端 UserProfile.preferences（需已登录）。
 */
(function () {
  'use strict';

  function lapsIsAuthenticated() {
    var m = document.querySelector('meta[name="laps-auth"]');
    return m && m.getAttribute('content') === '1';
  }

  function getCookie(name) {
    var v = null;
    if (document.cookie && document.cookie !== '') {
      document.cookie.split(';').forEach(function (c) {
        var p = c.trim();
        if (p.substring(0, name.length + 1) === name + '=') {
          v = decodeURIComponent(p.substring(name.length + 1));
        }
      });
    }
    return v;
  }

  function collectPrefs() {
    try {
      return {
        sidebar_color: localStorage.getItem('sidebar_color') || 'primary',
        light_color: localStorage.getItem('light_color') === 'true',
        layout_mode: localStorage.getItem('layout_mode') || 'left',
        site_lang: localStorage.getItem('site_lang') || 'zh',
      };
    } catch (e) {
      return {};
    }
  }

  window.lapsSyncUserPreferencesToServerDebounced = function () {
    if (!lapsIsAuthenticated()) return;
    clearTimeout(window.__lapsUiPrefsTimer);
    window.__lapsUiPrefsTimer = setTimeout(function () {
      var token = getCookie('csrftoken');
      if (!token) return;
      var body = JSON.stringify(collectPrefs());
      fetch('/account/ui-preferences/', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': token,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: body,
      }).catch(function () { /* 静默失败，不影响本地体验 */ });
    }, 600);
  };
})();
