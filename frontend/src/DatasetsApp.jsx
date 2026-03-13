import React from 'react'

function getCsrfFromCookie() {
  if (typeof document === 'undefined') return ''
  const m = document.cookie.match(/csrftoken=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : ''
}

function DatasetsApp({ datasets = [], createdImages = [], urls = {} }) {
  const csrfToken = getCsrfFromCookie()

  return (
    <div className="content">
      <div className="row">
        <div className="col-md-12">
          <div className="card">
            <div className="card-header">
              <h4 className="card-title">Datasets</h4>
              <p className="card-category">
                Upload and manage images and metadata used for annotation.
              </p>
            </div>
            <div className="card-body">
              <form
                id="datasetUpload"
                method="post"
                encType="multipart/form-data"
                action={urls.datasets || ''}
              >
                <input type="hidden" name="csrfmiddlewaretoken" value={csrfToken} />
                <div className="form-group">
                  <label htmlFor="datasetName">Dataset name</label>
                  <input className="form-control" id="datasetName" name="name" />
                </div>
                <div className="form-group">
                  <label htmlFor="datasetFiles">Images</label>
                  <input
                    className="form-control"
                    id="datasetFiles"
                    name="files"
                    type="file"
                    multiple
                    accept="image/*"
                  />
                </div>
                <button className="btn btn-primary" type="submit">
                  Upload
                </button>
              </form>
              <hr />
              <h5 className="mt-3">Existing Datasets</h5>
              {datasets.length > 0 ? (
                <ul>
                  {datasets.map((d) => (
                    <li key={d.id}>
                      {d.name} ({d.created_at}) - {d.description}
                    </li>
                  ))}
                </ul>
              ) : (
                <ul>
                  <li>No datasets yet.</li>
                </ul>
              )}
              {createdImages.length > 0 && (
                <>
                  <hr />
                  <h6>Uploaded images</h6>
                  <div className="row">
                    {createdImages.map((img) => (
                      <div className="col-md-2" key={img.id}>
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

