import React from 'react'

function DashboardApp(props) {
  const {
    projectsCount = 0,
    datasetsCount = 0,
    tasksCount = 0,
    pendingTasks = 0,
    completedTasks = 0,
    recentTasks = [],
    username = '',
    isAuthenticated = false,
    urls = {},
  } = props

  return (
    <div className="content">
      <div className="row">
        <div className="col-md-12">
          <div className="card">
            <div className="card-header">
              <h4 className="card-title" data-en="Data Management Dashboard" data-zh="数据管理仪表盘">
                数据管理仪表盘
              </h4>
              <p
                className="card-category"
                data-en="Quick overview of projects, datasets and tasks"
                data-zh="项目、数据集与任务的快速概览"
              >
                项目、数据集与任务的快速概览
              </p>
              {isAuthenticated && (
                <p className="mb-0 mt-1 text-muted" style={{ fontSize: '0.9rem' }}>
                  <span data-en="Welcome back" data-zh="欢迎回来">
                    欢迎回来
                  </span>
                  ，{username}。
                </p>
              )}
            </div>
            <div className="card-body">
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

              <div className="kpi">
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
                      <span data-en="Pending" data-zh="待办">
                        待办
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

              <div className="dashboard-actions">
                <a
                  className="btn btn-primary"
                  href={urls.projects || '#'}
                  data-en="Create Project"
                  data-zh="创建项目"
                >
                  创建项目
                </a>
                <a
                  className="btn btn-secondary"
                  href={urls.datasets || '#'}
                  data-en="Upload Dataset"
                  data-zh="上传数据集"
                >
                  上传数据集
                </a>
                <a
                  className="btn btn-success"
                  href={urls.annotation || '#'}
                  data-en="Open Annotate"
                  data-zh="打开标注"
                >
                  打开标注
                </a>
              </div>

              <hr />
              <h5 data-en="Recent tasks" data-zh="最近任务">
                最近任务
              </h5>
              <div>
                {recentTasks && recentTasks.length > 0 ? (
                  <>
                    <ul className="list-group list-group-flush">
                      {recentTasks.map((task) => (
                        <li
                          key={task.id}
                          className="list-group-item d-flex justify-content-between align-items-center px-0"
                          style={{
                            background: 'transparent',
                            borderColor: 'rgba(255,255,255,0.06)',
                          }}
                        >
                          <span
                            className="text-truncate"
                            style={{ maxWidth: '60%' }}
                            title={task.image_name}
                          >
                            {task.project_name} / {task.image_short}
                          </span>
                          <span className="dashboard-task-actions">
                            <span className={`badge badge-${task.badge}`}>
                              {task.status_display}
                            </span>
                            <a
                              className="btn btn-sm btn-outline-primary"
                              href={`${urls.annotation || '#'}?task_id=${task.id}`}
                              data-en="Annotate"
                              data-zh="标注"
                            >
                              标注
                            </a>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 mb-0">
                      <a href={urls.tasks || '#'} data-en="View all tasks" data-zh="查看全部任务">
                        查看全部任务
                      </a>
                    </p>
                  </>
                ) : (
                  <p
                    className="text-muted mb-0"
                    data-en="No tasks yet. Create a project and dataset, then add tasks."
                    data-zh="暂无任务。请先创建项目与数据集，再创建任务。"
                  >
                    暂无任务。请先创建项目与数据集，再创建任务。
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardApp

