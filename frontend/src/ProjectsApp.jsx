import React, { useState } from 'react'

function getCsrfFromCookie() {
  if (typeof document === 'undefined') return ''
  const m = document.cookie.match(/csrftoken=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

function ProjectsApp({
  projects = [],
  datasets_for_project = [],
  annotation_type_choices = [],
  urls = {},
}) {
  const csrfToken = getCsrfFromCookie()
  const [editingId, setEditingId] = useState(null)

  const typeLabel = (value) => {
    const c = annotation_type_choices.find((x) => x.value === value)
    return c ? c.label : value
  }

  return (
    <div className="content">
      <div className="row">
        <div className="col-md-12">
          <div className="card">
            <div className="card-header">
              <h4 className="card-title" data-en="Projects" data-zh="项目">项目</h4>
              <p
                className="card-category"
                data-en="Create a project with an annotation task type and optional linked datasets (upload datasets freely on the Datasets page first)."
                data-zh="创建项目时选择标注任务类型，并可勾选关联已有数据集（请先在「数据集」页自由上传与管理）。"
              >
                创建项目时选择标注任务类型，并可勾选关联已有数据集（请先在「数据集」页自由上传与管理）。
              </p>
            </div>
            <div className="card-body">
              <p data-en="New project" data-zh="新建项目">新建项目</p>
              <form method="post" action={urls.projects || ''}>
                <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
                <input type="hidden" name="intent" value="create" />
                <div className="form-row align-items-end">
                  <div className="col-md-3 mb-2">
                    <label className="small mb-0" data-en="Name" data-zh="名称">名称</label>
                    <input
                      className="form-control"
                      name="name"
                      placeholder="项目名称"
                      data-en="Project name"
                      data-zh="项目名称"
                    />
                  </div>
                  <div className="col-md-3 mb-2">
                    <label className="small mb-0" data-en="Description" data-zh="描述">描述</label>
                    <input
                      className="form-control"
                      name="description"
                      placeholder="简短描述"
                      data-en="Short description"
                      data-zh="简短描述"
                    />
                  </div>
                  <div className="col-md-3 mb-2">
                    <label className="small mb-0" data-en="Task type" data-zh="标注任务类型">标注任务类型</label>
                    <select className="form-control" name="annotation_type" defaultValue="segmentation_sam">
                      {annotation_type_choices.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-3 mb-2">
                    <button className="btn btn-primary btn-block" type="submit" data-en="Create" data-zh="创建">
                      创建
                    </button>
                  </div>
                </div>
                {datasets_for_project.length > 0 ? (
                  <div className="form-group mb-0 mt-2">
                    <label className="small" data-en="Link datasets (optional)" data-zh="关联数据集（可选）">
                      关联数据集（可选）
                    </label>
                    <div className="border rounded p-2 laps-linked-datasets-box" style={{ maxHeight: 160, overflowY: 'auto' }}>
                      {datasets_for_project.map((d) => (
                        <label key={d.id} className="d-block mb-1" htmlFor={`ds-new-${d.id}`}>
                          <input type="checkbox" id={`ds-new-${d.id}`} name="datasets" value={d.id} className="mr-1" />
                          {d.name}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="small text-muted mt-2 mb-0" data-en="No datasets yet — create some on the Datasets page." data-zh="暂无数据集，请先在「数据集」页创建。">
                    暂无数据集，请先在「数据集」页创建。
                  </p>
                )}
              </form>
              <hr />
              <p>
                <a href={urls.annotation || '#'} className="btn btn-primary" data-en="Open Annotation Workspace" data-zh="打开标注工作区">
                  打开标注工作区
                </a>
              </p>
              <h5 className="mt-3" data-en="Your projects" data-zh="项目列表">项目列表</h5>
              {projects.length > 0 ? (
                <ul className="list-unstyled">
                  {projects.map((p) => (
                    <li key={p.id} className="border-bottom border-secondary pb-3 mb-3">
                      {editingId === p.id ? (
                        <form method="post" action={urls.projects || ''} className="mt-1">
                          <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
                          <input type="hidden" name="intent" value="update" />
                          <input type="hidden" name="project_id" value={p.id} />
                          <div className="form-row">
                            <div className="col-md-3">
                              <input className="form-control" name="name" defaultValue={p.name} data-en="Name" data-zh="名称" />
                            </div>
                            <div className="col-md-4">
                              <input
                                className="form-control"
                                name="description"
                                defaultValue={p.description || ''}
                                data-en="Description"
                                data-zh="描述"
                              />
                            </div>
                            <div className="col-md-3">
                              <select className="form-control" name="annotation_type" defaultValue={p.annotation_type || 'segmentation_sam'}>
                                {annotation_type_choices.map((c) => (
                                  <option key={c.value} value={c.value}>
                                    {c.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="col-md-2">
                              <button className="btn btn-primary btn-sm mr-1" type="submit" data-en="Save" data-zh="保存">
                                保存
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setEditingId(null)}
                                data-en="Cancel"
                                data-zh="取消"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                          {datasets_for_project.length > 0 ? (
                            <div className="form-group mb-0 mt-2">
                              <label className="small" data-en="Linked datasets" data-zh="已关联数据集">
                                已关联数据集
                              </label>
                              <div className="border rounded p-2 laps-linked-datasets-box" style={{ maxHeight: 140, overflowY: 'auto' }}>
                                {datasets_for_project.map((d) => (
                                  <label key={d.id} className="d-block mb-1" htmlFor={`ds-edit-${p.id}-${d.id}`}>
                                    <input
                                      type="checkbox"
                                      id={`ds-edit-${p.id}-${d.id}`}
                                      name="datasets"
                                      value={d.id}
                                      className="mr-1"
                                      defaultChecked={(p.linked_dataset_ids || []).includes(d.id)}
                                    />
                                    {d.name}
                                  </label>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </form>
                      ) : (
                        <div className="d-flex flex-wrap align-items-center justify-content-between">
                          <div>
                            <strong>{p.name}</strong>
                            <span className="badge badge-secondary ml-2">{typeLabel(p.annotation_type)}</span>
                            <span className="text-muted small ml-2">{p.created_at}</span>
                            {p.owner ? <span className="text-muted small ml-1">({p.owner})</span> : null}
                            {p.description ? <div className="small text-muted mt-1">{p.description}</div> : null}
                          </div>
                          <div>
                            <button
                              type="button"
                              className="btn btn-outline-primary btn-sm mr-1"
                              onClick={() => setEditingId(p.id)}
                              data-en="Edit"
                              data-zh="编辑"
                            >
                              编辑
                            </button>
                            <form
                              method="post"
                              action={urls.projects || ''}
                              className="d-inline"
                              onSubmit={(e) => !window.confirm('Delete this project? Tasks under it will be removed.') && e.preventDefault()}
                            >
                              <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
                              <input type="hidden" name="intent" value="delete" />
                              <input type="hidden" name="project_id" value={p.id} />
                              <button className="btn btn-outline-danger btn-sm" type="submit" data-en="Delete" data-zh="删除">
                                删除
                              </button>
                            </form>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted mb-0" data-en="No projects yet." data-zh="暂无项目。">
                  暂无项目。
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProjectsApp
