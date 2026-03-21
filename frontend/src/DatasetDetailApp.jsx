import React, { useCallback, useEffect, useState } from 'react'
import {
  getCsrfFromCookie,
  postDatasetForm,
  ModeTabs,
  LocalImagePickZone,
  ZipPickZone,
} from './datasetsShared.jsx'

const REDIRECT_FIELD = 'detail'

function imageFileLabel(img) {
  const s = (img && img.short) || ''
  if (!s) return `#${img?.id ?? ''}`
  const norm = s.replace(/\\/g, '/')
  const i = norm.lastIndexOf('/')
  return i >= 0 ? norm.slice(i + 1) : norm
}

function DatasetDetailApp({
  dataset = {},
  urls = {},
  image_preview_limit: previewLimit = 120,
  createdImages = [],
}) {
  const csrfToken = getCsrfFromCookie()
  const [editingMeta, setEditingMeta] = useState(false)
  const [appendMode, setAppendMode] = useState('images')
  const [pendingFiles, setPendingFiles] = useState([])
  const [zipFile, setZipFile] = useState(null)
  const [urlDraft, setUrlDraft] = useState('')
  const [appendBusy, setAppendBusy] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [lightboxCaption, setLightboxCaption] = useState('')
  const [localImages, setLocalImages] = useState(dataset.images || [])

  useEffect(() => {
    setLocalImages(dataset.images || [])
  }, [dataset.id, dataset.images])

  const overLimit = (dataset.image_count || 0) > previewLimit

  const handleAppend = async () => {
    if (appendMode === 'images' && pendingFiles.length === 0) {
      window.alert('请选择图片。')
      return
    }
    if (appendMode === 'zip' && !zipFile) {
      window.alert('请选择 ZIP。')
      return
    }
    if (appendMode === 'urls' && !urlDraft.trim()) {
      window.alert('请填写 URL。')
      return
    }
    const fd = new FormData()
    fd.append('csrfmiddlewaretoken', csrfToken)
    fd.append('intent', 'append_images')
    fd.append('dataset_id', String(dataset.id))
    fd.append('import_type', appendMode)
    if (appendMode === 'images') pendingFiles.forEach((f) => fd.append('files', f))
    else if (appendMode === 'zip') fd.append('archive', zipFile)
    else fd.append('url_list', urlDraft)
    setAppendBusy(true)
    const { ok, data } = await postDatasetForm(urls.datasets || '', fd)
    setAppendBusy(false)
    if (!ok) {
      window.alert(data.error || '追加失败')
      return
    }
    window.location.reload()
  }

  const saveLightboxCaption = async () => {
    if (!lightbox) return
    const fd = new FormData()
    fd.append('csrfmiddlewaretoken', csrfToken)
    fd.append('intent', 'update_image')
    fd.append('image_id', String(lightbox.id))
    fd.append('caption', lightboxCaption)
    const { ok, data } = await postDatasetForm(urls.datasets || '', fd)
    if (!ok || !data.ok) {
      window.alert('保存失败')
      return
    }
    setLocalImages((prev) =>
      prev.map((im) => (im.id === lightbox.id ? { ...im, caption: data.caption || '' } : im)),
    )
    setLightbox((lb) => (lb ? { ...lb, caption: data.caption || '' } : null))
  }

  const openLightbox = useCallback((img) => {
    setLightbox(img)
    setLightboxCaption(img.caption || '')
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="content">
      {lightbox ? (
        <div
          className="laps-dataset-lightbox"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setLightbox(null)}
          role="presentation"
        >
          <div
            className="bg-white rounded p-3"
            style={{ maxWidth: 'min(920px, 96vw)', maxHeight: '92vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="d-flex justify-content-between align-items-center mb-2">
              <strong data-en="Preview & note" data-zh="预览与备注">
                预览与备注
              </strong>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setLightbox(null)}>
                ×
              </button>
            </div>
            <img src={lightbox.url} alt="" style={{ maxWidth: '100%', maxHeight: '60vh', display: 'block', margin: '0 auto' }} />
            <div className="form-group mt-2 mb-2">
              <label className="small" data-en="Caption / note" data-zh="备注说明">
                备注说明
              </label>
              <input
                className="form-control"
                value={lightboxCaption}
                onChange={(e) => setLightboxCaption(e.target.value)}
                maxLength={500}
                placeholder="可选：为图片添加说明"
              />
            </div>
            <button type="button" className="btn btn-primary btn-sm mr-1" onClick={saveLightboxCaption} data-en="Save" data-zh="保存">
              保存
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setLightbox(null)} data-en="Close" data-zh="关闭">
              关闭
            </button>
          </div>
        </div>
      ) : null}

      <div className="row">
        <div className="col-md-12">
          <p className="mb-3">
            <a href={urls.datasets_list || '#'} className="btn btn-outline-secondary btn-sm" data-en="Back to list" data-zh="返回数据集列表">
              ← 返回数据集列表
            </a>
          </p>
          <div className="card mb-4">
            <div className="card-header d-flex flex-wrap justify-content-between align-items-center">
              <div>
                <h4 className="card-title mb-0">{dataset.name}</h4>
                <p className="card-category mb-0 small text-muted">
                  <span data-en="Images" data-zh="图片数">图片数</span>：{dataset.image_count ?? 0}
                </p>
              </div>
              <div>
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm mr-1"
                  onClick={() => setEditingMeta((v) => !v)}
                  data-en="Edit info" data-zh="编辑信息"
                >
                  {editingMeta ? '取消编辑' : '编辑信息'}
                </button>
                <form
                  method="post"
                  action={urls.datasets || ''}
                  className="d-inline"
                  onSubmit={(e) => !window.confirm('Delete dataset and all its images / related tasks?') && e.preventDefault()}
                >
                  <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="dataset_id" value={dataset.id} />
                  <button className="btn btn-outline-danger btn-sm" type="submit" data-en="Delete dataset" data-zh="删除数据集">
                    删除数据集
                  </button>
                </form>
              </div>
            </div>
            <div className="card-body">
              {editingMeta ? (
                <form method="post" action={urls.datasets || ''}>
                  <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="dataset_id" value={dataset.id} />
                  <input type="hidden" name="redirect" value={REDIRECT_FIELD} />
                  <div className="form-row">
                    <div className="col-md-5 mb-2">
                      <label className="small" data-en="Name" data-zh="名称">
                        名称
                      </label>
                      <input className="form-control" name="name" defaultValue={dataset.name} />
                    </div>
                    <div className="col-md-7 mb-2">
                      <label className="small" data-en="Description" data-zh="描述">
                        描述
                      </label>
                      <input className="form-control" name="description" defaultValue={dataset.description || ''} />
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" type="submit" data-en="Save" data-zh="保存">
                    保存
                  </button>
                </form>
              ) : (
                <>
                  <div className="small text-muted">{dataset.created_at}</div>
                  {dataset.description ? <p className="mb-0 mt-2">{dataset.description}</p> : <p className="text-muted small mb-0">—</p>}
                </>
              )}
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header">
              <h5 className="mb-0" data-en="Continue import" data-zh="继续导入">
                继续导入
              </h5>
            </div>
            <div className="card-body">
              <ModeTabs
                value={appendMode}
                onChange={(mode) => {
                  setAppendMode(mode)
                  setPendingFiles([])
                  setZipFile(null)
                  setUrlDraft('')
                }}
              />
              {appendMode === 'images' ? (
                <LocalImagePickZone compact onAddFiles={(list) => setPendingFiles((prev) => [...prev, ...list])} />
              ) : null}
              {appendMode === 'zip' ? (
                <ZipPickZone compact onFile={setZipFile} selectedName={zipFile ? zipFile.name : ''} />
              ) : null}
              {appendMode === 'urls' ? (
                <div className="mb-2">
                  <textarea
                    className="form-control"
                    rows={4}
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    placeholder="https://example.com/a.jpg | 可选备注"
                  />
                  <p
                    className="small text-muted mt-1 mb-0"
                    data-en="URL caption hint"
                    data-zh="每行一个地址；地址与备注之间用「 | 」或 Tab 分隔；未写备注时仍会用 URL 文件名作为默认备注。"
                  >
                    每行一个地址；地址与备注之间用「 | 」或 Tab 分隔；未写备注时仍会用 URL 文件名作为默认备注。
                  </p>
                </div>
              ) : null}
              {appendMode === 'images' && pendingFiles.length > 0 ? (
                <ul className="small mb-2 pl-3">
                  {pendingFiles.map((f, i) => (
                    <li key={`${f.name}-${i}`}>
                      <span className="text-truncate d-inline-block" style={{ maxWidth: '75%' }} title={f.name}>
                        {f.name}
                      </span>
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0 ml-1 text-danger"
                        onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <button type="button" className="btn btn-primary" disabled={appendBusy} onClick={handleAppend} data-en="Import" data-zh="导入到本数据集">
                {appendBusy ? '…' : '导入到本数据集'}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h5 className="mb-0" data-en="Image list" data-zh="图片列表">
                图片列表
              </h5>
              <p className="card-category mb-0 small text-muted" data-en="Thumbnails + file info; click to enlarge." data-zh="缩略图预览；点击查看大图并编辑备注。">
                缩略图预览；点击查看大图并编辑备注。
              </p>
            </div>
            <div className="card-body">
              {overLimit ? (
                <p className="small text-warning mb-2" data-en="Preview limited" data-zh={`以下仅列出前 ${previewLimit} 张，共 ${dataset.image_count} 张。`}>
                  以下仅列出前 {previewLimit} 张，共 {dataset.image_count} 张。
                </p>
              ) : null}
              {localImages.length > 0 ? (
                <div className="table-responsive laps-dataset-image-table">
                  <table className="table table-hover table-sm align-middle mb-0">
                    <thead>
                      <tr>
                        <th scope="col" className="text-center laps-col-thumb" data-en="Thumb" data-zh="预览">
                          预览
                        </th>
                        <th scope="col" data-en="File name" data-zh="文件名">
                          文件名
                        </th>
                        <th scope="col" className="text-nowrap laps-col-id" data-en="ID" data-zh="ID">
                          ID
                        </th>
                        <th scope="col" data-en="Caption" data-zh="备注">
                          备注
                        </th>
                        <th scope="col" className="text-nowrap laps-col-actions" data-en="Actions" data-zh="操作">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {localImages.map((img) => {
                        const label = imageFileLabel(img)
                        return (
                          <tr key={img.id}>
                            <td className="text-center laps-col-thumb">
                              <button
                                type="button"
                                className="btn btn-link p-0 laps-thumb-hit"
                                onClick={() => openLightbox(img)}
                                title="放大预览"
                                data-en="Enlarge" data-zh="放大"
                              >
                                <img src={img.url} alt="" className="laps-dataset-list-thumb" />
                              </button>
                            </td>
                            <td className="small">
                              <span className="d-block text-truncate" style={{ maxWidth: 'min(420px, 55vw)', fontWeight: 600 }} title={img.short || label}>
                                {label}
                              </span>
                            </td>
                            <td className="small text-muted laps-col-id">{img.id}</td>
                            <td className="small">
                              <span className="d-inline-block text-truncate" style={{ maxWidth: 'min(280px, 40vw)' }} title={img.caption || ''}>
                                {img.caption || '—'}
                              </span>
                            </td>
                            <td className="laps-col-actions">
                              <button
                                type="button"
                                className="btn btn-outline-primary btn-sm mr-1 mb-1"
                                onClick={() => openLightbox(img)}
                                data-en="Preview" data-zh="大图"
                              >
                                大图
                              </button>
                              <form
                                method="post"
                                action={urls.datasets || ''}
                                className="d-inline"
                                onSubmit={(e) => {
                                  if (!window.confirm('Remove this image? Related tasks will be removed.')) e.preventDefault()
                                }}
                              >
                                <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
                                <input type="hidden" name="intent" value="delete_image" />
                                <input type="hidden" name="image_id" value={img.id} />
                                <input type="hidden" name="redirect" value={REDIRECT_FIELD} />
                                <button className="btn btn-outline-danger btn-sm mb-1" type="submit" data-en="Remove" data-zh="移除">
                                  移除
                                </button>
                              </form>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted mb-0" data-en="No images yet." data-zh="暂无图片，请使用上方「继续导入」。">
                  暂无图片，请使用上方「继续导入」。
                </p>
              )}
            </div>
          </div>

          {createdImages.length > 0 ? (
            <>
              <hr />
              <h6 data-en="Last uploaded" data-zh="本次上传">
                本次上传
              </h6>
              <div className="row">
                {createdImages.map((img) => (
                  <div className="col-md-2" key={img.id}>
                    <img src={img.url} style={{ maxWidth: '100%' }} alt="" />
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default DatasetDetailApp
