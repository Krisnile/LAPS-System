import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getCsrfFromCookie,
  postDatasetForm,
  ModeTabs,
  LocalImagePickZone,
  ZipPickZone,
} from './datasetsShared.jsx'

const IMPORT_PREVIEW_PAGE_SIZE = 48

function DatasetsApp({ datasets = [], createdImages = [], urls = {} }) {
  const csrfToken = getCsrfFromCookie()
  const [createMode, setCreateMode] = useState('images')
  const [pendingFiles, setPendingFiles] = useState([])
  const [zipFile, setZipFile] = useState(null)
  const [urlDraft, setUrlDraft] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [importPreviewPage, setImportPreviewPage] = useState(1)
  const [createdPreviewPage, setCreatedPreviewPage] = useState(1)

  const previewUrls = useMemo(() => pendingFiles.map((f) => URL.createObjectURL(f)), [pendingFiles])
  useEffect(() => {
    return () => previewUrls.forEach((u) => URL.revokeObjectURL(u))
  }, [previewUrls])

  const importPreviewTotalPages = Math.max(1, Math.ceil(pendingFiles.length / IMPORT_PREVIEW_PAGE_SIZE) || 1)
  useEffect(() => {
    setImportPreviewPage((p) => Math.min(p, importPreviewTotalPages))
  }, [pendingFiles.length, importPreviewTotalPages])

  const importPreviewStart = (importPreviewPage - 1) * IMPORT_PREVIEW_PAGE_SIZE
  const importPreviewSlice = pendingFiles.slice(importPreviewStart, importPreviewStart + IMPORT_PREVIEW_PAGE_SIZE)

  const createdTotalPages = Math.max(1, Math.ceil(createdImages.length / IMPORT_PREVIEW_PAGE_SIZE) || 1)
  useEffect(() => {
    setCreatedPreviewPage((p) => Math.min(p, createdTotalPages))
  }, [createdImages.length, createdTotalPages])

  const createdStart = (createdPreviewPage - 1) * IMPORT_PREVIEW_PAGE_SIZE
  const createdSlice = createdImages.slice(createdStart, createdStart + IMPORT_PREVIEW_PAGE_SIZE)

  const removePending = useCallback((index) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    const name = (e.target.elements.namedItem('name') && e.target.elements.namedItem('name').value) || ''
    const description =
      (e.target.elements.namedItem('description') && e.target.elements.namedItem('description').value) || ''
    if (createMode === 'images' && pendingFiles.length === 0) {
      window.alert('请先选择要导入的本地图片。')
      return
    }
    if (createMode === 'zip' && !zipFile) {
      window.alert('请选择 ZIP 文件。')
      return
    }
    if (createMode === 'urls' && !urlDraft.trim()) {
      window.alert('请填写至少一行图片 URL。')
      return
    }
    const fd = new FormData()
    fd.append('csrfmiddlewaretoken', csrfToken)
    fd.append('intent', 'create')
    fd.append('name', name)
    fd.append('description', description)
    fd.append('import_type', createMode)
    if (createMode === 'images') pendingFiles.forEach((f) => fd.append('files', f))
    else if (createMode === 'zip') fd.append('archive', zipFile)
    else fd.append('url_list', urlDraft)
    setCreateBusy(true)
    const { ok, data } = await postDatasetForm(urls.datasets || '', fd)
    setCreateBusy(false)
    if (!ok) {
      window.alert(data.error || '创建失败')
      return
    }
    if (data.dataset && data.dataset.id) {
      const base = (urls.datasets || '').replace(/\/?$/, '')
      window.location.href = `${base}/${data.dataset.id}/`
      return
    }
    window.location.reload()
  }

  return (
    <div className="content">
      <div className="row">
        <div className="col-md-12">
          <div className="card">
            <div className="card-header">
              <h4 className="card-title" data-en="Datasets" data-zh="数据集">数据集</h4>
              <p
                className="card-category"
                data-en="Create imports here; open a dataset to preview images, edit notes, or append more files."
                data-zh="在此新建导入；点击「管理」进入详情页进行预览、备注与继续导入。"
              >
                在此新建导入；点击「管理」进入详情页进行预览、备注与继续导入。
              </p>
            </div>
            <div className="card-body">
              <h6 data-en="New import" data-zh="新建导入">新建导入</h6>
              <form onSubmit={handleCreate}>
                <ModeTabs value={createMode} onChange={setCreateMode} />
                <div className="form-row">
                  <div className="col-md-4 mb-2">
                    <label className="small mb-0" data-en="Dataset name" data-zh="数据集名称">
                      数据集名称
                    </label>
                    <input className="form-control" name="name" placeholder="可留空自动生成" data-en="Optional" data-zh="可选" />
                  </div>
                  <div className="col-md-8 mb-2">
                    <label className="small mb-0" data-en="Description" data-zh="描述">
                      描述
                    </label>
                    <input className="form-control" name="description" placeholder="可选" />
                  </div>
                </div>
                {createMode === 'images' ? (
                  <div className="form-group">
                    <label className="d-block mb-2 font-weight-bold" data-en="Import from disk" data-zh="从本机导入">
                      从本机导入
                    </label>
                    <LocalImagePickZone
                      compact={false}
                      onAddFiles={(list) => setPendingFiles((prev) => [...prev, ...list])}
                    />
                    {pendingFiles.length > 0 ? (
                      <div className="mt-2">
                        <p className="small text-muted mb-1" data-en="Preview (click × to remove before import)" data-zh="导入前预览（× 移除不需要的文件）">
                          导入前预览（× 移除不需要的文件）
                        </p>
                        <p className="small text-muted mb-2 laps-import-preview-summary">
                          <span data-en="Selected" data-zh="已选">已选</span> {pendingFiles.length}{' '}
                          <span data-en="files" data-zh="个文件">个文件</span>
                          {importPreviewTotalPages > 1 ? (
                            <>
                              {' · '}
                              <span data-en="Page" data-zh="第">第</span> {importPreviewPage} / {importPreviewTotalPages}{' '}
                              <span data-en="pages" data-zh="页">页</span>
                            </>
                          ) : null}
                        </p>
                        {importPreviewTotalPages > 1 ? (
                          <div className="d-flex flex-wrap align-items-center mb-2">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary mr-2"
                              disabled={importPreviewPage <= 1}
                              onClick={() => setImportPreviewPage((p) => Math.max(1, p - 1))}
                              data-en="Previous page" data-zh="上一页"
                            >
                              上一页
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              disabled={importPreviewPage >= importPreviewTotalPages}
                              onClick={() => setImportPreviewPage((p) => Math.min(importPreviewTotalPages, p + 1))}
                              data-en="Next page" data-zh="下一页"
                            >
                              下一页
                            </button>
                          </div>
                        ) : null}
                        <div className="row">
                          {importPreviewSlice.map((f, localIdx) => {
                            const i = importPreviewStart + localIdx
                            return (
                              <div key={`${f.name}-${i}`} className="col-4 col-sm-3 col-md-2 mb-2">
                                <div className="position-relative border rounded p-1">
                                  <img src={previewUrls[i]} alt="" style={{ width: '100%', height: 72, objectFit: 'cover', borderRadius: 4 }} />
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-danger position-absolute"
                                    style={{ top: 2, right: 2, padding: '0 6px', lineHeight: 1.2 }}
                                    onClick={() => removePending(i)}
                                    aria-label="remove"
                                  >
                                    ×
                                  </button>
                                  <div className="small text-truncate" title={f.name}>
                                    {f.name}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {createMode === 'zip' ? (
                  <div className="form-group">
                    <label className="d-block mb-2 font-weight-bold" data-en="ZIP import" data-zh="ZIP 导入">
                      ZIP 导入
                    </label>
                    <ZipPickZone compact={false} onFile={setZipFile} selectedName={zipFile ? zipFile.name : ''} />
                    <p className="small text-muted mt-2" data-en="Limits" data-zh="支持 jpg/png/gif/webp/bmp/tiff 等；单文件≤25MB，总解压体积有限制。">
                      支持 jpg/png/gif/webp/bmp/tiff 等；单文件≤25MB，总解压体积有限制。
                    </p>
                  </div>
                ) : null}
                {createMode === 'urls' ? (
                  <div className="form-group">
                    <label data-en="One image URL per line" data-zh="每行一个图片 URL">每行一个图片 URL</label>
                    <textarea
                      className="form-control"
                      rows={5}
                      value={urlDraft}
                      onChange={(e) => setUrlDraft(e.target.value)}
                      placeholder="https://example.com/a.jpg | 可选备注"
                    />
                    <p
                      className="small text-muted mt-1"
                      data-en="URL hints"
                      data-zh="每行一个 HTTP(S) 地址；可在地址后用「 | 」或 Tab 分隔填写备注（最多 80 行；无法下载的行会跳过）。"
                    >
                      每行一个 HTTP(S) 地址；可在地址后用「 | 」或 Tab 分隔填写备注（最多 80 行；无法下载的行会跳过）。
                    </p>
                  </div>
                ) : null}
                <button className="btn btn-primary" type="submit" disabled={createBusy} data-en="Create dataset" data-zh="创建数据集">
                  {createBusy ? '…' : '创建数据集'}
                </button>
              </form>
              <hr />
              <h5 className="mt-3" data-en="Your datasets" data-zh="数据集列表">数据集列表</h5>
              {datasets.length > 0 ? (
                <div className="table-responsive laps-dataset-table">
                  <table className="table table-hover align-middle mb-0">
                    <thead>
                      <tr>
                        <th data-en="Name" data-zh="名称">名称</th>
                        <th data-en="Images" data-zh="图片数">图片数</th>
                        <th data-en="Created" data-zh="创建时间">创建时间</th>
                        <th data-en="Description" data-zh="描述">描述</th>
                        <th style={{ width: '1%' }} data-en="Actions" data-zh="操作">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datasets.map((d) => (
                        <tr key={d.id}>
                          <td>
                            <strong>{d.name}</strong>
                          </td>
                          <td>{d.image_count ?? 0}</td>
                          <td className="small text-muted text-nowrap">{d.created_at}</td>
                          <td className="small text-muted">{d.description || '—'}</td>
                          <td className="text-nowrap">
                            <a
                              href={d.detail_url || '#'}
                              className="btn btn-primary btn-sm mr-1"
                              data-en="Manage" data-zh="管理"
                            >
                              管理
                            </a>
                            <form
                              method="post"
                              action={urls.datasets || ''}
                              className="d-inline"
                              onSubmit={(e) => !window.confirm('Delete dataset and all its images / related tasks?') && e.preventDefault()}
                            >
                              <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
                              <input type="hidden" name="intent" value="delete" />
                              <input type="hidden" name="dataset_id" value={d.id} />
                              <button className="btn btn-outline-danger btn-sm" type="submit" data-en="Delete" data-zh="删除">
                                删除
                              </button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted mb-0" data-en="No datasets yet." data-zh="暂无数据集。">
                  暂无数据集。
                </p>
              )}
              {createdImages.length > 0 && (
                <>
                  <hr />
                  <h6 data-en="Last uploaded" data-zh="本次上传">本次上传</h6>
                  <p className="small text-muted mb-2">
                    <span data-en="Total" data-zh="共">共</span> {createdImages.length}{' '}
                    <span data-en="images" data-zh="张">张</span>
                    {createdTotalPages > 1 ? (
                      <>
                        {' · '}
                        <span data-en="Page" data-zh="第">第</span> {createdPreviewPage} / {createdTotalPages}{' '}
                        <span data-en="pages" data-zh="页">页</span>
                      </>
                    ) : null}
                  </p>
                  {createdTotalPages > 1 ? (
                    <div className="d-flex flex-wrap align-items-center mb-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary mr-2"
                        disabled={createdPreviewPage <= 1}
                        onClick={() => setCreatedPreviewPage((p) => Math.max(1, p - 1))}
                        data-en="Previous page" data-zh="上一页"
                      >
                        上一页
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={createdPreviewPage >= createdTotalPages}
                        onClick={() => setCreatedPreviewPage((p) => Math.min(createdTotalPages, p + 1))}
                        data-en="Next page" data-zh="下一页"
                      >
                        下一页
                      </button>
                    </div>
                  ) : null}
                  <div className="row">
                    {createdSlice.map((img) => (
                      <div className="col-md-2 mb-2" key={img.id}>
                        <img src={img.url} style={{ maxWidth: '100%' }} alt="" />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DatasetsApp
