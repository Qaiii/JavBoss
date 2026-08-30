import { useSyncExternalStore } from 'react'
import { zh } from '@/utils/i18n'

// 主题注册表：新增主题 = 在这里加一条记录 + 在 src/themes.css 里加一个
// `html[data-theme='<id>']` 调色板变量块（浅色主题的变量在 themes.css 的 :root）。
//
// - id:            主题标识，写入 html[data-theme] 与 localStorage
// - label:         选择器里显示的名称
// - dark:          是否暗色（暗色主题会给 html 加 .theme-dark，启用暗色覆写层）
// - chrome:        移动端浏览器地址栏 / 系统栏颜色（theme-color meta）
// - preview:       选择器色卡预览 [页面背景, 面板背景, 强调色]
export const THEMES = [
  {
    id: 'light',
    label: zh('浅色', 'Light'),
    dark: false,
    chrome: '#f9fafb',
    preview: ['#f9fafb', '#ffffff', '#2563eb'],
  },
  {
    id: 'navy',
    label: zh('墨蓝', 'Midnight Blue'),
    dark: true,
    chrome: '#0f131c',
    preview: ['#0f131c', '#161c2b', '#3b82f6'],
  },
  {
    id: 'coffee',
    label: zh('暖棕', 'Warm Coffee'),
    dark: true,
    chrome: '#161008',
    preview: ['#161008', '#1e170e', '#d97706'],
  },
  {
    id: 'teal',
    label: zh('青碧', 'Teal'),
    dark: true,
    chrome: '#0d1513',
    preview: ['#0d1513', '#121d1a', '#0d9488'],
  },
]

export const DEFAULT_THEME_ID = 'light'
// 从暗色切回浅色时记住的暗色主题，再次切换暗色时恢复
export const DEFAULT_DARK_THEME_ID = 'navy'

const STORAGE_KEY = 'javboss.theme'
const THEME_CHANGE_EVENT = 'javboss:themechange'

export const getTheme = (id) => THEMES.find((theme) => theme.id === id) || null

export const isDarkThemeId = (id) => Boolean(getTheme(id)?.dark)

export const normalizeThemeId = (value, fallback = DEFAULT_THEME_ID) =>
  getTheme(value) ? value : fallback

// localStorage 形如 { id: 'navy', lastDark: 'coffee' }
export function readStoredTheme() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      id: normalizeThemeId(parsed.id),
      lastDark: normalizeThemeId(parsed.lastDark, DEFAULT_DARK_THEME_ID),
    }
  } catch {
    return null
  }
}

export function storeTheme(id, lastDark) {
  try {
    const theme = getTheme(id)
    const payload = {
      id: normalizeThemeId(id),
      lastDark: normalizeThemeId(
        theme?.dark ? theme.id : lastDark,
        theme?.dark ? theme.id : DEFAULT_DARK_THEME_ID
      ),
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // 忽略存储失败（如隐私模式）
  }
}

// 把主题应用到 <html>：暗色主题挂 .theme-dark（启用覆写层）+ data-theme（命中调色板）
export function applyTheme(id) {
  const theme = getTheme(normalizeThemeId(id))
  if (!theme) return
  const root = document.documentElement
  if (theme.dark) {
    root.classList.add('theme-dark')
    root.dataset.theme = theme.id
  } else {
    root.classList.remove('theme-dark')
    root.dataset.theme = 'light'
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme.chrome)
  return theme
}

const notify = () => window.dispatchEvent(new Event(THEME_CHANGE_EVENT))

export function setTheme(id) {
  const theme = applyTheme(id)
  if (!theme) return
  storeTheme(theme.id)
  notify()
}

// 浅色 ↔ 上次使用的暗色主题
export function toggleDarkTheme() {
  const current = getCurrentThemeId()
  const stored = readStoredTheme()
  const next = isDarkThemeId(current)
    ? DEFAULT_THEME_ID
    : normalizeThemeId(stored?.lastDark, DEFAULT_DARK_THEME_ID)
  setTheme(next)
  return next
}

export function getCurrentThemeId() {
  return normalizeThemeId(document.documentElement.dataset.theme || DEFAULT_THEME_ID)
}

const subscribeTheme = (onChange) => {
  window.addEventListener(THEME_CHANGE_EVENT, onChange)
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange)
}

const snapshotThemeId = () => getCurrentThemeId()

// React 里读取当前主题（主题应用在 React 之外，靠事件同步）
export function useThemeId() {
  return useSyncExternalStore(subscribeTheme, snapshotThemeId, snapshotThemeId)
}
