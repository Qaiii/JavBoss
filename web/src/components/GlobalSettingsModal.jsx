import { useEffect, useState } from 'react'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'

import DirectoryManager from '@/components/DirectoryManager'
import AppModal from '@/components/AppModal'
import PlayerSettingsModal from '@/components/PlayerSettingsModal'
import WebHotkeySettings from '@/components/WebHotkeySettings'
import {
  downloadFFmpeg,
  fetchJavScrapeCheck,
  fetchJavScrapeStatus,
  fetchScrapedDataCleanup,
  fetchTools,
  runJavScrapeCheck,
  runScrapedDataCleanup,
} from '@/api'
import { parsePlayerHotkeys } from '@/utils/playerHotkeys'
import { zh } from '@/utils/i18n'
import { getErrorMessage } from '@/utils/errors'
import { javScrapeCheckFieldCounts, javScrapeCheckHasPending } from '@/utils/javScrapeCheck'
import {
  formatScrapeIntervalMs,
  javScrapeDataLabels,
  javScrapePendingTotal,
  javScrapeQueues,
  javScrapeSourceName,
} from '@/utils/javScrapeStatus'
import { scrapedDataCleanupCounts, scrapedDataCleanupTotal } from '@/utils/scrapedDataCleanup'

const SETTINGS_SECTIONS = [
  {
    id: 'directories',
    title: { zh: '目录管理', en: 'Directory Management' },
    summary: { zh: '管理扫描目录与路径', en: 'Manage watched folders and paths' },
  },
  {
    id: 'display',
    title: { zh: '显示与交互', en: 'Display & Interaction' },
    summary: { zh: '界面提示与交互行为', en: 'Interface hints and interactions' },
  },
  {
    id: 'shortcuts',
    title: { zh: '快捷键', en: 'Shortcuts' },
    summary: { zh: '自定义网页操作快捷键', en: 'Customize web shortcuts' },
  },
  {
    id: 'network',
    title: { zh: '网络与代理', en: 'Network & Proxy' },
    summary: { zh: '网络连接与代理设置', en: 'Network connection and proxy settings' },
  },
  {
    id: 'scrape',
    title: { zh: '信息抓取', en: 'Scraping' },
    summary: { zh: '抓取来源、间隔与待处理队列', en: 'Sources, intervals, and pending queues' },
  },
  {
    id: 'tools',
    title: { zh: '工具', en: 'Tools' },
    summary: {
      zh: '下载运行工具，检查 JAV 抓取情况，并清理未使用的抓取数据',
      en: 'Manage runtime tools, JAV scrape completeness, and unused scraped data',
    },
  },
  {
    id: 'player',
    title: { zh: '播放器', en: 'Player' },
    summary: { zh: '播放器快捷键与播放控制', en: 'Player shortcuts and playback controls' },
  },
  {
    id: 'security',
    title: { zh: '安全', en: 'Security' },
    summary: { zh: '修改密码与退出登录', en: 'Password and sign-out' },
  },
]

const PLAYER_BASIC_DEFAULTS = {
  windowWidth: 80,
  windowHeight: 80,
  ontop: false,
  reuseWindow: true,
  resumePlayback: true,
  volume: 70,
  showHotkeyHint: true,
}

const BROWSER_PLAYER_DEFAULTS = {
  showHotkeyHint: true,
}

const DEFAULT_PROXY_HOST = '127.0.0.1'

