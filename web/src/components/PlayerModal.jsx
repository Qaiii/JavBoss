import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import CheckIcon from '@mui/icons-material/Check'
import Forward10Icon from '@mui/icons-material/Forward10'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import PauseIcon from '@mui/icons-material/Pause'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import Replay10Icon from '@mui/icons-material/Replay10'
import ReplayIcon from '@mui/icons-material/Replay'
import SettingsIcon from '@mui/icons-material/Settings'
import VolumeDownIcon from '@mui/icons-material/VolumeDown'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import { createVideoScreenshot, fetchPlaybackInfo } from '@/api'
import { getVideoDisplayName } from '@/utils/display'
import {
  PLAYER_HOTKEY_ACTIONS,
  formatPlayerHotkeyKey,
  normalizePlayerHotkeyKey,
  parsePlayerHotkeys,
} from '@/utils/playerHotkeys'
import { zh } from '@/utils/i18n'
import { getErrorMessage } from '@/utils/errors'

const VOLUME_STORAGE_KEY = 'javboss.player.volume'
const CONTROLS_HIDE_DELAY_MS = 3000
const SEEK_STEP_SECONDS = 10
const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const paddedMinutes = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  const paddedSeconds = String(secs).padStart(2, '0')
  return hours > 0
    ? `${hours}:${paddedMinutes}:${paddedSeconds}`
    : `${paddedMinutes}:${paddedSeconds}`
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

const iconButtonClass =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 pointer-coarse:h-8 pointer-coarse:w-8'

