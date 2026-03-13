// Lightweight annotation UI glue code (skeleton)
// - Upload image
// - Display image in <img id="annot-image"> and overlay canvas
// - Send image to /segment-image/ to get SAM mask (or fallback)

document.addEventListener('DOMContentLoaded', function () {
  const imgEl = document.getElementById('annot-image');
  const canvas = document.getElementById('annot-overlay');
  const fileInput = document.getElementById('imageUpload');
  const btnRun = document.getElementById('btnRunSAM');
  const btnSave = document.getElementById('btnSave');
  const btnUndo = document.getElementById('btnUndo');
  const btnClear = document.getElementById('btnClear');
  const promptListEl = document.getElementById('promptList');
  const btnNext = document.getElementById('btnNextTask');
  const btnPrev = document.getElementById('btnPrevTask');
  const zoomIn = document.getElementById('zoomIn');
  const zoomOut = document.getElementById('zoomOut');
  const zoomReset = document.getElementById('zoomReset');
  const zoomLevel = document.getElementById('zoomLevel');
  const maskOpacity = document.getElementById('maskOpacity');
  const labelsPanel = document.getElementById('labelsPanel');
  const btnAssignNext = document.getElementById('btnAssignNext');
  const btnSubmitReview = document.getElementById('btnSubmitReview');
  const historyList = document.getElementById('historyList');
  const placeholder = document.getElementById('annot-placeholder');

  let currentImageFile = null;
  let currentTaskId = null;
  let prompts = [] // {x,y,positive}
  let boxes = []   // {x1,y1,x2,y2}
  let selectedLabel = null;
  let zoom = 1.0;
  let maskAlpha = parseFloat(maskOpacity ? maskOpacity.value : 0.6);
  let boxDrawing = null; // 当前正在拖拽的框（canvas 坐标）
  let dragState = null;  // {button, startX, startY}（canvas 坐标）
  let hasRealImage = false; // 是否已经加载了真正的任务/上传图片

  function renderPrompts() {
    promptListEl.innerHTML = '';
    if (!prompts.length && !boxes.length) {
      const hint = document.createElement('div');
      hint.className = 'prompt-item';
      hint.textContent = getLangText(
        'prompt_hint',
        '点击图片：左键正点，右键负点。框选模式下按住拖拽即可画框。',
        'Click: left=positive, right=negative. In box mode, drag to draw a rectangle.'
      );
      promptListEl.appendChild(hint);
      return;
    }
    prompts.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'prompt-item';
      el.textContent = `${i + 1}. (${Math.round(p.x)}, ${Math.round(p.y)}) ${p.positive ? '＋' : '－'}`;
      promptListEl.appendChild(el);
    });
    boxes.forEach((b, i) => {
      const el = document.createElement('div');
      el.className = 'prompt-item';
      el.textContent = getLangText(
        'box_item',
        `框 ${i + 1}: (${Math.round(b.x1)}, ${Math.round(b.y1)}) → (${Math.round(b.x2)}, ${Math.round(b.y2)})`,
        `Box ${i + 1}: (${Math.round(b.x1)}, ${Math.round(b.y1)}) → (${Math.round(b.x2)}, ${Math.round(b.y2)})`
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

  fileInput.addEventListener('change', function (ev) {
    const f = ev.target.files[0];
    if (!f) return;
    currentImageFile = f;
    const url = URL.createObjectURL(f);
    imgEl.src = url;
    imgEl.onload = function () {
      resizeCanvasToImage();
      // reset state
      currentTaskId = null;
      prompts = [];
      boxes = [];
      boxDrawing = null;
      dragState = null;
      hasRealImage = true;
      if (placeholder) placeholder.style.display = 'none';
      renderPrompts();
    };
  });

    btnRun.addEventListener('click', function () {
    if (!imgEl.src || !hasRealImage) {
      alert(getLangText('please_upload', '请先上传或加载图片', 'Please upload or load an image first'));
      return;
    }

    // Build form: if we have a currentImageFile (uploaded locally) use it,
    // otherwise fetch image from URL and send as blob.
    const sendSegmentation = (fileBlob) => {
      const form = new FormData();
      form.append('image', fileBlob, 'image.png');
      if (prompts.length) {
        const pts = prompts.map(p => [p.x, p.y]);
        form.append('points', JSON.stringify(pts));
      }
      if (boxes.length) {
        const bxs = boxes.map(b => [b.x1, b.y1, b.x2, b.y2]);
        form.append('boxes', JSON.stringify(bxs));
      }
      fetch('/segment-image/', { method: 'POST', body: form }).then(r => {
        if (!r.ok) throw new Error('segmentation failed');
        return r.blob();
      }).then(blob => {
        const url = URL.createObjectURL(blob);
        const maskImg = new Image();
        maskImg.onload = function () {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.globalAlpha = maskAlpha;
          ctx.drawImage(maskImg, 0, 0, canvas.width, canvas.height);
          ctx.globalAlpha = 1.0;
        };
        maskImg.src = url;
        }).catch(err => {
        console.error(err);
        alert(getLangText('seg_error', '分割出错：', 'Segmentation error: ') + err.message);
      });
    };

    if (currentImageFile) {
      sendSegmentation(currentImageFile);
    } else {
      // fetch image from imgEl.src
      fetch(imgEl.src).then(r => r.blob()).then(blob => {
        sendSegmentation(blob);
      }).catch(e => {
        console.error(e);
        alert('无法获取图像用于分割 (cannot fetch image)');
      });
    }
  });

    btnSave.addEventListener('click', function () {
    // Save annotation: POST canvas as mask to /api/annotations/ with task_id
    if (!currentTaskId) {
      alert(getLangText('no_task', '未选择任务。请使用 下一张 按钮或上传绑定任务的图片。', 'No task selected. Use Next Task or upload an image tied to a task.'));
      return;
    }
    canvas.toBlob(function (blob) {
      const fd = new FormData();
      fd.append('mask', blob, 'mask.png');
      fd.append('task_id', currentTaskId);
      if (selectedLabel) fd.append('label', selectedLabel);
          fetch('/api/annotations/', { method: 'POST', body: fd }).then(r => r.json()).then(j => {
        if (j.code === 1) {
          alert(getLangText('saved_ok', '注释已保存 (id=', 'Annotation saved (id=') + j.annotation_id + ')');
          // append history
          if (historyList) {
            const h = document.createElement('div');
            h.textContent = getLangText('history_saved', `保存注释 ${j.annotation_id} (${selectedLabel || '无标签'})`, `Saved annotation ${j.annotation_id} (${selectedLabel || 'no label'})`);
            historyList.prepend(h);
          }
        } else {
          alert(getLangText('save_failed', '保存失败：', 'Save failed: ') + j.msg);
        }
      }).catch(e => {
        console.error(e);
        alert(getLangText('save_error', '保存出错', 'Save error'));
      });
    }, 'image/png');
  });

  // Mode toggles (point / box)
  function setPromptMode(mode) {
    promptMode = mode;
    if (modePointBtn && modeBoxBtn) {
      modePointBtn.classList.toggle('active', mode === 'point');
      modeBoxBtn.classList.toggle('active', mode === 'box');
    }
  }
  if (modePointBtn) {
    modePointBtn.addEventListener('click', function () { setPromptMode('point'); });
  }
  if (modeBoxBtn) {
    modeBoxBtn.addEventListener('click', function () { setPromptMode('box'); });
  }
  setPromptMode('point');

  // Helpers to convert between canvas coords and image coords
  function canvasToImageCoords(canvasX, canvasY) {
    const scaleX = imgEl.naturalWidth / imgEl.clientWidth;
    const scaleY = imgEl.naturalHeight / imgEl.clientHeight;
    return {
      x: canvasX * scaleX,
      y: canvasY * scaleY,
    };
  }

  // Draw current box overlay (for visual feedback)
  function redrawOverlay() {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // existing boxes
    ctx.lineWidth = 2;
    boxes.forEach(b => {
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

  // Click / drag events on canvas：根据鼠标轨迹自动判断点选或框选
  canvas.addEventListener('mousedown', function (ev) {
    if (!hasRealImage) return; // 占位图时不允许标注
    const rect = canvas.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    dragState = {
      button: ev.button,
      startX: cx,
      startY: cy,
    };
    boxDrawing = null;
  });

  canvas.addEventListener('mousemove', function (ev) {
    if (!dragState || !hasRealImage) return;
    // 仅左键拖动才考虑成为框
    if (dragState.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    const dx = cx - dragState.startX;
    const dy = cy - dragState.startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const threshold = 5; // 像素阈值，避免误判单击为框
    if (dist >= threshold) {
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
      // 左键：短距离认为是点，长距离认为是框
      if (dist < threshold) {
        const imgCoords = canvasToImageCoords(cx, cy);
        prompts.push({ x: imgCoords.x, y: imgCoords.y, positive: true });
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,255,0,0.9)';
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const startImg = canvasToImageCoords(dragState.startX, dragState.startY);
        const endImg = canvasToImageCoords(cx, cy);
        boxes.push({
          x1: startImg.x,
          y1: startImg.y,
          x2: endImg.x,
          y2: endImg.y,
        });
        boxDrawing = null;
        redrawOverlay();
      }
    } else if (dragState.button === 2) {
      // 右键：始终作为负点（忽略拖拽）
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
    // 统一屏蔽默认右键菜单，便于负点操作
    ev.preventDefault();
    return false;
  });

  // Undo/clear
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

  // Next task
  btnNext.addEventListener('click', function () {
    fetch('/tasks/next/').then(r => r.json()).then(j => {
      if (j.code !== 1) {
        alert('No next task');
        return;
      }
      currentTaskId = j.task;
      // load image
      imgEl.src = j.image_url;
      imgEl.onload = function () {
        resizeCanvasToImage();
        prompts = [];
        boxes = [];
        boxDrawing = null;
        dragState = null;
        hasRealImage = true;
        if (placeholder) placeholder.style.display = 'none';
        renderPrompts();
      };
      document.getElementById('currentTask').textContent = 'Task #' + currentTaskId;
    }).catch(e => { console.error(e); alert('Error fetching next task'); });
  });

    btnPrev.addEventListener('click', function () {
    alert(getLangText('prev_not_impl', '上一项尚未实现', 'Previous task not implemented in MVP'));
  });

  // Zoom controls
  if (zoomIn) zoomIn.addEventListener('click', function () { zoom = Math.min(3, zoom + 0.1); applyZoom(); });
  if (zoomOut) zoomOut.addEventListener('click', function () { zoom = Math.max(0.2, zoom - 0.1); applyZoom(); });
  if (zoomReset) zoomReset.addEventListener('click', function () { zoom = 1.0; applyZoom(); });

  function applyZoom() {
    imgEl.style.transform = `scale(${zoom})`;
    canvas.style.transform = `scale(${zoom})`;
    if (zoomLevel) zoomLevel.textContent = Math.round(zoom*100) + '%';
  }

  // mask opacity control
  if (maskOpacity) {
    maskOpacity.addEventListener('input', function () {
      maskAlpha = parseFloat(maskOpacity.value);
    });
  }

  // labels selection
  if (labelsPanel) {
    labelsPanel.addEventListener('click', function (ev) {
      const row = ev.target.closest('.label-row');
      if (!row) return;
      // clear active
      labelsPanel.querySelectorAll('.label-row').forEach(r => r.classList.remove('active'));
      row.classList.add('active');
      selectedLabel = row.dataset.label;
    });
  }

  if (btnAssignNext) {
    btnAssignNext.addEventListener('click', function () {
      // simple alias to Next that also assigns on server side
      btnNext.click();
    });
  }

    if (btnSubmitReview) {
    btnSubmitReview.addEventListener('click', function () {
      alert(getLangText('submit_review', '提交审核：功能将在第二阶段实现', 'Submit for review: feature to be implemented in stage 2'));
    });
  }

  // keyboard shortcuts
  window.addEventListener('keydown', function (ev) {
    if (ev.code === 'Space') { ev.preventDefault(); btnRun.click(); }
    if (ev.key === 's' || ev.key === 'S') { ev.preventDefault(); btnSave.click(); }
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'z') { ev.preventDefault(); btnUndo.click(); }
    if (ev.key === 'c' || ev.key === 'C') { ev.preventDefault(); btnClear.click(); }
  });
});

// Simple runtime i18n helper: prefers localStorage.site_lang ('zh'|'en'), default 'zh'
function getLangText(key, zhText, enText) {
  try {
    const lang = localStorage.getItem('site_lang') || 'zh';
    return (lang === 'en') ? (enText || zhText) : (zhText || enText);
  } catch (e) {
    return zhText;
  }
}
