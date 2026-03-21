import React, { useRef } from 'react'

export function getCsrfFromCookie() {
  if (typeof document === 'undefined') return ''
  const m = document.cookie.match(/csrftoken=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

export const IMPORT_MODES = [
  { id: 'images', zh: '本地图片', en: 'Local images' },
  { id: 'zip', zh: 'ZIP 压缩包', en: 'ZIP archive' },
  { id: 'urls', zh: '图片 URL', en: 'Image URLs' },
]

export async function postDatasetForm(url, formData) {
  const r = await fetch(url, {
    method: 'POST',
    body: formData,
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  })
  let data = {}
  try {
    data = await r.json()
  } catch {
    /* non-JSON */
  }
  return { ok: r.ok, status: r.status, data }
}

export function ModeTabs({ value, onChange }) {
  return (
    <div className="btn-group btn-group-sm flex-wrap mb-2" role="group">
      {IMPORT_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`btn ${value === m.id ? 'btn-primary' : 'btn-outline-primary'}`}
          onClick={() => onChange(m.id)}
          data-en={m.en}
          data-zh={m.zh}
        >
          {m.zh}
        </button>
      ))}
    </div>
  )
}

export function filterImageFiles(fileList) {
  return Array.from(fileList || []).filter(
    (f) => f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(f.name),
  )
}

export function LocalImagePickZone({ onAddFiles, compact }) {
  const fileRef = useRef(null)
  const dirRef = useRef(null)
  const zoneClass = compact
    ? 'laps-file-pick-zone laps-file-pick-zone--compact mb-2'
    : 'laps-file-pick-zone laps-file-pick-zone--large mb-3'

  return (
    <div className={zoneClass}>
      <input
        ref={fileRef}
        type="file"
        className="laps-file-pick-input"
        accept="image/*"
        multiple
        onChange={(e) => {
          const list = filterImageFiles(e.target.files)
          if (list.length) onAddFiles(list)
          e.target.value = ''
        }}
      />
      <input
        ref={dirRef}
        type="file"
        className="laps-file-pick-input"
        multiple
        {...{ webkitdirectory: '', directory: '' }}
        onChange={(e) => {
          const list = filterImageFiles(e.target.files)
          if (list.length) onAddFiles(list)
          e.target.value = ''
        }}
      />
      <div className="laps-file-pick-zone-inner text-center py-4 px-3">
        <div className="laps-file-pick-icon mb-2" aria-hidden>
          📂
        </div>
        <p
          className="laps-file-pick-title mb-3"
          data-en="Choose images or an entire folder"
          data-zh="选择图片或整个文件夹"
        >
          选择图片或整个文件夹
        </p>
        <div
          className="laps-file-pick-actions d-flex flex-wrap justify-content-center align-items-center"
          style={{ gap: '10px' }}
        >
          <button
            type="button"
            className={compact ? 'btn btn-primary' : 'btn btn-primary btn-lg'}
            onClick={() => fileRef.current?.click()}
            data-en="Pick image files"
            data-zh="选择图片文件"
          >
            选择图片文件
          </button>
          <button
            type="button"
            className={compact ? 'btn btn-outline-primary' : 'btn btn-outline-primary btn-lg'}
            onClick={() => dirRef.current?.click()}
            data-en="Pick folder (batch)"
            data-zh="选择文件夹"
          >
            选择文件夹
          </button>
        </div>
        <p
          className="laps-file-pick-hint mt-3 mb-0"
          data-en="Multi-select supported; folder picks only image files inside."
          data-zh="支持多选；选文件夹时会自动筛选其中的图片。"
        >
          支持多选；选文件夹时会自动筛选其中的图片。
        </p>
      </div>
    </div>
  )
}

export function ZipPickZone({ onFile, selectedName, compact }) {
  const ref = useRef(null)
  const zoneClass = compact
    ? 'laps-file-pick-zone laps-file-pick-zone--compact mb-2'
    : 'laps-file-pick-zone laps-file-pick-zone--large mb-3'

  return (
    <div>
      <div className={zoneClass}>
        <input
          ref={ref}
          type="file"
          className="laps-file-pick-input"
          accept=".zip,application/zip"
          onChange={(e) => {
            const f = e.target.files && e.target.files[0]
            onFile(f || null)
          }}
        />
        <div className="laps-file-pick-zone-inner text-center py-4 px-3">
          <div className="laps-file-pick-icon mb-2" aria-hidden>
            🗜️
          </div>
          <p className="laps-file-pick-title mb-3" data-en="Select a ZIP archive" data-zh="选择 ZIP 压缩包">
            选择 ZIP 压缩包
          </p>
          <button
            type="button"
            className={compact ? 'btn btn-primary' : 'btn btn-primary btn-lg'}
            onClick={() => ref.current?.click()}
            data-en="Browse for ZIP…"
            data-zh="浏览 ZIP 文件…"
          >
            浏览 ZIP 文件…
          </button>
          <p
            className="laps-file-pick-hint mt-3 mb-0"
            data-en="Archive should contain image files (jpg, png, …)."
            data-zh="压缩包内应为图片（jpg、png 等）。"
          >
            压缩包内应为图片（jpg、png 等）。
          </p>
        </div>
      </div>
      {selectedName ? (
        <div className="laps-file-pick-selected">
          <strong data-en="Selected:" data-zh="已选：">
            已选：
          </strong>{' '}
          {selectedName}
        </div>
      ) : null}
    </div>
  )
}