export default function PlayerModal({
  video,
  startTime = 0,
  onClose,
  hotkeys = null,
  onPlaybackError,
}) {
  const videoRef = useRef(null)
  const playerRef = useRef(null)
  const shellRef = useRef(null)
  const seekBarRef = useRef(null)
  const hotkeyMapRef = useRef(new Map())
  const hideTimerRef = useRef(null)
  const clickTimerRef = useRef(null)
  const dragRef = useRef({ active: false })
  const menuOpenRef = useRef(null)
  const screenshotInFlightRef = useRef(false)
  const screenshotNoticeTimerRef = useRef(null)
  const actionsRef = useRef(null)
  // App 侧传入的 onClose / onPlaybackError 通常是内联箭头函数，每次渲染引用都会变。
  // 若直接作为 effect 依赖，会导致播放器反复 dispose/重建（video.js 会移除 DOM，
  // 重建时拿到已脱离文档的元素而失败，播放区变黑），因此用 ref 保存最新回调。
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onPlaybackErrorRef = useRef(onPlaybackError)
  onPlaybackErrorRef.current = onPlaybackError
  const [playbackInfo, setPlaybackInfo] = useState(null)
  const [playbackError, setPlaybackError] = useState('')
  const [loadingPlayback, setLoadingPlayback] = useState(false)
  const [screenshotNotice, setScreenshotNotice] = useState(false)
  const [videoSize, setVideoSize] = useState(null) // { width, height } of the source video
  const [playing, setPlaying] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [ended, setEnded] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [bufferedEnd, setBufferedEnd] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [menuOpen, setMenuOpen] = useState(null) // null | 'speed'
  const [seekHoverTime, setSeekHoverTime] = useState(null)
  const [dragTime, setDragTime] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  // 精细指针（鼠标）设备：有“移出播放区域”概念，用于移出即隐藏控制条
  const [isFinePointer] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches
  )
  const normalizedHotkeys = useMemo(() => parsePlayerHotkeys(hotkeys), [hotkeys])
  const screenshotHotkeyLabel = useMemo(() => {
    const item = normalizedHotkeys.find(
      (entry) => entry.action === PLAYER_HOTKEY_ACTIONS.SCREENSHOT
    )
    return item ? formatPlayerHotkeyKey(item.key) : ''
  }, [normalizedHotkeys])
  const selectedSource = useMemo(() => {
    if (!playbackInfo?.sources?.length) return null
    return (
      playbackInfo.sources.find((item) => item.kind === playbackInfo.preferred_kind) ||
      playbackInfo.sources[0]
    )
  }, [playbackInfo])

  useEffect(() => {
    hotkeyMapRef.current = new Map(normalizedHotkeys.map((item) => [item.key, item]))
  }, [normalizedHotkeys])

  useEffect(() => {
    menuOpenRef.current = menuOpen
  }, [menuOpen])

  useEffect(() => {
    return () => {
      if (screenshotNoticeTimerRef.current) {
        window.clearTimeout(screenshotNoticeTimerRef.current)
      }
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current)
      }
      if (clickTimerRef.current) {
        window.clearTimeout(clickTimerRef.current)
      }
    }
  }, [])

  // 全屏状态跟随浏览器全屏（我们对 .player-shell 发起全屏，让自定义控制条保持可见）
  useEffect(() => {
    const sync = () =>
      setIsFullscreen(Boolean(document.fullscreenElement || document.webkitFullscreenElement))
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const scheduleHideControls = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current)
    }
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null
      if (dragRef.current.active || menuOpenRef.current) {
        return
      }
      setControlsVisible(false)
      setMenuOpen(null)
    }, CONTROLS_HIDE_DELAY_MS)
  }, [])

  const pokeControls = useCallback(() => {
    showControls()
    scheduleHideControls()
  }, [showControls, scheduleHideControls])

  // 视频区交互（移动/点击唤出控制条、移出隐藏、单击播放暂停、双击全屏）。
  // 用原生事件挂在 shell 上而不是 JSX 属性，避免 eslint 对非交互元素的告警。
  // 注意：PlayerModal 在 App 中始终挂载（video 为 null 时返回 null），本 effect
  // 首次运行时 shell 尚未挂载；必须以 video 为依赖，在播放器真正打开（shell 挂载）
  // 后再绑定，否则监听器永远不会挂上（控制条不再响应移动/点击）。
  useEffect(() => {
    if (!video) return undefined
    const shell = shellRef.current
    if (!shell) return undefined

    const isExcludedTarget = (event) =>
      event.target instanceof Element &&
      Boolean(event.target.closest('button, input, [role="slider"], .player-controls'))

    // 记录指针是否曾在 shell 内移动过：shell 在 videoSize 加载后会改变尺寸
    // （如竖屏视频从 16:9 变 9:16），若指针静止，浏览器也会因几何变化触发
    // mouseleave —— 这种“假移出”不应隐藏控制条。只有指针真的移动出播放区域才隐藏。
    let pointerMovedInside = false

    const handleMouseMove = () => {
      pointerMovedInside = true
      pokeControls()
    }

    const handleMouseEnter = () => {
      pointerMovedInside = false
    }

    // 光标移出播放区域：立即隐藏控制条（桌面设备；触摸设备无移出概念）
    const handleMouseLeave = () => {
      if (!isFinePointer) return
      if (!pointerMovedInside) return
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      setControlsVisible(false)
      setMenuOpen(null)
    }

    // 触摸设备：浏览器（Chrome Android 等）不会在 <video> 媒体元素上派发
    // 兼容鼠标事件（无 click/dblclick），因此“点击切换播放/暂停”必须监听
    // touchend 实现。同时记录按下位置，滑动（滚动/拖拽）手势不视为点击。
    let touchStartPos = null
    let lastTouchEndAt = 0

    const handleTouchStart = (event) => {
      const touch = event.touches && event.touches[0]
      touchStartPos = touch ? { x: touch.clientX, y: touch.clientY } : null
      pokeControls()
    }

    const handleTouchEnd = (event) => {
      const start = touchStartPos
      touchStartPos = null
      if (!start) return
      if (isExcludedTarget(event)) return
      const touch = event.changedTouches && event.changedTouches[0]
      if (!touch) return
      const dx = touch.clientX - start.x
      const dy = touch.clientY - start.y
      if (dx * dx + dy * dy > 100) return // 位移超过 10px：视为滑动，不是点击
      lastTouchEndAt = Date.now()
      pokeControls()
      actionsRef.current?.togglePlay()
    }

    // 点击：每次点击都立即唤出控制条并重新计时；
    // 250ms 内的多次点击合并为一次播放切换（区分双击全屏，避免连点被吞）
    const handleClick = (event) => {
      if (isExcludedTarget(event)) return
      // 触摸 tap 已由 handleTouchEnd 处理；若浏览器（如某些 WebView）在
      // <video> 上仍派发了 click，避免同一 tap 重复切换
      if (Date.now() - lastTouchEndAt < 500) return
      pokeControls()
      if (clickTimerRef.current) return
      clickTimerRef.current = window.setTimeout(() => {
        clickTimerRef.current = null
        actionsRef.current?.togglePlay()
      }, 250)
    }

    const handleDblClick = (event) => {
      if (isExcludedTarget(event)) return
      if (Date.now() - lastTouchEndAt < 500) return
      if (clickTimerRef.current) {
        window.clearTimeout(clickTimerRef.current)
        clickTimerRef.current = null
      }
      actionsRef.current?.toggleFullscreen()
    }

    shell.addEventListener('mousemove', handleMouseMove)
    shell.addEventListener('mouseenter', handleMouseEnter)
    shell.addEventListener('mouseleave', handleMouseLeave)
    shell.addEventListener('touchstart', handleTouchStart, { passive: true })
    shell.addEventListener('touchend', handleTouchEnd, { passive: true })
    shell.addEventListener('click', handleClick)
    shell.addEventListener('dblclick', handleDblClick)

    return () => {
      shell.removeEventListener('mousemove', handleMouseMove)
      shell.removeEventListener('mouseenter', handleMouseEnter)
      shell.removeEventListener('mouseleave', handleMouseLeave)
      shell.removeEventListener('touchstart', handleTouchStart)
      shell.removeEventListener('touchend', handleTouchEnd)
      shell.removeEventListener('click', handleClick)
      shell.removeEventListener('dblclick', handleDblClick)
      if (clickTimerRef.current) {
        window.clearTimeout(clickTimerRef.current)
        clickTimerRef.current = null
      }
    }
  }, [pokeControls, isFinePointer, video])

  // 打开播放器时：控制条默认显示，3 秒无操作后自动隐藏。
  // 同样以 video 为依赖：挂载时 video 为 null（弹窗未渲染），若只在挂载时 poke，
  // 定时器会在弹窗打开前就耗尽，导致打开后控制条直接处于隐藏状态。
  useEffect(() => {
    if (!video) return undefined
    pokeControls()
  }, [pokeControls, video])

  useEffect(() => {
    if (!video?.id) {
      setPlaybackInfo(null)
      setPlaybackError('')
      setLoadingPlayback(false)
      setScreenshotNotice(false)
      setVideoSize(null)
      return
    }

    let cancelled = false
    setLoadingPlayback(true)
    setPlaybackError('')
    setPlaybackInfo(null)
    setScreenshotNotice(false)
    setVideoSize(null)

    fetchPlaybackInfo(video.id, { locationId: video.location_id })
      .then((info) => {
        if (cancelled) return
        setPlaybackInfo(info)
      })
      .catch((err) => {
        if (cancelled) return
        const message = getErrorMessage(err)
        setPlaybackError(message)
        onPlaybackErrorRef.current?.(message)
      })
      .finally(() => {
        if (cancelled) return
        setLoadingPlayback(false)
      })

    return () => {
      cancelled = true
    }
  }, [video])

  useEffect(() => {
    if (!video || !videoRef.current || !selectedSource?.src) return

    const player = videojs(videoRef.current, {
      controls: false, // 使用自绘 YouTube 风格控制条
      autoplay: true,
      preload: 'auto',
      bigPlayButton: false,
      sources: [
        {
          src: selectedSource.src,
          type: selectedSource.mime_type || 'video/mp4',
        },
      ],
    })

    playerRef.current = player

    const playerEl = player.el()
    const savedVolume = (() => {
      try {
        const raw = localStorage.getItem(VOLUME_STORAGE_KEY)
        if (raw == null) return null
        const value = Number.parseFloat(raw)
        return Number.isFinite(value) ? value : null
      } catch {
        return null
      }
    })()

    if (savedVolume != null) {
      player.volume(Math.min(1, Math.max(0, savedVolume)))
    }

    // ---- 状态同步 ----
    const syncTime = () => setCurrentTime(player.currentTime() || 0)
    const syncDuration = () =>
      setDuration(Number.isFinite(player.duration()) ? player.duration() : 0)
    const syncBuffered = () => {
      try {
        const buffered = player.buffered()
        setBufferedEnd(buffered && buffered.length > 0 ? buffered.end(buffered.length - 1) : 0)
      } catch {
        setBufferedEnd(0)
      }
    }
    const syncVolumeState = () => {
      setVolume(player.volume())
      setMuted(player.muted())
    }

    // ---- 控制条动作 ----
    const seekBy = (offsetSeconds) => {
      const current = player.currentTime() || 0
      const durationVal = player.duration()
      let next = current + offsetSeconds
      if (Number.isFinite(durationVal)) {
        next = Math.min(Math.max(0, next), durationVal)
      } else {
        next = Math.max(0, next)
      }
      player.currentTime(next)
    }

    const adjustVolume = (delta) => {
      const next = Math.min(1, Math.max(0, player.volume() + delta))
      player.volume(next)
      if (next > 0 && player.muted()) {
        player.muted(false)
      }
    }

    const captureScreenshot = () => {
      if (!video?.id || screenshotInFlightRef.current) return
      const second = Math.max(0, Number(player.currentTime()) || 0)
      screenshotInFlightRef.current = true
      createVideoScreenshot(video.id, { second, locationId: video.location_id })
        .then(() => {
          if (screenshotNoticeTimerRef.current) {
            window.clearTimeout(screenshotNoticeTimerRef.current)
          }
          setScreenshotNotice(true)
          screenshotNoticeTimerRef.current = window.setTimeout(() => {
            setScreenshotNotice(false)
            screenshotNoticeTimerRef.current = null
          }, 1600)
        })
        .catch((err) => {
          console.error(zh('截图失败', 'Failed to capture screenshot'), err)
        })
        .finally(() => {
          screenshotInFlightRef.current = false
        })
    }

    const toggleFullscreen = () => {
      const element = shellRef.current
      if (!element) return
      if (document.fullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {})
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen()
        }
        return
      }
      if (element.requestFullscreen) {
        element.requestFullscreen().catch(() => {})
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen()
      }
    }

    actionsRef.current = {
      togglePlay: () => {
        if (player.ended()) {
          player.currentTime(0)
          player.play()
          return
        }
        if (player.paused()) {
          player.play()
        } else {
          player.pause()
        }
      },
      seekBy,
      captureScreenshot,
      setRate: (rate) => {
        player.playbackRate(rate)
      },
      toggleMute: () => {
        player.muted(!player.muted())
      },
      setVolumeLevel: (value) => {
        const next = Math.min(1, Math.max(0, Number(value)))
        player.volume(next)
        if (next > 0 && player.muted()) {
          player.muted(false)
        }
      },
      toggleFullscreen,
    }

    // ---- 播放器事件（显隐完全由 pokeControls / 定时器 / 移出驱动，这里只同步状态） ----
    const handlePlay = () => {
      setPlaying(true)
      setEnded(false)
      setWaiting(false)
    }
    const handlePause = () => {
      setPlaying(false)
    }
    const handleEnded = () => {
      setPlaying(false)
      setEnded(true)
      setWaiting(false)
    }
    const handleWaiting = () => setWaiting(true)
    const handleCanPlay = () => setWaiting(false)
    const handleLoadedMetadata = () => {
      syncDuration()
      syncBuffered()
      handleDimensions()
    }

    const handleKeyDown = (event) => {
      const target = event.target
      if (
        target instanceof Element &&
        (target.isContentEditable ||
          target.closest('input, textarea, select, button, [contenteditable="true"]'))
      ) {
        return
      }
      const key = normalizePlayerHotkeyKey(event.key || '')
      const configured = hotkeyMapRef.current.get(key)
      const markHandled = () => {
        event.preventDefault()
        event.stopPropagation()
      }
      if (
        configured &&
        (configured.action === PLAYER_HOTKEY_ACTIONS.SEEK ||
          configured.action === PLAYER_HOTKEY_ACTIONS.VOLUME ||
          configured.action === PLAYER_HOTKEY_ACTIONS.SCREENSHOT)
      ) {
        markHandled()
        if (configured.action === PLAYER_HOTKEY_ACTIONS.SEEK) {
          pokeControls()
          seekBy(configured.amount)
        } else if (configured.action === PLAYER_HOTKEY_ACTIONS.VOLUME) {
          pokeControls()
          adjustVolume(configured.amount / 100)
        } else if (configured.action === PLAYER_HOTKEY_ACTIONS.SCREENSHOT) {
          pokeControls()
          captureScreenshot()
        }
        return
      }
      switch (key) {
        case ' ':
        case 'Spacebar': {
          markHandled()
          if (player.paused()) {
            player.play()
          } else {
            player.pause()
          }
          break
        }
        case 'Escape':
          // 浏览器全屏时按 Esc 由浏览器接管退出全屏，不关闭弹窗
          if (document.fullscreenElement) return
          markHandled()
          onCloseRef.current()
          break
        default:
          return
      }
    }

    const focusPlayer = () => {
      playerEl?.focus({ preventScroll: true })
    }
    // video.js 在 data-vjs-player 包装下会用新的 .vjs-tech 元素替换原 <video> 标签，
    // 因此不能从 videoRef.current 读尺寸（恒为 0），必须走 player API。
    // 同时监听 resize：HLS 等流在 loadedmetadata 时可能还拿不到分辨率，稍后会再触发。
    const handleDimensions = () => {
      const width = player.videoWidth()
      const height = player.videoHeight()
      if (width > 0 && height > 0) {
        setVideoSize({ width, height })
      }
    }
    const applyStartTime = () => {
      const nextStartTime = Number(startTime)
      if (!Number.isFinite(nextStartTime) || nextStartTime <= 0) return
      player.currentTime(nextStartTime)
    }

    if (playerEl && !playerEl.hasAttribute('tabindex')) {
      playerEl.setAttribute('tabindex', '-1')
    }

    window.addEventListener('keydown', handleKeyDown, true)

    const handleVolumeChange = () => {
      try {
        localStorage.setItem(VOLUME_STORAGE_KEY, String(player.volume()))
      } catch {
        return
      }
    }

    const handleRateChange = () => setPlaybackRate(player.playbackRate())

    player.ready(() => {
      applyStartTime()
      syncTime()
      syncDuration()
      syncBuffered()
      syncVolumeState()
      focusPlayer()
    })
    player.on('play', handlePlay)
    player.on('pause', handlePause)
    player.on('ended', handleEnded)
    player.on('waiting', handleWaiting)
    player.on('playing', handleCanPlay)
    player.on('canplay', handleCanPlay)
    player.on('timeupdate', syncTime)
    player.on('seeked', syncTime)
    player.on('durationchange', syncDuration)
    player.on('progress', syncBuffered)
    player.on('loadedmetadata', handleLoadedMetadata)
    player.on('volumechange', syncVolumeState)
    player.on('volumechange', handleVolumeChange)
    player.on('ratechange', handleRateChange)
    player.on('fullscreenchange', focusPlayer)
    player.on('resize', handleDimensions)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      player.off('play', handlePlay)
      player.off('pause', handlePause)
      player.off('ended', handleEnded)
      player.off('waiting', handleWaiting)
      player.off('playing', handleCanPlay)
      player.off('canplay', handleCanPlay)
      player.off('timeupdate', syncTime)
      player.off('seeked', syncTime)
      player.off('durationchange', syncDuration)
      player.off('progress', syncBuffered)
      player.off('loadedmetadata', handleLoadedMetadata)
      player.off('volumechange', syncVolumeState)
      player.off('volumechange', handleVolumeChange)
      player.off('ratechange', handleRateChange)
      player.off('fullscreenchange', focusPlayer)
      player.off('resize', handleDimensions)
      playerRef.current?.dispose()
      playerRef.current = null
    }
  }, [video, startTime, selectedSource, pokeControls])

  // ---- 进度条交互 ----
  const seekTimeFromEvent = (event) => {
    const bar = seekBarRef.current
    if (!bar || !duration) return 0
    const rect = bar.getBoundingClientRect()
    const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0
    return Math.min(1, Math.max(0, ratio)) * duration
  }

  const handleSeekPointerDown = (event) => {
    if (!duration) return
    dragRef.current.active = true
    setDragTime(seekTimeFromEvent(event))
    setSeekHoverTime(null)
    showControls()
    try {
      seekBarRef.current?.setPointerCapture?.(event.pointerId)
    } catch {
      // 忽略捕获失败
    }
    event.preventDefault()
  }

  const handleSeekPointerMove = (event) => {
    if (!duration) return
    const time = seekTimeFromEvent(event)
    if (dragRef.current.active) {
      setDragTime(time)
    } else {
      setSeekHoverTime(time)
    }
  }

  const handleSeekPointerUp = (event) => {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    const time = dragTime ?? seekTimeFromEvent(event)
    setDragTime(null)
    setSeekHoverTime(null)
    playerRef.current?.currentTime(time)
    try {
      seekBarRef.current?.releasePointerCapture?.(event.pointerId)
    } catch {
      // 忽略释放失败
    }
    scheduleHideControls()
  }

  const handleSeekBarKeyDown = (event) => {
    let next = null
    if (event.key === 'ArrowLeft') {
      next = (dragTime ?? currentTime) - 5
    } else if (event.key === 'ArrowRight') {
      next = (dragTime ?? currentTime) + 5
    } else if (event.key === 'Home') {
      next = 0
    } else if (event.key === 'End') {
      next = duration
    }
    if (next == null) return
    event.preventDefault()
    playerRef.current?.currentTime(Math.min(Math.max(0, next), duration))
  }

  if (!video) return null

  const displayName = getVideoDisplayName(video)
  const aspectRatio =
    videoSize && videoSize.height > 0 ? videoSize.width / videoSize.height : 16 / 9
  const displayTime = dragTime ?? currentTime
  const playedPercent = duration > 0 ? clampPercent((displayTime / duration) * 100) : 0
  const bufferedPercent = duration > 0 ? clampPercent((bufferedEnd / duration) * 100) : 0
  const tooltipTime = dragTime ?? seekHoverTime
  const tooltipPercent =
    duration > 0 && tooltipTime != null ? clampPercent((tooltipTime / duration) * 100) : 0

  return (
    <div className="fixed inset-0 z-[1700] flex items-center justify-center bg-black/70 pointer-coarse:bg-black">
      {/*
        桌面端：白色卡片包裹，标题与关闭按钮在卡片内；
        移动端（触摸设备，含横屏）：隐藏白卡片边框，视频按比例贴边（100vw/100dvh，不超出不拉伸），标题悬浮在视频上方。
        宽度公式在 .player-card 的媒体查询中，比例通过 --player-ar 传入。
      */}
      <div
        className="player-card relative mx-4 rounded-lg bg-white shadow-lg pointer-coarse:mx-0 pointer-coarse:rounded-none pointer-coarse:bg-black pointer-coarse:shadow-none"
        style={{ '--player-ar': `${aspectRatio}` }}
      >
        <button
          aria-label={zh('关闭', 'Close')}
          onClick={onClose}
          className={`absolute right-3 top-4 z-20 rounded-full bg-black/60 px-2 py-1 text-sm text-white hover:bg-black/80 pointer-coarse:top-3 pointer-coarse:transition-opacity pointer-coarse:duration-200 ${
            controlsVisible ? '' : 'pointer-coarse:pointer-events-none pointer-coarse:opacity-0'
          }`}
        >
          ×
        </button>
        <div className="flex flex-col gap-4 p-4 pointer-coarse:gap-0 pointer-coarse:p-0">
          <h2
            className={`truncate pr-10 text-lg font-semibold pointer-coarse:absolute pointer-coarse:inset-x-0 pointer-coarse:top-0 pointer-coarse:z-10 pointer-coarse:bg-gradient-to-b pointer-coarse:from-black/60 pointer-coarse:to-transparent pointer-coarse:pb-5 pointer-coarse:pl-3 pointer-coarse:pr-14 pointer-coarse:pt-4 pointer-coarse:text-sm pointer-coarse:font-medium pointer-coarse:text-white pointer-coarse:transition-opacity pointer-coarse:duration-200 ${
              controlsVisible ? '' : 'pointer-coarse:pointer-events-none pointer-coarse:opacity-0'
            }`}
            title={displayName}
          >
            {displayName}
          </h2>
          <div
            ref={shellRef}
            className={`player-shell relative w-full bg-black ${controlsVisible ? '' : 'cursor-none'}`}
            style={{
              aspectRatio: videoSize ? `${videoSize.width} / ${videoSize.height}` : '16 / 9',
            }}
          >
            {screenshotNotice ? (
              <div className="pointer-events-none absolute left-3 top-3 z-10 rounded bg-black/75 px-3 py-1.5 text-sm font-medium text-white shadow">
                {zh('截图成功', 'Screenshot saved')}
              </div>
            ) : null}
            {loadingPlayback ? (
              <div className="flex h-full w-full items-center justify-center text-sm text-white">
                {zh('加载播放信息中…', 'Loading playback info...')}
              </div>
            ) : playbackError ? (
              <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-red-200">
                {playbackError}
              </div>
            ) : (
              <div data-vjs-player className="h-full w-full">
                <video ref={videoRef} className="video-js h-full w-full" playsInline>
                  <track kind="captions" />
                </video>
              </div>
            )}

            {/* 缓冲中加载动画 */}
            {!loadingPlayback && !playbackError && waiting && playing ? (
              <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
              </div>
            ) : null}

            {/* 暂停/结束时的中央大按钮 */}
            {!loadingPlayback && !playbackError && !playing ? (
              <button
                type="button"
                aria-label={ended ? zh('重新播放', 'Replay') : zh('播放', 'Play')}
                onClick={(event) => {
                  event.stopPropagation()
                  pokeControls()
                  actionsRef.current?.togglePlay()
                }}
                className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 p-4 text-white backdrop-blur-sm transition-colors hover:bg-white/25"
              >
                {ended ? (
                  <ReplayIcon style={{ fontSize: 44 }} />
                ) : (
                  <PlayArrowIcon style={{ fontSize: 44 }} />
                )}
              </button>
            ) : null}

            {/* YouTube 风格控制条 */}
            <div
              className={`player-controls absolute inset-x-0 bottom-0 z-20 select-none bg-gradient-to-t from-black/80 via-black/40 to-transparent pb-1 transition-opacity duration-200 ${
                controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              {/* 进度条 */}
              <div
                ref={seekBarRef}
                role="slider"
                tabIndex={0}
                aria-label={zh('播放进度', 'Seek')}
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(displayTime)}
                className="group/seek relative h-5 w-full cursor-pointer touch-none"
                onPointerDown={handleSeekPointerDown}
                onPointerMove={handleSeekPointerMove}
                onPointerUp={handleSeekPointerUp}
                onPointerCancel={handleSeekPointerUp}
                onPointerLeave={() => setSeekHoverTime(null)}
                onKeyDown={handleSeekBarKeyDown}
              >
                {tooltipTime != null && duration > 0 ? (
                  <div
                    className="pointer-events-none absolute -top-8 z-10 -translate-x-1/2 rounded-md bg-black/90 px-2 py-0.5 text-xs font-medium tabular-nums text-white shadow"
                    style={{ left: `${tooltipPercent}%` }}
                  >
                    {formatTime(tooltipTime)}
                  </div>
                ) : null}
                <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/25 transition-all duration-100 group-hover/seek:h-1.5">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-white/50"
                    style={{ width: `${bufferedPercent}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-[#f00]"
                    style={{ width: `${playedPercent}%` }}
                  />
                </div>
                <div
                  className={`pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md transition-opacity ${
                    dragTime != null ? 'opacity-100' : 'opacity-0 group-hover/seek:opacity-100'
                  }`}
                  style={{ left: `${playedPercent}%` }}
                />
              </div>

              {/* 按钮行 */}
              <div className="flex items-center justify-between gap-2 px-3 pb-0.5">
                <div className="flex min-w-0 items-center">
                  <button
                    type="button"
                    aria-label={playing ? zh('暂停', 'Pause') : zh('播放', 'Play')}
                    onClick={() => actionsRef.current?.togglePlay()}
                    className={iconButtonClass}
                  >
                    {playing ? (
                      <PauseIcon style={{ fontSize: 30 }} />
                    ) : (
                      <PlayArrowIcon style={{ fontSize: 30 }} />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={zh('后退 10 秒', 'Back 10 seconds')}
                    onClick={() => actionsRef.current?.seekBy(-SEEK_STEP_SECONDS)}
                    className={`${iconButtonClass} pointer-coarse:hidden`}
                  >
                    <Replay10Icon />
                  </button>
                  <button
                    type="button"
                    aria-label={zh('前进 10 秒', 'Forward 10 seconds')}
                    onClick={() => actionsRef.current?.seekBy(SEEK_STEP_SECONDS)}
                    className={`${iconButtonClass} pointer-coarse:hidden`}
                  >
                    <Forward10Icon />
                  </button>

                  {/* 音量 */}
                  <div className="group/vol relative flex items-center">
                    <button
                      type="button"
                      aria-label={
                        muted || volume === 0 ? zh('取消静音', 'Unmute') : zh('静音', 'Mute')
                      }
                      onClick={() => actionsRef.current?.toggleMute()}
                      className={iconButtonClass}
                    >
                      {muted || volume === 0 ? (
                        <VolumeOffIcon />
                      ) : volume < 0.5 ? (
                        <VolumeDownIcon />
                      ) : (
                        <VolumeUpIcon />
                      )}
                    </button>
                    <div className="flex w-0 items-center overflow-hidden opacity-0 transition-all duration-200 group-hover/vol:w-24 group-hover/vol:opacity-100 pointer-coarse:w-16 pointer-coarse:opacity-100">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={muted ? 0 : volume}
                        onChange={(event) => actionsRef.current?.setVolumeLevel(event.target.value)}
                        aria-label={zh('音量', 'Volume')}
                        className="h-1 w-16 cursor-pointer accent-white pointer-coarse:w-12"
                      />
                    </div>
                  </div>

                  <div className="ml-1 whitespace-nowrap text-xs font-medium tabular-nums text-white/90">
                    <span>{formatTime(displayTime)}</span>
                    <span className="mx-0.5 text-white/60">/</span>
                    <span className="text-white/60">{formatTime(duration)}</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    aria-label={zh('截图', 'Screenshot')}
                    title={
                      screenshotHotkeyLabel
                        ? `${zh('截图', 'Screenshot')} (${screenshotHotkeyLabel})`
                        : zh('截图', 'Screenshot')
                    }
                    onClick={() => actionsRef.current?.captureScreenshot()}
                    className={iconButtonClass}
                  >
                    <PhotoCameraIcon />
                  </button>

                  {/* 播放速度菜单 */}
                  <div className="relative">
                    <button
                      type="button"
                      aria-label={zh('播放速度', 'Playback speed')}
                      onClick={() => {
                        setMenuOpen(menuOpen === 'speed' ? null : 'speed')
                        showControls()
                      }}
                      className={iconButtonClass}
                    >
                      <SettingsIcon />
                    </button>
                    {menuOpen === 'speed' ? (
                      <div className="absolute bottom-12 right-0 z-30 w-40 overflow-hidden rounded-xl border border-white/10 bg-black/90 py-1.5 shadow-2xl backdrop-blur-sm">
                        <div className="px-3.5 pb-1 pt-1 text-xs font-semibold uppercase tracking-wider text-white/60">
                          {zh('播放速度', 'Playback speed')}
                        </div>
                        {PLAYBACK_RATES.map((rate) => {
                          const active = rate === playbackRate
                          return (
                            <button
                              key={rate}
                              type="button"
                              onClick={() => {
                                actionsRef.current?.setRate(rate)
                                setMenuOpen(null)
                                scheduleHideControls()
                              }}
                              className={`flex w-full items-center justify-between px-3.5 py-1.5 text-sm transition-colors hover:bg-white/10 ${
                                active ? 'font-semibold text-white' : 'text-white/80'
                              }`}
                            >
                              <span>{rate}x</span>
                              {active ? <CheckIcon fontSize="small" /> : null}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    aria-label={
                      isFullscreen ? zh('退出全屏', 'Exit fullscreen') : zh('全屏', 'Fullscreen')
                    }
                    onClick={() => actionsRef.current?.toggleFullscreen()}
                    className={iconButtonClass}
                  >
                    {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
