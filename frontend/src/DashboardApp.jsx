import React, { useId, useMemo } from 'react'

/** 极坐标扇形路径（饼图 / 环图） */
function arcPath(cx, cy, rInner, rOuter, a0, a1) {
  const x0o = cx + rOuter * Math.cos(a0)
  const y0o = cy + rOuter * Math.sin(a0)
  const x1o = cx + rOuter * Math.cos(a1)
  const y1o = cy + rOuter * Math.sin(a1)
  const x0i = cx + rInner * Math.cos(a1)
  const y0i = cy + rInner * Math.sin(a1)
  const x1i = cx + rInner * Math.cos(a0)
  const y1i = cy + rInner * Math.sin(a0)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return [
    `M ${x0o} ${y0o}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o} ${y1o}`,
    `L ${x0i} ${y0i}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x1i} ${y1i}`,
    'Z',
  ].join(' ')
}

function TaskStatusDonut({ data, total }) {
  const shadowId = `laps-donut-${useId().replace(/:/g, '')}`
  const segments = useMemo(() => {
    if (!total || !data?.length) return []
    let angle = -Math.PI / 2
    return data
      .filter((d) => d.value > 0)
      .map((d) => {
        const sweep = (d.value / total) * Math.PI * 2
        const start = angle
        angle += sweep
        return { ...d, start, end: angle }
      })
  }, [data, total])

  const cx = 84
  const cy = 84
  const rOuter = 74
  const rInner = 48

  if (!total) {
    return (
      <div className="dashboard-chart-empty" data-en="No task data yet" data-zh="暂无任务数据">
        暂无任务数据
      </div>
    )
  }

  return (
    <svg className="dashboard-donut-svg" viewBox="0 0 168 168" aria-hidden>
      <defs>
        <filter id={shadowId} x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.8" floodColor="#000" floodOpacity="0.22" />
        </filter>
      </defs>
      <g filter={`url(#${shadowId})`}>
        {segments.map((s) => (
          <path
            key={s.key}
            d={arcPath(cx, cy, rInner, rOuter, s.start, s.end)}
            fill={s.fill}
            className="dashboard-donut-segment"
          />
        ))}
      </g>
      <text x={cx} y={cy - 5} textAnchor="middle" className="dashboard-donut-total">
        {total}
      </text>
      <text x={cx} y={cy + 11} textAnchor="middle" className="dashboard-donut-sub">
        tasks
      </text>
    </svg>
  )
}

