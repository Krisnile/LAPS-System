import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

/** 避免 POST 重定向后浏览器恢复滚动位置，把视口停在页面底部「看不见内容」 */
function lapsScrollPageToTop() {
  if (typeof window === 'undefined') return
  window.scrollTo(0, 0)
  const se = document.scrollingElement
  if (se) se.scrollTop = 0
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
}
import LoginApp from './LoginApp.jsx'
import DashboardApp from './DashboardApp.jsx'
import ProjectsApp from './ProjectsApp.jsx'
import DatasetsApp from './DatasetsApp.jsx'
import DatasetDetailApp from './DatasetDetailApp.jsx'
import TasksApp from './TasksApp.jsx'
import SignupApp from './SignupApp.jsx'

function mountLogin() {
  const el = document.getElementById('root-login')
  if (!el) return
  createRoot(el).render(
    <StrictMode>
      <LoginApp />
    </StrictMode>,
  )
}

function mountSignup() {
  const el = document.getElementById('root-signup')
  if (!el) return
  createRoot(el).render(
    <StrictMode>
      <SignupApp />
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
  const defaults = { datasets: [], urls: { datasets: '' }, createdImages: [] }
  let parsed = { ...defaults }
  if (dataAttr) {
    try {
      parsed = { ...defaults, ...JSON.parse(dataAttr) }
    } catch (e) {
      console.warn('[LAPS] data-datasets-props JSON parse failed', e)
    }
  }
  createRoot(el).render(
    <StrictMode>
      <DatasetsApp {...parsed} />
    </StrictMode>,
  )
}

function mountDatasetDetail() {
  const el = document.getElementById('root-dataset-detail')
  if (!el) return
  const dataAttr = el.getAttribute('data-dataset-detail-props')
  const defaults = {
    image_preview_limit: 120,
    urls: { datasets: '', datasets_list: '' },
    dataset: { id: 0, name: '', description: '', created_at: '', image_count: 0, images: [] },
    createdImages: [],
  }
  let parsed = { ...defaults }
  if (dataAttr) {
    try {
      const raw = JSON.parse(dataAttr)
      parsed = {
        ...defaults,
        ...raw,
        urls: { ...defaults.urls, ...(raw.urls || {}) },
        dataset: { ...defaults.dataset, ...(raw.dataset || {}) },
        createdImages: raw.createdImages ?? defaults.createdImages,
      }
    } catch (e) {
      console.warn('[LAPS] data-dataset-detail-props JSON parse failed', e)
    }
  }
  createRoot(el).render(
    <StrictMode>
      <DatasetDetailApp {...parsed} />
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

function applyLangToPage() {
  if (window.langSwitcher) {
    window.langSwitcher.applyLang(window.langSwitcher.getStoredLang())
  }
}

mountLogin()
mountSignup()
mountDashboard()
mountProjects()
mountDatasets()
mountDatasetDetail()
mountTasks()

// 确保 React 渲染后应用语言（解决 pages 中英文切换无效）
if (document.getElementById('root-dashboard') || document.getElementById('root-projects') ||
    document.getElementById('root-datasets') || document.getElementById('root-dataset-detail') ||
    document.getElementById('root-tasks')) {
  requestAnimationFrame(() => {
    applyLangToPage()
    lapsScrollPageToTop()
  })
  document.addEventListener('languageChanged', applyLangToPage)
}
