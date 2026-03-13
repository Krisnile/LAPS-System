import React from 'react'

function getCsrfFromCookie() {
  if (typeof document === 'undefined') return ''
  const m = document.cookie.match(/csrftoken=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

function TasksApp({ projects = [], datasets = [], tasks = [], urls = {} }) {
  const csrfToken = getCsrfFromCookie()

  return (
    <div className="content">
      <div className="row">
        <div className="col-md-12">
          <div className="card">
            <div className="card-header">
              <h4 className="card-title">Tasks</h4>
              <p className="card-category">
                Create and assign annotation tasks to team members.
              </p>
            </div>
            <div className="card-body">
              <p>从 Dataset 为 Project 生成任务（每张图片一个任务）。</p>
              <form method="post" action={urls.tasks || ''}>
                <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
                <div className="form-row">
                  <div className="col-md-4">
                    <label>Project</label>
                    <select name="project" className="form-control">
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label>Dataset</label>
                    <select name="dataset" className="form-control">
                      {datasets.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-4 align-self-end">
                    <button className="btn btn-primary">Create Tasks</button>
                  </div>
                </div>
              </form>
              <hr />
              <p>
                <a href={urls.projects || '#'} className="btn btn-secondary">
                  Back to Projects
                </a>
              </p>
              <h5 className="mt-3">Recent Tasks</h5>
              {tasks.length > 0 ? (
                <ul>
                  {tasks.map((t) => (
                    <li key={t.id}>
                      Task {t.id} - {t.project_name} - {t.image_url} - {t.status}
                    </li>
                  ))}
                </ul>
              ) : (
                <ul>
                  <li>No tasks yet.</li>
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

