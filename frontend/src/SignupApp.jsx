import React, { useMemo } from 'react'
import './index.css'

function getCookie(name) {
  if (typeof document === 'undefined') return ''
  const value = `; ${document.cookie || ''}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop().split(';').shift() || ''
  return ''
}

function SignupApp() {
  const csrfToken = useMemo(() => {
    if (typeof window !== 'undefined' && window.__CSRFTOKEN__) return window.__CSRFTOKEN__
    return getCookie('csrftoken')
  }, [])

  return (
    <>
      <div className="card-header text-center py-4">
        <h4 className="title mb-0" data-en="Register for LAPS" data-zh="注册 LAPS">
          注册 LAPS
        </h4>
      </div>
      <div className="card-body px-5 py-3">
        <form method="post" action="/accounts/auth-signup/" autoComplete="on">
          <input
            type="hidden"
            name="csrfmiddlewaretoken"
            value={csrfToken || ''}
          />
          <div className="row">
            <div className="col-md-12 px-md-1">
              <div className="form-group">
                <label htmlFor="id_username" data-en="Username" data-zh="用户名">
                  用户名
                </label>
                <input
                  type="text"
                  name="username"
                  id="id_username"
                  className="form-control"
                  maxLength={150}
                  required
                  placeholder="Username"
                />
              </div>
            </div>
            <div className="col-md-12 px-md-1">
              <div className="form-group">
                <label htmlFor="id_email" data-en="Email" data-zh="邮箱">
                  邮箱
                </label>
                <input
                  type="email"
                  name="email"
                  id="id_email"
                  className="form-control"
                  required
                  placeholder="you@example.com"
                />
              </div>
            </div>
            <div className="col-md-12 px-md-1">
              <div className="form-group">
                <label htmlFor="id_password1" data-en="Password" data-zh="密码">
                  密码
                </label>
                <input
                  type="password"
                  name="password1"
                  id="id_password1"
                  className="form-control"
                  required
                  placeholder="Password"
                />
              </div>
            </div>
            <div className="col-md-12 px-md-1">
              <div className="form-group">
                <label htmlFor="id_password2" data-en="Confirm password" data-zh="确认密码">
                  确认密码
                </label>
                <input
                  type="password"
                  name="password2"
                  id="id_password2"
                  className="form-control"
                  required
                  placeholder="Confirm password"
                />
              </div>
            </div>
            <div className="col-md-12 px-md-1">
              <button
                type="submit"
                className="btn btn-fill btn-primary btn-block"
                data-en="Register"
                data-zh="注册"
              >
                注册
              </button>
              <div className="text-center mt-2">
                <span className="small">
                  <span data-en="Or" data-zh="或">
                    或
                  </span>{' '}
                  <a href="/accounts/auth-signin/" data-en="Sign in" data-zh="登录">
                    登录
                  </a>
                </span>
              </div>
            </div>
          </div>
        </form>
      </div>
    </>
  )
}

export default SignupApp

