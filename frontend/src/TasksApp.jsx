import React, { useMemo, useState } from 'react'

function getCsrfFromCookie() {
  if (typeof document === 'undefined') return ''
  const m = document.cookie.match(/csrftoken=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

function TaskTypeSample({ title, subtitle, active, variant }) {
  const isSeg = variant === 'seg'
  return (
    <div
      className={`laps-task-sample-card card h-100 ${active ? 'border-primary' : 'border-secondary opacity-75'}`}
      style={{ overflow: 'hidden' }}
    >
      <div
        className="laps-task-sample-visual"
        style={{
          height: 120,
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
      </div>
      <div className="card-body py-3">
        <h6 className="card-title mb-1">{title}</h6>
        <p className="card-text small text-muted mb-0">{subtitle}</p>
      </div>
    </div>
  )
}

function TasksApp({
  projects = [],
  datasets = [],
  datasets_for_project = [],
  annotation_type_choices = [],
  tasks = [],
  urls = {},
}) {
  const csrfToken = getCsrfFromCookie()
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [quickType, setQuickType] = useState('segmentation_sam')

  const selectedProject = useMemo(() => projects.find((p) => String(p.id) === String(projectId)), [projects, projectId])

  const filteredDatasets = useMemo(() => {
    if (!selectedProject) return datasets
    const linked = selectedProject.linked_dataset_ids || []
    if (!linked.length) return datasets
    const set = new Set(linked.map(Number))
    return datasets.filter((d) => set.has(d.id))
  }, [datasets, selectedProject])

  return (
    <div className="content">
      <div className="row">
        <div className="col-md-12">
          <div className="card mb-4">
            <div className="card-header">
              <h4 className="card-title" data-en="Tasks" data-zh="任务">任务</h4>
              <p
                className="card-category"
                data-en="Pick a task type (example below), quickly create a project, then batch-generate tasks from a dataset."
                data-zh="先选择标注任务类型（下方示意），可快速创建项目，再按数据集批量生成任务。"
              >
                先选择标注任务类型（下方示意），可快速创建项目，再按数据集批量生成任务。
              </p>
            </div>
            <div className="card-body">
              <h5 className="mb-3" data-en="Annotation task types" data-zh="标注任务类型">
                标注任务类型
              </h5>
              <div className="row">
                <div className="col-md-6 mb-3">
                  <TaskTypeSample
                    variant="seg"
                    active
                    title="图像分割（SAM）"
                    subtitle="像素级掩码，当前工作区使用 SAM 模型。"
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-primary mt-2"
                    onClick={() => setQuickType('segmentation_sam')}
                    data-en="Use this type — quick create project"
                    data-zh="用此类型 — 快速创建项目"
                  >
                    用此类型 — 快速创建项目
                  </button>
                </div>
                <div className="col-md-6 mb-3">
                  <TaskTypeSample
                    variant="det"
                    active={false}
                    title="目标检测（YOLO）"
                    subtitle="边界框标注；模型与工作流将后续接入。"
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary mt-2"
                    onClick={() => setQuickType('detection_yolo')}
                    data-en="Preview type — create project (experimental)"
                    data-zh="预览类型 — 创建项目（实验）"
                  >
                    预览类型 — 创建项目（实验）
                  </button>
                </div>
              </div>

              <hr />
              <h5 className="mb-2" data-en="Quick create project" data-zh="快速创建项目">
                快速创建项目
              </h5>
              <p className="small text-muted" data-en="Creates a project with the selected task type and optional dataset links." data-zh="将按所选任务类型创建项目，并可勾选关联数据集。">
                将按所选任务类型创建项目，并可勾选关联数据集。当前类型：
                <strong className="ml-1">
                  {annotation_type_choices.find((c) => c.value === quickType)?.label || quickType}
                </strong>
              </p>
              <form method="post" action={urls.projects || ''}>
                <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
                <input type="hidden" name="intent" value="create" />
                <input type="hidden" name="annotation_type" value={quickType} />
                <div className="form-row">
                  <div className="col-md-4 mb-2">
                    <input className="form-control" name="name" placeholder="项目名称" data-en="Project name" data-zh="项目名称" required />
                  </div>
                  <div className="col-md-5 mb-2">
                    <input className="form-control" name="description" placeholder="描述（可选）" data-en="Description" data-zh="描述" />
                  </div>
                  <div className="col-md-3 mb-2">
                    <button className="btn btn-primary btn-block" type="submit" data-en="Create project" data-zh="创建项目">
                      创建项目
                    </button>
                  </div>
                </div>
                {datasets_for_project.length > 0 ? (
                  <div className="form-group mb-0">
                    <label className="small" data-en="Link datasets" data-zh="关联数据集">
                      关联数据集
                    </label>
                    <div className="border rounded p-2" style={{ maxHeight: 140, overflowY: 'auto' }}>
                      {datasets_for_project.map((d) => (
                        <label key={d.id} className="d-block mb-1" htmlFor={`quick-ds-${d.id}`}>
                          <input type="checkbox" id={`quick-ds-${d.id}`} name="datasets" value={d.id} className="mr-1" />
                          {d.name}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="small text-muted mb-0" data-en="Create datasets first on the Datasets page." data-zh="请先在「数据集」页创建数据集。">
                    请先在「数据集」页创建数据集。
                  </p>
                )}
              </form>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h5 className="mb-0" data-en="Batch generate tasks" data-zh="批量生成任务">
                批量生成任务
              </h5>
            </div>
            <div className="card-body">
              <p
                className="small text-muted"
                data-en="Each image becomes one task. If the project has linked datasets, only those appear in the list."
                data-zh="数据集中每张图对应所选项目下的一条任务。若项目已关联数据集，下列仅显示已关联项。"
              >
                数据集中每张图对应所选项目下的一条任务。若项目已关联数据集，下列仅显示已关联项。
              </p>
              <form method="post" action={urls.tasks || ''}>
                <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
                <div className="form-row">
                  <div className="col-md-4">
                    <label data-en="Project" data-zh="项目">项目</label>
                    <select
                      name="project"
                      className="form-control"
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label data-en="Dataset" data-zh="数据集">数据集</label>
                    <select name="dataset" className="form-control" key={projectId}>
                      {filteredDatasets.length > 0 ? (
                        filteredDatasets.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                            {d.linked_project_names ? ` (${d.linked_project_names})` : ''}
                          </option>
                        ))
                      ) : (
                        <option value="">{projects.length ? '— 无可用数据集 —' : '—'}</option>
                      )}
                    </select>
                  </div>
                  <div className="col-md-4 align-self-end">
                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={!filteredDatasets.length}
                      data-en="Create Tasks"
                      data-zh="创建任务"
                    >
                      创建任务
                    </button>
                  </div>
                </div>
              </form>
              <hr />
              <p>
                <a href={urls.projects || '#'} className="btn btn-secondary" data-en="Projects" data-zh="项目">
                  项目
                </a>
              </p>
              <h5 className="mt-3" data-en="Recent Tasks" data-zh="最近任务">最近任务</h5>
              {tasks.length > 0 ? (
                <ul>
                  {tasks.map((t) => (
                    <li key={t.id}>
                      {t.project_name} - {t.image_url} - {t.status}
                    </li>
                  ))}
                </ul>
              ) : (
                <ul>
                  <li data-en="No tasks yet." data-zh="暂无任务。">暂无任务。</li>
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TasksApp
