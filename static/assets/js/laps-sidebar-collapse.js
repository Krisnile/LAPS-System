/**
 * 大屏下将左侧导航折叠到屏幕外，主内容区 margin-left 归零，卡片随宽度自适应。
 * 与移动端 nav-open 抽屉互不干扰（仅 min-width:992px 生效）。
 */
(function () {
  'use strict';

  var KEY = 'laps_sidebar_collapsed';

  function isDesktop() {
    return window.matchMedia('(min-width: 992px)').matches;
  }

  function syncBody() {
    var body = document.body;
    if (!body) return;
    if (!isDesktop()) {
      body.classList.remove('laps-sidebar-collapsed');
    } else {
      if (localStorage.getItem(KEY) === '1') body.classList.add('laps-sidebar-collapsed');
      else body.classList.remove('laps-sidebar-collapsed');
    }
    syncToggleButtons();
  }

  function syncToggleButtons() {
    var collapsed = document.body.classList.contains('laps-sidebar-collapsed') && isDesktop();
    document.querySelectorAll('.laps-sidebar-toggle').forEach(function (btn) {
      btn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
    });
  }

  function toggle() {
    if (!isDesktop()) return;
    var on = document.body.classList.toggle('laps-sidebar-collapsed');
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch (e) {}
    syncToggleButtons();
    try {
      window.dispatchEvent(new Event('resize'));
    } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', function () {
    syncBody();

    document.querySelectorAll('.laps-sidebar-toggle').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        toggle();
      });
    });

    var mq = window.matchMedia('(min-width: 992px)');
    function onMq() {
      syncBody();
    }
    if (mq.addEventListener) mq.addEventListener('change', onMq);
    else if (mq.addListener) mq.addListener(onMq);
  });
})();
