/**
 * 侧栏导航预取：鼠标在链接上停留片刻后再插入 <link rel="prefetch">，减轻误扫过侧栏时的多余请求。
 * 仅处理 .sidebar-wrapper 内非 javascript: 的 href；同一 URL 只预取一次。
 */
;(function () {
  var prefetched = Object.create(null)
  var hoverTimer = null
  var HOVER_MS = 220

  function maybePrefetch(href) {
    if (!href || prefetched[href]) return
    prefetched[href] = true
    var link = document.createElement('link')
    link.rel = 'prefetch'
    link.href = href
    link.as = 'document'
    document.head.appendChild(link)
  }

  function clearHoverTimer() {
    if (hoverTimer !== null) {
      clearTimeout(hoverTimer)
      hoverTimer = null
    }
  }

  function schedulePrefetch(href) {
    clearHoverTimer()
    hoverTimer = setTimeout(function () {
      hoverTimer = null
      maybePrefetch(href)
    }, HOVER_MS)
  }

  document.addEventListener(
    'mouseover',
    function (ev) {
      var a = ev.target.closest('.sidebar-wrapper a[href]')
      if (!a) {
        clearHoverTimer()
        return
      }
      var raw = a.getAttribute('href')
      if (!raw || raw.indexOf('javascript:') === 0 || raw === '#') return
      try {
        var u = new URL(a.href, window.location.origin)
        if (u.origin !== window.location.origin) return
        schedulePrefetch(u.href)
      } catch (e) {
        /* ignore */
      }
    },
    { capture: true, passive: true },
  )

  document.addEventListener(
    'mouseout',
    function (ev) {
      var fromA = ev.target.closest('.sidebar-wrapper a[href]')
      var rel = ev.relatedTarget
      if (fromA && (!rel || !fromA.contains(rel))) clearHoverTimer()
    },
    { capture: true, passive: true },
  )
})()
