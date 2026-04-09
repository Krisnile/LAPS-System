/**
 * 任务页（/tasks/）：样例项目、Django 表单批量建任务、React 侧任务表选择与列表维护。
 * 数据来自模板 data-tasks-props + 可选的 tasks_api 刷新；样式见 static/assets/css/laps-theme.css .tasks-page
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'

// ---------------------------------------------------------------------------
// 小工具（与 Django 模板 / 后端约定对齐）
// ---------------------------------------------------------------------------

function getCsrfFromCookie() {
  if (typeof document === 'undefined') return ''
  const m = document.cookie.match(/csrftoken=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

function taskDetailUrl(tpl, taskId) {
  const base = tpl || '/api/annotate/tasks/0/'
  return base.replace(/\/0\/?$/, '/' + taskId + '/')
}

const TASK_STATUSES = ['pending', 'done']

/** 表内任务表格分页大小 */
const TASK_LIST_PAGE_SIZE = 10

/** 与后端 Project.annotation_type 一致，用于样例演示 POST */
const TYPE_SEG = 'segmentation_sam'
const TYPE_DET = 'detection_yolo'

function getLangText(zhText, enText) {
  try {
    return localStorage.getItem('site_lang') === 'en' ? enText || zhText : zhText || enText
  } catch (e) {
    return zhText
  }
}

/** 快速样例区：分割 / 检测 类型示意卡片（仅 UI 选择，提交时带 annotation_type） */
function TaskTypeSample({ title, subtitle, variant, selected, onSelect, annotationType }) {
  const isSeg = variant === 'seg'
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(annotationType)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(annotationType)
        }
      }}
      className={`laps-task-sample-card card h-100 cursor-pointer ${selected ? 'laps-task-sample-selected shadow-sm' : 'border-secondary'}`}
      style={{ overflow: 'hidden' }}
    >
      <div
        className="laps-task-sample-visual"
        style={{
          height: 140,
          background: isSeg
            ? 'linear-gradient(135deg, #1a237e22 0%, #7b1fa244 50%, #00897b33 100%)'
            : 'linear-gradient(135deg, #e6510022 0%, #ff6f0044 100%)',
          position: 'relative',
        }}
      >
        {isSeg ? (
          <>
            <div
              style={{
                position: 'absolute',
                left: '12%',
                top: '18%',
                width: '55%',
                height: '52%',
                border: '3px solid rgba(0, 137, 123, 0.85)',
                borderRadius: '40% 60% 45% 55%',
                transform: 'rotate(-8deg)',
                background: 'rgba(0, 137, 123, 0.15)',
              }}
            />
            <span
              className="badge badge-success"
              style={{ position: 'absolute', right: 8, bottom: 8, fontSize: 11 }}
              data-en="Mask / polygon"
              data-zh="掩码区域"
            >
              掩码区域
            </span>
          </>
        ) : (
          <>
            <div
              style={{
                position: 'absolute',
                left: '15%',
                top: '25%',
                width: '28%',
                height: '38%',
                border: '3px solid #e65100',
                borderRadius: 4,
                background: 'rgba(230, 81, 0, 0.12)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                right: '18%',
                top: '30%',
                width: '22%',
                height: '35%',
                border: '3px solid #e65100',
                borderRadius: 4,
                background: 'rgba(230, 81, 0, 0.12)',
              }}
            />
            <span
              className="badge badge-warning text-dark"
              style={{ position: 'absolute', right: 8, bottom: 8, fontSize: 11 }}
              data-en="Bounding boxes"
              data-zh="检测框"
            >
              检测框
            </span>
          </>
        )}
        {selected ? (
          <span className="badge badge-primary" style={{ position: 'absolute', left: 8, top: 8, fontSize: 11 }}>
            {getLangText('已选', 'Selected')}
          </span>
        ) : null}
      </div>
      <div className="card-body py-3">
        <h6 className="card-title mb-1">{title}</h6>
        <p className="card-text small text-muted mb-0">{subtitle}</p>
      </div>
    </div>
  )
}

function statusLabel(st) {
  const map = {
    pending: getLangText('待标注', 'Pending'),
    done: getLangText('已完成', 'Done'),
  }
  return map[st] || st
}

/** 数据集 id：无、0、非法值 → null；用于分组展示与 delete-group */
function normalizedDatasetId(raw) {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (Number.isNaN(n) || n === 0) return null
  return n
}

