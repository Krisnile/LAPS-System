/**
 * 系统通知红点：与 localStorage 中已读版本对比；打开下拉后标记已读。
 */
(function () {
  'use strict';

  var KEY = 'laps_broadcast_read_version';

  function syncDot() {
    var root = document.getElementById('laps-broadcast-root');
    var dot = document.querySelector('.laps-broadcast-dot');
    if (!root || !dot) return;
    var version = root.getAttribute('data-version') || '';
    if (!version) {
      dot.classList.add('d-none');
      return;
    }
    var read = localStorage.getItem(KEY) || '';
    if (read === version) {
      dot.classList.add('d-none');
    } else {
      dot.classList.remove('d-none');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    syncDot();

    var root = document.getElementById('laps-broadcast-root');
    if (!root || typeof window.jQuery === 'undefined') return;

    window.jQuery(root).on('shown.bs.dropdown', function () {
      var v = root.getAttribute('data-version') || '';
      if (v) {
        localStorage.setItem(KEY, v);
      }
      syncDot();
    });
  });
})();