function ResourceBars({ rows, maxVal }) {
  const max = maxVal > 0 ? maxVal : 1
  return (
    <ul className="dashboard-resource-bars">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="dashboard-resource-bar-head">
            <span data-en={row.name} data-zh={row.nameZh}>
              {row.nameZh}
            </span>
            <span className="dashboard-resource-bar-val">{row.value}</span>
          </div>
          <div className="dashboard-resource-bar-track">
            <div
              className="dashboard-resource-bar-fill"
              style={{ width: `${Math.min(100, (row.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function RecentTasksCards({ tasks, urls }) {
  if (!tasks?.length) {
    return (
      <p
        className="dashboard-recent-empty mb-0"
        data-en="No tasks yet. Create a project and dataset, then add tasks."
        data-zh="暂无任务。请先创建项目与数据集，再创建任务。"
      >
        暂无任务。请先创建项目与数据集，再创建任务。
      </p>
    )
  }

  return (
    <div className="dashboard-recent-cards dashboard-recent-cards--compact">
      {tasks.map((task) => (
        <div key={task.id} className="dashboard-recent-card">
          <div className="dashboard-recent-card-main">
            <div className="dashboard-recent-card-project" title={task.project_name}>
              {task.project_name}
            </div>
            <div className="dashboard-recent-card-image text-truncate" title={task.image_name}>
              {task.image_short || '—'}
            </div>
          </div>
          <div className="dashboard-recent-card-actions">
            <span className={`badge badge-${task.badge}`}>{task.status_display}</span>
            <a
              className="btn btn-sm btn-outline-primary"
              href={`${urls.annotation || '#'}?task_id=${task.id}`}
              data-en="Annotate"
              data-zh="标注"
            >
              标注
            </a>
          </div>
        </div>
      ))}
    </div>
  )
}

function DashboardApp(props) {
  const {
    projectsCount = 0,
    datasetsCount = 0,
    tasksCount = 0,
    pendingTasks = 0,
    completedTasks = 0,
    username = '',
    isAuthenticated = false,
    urls = {},
    taskStatusChart = [],
    resourceChart = [],
    recentTasks = [],
  } = props

  const taskTotal = taskStatusChart.reduce((s, d) => s + (d.value || 0), 0)
  const resourceMax = Math.max(projectsCount, datasetsCount, tasksCount, 1)

  return (
    <div className="content">
      <div className="row">
        <div className="col-md-12">
          <div className="card dashboard-root-card">
            <div className="card-header dashboard-root-card-header">
              <h4 className="card-title" data-en="Data Management Dashboard" data-zh="数据管理仪表盘">
                数据管理仪表盘
              </h4>
              <p
                className="card-category dashboard-root-card-category"
                data-en="Quick overview of projects, datasets and tasks"
                data-zh="项目、数据集与任务的快速概览"
              >
                项目、数据集与任务的快速概览
              </p>
              {isAuthenticated && (
                <p className="dashboard-root-welcome mb-0 text-muted">
                  <span data-en="Welcome back" data-zh="欢迎回来">
                    欢迎回来
                  </span>
                  ，{username}。
                </p>
              )}
            </div>
            <div className="card-body dashboard-root-card-body">
              {!projectsCount && !datasetsCount && !tasksCount && (
                <div className="dashboard-quick-start" role="region" aria-label="快速开始">
                  <h6 className="dashboard-quick-start-heading" data-en="Get started" data-zh="快速开始">
                    快速开始
                  </h6>
                  <p
                    data-en="Create your first project, add a dataset with images, then create tasks and open the annotation workspace."
                    data-zh="创建第一个项目 → 添加数据集并上传图片 → 创建任务 → 打开标注工作区开始标注。"
                  >
                    创建第一个项目 → 添加数据集并上传图片 → 创建任务 → 打开标注工作区开始标注。
                  </p>
                  <hr />
                  <a
                    className="btn btn-primary btn-sm"
                    href={urls.projects || '#'}
                    data-en="Create Project"
                    data-zh="创建项目"
                  >
                    创建项目
                  </a>
                </div>
              )}

              <div className="kpi dashboard-kpi-row">
                <div className="card">
                  <div className="card-body">
                    <h5 data-en="Projects" data-zh="项目">
                      项目
                    </h5>
                    <h2>{projectsCount}</h2>
                    <p>
                      <a
                        href={urls.projects || '#'}
                        className="link-accent"
                        data-en="Manage projects"
                        data-zh="管理项目"
                      >
                        管理项目
                      </a>
                    </p>
                  </div>
                </div>
                <div className="card">
                  <div className="card-body">
                    <h5 data-en="Datasets" data-zh="数据集">
                      数据集
                    </h5>
                    <h2>{datasetsCount}</h2>
                    <p>
                      <a
                        href={urls.datasets || '#'}
                        className="link-accent"
                        data-en="Manage datasets"
                        data-zh="管理数据集"
                      >
                        管理数据集
                      </a>
                    </p>
                  </div>
                </div>
                <div className="card">
                  <div className="card-body">
                    <h5 data-en="Tasks" data-zh="任务">
                      任务
                    </h5>
                    <h2>{tasksCount}</h2>
                    <p>
                      <span data-en="Pending annotation" data-zh="待标注">
                        待标注
                      </span>
                      : {pendingTasks} ·{' '}
                      <span data-en="Done" data-zh="已完成">
                        已完成
                      </span>
                      : {completedTasks} —{' '}
                      <a
                        href={urls.tasks || '#'}
                        className="link-accent"
                        data-en="View tasks"
                        data-zh="查看任务"
                      >
                        查看任务
                      </a>
                    </p>
                  </div>
                </div>
              </div>

              <div className="dashboard-charts-row">
                <div className="card dashboard-chart-card">
                  <div className="card-header dashboard-chart-card-header">
                    <h6 data-en="Task status" data-zh="任务状态分布">
                      任务状态分布
                    </h6>
                    <span
                      className="dashboard-chart-hint"
                      data-en="Pending vs done"
                      data-zh="待标注与已完成"
                    >
                      待标注与已完成
                    </span>
                  </div>
                  <div className="card-body dashboard-chart-body dashboard-chart-body--donut">
                    <TaskStatusDonut data={taskStatusChart} total={taskTotal} />
                    <ul className="dashboard-donut-legend">
                      {taskStatusChart.map((s) => (
                        <li key={s.key}>
                          <span className="dashboard-legend-swatch" style={{ background: s.fill }} />
                          <span data-en={s.name} data-zh={s.nameZh}>
                            {s.nameZh}
                          </span>
                          <span className="dashboard-legend-val">{s.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="card dashboard-chart-card">
                  <div className="card-header dashboard-chart-card-header">
                    <h6 data-en="Resource overview" data-zh="资源结构">
                      资源结构
                    </h6>
                    <span
                      className="dashboard-chart-hint"
                      data-en="Projects · Datasets · Tasks"
                      data-zh="项目 · 数据集 · 任务"
                    >
                      项目 · 数据集 · 任务
                    </span>
                  </div>
                  <div className="card-body dashboard-chart-body">
                    <ResourceBars rows={resourceChart} maxVal={resourceMax} />
                  </div>
                </div>

                <div className="card dashboard-chart-card dashboard-recent-panel">
                  <div className="card-header dashboard-chart-card-header">
                    <h6 data-en="Recent tasks" data-zh="最近任务">
                      最近任务
                    </h6>
                    <a
                      href={urls.tasks || '#'}
                      className="dashboard-recent-all-link"
                      data-en="View all"
                      data-zh="全部"
                    >
                      全部
                    </a>
                  </div>
                  <div className="card-body dashboard-chart-body dashboard-recent-panel-body">
                    <RecentTasksCards tasks={recentTasks} urls={urls} />
                  </div>
                </div>
              </div>

              <div className="dashboard-actions dashboard-actions--compact">
                <a
                  className="btn btn-sm btn-primary"
                  href={urls.projects || '#'}
                  data-en="Create Project"
                  data-zh="创建项目"
                >
                  创建项目
                </a>
                <a
                  className="btn btn-sm btn-secondary"
                  href={urls.datasets || '#'}
                  data-en="Upload Dataset"
                  data-zh="上传数据集"
                >
                  上传数据集
                </a>
                <a
                  className="btn btn-sm btn-success"
                  href={urls.annotation || '#'}
                  data-en="Open Annotate"
                  data-zh="打开标注"
                >
                  打开标注
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardApp
