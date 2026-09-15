import { useState } from 'react'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'

import { zh } from '@/utils/i18n'
import { getErrorMessage } from '@/utils/errors'

export default function LoginPage({ onLogin, checkError = '', onRetry }) {
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!password) return
    setError('')
    setSubmitting(true)
    try {
      await onLogin(password)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#1a1612] via-[#0c0a08] to-[#1a1408] px-4">
      <section className="bg-app-surface/90 w-full max-w-md rounded-[28px] border border-app-border p-8 shadow-[0_24px_80px_rgba(12,8,4,0.55)] backdrop-blur">
        <div className="mb-8 text-center">
          <div className="app-gold-letter text-3xl font-bold tracking-tight">JavBoss</div>
          <p className="mt-2 text-sm text-app-muted">
            {zh('请输入密码继续', 'Enter your password to continue')}
          </p>
        </div>

        {checkError ? (
          <div className="mb-4 rounded-xl border border-amber-700/40 bg-amber-950/40 p-3 text-sm text-amber-200">
            <div>{checkError}</div>
            <button type="button" onClick={onRetry} className="mt-2 font-medium underline">
              {zh('重新连接', 'Retry')}
            </button>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-sm font-medium text-app-text"
            >
              {zh('密码', 'Password')}
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={passwordVisible ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setError('')
                }}
                className="focus:ring-app-gold/25 w-full rounded-xl border border-app-border bg-app-surface py-2.5 pl-3 pr-11 text-app-text outline-none transition focus:border-app-gold focus:ring-2"
              />
              <button
                type="button"
                onClick={() => setPasswordVisible((visible) => !visible)}
                className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-md p-1 text-app-muted hover:bg-app-bg hover:text-app-text"
                aria-label={
                  passwordVisible
                    ? zh('隐藏密码', 'Hide password')
                    : zh('显示密码', 'Show password')
                }
              >
                {passwordVisible ? (
                  <VisibilityOutlinedIcon fontSize="small" aria-hidden="true" />
                ) : (
                  <VisibilityOffOutlinedIcon fontSize="small" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full rounded-xl bg-app-gold px-4 py-2.5 font-medium text-[#1a1208] transition hover:bg-app-gold-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? zh('登录中…', 'Signing in...') : zh('登录', 'Sign in')}
          </button>
        </form>

        <div className="mt-5 border-t border-app-border pt-4">
          <button
            type="button"
            aria-expanded={recoveryOpen}
            aria-controls="password-recovery-help"
            onClick={() => setRecoveryOpen((value) => !value)}
            className="flex w-full items-center justify-between text-left text-sm font-medium text-app-muted hover:text-app-text"
          >
            <span>{zh('忘记密码？', 'Forgot your password?')}</span>
            <span aria-hidden="true" className="text-xs text-app-muted">
              {recoveryOpen ? '▲' : '▼'}
            </span>
          </button>
          {recoveryOpen ? (
            <div
              id="password-recovery-help"
              className="mt-3 rounded-xl border border-amber-700/40 bg-amber-950/40 p-4 text-sm text-amber-100"
            >
              <ol className="list-decimal space-y-2 pl-5">
                <li>{zh('先停止 JavBoss。', 'Stop JavBoss first.')}</li>
                <li>
                  {zh(
                    '找到项目目录，进入 data 文件夹，在里面新建 password_reset.txt。',
                    'Find the project directory, open the data folder, and create password_reset.txt inside it.'
                  )}
                </li>
                <li>
                  {zh(
                    '在 password_reset.txt 中填入一个 6-20 个字符的新密码。',
                    'Enter a new 6-20 character password in password_reset.txt.'
                  )}
                </li>
                <li>
                  {zh(
                    '重新启动 JavBoss；密码会自动重置，旧登录全部失效，重置文件会被自动删除。',
                    'Restart JavBoss. The password is reset, old sessions are revoked, and the reset file is deleted automatically.'
                  )}
                </li>
              </ol>
            </div>
          ) : null}
        </div>

        <p className="mt-5 text-center text-xs text-app-muted">
          {zh(
            '默认密码：admin，登陆后可在全局设置中修改',
            'Default password: admin. You can change it in Global Settings after signing in.'
          )}
        </p>
      </section>
    </main>
  )
}
