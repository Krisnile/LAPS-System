import React from 'react'

function getCsrfFromCookie() {
  if (typeof document === 'undefined') return ''
  const m = document.cookie.match(/csrftoken=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

function ProjectsApp({ projects = [], urls = {} }) {
  const csrfToken = getCsrfFromCookie()

  return (
    <div className="content">
      <div className="row">
        <div className="col-md-12">
          <div className="card">
            <div className="card-header">
              <h4 className="card-title">Projects</h4>
              <p className="card-category">
                Manage annotation projects, labeling config, and team assignments.
              </p>
            </div>
            <div className="card-body">
              <p>This page manages annotation projects. 创建新项目：</p>
              <form method="post" action={urls.projects || ''}>
                <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
                <div className="form-row">
                  <div className="col-md-6">
                    <input
                      className="form-control"
                      name="name"
                      placeholder="Project name"
                    />
                  </div>
                  <div className="col-md-4">
                    <input
                      className="form-control"
                      name="description"
                      placeholder="Short description"
                    />
                  </div>
                  <div className="col-md-2">
                    <button className="btn btn-primary" type="submit">
                      Create
                    </button>
                  </div>
                </div>
              </form>
              <hr />
              <p>
                <a href={urls.annotation || '#'} className="btn btn-primary">
                  Open Annotation Workspace
                </a>
              </p>
              <h5 className="mt-3">Existing Projects</h5>
              {projects.length > 0 ? (
                <ul>
                  {projects.map((p) => (
                    <li key={p.id}>
                      {p.name} - {p.created_at}
                      {p.owner ? ` (${p.owner})` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <ul>
                  <li>No projects yet.</li>
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProjectsApp

