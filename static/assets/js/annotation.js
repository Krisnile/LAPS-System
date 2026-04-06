/**
 * 标注页 /annotate/：项目下拉 → 任务列表（API catalog）→ 加载图片 → SAM 交互 → 保存遮罩。
 * 依赖：annotate-bootstrap JSON、Bootstrap 4 collapse/modal、与 tasks/projects 页相同的数据规则。
 *
 * 模块概览：
 *  - 任务目录渲染 / 状态 PATCH / 删除 / 新建任务弹窗
 *  - 画布：点/框提示、缩放、Run(Segment)、Save(Annotation)、Undo、Clear
 *  - 工作流卡片折叠状态：localStorage laps_annotate_workflow_collapsed
 */
function getLangText(key, zhText, enText) {
  try {
    const lang = localStorage.getItem('site_lang') || 'zh';
    return (lang === 'en') ? (enText || zhText) : (zhText || enText);
  } catch (e) {
    return zhText;
  }
}

function getAnnotateBootstrap() {
  const el = document.getElementById('annotate-bootstrap');
  if (!el) return { urls: {}, stats: {}, flags: {} };
  try {
    return JSON.parse(el.textContent);
  } catch (e) {
    return { urls: {}, stats: {}, flags: {} };
  }
}

function getCsrfToken() {
  const m = document.cookie.match(/csrftoken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function fetchWithCsrf(url, options) {
  const headers = new Headers((options && options.headers) || {});
  const token = getCsrfToken();
  if (token && !headers.has('X-CSRFToken')) {
    headers.set('X-CSRFToken', token);
  }
  return fetch(url, Object.assign({}, options, { headers, credentials: 'same-origin' }));
}

function taskDetailUrl(annotateBoot, taskId) {
  const tpl = (annotateBoot.urls && annotateBoot.urls.task_detail_tpl) || '/api/annotate/tasks/0/';
  return tpl.replace(/\/0\/?$/, '/' + taskId + '/');
}

document.addEventListener('DOMContentLoaded', function () {
  const annotateBoot = getAnnotateBootstrap();
  const imgEl = document.getElementById('annot-image');
  const canvas = document.getElementById('annot-overlay');
  const btnRun = document.getElementById('btnRunSAM');
  const btnSave = document.getElementById('btnSave');
  const btnUndo = document.getElementById('btnUndo');
  const btnClear = document.getElementById('btnClear');
  const promptListEl = document.getElementById('promptList');
  const zoomIn = document.getElementById('zoomIn');
  const zoomOut = document.getElementById('zoomOut');
  const zoomReset = document.getElementById('zoomReset');
  const zoomLevel = document.getElementById('zoomLevel');
  const maskOpacity = document.getElementById('maskOpacity');
  const labelsPanel = document.getElementById('labelsPanel');
  const placeholder = document.getElementById('annot-placeholder');
  const modePointBtn = document.getElementById('modePointBtn');
  const modeBoxBtn = document.getElementById('modeBoxBtn');
  const projectSelect = document.getElementById('annotateProjectSelect');
  const taskListEl = document.getElementById('annotateTaskList');
  const taskCountEl = document.getElementById('annotateTaskCount');
  const btnNewTask = document.getElementById('btnAnnotateNewTask');
  const btnRefreshList = document.getElementById('btnAnnotateRefreshList');
  const linkedWarningEl = document.getElementById('annotateLinkedWarning');
  const deleteModal = document.getElementById('annotateDeleteTaskModal');
  const deleteConfirmBtn = document.getElementById('annotateDeleteTaskConfirm');
  const newTaskModal = document.getElementById('annotateNewTaskModal');

  let promptMode = 'point';
  let currentImageFile = null;
  let currentTaskId = null;
  let prompts = [];
  let boxes = [];
  let selectedLabel = null;
  let zoom = 1.0;
  let maskAlpha = parseFloat(maskOpacity ? maskOpacity.value : 0.6);
  let boxDrawing = null;
  let dragState = null;
  let hasRealImage = false;
  let catalogTasks = [];
  let pendingDeleteTaskId = null;

  const TASK_STATUSES = ['new', 'assigned', 'in_review', 'done'];

  function showFlowMessage(html, kind) {
    const el = document.getElementById('annotateFlowMessage');
    if (!el) return;
    el.className = 'annotate-flow-message mt-2 ' + (kind || 'alert-info');
    el.innerHTML = html;
    el.classList.remove('d-none');
  }

  function hideFlowMessage() {
    const el = document.getElementById('annotateFlowMessage');
    if (!el) return;
    el.classList.add('d-none');
    el.innerHTML = '';
  }

  function statusLabel(st) {
    const map = {
      new: getLangText('st_new', '新建', 'New'),
      assigned: getLangText('st_assigned', '已指派', 'Assigned'),
      in_review: getLangText('st_review', '审核中', 'In review'),
      done: getLangText('st_done', '已完成', 'Done'),
    };
    return map[st] || st;
  }

  function updateLinkedWarning(proj) {
    if (!linkedWarningEl) return;
    if (!proj || proj.linked_count > 0) {
      linkedWarningEl.classList.add('d-none');
      linkedWarningEl.textContent = '';
      return;
    }
    linkedWarningEl.classList.remove('d-none');
    linkedWarningEl.innerHTML = getLangText(
      'warn_link',
      '提示：该项目尚未在库中关联任何数据集。您仍可使用账号下任意数据集中的图片创建任务（规则与<a href="' + (annotateBoot.urls.tasks || '/tasks/') + '">任务页</a>一致）。建议在<a href="' + (annotateBoot.urls.projects || '/projects/') + '">项目页</a>编辑并勾选关联数据集以便团队协作。',
      'This project has no linked datasets in the database yet. You can still create tasks from any of your images (same rules as the <a href="' + (annotateBoot.urls.tasks || '/tasks/') + '">Tasks</a> page). Consider linking datasets under <a href="' + (annotateBoot.urls.projects || '/projects/') + '">Projects</a>.'
    );
  }

  function renderTaskList() {
    if (!taskListEl) return;
    taskListEl.innerHTML = '';
    if (taskCountEl) taskCountEl.textContent = String(catalogTasks.length);

    if (!projectSelect || !projectSelect.value) {
      taskListEl.innerHTML = '<p class="small text-muted p-2 mb-0">' + getLangText('pick_proj', '请先选择项目。', 'Select a project first.') + '</p>';
      return;
    }
    if (!catalogTasks.length) {
      taskListEl.innerHTML = '<p class="small text-muted p-2 mb-0">' + getLangText(
        'no_tasks',
        '该项目下尚无任务。点击「新建任务」或前往任务页批量生成。',
        'No tasks for this project. Use “New task” or the Tasks page.'
      ) + '</p>';
      return;
    }

    catalogTasks.forEach(function (t) {
      const div = document.createElement('div');
      div.className = 'annotate-task-item' + (currentTaskId === t.id ? ' active' : '');
      div.dataset.taskId = String(t.id);

      const title = document.createElement('div');
      title.className = 'annotate-task-title';
      title.textContent = '#' + t.id + ' · ' + (t.image_name || '—');

      const meta = document.createElement('div');
      meta.className = 'annotate-task-meta';
      meta.textContent = (t.dataset_name || '') + ' · ' + statusLabel(t.status);

      const actions = document.createElement('div');
      actions.className = 'annotate-task-actions';

      const sel = document.createElement('select');
      sel.className = 'form-control form-control-sm';
      TASK_STATUSES.forEach(function (st) {
        const opt = document.createElement('option');
        opt.value = st;
        opt.textContent = statusLabel(st);
        if (st === t.status) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('click', function (ev) { ev.stopPropagation(); });
      sel.addEventListener('change', function (ev) {
        ev.stopPropagation();
        const newSt = sel.value;
        patchTaskStatus(t.id, newSt, function (ok) {
          if (ok) {
            t.status = newSt;
            showFlowMessage(
              getLangText('status_upd', '任务状态已更新。', 'Task status updated.'),
              'alert-success'
            );
            renderTaskList();
          }
        });
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-sm btn-outline-danger';
      delBtn.textContent = getLangText('del', '删除', 'Delete');
      delBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        pendingDeleteTaskId = t.id;
        const body = document.getElementById('annotateDeleteTaskBody');
        if (body) {
          body.textContent = getLangText('del_confirm', '确定删除任务 #' + t.id + '？（数据库中删除，不可恢复）', 'Delete task #' + t.id + '? This cannot be undone.');
        }
        if (window.jQuery && window.jQuery.fn.modal) {
          window.jQuery('#annotateDeleteTaskModal').modal('show');
        } else if (deleteModal) {
          deleteModal.classList.add('show');
        }
      });

      actions.appendChild(sel);
      actions.appendChild(delBtn);
      div.appendChild(title);
      div.appendChild(meta);
      div.appendChild(actions);

      div.addEventListener('click', function (ev) {
        if (ev.target.closest('select') || ev.target.closest('button')) return;
        loadTaskFromRow(t);
      });

      taskListEl.appendChild(div);
    });
  }

  function loadTaskFromRow(t) {
    currentTaskId = t.id;
    currentImageFile = null;
    catalogTasks = catalogTasks.map(function (x) { return x; });
    renderTaskList();
    if (!t.image_url) {
      alert(getLangText('no_url', '该任务没有可用的图片地址。', 'This task has no image URL.'));
      return;
    }
    imgEl.src = t.image_url;
    imgEl.onload = function () {
      resizeCanvasToImage();
      prompts = [];
      boxes = [];
      boxDrawing = null;
      dragState = null;
      hasRealImage = true;
      if (placeholder) placeholder.style.display = 'none';
      renderPrompts();
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    const curEl = document.getElementById('currentTask');
    if (curEl) {
      curEl.textContent = getLangText('task_num', '任务 #' + t.id, 'Task #' + t.id);
    }
    const meta = document.getElementById('taskMeta');
    if (meta) {
      meta.textContent = (t.dataset_name ? t.dataset_name + ' · ' : '') + statusLabel(t.status);
    }
    hideFlowMessage();
  }

  function fetchCatalog() {
    const pid = projectSelect && projectSelect.value;
    if (!pid) {
      catalogTasks = [];
      renderTaskList();
      return;
    }
    const base = annotateBoot.urls.catalog || '/api/annotate/catalog/';
    const url = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'project_id=' + encodeURIComponent(pid);
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.code !== 1) {
          showFlowMessage((j.msg || '') || getLangText('catalog_err', '加载任务目录失败。', 'Failed to load catalog.'), 'alert-warning');
          catalogTasks = [];
          renderTaskList();
          return;
        }
        catalogTasks = j.tasks || [];
        updateLinkedWarning(j.project);
        renderTaskList();
        hideFlowMessage();
      })
      .catch(function (e) {
        console.error(e);
        showFlowMessage(getLangText('catalog_err', '加载任务目录失败。', 'Failed to load catalog.'), 'alert-warning');
      });
  }

  function patchTaskStatus(taskId, status, cb) {
    const url = taskDetailUrl(annotateBoot, taskId);
    fetchWithCsrf(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status }),
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.code === 1) {
          if (cb) cb(true);
        } else {
          alert(j.msg || getLangText('patch_fail', '更新失败', 'Update failed'));
          if (cb) cb(false);
          fetchCatalog();
        }
      })
      .catch(function (e) {
        console.error(e);
        alert(getLangText('patch_fail', '更新失败', 'Update failed'));
        if (cb) cb(false);
      });
  }

  function loadAvailableImagesForModal() {
    const pid = projectSelect && projectSelect.value;
    const grid = document.getElementById('annotateNewTaskGrid');
    const emptyBox = document.getElementById('annotateNewTaskEmpty');
    if (!grid) return;
    grid.innerHTML = '';
    if (emptyBox) {
      emptyBox.classList.add('d-none');
      emptyBox.textContent = '';
    }
    if (!pid) return;
    const base = annotateBoot.urls.available_images || '/api/annotate/available-images/';
    const url = base + (base.indexOf('?') >= 0 ? '&' : '?') + 'project_id=' + encodeURIComponent(pid);
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.code !== 1 || !j.images || !j.images.length) {
          if (emptyBox) {
            emptyBox.classList.remove('d-none');
            emptyBox.textContent = getLangText(
              'no_avail_img',
              '没有可添加的图片：请先在数据集上传，或任务页批量生成；已建过任务的图不会重复出现。',
              'No images available to add. Upload in Datasets or use Tasks page; images already in a task are hidden.'
            );
          }
          return;
        }
        j.images.forEach(function (im) {
          const cell = document.createElement('div');
          cell.className = 'annotate-pick-cell';
          if (im.image_url) {
            const img = document.createElement('img');
            img.src = im.image_url;
            img.alt = '';
            cell.appendChild(img);
          }
          const cap = document.createElement('div');
          cap.textContent = im.dataset_name + ' · #' + im.id;
          cell.appendChild(cap);
          cell.addEventListener('click', function () {
            createTask(im.id);
          });
          grid.appendChild(cell);
        });
      })
      .catch(function (e) {
        console.error(e);
        if (emptyBox) {
          emptyBox.classList.remove('d-none');
          emptyBox.textContent = getLangText('load_img_fail', '加载可选图片失败。', 'Failed to load images.');
        }
      });
  }

  function createTask(imageId) {
    const pid = projectSelect && projectSelect.value;
    if (!pid) return;
    const url = annotateBoot.urls.task_create || '/api/annotate/tasks/';
    fetchWithCsrf(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: parseInt(pid, 10), image_id: imageId }),
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.code !== 1) {
          alert(j.msg || getLangText('create_fail', '创建任务失败', 'Failed to create task'));
          return;
        }
        if (window.jQuery && window.jQuery.fn.modal) {
          window.jQuery('#annotateNewTaskModal').modal('hide');
        }
        fetchCatalog();
        if (j.task) {
          loadTaskFromRow(j.task);
        }
        showFlowMessage(getLangText('created', '任务已创建。', 'Task created.'), 'alert-success');
      })
      .catch(function (e) {
        console.error(e);
        alert(getLangText('create_fail', '创建任务失败', 'Failed to create task'));
      });
  }

  if (projectSelect) {
    projectSelect.addEventListener('change', function () {
      currentTaskId = null;
      catalogTasks = [];
      hasRealImage = false;
      if (placeholder) placeholder.style.display = '';
      imgEl.removeAttribute('src');
      const curEl = document.getElementById('currentTask');
      if (curEl) curEl.textContent = getLangText('none', '未选择', 'None');
      const meta = document.getElementById('taskMeta');
      if (meta) meta.textContent = '';
      const enabled = !!projectSelect.value;
      if (btnNewTask) btnNewTask.disabled = !enabled;
      if (btnRefreshList) btnRefreshList.disabled = !enabled;
      if (enabled) {
        fetchCatalog();
      } else {
        updateLinkedWarning(null);
        renderTaskList();
      }
    });
  }

  if (btnRefreshList) {
    btnRefreshList.addEventListener('click', function () {
      fetchCatalog();
    });
  }

  if (newTaskModal) {
    newTaskModal.addEventListener('show.bs.modal', loadAvailableImagesForModal);
  }

  if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener('click', function () {
      if (!pendingDeleteTaskId) return;
      const url = taskDetailUrl(annotateBoot, pendingDeleteTaskId);
      fetchWithCsrf(url, { method: 'DELETE' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j.code !== 1) {
            alert(j.msg || getLangText('del_fail', '删除失败', 'Delete failed'));
            return;
          }
          if (currentTaskId === pendingDeleteTaskId) {
            currentTaskId = null;
            hasRealImage = false;
            if (placeholder) placeholder.style.display = '';
            imgEl.removeAttribute('src');
          }
          pendingDeleteTaskId = null;
          if (window.jQuery && window.jQuery.fn.modal) {
            window.jQuery('#annotateDeleteTaskModal').modal('hide');
          }
          fetchCatalog();
        })
        .catch(function (e) {
          console.error(e);
          alert(getLangText('del_fail', '删除失败', 'Delete failed'));
        });
    });
  }

  function renderPrompts() {
    promptListEl.innerHTML = '';
    if (!prompts.length && !boxes.length) {
      const hint = document.createElement('div');
      hint.className = 'prompt-item';
      hint.textContent = getLangText(
        'prompt_hint',
        '左键加点/拖框（框模式），右键负点。先点「运行」再「保存」。',
        'Left: points or box (box mode). Right: negative. Run SAM, then Save.'
      );
      promptListEl.appendChild(hint);
      return;
    }
    prompts.forEach(function (p, i) {
      const el = document.createElement('div');
      el.className = 'prompt-item';
      el.textContent = (i + 1) + '. (' + Math.round(p.x) + ', ' + Math.round(p.y) + ') ' + (p.positive ? '＋' : '－');
      promptListEl.appendChild(el);
    });
    boxes.forEach(function (b, i) {
      const el = document.createElement('div');
      el.className = 'prompt-item';
      el.textContent = getLangText(
        'box_item',
        '框 ' + (i + 1) + ': (' + Math.round(b.x1) + ', ' + Math.round(b.y1) + ') → (' + Math.round(b.x2) + ', ' + Math.round(b.y2) + ')',
        'Box ' + (i + 1) + ': (' + Math.round(b.x1) + ', ' + Math.round(b.y1) + ') → (' + Math.round(b.x2) + ', ' + Math.round(b.y2) + ')'
      );
      promptListEl.appendChild(el);
    });
  }

  function resizeCanvasToImage() {
    if (!imgEl.src) return;
    canvas.width = imgEl.clientWidth;
    canvas.height = imgEl.clientHeight;
    canvas.style.width = imgEl.clientWidth + 'px';
    canvas.style.height = imgEl.clientHeight + 'px';
  }

  btnRun.addEventListener('click', function () {
    if (!imgEl.src || !hasRealImage) {
      alert(getLangText('please_load', '请先在右侧任务目录中点击一条任务加载图片。', 'Select a task from the list to load an image.'));
      return;
    }

    const sendSegmentation = function (fileBlob) {
      const form = new FormData();
      form.append('image', fileBlob, 'image.png');
      if (prompts.length) {
        const pts = prompts.map(function (p) { return [p.x, p.y]; });
        form.append('points', JSON.stringify(pts));
      }
      if (boxes.length) {
        const b = boxes[0];
        form.append('box', JSON.stringify([b.x1, b.y1, b.x2, b.y2]));
      }
      fetchWithCsrf('/segment-image/', { method: 'POST', body: form }).then(function (r) {
        if (!r.ok) throw new Error('segmentation failed');
        return r.blob();
      }).then(function (blob) {
        const u = URL.createObjectURL(blob);
        const maskImg = new Image();
        maskImg.onload = function () {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.globalAlpha = maskAlpha;
          ctx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
          ctx.globalAlpha = 1.0;
        };
        maskImg.src = u;
      }).catch(function (err) {
        console.error(err);
        alert(getLangText('seg_error', '分割出错：', 'Segmentation error: ') + err.message);
      });
    };

    if (currentImageFile) {
      sendSegmentation(currentImageFile);
    } else {
      fetch(imgEl.src).then(function (r) { return r.blob(); }).then(function (blob) {
        sendSegmentation(blob);
      }).catch(function (e) {
        console.error(e);
        alert(getLangText('fetch_img', '无法获取图片用于分割。', 'Cannot fetch image for segmentation.'));
      });
    }
  });

  btnSave.addEventListener('click', function () {
    if (!currentTaskId) {
      alert(getLangText('no_task', '未选择任务。请从右侧任务目录点击一条任务。', 'No task selected. Pick one from the task list.'));
      return;
    }
    canvas.toBlob(function (blob) {
      const fd = new FormData();
      fd.append('mask', blob, 'mask.png');
      fd.append('task_id', currentTaskId);
      if (selectedLabel) fd.append('label', selectedLabel);
      fetchWithCsrf('/api/annotations/', { method: 'POST', body: fd }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.code === 1) {
          alert(getLangText('saved_ok', '已保存标注 (id=', 'Saved (id=') + j.annotation_id + ')');
          fetchCatalog();
        } else {
          alert(getLangText('save_failed', '保存失败：', 'Save failed: ') + j.msg);
        }
      }).catch(function (e) {
        console.error(e);
        alert(getLangText('save_error', '保存出错', 'Save error'));
      });
    }, 'image/png');
  });

  function setPromptMode(mode) {
    promptMode = mode;
    if (modePointBtn && modeBoxBtn) {
      modePointBtn.classList.toggle('active', mode === 'point');
      modeBoxBtn.classList.toggle('active', mode === 'box');
    }
  }
  if (modePointBtn) modePointBtn.addEventListener('click', function () { setPromptMode('point'); });
  if (modeBoxBtn) modeBoxBtn.addEventListener('click', function () { setPromptMode('box'); });
  setPromptMode('point');

  function canvasToImageCoords(canvasX, canvasY) {
    const scaleX = imgEl.naturalWidth / imgEl.clientWidth;
    const scaleY = imgEl.naturalHeight / imgEl.clientHeight;
    return { x: canvasX * scaleX, y: canvasY * scaleY };
  }

  function redrawOverlay() {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    boxes.forEach(function (b) {
      const rect = imageBoxToCanvasRect(b);
      ctx.strokeStyle = 'rgba(0, 123, 255, 0.9)';
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    });
    if (boxDrawing) {
      ctx.strokeStyle = 'rgba(0, 123, 255, 0.9)';
      ctx.setLineDash([5, 4]);
      const x = Math.min(boxDrawing.startX, boxDrawing.endX);
      const y = Math.min(boxDrawing.startY, boxDrawing.endY);
      const w = Math.abs(boxDrawing.endX - boxDrawing.startX);
      const h = Math.abs(boxDrawing.endY - boxDrawing.startY);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }

  function imageBoxToCanvasRect(b) {
    const scaleX = imgEl.clientWidth / imgEl.naturalWidth;
    const scaleY = imgEl.clientHeight / imgEl.naturalHeight;
    const x1 = b.x1 * scaleX;
    const y1 = b.y1 * scaleY;
    const x2 = b.x2 * scaleX;
    const y2 = b.y2 * scaleY;
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
    };
  }

  canvas.addEventListener('mousedown', function (ev) {
    if (!hasRealImage) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    dragState = { button: ev.button, startX: cx, startY: cy };
    boxDrawing = null;
  });

  canvas.addEventListener('mousemove', function (ev) {
    if (!dragState || !hasRealImage) return;
    if (promptMode !== 'box') return;
    if (dragState.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    const dx = cx - dragState.startX;
    const dy = cy - dragState.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= 5) {
      boxDrawing = {
        startX: dragState.startX,
        startY: dragState.startY,
        endX: cx,
        endY: cy,
      };
      redrawOverlay();
    }
  });

  canvas.addEventListener('mouseup', function (ev) {
    if (!dragState || !hasRealImage) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    const dx = cx - dragState.startX;
    const dy = cy - dragState.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const threshold = 5;

    if (dragState.button === 0) {
      if (promptMode === 'point') {
        if (dist < threshold) {
          const imgCoords = canvasToImageCoords(cx, cy);
          prompts.push({ x: imgCoords.x, y: imgCoords.y, positive: true });
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = 'rgba(0,255,0,0.9)';
          ctx.beginPath();
          ctx.arc(cx, cy, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        if (dist >= threshold) {
          const startImg = canvasToImageCoords(dragState.startX, dragState.startY);
          const endImg = canvasToImageCoords(cx, cy);
          boxes.push({
            x1: startImg.x,
            y1: startImg.y,
            x2: endImg.x,
            y2: endImg.y,
          });
        }
        boxDrawing = null;
        redrawOverlay();
      }
    } else if (dragState.button === 2) {
      const imgCoords = canvasToImageCoords(cx, cy);
      prompts.push({ x: imgCoords.x, y: imgCoords.y, positive: false });
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(255,0,0,0.9)';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    dragState = null;
    renderPrompts();
  });

  canvas.addEventListener('contextmenu', function (ev) {
    ev.preventDefault();
    return false;
  });

  btnUndo.addEventListener('click', function () {
    if (boxes.length) {
      boxes.pop();
    } else if (prompts.length) {
      prompts.pop();
    } else {
      return;
    }
    redrawOverlay();
    renderPrompts();
  });

  btnClear.addEventListener('click', function () {
    prompts = [];
    boxes = [];
    boxDrawing = null;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderPrompts();
  });

  if (zoomIn) zoomIn.addEventListener('click', function () { zoom = Math.min(3, zoom + 0.1); applyZoom(); });
  if (zoomOut) zoomOut.addEventListener('click', function () { zoom = Math.max(0.2, zoom - 0.1); applyZoom(); });
  if (zoomReset) zoomReset.addEventListener('click', function () { zoom = 1.0; applyZoom(); });

  function applyZoom() {
    imgEl.style.transform = 'scale(' + zoom + ')';
    canvas.style.transform = 'scale(' + zoom + ')';
    if (zoomLevel) zoomLevel.textContent = Math.round(zoom * 100) + '%';
  }

  if (maskOpacity) {
    maskOpacity.addEventListener('input', function () {
      maskAlpha = parseFloat(maskOpacity.value);
    });
  }

  if (labelsPanel) {
    labelsPanel.addEventListener('click', function (ev) {
      const row = ev.target.closest('.label-row');
      if (!row) return;
      labelsPanel.querySelectorAll('.label-row').forEach(function (r) { r.classList.remove('active'); });
      row.classList.add('active');
      selectedLabel = row.dataset.label;
    });
  }

  window.addEventListener('keydown', function (ev) {
    if (ev.code === 'Space') { ev.preventDefault(); btnRun.click(); }
    if (ev.key === 's' || ev.key === 'S') { ev.preventDefault(); btnSave.click(); }
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'z') { ev.preventDefault(); btnUndo.click(); }
    if (ev.key === 'c' || ev.key === 'C') { ev.preventDefault(); btnClear.click(); }
  });

  renderPrompts();
  if (projectSelect && projectSelect.value) {
    if (btnNewTask) btnNewTask.disabled = false;
    if (btnRefreshList) btnRefreshList.disabled = false;
    fetchCatalog();
  } else {
    renderTaskList();
  }

  // 顶部「标注工作流」折叠：记住用户偏好，避免刷新后反复展开
  var workflowCollapse = document.getElementById('annotateWorkflowCollapse');
  var workflowToggle = document.querySelector('[data-target="#annotateWorkflowCollapse"]');
  if (workflowCollapse && workflowToggle) {
    try {
      if (localStorage.getItem('laps_annotate_workflow_collapsed') === '1') {
        workflowCollapse.classList.remove('show');
        workflowToggle.setAttribute('aria-expanded', 'false');
      }
    } catch (e) { /* ignore */ }
    workflowCollapse.addEventListener('hidden.bs.collapse', function () {
      try { localStorage.setItem('laps_annotate_workflow_collapsed', '1'); } catch (e2) { /* ignore */ }
    });
    workflowCollapse.addEventListener('shown.bs.collapse', function () {
      try { localStorage.removeItem('laps_annotate_workflow_collapsed'); } catch (e3) { /* ignore */ }
    });
  }
});
