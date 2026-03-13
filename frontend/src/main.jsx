import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import LoginApp from './LoginApp.jsx'
import DashboardApp from './DashboardApp.jsx'
import ProjectsApp from './ProjectsApp.jsx'
import DatasetsApp from './DatasetsApp.jsx'
import TasksApp from './TasksApp.jsx'

function mountLogin() {
  const el = document.getElementById('root-login')
  if (!el) return
  createRoot(el).render(
    <StrictMode>
      <LoginApp />
    </StrictMode>,
  )
}

function mountDashboard() {
  const el = document.getElementById('root-dashboard')
  if (!el) return
  const dataAttr = el.getAttribute('data-dashboard')
  let parsed = {}
  if (dataAttr) {
    try {
      parsed = JSON.parse(dataAttr)
    } catch (e) {
      // ignore parse error
    }
  }
  createRoot(el).render(
    <StrictMode>
      <DashboardApp {...parsed} />
    </StrictMode>,
  )
}

function mountProjects() {
  const el = document.getElementById('root-projects')
  if (!el) return
  const dataAttr = el.getAttribute('data-projects-props')
  let parsed = {}
  if (dataAttr) {
    try {
      parsed = JSON.parse(dataAttr)
    } catch (e) {
      // ignore
    }
  }
  createRoot(el).render(
    <StrictMode>
      <ProjectsApp {...parsed} />
    </StrictMode>,
  )
}

function mountDatasets() {
  const el = document.getElementById('root-datasets')
  if (!el) return
  const dataAttr = el.getAttribute('data-datasets-props')
  let parsed = {}
  if (dataAttr) {
    try {
      parsed = JSON.parse(dataAttr)
    } catch (e) {
      // ignore
    }
  }
  createRoot(el).render(
    <StrictMode>
      <DatasetsApp {...parsed} />
    </StrictMode>,
  )
}

function mountTasks() {
  const el = document.getElementById('root-tasks')
  if (!el) return
  const dataAttr = el.getAttribute('data-tasks-props')
  let parsed = {}
  if (dataAttr) {
    try {
      parsed = JSON.parse(dataAttr)
    } catch (e) {
      // ignore
    }
  }
  createRoot(el).render(
    <StrictMode>
      <TasksApp {...parsed} />
    </StrictMode>,
  )
}

mountLogin()
mountDashboard()
mountProjects()
mountDatasets()
mountTasks()