export default function GlobalSettingsModal({
  open,
  onClose,
  initialSection = '',
  directories,
  browserPlaybackOnly = false,
  desktopIntegrationEnabled = true,
  containerMode = false,
  directoryPickerEnabled = true,
  hostPathPrefixEnabled = false,
  hostAgentConfigured = false,
  serverOS = '',
  mpvEnabled = true,
  onCreateDirectory,
  onUpdateDirectory,
  onDeleteDirectory,
  onProcessDirectory,
  onScanDirectory,
  onRefreshDirectories,
  proxyHost,
  proxyPort,
  onSaveProxySettings,
  allowLANAccess = false,
  onSaveAllowLANAccess,
  defaultPlayer,
  onSaveDefaultPlayer,
  initialViewMode,
  onSaveInitialViewMode,
  playerWindowWidth,
  playerWindowHeight,
  playerOntop,
  playerReuseWindow,
  playerResumePlayback,
  playerVolume,
  playerShowHotkeyHint,
  onSavePlayerBasicSettings,
  browserPlayerShowHotkeyHint,
  onSaveBrowserPlayerSettings,
  playerHotkeys,
  onSavePlayerHotkeys,
  webHotkeys,
  onSaveWebHotkeys,
  onChangePassword,
  onLogout,
}) {
  const [proxyHostInput, setProxyHostInput] = useState('')
  const [proxyInput, setProxyInput] = useState('')
  const [proxyError, setProxyError] = useState('')
  const [savingProxy, setSavingProxy] = useState(false)
  const [proxyEditing, setProxyEditing] = useState(false)
  const [proxyEnabledInput, setProxyEnabledInput] = useState(false)
  const [allowLANAccessInput, setAllowLANAccessInput] = useState(false)
  const [allowLANAccessError, setAllowLANAccessError] = useState('')
  const [savingAllowLANAccess, setSavingAllowLANAccess] = useState(false)
  const [activeSection, setActiveSection] = useState('directories')
  const [defaultPlayerInput, setDefaultPlayerInput] = useState('mpv')
  const [defaultPlayerError, setDefaultPlayerError] = useState('')
  const [savingDefaultPlayer, setSavingDefaultPlayer] = useState(false)
  const [initialViewModeInput, setInitialViewModeInput] = useState('video')
  const [initialViewModeError, setInitialViewModeError] = useState('')
  const [savingInitialViewMode, setSavingInitialViewMode] = useState(false)
  const [playerTab, setPlayerTab] = useState('basic')
  const [playerBasicError, setPlayerBasicError] = useState('')
  const [playerBasicSuccess, setPlayerBasicSuccess] = useState('')
  const [savingPlayerBasic, setSavingPlayerBasic] = useState(false)
  const [playerWindowWidthInput, setPlayerWindowWidthInput] = useState('')
  const [playerWindowHeightInput, setPlayerWindowHeightInput] = useState('')
  const [playerOntopInput, setPlayerOntopInput] = useState(false)
  const [playerReuseWindowInput, setPlayerReuseWindowInput] = useState(true)
  const [playerResumePlaybackInput, setPlayerResumePlaybackInput] = useState(true)
  const [playerVolumeInput, setPlayerVolumeInput] = useState('')
  const [playerShowHotkeyHintInput, setPlayerShowHotkeyHintInput] = useState(true)
  const [browserPlayerShowHotkeyHintInput, setBrowserPlayerShowHotkeyHintInput] = useState(true)
  const [browserPlayerError, setBrowserPlayerError] = useState('')
  const [browserPlayerSuccess, setBrowserPlayerSuccess] = useState('')
  const [savingBrowserPlayer, setSavingBrowserPlayer] = useState(false)
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [visiblePasswords, setVisiblePasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  })
  const [passwordError, setPasswordError] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [ffmpegStatus, setFFmpegStatus] = useState(null)
  const [toolsLoading, setToolsLoading] = useState(false)
  const [toolsError, setToolsError] = useState('')
  const [startingFFmpegDownload, setStartingFFmpegDownload] = useState(false)
  const [javScrapeCheck, setJavScrapeCheck] = useState(null)
  const [javScrapeCheckLoading, setJavScrapeCheckLoading] = useState(false)
  const [javScrapeCheckError, setJavScrapeCheckError] = useState('')
  const [scrapedDataCleanup, setScrapedDataCleanup] = useState(null)
  const [scrapedDataCleanupLoading, setScrapedDataCleanupLoading] = useState(false)
  const [scrapedDataCleanupError, setScrapedDataCleanupError] = useState('')
  const [scrapedDataJustCleaned, setScrapedDataJustCleaned] = useState(false)
  const [javScrapeStatus, setJavScrapeStatus] = useState(null)
  const [javScrapeStatusError, setJavScrapeStatusError] = useState('')

  const normalizedPlayerHotkeys = parsePlayerHotkeys(playerHotkeys)
  const ffmpegInstalledLabel =
    ffmpegStatus?.source === 'builtin'
      ? zh('已内置', 'Built in')
      : ffmpegStatus?.source === 'system'
        ? zh('系统可用', 'Available on system')
        : zh('已安装', 'Installed')

  const resetPlayerBasicInputs = () => {
    setPlayerWindowWidthInput(String(PLAYER_BASIC_DEFAULTS.windowWidth))
    setPlayerWindowHeightInput(String(PLAYER_BASIC_DEFAULTS.windowHeight))
    setPlayerOntopInput(PLAYER_BASIC_DEFAULTS.ontop)
    setPlayerReuseWindowInput(PLAYER_BASIC_DEFAULTS.reuseWindow)
    setPlayerResumePlaybackInput(PLAYER_BASIC_DEFAULTS.resumePlayback)
    setPlayerVolumeInput(String(PLAYER_BASIC_DEFAULTS.volume))
    setPlayerShowHotkeyHintInput(PLAYER_BASIC_DEFAULTS.showHotkeyHint)
    setPlayerBasicError('')
    setPlayerBasicSuccess('')
  }

  useEffect(() => {
    if (open) {
      if (SETTINGS_SECTIONS.some((section) => section.id === initialSection)) {
        setActiveSection(initialSection)
      }
      setPlayerTab('basic')
      setPlayerBasicError('')
      setPlayerBasicSuccess('')
      setBrowserPlayerError('')
      setBrowserPlayerSuccess('')
    }
  }, [initialSection, open])

  useEffect(() => {
    if (open) {
      setProxyHostInput(proxyHost || DEFAULT_PROXY_HOST)
      setProxyInput(proxyPort ? String(proxyPort) : '')
      setProxyEnabledInput(Boolean(proxyPort))
      setProxyEditing(false)
      setProxyError('')
      setAllowLANAccessInput(allowLANAccess === true)
      setAllowLANAccessError('')
      setDefaultPlayerInput(
        defaultPlayer === 'browser' || (defaultPlayer === 'system' && desktopIntegrationEnabled)
          ? defaultPlayer
          : mpvEnabled
            ? 'mpv'
            : 'browser'
      )
      setDefaultPlayerError('')
      setInitialViewModeInput(initialViewMode === 'jav' ? 'jav' : 'video')
      setInitialViewModeError('')
      setPlayerWindowWidthInput(String(playerWindowWidth ?? PLAYER_BASIC_DEFAULTS.windowWidth))
      setPlayerWindowHeightInput(String(playerWindowHeight ?? PLAYER_BASIC_DEFAULTS.windowHeight))
      setPlayerOntopInput(playerOntop ?? PLAYER_BASIC_DEFAULTS.ontop)
      setPlayerReuseWindowInput(playerReuseWindow ?? PLAYER_BASIC_DEFAULTS.reuseWindow)
      setPlayerResumePlaybackInput(playerResumePlayback ?? PLAYER_BASIC_DEFAULTS.resumePlayback)
      setPlayerVolumeInput(String(playerVolume ?? PLAYER_BASIC_DEFAULTS.volume))
      setPlayerShowHotkeyHintInput(playerShowHotkeyHint ?? PLAYER_BASIC_DEFAULTS.showHotkeyHint)
      setBrowserPlayerShowHotkeyHintInput(
        browserPlayerShowHotkeyHint ?? BROWSER_PLAYER_DEFAULTS.showHotkeyHint
      )
      setPasswordDialogOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setVisiblePasswords({ current: false, new: false, confirm: false })
      setPasswordError('')
    }
  }, [
    open,
    proxyHost,
    proxyPort,
    allowLANAccess,
    defaultPlayer,
    initialViewMode,
    playerWindowWidth,
    playerWindowHeight,
    playerOntop,
    playerReuseWindow,
    playerResumePlayback,
    playerVolume,
    playerShowHotkeyHint,
    browserPlayerShowHotkeyHint,
    mpvEnabled,
    browserPlaybackOnly,
    desktopIntegrationEnabled,
  ])

  useEffect(() => {
    if (!open || activeSection !== 'tools') return undefined
    let cancelled = false
    setToolsLoading(true)
    setToolsError('')
    fetchTools()
      .then((tools) => {
        if (!cancelled) setFFmpegStatus(tools?.ffmpeg || null)
      })
      .catch((err) => {
        if (!cancelled) setToolsError(getErrorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setToolsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, activeSection])

  useEffect(() => {
    if (!open || activeSection !== 'tools' || !ffmpegStatus?.downloading) return undefined
    let cancelled = false
    const timer = window.setInterval(() => {
      fetchTools()
        .then((tools) => {
          if (!cancelled) setFFmpegStatus(tools?.ffmpeg || null)
        })
        .catch((err) => {
          if (!cancelled) setToolsError(getErrorMessage(err))
        })
    }, 750)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open, activeSection, ffmpegStatus?.downloading])

  useEffect(() => {
    if (!open || activeSection !== 'tools') return undefined
    let cancelled = false
    fetchJavScrapeCheck()
      .then((report) => {
        if (!cancelled) setJavScrapeCheck(report)
      })
      .catch(() => {
        if (!cancelled) setJavScrapeCheck(null)
      })
    return () => {
      cancelled = true
    }
  }, [open, activeSection])

  useEffect(() => {
    if (!open || activeSection !== 'tools') return undefined
    let cancelled = false
    fetchScrapedDataCleanup()
      .then((report) => {
        if (!cancelled) {
          setScrapedDataCleanup(report)
          setScrapedDataJustCleaned(false)
        }
      })
      .catch(() => {
        if (!cancelled) setScrapedDataCleanup(null)
      })
    return () => {
      cancelled = true
    }
  }, [open, activeSection])

  useEffect(() => {
    if (!open || activeSection !== 'tools' || !javScrapeCheckHasPending(javScrapeCheck)) {
      return undefined
    }
    let cancelled = false
    const timer = window.setInterval(() => {
      fetchJavScrapeCheck()
        .then((report) => {
          if (!cancelled) setJavScrapeCheck(report)
        })
        .catch((err) => {
          if (!cancelled) setJavScrapeCheckError(getErrorMessage(err))
        })
    }, 2000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open, activeSection, javScrapeCheck])

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    const loadStatus = () => {
      fetchJavScrapeStatus()
        .then((status) => {
          if (!cancelled) {
            setJavScrapeStatus(status)
            setJavScrapeStatusError('')
          }
        })
        .catch((err) => {
          if (!cancelled) setJavScrapeStatusError(getErrorMessage(err))
        })
    }
    loadStatus()
    const timer = window.setInterval(loadStatus, 3000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open])

  // Close the whole settings modal with Esc, unless a nested dialog is open.
  useEffect(() => {
    if (!open || passwordDialogOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, passwordDialogOpen, onClose])

  // Esc closes the change-password dialog on its own first.
  useEffect(() => {
    if (!open || !passwordDialogOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || savingPassword) return
      setPasswordDialogOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setVisiblePasswords({ current: false, new: false, confirm: false })
      setPasswordError('')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, passwordDialogOpen, savingPassword])

  if (!open) return null

  const handleSaveProxy = async () => {
    setProxyError('')
    const host = proxyHostInput.trim()
    const raw = proxyInput.trim()
    let port = 0
    let nextHost = ''
    if (proxyEnabledInput) {
      if (host === '') {
        setProxyError(zh('请输入代理 IP 或主机名', 'Enter a proxy IP or host'))
        return
      }
      if (raw === '') {
        setProxyError(zh('请输入 1-65535 的端口号', 'Enter a port between 1 and 65535'))
        return
      }
      const parsed = /^\d+$/.test(raw) ? Number(raw) : NaN
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
        setProxyError(zh('请输入 1-65535 的端口号', 'Enter a port between 1 and 65535'))
        return
      }
      port = parsed
      nextHost = host
    }
    setSavingProxy(true)
    try {
      await onSaveProxySettings?.({ host: nextHost, port })
      setProxyEditing(false)
    } catch (err) {
      setProxyError(getErrorMessage(err))
    } finally {
      setSavingProxy(false)
    }
  }

  const currentProxyHost = proxyHost || DEFAULT_PROXY_HOST
  const proxyHostInputTrimmed = proxyHostInput.trim()
  const proxyInputTrimmed = proxyInput.trim()
  const desiredHostText = proxyEnabledInput ? proxyHostInputTrimmed : ''
  const desiredPortText = proxyEnabledInput ? proxyInputTrimmed : ''
  const currentHostText = proxyPort ? currentProxyHost : ''
  const currentPortText = proxyPort ? String(proxyPort) : ''
  const proxyUnchanged = desiredHostText === currentHostText && desiredPortText === currentPortText
  const proxyHostMissing = proxyEnabledInput && proxyHostInputTrimmed === ''
  const proxyInputMissing = proxyEnabledInput && proxyInputTrimmed === ''
  const visibleSections = SETTINGS_SECTIONS
  const currentSection = visibleSections.some((section) => section.id === activeSection)
    ? activeSection
    : 'directories'
  const activeTitle = visibleSections.find((item) => item.id === currentSection)?.title || {
    zh: '全局设置',
    en: 'Global Settings',
  }

  const handleSaveDefaultPlayer = async () => {
    const next =
      defaultPlayerInput === 'browser' ||
      (defaultPlayerInput === 'system' && desktopIntegrationEnabled)
        ? defaultPlayerInput
        : 'mpv'
    setDefaultPlayerError('')
    setSavingDefaultPlayer(true)
    try {
      await onSaveDefaultPlayer?.(next)
    } catch (err) {
      setDefaultPlayerError(getErrorMessage(err))
    } finally {
      setSavingDefaultPlayer(false)
    }
  }

  const handleSaveInitialViewMode = async () => {
    const next = initialViewModeInput === 'jav' ? 'jav' : 'video'
    setInitialViewModeError('')
    setSavingInitialViewMode(true)
    try {
      await onSaveInitialViewMode?.(next)
    } catch (err) {
      setInitialViewModeError(getErrorMessage(err))
    } finally {
      setSavingInitialViewMode(false)
    }
  }

  const renderDefaultPlayerSettings = () => {
    const currentDefaultPlayer =
      defaultPlayer === 'browser' || (defaultPlayer === 'system' && desktopIntegrationEnabled)
        ? defaultPlayer
        : 'mpv'
    const defaultPlayerUnchanged = defaultPlayerInput === currentDefaultPlayer

    return (
      <div className="space-y-4">
        {browserPlaybackOnly ? (
          <div>
            <h4 className="text-sm font-semibold text-app-text">
              {zh('默认播放器', 'Default Player')}
            </h4>
            <p className="mt-1 text-sm text-app-muted">
              {zh(
                '浏览器默认只能播放 MP4 格式视频，如果需要播放任意格式视频需前往“工具”中确认 FFmpeg 已安装。',
                'Browsers can only play MP4 videos by default. To play videos in any format, go to Tools and make sure FFmpeg is installed.'
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h4 className="text-sm font-semibold text-app-text">
                {zh('默认播放器', 'Default Player')}
              </h4>
              <span className="relative inline-block">
                <select
                  value={defaultPlayerInput}
                  onChange={(event) => {
                    const next = event.target.value
                    setDefaultPlayerInput(
                      next === 'browser' || (next === 'system' && desktopIntegrationEnabled)
                        ? next
                        : 'mpv'
                    )
                    setDefaultPlayerError('')
                  }}
                  className="w-auto appearance-none rounded-xl border border-app-border bg-app-surface py-1.5 pl-3 pr-7 text-sm text-app-text outline-none focus:border-app-border focus:outline-none focus:ring-0 focus-visible:outline-none"
                >
                  {mpvEnabled ? <option value="mpv">MPV</option> : null}
                  <option value="browser">{zh('浏览器', 'Browser')}</option>
                  {desktopIntegrationEnabled ? (
                    <option value="system">{zh('系统', 'System')}</option>
                  ) : null}
                </select>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-4 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rotate-45 border-b border-r border-app-muted"
                />
              </span>
            </div>
            {defaultPlayerInput === 'browser' ? (
              <p className="mt-1 text-sm text-app-muted">
                {zh(
                  '浏览器默认只能播放 MP4 格式视频，如果需要播放任意格式视频需前往“工具”中确认 FFmpeg 已安装。',
                  'Browsers can only play MP4 videos by default. To play videos in any format, go to Tools and make sure FFmpeg is installed.'
                )}
              </p>
            ) : null}
            {containerMode && hostAgentConfigured ? (
              <p className="mt-1 text-sm text-app-muted">
                {zh(
                  '选择“系统”将通过宿主机代理在部署主机上调用系统播放器打开视频。',
                  'Choosing “System” opens the video with the host machine’s default player via the host agent.'
                )}
              </p>
            ) : null}
          </>
        )}

        {defaultPlayerError && <div className="text-sm text-red-600">{defaultPlayerError}</div>}

        {!browserPlaybackOnly ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveDefaultPlayer}
              disabled={savingDefaultPlayer || defaultPlayerUnchanged}
              className="rounded-xl bg-app-gold px-3 py-1.5 text-sm text-white disabled:opacity-60"
            >
              {savingDefaultPlayer ? zh('保存中…', 'Saving...') : zh('保存', 'Save')}
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  const renderProxyPanel = () => (
    <section className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-app-text">
              {zh('代理地址', 'Proxy Address')}
            </h4>
            <p className="mt-1 text-sm text-app-muted">
              {proxyPort
                ? zh(
                    `当前使用 ${currentProxyHost}:${proxyPort}`,
                    `Currently using ${currentProxyHost}:${proxyPort}`
                  )
                : zh('当前使用自动检测', 'Currently using auto-detection')}
            </p>
          </div>
          {!proxyEditing && (
            <button
              type="button"
              onClick={() => {
                setProxyEditing(true)
                setProxyError('')
              }}
              className="rounded-xl border border-app-border bg-app-surface px-3 py-1.5 text-sm text-app-text hover:bg-app-surface-2"
            >
              {zh('编辑', 'Edit')}
            </button>
          )}
        </div>

        {proxyEditing ? (
          <div className="space-y-4 rounded-2xl bg-app-surface-2 p-4">
            <label className="flex items-center gap-2 text-sm text-app-text">
              <input
                type="checkbox"
                checked={proxyEnabledInput}
                onChange={(e) => {
                  setProxyEnabledInput(e.target.checked)
                  setProxyError('')
                }}
                className="h-4 w-4 rounded"
              />
              <span>{zh('手动设置代理', 'Set proxy manually')}</span>
            </label>

            {proxyEnabledInput && (
              <div className="grid max-w-2xl gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-app-muted">
                    {zh('代理IP', 'Proxy IP')}
                  </label>
                  <input
                    value={proxyHostInput}
                    onChange={(e) => setProxyHostInput(e.target.value)}
                    placeholder={DEFAULT_PROXY_HOST}
                    className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-app-muted">
                    {zh('端口号', 'Port')}
                  </label>
                  <input
                    value={proxyInput}
                    onChange={(e) => setProxyInput(e.target.value)}
                    placeholder={zh('输入 1-65535', 'Enter 1-65535')}
                    inputMode="numeric"
                    className="w-full rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            {proxyError && <div className="text-sm text-red-600">{proxyError}</div>}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setProxyHostInput(proxyHost || DEFAULT_PROXY_HOST)
                  setProxyInput(proxyPort ? String(proxyPort) : '')
                  setProxyEnabledInput(Boolean(proxyPort))
                  setProxyError('')
                  setProxyEditing(false)
                }}
                className="rounded-xl border border-app-border bg-app-surface px-3 py-1.5 text-sm text-app-text hover:bg-app-surface-2"
              >
                {zh('取消', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveProxy}
                disabled={savingProxy || proxyUnchanged || proxyHostMissing || proxyInputMissing}
                className="rounded-xl bg-app-gold px-3 py-1.5 text-sm text-white disabled:opacity-60"
              >
                {savingProxy ? zh('保存中…', 'Saving...') : zh('保存', 'Save')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )

  const renderLANAccessPanel = () => {
    if (containerMode) return null
    const unchanged = allowLANAccessInput === (allowLANAccess === true)

    const handleSave = async () => {
      setAllowLANAccessError('')
      setSavingAllowLANAccess(true)
      try {
        await onSaveAllowLANAccess?.(allowLANAccessInput)
      } catch (err) {
        setAllowLANAccessError(getErrorMessage(err))
      } finally {
        setSavingAllowLANAccess(false)
      }
    }

    return (
      <section className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-sm">
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-app-text">
              {zh('局域网访问', 'Local Network Access')}
            </h4>
            <p className="mt-1 text-sm text-app-muted">
              {zh(
                '开启后，局域网设备可以通过本机 IP 地址访问 JavBoss。修改将在下次启动时生效。',
                'When enabled, devices on your local network can access JavBoss through this computer’s IP address. Changes take effect after the next restart.'
              )}
            </p>
          </div>

          <label className="flex items-center gap-3 text-sm font-medium text-app-text">
            <input
              type="checkbox"
              checked={allowLANAccessInput}
              onChange={(event) => {
                setAllowLANAccessInput(event.target.checked)
                setAllowLANAccessError('')
              }}
              className="h-4 w-4 rounded"
            />
            <span>{zh('允许局域网设备访问', 'Allow access from local network devices')}</span>
          </label>

          {allowLANAccessError ? (
            <div className="text-sm text-red-600">{allowLANAccessError}</div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={savingAllowLANAccess || unchanged}
              className="rounded-xl bg-app-gold px-3 py-1.5 text-sm text-white disabled:opacity-60"
            >
              {savingAllowLANAccess ? zh('保存中…', 'Saving...') : zh('保存', 'Save')}
            </button>
          </div>
        </div>
      </section>
    )
  }

  const renderNetworkPanel = () => (
    <div className="space-y-5">
      {renderLANAccessPanel()}
      {renderProxyPanel()}
    </div>
  )

  const renderDisplayPanel = () => {
    const currentInitialViewMode = initialViewMode === 'jav' ? 'jav' : 'video'
    const initialViewModeUnchanged = initialViewModeInput === currentInitialViewMode

    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-sm">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h4 className="text-sm font-semibold text-app-text">
                {zh('初始页面', 'Initial Page')}
              </h4>
              <span className="relative inline-block">
                <select
                  value={initialViewModeInput}
                  onChange={(event) => {
                    setInitialViewModeInput(event.target.value === 'jav' ? 'jav' : 'video')
                    setInitialViewModeError('')
                  }}
                  className="w-auto appearance-none rounded-xl border border-app-border bg-app-surface py-1.5 pl-3 pr-7 text-sm text-app-text outline-none focus:border-app-border focus:outline-none focus:ring-0 focus-visible:outline-none"
                >
                  <option value="video">{zh('视频模式', 'Video Mode')}</option>
                  <option value="jav">{zh('JAV模式', 'JAV Mode')}</option>
                </select>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-4 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rotate-45 border-b border-r border-app-muted"
                />
              </span>
            </div>
            <p className="text-sm text-app-muted">
              {zh(
                '打开新页面，默认进入所选模式。',
                'When opening a new page, use the selected mode by default.'
              )}
            </p>

            {initialViewModeError && (
              <div className="text-sm text-red-600">{initialViewModeError}</div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveInitialViewMode}
                disabled={savingInitialViewMode || initialViewModeUnchanged}
                className="rounded-xl bg-app-gold px-3 py-1.5 text-sm text-white disabled:opacity-60"
              >
                {savingInitialViewMode ? zh('保存中…', 'Saving...') : zh('保存', 'Save')}
              </button>
            </div>
          </div>
        </section>
      </div>
    )
  }

  const renderPlayerPanel = () => {
    const showMPVSettings = mpvEnabled && !browserPlaybackOnly
    const currentPlayerTab =
      playerTab === 'hotkeys'
        ? 'hotkeys'
        : playerTab === 'browser'
          ? 'browser'
          : showMPVSettings && playerTab === 'mpv'
            ? 'mpv'
            : 'basic'

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPlayerTab('basic')}
            className={`rounded-xl px-3 py-1.5 text-sm ${
              currentPlayerTab === 'basic'
                ? 'bg-app-gold text-[#1a1208]'
                : 'border border-app-border bg-app-surface text-app-text hover:bg-app-surface-2'
            }`}
          >
            {zh('基础设置', 'Basic Settings')}
          </button>
          <button
            type="button"
            onClick={() => setPlayerTab('browser')}
            className={`rounded-xl px-3 py-1.5 text-sm ${
              currentPlayerTab === 'browser'
                ? 'bg-app-gold text-[#1a1208]'
                : 'border border-app-border bg-app-surface text-app-text hover:bg-app-surface-2'
            }`}
          >
            {zh('浏览器播放器', 'Browser Player')}
          </button>
          {showMPVSettings ? (
            <button
              type="button"
              onClick={() => setPlayerTab('mpv')}
              className={`rounded-xl px-3 py-1.5 text-sm ${
                currentPlayerTab === 'mpv'
                  ? 'bg-app-gold text-[#1a1208]'
                  : 'border border-app-border bg-app-surface text-app-text hover:bg-app-surface-2'
              }`}
            >
              {zh('MPV播放器', 'MPV Player')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setPlayerTab('hotkeys')}
            className={`rounded-xl px-3 py-1.5 text-sm ${
              currentPlayerTab === 'hotkeys'
                ? 'bg-app-gold text-[#1a1208]'
                : 'border border-app-border bg-app-surface text-app-text hover:bg-app-surface-2'
            }`}
          >
            {zh('快捷键', 'Shortcuts')}
          </button>
        </div>
        <section className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-sm">
          {currentPlayerTab === 'basic' ? (
            renderDefaultPlayerSettings()
          ) : currentPlayerTab === 'browser' ? (
            <div>
              <section className="space-y-3">
                <label className="flex items-center gap-3 text-sm font-semibold text-app-text">
                  <input
                    type="checkbox"
                    checked={browserPlayerShowHotkeyHintInput}
                    onChange={(e) => {
                      setBrowserPlayerShowHotkeyHintInput(e.target.checked)
                      setBrowserPlayerError('')
                      setBrowserPlayerSuccess('')
                    }}
                    className="h-4 w-4 rounded"
                  />
                  <span>{zh('启动时显示快捷键配置', 'Show Shortcuts on Startup')}</span>
                </label>
                <p className="text-xs text-app-muted">
                  {zh(
                    '在浏览器播放器打开视频时显示当前快捷键说明。',
                    'Show the current shortcut guide when the browser player opens a video.'
                  )}
                </p>
              </section>

              {browserPlayerError && (
                <div className="mt-3 text-sm text-red-600">{browserPlayerError}</div>
              )}
              {browserPlayerSuccess && (
                <div className="mt-3 text-sm text-emerald-600">{browserPlayerSuccess}</div>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBrowserPlayerShowHotkeyHintInput(BROWSER_PLAYER_DEFAULTS.showHotkeyHint)
                    setBrowserPlayerError('')
                    setBrowserPlayerSuccess('')
                  }}
                  disabled={savingBrowserPlayer}
                  className="rounded-xl border border-app-border bg-app-surface px-3 py-1.5 text-sm text-app-text hover:bg-app-surface-2 disabled:opacity-60"
                >
                  {zh('恢复默认', 'Restore Defaults')}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setBrowserPlayerError('')
                    setBrowserPlayerSuccess('')
                    setSavingBrowserPlayer(true)
                    try {
                      await onSaveBrowserPlayerSettings?.({
                        browser_player_show_hotkey_hint: browserPlayerShowHotkeyHintInput,
                      })
                      setBrowserPlayerSuccess(
                        zh('浏览器播放器设置保存成功', 'Browser player settings saved')
                      )
                    } catch (err) {
                      setBrowserPlayerError(getErrorMessage(err))
                    } finally {
                      setSavingBrowserPlayer(false)
                    }
                  }}
                  disabled={savingBrowserPlayer}
                  className="rounded-xl bg-app-gold px-3 py-1.5 text-sm text-white disabled:opacity-60"
                >
                  {savingBrowserPlayer ? zh('保存中…', 'Saving...') : zh('保存', 'Save')}
                </button>
              </div>
            </div>
          ) : currentPlayerTab === 'mpv' ? (
            <div>
              <div className="space-y-6">
                <section className="space-y-3">
                  <h4 className="text-sm font-semibold text-app-text">
                    {zh('初始窗口大小', 'Initial Window Size')}
                  </h4>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-xs font-medium text-app-muted">
                        <span className="shrink-0">{zh('宽度', 'Width')}</span>
                        <div className="flex items-center gap-2">
                          <input
                            value={playerWindowWidthInput}
                            onChange={(e) => {
                              setPlayerWindowWidthInput(e.target.value)
                              setPlayerBasicError('')
                              setPlayerBasicSuccess('')
                            }}
                            inputMode="numeric"
                            className="w-28 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text"
                          />
                          <span className="text-sm text-app-muted">%</span>
                        </div>
                      </label>

                      <label className="flex items-center gap-2 text-xs font-medium text-app-muted">
                        <span className="shrink-0">{zh('高度', 'Height')}</span>
                        <div className="flex items-center gap-2">
                          <input
                            value={playerWindowHeightInput}
                            onChange={(e) => {
                              setPlayerWindowHeightInput(e.target.value)
                              setPlayerBasicError('')
                              setPlayerBasicSuccess('')
                            }}
                            inputMode="numeric"
                            className="w-28 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text"
                          />
                          <span className="text-sm text-app-muted">%</span>
                        </div>
                      </label>
                    </div>

                    <p className="text-xs text-app-muted">
                      {zh(
                        '设置 mpv 启动时的宽高占据屏幕宽高的比例。',
                        'Set the percentage of screen width and height used by the mpv window on startup.'
                      )}
                    </p>
                  </div>
                </section>

                <section className="space-y-3 border-t border-app-border pt-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <h4 className="text-sm font-semibold text-app-text">
                      {zh('初始音量', 'Initial Volume')}
                    </h4>
                    <div className="flex items-center gap-2">
                      <input
                        value={playerVolumeInput}
                        onChange={(e) => {
                          setPlayerVolumeInput(e.target.value)
                          setPlayerBasicError('')
                          setPlayerBasicSuccess('')
                        }}
                        inputMode="numeric"
                        className="w-28 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text"
                      />
                      <span className="text-sm text-app-muted">%</span>
                    </div>
                  </div>
                  <p className="text-xs text-app-muted">
                    {zh(
                      '控制 mpv 启动时的默认音量，范围 0-130。',
                      'Controls the default mpv startup volume, range 0-130.'
                    )}
                  </p>
                </section>

                <section className="space-y-3 border-t border-app-border pt-5">
                  <label className="flex items-center gap-3 text-sm font-semibold text-app-text">
                    <input
                      type="checkbox"
                      checked={playerOntopInput}
                      onChange={(e) => {
                        setPlayerOntopInput(e.target.checked)
                        setPlayerBasicError('')
                        setPlayerBasicSuccess('')
                      }}
                      className="h-4 w-4 rounded"
                    />
                    <span>{zh('播放器强行置顶', 'Keep Player On Top')}</span>
                  </label>
                  <p className="text-xs text-app-muted">
                    {zh(
                      '开启后，mpv 播放器窗口会保持置顶。',
                      'When enabled, the mpv player window stays on top.'
                    )}
                  </p>
                </section>

                <section className="space-y-3 border-t border-app-border pt-5">
                  <label className="flex items-center gap-3 text-sm font-semibold text-app-text">
                    <input
                      type="checkbox"
                      checked={playerReuseWindowInput}
                      onChange={(e) => {
                        setPlayerReuseWindowInput(e.target.checked)
                        setPlayerBasicError('')
                        setPlayerBasicSuccess('')
                      }}
                      className="h-4 w-4 rounded"
                    />
                    <span>
                      {zh(
                        '播放新视频时复用当前播放器窗口',
                        'Reuse Current Player Window When Playing a New Video'
                      )}
                    </span>
                  </label>
                  <p className="text-xs text-app-muted">
                    {zh(
                      '关闭后，每次播放都会启动新的 mpv 播放器窗口。',
                      'When disabled, each playback starts a new mpv player window.'
                    )}
                  </p>
                </section>

                <section className="space-y-3 border-t border-app-border pt-5">
                  <label className="flex items-center gap-3 text-sm font-semibold text-app-text">
                    <input
                      type="checkbox"
                      checked={playerResumePlaybackInput}
                      onChange={(e) => {
                        setPlayerResumePlaybackInput(e.target.checked)
                        setPlayerBasicError('')
                        setPlayerBasicSuccess('')
                      }}
                      className="h-4 w-4 rounded"
                    />
                    <span>{zh('从上次结束位置播放', 'Resume From Last Position')}</span>
                  </label>
                  <p className="text-xs text-app-muted">
                    {zh(
                      'mpv 会记住每个视频的播放位置，下次播放同一文件时自动恢复。',
                      'mpv remembers each video position and resumes the same file automatically.'
                    )}
                  </p>
                </section>

                <section className="space-y-3 border-t border-app-border pt-5">
                  <label className="flex items-center gap-3 text-sm font-semibold text-app-text">
                    <input
                      type="checkbox"
                      checked={playerShowHotkeyHintInput}
                      onChange={(e) => {
                        setPlayerShowHotkeyHintInput(e.target.checked)
                        setPlayerBasicError('')
                        setPlayerBasicSuccess('')
                      }}
                      className="h-4 w-4 rounded"
                    />
                    <span>{zh('启动时显示快捷键配置', 'Show Shortcuts on Startup')}</span>
                  </label>
                  <p className="text-xs text-app-muted">
                    {zh(
                      '在 mpv 打开视频时显示当前快捷键说明。',
                      'Show the current shortcut guide when mpv opens a video.'
                    )}
                  </p>
                </section>
              </div>

              {playerBasicError && (
                <div className="mt-3 text-sm text-red-600">{playerBasicError}</div>
              )}
              {playerBasicSuccess && (
                <div className="mt-3 text-sm text-emerald-600">{playerBasicSuccess}</div>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetPlayerBasicInputs}
                  disabled={savingPlayerBasic}
                  className="rounded-xl border border-app-border bg-app-surface px-3 py-1.5 text-sm text-app-text hover:bg-app-surface-2 disabled:opacity-60"
                >
                  {zh('恢复默认', 'Restore Defaults')}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setPlayerBasicError('')
                    setPlayerBasicSuccess('')
                    const width = Number.parseInt(playerWindowWidthInput, 10)
                    const height = Number.parseInt(playerWindowHeightInput, 10)
                    const volume = Number.parseInt(playerVolumeInput, 10)
                    if (!Number.isFinite(width) || width < 10 || width > 100) {
                      setPlayerBasicError(
                        zh('初始宽度请输入 10-100', 'Initial width must be between 10 and 100')
                      )
                      return
                    }
                    if (!Number.isFinite(height) || height < 10 || height > 100) {
                      setPlayerBasicError(
                        zh('初始高度请输入 10-100', 'Initial height must be between 10 and 100')
                      )
                      return
                    }
                    if (!Number.isFinite(volume) || volume < 0 || volume > 130) {
                      setPlayerBasicError(
                        zh('初始音量请输入 0-130', 'Initial volume must be between 0 and 130')
                      )
                      return
                    }

                    setSavingPlayerBasic(true)
                    try {
                      await onSavePlayerBasicSettings?.({
                        player_window_width: width,
                        player_window_height: height,
                        player_ontop: playerOntopInput,
                        player_reuse_window: playerReuseWindowInput,
                        player_resume_playback: playerResumePlaybackInput,
                        player_volume: volume,
                        player_show_hotkey_hint: playerShowHotkeyHintInput,
                      })
                      setPlayerBasicSuccess(
                        zh('MPV播放器设置保存成功', 'MPV player settings saved')
                      )
                    } catch (err) {
                      setPlayerBasicError(getErrorMessage(err))
                    } finally {
                      setSavingPlayerBasic(false)
                    }
                  }}
                  disabled={savingPlayerBasic}
                  className="rounded-xl bg-app-gold px-3 py-1.5 text-sm text-white disabled:opacity-60"
                >
                  {savingPlayerBasic ? zh('保存中…', 'Saving...') : zh('保存', 'Save')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-app-text">{zh('快捷键', 'Shortcuts')}</h4>
                <p className="mt-1 text-xs text-app-muted">
                  {zh(
                    '正数表示增加，负数表示减少。`Space` 和 `Escape` 仍固定用于播放/暂停和关闭播放器。',
                    'Positive numbers increase, negative numbers decrease. `Space` and `Escape` remain reserved for play/pause and close.'
                  )}
                </p>
              </div>
              <PlayerSettingsModal hotkeys={normalizedPlayerHotkeys} onSave={onSavePlayerHotkeys} />
            </>
          )}
        </section>
      </div>
    )
  }

  const renderShortcutsPanel = () => (
    <div className="space-y-5">
      <WebHotkeySettings hotkeys={webHotkeys} onSave={onSaveWebHotkeys} />
    </div>
  )

  const renderDirectoriesPanel = () => (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-app-muted">
        <InfoOutlinedIcon fontSize="inherit" className="text-[15px]" aria-hidden="true" />
        {zh(
          '添加本地视频目录让 JavBoss 接管，所有内容将自动为您呈现。',
          'No directories yet. Added folders will be scanned automatically.'
        )}
      </div>
      <section className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-sm">
        <DirectoryManager
          open={open}
          directories={directories}
          onCreate={onCreateDirectory}
          onUpdate={onUpdateDirectory}
          onDelete={onDeleteDirectory}
          onProcess={onProcessDirectory}
          onScan={onScanDirectory}
          onRefresh={onRefreshDirectories}
          directoryPickerEnabled={directoryPickerEnabled}
          useHostPaths={hostPathPrefixEnabled}
          serverOS={serverOS}
        />
      </section>
    </div>
  )

  const renderScrapePanel = () => {
    const queues = javScrapeQueues(javScrapeStatus)
    const sources = Array.isArray(javScrapeStatus?.sources) ? javScrapeStatus.sources : []
    const pendingTotal = javScrapePendingTotal(javScrapeStatus)
    const formatInterval = (ms) => {
      const { value, unit } = formatScrapeIntervalMs(ms)
      if (unit === 'minute') return zh(`${value} 分钟`, `${value} min`)
      if (unit === 'second') return zh(`${value} 秒`, `${value}s`)
      return zh(`${value} 毫秒`, `${value}ms`)
    }

    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold text-app-text">
                {zh('待抓取队列', 'Pending queues')}
              </h4>
              <p className="mt-2 max-w-2xl text-sm text-app-muted">
                {zh(
                  '后台正在排队处理的封面、元数据和女优作品数量。请求会按站点间隔慢慢发出，避免触发反爬。',
                  'Cover, metadata, and idol-work jobs waiting in the background. Requests are spaced per site to avoid anti-bot blocks.'
                )}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                pendingTotal > 0 ? 'bg-app-gold-soft text-app-gold' : 'bg-app-bg text-app-muted'
              }`}
            >
              {zh(`合计 ${pendingTotal}`, `Total ${pendingTotal}`)}
            </span>
          </div>
          {queues.length > 0 ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {queues.map((queue) => (
                <li
                  key={queue.id}
                  className="flex items-center justify-between rounded-xl border border-app-border bg-app-surface-2 px-3 py-2 text-sm text-app-text"
                >
                  <span>{zh(queue.name[0], queue.name[1])}</span>
                  <span
                    className={`font-medium ${queue.pending > 0 ? 'text-app-gold' : 'text-app-text'}`}
                  >
                    {queue.pending}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-app-muted">
              {zh('正在读取队列…', 'Loading queues...')}
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-sm">
          <h4 className="text-sm font-semibold text-app-text">
            {zh('抓取手段', 'Scrape sources')}
          </h4>
          <p className="mt-2 max-w-2xl text-sm text-app-muted">
            {zh(
              '每个站点请求的 URL 和取出的字段。同一站点连续请求之间会等待下面的间隔。',
              'URLs each site is called with, and the fields taken from the response. Consecutive requests to the same site wait for the interval below.'
            )}
          </p>
          {sources.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {sources.map((source) => {
                const name = javScrapeSourceName(source)
                const data = javScrapeDataLabels(source.data)
                const urls = Array.isArray(source.urls) ? source.urls : []
                return (
                  <li
                    key={source.id}
                    className="rounded-xl border border-app-border bg-app-surface-2 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-app-text">
                        {zh(name[0], name[1])}
                      </div>
                      <span className="rounded-full bg-app-surface px-2 py-0.5 text-xs font-medium text-app-muted">
                        {zh(
                          `间隔 ${formatInterval(source.interval_ms)}`,
                          `Every ${formatInterval(source.interval_ms)}`
                        )}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {urls.map((url) => (
                        <li
                          key={url}
                          className="break-all font-mono text-[11px] leading-5 text-app-muted"
                        >
                          {url}
                        </li>
                      ))}
                    </ul>
                    {data.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {data.map((field) => (
                          <span
                            key={field.key}
                            className="rounded-full bg-app-surface px-2 py-0.5 text-[11px] text-app-muted"
                          >
                            {zh(field.label[0], field.label[1])}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-app-muted">
              {zh('正在读取抓取来源…', 'Loading scrape sources...')}
            </p>
          )}
        </section>

        {javScrapeStatusError ? (
          <div className="text-sm text-red-600">{javScrapeStatusError}</div>
        ) : null}
      </div>
    )
  }

  const renderToolsPanel = () => {
    const installed = Boolean(ffmpegStatus?.installed)
    const upgradeAvailable = Boolean(ffmpegStatus?.upgrade_available)
    const downloading = Boolean(ffmpegStatus?.downloading)
    const supported = ffmpegStatus?.supported !== false
    const progress = Number(ffmpegStatus?.progress) || 0

    const handleDownload = async () => {
      setStartingFFmpegDownload(true)
      setToolsError('')
      try {
        const status = await downloadFFmpeg()
        setFFmpegStatus(status)
      } catch (err) {
        setToolsError(getErrorMessage(err))
      } finally {
        setStartingFFmpegDownload(false)
      }
    }

    const handleJavScrapeCheck = async () => {
      setJavScrapeCheckLoading(true)
      setJavScrapeCheckError('')
      try {
        const report = await runJavScrapeCheck()
        setJavScrapeCheck(report)
      } catch (err) {
        setJavScrapeCheckError(getErrorMessage(err))
      } finally {
        setJavScrapeCheckLoading(false)
      }
    }

    const handleScrapedDataCleanup = async () => {
      const confirmed = window.confirm(
        zh(
          '只会删除未被视频引用的抓取数据和未使用封面，不会删除任何视频文件。确定继续？',
          'This only deletes unused scraped data and unused covers. Video files are never deleted. Continue?'
        )
      )
      if (!confirmed) return
      setScrapedDataCleanupLoading(true)
      setScrapedDataCleanupError('')
      try {
        const report = await runScrapedDataCleanup()
        try {
          const leftover = await fetchScrapedDataCleanup()
          setScrapedDataCleanup(leftover)
          setScrapedDataJustCleaned(true)
        } catch {
          setScrapedDataCleanup(report)
          setScrapedDataJustCleaned(true)
        }
      } catch (err) {
        setScrapedDataCleanupError(getErrorMessage(err))
      } finally {
        setScrapedDataCleanupLoading(false)
      }
    }

    const javScrapeFieldCounts = javScrapeCheckFieldCounts(javScrapeCheck)

    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-sm">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-app-text">FFmpeg</h4>
                  {installed ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      {ffmpegInstalledLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 max-w-2xl text-sm text-app-muted">
                  {zh(
                    '浏览器无法直接播放某些视频编码时，JavBoss 使用 FFmpeg 转码后播放。',
                    'When a browser cannot play a video codec directly, JavBoss uses FFmpeg to transcode it for playback.'
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownload}
                disabled={
                  toolsLoading || startingFFmpegDownload || downloading || installed || !supported
                }
                className="rounded-xl bg-app-gold px-4 py-2 text-sm font-medium text-white hover:bg-app-gold-hover disabled:opacity-60"
              >
                {toolsLoading
                  ? zh('检查中…', 'Checking...')
                  : downloading
                    ? zh(`下载中 ${progress}%`, `Downloading ${progress}%`)
                    : installed
                      ? ffmpegInstalledLabel
                      : supported
                        ? upgradeAvailable
                          ? zh('更新 FFmpeg', 'Update FFmpeg')
                          : zh('下载 FFmpeg', 'Download FFmpeg')
                        : zh('当前平台不支持', 'Unsupported platform')}
              </button>
            </div>

            {upgradeAvailable && !downloading ? (
              <div className="border-app-gold/40 rounded-xl border bg-app-gold-soft px-4 py-3 text-sm text-app-gold">
                {zh(
                  '检测到 FFmpeg 有新版本，可以立即更新。',
                  'A new FFmpeg version is available. You can update now.'
                )}
              </div>
            ) : null}

            {downloading ? (
              <div>
                <div className="h-2 overflow-hidden rounded-full bg-app-bg">
                  <div
                    className="h-full rounded-full bg-app-gold transition-[width] duration-300"
                    style={{ width: `${Math.max(1, Math.min(100, progress))}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-app-muted">
                  {zh(
                    '正在下载并校验 FFmpeg，请不要关闭 JavBoss。',
                    'Downloading and validating FFmpeg. Keep JavBoss running.'
                  )}
                </p>
              </div>
            ) : null}

            {ffmpegStatus?.error ? (
              <div className="text-sm text-red-600">
                {zh('下载失败：', 'Download failed: ')}
                {ffmpegStatus.error}
              </div>
            ) : null}
            {toolsError ? <div className="text-sm text-red-600">{toolsError}</div> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-sm">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-app-text">
                  {zh('检查 JAV 抓取情况', 'Check JAV scrape completeness')}
                </h4>
                <p className="mt-2 max-w-2xl text-sm text-app-muted">
                  {zh(
                    '检查入库和未入库作品的封面图、标题、标签、系列、发行商、来源等字段。发现缺失或错误的会加入队列重新抓取。',
                    'Checks covers, titles, tags, series, studios, sources, and other fields on library and unimported works. Incomplete items are queued for another scrape.'
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={handleJavScrapeCheck}
                disabled={javScrapeCheckLoading}
                className="rounded-xl bg-app-gold px-4 py-2 text-sm font-medium text-white hover:bg-app-gold-hover disabled:opacity-60"
              >
                {javScrapeCheckLoading ? zh('检查中…', 'Checking...') : zh('开始检查', 'Run check')}
              </button>
            </div>

            {javScrapeCheck?.checked_at ? (
              <div className="space-y-3">
                <div className="text-sm text-app-text">
                  {zh(
                    `共 ${Number(javScrapeCheck.total) || 0} 部（入库 ${Number(javScrapeCheck.library_total) || 0} / 未入库 ${Number(javScrapeCheck.unimported_total) || 0}），缺失 ${Number(javScrapeCheck.incomplete) || 0} 部，已加入队列 ${Number(javScrapeCheck.queued) || 0} 部。`,
                    `${Number(javScrapeCheck.total) || 0} titles (${Number(javScrapeCheck.library_total) || 0} in library / ${Number(javScrapeCheck.unimported_total) || 0} unimported), ${Number(javScrapeCheck.incomplete) || 0} incomplete, ${Number(javScrapeCheck.queued) || 0} queued.`
                  )}
                </div>
                {javScrapeCheckHasPending(javScrapeCheck) ? (
                  <div className="border-app-gold/40 rounded-xl border bg-app-gold-soft px-4 py-3 text-sm text-app-gold">
                    {zh(
                      `正在重新抓取：封面队列 ${Number(javScrapeCheck.cover_pending) || 0}，元数据队列 ${Number(javScrapeCheck.metadata_pending) || 0}。`,
                      `Re-scraping in progress: ${Number(javScrapeCheck.cover_pending) || 0} covers, ${Number(javScrapeCheck.metadata_pending) || 0} metadata jobs.`
                    )}
                  </div>
                ) : null}
                {javScrapeFieldCounts.length > 0 ? (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {javScrapeFieldCounts.map((field) => (
                      <li
                        key={field.key}
                        className="flex items-center justify-between rounded-xl border border-app-border bg-app-surface-2 px-3 py-2 text-sm text-app-text"
                      >
                        <span>{zh(field.label[0], field.label[1])}</span>
                        <span className="font-medium text-app-text">{field.count}</span>
                      </li>
                    ))}
                  </ul>
                ) : Number(javScrapeCheck.total) > 0 ? (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {zh('未发现缺失字段。', 'No missing scrape fields were found.')}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-app-muted">
                {zh(
                  '还没有检查过。点击按钮开始检查当前资料库。',
                  'No check has been run yet. Click the button to scan the library.'
                )}
              </p>
            )}
            {javScrapeCheckError ? (
              <div className="text-sm text-red-600">{javScrapeCheckError}</div>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-sm">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-app-text">
                  {zh('清理抓取垃圾数据', 'Clean unused scraped data')}
                </h4>
                <p className="mt-2 max-w-2xl text-sm text-app-muted">
                  {zh(
                    '删除没有被任何视频引用的抓取元数据、未使用的标签/演员/发行商/系列，以及封面目录里已无对应番号的封面文件。不会删除任何视频文件。',
                    'Removes scraped metadata that no video still uses, unused tags/actresses/studios/series, and cover files whose codes are gone. Video files are never deleted.'
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={handleScrapedDataCleanup}
                disabled={
                  scrapedDataCleanupLoading ||
                  (scrapedDataCleanup != null && scrapedDataCleanupTotal(scrapedDataCleanup) === 0)
                }
                className="rounded-xl bg-app-gold px-4 py-2 text-sm font-medium text-white hover:bg-app-gold-hover disabled:opacity-60"
              >
                {scrapedDataCleanupLoading
                  ? zh('清理中…', 'Cleaning...')
                  : zh('开始清理', 'Clean now')}
              </button>
            </div>

            {scrapedDataCleanup ? (
              <div className="space-y-3">
                {scrapedDataCleanupTotal(scrapedDataCleanup) > 0 ? (
                  <>
                    <div className="text-sm text-app-text">
                      {zh(
                        `发现 ${scrapedDataCleanupTotal(scrapedDataCleanup)} 项可清理的抓取数据。`,
                        `Found ${scrapedDataCleanupTotal(scrapedDataCleanup)} unused scraped items.`
                      )}
                    </div>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {scrapedDataCleanupCounts(scrapedDataCleanup).map((field) => (
                        <li
                          key={field.key}
                          className="flex items-center justify-between rounded-xl border border-app-border bg-app-surface-2 px-3 py-2 text-sm text-app-text"
                        >
                          <span>{zh(field.label[0], field.label[1])}</span>
                          <span className="font-medium text-app-text">{field.count}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {scrapedDataJustCleaned
                      ? zh(
                          '已完成清理。视频文件未被改动。',
                          'Cleanup finished. Video files were not changed.'
                        )
                      : zh('没有可清理的抓取垃圾数据。', 'No unused scraped data was found.')}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-app-muted">
                {zh(
                  '打开此页时会自动扫描可清理的抓取数据。',
                  'This page scans for unused scraped data when you open it.'
                )}
              </p>
            )}
            {scrapedDataCleanupError ? (
              <div className="text-sm text-red-600">{scrapedDataCleanupError}</div>
            ) : null}
          </div>
        </section>
      </div>
    )
  }

  const renderSecurityPanel = () => {
    const handleChangePassword = async (event) => {
      event.preventDefault()
      setPasswordError('')
      const newPasswordLength = [...newPassword].length
      const newPasswordBytes = new TextEncoder().encode(newPassword).length
      if (newPasswordLength < 6 || newPasswordLength > 20 || newPasswordBytes > 72) {
        setPasswordError(zh('新密码需为 6-20 个字符', 'New password must be 6-20 characters'))
        return
      }
      if (newPassword !== newPassword.trim()) {
        setPasswordError(
          zh('新密码首尾不能包含空格', 'New password cannot start or end with spaces')
        )
        return
      }
      if (newPassword !== confirmPassword) {
        setPasswordError(zh('两次输入的新密码不一致', 'The new passwords do not match'))
        return
      }
      setSavingPassword(true)
      try {
        await onChangePassword?.(currentPassword, newPassword)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setVisiblePasswords({ current: false, new: false, confirm: false })
        setPasswordDialogOpen(false)
      } catch (err) {
        setPasswordError(getErrorMessage(err))
      } finally {
        setSavingPassword(false)
      }
    }

    const openPasswordDialog = () => {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setVisiblePasswords({ current: false, new: false, confirm: false })
      setPasswordError('')
      setPasswordDialogOpen(true)
    }

    const closePasswordDialog = () => {
      if (savingPassword) return
      setPasswordDialogOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setVisiblePasswords({ current: false, new: false, confirm: false })
      setPasswordError('')
    }

    return (
      <>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={openPasswordDialog}
            className="rounded-xl border border-app-border bg-app-surface px-4 py-2 text-sm font-medium text-app-text hover:bg-app-surface-2"
          >
            {zh('修改密码', 'Change password')}
          </button>
          <button
            type="button"
            onClick={() => onLogout?.()}
            className="rounded-xl border border-red-200 bg-app-surface px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-950/40"
          >
            {zh('退出登录', 'Sign out')}
          </button>
        </div>

        {passwordDialogOpen ? (
          <AppModal
            ariaLabelledby="change-password-title"
            className="px-4"
            closeDisabled={savingPassword}
            contentClassName="w-full max-w-md rounded-2xl border border-app-border bg-app-surface p-6 shadow-2xl"
            contentComponent="form"
            contentProps={{ onSubmit: handleChangePassword }}
            onClose={closePasswordDialog}
            zIndex={1400}
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <h3 id="change-password-title" className="text-lg font-semibold text-app-text">
                {zh('修改密码', 'Change password')}
              </h3>
              <button
                type="button"
                onClick={closePasswordDialog}
                disabled={savingPassword}
                className="rounded-lg px-2 py-1 text-app-muted hover:bg-app-bg disabled:opacity-50"
                aria-label={zh('关闭', 'Close')}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {[
                {
                  id: 'current-password',
                  label: zh('旧密码', 'Current password'),
                  value: currentPassword,
                  setter: setCurrentPassword,
                  autoComplete: 'current-password',
                  visibilityKey: 'current',
                },
                {
                  id: 'new-password',
                  label: zh('新密码', 'New password'),
                  value: newPassword,
                  setter: setNewPassword,
                  autoComplete: 'new-password',
                  visibilityKey: 'new',
                },
                {
                  id: 'confirm-password',
                  label: zh('确认新密码', 'Confirm new password'),
                  value: confirmPassword,
                  setter: setConfirmPassword,
                  autoComplete: 'new-password',
                  visibilityKey: 'confirm',
                },
              ].map((field) => (
                <div key={field.id}>
                  <label
                    htmlFor={field.id}
                    className="mb-1.5 block text-sm font-medium text-app-text"
                  >
                    {field.label}
                  </label>
                  <div className="relative">
                    <input
                      id={field.id}
                      type={visiblePasswords[field.visibilityKey] ? 'text' : 'password'}
                      autoComplete={field.autoComplete}
                      value={field.value}
                      onChange={(event) => {
                        field.setter(event.target.value)
                        setPasswordError('')
                      }}
                      className="focus:ring-app-gold/25 w-full rounded-xl border border-app-border bg-app-surface py-2 pl-3 pr-16 text-sm text-app-text outline-none focus:border-app-gold focus:ring-2"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setVisiblePasswords((current) => ({
                          ...current,
                          [field.visibilityKey]: !current[field.visibilityKey],
                        }))
                      }
                      className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-md p-1 text-app-muted hover:bg-app-bg hover:text-app-text"
                      aria-label={
                        visiblePasswords[field.visibilityKey]
                          ? zh(`隐藏${field.label}`, `Hide ${field.label.toLowerCase()}`)
                          : zh(`显示${field.label}`, `Show ${field.label.toLowerCase()}`)
                      }
                    >
                      {visiblePasswords[field.visibilityKey] ? (
                        <VisibilityOutlinedIcon fontSize="small" aria-hidden="true" />
                      ) : (
                        <VisibilityOffOutlinedIcon fontSize="small" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {passwordError ? (
              <div className="mt-4 text-sm text-red-600">{passwordError}</div>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closePasswordDialog}
                disabled={savingPassword}
                className="rounded-xl border border-app-border bg-app-surface px-4 py-2 text-sm text-app-text hover:bg-app-surface-2 disabled:opacity-50"
              >
                {zh('取消', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                className="rounded-xl bg-app-gold px-4 py-2 text-sm text-white hover:bg-app-gold-hover disabled:opacity-60"
              >
                {savingPassword ? zh('保存中…', 'Saving...') : zh('确认修改', 'Change password')}
              </button>
            </div>
          </AppModal>
        ) : null}
      </>
    )
  }

  return (
    <>
      <AppModal
        ariaLabelledby="global-settings-title"
        className="px-4"
        contentClassName="flex h-[min(86vh,820px)] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-app-border bg-app-bg shadow-2xl"
        onClose={onClose}
      >
        <div className="bg-app-surface/70 flex items-center justify-between border-b border-app-border px-6 py-4 backdrop-blur">
          <div>
            <h2 id="global-settings-title" className="text-lg font-semibold text-app-text">
              {zh('全局设置', 'Global Settings')}
            </h2>
            <p className="mt-1 text-sm text-app-muted">{zh(activeTitle.zh, activeTitle.en)}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-app-border bg-app-surface px-3 py-1.5 text-sm text-app-muted hover:bg-app-surface-2"
          >
            {zh('关闭', 'Close')}
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="bg-app-surface/60 border-b border-app-border p-3 backdrop-blur md:w-[280px] md:border-b-0 md:border-r">
            <div className="flex gap-2 overflow-x-auto md:flex-col">
              {visibleSections.map((section) => {
                const selected = currentSection === section.id
                const badgeText =
                  section.id === 'directories'
                    ? String(directories.length)
                    : section.id === 'scrape' && javScrapePendingTotal(javScrapeStatus) > 0
                      ? String(javScrapePendingTotal(javScrapeStatus))
                      : ''

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={`min-w-[220px] rounded-2xl border px-4 py-3 text-left transition md:min-w-0 ${
                      selected
                        ? 'border-app-gold bg-app-gold-soft shadow-sm'
                        : 'border-transparent bg-transparent hover:border-app-border hover:bg-app-hover'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-app-text">
                          {zh(section.title.zh, section.title.en)}
                        </div>
                      </div>
                      {badgeText ? (
                        <span className="rounded-full bg-app-bg px-2 py-0.5 text-xs font-medium text-app-muted">
                          {badgeText}
                        </span>
                      ) : null}
                    </div>
                  </button>
                )
              })}
            </div>
          </aside>

          <section
            className={`min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4 md:px-6 md:pb-6 ${
              currentSection === 'directories' ? 'md:pt-3' : 'md:pt-6'
            }`}
          >
            {currentSection === 'display' && renderDisplayPanel()}
            {currentSection === 'shortcuts' && renderShortcutsPanel()}
            {currentSection === 'network' && renderNetworkPanel()}
            {currentSection === 'scrape' && renderScrapePanel()}
            {currentSection === 'tools' && renderToolsPanel()}
            {currentSection === 'player' && renderPlayerPanel()}
            {currentSection === 'directories' && renderDirectoriesPanel()}
            {currentSection === 'security' && renderSecurityPanel()}
          </section>
        </div>
      </AppModal>
    </>
  )
}
