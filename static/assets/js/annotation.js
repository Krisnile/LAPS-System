/**
 * 标注页 /annotate/
 *
 * 工作流：项目 → 任务 → 多次「运行」→ 可选画笔/橡皮人工微调 → 保存 → 导出
 *
 * 模块概览：
 *  - 任务目录渲染 / 状态 PATCH / 删除 / 新建任务弹窗
 *  - 画布：分割模型下拉、点/框提示（SAM/YOLO）、画笔/橡皮微调、缩放、Run、Save、导出、Undo/Clear
 *  - 工作流 / 工具栏卡片折叠
 */
function getLangText(key, zhText, enText) {
  try {
    var lang = localStorage.getItem('site_lang') || 'zh';
    return (lang === 'en') ? (enText || zhText) : (zhText || enText);
  } catch (e) {
    return zhText;
  }
}

function getAnnotateBootstrap() {
  var el = document.getElementById('annotate-bootstrap');
  if (!el) return { urls: {}, stats: {}, flags: {} };
  try { return JSON.parse(el.textContent); } catch (e) { return { urls: {}, stats: {}, flags: {} }; }
}

function getCsrfToken() {
  var m = document.cookie.match(/csrftoken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function fetchWithCsrf(url, options) {
  var headers = new Headers((options && options.headers) || {});
  var token = getCsrfToken();
  if (token && !headers.has('X-CSRFToken')) headers.set('X-CSRFToken', token);
  return fetch(url, Object.assign({}, options, { headers: headers, credentials: 'same-origin' }));
}

function taskDetailUrl(annotateBoot, taskId) {
  var tpl = (annotateBoot.urls && annotateBoot.urls.task_detail_tpl) || '/api/annotate/tasks/0/';
  return tpl.replace(/\/0\/?$/, '/' + taskId + '/');
}

function taskAnnotationsUrl(annotateBoot, taskId) {
  var tpl = (annotateBoot.urls && annotateBoot.urls.task_annotations_tpl) || '/api/annotate/tasks/0/annotations/';
  return String(tpl).replace(/\/0\/annotations\/?$/, '/' + taskId + '/annotations/');
}

function projectExportUrl(annotateBoot, projectId, format) {
  var tpl = (annotateBoot.urls && annotateBoot.urls.project_export_tpl) || '/api/annotate/projects/0/export/';
  var base = String(tpl).replace(/\/0\/export\/?$/, '/' + projectId + '/export/');
  var sep = base.indexOf('?') >= 0 ? '&' : '?';
  return base + sep + 'format=' + encodeURIComponent(format);
}

function annotationDeleteUrl(annotateBoot, annId) {
  var tpl = (annotateBoot.urls && annotateBoot.urls.delete_annotation_tpl) || '/api/annotations/0/';
  return String(tpl).replace(/\/0\/$/, '/' + annId + '/');
}

var SEGMENT_RGB_PALETTE = [
  { r: 0, g: 200, b: 120 },
  { r: 230, g: 65, b: 85 },
  { r: 65, g: 135, b: 245 },
  { r: 235, g: 175, b: 45 },
  { r: 175, g: 75, b: 210 },
  { r: 45, g: 185, b: 195 },
  { r: 245, g: 130, b: 60 },
  { r: 120, g: 90, b: 240 },
];

function tintMaskToImage(maskImg, rgb, cw, ch, alphaScale, cb) {
  var c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  var ctx = c.getContext('2d');
  ctx.drawImage(maskImg, 0, 0, cw, ch);
  var imgData = ctx.getImageData(0, 0, cw, ch);
  var d = imgData.data;
  var aBase = typeof alphaScale === 'number' ? alphaScale : 0.6;
  for (var i = 0; i < d.length; i += 4) {
    var m = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (m > 4) {
      var u = Math.min(1, m / 255);
      d[i] = rgb.r; d[i + 1] = rgb.g; d[i + 2] = rgb.b;
      d[i + 3] = Math.round(255 * aBase * (0.25 + 0.75 * u));
    } else {
      d[i + 3] = 0;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  var out = new Image();
  out.onload = function () { cb(out); };
  out.src = c.toDataURL('image/png');
}

/** Synchronous version — returns a canvas that can be drawn directly. */
function tintMaskToCanvas(maskSource, rgb, cw, ch, alphaScale) {
  var c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  var ctx = c.getContext('2d');
  ctx.drawImage(maskSource, 0, 0, cw, ch);
  var imgData = ctx.getImageData(0, 0, cw, ch);
  var d = imgData.data;
  var aBase = typeof alphaScale === 'number' ? alphaScale : 0.6;
  for (var i = 0; i < d.length; i += 4) {
    var m = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (m > 4) {
      var u = Math.min(1, m / 255);
      d[i] = rgb.r; d[i + 1] = rgb.g; d[i + 2] = rgb.b;
      d[i + 3] = Math.round(255 * aBase * (0.25 + 0.75 * u));
    } else {
      d[i + 3] = 0;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return c;
}

document.addEventListener('DOMContentLoaded', function () {
  var annotateBoot = getAnnotateBootstrap();
  var imgEl = document.getElementById('annot-image');
  var canvas = document.getElementById('annot-overlay');
  var canvasScroll = canvas ? canvas.closest('.annotation-canvas-scroll') : null;
  var btnRun = document.getElementById('btnRunSAM');
  var btnSave = document.getElementById('btnSave');
  var btnUndo = document.getElementById('btnUndo');
  var btnClear = document.getElementById('btnClear');
  var btnReset = document.getElementById('btnReset');
  var promptListEl = document.getElementById('promptList');
  var runsListPanel = document.getElementById('runsListPanel');
  var zoomIn = document.getElementById('zoomIn');
  var zoomOut = document.getElementById('zoomOut');
  var zoomReset = document.getElementById('zoomReset');
  var zoomLevel = document.getElementById('zoomLevel');
  var maskOpacity = document.getElementById('maskOpacity');
  var labelsPanel = document.getElementById('labelsPanel');
  var placeholder = document.getElementById('annot-placeholder');
  var modePointBtn = document.getElementById('modePointBtn');
  var modeBoxBtn = document.getElementById('modeBoxBtn');
  var modeBrushBtn = document.getElementById('modeBrushBtn');
  var modeEraserBtn = document.getElementById('modeEraserBtn');
  var brushSizeSlider = document.getElementById('brushSizeSlider');
  var brushSizeLabel = document.getElementById('brushSizeLabel');
  var brushSizeGroup = document.getElementById('brushSizeGroup');
  var loadingOverlay = document.getElementById('annot-loading');
  var projectSelect = document.getElementById('annotateProjectSelect');
  var taskListEl = document.getElementById('annotateTaskList');
  var taskCountEl = document.getElementById('annotateTaskCount');
  var taskPaginationEl = document.getElementById('annotateTaskPagination');
  var btnNewTask = document.getElementById('btnAnnotateNewTask');
  var btnRefreshList = document.getElementById('btnAnnotateRefreshList');
  var linkedWarningEl = document.getElementById('annotateLinkedWarning');
  var deleteModal = document.getElementById('annotateDeleteTaskModal');
  var deleteConfirmBtn = document.getElementById('annotateDeleteTaskConfirm');
  var newTaskModal = document.getElementById('annotateNewTaskModal');
  var btnExportAnnotation = document.getElementById('btnExportAnnotation');
  var annotExportFormat = document.getElementById('annotExportFormat');
  var annotCategoryNameInput = document.getElementById('annotCategoryName');
  var segmentModelSelect = document.getElementById('annotSegmentModel');

  var LS_SEG_MODEL = 'laps_annotate_segmentation_model';

  /* ── Segmentation model select ── */
  function initSegmentationModelSelect() {
    if (!segmentModelSelect) return;
    var models = annotateBoot.segmentation_models;
    if (!models || !models.length) {
      models = [
        { id: 'sam', label_zh: 'SAM', label_en: 'SAM' },
        { id: 'yolo', label_zh: 'YOLO', label_en: 'YOLO' },
      ];
    }
    var lang = 'zh';
    try { lang = localStorage.getItem('site_lang') || 'zh'; } catch (e) { /* */ }
    segmentModelSelect.innerHTML = '';
    models.forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = lang === 'en' ? (m.label_en || m.id) : (m.label_zh || m.id);
      segmentModelSelect.appendChild(opt);
    });
    var def = annotateBoot.default_segmentation_model || 'sam';
    var saved = '';
    try { saved = localStorage.getItem(LS_SEG_MODEL) || ''; } catch (e) { /* */ }
    var ids = models.map(function (x) { return x.id; });
    var pick = saved && ids.indexOf(saved) >= 0 ? saved : def;
    if (ids.indexOf(pick) < 0) pick = models[0].id;
    segmentModelSelect.value = pick;
    segmentModelSelect.addEventListener('change', function () {
      try { localStorage.setItem(LS_SEG_MODEL, segmentModelSelect.value); } catch (e) { /* */ }
      updateSegmentModelDependentUI();
    });
  }
  initSegmentationModelSelect();

  var pointBoxModeGroup = document.getElementById('annotPointBoxModeGroup');
  var annotPromptHeading = document.getElementById('annotPromptHeading');

  function isYoloModel() {
    return segmentModelSelect && segmentModelSelect.value === 'yolo';
  }

  function updateSegmentModelDependentUI() {
    var yolo = isYoloModel();
    if (annotPromptHeading) {
      if (yolo) {
        annotPromptHeading.textContent = getLangText('ph_yolo', 'YOLO 分割（可选点/框筛选实例）', 'YOLO segmentation (optional point/box to filter)');
        annotPromptHeading.setAttribute('data-zh', 'YOLO 分割（可选点/框筛选实例）');
        annotPromptHeading.setAttribute('data-en', 'YOLO segmentation (optional point/box to filter)');
      } else {
        annotPromptHeading.textContent = getLangText('ph_sam', '当前提示（点/框）', 'Current prompts (point/box)');
        annotPromptHeading.setAttribute('data-zh', '当前提示（点/框）');
        annotPromptHeading.setAttribute('data-en', 'Current prompts (point/box)');
      }
    }
    if (btnRun) {
      if (yolo) {
        btnRun.setAttribute('data-zh', '运行分割'); btnRun.setAttribute('data-en', 'Run segmentation');
        btnRun.textContent = getLangText('r_y', '运行分割', 'Run segmentation');
        btnRun.setAttribute('title', getLangText('r_yt', 'Space — YOLO 实例分割', 'Space — YOLO instance segmentation'));
      } else {
        btnRun.setAttribute('data-zh', '运行'); btnRun.setAttribute('data-en', 'Run');
        btnRun.textContent = getLangText('r_s', '运行', 'Run');
        btnRun.setAttribute('title', 'Space');
      }
    }
    redrawOverlay();
    renderRunsAndPrompts();
  }

  /* ── Core state ── */
  var promptMode = 'point';
  var currentImageFile = null;
  var currentTaskId = null;
  var prompts = [];
  var boxes = [];
  var selectedLabel = null;
  var zoom = 1.0;
  var baseDisplayW = 0;
  var baseDisplayH = 0;
  var maskAlpha = parseFloat(maskOpacity ? maskOpacity.value : 0.6);
  var boxDrawing = null;
  var dragState = null;
  var hasRealImage = false;
  var catalogTasks = [];
  var CATALOG_PAGE_SIZE = 6;
  var catalogPage = 1;
  var catalogTotal = 0;
  var catalogTotalPages = 1;
  var pendingDeleteTaskId = null;
  var completedSegments = [];
  var nextLocalSegId = 1;
  var tintRefreshTimer = null;

  /* ── Brush / eraser editing state ── */
  var brushSize = 15;
  var editingSegIdx = -1;
  var maskEditCanvas = null;
  var maskEditCtx = null;
  var isDrawing = false;
  var lastDrawPt = null;
  var lastMouseCanvasPos = null;
  var editRedrawRafId = 0;

  var TASK_STATUSES = ['pending', 'done'];

  /* ── Utility ── */
  function showFlowMessage(html, kind) {
    var el = document.getElementById('annotateFlowMessage');
    if (!el) return;
    el.className = 'annotate-flow-message mt-2 ' + (kind || 'alert-info');
    el.innerHTML = html;
    el.classList.remove('d-none');
  }
  function hideFlowMessage() {
    var el = document.getElementById('annotateFlowMessage');
    if (!el) return;
    el.classList.add('d-none'); el.innerHTML = '';
  }
  function getTrimmedCategoryName() {
    if (!annotCategoryNameInput) return '';
    return String(annotCategoryNameInput.value || '').trim();
  }
  function downloadBlob(filename, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }
  function hideAnnotateSaveFeedback() {
    var el = document.getElementById('annotateSaveFeedback');
    if (!el) return;
    el.classList.add('d-none'); el.innerHTML = '';
  }
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function segmentRoleLabel(role) {
    var r = (role || '').toLowerCase();
    if (r === 'foreground') return getLangText('role_fg', '前景', 'Foreground');
    if (r === 'background') return getLangText('role_bg', '背景', 'Background');
    if (r === 'other') return getLangText('role_ot', '其他', 'Other');
    return role || '—';
  }
  function showAnnotateSaveFeedback(payload) {
    var el = document.getElementById('annotateSaveFeedback');
    if (!el || !payload) return;
    var items = payload.saved_items;
    if (!items || !items.length) {
      items = [{ annotation_id: payload.annotation_id, category_name: payload.category_name, segment_role: payload.segment_role }];
    }
    var parts = [];
    parts.push('<div class="d-flex justify-content-between align-items-start">');
    parts.push('<div class="pr-2">');
    parts.push('<strong>' + getLangText('sf_t', '本次已保存', 'Saved successfully') + '</strong>');
    parts.push('<p class="small mb-1 mt-2">' + getLangText('sf_tk', '任务', 'Task') + ' #' + escapeHtml(String(payload.task_id)) + '</p>');
    parts.push('<ul class="mb-0 pl-3 small">');
    items.forEach(function (it, idx) {
      parts.push('<li class="mb-1"><span class="text-monospace">#' + (idx + 1) + '</span> — '
        + getLangText('sf_a', '标注', 'Ann') + ' id=' + escapeHtml(String(it.annotation_id))
        + ' · ' + getLangText('sf_c', '类别', 'Cat') + '：' + escapeHtml(it.category_name || '')
        + ' · ' + getLangText('sf_r', '角色', 'Role') + '：' + escapeHtml(segmentRoleLabel(it.segment_role)) + '</li>');
    });
    parts.push('</ul>');
    parts.push('<p class="mb-0 small mt-2">' + getLangText('sf_m', '每条均已上传掩码 PNG 并写入数据库（含 COCO 快照）。', 'Each mask uploaded; DB rows with COCO snapshots.') + '</p>');
    parts.push('<p class="mb-0 small text-muted mt-2">' + getLangText('sf_n', '接下来：在上方选择导出格式，点击「导出」可下载当前项目下全部已保存标注。', 'Next: pick export format — Export downloads all saved annotations in this project.') + '</p>');
    parts.push('</div>');
    parts.push('<button type="button" class="btn btn-sm btn-link text-muted p-0 annotate-save-feedback-dismiss flex-shrink-0" aria-label="Close">&times;</button>');
    parts.push('</div>');
    el.innerHTML = parts.join('');
    el.classList.remove('d-none');
    var dismiss = el.querySelector('.annotate-save-feedback-dismiss');
    if (dismiss) dismiss.addEventListener('click', function () { hideAnnotateSaveFeedback(); });
    try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e2) { /* */ }
  }
  function clearLastExportState() { hideAnnotateSaveFeedback(); updateExportButtons(); }
  function updateExportButtons() {
    var pid = projectSelect && projectSelect.value;
    if (annotExportFormat) annotExportFormat.disabled = !pid;
    if (btnExportAnnotation) btnExportAnnotation.disabled = !pid;
  }
  function statusLabel(st) {
    var map = { pending: getLangText('st_p', '待标注', 'Pending'), done: getLangText('st_d', '已完成', 'Done') };
    return map[st] || st;
  }
  function lapsEscapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── Loading indicator ── */
  function showLoading() { if (loadingOverlay) loadingOverlay.classList.remove('d-none'); }
  function hideLoading() { if (loadingOverlay) loadingOverlay.classList.add('d-none'); }

  /* ── Project select helpers ── */
  function syncProjectSelectOptionFromCatalog(proj) {
    if (!projectSelect || !proj || proj.id == null) return;
    var opt = projectSelect.querySelector('option[value="' + String(proj.id) + '"]');
    if (!opt) return;
    var tc = typeof proj.task_count === 'number' ? proj.task_count : catalogTotal;
    var lc = typeof proj.linked_count === 'number' ? proj.linked_count : 0;
    var name = proj.name != null ? String(proj.name) : '';
    opt.setAttribute('data-tasks', String(tc));
    opt.setAttribute('data-linked', String(lc));
    var enLine = name + ' (' + tc + ' tasks · ' + lc + ' linked)';
    var zhLine = name + '（' + tc + ' 任务 · ' + lc + ' 关联集）';
    opt.setAttribute('data-en', lapsEscapeAttr(enLine));
    opt.setAttribute('data-zh', lapsEscapeAttr(zhLine));
    try {
      opt.textContent = (localStorage.getItem('site_lang') || 'zh') === 'en' ? enLine : zhLine;
    } catch (e) { opt.textContent = zhLine; }
  }
  function updateLinkedWarning(proj) {
    if (!linkedWarningEl) return;
    if (!proj || proj.linked_count > 0) { linkedWarningEl.classList.add('d-none'); linkedWarningEl.textContent = ''; return; }
    linkedWarningEl.classList.remove('d-none');
    linkedWarningEl.innerHTML = getLangText('wl',
      '提示：该项目尚未在库中关联任何数据集。您仍可使用账号下任意数据集中的图片创建任务（规则与<a href="' + (annotateBoot.urls.tasks || '/tasks/') + '">任务页</a>一致）。建议在<a href="' + (annotateBoot.urls.projects || '/projects/') + '">项目页</a>编辑并勾选关联数据集以便筛选图片来源。',
      'This project has no linked datasets yet. You can still create tasks from any of your images (same rules as <a href="' + (annotateBoot.urls.tasks || '/tasks/') + '">Tasks</a>). Consider linking datasets under <a href="' + (annotateBoot.urls.projects || '/projects/') + '">Projects</a>.'
    );
  }

  /* ── Task list rendering ── */
  function renderTaskPagination() {
    if (!taskPaginationEl) return;
    if (!projectSelect || !projectSelect.value || catalogTotal <= 0 || catalogTotalPages <= 1) {
      taskPaginationEl.classList.add('d-none'); taskPaginationEl.innerHTML = ''; return;
    }
    taskPaginationEl.classList.remove('d-none'); taskPaginationEl.innerHTML = '';
    var info = document.createElement('span');
    info.className = 'annotate-task-pagination__info text-muted';
    info.textContent = getLangText('tp', '第 ' + catalogPage + ' / ' + catalogTotalPages + ' 页（共 ' + catalogTotal + ' 条）',
      'Page ' + catalogPage + ' / ' + catalogTotalPages + ' (' + catalogTotal + ' tasks)');
    var nav = document.createElement('div'); nav.className = 'annotate-task-pagination__nav';
    var prevBtn = document.createElement('button'); prevBtn.type = 'button';
    prevBtn.className = 'btn btn-sm btn-outline-secondary';
    prevBtn.textContent = getLangText('tp_p', '上一页', 'Previous');
    prevBtn.disabled = catalogPage <= 1;
    prevBtn.addEventListener('click', function () { if (catalogPage > 1) fetchCatalog({ page: catalogPage - 1 }); });
    var nextBtn = document.createElement('button'); nextBtn.type = 'button';
    nextBtn.className = 'btn btn-sm btn-outline-secondary ml-1';
    nextBtn.textContent = getLangText('tp_n', '下一页', 'Next');
    nextBtn.disabled = catalogPage >= catalogTotalPages;
    nextBtn.addEventListener('click', function () { if (catalogPage < catalogTotalPages) fetchCatalog({ page: catalogPage + 1 }); });
    nav.appendChild(prevBtn); nav.appendChild(nextBtn);
    var jumpWrap = document.createElement('span');
    jumpWrap.className = 'annotate-task-pagination__jump ml-1';
    var pageInput = document.createElement('input');
    pageInput.type = 'number';
    pageInput.min = '1';
    pageInput.max = String(catalogTotalPages);
    pageInput.value = String(catalogPage);
    pageInput.className = 'form-control form-control-sm annotate-task-pagination__page-input';
    pageInput.setAttribute('aria-label', getLangText('tp_jl', '页码', 'Page'));
    pageInput.title = getLangText('tp_jt', '输入页码后点跳转或按回车', 'Enter page, then Go or press Enter');
    var jumpBtn = document.createElement('button');
    jumpBtn.type = 'button';
    jumpBtn.className = 'btn btn-sm btn-outline-secondary ml-1';
    jumpBtn.textContent = getLangText('tp_j', '跳转', 'Go');
    function doJump() {
      var n = parseInt(String(pageInput.value || '').trim(), 10);
      if (isNaN(n)) return;
      n = Math.min(Math.max(1, n), catalogTotalPages);
      if (n === catalogPage) return;
      fetchCatalog({ page: n });
    }
    jumpBtn.addEventListener('click', function () { doJump(); });
    pageInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); doJump(); }
    });
    jumpWrap.appendChild(pageInput);
    jumpWrap.appendChild(jumpBtn);
    nav.appendChild(jumpWrap);
    taskPaginationEl.appendChild(info); taskPaginationEl.appendChild(nav);
  }

  function renderTaskList() {
    if (!taskListEl) return;
    taskListEl.innerHTML = '';
    if (taskCountEl) taskCountEl.textContent = (!projectSelect || !projectSelect.value) ? '0' : String(catalogTotal);
    if (!projectSelect || !projectSelect.value) {
      taskListEl.innerHTML = '<p class="small text-muted p-2 mb-0">' + getLangText('pp', '请先选择项目。', 'Select a project first.') + '</p>';
      renderTaskPagination(); return;
    }
    if (!catalogTasks.length) {
      taskListEl.innerHTML = '<p class="small text-muted p-2 mb-0">' + getLangText('nt', '该项目下尚无任务。点击「新建任务」或前往任务页批量生成。', 'No tasks for this project. Use "New task" or the Tasks page.') + '</p>';
      renderTaskPagination(); return;
    }
    catalogTasks.forEach(function (t) {
      var div = document.createElement('div');
      div.className = 'annotate-task-item' + (currentTaskId === t.id ? ' active' : '');
      div.dataset.taskId = String(t.id);
      var title = document.createElement('div'); title.className = 'annotate-task-title';
      title.textContent = '#' + t.id + ' · ' + (t.image_name || '—');
      var meta = document.createElement('div'); meta.className = 'annotate-task-meta';
      meta.textContent = (t.dataset_name || '') + ' · ' + statusLabel(t.status);
      var actions = document.createElement('div'); actions.className = 'annotate-task-actions';
      var sel = document.createElement('select'); sel.className = 'form-control form-control-sm';
      TASK_STATUSES.forEach(function (st) {
        var opt = document.createElement('option'); opt.value = st; opt.textContent = statusLabel(st);
        if (st === t.status) opt.selected = true; sel.appendChild(opt);
      });
      sel.addEventListener('click', function (ev) { ev.stopPropagation(); });
      sel.addEventListener('change', function (ev) {
        ev.stopPropagation();
        patchTaskStatus(t.id, sel.value, function (ok) { if (ok) { t.status = sel.value; renderTaskList(); } });
      });
      var delBtn = document.createElement('button'); delBtn.type = 'button';
      delBtn.className = 'btn btn-sm btn-outline-danger';
      delBtn.textContent = getLangText('del', '删除', 'Delete');
      delBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        pendingDeleteTaskId = t.id;
        var body = document.getElementById('annotateDeleteTaskBody');
        if (body) body.textContent = getLangText('dc', '确定删除任务 #' + t.id + '？（数据库中删除，不可恢复）', 'Delete task #' + t.id + '? This cannot be undone.');
        if (window.jQuery && window.jQuery.fn.modal) window.jQuery('#annotateDeleteTaskModal').modal('show');
        else if (deleteModal) deleteModal.classList.add('show');
      });
      var thumbWrap = document.createElement('span'); thumbWrap.className = 'annotate-task-thumb-wrap';
      thumbWrap.setAttribute('role', 'presentation');
      thumbWrap.title = getLangText('ttt', '任务绑定图片（点击行或缩略图加载）', 'Task image (click row or thumbnail to load)');
      if (t.image_url) {
        var thumbImg = document.createElement('img'); thumbImg.className = 'annotate-task-thumb';
        thumbImg.src = t.image_url; thumbImg.alt = ''; thumbImg.loading = 'lazy'; thumbImg.decoding = 'async';
        thumbImg.addEventListener('error', function () { thumbWrap.classList.add('annotate-task-thumb--empty'); thumbImg.remove(); });
        thumbWrap.appendChild(thumbImg);
      } else { thumbWrap.classList.add('annotate-task-thumb--empty'); }
      actions.appendChild(sel); actions.appendChild(delBtn); actions.appendChild(thumbWrap);
      div.appendChild(title); div.appendChild(meta); div.appendChild(actions);
      div.addEventListener('click', function (ev) {
        if (ev.target.closest('select') || ev.target.closest('button')) return;
        loadTaskFromRow(t);
      });
      taskListEl.appendChild(div);
    });
    renderTaskPagination();
  }

  /* ── Hydrate saved annotations from server ── */
  function hydrateTaskAnnotationsFromServer(taskId) {
    var expectTask = taskId;
    var url = taskAnnotationsUrl(annotateBoot, taskId);
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      if (currentTaskId !== expectTask) return;
      if (j.code !== 1 || !j.annotations) {
        completedSegments.length = 0; nextLocalSegId = 1;
        renderRunsAndPrompts(); redrawOverlay(); return;
      }
      var list = j.annotations.slice().sort(function (a, b) { return a.id - b.id; });
      completedSegments.length = 0; nextLocalSegId = 1;
      var i = 0;
      function loadNext() {
        if (currentTaskId !== expectTask) return;
        if (i >= list.length) { nextLocalSegId = completedSegments.length + 1; renderRunsAndPrompts(); redrawOverlay(); return; }
        var meta = list[i++];
        if (!meta.mask_url) { loadNext(); return; }
        var im = new Image();
        im.onload = function () {
          if (currentTaskId !== expectTask) return;
          var cw = canvas.width, ch = canvas.height;
          if (!cw || !ch) { loadNext(); return; }
          var rgb = SEGMENT_RGB_PALETTE[completedSegments.length % SEGMENT_RGB_PALETTE.length];
          tintMaskToImage(im, rgb, cw, ch, maskAlpha, function (tinted) {
            if (currentTaskId !== expectTask) return;
            completedSegments.push({
              id: nextLocalSegId++, annotationId: meta.id, maskBlob: null, rawMaskImg: im, rgb: rgb,
              categoryName: meta.category_name || 'default', segmentRole: meta.segment_role || 'foreground',
              promptsSnapshot: [], boxesSnapshot: [], tintedImg: tinted,
            });
            loadNext();
          });
        };
        im.onerror = function () { loadNext(); };
        im.src = meta.mask_url;
      }
      loadNext();
    }).catch(function (e) {
      console.error(e);
      if (currentTaskId !== expectTask) return;
      completedSegments.length = 0; nextLocalSegId = 1;
      renderRunsAndPrompts(); redrawOverlay();
    });
  }

  /* ── Load a task from the sidebar list ── */
  function loadTaskFromRow(t) {
    stopEditingSegment(false);
    clearLastExportState();
    completedSegments.length = 0; nextLocalSegId = 1;
    currentTaskId = t.id; currentImageFile = null;
    catalogTasks = catalogTasks.map(function (x) { return x; });
    renderTaskList();
    if (!t.image_url) {
      alert(getLangText('nu', '该任务没有可用的图片地址。', 'This task has no image URL.')); return;
    }
    imgEl.src = t.image_url;
    imgEl.onload = function () {
      zoom = 1.0; if (zoomLevel) zoomLevel.textContent = '100%';
      baseDisplayW = 0; baseDisplayH = 0; hasRealImage = true;
      resizeCanvasToImage();
      prompts = []; boxes = []; boxDrawing = null; dragState = null;
      if (placeholder) placeholder.style.display = 'none';
      hydrateTaskAnnotationsFromServer(t.id);
    };
    var curEl = document.getElementById('currentTask');
    if (curEl) curEl.textContent = getLangText('tn', '任务 #' + t.id, 'Task #' + t.id);
    var metaEl = document.getElementById('taskMeta');
    if (metaEl) metaEl.textContent = (t.dataset_name ? t.dataset_name + ' · ' : '') + statusLabel(t.status);
    hideFlowMessage();
  }

  /* ── Catalog fetch ── */
  function fetchCatalog(opts) {
    opts = opts || {};
    var pid = projectSelect && projectSelect.value;
    if (!pid) {
      catalogTasks = []; catalogPage = 1; catalogTotal = 0; catalogTotalPages = 1;
      renderTaskList(); return Promise.resolve();
    }
    if (opts.resetPage) catalogPage = 1;
    if (typeof opts.page === 'number' && opts.page >= 1) catalogPage = opts.page;
    var base = annotateBoot.urls.catalog || '/api/annotate/catalog/';
    var url = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'project_id=' + encodeURIComponent(pid)
      + '&page=' + encodeURIComponent(catalogPage) + '&page_size=' + encodeURIComponent(CATALOG_PAGE_SIZE);
    return fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      if (j.code !== 1) {
        showFlowMessage((j.msg || '') || getLangText('ce', '加载任务目录失败。', 'Failed to load catalog.'), 'alert-warning');
        catalogTasks = []; catalogTotal = 0; catalogTotalPages = 1; renderTaskList(); return;
      }
      var pg = j.pagination || {};
      catalogTotal = typeof pg.total === 'number' ? pg.total : (j.tasks || []).length;
      catalogPage = typeof pg.page === 'number' ? pg.page : catalogPage;
      catalogTotalPages = typeof pg.total_pages === 'number' ? Math.max(1, pg.total_pages) : 1;
      catalogTasks = j.tasks || [];
      if (catalogTasks.length === 0 && catalogTotal > 0 && catalogPage > 1 && !opts._retryPrevPage) {
        catalogPage -= 1; return fetchCatalog({ _retryPrevPage: true });
      }
      updateLinkedWarning(j.project); syncProjectSelectOptionFromCatalog(j.project);
      renderTaskList(); hideFlowMessage(); updateExportButtons();
    }).catch(function (e) {
      console.error(e);
      showFlowMessage(getLangText('ce', '加载任务目录失败。', 'Failed to load catalog.'), 'alert-warning');
      catalogTasks = []; catalogTotal = 0; catalogTotalPages = 1; renderTaskList();
    });
  }

  function patchTaskStatus(taskId, status, cb) {
    var url = taskDetailUrl(annotateBoot, taskId);
    fetchWithCsrf(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: status }) })
      .then(function (r) { return r.json(); }).then(function (j) {
        if (j.code === 1) { if (cb) cb(true); }
        else { alert(j.msg || getLangText('pf', '更新失败', 'Update failed')); if (cb) cb(false); fetchCatalog(); }
      }).catch(function (e) { console.error(e); alert(getLangText('pf', '更新失败', 'Update failed')); if (cb) cb(false); });
  }

  function loadAvailableImagesForModal() {
    var pid = projectSelect && projectSelect.value;
    var grid = document.getElementById('annotateNewTaskGrid');
    var emptyBox = document.getElementById('annotateNewTaskEmpty');
    if (!grid) return;
    grid.innerHTML = '';
    if (emptyBox) { emptyBox.classList.add('d-none'); emptyBox.textContent = ''; }
    if (!pid) return;
    var base = annotateBoot.urls.available_images || '/api/annotate/available-images/';
    var url = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'project_id=' + encodeURIComponent(pid);
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      if (j.code !== 1 || !j.images || !j.images.length) {
        if (emptyBox) {
          emptyBox.classList.remove('d-none');
          emptyBox.textContent = getLangText('nai', '没有可添加的图片：请先在数据集上传，或任务页批量生成；已建过任务的图不会重复出现。', 'No images available to add.');
        }
        return;
      }
      j.images.forEach(function (im) {
        var cell = document.createElement('div'); cell.className = 'annotate-pick-cell';
        if (im.image_url) { var img = document.createElement('img'); img.src = im.image_url; img.alt = ''; cell.appendChild(img); }
        var cap = document.createElement('div'); cap.textContent = im.dataset_name + ' · #' + im.id; cell.appendChild(cap);
        cell.addEventListener('click', function () { createTask(im.id); });
        grid.appendChild(cell);
      });
    }).catch(function (e) {
      console.error(e);
      if (emptyBox) { emptyBox.classList.remove('d-none'); emptyBox.textContent = getLangText('lif', '加载可选图片失败。', 'Failed to load images.'); }
    });
  }

  function createTask(imageId) {
    var pid = projectSelect && projectSelect.value;
    if (!pid) return;
    var url = annotateBoot.urls.task_create || '/api/annotate/tasks/';
    fetchWithCsrf(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: parseInt(pid, 10), image_id: imageId }) })
      .then(function (r) { return r.json(); }).then(function (j) {
        if (j.code !== 1) { alert(j.msg || getLangText('cf', '创建任务失败', 'Failed to create task')); return; }
        if (window.jQuery && window.jQuery.fn.modal) window.jQuery('#annotateNewTaskModal').modal('hide');
        fetchCatalog({ resetPage: true });
        if (j.task) loadTaskFromRow(j.task);
        showFlowMessage(getLangText('cr', '任务已创建。', 'Task created.'), 'alert-success');
      }).catch(function (e) { console.error(e); alert(getLangText('cf', '创建任务失败', 'Failed to create task')); });
  }

  /* ── Project select event ── */
  if (projectSelect) {
    projectSelect.addEventListener('change', function () {
      stopEditingSegment(false);
      clearLastExportState();
      completedSegments.length = 0; nextLocalSegId = 1; currentTaskId = null;
      catalogTasks = []; catalogPage = 1; catalogTotal = 0; catalogTotalPages = 1;
      hasRealImage = false; resetAnnotateImageLayout();
      if (placeholder) placeholder.style.display = '';
      imgEl.removeAttribute('src');
      var curEl = document.getElementById('currentTask');
      if (curEl) curEl.textContent = getLangText('none', '未选择', 'None');
      var metaEl = document.getElementById('taskMeta');
      if (metaEl) metaEl.textContent = '';
      renderRunsAndPrompts();
      var enabled = !!projectSelect.value;
      if (btnNewTask) btnNewTask.disabled = !enabled;
      if (btnRefreshList) btnRefreshList.disabled = !enabled;
      if (enabled) fetchCatalog({ resetPage: true });
      else { updateLinkedWarning(null); renderTaskList(); }
      updateExportButtons();
    });
  }
  if (btnRefreshList) btnRefreshList.addEventListener('click', function () { fetchCatalog(); });
  if (newTaskModal) newTaskModal.addEventListener('show.bs.modal', loadAvailableImagesForModal);

  if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener('click', function () {
      if (!pendingDeleteTaskId) return;
      var url = taskDetailUrl(annotateBoot, pendingDeleteTaskId);
      fetchWithCsrf(url, { method: 'DELETE' }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.code !== 1) { alert(j.msg || getLangText('df', '删除失败', 'Delete failed')); return; }
        var deletedId = pendingDeleteTaskId; pendingDeleteTaskId = null;
        if (window.jQuery && window.jQuery.fn.modal) window.jQuery('#annotateDeleteTaskModal').modal('hide');
        if (currentTaskId === deletedId) {
          currentTaskId = null; hasRealImage = false; completedSegments.length = 0; nextLocalSegId = 1;
          stopEditingSegment(false);
          if (placeholder) placeholder.style.display = '';
          resetAnnotateImageLayout(); imgEl.removeAttribute('src');
          var curEl = document.getElementById('currentTask');
          if (curEl) curEl.textContent = getLangText('none', '未选择', 'None');
          var tmeta = document.getElementById('taskMeta');
          if (tmeta) tmeta.textContent = '';
          renderRunsAndPrompts(); redrawOverlay();
        }
        fetchCatalog();
      }).catch(function (e) { console.error(e); alert(getLangText('df', '删除失败', 'Delete failed')); });
    });
  }

  /* ── Runs / prompts panel ── */
  function summarizePromptsForSegment(pArr, bArr) {
    var bits = [];
    (pArr || []).forEach(function (p, i) {
      bits.push('#' + (i + 1) + ' (' + Math.round(p.x) + ',' + Math.round(p.y) + ')' + (p.positive ? '+' : '−'));
    });
    (bArr || []).forEach(function (b, i) {
      bits.push('□' + (i + 1) + ' (' + Math.round(b.x1) + ',' + Math.round(b.y1) + ')-(' + Math.round(b.x2) + ',' + Math.round(b.y2) + ')');
    });
    return bits.join(' ') || '—';
  }

  function deleteSegmentById(sid) {
    var seg = null, si;
    for (si = 0; si < completedSegments.length; si++) {
      if (completedSegments[si].id === sid) { seg = completedSegments[si]; break; }
    }
    if (!seg) return;
    if (editingSegIdx >= 0 && completedSegments[editingSegIdx] && completedSegments[editingSegIdx].id === sid) {
      stopEditingSegment(false);
    }
    if (seg.annotationId) {
      var delUrl = annotationDeleteUrl(annotateBoot, seg.annotationId);
      fetchWithCsrf(delUrl, { method: 'DELETE' }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || j.code !== 1) { alert(getLangText('daf', '删除已保存标注失败：', 'Failed to delete annotation: ') + ((j && j.msg) || '')); return; }
        completedSegments = completedSegments.filter(function (s) { return s.id !== sid; });
        editingSegIdx = -1;
        redrawOverlay(); renderRunsAndPrompts(); fetchCatalog();
      }).catch(function (e) { console.error(e); alert(getLangText('daf', '删除已保存标注失败：', 'Failed to delete annotation: ') + (e.message || '')); });
      return;
    }
    completedSegments = completedSegments.filter(function (s) { return s.id !== sid; });
    editingSegIdx = -1;
    redrawOverlay(); renderRunsAndPrompts();
  }

  function rebuildTintOne(seg, done) {
    if (!seg || !seg.rawMaskImg || !canvas.width) { if (done) done(); return; }
    tintMaskToImage(seg.rawMaskImg, seg.rgb, canvas.width, canvas.height, maskAlpha, function (tinted) {
      seg.tintedImg = tinted; if (done) done();
    });
  }

  function refreshAllSegmentTintsThenRedraw() {
    if (!completedSegments.length) { redrawOverlay(); return; }
    var i = 0;
    function next() {
      if (i >= completedSegments.length) { redrawOverlay(); return; }
      rebuildTintOne(completedSegments[i], function () { i += 1; next(); });
    }
    next();
  }

  function scheduleTintRefresh() {
    if (tintRefreshTimer) clearTimeout(tintRefreshTimer);
    tintRefreshTimer = setTimeout(function () { tintRefreshTimer = null; refreshAllSegmentTintsThenRedraw(); }, 80);
  }

  /* ═══════════════════════════════════════════
   *  MASK EDITING — brush / eraser
   * ═══════════════════════════════════════════ */

  function isBrushOrEraser() {
    return promptMode === 'brush' || promptMode === 'eraser';
  }

  function startEditingSegment(idx) {
    if (idx < 0 || idx >= completedSegments.length) return;
    var seg = completedSegments[idx];
    editingSegIdx = idx;
    var nw = imgEl.naturalWidth || 1;
    var nh = imgEl.naturalHeight || 1;
    maskEditCanvas = document.createElement('canvas');
    maskEditCanvas.width = nw;
    maskEditCanvas.height = nh;
    maskEditCtx = maskEditCanvas.getContext('2d');
    if (seg.rawMaskImg) {
      maskEditCtx.drawImage(seg.rawMaskImg, 0, 0, nw, nh);
    }
    renderRunsAndPrompts();
  }

  function stopEditingSegment(finalize) {
    if (editingSegIdx < 0) return;
    if (finalize) finalizeEditToSegment();
    editingSegIdx = -1;
    maskEditCanvas = null;
    maskEditCtx = null;
    isDrawing = false;
    lastDrawPt = null;
    renderRunsAndPrompts();
    redrawOverlay();
  }

  function finalizeEditToSegment() {
    if (editingSegIdx < 0 || !maskEditCanvas) return;
    var seg = completedSegments[editingSegIdx];
    if (!seg) return;
    var dataUrl = maskEditCanvas.toDataURL('image/png');
    var newImg = new Image();
    newImg.onload = function () {
      seg.rawMaskImg = newImg;
      rebuildTintOne(seg, function () { redrawOverlay(); });
    };
    newImg.src = dataUrl;
    maskEditCanvas.toBlob(function (blob) { if (blob) seg.maskBlob = blob; }, 'image/png');
    if (seg.annotationId) {
      seg.annotationId = null;
    }
  }

  /** Create a blank segment for painting from scratch. */
  function ensureEditableSegment() {
    if (editingSegIdx >= 0 && editingSegIdx < completedSegments.length) return;
    if (!hasRealImage || !imgEl.naturalWidth) return;

    var nw = imgEl.naturalWidth;
    var nh = imgEl.naturalHeight;
    maskEditCanvas = document.createElement('canvas');
    maskEditCanvas.width = nw;
    maskEditCanvas.height = nh;
    maskEditCtx = maskEditCanvas.getContext('2d');

    var blankCanvas = document.createElement('canvas');
    blankCanvas.width = 1; blankCanvas.height = 1;
    var blankImg = new Image();

    var rgb = SEGMENT_RGB_PALETTE[completedSegments.length % SEGMENT_RGB_PALETTE.length];
    var seg = {
      id: nextLocalSegId++,
      maskBlob: null,
      rawMaskImg: null,
      rgb: rgb,
      categoryName: getTrimmedCategoryName() || 'default',
      segmentRole: selectedLabel || 'foreground',
      promptsSnapshot: [],
      boxesSnapshot: [],
      tintedImg: null,
      isManual: true,
    };
    completedSegments.push(seg);
    editingSegIdx = completedSegments.length - 1;
    renderRunsAndPrompts();
  }

  function paintAtImageCoords(ix, iy, erase) {
    if (!maskEditCtx) return;
    if (erase) {
      maskEditCtx.globalCompositeOperation = 'destination-out';
      maskEditCtx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      maskEditCtx.globalCompositeOperation = 'source-over';
      maskEditCtx.fillStyle = 'rgba(255,255,255,1)';
    }
    maskEditCtx.beginPath();
    maskEditCtx.arc(ix, iy, brushSize, 0, Math.PI * 2);
    maskEditCtx.fill();
    maskEditCtx.globalCompositeOperation = 'source-over';
  }

  function paintLine(x1, y1, x2, y2, erase) {
    var dx = x2 - x1, dy = y2 - y1;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var steps = Math.max(1, Math.ceil(dist / Math.max(1, brushSize * 0.3)));
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      paintAtImageCoords(x1 + dx * t, y1 + dy * t, erase);
    }
  }

  /** Real-time redraw during active brush drawing — uses synchronous tint. */
  function requestEditRedraw() {
    if (editRedrawRafId) return;
    editRedrawRafId = requestAnimationFrame(function () {
      editRedrawRafId = 0;
      redrawOverlay();
    });
  }

  /* ── Runs/prompts panel rendering ── */
  function renderRunsAndPrompts() {
    if (runsListPanel) {
      runsListPanel.innerHTML = '';
      if (!completedSegments.length) {
        var empty = document.createElement('p');
        empty.className = 'small text-muted mb-0 annotate-runs-empty';
        if (isBrushOrEraser()) {
          empty.textContent = getLangText('re_b', '画笔模式：在画布上拖拽绘制掩码。', 'Brush mode: drag on canvas to paint mask.');
        } else if (isYoloModel()) {
          empty.textContent = getLangText('re_y', '尚无运行结果。可直接点「运行」做全图分割，或先添加点/框筛选目标。', 'No runs yet. Run for full-image segmentation, or add points/boxes to filter targets.');
        } else {
          empty.textContent = getLangText('re_s', '尚无运行结果。添加点/框后点「运行」。', 'No runs yet. Add prompts, then Run.');
        }
        runsListPanel.appendChild(empty);
      } else {
        completedSegments.forEach(function (seg, segIdx) {
          var row = document.createElement('div');
          row.className = 'annotate-segment-row d-flex align-items-start flex-wrap mb-2';
          if (editingSegIdx === segIdx) row.className += ' is-editing';
          row.style.borderLeft = '4px solid rgb(' + seg.rgb.r + ',' + seg.rgb.g + ',' + seg.rgb.b + ')';
          row.style.paddingLeft = '10px';
          var main = document.createElement('div'); main.className = 'flex-grow-1 pr-2';
          var title = document.createElement('div'); title.className = 'font-weight-bold small';
          title.textContent = seg.categoryName || '—';
          if (seg.isManual) {
            var manBadge = document.createElement('span'); manBadge.className = 'annotate-seg-edit-badge';
            manBadge.textContent = getLangText('manual', '手绘', 'Manual');
            title.appendChild(manBadge);
          }
          if (editingSegIdx === segIdx) {
            var editBadge = document.createElement('span'); editBadge.className = 'annotate-seg-edit-badge';
            editBadge.textContent = getLangText('editing', '编辑中', 'Editing');
            title.appendChild(editBadge);
          }
          var sub = document.createElement('div'); sub.className = 'text-muted small';
          var promptPart = summarizePromptsForSegment(seg.promptsSnapshot, seg.boxesSnapshot);
          if (seg.annotationId) promptPart = getLangText('sfd', '已保存', 'Saved') + ' · ' + promptPart;
          sub.textContent = segmentRoleLabel(seg.segmentRole) + ' · ' + promptPart;
          main.appendChild(title); main.appendChild(sub);

          var btns = document.createElement('div');
          btns.className = 'd-flex flex-shrink-0';
          btns.style.gap = '4px';

          if (isBrushOrEraser() && editingSegIdx !== segIdx) {
            var editBtn = document.createElement('button'); editBtn.type = 'button';
            editBtn.className = 'btn btn-sm btn-outline-info btn-edit-seg';
            editBtn.textContent = getLangText('seg_edit', '编辑', 'Edit');
            editBtn.addEventListener('click', function () {
              stopEditingSegment(true);
              startEditingSegment(segIdx);
              redrawOverlay();
            });
            btns.appendChild(editBtn);
          }

          var del = document.createElement('button'); del.type = 'button';
          del.className = 'btn btn-sm btn-outline-danger';
          del.textContent = getLangText('seg_rm', '删除', 'Remove');
          del.addEventListener('click', function () { deleteSegmentById(seg.id); });
          btns.appendChild(del);
          row.appendChild(main); row.appendChild(btns);
          runsListPanel.appendChild(row);
        });
      }
    }

    if (!promptListEl) return;
    promptListEl.innerHTML = '';
    if (!prompts.length && !boxes.length) {
      var hint = document.createElement('div'); hint.className = 'prompt-item';
      if (isBrushOrEraser()) {
        hint.textContent = getLangText('br_hint',
          '画笔/橡皮模式：左键拖拽绘制，滚轮或 [ ] 调节笔刷大小。切回「点」或「框」模式可继续添加模型提示。',
          'Brush/Eraser: drag to paint. Scroll or [ ] to resize. Switch to Point/Box for model prompts.');
      } else if (isYoloModel()) {
        hint.textContent = getLangText('yolo_hint',
          'YOLO 分割：可直接运行进行全图实例分割；也可添加前景点/框仅保留覆盖目标的实例掩码。',
          'YOLO segmentation: run directly for full-image instance segmentation, or add points/boxes to filter instances.');
      } else {
        hint.textContent = getLangText('pm_hint',
          '左键加点/拖框（框模式），右键负点。选好分割角色后点「运行」；类别名可留空，未填时标签为 default。可多次运行后「保存全部」。',
          'Left: point or box; right: negative. Pick segment role, then Run; label defaults to "default". Repeat, then Save all.');
      }
      promptListEl.appendChild(hint);
      return;
    }
    prompts.forEach(function (p, i) {
      var el = document.createElement('div'); el.className = 'prompt-item';
      el.textContent = (i + 1) + '. (' + Math.round(p.x) + ', ' + Math.round(p.y) + ') ' + (p.positive ? '＋' : '－');
      promptListEl.appendChild(el);
    });
    boxes.forEach(function (b, i) {
      var el = document.createElement('div'); el.className = 'prompt-item';
      el.textContent = getLangText('bi', '框 ' + (i + 1) + ': (' + Math.round(b.x1) + ', ' + Math.round(b.y1) + ') → (' + Math.round(b.x2) + ', ' + Math.round(b.y2) + ')',
        'Box ' + (i + 1) + ': (' + Math.round(b.x1) + ', ' + Math.round(b.y1) + ') → (' + Math.round(b.x2) + ', ' + Math.round(b.y2) + ')');
      promptListEl.appendChild(el);
    });
  }

  /* ── Canvas sizing ── */
  function resetAnnotateImageLayout() {
    zoom = 1.0; if (zoomLevel) zoomLevel.textContent = '100%';
    baseDisplayW = 0; baseDisplayH = 0;
    if (imgEl) { imgEl.style.width = ''; imgEl.style.maxWidth = ''; imgEl.style.height = ''; }
    if (canvas) { canvas.style.width = ''; canvas.style.height = ''; try { canvas.width = 0; canvas.height = 0; } catch (e) { /* */ } }
  }

  function captureImageBaseDisplaySize() {
    if (!imgEl.src || !imgEl.naturalWidth) return;
    imgEl.style.width = ''; imgEl.style.maxWidth = '100%'; imgEl.style.height = 'auto';
    canvas.style.width = ''; canvas.style.height = '';
    void imgEl.offsetWidth;
    baseDisplayW = imgEl.clientWidth; baseDisplayH = imgEl.clientHeight;
  }

  function resizeCanvasToImage() {
    if (!imgEl.src) return;
    captureImageBaseDisplaySize();
    applyZoom();
  }

  function applyZoom() {
    if (zoomLevel) zoomLevel.textContent = Math.round(zoom * 100) + '%';
    if (!imgEl.naturalWidth) return;
    if (!baseDisplayW || !baseDisplayH) captureImageBaseDisplaySize();
    if (!baseDisplayW || !baseDisplayH) return;
    var w = Math.max(8, Math.round(baseDisplayW * zoom));
    var h = Math.max(8, Math.round(baseDisplayH * zoom));
    imgEl.style.width = w + 'px'; imgEl.style.maxWidth = 'none'; imgEl.style.height = h + 'px';
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    canvas.width = w; canvas.height = h;
    redrawOverlay();
    scheduleTintRefresh();
  }

  /* ── Coordinate transforms ── */
  function canvasToImageCoords(cx, cy) {
    if (!imgEl.naturalWidth || !canvas.width) return { x: cx, y: cy };
    return { x: cx * (imgEl.naturalWidth / canvas.width), y: cy * (imgEl.naturalHeight / canvas.height) };
  }

  function imageToCanvasCoords(ix, iy) {
    if (!imgEl.naturalWidth || !canvas.width) return { x: ix, y: iy };
    return { x: ix * (canvas.width / imgEl.naturalWidth), y: iy * (canvas.height / imgEl.naturalHeight) };
  }

  function imageBoxToCanvasRect(b) {
    if (!imgEl.naturalWidth || !canvas.width) return { x: 0, y: 0, w: 0, h: 0 };
    var sx = canvas.width / imgEl.naturalWidth, sy = canvas.height / imgEl.naturalHeight;
    var x1 = b.x1 * sx, y1 = b.y1 * sy, x2 = b.x2 * sx, y2 = b.y2 * sy;
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  }

  /* ═══════════════════════════════════════════
   *  OVERLAY DRAWING
   * ═══════════════════════════════════════════ */
  function redrawOverlay() {
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    completedSegments.forEach(function (seg, idx) {
      if (idx === editingSegIdx && maskEditCanvas) {
        var tintedC = tintMaskToCanvas(maskEditCanvas, seg.rgb, canvas.width, canvas.height, maskAlpha);
        ctx.drawImage(tintedC, 0, 0);
      } else if (seg.tintedImg) {
        ctx.drawImage(seg.tintedImg, 0, 0);
      }
    });

    ctx.lineWidth = 2;
    prompts.forEach(function (p) {
      var c = imageToCanvasCoords(p.x, p.y);
      ctx.fillStyle = p.positive ? 'rgba(0, 255, 0, 0.9)' : 'rgba(255, 0, 0, 0.9)';
      ctx.beginPath(); ctx.arc(c.x, c.y, 6, 0, Math.PI * 2); ctx.fill();
    });
    boxes.forEach(function (b) {
      var rect = imageBoxToCanvasRect(b);
      ctx.strokeStyle = 'rgba(0, 123, 255, 0.9)';
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    });
    if (boxDrawing) {
      ctx.strokeStyle = 'rgba(0, 123, 255, 0.9)';
      ctx.setLineDash([5, 4]);
      var bx = Math.min(boxDrawing.startX, boxDrawing.endX);
      var by = Math.min(boxDrawing.startY, boxDrawing.endY);
      var bw = Math.abs(boxDrawing.endX - boxDrawing.startX);
      var bh = Math.abs(boxDrawing.endY - boxDrawing.startY);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.setLineDash([]);
    }

    if (isBrushOrEraser() && lastMouseCanvasPos && hasRealImage) {
      var scaleX = canvas.width / (imgEl.naturalWidth || 1);
      var br = Math.max(1, brushSize * scaleX);
      ctx.save();
      ctx.strokeStyle = promptMode === 'brush' ? 'rgba(255,255,255,0.85)' : 'rgba(255,80,80,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(lastMouseCanvasPos.x, lastMouseCanvasPos.y, br, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(lastMouseCanvasPos.x, lastMouseCanvasPos.y, br + 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ═══════════════════════════════════════════
   *  MODE SWITCHING
   * ═══════════════════════════════════════════ */
  function setPromptMode(mode) {
    var wasBrush = isBrushOrEraser();
    promptMode = mode;
    var nowBrush = isBrushOrEraser();

    if (modePointBtn) modePointBtn.classList.toggle('active', mode === 'point');
    if (modeBoxBtn) modeBoxBtn.classList.toggle('active', mode === 'box');
    if (modeBrushBtn) {
      modeBrushBtn.classList.remove('active', 'active-brush');
      if (mode === 'brush') modeBrushBtn.classList.add('active', 'active-brush');
    }
    if (modeEraserBtn) {
      modeEraserBtn.classList.remove('active', 'active-eraser');
      if (mode === 'eraser') modeEraserBtn.classList.add('active', 'active-eraser');
    }

    if (brushSizeGroup) {
      if (nowBrush) brushSizeGroup.classList.remove('d-none');
      else brushSizeGroup.classList.add('d-none');
    }

    if (canvasScroll) {
      canvasScroll.classList.remove('cursor-brush', 'cursor-eraser');
      if (mode === 'brush') canvasScroll.classList.add('cursor-brush');
      else if (mode === 'eraser') canvasScroll.classList.add('cursor-eraser');
    }

    if (wasBrush && !nowBrush) {
      stopEditingSegment(true);
    }
    if (nowBrush && !wasBrush) {
      if (completedSegments.length > 0) {
        startEditingSegment(completedSegments.length - 1);
      }
    }

    renderRunsAndPrompts();
    redrawOverlay();
  }

  if (modePointBtn) modePointBtn.addEventListener('click', function () { setPromptMode('point'); });
  if (modeBoxBtn) modeBoxBtn.addEventListener('click', function () { setPromptMode('box'); });
  if (modeBrushBtn) modeBrushBtn.addEventListener('click', function () { setPromptMode('brush'); });
  if (modeEraserBtn) modeEraserBtn.addEventListener('click', function () { setPromptMode('eraser'); });
  setPromptMode('point');

  /* ═══════════════════════════════════════════
   *  MOUSE EVENTS
   * ═══════════════════════════════════════════ */
  canvas.addEventListener('mousedown', function (ev) {
    if (!hasRealImage) return;
    var rect = canvas.getBoundingClientRect();
    var cx = ev.clientX - rect.left;
    var cy = ev.clientY - rect.top;

    if (isBrushOrEraser() && ev.button === 0) {
      ensureEditableSegment();
      if (editingSegIdx < 0) return;
      isDrawing = true;
      var imgPt = canvasToImageCoords(cx, cy);
      lastDrawPt = imgPt;
      paintAtImageCoords(imgPt.x, imgPt.y, promptMode === 'eraser');
      requestEditRedraw();
      return;
    }

    dragState = { button: ev.button, startX: cx, startY: cy };
    boxDrawing = null;
  });

  canvas.addEventListener('mousemove', function (ev) {
    var rect = canvas.getBoundingClientRect();
    var cx = ev.clientX - rect.left;
    var cy = ev.clientY - rect.top;
    lastMouseCanvasPos = { x: cx, y: cy };

    if (isBrushOrEraser()) {
      if (isDrawing && maskEditCtx) {
        var imgPt = canvasToImageCoords(cx, cy);
        if (lastDrawPt) paintLine(lastDrawPt.x, lastDrawPt.y, imgPt.x, imgPt.y, promptMode === 'eraser');
        else paintAtImageCoords(imgPt.x, imgPt.y, promptMode === 'eraser');
        lastDrawPt = imgPt;
        requestEditRedraw();
      } else {
        requestEditRedraw();
      }
      return;
    }

    if (!dragState || !hasRealImage) return;
    if (promptMode !== 'box') return;
    if (dragState.button !== 0) return;
    var dx = cx - dragState.startX, dy = cy - dragState.startY;
    if (Math.sqrt(dx * dx + dy * dy) >= 5) {
      boxDrawing = { startX: dragState.startX, startY: dragState.startY, endX: cx, endY: cy };
      redrawOverlay();
    }
  });

  canvas.addEventListener('mouseup', function (ev) {
    if (isBrushOrEraser()) {
      if (isDrawing) {
        isDrawing = false;
        lastDrawPt = null;
        if (editingSegIdx >= 0) {
          finalizeEditToSegment();
        }
        redrawOverlay();
      }
      return;
    }

    if (!dragState || !hasRealImage) return;
    var rect = canvas.getBoundingClientRect();
    var cx = ev.clientX - rect.left;
    var cy = ev.clientY - rect.top;
    var dx = cx - dragState.startX, dy = cy - dragState.startY;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dragState.button === 0) {
      if (promptMode === 'point') {
        if (dist < 5) {
          var imgCoords = canvasToImageCoords(cx, cy);
          prompts.push({ x: imgCoords.x, y: imgCoords.y, positive: true });
          redrawOverlay();
        }
      } else {
        if (dist >= 5) {
          var startImg = canvasToImageCoords(dragState.startX, dragState.startY);
          var endImg = canvasToImageCoords(cx, cy);
          boxes.push({ x1: startImg.x, y1: startImg.y, x2: endImg.x, y2: endImg.y });
        }
        boxDrawing = null;
        redrawOverlay();
      }
    } else if (dragState.button === 2) {
      var negCoords = canvasToImageCoords(cx, cy);
      prompts.push({ x: negCoords.x, y: negCoords.y, positive: false });
      redrawOverlay();
    }
    dragState = null;
    renderRunsAndPrompts();
  });

  canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); return false; });

  canvas.addEventListener('mouseleave', function () {
    lastMouseCanvasPos = null;
    if (isBrushOrEraser()) redrawOverlay();
  });

  /* ── Scroll wheel zoom ── */
  canvas.addEventListener('wheel', function (ev) {
    if (!hasRealImage) return;
    ev.preventDefault();
    var delta = ev.deltaY < 0 ? 0.1 : -0.1;
    zoom = Math.min(5, Math.max(0.1, zoom + delta));
    applyZoom();
  }, { passive: false });

  /* ── Brush size via wheel with Shift held ── */
  canvas.addEventListener('wheel', function (ev) {
    if (!isBrushOrEraser() || !ev.shiftKey) return;
    ev.preventDefault(); ev.stopPropagation();
    var d = ev.deltaY < 0 ? 3 : -3;
    brushSize = Math.min(100, Math.max(2, brushSize + d));
    if (brushSizeSlider) brushSizeSlider.value = brushSize;
    if (brushSizeLabel) brushSizeLabel.textContent = String(brushSize);
    redrawOverlay();
  }, { passive: false });

  /* ── Run segmentation ── */
  btnRun.addEventListener('click', function () {
    if (!imgEl.src || !hasRealImage) {
      alert(getLangText('pl', '请先在右侧任务目录中点击一条任务加载图片。', 'Select a task from the list to load an image.')); return;
    }
    if (!selectedLabel) {
      alert(getLangText('pr', '请先选择分割角色：前景、背景或其他。', 'Select segment role: foreground, background, or other.')); return;
    }
    var runCat = getTrimmedCategoryName() || 'default';
    if (!isYoloModel() && !prompts.length && !boxes.length) {
      alert(getLangText('np', '请先添加点或框提示。', 'Add point or box prompts first.')); return;
    }

    stopEditingSegment(true);
    showLoading();

    var sendSegmentation = function (fileBlob) {
      var form = new FormData();
      form.append('image', fileBlob, 'image.png');
      form.append('model', (segmentModelSelect && segmentModelSelect.value) || 'sam');
      if (prompts.length) {
        form.append('points', JSON.stringify(prompts.map(function (p) { return [p.x, p.y]; })));
        form.append('point_labels', JSON.stringify(prompts.map(function (p) { return p.positive ? 1 : 0; })));
      }
      if (boxes.length) {
        var b = boxes[0];
        form.append('box', JSON.stringify([b.x1, b.y1, b.x2, b.y2]));
      }
      fetchWithCsrf('/segment-image/', { method: 'POST', body: form }).then(function (r) {
        if (!r.ok) throw new Error('segmentation failed');
        return r.blob();
      }).then(function (blob) {
        hideLoading();
        var u = URL.createObjectURL(blob);
        var maskImg = new Image();
        maskImg.onload = function () {
          try { URL.revokeObjectURL(u); } catch (e) { /* */ }
          var cw = canvas.width, ch = canvas.height;
          var oc = document.createElement('canvas'); oc.width = cw; oc.height = ch;
          oc.getContext('2d').drawImage(maskImg, 0, 0, cw, ch);
          oc.toBlob(function (maskBlob) {
            if (!maskBlob) { alert(getLangText('se', '分割出错：', 'Segmentation error: ') + 'blob'); return; }
            var rgb = SEGMENT_RGB_PALETTE[completedSegments.length % SEGMENT_RGB_PALETTE.length];
            var seg = {
              id: nextLocalSegId++, maskBlob: maskBlob, rawMaskImg: maskImg, rgb: rgb,
              categoryName: runCat, segmentRole: selectedLabel,
              promptsSnapshot: JSON.parse(JSON.stringify(prompts)),
              boxesSnapshot: JSON.parse(JSON.stringify(boxes)),
              tintedImg: null,
            };
            tintMaskToImage(maskImg, rgb, cw, ch, maskAlpha, function (tinted) {
              seg.tintedImg = tinted;
              completedSegments.push(seg);
              prompts = []; boxes = []; boxDrawing = null; dragState = null;
              redrawOverlay(); renderRunsAndPrompts();
            });
          }, 'image/png');
        };
        maskImg.onerror = function () { hideLoading(); alert(getLangText('se', '分割出错：', 'Segmentation error: ') + 'image'); };
        maskImg.src = u;
      }).catch(function (err) {
        hideLoading(); console.error(err);
        alert(getLangText('se', '分割出错：', 'Segmentation error: ') + err.message);
      });
    };

    if (currentImageFile) {
      sendSegmentation(currentImageFile);
    } else {
      fetch(imgEl.src).then(function (r) { return r.blob(); }).then(function (blob) {
        sendSegmentation(blob);
      }).catch(function (e) {
        hideLoading(); console.error(e);
        alert(getLangText('fi', '无法获取图片用于分割。', 'Cannot fetch image for segmentation.'));
      });
    }
  });

  /* ── Save ── */
  btnSave.addEventListener('click', function () {
    stopEditingSegment(true);

    if (!currentTaskId) {
      alert(getLangText('nts', '未选择任务。请从右侧任务目录点击一条任务。', 'No task selected. Pick one from the task list.')); return;
    }
    var segs = completedSegments.filter(function (s) { return !s.annotationId; });
    if (!segs.length) {
      alert(getLangText('nus', '没有尚未保存的运行结果：可先「运行」产生新遮罩，或当前任务的遮罩均已写入数据库。',
        'Nothing new to save — run segmentation first, or every run on this task is already saved.')); return;
    }

    function ensureMaskBlob(seg, cb) {
      if (seg.maskBlob) { cb(seg.maskBlob); return; }
      if (seg.rawMaskImg) {
        var tc = document.createElement('canvas');
        tc.width = imgEl.naturalWidth || seg.rawMaskImg.naturalWidth || seg.rawMaskImg.width;
        tc.height = imgEl.naturalHeight || seg.rawMaskImg.naturalHeight || seg.rawMaskImg.height;
        tc.getContext('2d').drawImage(seg.rawMaskImg, 0, 0, tc.width, tc.height);
        tc.toBlob(function (bl) { seg.maskBlob = bl; cb(bl); }, 'image/png');
        return;
      }
      cb(null);
    }

    var savedItems = [];
    var idx = 0;

    function postOne(seg, cb) {
      ensureMaskBlob(seg, function (blob) {
        if (!blob) { cb(new Error('no mask'), { code: 0, msg: 'empty mask' }); return; }
        var fd = new FormData();
        fd.append('mask', blob, 'mask.png');
        fd.append('task_id', currentTaskId);
        fd.append('segment_role', seg.segmentRole);
        fd.append('category_name', seg.categoryName);
        fetchWithCsrf('/api/annotations/', { method: 'POST', body: fd })
          .then(function (r) { return r.json(); })
          .then(function (j) { cb(null, j); })
          .catch(function (e) { console.error(e); cb(e, { code: 0, msg: 'network' }); });
      });
    }

    function step() {
      if (idx >= segs.length) {
        showAnnotateSaveFeedback({ task_id: currentTaskId, saved_items: savedItems });
        hydrateTaskAnnotationsFromServer(currentTaskId);
        fetchCatalog();
        return;
      }
      postOne(segs[idx], function (err, j) {
        if (err || !j || j.code !== 1) {
          alert(getLangText('svf', '保存失败：', 'Save failed: ') + ((j && j.msg) || (err && err.message) || '') + ' (' + (idx + 1) + ')');
          return;
        }
        savedItems.push({
          annotation_id: j.annotation_id,
          category_name: j.category_name || segs[idx].categoryName,
          segment_role: j.segment_role || segs[idx].segmentRole,
        });
        idx += 1;
        step();
      });
    }
    step();
  });

  /* ── Undo / Clear ── */
  btnUndo.addEventListener('click', function () {
    if (isBrushOrEraser()) return;
    if (promptMode === 'point' && prompts.length) prompts.pop();
    else if (promptMode === 'box' && boxes.length) boxes.pop();
    else if (prompts.length) prompts.pop();
    else if (boxes.length) boxes.pop();
    else return;
    redrawOverlay(); renderRunsAndPrompts();
  });

  btnClear.addEventListener('click', function () {
    prompts = []; boxes = []; boxDrawing = null;
    redrawOverlay(); renderRunsAndPrompts();
  });

  if (btnReset) btnReset.addEventListener('click', function () {
    stopEditingSegment(false);
    prompts = []; boxes = []; boxDrawing = null;
    segments = [];
    redrawOverlay(); renderRunsAndPrompts();
  });

  /* ── Zoom buttons ── */
  if (zoomIn) zoomIn.addEventListener('click', function () { zoom = Math.min(5, zoom + 0.1); applyZoom(); });
  if (zoomOut) zoomOut.addEventListener('click', function () { zoom = Math.max(0.1, zoom - 0.1); applyZoom(); });
  if (zoomReset) zoomReset.addEventListener('click', function () { zoom = 1.0; applyZoom(); });

  /* ── Window resize ── */
  var annotateResizeTimer = null;
  function scheduleAnnotateResize() {
    if (annotateResizeTimer) clearTimeout(annotateResizeTimer);
    annotateResizeTimer = setTimeout(function () { annotateResizeTimer = null; if (hasRealImage && imgEl && imgEl.src) resizeCanvasToImage(); }, 120);
  }
  window.addEventListener('resize', scheduleAnnotateResize);

  /* ── Mask opacity slider ── */
  if (maskOpacity) {
    maskOpacity.addEventListener('input', function () { maskAlpha = parseFloat(maskOpacity.value); scheduleTintRefresh(); });
  }

  /* ── Brush size slider ── */
  if (brushSizeSlider) {
    brushSizeSlider.addEventListener('input', function () {
      brushSize = parseInt(brushSizeSlider.value, 10) || 15;
      if (brushSizeLabel) brushSizeLabel.textContent = String(brushSize);
      redrawOverlay();
    });
  }

  /* ── Labels panel ── */
  if (labelsPanel) {
    var fg = labelsPanel.querySelector('.label-row[data-label="foreground"]');
    if (fg && !selectedLabel) { fg.classList.add('active'); selectedLabel = 'foreground'; }
    labelsPanel.addEventListener('click', function (ev) {
      var row = ev.target.closest('.label-row');
      if (!row) return;
      labelsPanel.querySelectorAll('.label-row').forEach(function (r) { r.classList.remove('active'); });
      row.classList.add('active');
      selectedLabel = row.dataset.label;
    });
  }

  /* ── Export ── */
  if (btnExportAnnotation) {
    btnExportAnnotation.addEventListener('click', function () {
      var pid = projectSelect && projectSelect.value;
      if (!pid) { alert(getLangText('enp', '请先选择项目。', 'Select a project first.')); return; }
      var fmt = annotExportFormat ? annotExportFormat.value : 'coco';
      var url = projectExportUrl(annotateBoot, pid, fmt);
      var extMap = { coco: '_coco.json', simple: '_simple.json', voc: '_voc.zip', yolo_bbox: '_yolo.zip', mask_png: '_masks.zip' };
      fetchWithCsrf(url, { method: 'GET' }).then(function (r) {
        var ct = (r.headers.get('Content-Type') || '').toLowerCase();
        if (!r.ok) {
          if (ct.indexOf('application/json') >= 0) return r.json().then(function (j) { throw new Error(j.msg || 'export failed'); });
          throw new Error('HTTP ' + r.status);
        }
        return r.blob();
      }).then(function (blob) {
        downloadBlob('project_' + pid + (extMap[fmt] || '_export.bin'), blob);
      }).catch(function (e) {
        console.error(e);
        alert(getLangText('ef', '导出失败：', 'Export failed: ') + (e.message || String(e)));
      });
    });
  }

  /* ═══════════════════════════════════════════
   *  KEYBOARD SHORTCUTS
   * ═══════════════════════════════════════════ */
  window.addEventListener('keydown', function (ev) {
    var tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (ev.code === 'Space') { ev.preventDefault(); btnRun.click(); return; }
    if ((ev.key === 's' || ev.key === 'S') && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); btnSave.click(); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'z') { ev.preventDefault(); btnUndo.click(); return; }

    if (ev.key === 'p' || ev.key === 'P') { ev.preventDefault(); setPromptMode('point'); return; }
    if (ev.key === 'x' || ev.key === 'X') { ev.preventDefault(); setPromptMode('box'); return; }
    if (ev.key === 'b' || ev.key === 'B') { ev.preventDefault(); setPromptMode('brush'); return; }
    if (ev.key === 'e' || ev.key === 'E') { ev.preventDefault(); setPromptMode('eraser'); return; }

    if (ev.key === '[') {
      ev.preventDefault();
      brushSize = Math.max(2, brushSize - 3);
      if (brushSizeSlider) brushSizeSlider.value = brushSize;
      if (brushSizeLabel) brushSizeLabel.textContent = String(brushSize);
      redrawOverlay(); return;
    }
    if (ev.key === ']') {
      ev.preventDefault();
      brushSize = Math.min(100, brushSize + 3);
      if (brushSizeSlider) brushSizeSlider.value = brushSize;
      if (brushSizeLabel) brushSizeLabel.textContent = String(brushSize);
      redrawOverlay(); return;
    }

    if (ev.key === 'c' || ev.key === 'C') { ev.preventDefault(); btnClear.click(); return; }
    if (ev.key === 'r' || ev.key === 'R') { ev.preventDefault(); if (btnReset) btnReset.click(); return; }
  });

  /* ── Init ── */
  updateSegmentModelDependentUI();
  if (projectSelect && projectSelect.value) {
    if (btnNewTask) btnNewTask.disabled = false;
    if (btnRefreshList) btnRefreshList.disabled = false;
    fetchCatalog();
  } else {
    renderTaskList();
  }
  updateExportButtons();

  /* ── Collapsible cards ── */
  var workflowCollapse = document.getElementById('annotateWorkflowCollapse');
  var workflowToggle = document.querySelector('[data-target="#annotateWorkflowCollapse"]');
  if (workflowCollapse && workflowToggle) {
    try { if (localStorage.getItem('laps_annotate_workflow_collapsed') === '1') { workflowCollapse.classList.remove('show'); workflowToggle.setAttribute('aria-expanded', 'false'); } } catch (e) { /* */ }
    workflowCollapse.addEventListener('hidden.bs.collapse', function () { try { localStorage.setItem('laps_annotate_workflow_collapsed', '1'); } catch (e) { /* */ } });
    workflowCollapse.addEventListener('shown.bs.collapse', function () { try { localStorage.removeItem('laps_annotate_workflow_collapsed'); } catch (e) { /* */ } });
  }
  var toolbarCollapse = document.getElementById('annotateToolbarCollapse');
  var toolbarToggle = document.querySelector('[data-target="#annotateToolbarCollapse"]');
  if (toolbarCollapse && toolbarToggle) {
    try { if (localStorage.getItem('laps_annotate_toolbar_collapsed') === '1') { toolbarCollapse.classList.remove('show'); toolbarToggle.setAttribute('aria-expanded', 'false'); } } catch (e) { /* */ }
    toolbarCollapse.addEventListener('hidden.bs.collapse', function () { try { localStorage.setItem('laps_annotate_toolbar_collapsed', '1'); } catch (e) { /* */ } });
    toolbarCollapse.addEventListener('shown.bs.collapse', function () { try { localStorage.removeItem('laps_annotate_toolbar_collapsed'); } catch (e) { /* */ } });
  }
});
