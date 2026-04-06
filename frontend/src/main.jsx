/**
 * 多页入口：仅当对应 root-* 存在时才动态 import 该页 React 包，减少首包体积与解析时间。
 * 各页 props 来自 Django 模板内嵌 JSON（data-*-props）；解析失败时打日志并回退默认值。
 */
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

function mountLogin() {
  const el = document.getElementById('root-login')
  if (!el) return Promise.resolve()
  return import('./LoginApp.jsx')
    .then(({ default: LoginApp }) => {
      createRoot(el).render(
        <StrictMode>
          <LoginApp />
        </StrictMode>,
      )
    })
    .catch((err) => {
      console.error('[LAPS] LoginApp', err)
    })
}

function mountSignup() {
  const el = document.getElementById('root-signup')
  if (!el) return Promise.resolve()
  return import('./SignupApp.jsx')
    .then(({ default: SignupApp }) => {
      createRoot(el).render(
        <StrictMode>
          <SignupApp />
        </StrictMode>,
      )
    })
    .catch((err) => {
      console.error('[LAPS] SignupApp', err)
    })
}

function mountDashboard() {
  const el = document.getElementById('root-dashboard')
  if (!el) return Promise.resolve()
  const dataAttr = el.getAttribute('data-dashboard')
  let parsed = {}
  if (dataAttr) {
    try {
      parsed = JSON.parse(dataAttr)
    } catch (e) {
      // ignore parse error
    }
  }
  return import('./DashboardApp.jsx')
    .then(({ default: DashboardApp }) => {
      createRoot(el).render(
        <StrictMode>
          <DashboardApp {...parsed} />
        </StrictMode>,
      )
    })
    .catch((err) => {
      console.error('[LAPS] DashboardApp', err)
    })
}

function mountProjects() {
  const el = document.getElementById('root-projects')
  if (!el) return Promise.resolve()
  const dataAttr = el.getAttribute('data-projects-props')
  let parsed = {}
  if (dataAttr) {
    try {
      parsed = JSON.parse(dataAttr)
    } catch (e) {
      // ignore
    }
  }
  return import('./ProjectsApp.jsx')
    .then(({ default: ProjectsApp }) => {
      createRoot(el).render(
        <StrictMode>
          <ProjectsApp {...parsed} />
        </StrictMode>,
      )
    })
    .catch((err) => {
      console.error('[LAPS] ProjectsApp', err)
    })
}

function mountDatasets() {
  const el = document.getElementById('root-datasets')
  if (!el) return Promise.resolve()
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
  return import('./DatasetsApp.jsx')
    .then(({ default: DatasetsApp }) => {
      createRoot(el).render(
        <StrictMode>
          <DatasetsApp {...parsed} />
        </StrictMode>,
      )
    })
    .catch((err) => {
      console.error('[LAPS] DatasetsApp', err)
    })
}

function mountDatasetDetail() {
  const el = document.getElementById('root-dataset-detail')
  if (!el) return Promise.resolve()
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
  return import('./DatasetDetailApp.jsx')
    .then(({ default: DatasetDetailApp }) => {
      createRoot(el).render(
        <StrictMode>
          <DatasetDetailApp {...parsed} />
        </StrictMode>,
      )
    })
    .catch((err) => {
      console.error('[LAPS] DatasetDetailApp', err)
    })
}

function mountTasks() {
  const el = document.getElementById('root-tasks')
  if (!el) return Promise.resolve()
  const dataAttr = el.getAttribute('data-tasks-props')
  const defaults = { projects: [], datasets: [], tasks: [], urls: {} }
  let parsed = { ...defaults }
  if (dataAttr) {
    try {
      parsed = { ...defaults, ...JSON.parse(dataAttr) }
    } catch (e) {
      console.warn('[LAPS] data-tasks-props JSON parse failed', e)
    }
  }
  return import('./TasksApp.jsx')
    .then(({ default: TasksApp }) => {
      createRoot(el).render(
        <StrictMode>
          <TasksApp {...parsed} />
        </StrictMode>,
      )
    })
    .catch((err) => {
      console.error('[LAPS] TasksApp', err)
    })
}

function applyLangToPage() {
  if (window.langSwitcher) {
    window.langSwitcher.applyLang(window.langSwitcher.getStoredLang())
  }
}

const mountFns = [
  mountLogin,
  mountSignup,
  mountDashboard,
  mountProjects,
  mountDatasets,
  mountDatasetDetail,
  mountTasks,
]

Promise.all(mountFns.map((fn) => fn())).then(() => {
  if (
    document.getElementById('root-dashboard') ||
    document.getElementById('root-projects') ||
    document.getElementById('root-datasets') ||
    document.getElementById('root-dataset-detail') ||
    document.getElementById('root-tasks')
  ) {
    requestAnimationFrame(() => {
      applyLangToPage()
      lapsScrollPageToTop()
    })
    document.addEventListener('languageChanged', applyLangToPage)
  }
})
