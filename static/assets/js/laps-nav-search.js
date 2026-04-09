/**
 * 顶栏搜索：仅保留主题原有单行弹层，无展开结果区。
 * 输入后按 Enter：先匹配快捷入口；否则（已登录）请求 api 匹配项目/数据集名称。
 */
(function () {
  'use strict';

  var input;
  var modalEl;

  function hideModal() {
    if (typeof window.jQuery !== 'undefined' && modalEl) {
      window.jQuery(modalEl).modal('hide');
    }
  }

  function matchShortcut(s, q) {
    if (!q) return false;
    var low = q.toLowerCase();
    var hay = (s.k + ' ' + s.zh + ' ' + s.en).toLowerCase();
    return hay.indexOf(low) >= 0;
  }

  function go(url) {
    hideModal();
    window.location.href = url;
  }

  function onEnter() {
    var cfg = window.LAPS_NAV_SEARCH;
    if (!cfg || !input) return;

    var q = (input.value || '').trim();

    if (!q.length) {
      hideModal();
      return;
    }

    var shortcuts = cfg.shortcuts || [];
    for (var i = 0; i < shortcuts.length; i++) {
      if (matchShortcut(shortcuts[i], q)) {
        go(shortcuts[i].url);
        return;
      }
    }

    if (!cfg.authenticated) {
      hideModal();
      return;
    }

    var url = cfg.apiUrl + '?q=' + encodeURIComponent(q);
    fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var ds = (data.datasets || [])[0];
        var pr = (data.projects || [])[0];
        if (ds && ds.url) go(ds.url);
        else if (pr && pr.url) go(pr.url);
        else hideModal();
      })
      .catch(function () {
        hideModal();
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    modalEl = document.getElementById('searchModal');
    input = document.getElementById('inlineFormInputGroup');
    if (!modalEl || !input || !window.LAPS_NAV_SEARCH) return;

    if (typeof window.jQuery !== 'undefined') {
      window.jQuery(modalEl).on('shown.bs.modal', function () {
        input.value = '';
        setTimeout(function () {
          input.focus();
        }, 50);
      });
    }

    input.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      onEnter();
    });
  });
})();
