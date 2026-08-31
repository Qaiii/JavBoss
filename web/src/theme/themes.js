import { useSyncExternalStore } from 'react'
import { zh } from '@/utils/i18n'

export const CUSTOM_THEME_ID = 'custom'
export const DEFAULT_THEME_ID = 'light'
export const DEFAULT_DARK_THEME_ID = 'navy'

export const THEMES = [
  { id: 'light', label: zh('浅色', 'Light'), dark: false, chrome: '#f9fafb', preview: ['#f9fafb', '#ffffff', '#2563eb'] },
  { id: 'navy', label: zh('墨蓝', 'Midnight Blue'), dark: true, chrome: '#0f131c', preview: ['#0f131c', '#161c2b', '#3b82f6'] },
  { id: 'coffee', label: zh('暖棕', 'Warm Coffee'), dark: true, chrome: '#161008', preview: ['#161008', '#1e170e', '#d97706'] },
  { id: 'teal', label: zh('青碧', 'Teal'), dark: true, chrome: '#0d1513', preview: ['#0d1513', '#121d1a', '#0d9488'] },
  // 自定义：dark / chrome / preview 为占位，实际由基础主题与用户自定义色决定
  { id: CUSTOM_THEME_ID, label: zh('自定义', 'Custom'), dark: true, chrome: '#0f131c', preview: ['#0f131c', '#161c2b', '#3b82f6'] },
]

// 自定义配色可编辑字段（key 对应存储 / 草稿，var 对应 CSS 变量，convert 决定 hex 与变量值的转换）
export const CUSTOM_COLOR_FIELDS = [
  { key: 'primary', var: '--c-primary', convert: 'hex', label: { zh: '主色', en: 'Primary' } },
  { key: 'bgPage', var: '--c-bg-page', convert: 'hex', label: { zh: '页面背景', en: 'Page background' } },
  { key: 'bgSurface', var: '--c-bg-surface-rgb', convert: 'triplet', label: { zh: '面板背景', en: 'Surface' } },
  { key: 'text', var: '--c-text', convert: 'hex', label: { zh: '文字', en: 'Text' } },
  { key: 'border', var: '--c-border-soft', convert: 'hex', label: { zh: '边框', en: 'Border' } },
  { key: 'success', var: '--c-success', convert: 'hex', label: { zh: '成功色', en: 'Success' } },
  { key: 'warning', var: '--c-warning', convert: 'hex', label: { zh: '警告色', en: 'Warning' } },
  { key: 'error', var: '--c-error', convert: 'hex', label: { zh: '错误色', en: 'Error' } },
]

const STORAGE_KEY = 'javboss.theme'
const CUSTOM_STORAGE_KEY = 'javboss.theme.custom'
const THEME_CHANGE_EVENT = 'javboss:themechange'

export const getTheme = (id) => THEMES.find((theme) => theme.id === id) || null

export const isDarkThemeId = (id) => {
  if (id === CUSTOM_THEME_ID) {
    const base = readCustomTheme()?.base || DEFAULT_DARK_THEME_ID
    return Boolean(getTheme(base)?.dark)
  }
  return Boolean(getTheme(id)?.dark)
}

export const normalizeThemeId = (value, fallback = DEFAULT_THEME_ID) =>
  getTheme(value) ? value : fallback

// ---------------- 自定义配色存储 ----------------
export function readCustomTheme() {
  try {
    const raw = window.localStorage.getItem(CUSTOM_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const base = normalizeThemeId(parsed?.base, DEFAULT_DARK_THEME_ID)
    const colors = {}
    for (const field of CUSTOM_COLOR_FIELDS) {
      if (typeof parsed?.colors?.[field.key] === 'string') {
        colors[field.key] = parsed.colors[field.key]
      }
    }
    return { base, colors }
  } catch {
    return null
  }
}

export function saveCustomTheme({ base, colors }) {
  const payload = {
    base: normalizeThemeId(base, DEFAULT_DARK_THEME_ID),
    colors: { ...colors },
  }
  try {
    window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // 忽略存储失败（如隐私模式）
  }
  return payload
}

// ---------------- 颜色值转换 ----------------
export const hexToTriplet = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

export const tripletToHex = (triplet) => {
  const m = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(String(triplet || '').trim())
  if (!m) return ''
  const to = (v) =>
    Math.max(0, Math.min(255, Number(v)))
      .toString(16)
      .padStart(2, '0')
  return `#${to(m[1])}${to(m[2])}${to(m[3])}`
}

const toVarValue = (field, hex) => (field.convert === 'triplet' ? hexToTriplet(hex) : hex)

// 读取 <html> 当前应用的变量值（用于编辑器默认草稿）
export function readThemeColorVar(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
}

// 把自定义颜色写入 <html> 内联样式（优先级高于主题块）；传入空对象则清除所有覆盖
export function applyCustomColorOverrides(colors) {
  const root = document.documentElement
  for (const field of CUSTOM_COLOR_FIELDS) {
    const hex = colors?.[field.key]
    if (!hex) {
      root.style.removeProperty(field.var)
      continue
    }
    const value = toVarValue(field, hex)
    if (value) root.style.setProperty(field.var, value)
  }
}

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

// 把主题应用到 <html>。previewOverrides 供编辑器实时预览（{ fieldKey: hex }），
// 正式应用时从存储读取。
export function applyTheme(id, previewOverrides) {
  const theme = getTheme(normalizeThemeId(id))
  if (!theme) return
  const root = document.documentElement
  const meta = document.querySelector('meta[name="theme-color"]')

  if (theme.id === CUSTOM_THEME_ID) {
    const custom = readCustomTheme()
    const base = getTheme(custom?.base) || getTheme(DEFAULT_DARK_THEME_ID)
    root.classList.toggle('theme-dark', Boolean(base.dark))
    root.dataset.theme = base.id
    root.dataset.customTheme = '1'
    if (meta) meta.setAttribute('content', base.chrome)
    applyCustomColorOverrides(previewOverrides || custom?.colors)
    return theme
  }

  delete root.dataset.customTheme
  applyCustomColorOverrides(null)
  if (theme.dark) {
    root.classList.add('theme-dark')
    root.dataset.theme = theme.id
  } else {
    root.classList.remove('theme-dark')
    root.dataset.theme = 'light'
  }
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

// 浅色 ↔ 上次使用的暗色主题（自定义主题视为暗色）
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
  const root = document.documentElement
  if (root.dataset.customTheme) return CUSTOM_THEME_ID
  return normalizeThemeId(root.dataset.theme || DEFAULT_THEME_ID)
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
