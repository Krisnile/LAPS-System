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

  let currentImageFile = null;
  let currentTaskId = null;
  let prompts = [] // {x,y,positive}
  let selectedLabel = null;
  let zoom = 1.0;
  let maskAlpha = parseFloat(maskOpacity ? maskOpacity.value : 0.6);

  function renderPrompts() {
    promptListEl.innerHTML = '';
    prompts.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'prompt-item';
      el.textContent = `${i+1}. (${Math.round(p.x)}, ${Math.round(p.y)}) ${p.positive? '＋':'－'}`;
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
      renderPrompts();
    };
  });

    btnRun.addEventListener('click', function () {
    if (!imgEl.src) {
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

  // Click to record point prompts (left=positive, right=negative)
  canvas.addEventListener('click', function (ev) {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (imgEl.naturalWidth / imgEl.clientWidth);
    const y = (ev.clientY - rect.top) * (imgEl.naturalHeight / imgEl.clientHeight);
    prompts.push({ x: x, y: y, positive: true });
    // draw small green dot
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,255,0,0.9)';
    ctx.beginPath();
    const drawX = (ev.clientX - rect.left);
    const drawY = (ev.clientY - rect.top);
    ctx.arc(drawX, drawY, 6, 0, Math.PI * 2);
    ctx.fill();
    renderPrompts();
  });
  canvas.addEventListener('contextmenu', function (ev) {
    ev.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left) * (imgEl.naturalWidth / imgEl.clientWidth);
    const y = (ev.clientY - rect.top) * (imgEl.naturalHeight / imgEl.clientHeight);
    prompts.push({ x: x, y: y, positive: false });
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(255,0,0,0.9)';
    const drawX = (ev.clientX - rect.left);
    const drawY = (ev.clientY - rect.top);
    ctx.beginPath();
    ctx.arc(drawX, drawY, 6, 0, Math.PI * 2);
    ctx.fill();
    renderPrompts();
    return false;
  });

  // Undo/clear
  btnUndo.addEventListener('click', function () {
    if (!prompts.length) return;
    prompts.pop();
    // redraw overlay by clearing and, if mask exists, keep it (simple approach: clear points only)
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderPrompts();
  });

  btnClear.addEventListener('click', function () {
    prompts = [];
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
      imgEl.onload = function () { resizeCanvasToImage(); prompts = []; renderPrompts(); };
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
