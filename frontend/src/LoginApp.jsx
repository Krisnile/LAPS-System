import React, { useEffect, useRef, useState } from 'react'
import './index.css'

function LoginApp() {
  const [role, setRole] = useState('user')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [sliderOk, setSliderOk] = useState(false)
  const [remember, setRemember] = useState(false)

  const trackRef = useRef(null)
  const handleRef = useRef(null)
  const fillRef = useRef(null)
  const textRef = useRef(null)
  const doneTextRef = useRef(null)

  // 从 localStorage 恢复用户名
  useEffect(() => {
    try {
      const saved = localStorage.getItem('laps_remember_username')
      const name = localStorage.getItem('laps_username_value') || ''
      if (saved === '1') {
        setRemember(true)
        setUsername((prev) => (prev || name))
      }
    } catch (e) {
      // ignore
    }
  }, [])

  const sliderDisabled = !username || !password

  // 简单滑动验证（仅在已填写账号 + 密码后才允许操作）
  useEffect(() => {
    const track = trackRef.current
    const handle = handleRef.current
    const fill = fillRef.current
    const text = textRef.current
    const doneText = doneTextRef.current
    if (!track || !handle || !fill || !text || !doneText) return

    let dragging = false
    let startX = 0
    let startLeft = 0

    const setVerified = () => {
      const trackWidth = track.clientWidth || 1
      const handleWidth = handle.clientWidth || 32
      const maxLeft = trackWidth - handleWidth - 4
      handle.style.left = `${maxLeft}px`
      fill.style.width = `${trackWidth}px`
      setSliderOk(true)
      text.style.display = 'none'
      doneText.style.display = 'flex'
      handle.style.cursor = 'default'
    }

    const onDown = (e) => {
      if (sliderOk || sliderDisabled) return
      dragging = true
      const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0
      startX = clientX
      startLeft = parseInt(handle.style.left || '0', 10) || 0
      handle.style.cursor = 'grabbing'
      e.preventDefault()
    }

    const onMove = (e) => {
      if (!dragging) return
      const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0
      const delta = clientX - startX
      const trackWidth = track.clientWidth || 1
      const handleWidth = handle.clientWidth || 32
      const maxLeft = trackWidth - handleWidth - 4
      let left = startLeft + delta
      left = Math.min(maxLeft, Math.max(0, left))
      handle.style.left = `${left}px`
      fill.style.width = `${left + handleWidth}px`
    }

    const onUp = () => {
      if (!dragging) return
      dragging = false
      const trackWidth = track.clientWidth || 1
      const handleWidth = handle.clientWidth || 32
      const left = parseInt(handle.style.left || '0', 10) || 0
      const maxLeft = trackWidth - handleWidth - 4
      if (left >= maxLeft * 0.9) {
        setVerified()
      } else {
        handle.style.left = '0px'
        fill.style.width = '0px'
        handle.style.cursor = 'grab'
      }
    }

    const onTrackClick = () => {
      if (sliderOk || sliderDisabled) return
      setVerified()
    }

    handle.addEventListener('mousedown', onDown)
    handle.addEventListener('touchstart', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchend', onUp)
    track.addEventListener('click', onTrackClick)

    return () => {
      handle.removeEventListener('mousedown', onDown)
      handle.removeEventListener('touchstart', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchend', onUp)
      track.removeEventListener('click', onTrackClick)
    }
  }, [sliderOk, sliderDisabled])

  const onSubmit = (e) => {
    if (!sliderOk) {
      e.preventDefault()
      alert('请先完成滑动验证。')
      return
    }

    try {
      if (remember && username) {
        localStorage.setItem('laps_remember_username', '1')
        localStorage.setItem('laps_username_value', username)
      } else {
        localStorage.removeItem('laps_remember_username')
        localStorage.removeItem('laps_username_value')
      }
    } catch (err) {
      // ignore
    }
  }

  return (
    <>
      <div className="card-header text-center py-4">
        <h4 className="title mb-0" data-en="Login to LAPS" data-zh="登录 LAPS">
          登录 LAPS
        </h4>
      </div>
      <div className="card-body px-5 py-3">
        <form
          method="post"
          action="/accounts/auth-signin/"
          autoComplete="on"
          onSubmit={onSubmit}
        >
          <input
            type="hidden"
            name="csrfmiddlewaretoken"
            value={
              typeof window !== 'undefined' && window.__CSRFTOKEN__
                ? window.__CSRFTOKEN__
                : ''
            }
          />
          <input type="hidden" name="role" value={role} />
          <input type="hidden" name="slider_ok" value={sliderOk ? '1' : '0'} />

          <div className="row">
            <div className="col-md-12 px-md-1 mb-2">
              <div className="d-flex align-items-center">
                <span className="small text-muted" data-en="Login role" data-zh="登录身份">
                  登录身份
                </span>
                <div className="d-flex align-items-center ml-3">
                  <div className="custom-control custom-radio custom-control-inline">
                    <input
                      type="radio"
                      id="role_user"
                      className="custom-control-input"
                      name="role_radio"
                      checked={role === 'user'}
                      onChange={() => setRole('user')}
                    />
                    <label className="custom-control-label" htmlFor="role_user" data-en="User" data-zh="普通用户">
                      普通用户
                    </label>
                  </div>
                  <div className="custom-control custom-radio custom-control-inline ml-2">
                    <input
                      type="radio"
                      id="role_super"
                      className="custom-control-input"
                      name="role_radio"
                      checked={role === 'super'}
                      onChange={() => setRole('super')}
                    />
                    <label className="custom-control-label" htmlFor="role_super" data-en="Super admin" data-zh="超级管理员">
                      超级管理员
                    </label>
                  </div>
                </div>
              </div>
            </div>

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
                  autoComplete="username"
                  maxLength={150}
                  required
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="col-md-12 px-md-1">
              <div className="form-group">
                <label htmlFor="id_password" data-en="Password" data-zh="密码">
                  密码
                </label>
                <input
                  type="password"
                  name="password"
                  id="id_password"
                  className="form-control"
                  autoComplete="current-password"
                  required
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="col-md-12 px-md-1 mb-2">
              <label className="d-block mb-1" data-en="Slide to verify" data-zh="滑动完成验证">
                滑动完成验证
              </label>
              <div
                ref={trackRef}
                className="position-relative"
                style={{
                  height: 38,
                  borderRadius: 22,
                  background: 'rgba(255,255,255,0.06)',
                  overflow: 'hidden',
                  cursor: sliderDisabled || sliderOk ? 'not-allowed' : 'pointer',
                  opacity: sliderDisabled && !sliderOk ? 0.5 : 1,
                }}
              >
                <div
                  ref={fillRef}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 0,
                    background: 'linear-gradient(90deg,#3ac58f,#5e72e4)',
                    transition: 'width .25s ease',
                  }}
                />
                <div
                  ref={handleRef}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 3,
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: '#fff',
                    color: '#3c3c3c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 6px rgba(0,0,0,.35)',
                    cursor: 'grab',
                    transition: 'left .25s ease',
                  }}
                >
                  <span className="tim-icons icon-minimal-right" style={{ fontSize: '0.9rem' }} />
                </div>
                <span
                  ref={textRef}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    opacity: 0.85,
                  }}
                  data-en="Hold and slide to verify"
                  data-zh="按住滑块拖动完成验证"
                >
                  按住滑块拖动完成验证
                </span>
                <span
                  ref={doneTextRef}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                    display: 'none',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    opacity: 0.95,
                  }}
                  data-en="Verified"
                  data-zh="验证通过"
                >
                  验证通过
                </span>
              </div>
            </div>

            <div className="col-md-12 px-md-1 d-flex justify-content-between align-items-center mb-3">
              <div className="custom-control custom-checkbox">
                <input
                  type="checkbox"
                  className="custom-control-input"
                  id="remember_username_react"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <label className="custom-control-label" htmlFor="remember_username_react" data-en="Remember username" data-zh="记住账号">
                  记住账号
                </label>
              </div>
              <div className="text-right">
                <a
                  href="javascript:void(0)"
                  className="text-muted small"
                  data-en="Forgot password?"
                  data-zh="忘记密码？"
                  onClick={(e) => {
                    e.preventDefault()
                    alert('请联系系统管理员重置密码。')
                  }}
                >
                  忘记密码？
                </a>
              </div>
            </div>

            <div className="col-md-12 px-md-1">
              <button
                type="submit"
                className="btn btn-fill btn-primary btn-block"
                data-en="Login"
                data-zh="登录"
              >
                登录
              </button>
              <div className="d-flex justify-content-between align-items-center mt-2">
                <span className="small">
                  <span data-en="Or" data-zh="或">或</span>{' '}
                  <a href="/accounts/auth-signup/" data-en="Register" data-zh="注册">
                    注册
                  </a>
                </span>
                <span
                  className="small text-muted"
                  data-en="Other login methods (coming soon)"
                  data-zh="其他登录方式（即将支持）"
                >
                  其他登录方式（即将支持）
                </span>
              </div>
            </div>
          </div>
        </form>
      </div>
    </>
  )
}

export default LoginApp