/** 与后端 tasks_delete_group 一致：`project_id:dataset_id`，无数据集时为 `:0` */
function taskGroupKey(t) {
  const did = normalizedDatasetId(t.dataset_id)
  return `${t.project_id}:${did ?? 0}`
}

// ---------------------------------------------------------------------------
// 主组件（#root-tasks）
// ---------------------------------------------------------------------------

function TasksApp({
  projects = [],
  datasets = [],
  tasks: initialTasks = [],
  urls = {},
}) {
  const csrfToken = getCsrfFromCookie()

  // 批量创建表单：受控 select，便于与项目关联数据集联动
  const [batchProjectId, setBatchProjectId] = useState(() => String(projects[0]?.id ?? ''))
  // 快速样例：POST sample_demo 所用 annotation_type
  const [selectedAnnotationType, setSelectedAnnotationType] = useState(TYPE_SEG)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoMsg, setDemoMsg] = useState({ kind: '', text: '' })

  const [taskRows, setTaskRows] = useState(initialTasks)
  /** 当前选中的「任务表」= project + dataset 分组键；空字符串表示未选 */
  const [selectedGroupKey, setSelectedGroupKey] = useState('')
  const [taskListPage, setTaskListPage] = useState(1)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addProjectId, setAddProjectId] = useState(() => String(projects[0]?.id ?? ''))
  const [addImages, setAddImages] = useState([])
  const [addLoading, setAddLoading] = useState(false)

  /** 由 taskRows 聚合出的任务表列表（每个唯一 project+dataset 一行） */
  const taskGroups = useMemo(() => {
    const m = new Map()
    for (const t of taskRows) {
      const key = taskGroupKey(t)
      if (!m.has(key)) {
        const dsId = normalizedDatasetId(t.dataset_id)
        m.set(key, {
          key,
          project_id: t.project_id,
          project_name: t.project_name || '—',
          dataset_id: dsId,
          dataset_name: t.dataset_name || '—',
          task_count: 0,
          pending_count: 0,
        })
      }
      const g = m.get(key)
      g.task_count += 1
      if (t.status !== 'done') g.pending_count += 1
    }
    return Array.from(m.values()).sort((a, b) => {
      const s1 = `${a.project_name} ${a.dataset_name}`
      const s2 = `${b.project_name} ${b.dataset_name}`
      return s1.localeCompare(s2)
    })
  }, [taskRows])

  const filteredTasks = useMemo(() => {
    if (!selectedGroupKey) return []
    return taskRows.filter((t) => taskGroupKey(t) === selectedGroupKey)
  }, [taskRows, selectedGroupKey])

  const taskListTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredTasks.length / TASK_LIST_PAGE_SIZE)),
    [filteredTasks.length],
  )

  const pagedTasks = useMemo(() => {
    const start = (taskListPage - 1) * TASK_LIST_PAGE_SIZE
    return filteredTasks.slice(start, start + TASK_LIST_PAGE_SIZE)
  }, [filteredTasks, taskListPage])

  const selectedGroup = useMemo(
    () => taskGroups.find((g) => g.key === selectedGroupKey) || null,
    [taskGroups, selectedGroupKey],
  )

  const selectedBatchProject = useMemo(
    () => projects.find((p) => String(p.id) === String(batchProjectId)),
    [projects, batchProjectId],
  )

  const filteredDatasets = useMemo(() => {
    if (!selectedBatchProject) return datasets
    const linked = selectedBatchProject.linked_dataset_ids || []
    if (!linked.length) return datasets
    const set = new Set(linked.map(Number))
    return datasets.filter((d) => set.has(d.id))
  }, [datasets, selectedBatchProject])

  /** GET tasks_json_list，用于保存/删除后与服务器同步 */
  const refreshTasks = useCallback(async () => {
    const api = urls.tasks_api
    if (!api) return
    try {
      const res = await fetch(api, { credentials: 'same-origin' })
      const data = await res.json()
      if (data.code === 1 && Array.isArray(data.tasks)) {
        setTaskRows(data.tasks)
      }
    } catch (e) {
      console.error(e)
    }
  }, [urls.tasks_api])

  useEffect(() => {
    refreshTasks()
  }, [refreshTasks])

  /** 分组变化时：无表则清空选择；有表则校验当前 key 是否仍存在 */
  useEffect(() => {
    if (!taskGroups.length) {
      setSelectedGroupKey('')
      return
    }
    setSelectedGroupKey((prev) => {
      if (!prev) return ''
      return taskGroups.some((g) => g.key === prev) ? prev : ''
    })
  }, [taskGroups])

  useEffect(() => {
    setTaskListPage(1)
  }, [selectedGroupKey])

  /** 总条数减少时避免当前页超出末页 */
  useEffect(() => {
    setTaskListPage((p) => Math.min(Math.max(1, p), taskListTotalPages))
  }, [taskListTotalPages])

  /** 打开新建任务弹窗时拉取可添加图片 */
  useEffect(() => {
    if (!addModalOpen || !addProjectId) return
    const base = urls.available_images || ''
    if (!base) return
    const u = base + (base.includes('?') ? '&' : '?') + 'project_id=' + encodeURIComponent(addProjectId)
    setAddLoading(true)
    fetch(u)
      .then((r) => r.json())
      .then((j) => {
        setAddImages(j.code === 1 && j.images ? j.images : [])
      })
      .catch(() => setAddImages([]))
      .finally(() => setAddLoading(false))
  }, [addModalOpen, addProjectId, urls.available_images])

  async function handleSampleDemo() {
    const endpoint = urls.sample_demo
    if (!endpoint) {
      setDemoMsg({ kind: 'danger', text: 'sample_demo URL missing' })
      return
    }
    setDemoMsg({ kind: '', text: '' })
    setDemoLoading(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken,
        },
        body: JSON.stringify({ annotation_type: selectedAnnotationType }),
      })
      const data = await res.json()
      if (data.code === 1) {
        await refreshTasks()
        const ann = urls.annotation || '/annotate/'
        const link = data.project_id ? `${ann.replace(/\/?$/, '/')}?project=${data.project_id}` : ann
        setDemoMsg({
          kind: 'success',
          text:
            getLangText(
              `已创建样例项目（${data.task_count || 0} 条任务）。`,
              `Sample project created (${data.task_count || 0} tasks).`,
            ) +
            ` <a href="${link}">${getLangText('去标注', 'Open annotate')}</a>`,
        })
      } else {
        setDemoMsg({ kind: 'danger', text: data.msg || `Error (${res.status})` })
      }
    } catch (e) {
      setDemoMsg({ kind: 'danger', text: e.message || 'Request failed' })
    } finally {
      setDemoLoading(false)
    }
  }

  function patchTaskStatus(taskId, status) {
    const tpl = urls.task_detail_tpl
    const url = taskDetailUrl(tpl, taskId)
    return fetchWithCsrf(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.code !== 1) throw new Error(j.msg || 'patch failed')
        return j
      })
  }

  /** 统一附带 CSRF，供 PATCH/DELETE/POST JSON 使用 */
  function fetchWithCsrf(url, options) {
    const headers = new Headers(options.headers || {})
    if (csrfToken) headers.set('X-CSRFToken', csrfToken)
    return fetch(url, { ...options, headers, credentials: 'same-origin' })
  }

  function deleteTask(taskId) {
    if (!window.confirm(getLangText('确认删除该任务？', 'Delete this task?'))) return
    const url = taskDetailUrl(urls.task_detail_tpl, taskId)
    fetchWithCsrf(url, { method: 'DELETE' })
      .then((r) => r.json())
      .then((j) => {
        if (j.code !== 1) throw new Error(j.msg)
        refreshTasks()
      })
      .catch((e) => alert(e.message || 'Delete failed'))
  }

  function deleteTaskGroup(g) {
    if (!g || g.dataset_id == null) {
      alert(
        getLangText(
          '该组缺少数据集标识，无法批量删除。请逐条删除或联系管理员。',
          'This group has no dataset id; use single-task delete or fix data.',
        ),
      )
      return
    }
    const msg = getLangText(
      `确认删除任务表「${g.project_name} / ${g.dataset_name}」下的全部 ${g.task_count} 条任务？此操作不可恢复。`,
      `Delete all ${g.task_count} task(s) under "${g.project_name} / ${g.dataset_name}"? This cannot be undone.`,
    )
    if (!window.confirm(msg)) return
    const endpoint = urls.tasks_delete_group
    if (!endpoint) return
    fetchWithCsrf(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: g.project_id, dataset_id: g.dataset_id }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.code !== 1) throw new Error(j.msg || 'failed')
        refreshTasks()
      })
      .catch((e) => alert(e.message || 'Delete failed'))
  }

  function createTaskFromImage(imageId) {
    const pid = addProjectId
    const endpoint = urls.task_create
    if (!endpoint || !pid) return
    fetchWithCsrf(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: parseInt(pid, 10), image_id: imageId }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.code !== 1) throw new Error(j.msg || 'create failed')
        setAddModalOpen(false)
        refreshTasks()
      })
      .catch((e) => alert(e.message || 'Create failed'))
  }

  // -------------------------------------------------------------------------
  // 布局：三块卡片 — 样例 | 批量表单 | 任务表 + 列表（含分页与弹窗）
  // -------------------------------------------------------------------------
  return (
    <div className="content tasks-page">
      <div className="row">
        <div className="col-md-12">
          {/* ① 标注类型卡片 + 快速样例 */}
          <div className="card mb-4">
            <div className="card-header">
              <h4 className="card-title mb-0" data-en="Tasks" data-zh="任务管理">
                任务管理
              </h4>
              <p
                className="card-category mb-0"
                data-en="Choose a task type, create a sample project, then manage tasks below."
                data-zh="选择标注类型后可创建体验样例；下方可进行批量建任务与任务表维护。"
              >
                选择标注类型后可创建体验样例；下方可进行批量建任务与任务表维护。
              </p>
            </div>
            <div className="card-body">
              <h5 className="mb-3" data-en="Annotation task types" data-zh="标注任务类型">
                标注任务类型
              </h5>
              <p className="small text-muted mb-3" data-en="Click a card to choose. Sample project will match this type." data-zh="点击选择一种类型；下方按钮将按所选类型创建固定样例项目与任务。">
                点击选择一种类型；下方按钮将按所选类型创建固定样例项目与任务。
              </p>
              <div className="row mb-3">
                <div className="col-md-6 mb-3">
                  <TaskTypeSample
                    variant="seg"
                    annotationType={TYPE_SEG}
                    selected={selectedAnnotationType === TYPE_SEG}
                    onSelect={setSelectedAnnotationType}
                    title="图像分割（SAM）"
                    subtitle="像素级掩码示意，样例项目类型为 segmentation_sam。"
                  />
                </div>
                <div className="col-md-6 mb-3">
                  <TaskTypeSample
                    variant="det"
                    annotationType={TYPE_DET}
                    selected={selectedAnnotationType === TYPE_DET}
                    onSelect={setSelectedAnnotationType}
                    title="目标检测（YOLO）"
                    subtitle="检测框示意，样例项目类型为 detection_yolo。"
                  />
                </div>
              </div>
              <div className="mb-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={demoLoading}
                  onClick={handleSampleDemo}
                  data-en="Create quick sample project and tasks"
                  data-zh="创建快速样例项目任务"
                >
                  {demoLoading ? '…' : '创建快速样例项目任务'}
                </button>
              </div>
              {demoMsg.text ? (
                <div className={`alert alert-${demoMsg.kind || 'info'} py-2 small mb-0`} dangerouslySetInnerHTML={{ __html: demoMsg.text }} />
              ) : null}
            </div>
          </div>

          {/* ② Django POST 批量创建（不走 React API） */}
          <div className="card mb-4">
            <div className="card-header">
              <h5 className="mb-0" data-en="Batch: project + dataset" data-zh="项目关联数据集 · 批量创建任务">
                项目关联数据集 · 批量创建任务
              </h5>
            </div>
            <div className="card-body">
              <p className="small text-muted mb-3" data-en="Each image becomes one task." data-zh="对所选数据集中每张图片各创建一条任务（已存在的组合会跳过）。">
                对所选数据集中每张图片各创建一条任务（已存在的组合会跳过）。
              </p>
              <form method="post" action={urls.tasks || ''} className="mb-0">
                <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
                <div className="form-row">
                  <div className="col-md-4 mb-2">
                    <label className="small" data-en="Project" data-zh="项目">项目</label>
                    <select
                      name="project"
                      className="form-control"
                      value={batchProjectId}
                      onChange={(e) => setBatchProjectId(e.target.value)}
                    >
                      {projects.length ? (
                        projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))
                      ) : (
                        <option value="">{getLangText('暂无项目', 'No projects')}</option>
                      )}
                    </select>
                  </div>
                  <div className="col-md-4 mb-2">
                    <label className="small" data-en="Dataset" data-zh="数据集">数据集</label>
                    <select name="dataset" className="form-control" key={batchProjectId} disabled={!filteredDatasets.length}>
                      {filteredDatasets.length > 0 ? (
                        filteredDatasets.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                            {d.linked_project_names ? ` (${d.linked_project_names})` : ''}
                          </option>
                        ))
                      ) : (
                        <option value="">{projects.length ? getLangText('无可用数据集', 'No dataset') : '—'}</option>
                      )}
                    </select>
                  </div>
                  <div className="col-md-4 mb-2 d-flex align-items-end">
                    <button className="btn btn-primary" type="submit" disabled={!filteredDatasets.length} data-en="Batch create tasks" data-zh="批量创建任务">
                      批量创建任务
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* ③ 任务表下拉 + 表内任务（TASK_LIST_PAGE_SIZE 条/页） */}
          <div className="card mb-4">
            <div className="card-header">
              <h5 className="mb-1" data-en="Task tables & tasks" data-zh="任务表与任务列表">
                任务表与任务列表
              </h5>
              <p
                className="card-category mb-0 small"
                data-en="Pick a task table (project + dataset), then manage tasks below—similar to a resource picker in admin consoles."
                data-zh="通过上方「任务表」选择器指定项目与数据集对应的任务表（与常见后台「选资源再操作」一致），下列出该表中的任务。"
              >
                通过「任务表」选择器指定项目与数据集（与常见后台先选资源再操作一致），下列出该表中的任务。
              </p>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-lg-4 mb-3 mb-lg-0">
                  <h6 className="text-muted small font-weight-bold text-uppercase mb-2" data-en="Task table" data-zh="任务表">
                    任务表
                  </h6>
                  <div className="laps-task-picker">
                    <select
                      className="form-control mb-0"
                      aria-label={getLangText('选择任务表', 'Select task table')}
                      value={selectedGroupKey}
                      onChange={(e) => setSelectedGroupKey(e.target.value)}
                      disabled={!taskGroups.length}
                    >
                      {taskGroups.length === 0 ? (
                        <option value="">{getLangText('暂无任务表', 'No task tables')}</option>
                      ) : (
                        <>
                          <option value="">{getLangText('请选择…', 'Choose a table…')}</option>
                          {taskGroups.map((g) => (
                            <option key={g.key} value={g.key}>
                              {g.project_name} / {g.dataset_name} ({g.task_count})
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                    {selectedGroup ? (
                      <div className="laps-task-picker-meta">
                        <span className="laps-task-picker-badge">
                          {getLangText('总计', 'Total')} {selectedGroup.task_count}
                        </span>
                        <span className="laps-task-picker-badge laps-task-picker-badge--muted">
                          {getLangText('未完成', 'Open')} {selectedGroup.pending_count}
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger ml-auto"
                          disabled={selectedGroup.dataset_id == null}
                          title={
                            selectedGroup.dataset_id == null
                              ? getLangText('无数据集 id，不可整表删除', 'No dataset id')
                              : getLangText('删除该表下全部任务', 'Delete all tasks in this table')
                          }
                          onClick={() => deleteTaskGroup(selectedGroup)}
                        >
                          {getLangText('清空该表', 'Clear table')}
                        </button>
                      </div>
                    ) : taskGroups.length > 0 ? (
                      <p className="small text-muted mb-0 mt-2">{getLangText('请选择任务表以查看任务。', 'Pick a task table to list tasks.')}</p>
                    ) : (
                      <p className="small text-muted mb-0 mt-2">
                        {getLangText('尚无任务表（可先批量创建或使用样例）。', 'No tables yet. Batch-create or use the sample.')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="col-lg-8">
                  <div className="d-flex flex-wrap justify-content-between align-items-center mb-2">
                    <div>
                      <h6 className="text-muted small font-weight-bold text-uppercase mb-1" data-en="Tasks in table" data-zh="表内任务">
                        表内任务
                      </h6>
                      {selectedGroup ? (
                        <div className="small text-muted">
                          <strong>{selectedGroup.project_name}</strong>
                          {' · '}
                          <strong>{selectedGroup.dataset_name}</strong>
                          <span className="ml-2">
                            ({filteredTasks.length} {getLangText('条', 'tasks')})
                          </span>
                        </div>
                      ) : (
                        <p className="small text-muted mb-0">{getLangText('请先选择任务表', 'Select a task table first.')}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary"
                      disabled={!projects.length || !selectedGroup}
                      onClick={() => {
                        const pid = selectedGroup ? String(selectedGroup.project_id) : String(projects[0]?.id ?? '')
                        setAddProjectId(pid)
                        setAddModalOpen(true)
                      }}
                      data-en="New task"
                      data-zh="新建任务"
                    >
                      {getLangText('新建任务', 'New task')}
                    </button>
                  </div>
                  <div className="table-responsive">
                    <table className="table table-sm table-bordered table-hover mb-0 laps-task-data-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th data-en="Preview" data-zh="预览">预览</th>
                          <th data-en="Image" data-zh="图片">图片</th>
                          <th data-en="Status" data-zh="状态">状态</th>
                          <th data-en="Created" data-zh="创建时间">创建时间</th>
                          <th data-en="Actions" data-zh="操作">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!selectedGroupKey ? (
                          <tr>
                            <td colSpan={6} className="text-muted small">
                              {getLangText('请在上方选择任务表', 'Pick a task table above.')}
                            </td>
                          </tr>
                        ) : filteredTasks.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-muted small">
                              {getLangText('该表下暂无任务', 'No tasks in this table.')}
                            </td>
                          </tr>
                        ) : (
                          pagedTasks.map((t) => (
                            <tr key={t.id}>
                              <td>{t.id}</td>
                              <td className="laps-task-col-preview">
                                {t.image_url ? (
                                  <a
                                    href={t.image_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="laps-task-thumb-link"
                                  >
                                    <img src={t.image_url} alt="" className="tasks-thumb" />
                                  </a>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="small">
                                <span className="text-muted">{t.image_name || t.image_id}</span>
                              </td>
                              <td className="laps-task-col-status">
                                <select
                                  className="form-control form-control-sm laps-task-status-select"
                                  value={t.status}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    patchTaskStatus(t.id, v)
                                      .then(() => {
                                        setTaskRows((rows) => rows.map((r) => (r.id === t.id ? { ...r, status: v } : r)))
                                      })
                                      .catch(() => refreshTasks())
                                  }}
                                >
                                  {TASK_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {statusLabel(s)}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="small text-nowrap">{t.created_at ? t.created_at.replace('T', ' ').slice(0, 19) : '—'}</td>
                              <td>
                                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => deleteTask(t.id)}>
                                  {getLangText('删除', 'Delete')}
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {selectedGroupKey && filteredTasks.length > TASK_LIST_PAGE_SIZE ? (
                    <div className="laps-task-pagination d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2">
                      <span className="small text-muted mb-0">
                        {getLangText(
                          `第 ${taskListPage} / ${taskListTotalPages} 页，共 ${filteredTasks.length} 条`,
                          `Page ${taskListPage} / ${taskListTotalPages}, ${filteredTasks.length} total`,
                        )}
                      </span>
                      <div className="btn-group btn-group-sm" role="group" aria-label="pagination">
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          disabled={taskListPage <= 1}
                          onClick={() => setTaskListPage((p) => Math.max(1, p - 1))}
                        >
                          {getLangText('上一页', 'Previous')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          disabled={taskListPage >= taskListTotalPages}
                          onClick={() => setTaskListPage((p) => Math.min(taskListTotalPages, p + 1))}
                        >
                          {getLangText('下一页', 'Next')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 单图新建任务：annotate_available_images + annotate_task_create */}
      {addModalOpen ? (
        <div className="modal show d-block" tabIndex={-1} role="dialog" style={{ background: 'rgba(0,0,0,0.35)' }}>
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{getLangText('新建任务', 'New task')}</h5>
                <button type="button" className="close" aria-label="Close" onClick={() => setAddModalOpen(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <p className="small text-muted">{getLangText('选择项目后，从尚未在该项目下建任务的图片中点选一张。', 'Pick a project, then choose an image without a task yet.')}</p>
                <div className="form-group">
                  <label className="small">{getLangText('项目', 'Project')}</label>
                  <select className="form-control" value={addProjectId} onChange={(e) => setAddProjectId(e.target.value)}>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                {addLoading ? (
                  <p className="small text-muted">…</p>
                ) : addImages.length === 0 ? (
                  <p className="small text-warning">{getLangText('没有可添加的图片（或已全部建任务）。', 'No available images.')}</p>
                ) : (
                  <div
                    className="d-flex flex-wrap"
                    style={{ gap: '8px' }}
                  >
                    {addImages.map((im) => (
                      <button
                        key={im.id}
                        type="button"
                        className="btn btn-light border p-2 text-left"
                        style={{ width: 140 }}
                        onClick={() => createTaskFromImage(im.id)}
                      >
                        {im.image_url ? (
                          <img src={im.image_url} alt="" style={{ width: '100%', height: 72, objectFit: 'cover' }} />
                        ) : null}
                        <div className="small mt-1">{im.dataset_name}</div>
                        <div className="small text-muted">#{im.id}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAddModalOpen(false)}>
                  {getLangText('关闭', 'Close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default TasksApp
