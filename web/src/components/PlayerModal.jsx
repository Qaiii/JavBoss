import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import CheckIcon from '@mui/icons-material/Check'
import ClosedCaptionIcon from '@mui/icons-material/ClosedCaption'
import DownloadIcon from '@mui/icons-material/Download'
import Forward10Icon from '@mui/icons-material/Forward10'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import PauseIcon from '@mui/icons-material/Pause'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import PictureInPictureAltIcon from '@mui/icons-material/PictureInPictureAlt'
import PictureInPictureAltOutlinedIcon from '@mui/icons-material/PictureInPictureAltOutlined'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay'
import PreviewIcon from '@mui/icons-material/Preview'
import Replay10Icon from '@mui/icons-material/Replay10'
import ReplayIcon from '@mui/icons-material/Replay'
import SearchIcon from '@mui/icons-material/Search'
import SettingsIcon from '@mui/icons-material/Settings'
import VolumeDownIcon from '@mui/icons-material/VolumeDown'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import {
  createVideoScreenshot,
  fetchJavSubtitleDetail,
  fetchLocalSubtitles,
  fetchPlaybackInfo,
  fetchVideoFrame,
  saveJavSubtitle,
  searchJavSubtitles,
} from '@/api'
import { useStore } from '@/store'
import { buildVideoFullPath, getPlayerDisplayName } from '@/utils/display'
import { javTitlePrefersChinese } from '@/utils/jav'
import {
  PLAYER_HOTKEY_ACTIONS,
  formatPlayerHotkeyKey,
  normalizePlayerHotkeyKey,
  parsePlayerHotkeys,
} from '@/utils/playerHotkeys'
import {
  applyPipWindowBaseStyles,
  copyStylesToDocument,
  getDocumentPipWindowSize,
  isDocumentPictureInPictureSupported,
  isVideoPictureInPictureSupported,
  clampPipPosition,
  clampPipWidth,
  loadStoredPipSize,
  pipResizeMaxWidth,
  resizeDocumentPipWindow,
  saveStoredPipSize,
  PIP_DEFAULT_WIDTH,
  PIP_MARGIN,
} from '@/utils/playerPip'
import { selectPlaybackSource, startBrowserPlayback } from '@/utils/browserPlayback'
import useOverlayHistory from '@/hooks/useOverlayHistory'
import { zh } from '@/utils/i18n'
import { getErrorMessage } from '@/utils/errors'
import {
  DEFAULT_SUBTITLE_STYLE,
  loadSubtitleStyle,
  saveSubtitleStyle,
  subtitleStyleCssVars,
} from '@/utils/subtitleStyle'
import SubtitleStylePanel from '@/components/SubtitleStylePanel'

const VOLUME_STORAGE_KEY = 'javboss.player.volume'
const CONTROLS_HIDE_DELAY_MS = 3000
const SEEK_STEP_SECONDS = 10
const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
// 方向键：左右点按快退/快进、上下点按调音量；长按先短暂停顿再进入持续调节
const ARROW_SEEK_STEP_SECONDS = 5
const ARROW_VOLUME_STEP = 0.05
const ARROW_HOLD_DELAY_MS = 350
const ARROW_HOLD_INTERVAL_MS = 100

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
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-app-hover/15 pointer-coarse:h-8 pointer-coarse:w-8'

function isPlayerChromeTarget(target) {
  return Boolean(
    target && typeof target.closest === 'function' && target.closest('[data-player-chrome]')
  )
}

const HOTKEY_HINT_DURATION_MS = 5000

function formatSignedAmount(amount) {
  return amount > 0 ? `+${amount}` : String(amount)
}

export default function PlayerModal({
  video,
  startTime = 0,
  episodes = [],
  onSwitchVideo,
  onClose,
  hotkeys = null,
  showHotkeyHint = true,
  onPlaybackError,
}) {
  const preferChineseTitle = useStore((state) => javTitlePrefersChinese(state.config))
  const playerHostRef = useRef(null)
  const playerRef = useRef(null)
  const shellRef = useRef(null)
  const seekBarRef = useRef(null)
  // 悬停预览气泡元素：测量其宽度，用于在进度条两端贴边不超出
  const seekTooltipRef = useRef(null)
  const overlayRef = useRef(null)
  const hotkeyMapRef = useRef(new Map())
  const hideTimerRef = useRef(null)
  const pointerOnChromeRef = useRef(false)
  const suppressShowUntilRef = useRef(0)
  const clickTimerRef = useRef(null)
  const dragRef = useRef({ active: false })
  const menuOpenRef = useRef(null)
  const subMenuRef = useRef(null)
  const screenshotInFlightRef = useRef(false)
  const screenshotNoticeTimerRef = useRef(null)
  const pendingSeekTimerRef = useRef(null)
  const pipCardRef = useRef(null)
  const pipDragRef = useRef({ active: false, offsetX: 0, offsetY: 0 })
  const pipResizeRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startWidth: 0,
    startHeight: 0,
  })
  const isPiPRef = useRef(false)
  const pipKindRef = useRef('inline')
  const documentPipWindowRef = useRef(null)
  const resumePositionRef = useRef(0)
  const exitPipModeRef = useRef(() => {})
  const subNoticeTimerRef = useRef(null)
  const subRetryRef = useRef(null)
  // 当前 playbackInfo 对应的播放标识（video.id:location_id）。选集/切换文件时，
  // 播放信息尚未加载完成前禁止用旧 source 重建播放器，避免闪现旧视频。
  const playbackInfoKeyRef = useRef('')
  // 进度条悬停预览：按整秒缓存的抽帧 objectURL、在途请求/定时器/悬停状态
  const frameCacheRef = useRef(new Map())
  const framePreviewTimerRef = useRef(null)
  const frameAbortRef = useRef(null)
  const framePendingSecondRef = useRef(null)
  const frameDesiredSecondRef = useRef(null)
  const frameHoverActiveRef = useRef(false)
  // 互引用打破依赖环：分别保存最新的抽帧请求与续排调度，供定时器/回调调用
  const frameFetcherRef = useRef(null)
  const frameSchedulerRef = useRef(null)
  // 最近一次提取失败的整秒：失败后悬停期间不无限重试，切换秒位才重新尝试
  const frameFailedSecondRef = useRef(null)

  // 乐观 seek：设置播放器时间后立即更新 UI，并启动兑底定时器——若 5 秒内
  // 仍未定位完成（HLS 转码流定位慢），回落到播放器真实时间，避免永久卡住。
  // 注意：必须在所有 useEffect 之前定义（播放器 effect 的依赖数组会引用它，
  // 否则 const 处于暂时性死区，组件初始化即崩溃）。
  const applySeek = useCallback((time) => {
    const player = playerRef.current
    if (!player) return
    let next = Number(time) || 0
    const durationVal = player.duration()
    if (Number.isFinite(durationVal)) {
      next = Math.min(Math.max(0, next), durationVal)
    } else {
      next = Math.max(0, next)
    }
    player.currentTime(next)
    setPendingSeekTime(next)
    if (pendingSeekTimerRef.current) {
      window.clearTimeout(pendingSeekTimerRef.current)
    }
    pendingSeekTimerRef.current = window.setTimeout(() => {
      pendingSeekTimerRef.current = null
      setPendingSeekTime(null)
    }, 5000)
  }, [])
  const actionsRef = useRef(null)
  // App 侧传入的 onClose / onPlaybackError 通常是内联箭头函数，每次渲染引用都会变。
  // 若直接作为 effect 依赖，会导致播放器反复 dispose/重建（video.js 会移除 DOM，
  // 重建时拿到已脱离文档的元素而失败，播放区变黑），因此用 ref 保存最新回调。
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onPlaybackErrorRef = useRef(onPlaybackError)
  onPlaybackErrorRef.current = onPlaybackError
  const handleClose = useCallback(() => {
    exitPipModeRef.current()
    onCloseRef.current()
  }, [])
  const [playbackInfo, setPlaybackInfo] = useState(null)
  const [playbackError, setPlaybackError] = useState('')
  const [loadingPlayback, setLoadingPlayback] = useState(false)
  // ---- 字幕 ----
  const [localSubtitles, setLocalSubtitles] = useState([])
  const [activeSubtitle, setActiveSubtitle] = useState(null) // { kind:'local', name } | { kind:'online', id }
  const [subSearchItems, setSubSearchItems] = useState([])
  const [subSearchQuery, setSubSearchQuery] = useState('')
  const [subDetailTracks, setSubDetailTracks] = useState({}) // { [code]: { loading, title, tracks, lookupCode, error } }
  const [subMenu, setSubMenu] = useState(null) // null | 'local' | 'search' | 'style'
  const [subSearchBusy, setSubSearchBusy] = useState(false)
  const [subPreview, setSubPreview] = useState(null) // { label, text }
  const [subNotice, setSubNotice] = useState('')
  const [subtitleStyle, setSubtitleStyle] = useState(loadSubtitleStyle)
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
  const [menuOpen, setMenuOpen] = useState(null) // null | 'speed' | 'episodes'
  const [seekHoverTime, setSeekHoverTime] = useState(null)
  const [dragTime, setDragTime] = useState(null)
  const [framePreview, setFramePreview] = useState(null) // 悬停预览帧的 objectURL
  // 悬停气泡实测宽度与进度条宽度（px），用于两端贴边 clamp；null 表示未测量
  const [tooltipBox, setTooltipBox] = useState(null) // { tooltipW, barW }
  // 乐观 seek：点击进度条后立即把 UI 钉在目标位置，避免 HLS 等流定位期间
  // 进度条先退回旧位置再跳过去的视觉抖动；定位完成（seeked/追平）后清除。
  const [pendingSeekTime, setPendingSeekTime] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPiP, setIsPiP] = useState(false)
  const [pipKind, setPipKind] = useState('inline')
  const [pipPortalEl, setPipPortalEl] = useState(null)
  const [pipPosition, setPipPosition] = useState(null)
  const [pipSize, setPipSize] = useState(() => loadStoredPipSize())
  // 精细指针（鼠标）设备：有“移出播放区域”概念，用于移出即隐藏控制条
  const [isFinePointer] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches
  )
  // 全屏遮罩打开时压一条同 URL 历史，鼠标侧键/浏览器后退先关播放器，不把底下页面退走。
  // 画中画时页面可见，把这条历史弹掉，让后退继续翻页。
  useOverlayHistory(Boolean(video) && !isPiP, handleClose)
  const normalizedHotkeys = useMemo(() => parsePlayerHotkeys(hotkeys), [hotkeys])
  const screenshotHotkeyLabel = useMemo(() => {
    const item = normalizedHotkeys.find(
      (entry) => entry.action === PLAYER_HOTKEY_ACTIONS.SCREENSHOT
    )
    return item ? formatPlayerHotkeyKey(item.key) : ''
  }, [normalizedHotkeys])
  const [hotkeyHintVisible, setHotkeyHintVisible] = useState(false)
  const hotkeyHintLines = useMemo(() => {
    const lines = normalizedHotkeys.map((item) => {
      const key = formatPlayerHotkeyKey(item.key)
      const amount = formatSignedAmount(item.amount)
      if (item.action === PLAYER_HOTKEY_ACTIONS.SEEK) {
        return zh(`${key}：进度 ${amount} 秒`, `${key}: Seek ${amount} seconds`)
      }
      if (item.action === PLAYER_HOTKEY_ACTIONS.VOLUME) {
        return zh(`${key}：音量 ${amount}%`, `${key}: Volume ${amount}%`)
      }
      return zh(`${key}：截图`, `${key}: Screenshot`)
    })
    lines.push(zh('空格：暂停/继续', 'Space: Pause/Resume'))
    lines.push(zh('ESC：退出播放器', 'ESC: Close player'))
    lines.push(zh('方向键：左右快退/快进 5 秒，上下调节音量', 'Arrow keys: seek 5s, volume'))
    lines.push(zh('长按方向键可持续调节', 'Hold arrow keys to repeat'))
    lines.push(
      zh(
        '你可在「设置 → 播放器 → 浏览器播放器」里关闭此信息显示',
        'You can hide this message under Settings → Player → Browser Player.'
      )
    )
    return lines
  }, [normalizedHotkeys])
  const selectedSource = useMemo(() => {
    const media = typeof document !== 'undefined' ? document.createElement('video') : null
    return selectPlaybackSource(playbackInfo, media)
  }, [playbackInfo])
  // 当前视频的 JAV 番号（如 SSIS-480）；无则空。用于搜索字幕时预填关键词。
  const videoJavCode = useMemo(
    () =>
      String(video?.jav?.code || video?.locations?.[0]?.jav?.code || video?.jav_code || '').trim(),
    [video]
  )
  // 播放标识：切换集数/文件时用于判断“当前正在播哪一部”
  const playbackKey = `${video?.id || 0}:${video?.location_id || 0}`
  // 同番号多文件：选集列表（去重后的可播文件）
  const episodeList = useMemo(() => {
    const seen = new Set()
    return (Array.isArray(episodes) ? episodes : []).filter((ep) => {
      if (!ep?.id) return false
      const key = ep.location_id ? String(ep.location_id) : `id:${ep.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [episodes])
  const activeEpisodeKey = video?.location_id ? String(video.location_id) : `id:${video?.id || 0}`

  // 切换播放文件（选集/换源）时，清除上一部视频遗留的字幕选择与菜单状态
  useEffect(() => {
    resumePositionRef.current = 0
    setActiveSubtitle(null)
    setSubMenu(null)
    setSubPreview(null)
    setSubNotice('')
    setMenuOpen(null)
  }, [playbackKey])

  useEffect(() => {
    setHotkeyHintVisible(false)
    if (!showHotkeyHint || !video?.id || !selectedSource?.src) return undefined

    setHotkeyHintVisible(true)
    const timer = window.setTimeout(() => setHotkeyHintVisible(false), HOTKEY_HINT_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [selectedSource?.src, showHotkeyHint, video?.id])

  useEffect(() => {
    hotkeyMapRef.current = new Map(normalizedHotkeys.map((item) => [item.key, item]))
  }, [normalizedHotkeys])

  useEffect(() => {
    menuOpenRef.current = menuOpen
  }, [menuOpen])

  useEffect(() => {
    subMenuRef.current = subMenu
  }, [subMenu])

  useEffect(() => {
    isPiPRef.current = isPiP
  }, [isPiP])

  useEffect(() => {
    pipKindRef.current = pipKind
  }, [pipKind])

  useEffect(() => {
    return () => {
      if (screenshotNoticeTimerRef.current) {
        window.clearTimeout(screenshotNoticeTimerRef.current)
      }
      if (pendingSeekTimerRef.current) {
        window.clearTimeout(pendingSeekTimerRef.current)
      }
      if (subNoticeTimerRef.current) {
        window.clearTimeout(subNoticeTimerRef.current)
      }
      if (subRetryRef.current) {
        window.clearTimeout(subRetryRef.current)
      }
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current)
      }
      if (clickTimerRef.current) {
        window.clearTimeout(clickTimerRef.current)
      }
      const pipWindow = documentPipWindowRef.current
      documentPipWindowRef.current = null
      if (pipWindow && !pipWindow.closed) {
        try {
          pipWindow.close()
        } catch {
          // 忽略
        }
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
      if (dragRef.current.active || menuOpenRef.current || subMenuRef.current) {
        return
      }
      // 指针停在标题栏/控制条上时不要藏：藏了之后标题 pointer-events-none，
      // 浏览器会把指针当成落到视频上并补发 mousemove，界面立刻再出现，循环闪烁。
      if (pointerOnChromeRef.current) {
        scheduleHideControls()
        return
      }
      suppressShowUntilRef.current = performance.now() + 200
      setControlsVisible(false)
      setMenuOpen(null)
      setSubMenu(null)
      setSubPreview(null)
    }, CONTROLS_HIDE_DELAY_MS)
  }, [])

  const pokeControls = useCallback(() => {
    showControls()
    scheduleHideControls()
  }, [showControls, scheduleHideControls])

  const exitBrowserFullscreen = useCallback(() => {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {})
    } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
      document.webkitExitFullscreen()
    }
  }, [])

  const exitPipMode = useCallback(() => {
    const pipWindow = documentPipWindowRef.current
    documentPipWindowRef.current = null
    setPipPortalEl(null)
    if (pipWindow && !pipWindow.closed) {
      try {
        pipWindow.close()
      } catch {
        // 忽略关闭失败
      }
    }
    if (typeof document !== 'undefined' && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {})
    }
    setIsPiP(false)
    setPipKind('inline')
    setPipPosition(null)
  }, [])
  exitPipModeRef.current = exitPipMode

  const togglePip = useCallback(async () => {
    if (isPiPRef.current) {
      exitPipMode()
      pokeControls()
      return
    }
    exitBrowserFullscreen()
    setMenuOpen(null)
    setSubMenu((current) => (current === 'search' ? null : current))
    setSubPreview(null)

    const aspectRatio =
      videoSize && videoSize.height > 0 ? videoSize.width / videoSize.height : 16 / 9

    if (isDocumentPictureInPictureSupported()) {
      try {
        const size = getDocumentPipWindowSize(aspectRatio, loadStoredPipSize()?.width)
        const pipWindow = await window.documentPictureInPicture.requestWindow(size)
        copyStylesToDocument(pipWindow.document)
        applyPipWindowBaseStyles(pipWindow.document, {
          title: video ? getPlayerDisplayName(video, preferChineseTitle) : 'JavBoss',
        })
        documentPipWindowRef.current = pipWindow
        pipWindow.addEventListener(
          'pagehide',
          () => {
            if (documentPipWindowRef.current !== pipWindow) return
            documentPipWindowRef.current = null
            setPipPortalEl(null)
            setIsPiP(false)
            setPipKind('inline')
            setPipPosition(null)
            pokeControls()
          },
          { once: true }
        )
        setPipKind('document')
        setPipPortalEl(pipWindow.document.body)
        setIsPiP(true)
        pokeControls()
        return
      } catch {
        documentPipWindowRef.current = null
        setPipPortalEl(null)
      }
    }

    const techEl = playerRef.current?.tech(true)?.el()
    if (isVideoPictureInPictureSupported(techEl)) {
      try {
        techEl.disablePictureInPicture = false
        await techEl.requestPictureInPicture()
        setPipKind('video')
        setIsPiP(true)
        pokeControls()
        return
      } catch {
        // 回落到页内浮层
      }
    }

    setPipKind('inline')
    setIsPiP(true)
    pokeControls()
  }, [exitBrowserFullscreen, exitPipMode, pokeControls, preferChineseTitle, video, videoSize])
  const togglePipRef = useRef(togglePip)
  togglePipRef.current = togglePip

  const showSubNotice = useCallback((message) => {
    if (subNoticeTimerRef.current) {
      window.clearTimeout(subNoticeTimerRef.current)
    }
    setSubNotice(message)
    subNoticeTimerRef.current = window.setTimeout(() => {
      subNoticeTimerRef.current = null
      setSubNotice('')
    }, 2000)
  }, [])

  const updateSubtitleStyle = useCallback((patch) => {
    setSubtitleStyle((prev) => saveSubtitleStyle({ ...prev, ...patch }))
  }, [])

  const resetSubtitleStyle = useCallback(() => {
    setSubtitleStyle(saveSubtitleStyle(DEFAULT_SUBTITLE_STYLE))
  }, [])

  // 打开播放器时加载同目录本地字幕
  useEffect(() => {
    let cancelled = false
    if (!video?.id) {
      setLocalSubtitles([])
      return undefined
    }
    fetchLocalSubtitles(video.id)
      .then((items) => {
        if (!cancelled) setLocalSubtitles(items)
      })
      .catch(() => {}) // 本地字幕加载失败不打扰播放
    return () => {
      cancelled = true
    }
  }, [video])

  // 播放器准备好了之后：把当前字幕 track 的显示状态同步为 activeSubtitle
  const applyActiveSubtitleToTracks = useCallback((player, active) => {
    if (!player || !player.textTracks) return
    let set = false
    for (const track of player.textTracks()) {
      const want =
        active != null && active.kind === 'local'
          ? track.label === active.name
          : active != null && active.kind === 'online'
            ? track.label === `online:${active.id}`
            : false
      track.mode = want ? 'showing' : 'hidden'
      if (want) set = true
    }
    if (active != null && !set) {
      // 目标 track 尚未加载（如刚选完在线字幕、网络慢）：先隐藏全部，等加载后再次应用
      for (const track of player.textTracks()) track.mode = 'hidden'
      if (subRetryRef.current) window.clearTimeout(subRetryRef.current)
      subRetryRef.current = window.setTimeout(() => {
        applyActiveSubtitleToTracks(playerRef.current, active)
      }, 500)
    }
  }, [])

  // 播放/切换一条字幕（local 或 online）。online 只建立远程 track，内容经后端代理转换。
  const playSubtitle = useCallback(
    (target) => {
      const player = playerRef.current
      if (!player || !video?.id) return
      if (target == null) {
        setActiveSubtitle(null)
        setSubMenu(null)
        setMenuOpen(null)
        applyActiveSubtitleToTracks(player, null)
        return
      }
      if (target.kind === 'local') {
        const base = `/videos/${video.id}/subtitles/vtt?name=${encodeURIComponent(target.name)}`
        const tracks = player.textTracks()
        const existing = Array.from(tracks || []).find((t) => t.label === target.name)
        if (existing) {
          setActiveSubtitle(target)
          setSubMenu(null)
          setMenuOpen(null)
          applyActiveSubtitleToTracks(player, target)
          return
        }
        player.addRemoteTextTrack(
          {
            kind: 'subtitles',
            label: target.name,
            language: 'zh',
            src: base,
            mode: 'showing',
            default: true,
          },
          true
        )
        setActiveSubtitle(target)
        setSubMenu(null)
        setMenuOpen(null)
      } else if (target.kind === 'online') {
        const base = `/videos/${video.id}/subtitles/vtt?code=${encodeURIComponent(
          target.code
        )}&subtitle_id=${encodeURIComponent(target.id)}`
        const tracks = player.textTracks()
        const existing = Array.from(tracks || []).find((t) => t.label === `online:${target.id}`)
        if (existing) {
          setActiveSubtitle(target)
          setSubMenu(null)
          setMenuOpen(null)
          applyActiveSubtitleToTracks(player, target)
          return
        }
        player.addRemoteTextTrack(
          {
            kind: 'subtitles',
            label: `online:${target.id}`,
            language: target.languageTag || 'zh',
            src: base,
            mode: 'showing',
            default: true,
          },
          true
        )
        setActiveSubtitle(target)
        setSubMenu(null)
        setMenuOpen(null)
      }
    },
    [video, applyActiveSubtitleToTracks]
  )

  // 搜索在线字幕：默认用当前视频番号，允许手动改关键词
  const runSubtitleSearch = useCallback(
    async (overrideQuery) => {
      if (!video?.id) return
      let query = (overrideQuery ?? subSearchQuery ?? '').trim()
      if (!query && videoJavCode) {
        query = videoJavCode // 输入为空时回退到番号，方便直接回车搜索
      }
      if (!query) {
        showSubNotice(zh('请输入番号或关键词', 'Enter a movie code or keyword'))
        return
      }
      setSubSearchBusy(true)
      setSubSearchItems([])
      setSubDetailTracks({})
      setSubPreview(null)
      pokeControls()
      try {
        const data = await searchJavSubtitles(video.id, { query })
        const items = Array.isArray(data?.items) ? data.items : []
        setSubSearchItems(items)
        if (items.length === 0) {
          showSubNotice(
            zh('未找到字幕，可尝试其他关键词', 'No subtitles found, try another keyword')
          )
        }
      } catch (err) {
        showSubNotice(getErrorMessage(err))
      } finally {
        setSubSearchBusy(false)
      }
    },
    [video, subSearchQuery, videoJavCode, showSubNotice, pokeControls]
  )

  // 打开搜索字幕 tab：把输入框预填为当前视频番号（若已填别的内容则保留）
  const openSubtitleSearch = useCallback(() => {
    if (isPiPRef.current) {
      exitPipModeRef.current()
      pokeControls()
    }
    setSubMenu('search')
    setSubSearchQuery((prev) => {
      const trimmed = String(prev ?? '').trim()
      return trimmed || videoJavCode
    })
  }, [videoJavCode, pokeControls])

  // 加载某部影片的语言轨道列表（行内展开在搜索列表里，保持搜索面板不切换）
  const openSubtitleDetail = useCallback(
    async (item) => {
      if (!video?.id) return
      const rowCode = String(item?.code || '').trim()
      if (!rowCode) return
      const lookupCode = String(item?.canonical_code || item?.code || '').trim() || rowCode
      setSubMenu('search')
      setSubPreview(null)
      pokeControls()
      setSubDetailTracks((prev) => ({
        ...prev,
        [rowCode]: { ...(prev?.[rowCode] || {}), loading: true, error: '', lookupCode },
      }))
      try {
        const data = await fetchJavSubtitleDetail(video.id, lookupCode)
        const tracks = Array.isArray(data?.subtitles) ? data.subtitles : []
        setSubDetailTracks((prev) => ({
          ...prev,
          [rowCode]: {
            loading: false,
            title: data?.title || rowCode,
            tracks,
            lookupCode: data?.code || lookupCode,
          },
        }))
      } catch (err) {
        setSubDetailTracks((prev) => ({
          ...prev,
          [rowCode]: { loading: false, error: getErrorMessage(err), lookupCode },
        }))
      }
    },
    [video, pokeControls]
  )

  // 预览字幕文本（转成 SRT 便于阅读）
  const previewSubtitle = useCallback(
    async (target) => {
      if (!video?.id) return
      setSubPreview({
        label: target.name || target.label || target.id,
        text: zh('加载中…', 'Loading...'),
      })
      try {
        let res
        if (target.kind === 'local') {
          res = await fetch(
            `/videos/${video.id}/subtitles/vtt?name=${encodeURIComponent(target.name)}`,
            {
              cache: 'no-store',
            }
          )
        } else {
          res = await fetch(
            `/videos/${video.id}/subtitles/vtt?code=${encodeURIComponent(target.code)}&subtitle_id=${encodeURIComponent(
              target.id
            )}`,
            { cache: 'no-store' }
          )
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const text = await res.text()
        // 后端对本地字幕转的是 VTT；预览时转成 SRT 更易读
        setSubPreview({ label: target.name || target.label || target.id, text })
      } catch (err) {
        setSubPreview({
          label: target.name || target.label || target.id,
          text: getErrorMessage(err),
        })
      }
    },
    [video]
  )

  // 保存在线字幕到视频同目录，命名 <番号>.srt；本地已有同名文件时后端会自动加后缀不覆盖
  const saveSubtitle = useCallback(
    async (target) => {
      if (!video?.id) return
      try {
        const result = await saveJavSubtitle(video.id, {
          code: target.code,
          subtitleId: target.id,
          format: 'srt',
        })
        showSubNotice(zh(`已保存 ${result?.name || ''}`, `Saved ${result?.name || ''}`))
        // 保存后刷新本地列表，方便立刻切换
        try {
          const items = await fetchLocalSubtitles(video.id)
          setLocalSubtitles(items)
        } catch {
          // 忽略刷新失败
        }
      } catch (err) {
        showSubNotice(getErrorMessage(err))
      }
    },
    [video, showSubNotice]
  )

  // 视频区交互（移动/点击唤出控制条、移出隐藏、单击播放暂停、双击全屏）。
  // 用原生事件挂在节点上而不是 JSX 属性，避免 eslint 对非交互元素的告警。
  // 显隐必须听整张播放卡片（含标题栏、关闭按钮），不能只听 shell：
  // 标题栏叠在 shell 外面，指针移上去时 shell 会 mouseleave，控制条立刻藏起，
  // 标题随之 pointer-events-none，指针又落到 shell 上 → 循环闪烁。
  // 点击/触摸仍挂在 shell 上，避免点标题误触播放或全屏。
  // PlayerModal 在 App 中始终挂载（video 为 null 时返回 null），必须以 video
  // 为依赖，等弹窗真正打开后再绑定。
  useEffect(() => {
    if (!video) return undefined
    const shell = shellRef.current
    const card = pipCardRef.current
    if (!shell || !card) return undefined

    const isExcludedTarget = (event) =>
      event.target instanceof Element &&
      Boolean(event.target.closest('button, input, [role="slider"], .player-controls'))

    // 记录指针是否曾在卡片内移动过：卡片在 videoSize 加载后会改变尺寸
    // （如竖屏视频从 16:9 变 9:16），若指针静止，浏览器也会因几何变化触发
    // mouseleave —— 这种“假移出”不应隐藏控制条。只有指针真的移动出播放区域才隐藏。
    let pointerMovedInside = false

    const handleMouseMove = (event) => {
      if (performance.now() < suppressShowUntilRef.current) return
      pointerMovedInside = true
      pointerOnChromeRef.current = isPlayerChromeTarget(event.target)
      pokeControls()
    }

    const handleMouseEnter = () => {
      pointerMovedInside = false
    }

    // 光标移出整张播放卡片：立即隐藏控制条（桌面设备；触摸设备无移出概念）
    const handleMouseLeave = () => {
      pointerOnChromeRef.current = false
      if (!isFinePointer) return
      if (!pointerMovedInside) return
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      suppressShowUntilRef.current = performance.now() + 200
      setControlsVisible(false)
      setMenuOpen(null)
      setSubMenu(null)
      setSubPreview(null)
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

    card.addEventListener('mousemove', handleMouseMove)
    card.addEventListener('mouseenter', handleMouseEnter)
    card.addEventListener('mouseleave', handleMouseLeave)
    shell.addEventListener('touchstart', handleTouchStart, { passive: true })
    shell.addEventListener('touchend', handleTouchEnd, { passive: true })
    shell.addEventListener('click', handleClick)
    shell.addEventListener('dblclick', handleDblClick)

    return () => {
      card.removeEventListener('mousemove', handleMouseMove)
      card.removeEventListener('mouseenter', handleMouseEnter)
      card.removeEventListener('mouseleave', handleMouseLeave)
      shell.removeEventListener('touchstart', handleTouchStart)
      shell.removeEventListener('touchend', handleTouchEnd)
      shell.removeEventListener('click', handleClick)
      shell.removeEventListener('dblclick', handleDblClick)
      if (clickTimerRef.current) {
        window.clearTimeout(clickTimerRef.current)
        clickTimerRef.current = null
      }
    }
  }, [pokeControls, isFinePointer, video, pipPortalEl])

  // 打开播放器时：控制条默认显示，3 秒无操作后自动隐藏。
  // 同样以 video 为依赖：挂载时 video 为 null（弹窗未渲染），若只在挂载时 poke，
  // 定时器会在弹窗打开前就耗尽，导致打开后控制条直接处于隐藏状态。
  useEffect(() => {
    if (!video) return undefined
    pokeControls()
  }, [pokeControls, video, pipPortalEl])

  useEffect(() => {
    if (!video?.id) {
      playbackInfoKeyRef.current = ''
      setPlaybackInfo(null)
      setPlaybackError('')
      setLoadingPlayback(false)
      setScreenshotNotice(false)
      setVideoSize(null)
      exitPipModeRef.current()
      setLocalSubtitles([])
      setActiveSubtitle(null)
      setSubSearchItems([])
      setSubSearchQuery('')
      setSubDetailTracks({})
      setSubMenu(null)
      setSubPreview(null)
      setSubNotice('')
      setActiveSubtitle(null)
      return
    }

    let cancelled = false
    const fetchKey = `${video.id}:${video.location_id || ''}`
    playbackInfoKeyRef.current = ''
    setLoadingPlayback(true)
    setPlaybackError('')
    setPlaybackInfo(null)
    setScreenshotNotice(false)
    setVideoSize(null)

    fetchPlaybackInfo(video.id, { locationId: video.location_id })
      .then((info) => {
        if (cancelled) return
        playbackInfoKeyRef.current = fetchKey
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

  // ---- 进度条悬停预览 ----
  // 悬停进度条时按整秒请求该时间点的一帧画面（GET /videos/:id/frame，后端不落盘）。
  // 指针进入一个整秒并停留满 FRAME_PREVIEW_DWELL_MS 后才请求该帧；同一秒内的微小
  // 移动不重置计时（避免手抖导致永不加载），滑动跨越多个秒时不发请求并立即清掉旧图，
  // 停稳到某一秒后才加载该秒画面。帧按整秒缓存为 objectURL，重复悬停直接命中缓存。
  const FRAME_PREVIEW_DWELL_MS = 150
  const FRAME_PREVIEW_CACHE_LIMIT = 30

  const cancelFrameHover = useCallback(() => {
    frameHoverActiveRef.current = false
    frameDesiredSecondRef.current = null
    if (framePreviewTimerRef.current) {
      window.clearTimeout(framePreviewTimerRef.current)
      framePreviewTimerRef.current = null
    }
  }, [])

  const clearFrameCache = useCallback(() => {
    cancelFrameHover()
    frameAbortRef.current?.abort()
    frameAbortRef.current = null
    framePendingSecondRef.current = null
    frameCacheRef.current.forEach((url) => URL.revokeObjectURL(url))
    frameCacheRef.current.clear()
    setFramePreview(null)
  }, [cancelFrameHover])

  // 真正的抽帧请求：同一时刻至多一个在途请求（单飞）。完成或中止后都会触发
  // scheduleForDesired，保证为最新悬停位置继续加载；失败记录到 frameFailedSecondRef，
  // 悬停期间不无限重试，只有切换秒位后才重新尝试。
  const fetchFrameAt = useCallback(
    async (second) => {
      if (!video?.id || framePendingSecondRef.current != null) return
      framePendingSecondRef.current = second
      const controller = new AbortController()
      frameAbortRef.current = controller
      try {
        const blob = await fetchVideoFrame(video.id, {
          second,
          locationId: video.location_id,
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        const url = URL.createObjectURL(blob)
        if (frameCacheRef.current.size >= FRAME_PREVIEW_CACHE_LIMIT) {
          const oldestKey = frameCacheRef.current.keys().next().value
          URL.revokeObjectURL(frameCacheRef.current.get(oldestKey))
          frameCacheRef.current.delete(oldestKey)
        }
        frameCacheRef.current.set(second, url)
        if (frameHoverActiveRef.current && frameDesiredSecondRef.current === second) {
          setFramePreview(url)
        }
      } catch (err) {
        // 预览尽力而为：提取失败（含中止）时静默，不打扰播放
        if (!err || err.name !== 'AbortError') {
          frameFailedSecondRef.current = second
        }
      } finally {
        if (frameAbortRef.current === controller) frameAbortRef.current = null
        if (framePendingSecondRef.current === second) framePendingSecondRef.current = null
        // 悬停位置可能已移走，或当前秒的帧刚就绪/失败：为最新位置续排
        frameSchedulerRef.current?.()
      }
    },
    [video]
  )

  // 为“当前悬停的整秒”安排加载：已有缓存立即显示；未缓存则悬停满
  // FRAME_PREVIEW_DWELL_MS 后请求。同一时刻只保留一个排程。
  const scheduleForDesired = useCallback(() => {
    const desired = frameDesiredSecondRef.current
    if (!frameHoverActiveRef.current || desired == null) return
    const cached = frameCacheRef.current.get(desired)
    if (cached) {
      setFramePreview(cached)
      return
    }
    if (frameFailedSecondRef.current === desired) return
    if (framePendingSecondRef.current != null) return // 在途：其 finally 会续排
    if (framePreviewTimerRef.current) return // 已有排程
    framePreviewTimerRef.current = window.setTimeout(() => {
      framePreviewTimerRef.current = null
      frameFetcherRef.current?.(frameDesiredSecondRef.current)
    }, FRAME_PREVIEW_DWELL_MS)
  }, [])

  // 悬停/拖拽入口：仅当整秒变化时才动作（同一秒内移动不重置计时，保持
  // “悬停满 150ms”的语义）。进入新秒：立即清掉上一位置的预览图、取消其排程与
  // 在途请求，再为该秒安排加载——滑动过程中不会一直停留在起始位置的那张旧图。
  const requestFramePreview = useCallback(
    (second) => {
      if (!video?.id || !duration || duration <= 0 || !Number.isFinite(second)) return
      if (isPiPRef.current) return
      const rounded = Math.min(Math.max(0, Math.round(second)), Math.floor(duration))
      frameHoverActiveRef.current = true
      if (frameDesiredSecondRef.current === rounded) return
      frameDesiredSecondRef.current = rounded
      frameFailedSecondRef.current = null
      setFramePreview(null)
      if (framePreviewTimerRef.current) {
        window.clearTimeout(framePreviewTimerRef.current)
        framePreviewTimerRef.current = null
      }
      frameAbortRef.current?.abort() // 中止上一秒的在途请求，释放服务端 ffmpeg
      scheduleForDesired()
    },
    [video, duration, scheduleForDesired]
  )

  // fetchFrameAt 与 scheduleForDesired 经定时器互相调用，用 ref 保存最新实现以打破依赖环
  useEffect(() => {
    frameFetcherRef.current = fetchFrameAt
    frameSchedulerRef.current = scheduleForDesired
  })

  // 悬停气泡贴边：气泡是绝对定位并以 left 百分比居中（-translate-x-1/2）。
  // 记录气泡自身宽度后，将 left 的基准点 clamp 在 [半个气泡宽, 进度条宽-半个气泡宽]，
  // 使悬停到进度条最左/最右端时气泡边缘不超出进度条（进而不会超出视频与屏幕）。
  // 气泡是悬停时才渲染、预览帧异步加载后才变宽，因此须在这些时机重新测量：
  // 否则按旧（窄）宽度 clamp，预览图加载后实际更宽，最左端时左侧会溢出被裁切。
  const tooltipVisible = (seekHoverTime != null || dragTime != null) && duration > 0
  useLayoutEffect(() => {
    const tooltip = seekTooltipRef.current
    const bar = seekBarRef.current
    if (!tooltip || !bar || !tooltipVisible) return
    const tooltipW = tooltip.offsetWidth
    const barW = bar.clientWidth
    if (!tooltipW || !barW) return
    setTooltipBox((prev) =>
      prev && prev.tooltipW === tooltipW && prev.barW === barW ? prev : { tooltipW, barW }
    )
  }, [duration, tooltipVisible, framePreview])

  useEffect(() => {
    const host = playerHostRef.current
    if (!video || !host || !selectedSource?.src) return
    // 切换文件后播放信息未加载完前，不基于旧 source 重建播放器
    if (playbackInfoKeyRef.current !== playbackKey) return

    // video.js 会改写 <video> 及其包装节点。这些节点必须由我们创建并挂在
    // React 不管的宿主里；dispose 也只拆这块，不碰宿主。否则切换片源时
    // React 提交 removeChild 会抛错，整页白屏。
    const ownerDoc = host.ownerDocument || document
    const wrapper = ownerDoc.createElement('div')
    wrapper.setAttribute('data-vjs-player', '')
    wrapper.className = 'h-full w-full'
    const videoEl = ownerDoc.createElement('video')
    videoEl.className = 'video-js h-full w-full'
    videoEl.playsInline = true
    videoEl.disablePictureInPicture = pipKindRef.current !== 'video'
    const captionTrack = ownerDoc.createElement('track')
    captionTrack.kind = 'captions'
    videoEl.appendChild(captionTrack)
    wrapper.appendChild(videoEl)
    host.appendChild(wrapper)

    const player = videojs(videoEl, {
      controls: false, // 使用自绘 YouTube 风格控制条
      autoplay: true,
      preload: 'auto',
      bigPlayButton: false,
    })

    playerRef.current = player
    const fallback =
      selectedSource.kind === 'direct'
        ? playbackInfo?.sources?.find((item) => item.kind === 'hls') || null
        : null
    const resume = resumePositionRef.current
    const fromProp = Number(startTime)
    const nextStartTime = resume > 0.5 ? resume : fromProp
    const stopPlayback = startBrowserPlayback(
      player,
      selectedSource,
      fallback,
      Number.isFinite(nextStartTime) && nextStartTime > 0 ? nextStartTime : 0,
      (error) => {
        const message =
          error?.message ||
          zh('当前视频无法在浏览器中播放', 'This video cannot be played in the browser')
        setPlaybackError(message)
        onPlaybackErrorRef.current?.(message)
      }
    )

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
    const syncTime = () => {
      const time = player.currentTime() || 0
      resumePositionRef.current = time
      setCurrentTime(time)
    }
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
      applySeek(current + offsetSeconds)
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
      if (isPiPRef.current) {
        togglePipRef.current?.()
        return
      }
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
      togglePictureInPicture: () => {
        togglePipRef.current?.()
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
      setPendingSeekTime(null)
    }
    const handleWaiting = () => setWaiting(true)
    const handleCanPlay = () => setWaiting(false)
    const handleLoadedMetadata = () => {
      syncDuration()
      syncBuffered()
      handleDimensions()
    }

    // 方向键长按：keydown 首次立即生效一次，短暂延迟后开始按固定间隔持续调节，
    // keyup / 离开播放器时停止（holdAction 存最新动作，避免闭包里的过期引用）
    let holdTimer = null
    let holdAction = null
    const stopArrowHold = () => {
      if (holdTimer != null) {
        window.clearTimeout(holdTimer)
        holdTimer = null
      }
      holdAction = null
    }
    const startArrowHold = (action) => {
      stopArrowHold()
      holdAction = action
      holdTimer = window.setTimeout(() => {
        holdTimer = window.setInterval(() => {
          holdAction?.()
        }, ARROW_HOLD_INTERVAL_MS)
      }, ARROW_HOLD_DELAY_MS)
    }

    const handleKeyDown = (event) => {
      // 页内/系统视频画中画时热键交给页面；独立画中画窗口里仍接管快捷键
      if (isPiPRef.current && pipKindRef.current !== 'document') return
      // 带系统组合键（Ctrl/Cmd/Alt）时不触发播放器单键热键：否则 Ctrl+C 复制、
      // Ctrl+A 全选等会被 'c'（快进）/ 'a'（快退）等热键 preventDefault 拦掉。
      if (event.ctrlKey || event.metaKey || event.altKey) return
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
        // 快捷键只改进度/音量/截图，不唤出或打断控制条显隐
        if (configured.action === PLAYER_HOTKEY_ACTIONS.SEEK) {
          seekBy(configured.amount)
        } else if (configured.action === PLAYER_HOTKEY_ACTIONS.VOLUME) {
          adjustVolume(configured.amount / 100)
        } else if (configured.action === PLAYER_HOTKEY_ACTIONS.SCREENSHOT) {
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
          handleClose()
          break
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          // 焦点在进度条（role="slider"）上时保留其自身的左右键定位，不重复处理
          if (target instanceof Element && target.closest('[role="slider"]')) return
          markHandled()
          if (event.repeat) return // 系统自动连发由长按定时器接管，避免重复触发
          if (key === 'ArrowLeft' || key === 'ArrowRight') {
            const step = (key === 'ArrowLeft' ? -1 : 1) * ARROW_SEEK_STEP_SECONDS
            seekBy(step)
            startArrowHold(() => seekBy(step))
          } else {
            const step = (key === 'ArrowDown' ? -1 : 1) * ARROW_VOLUME_STEP
            adjustVolume(step)
            startArrowHold(() => adjustVolume(step))
          }
          break
        }
        default:
          return
      }
    }

    const handleKeyUp = (event) => {
      const key = normalizePlayerHotkeyKey(event.key || '')
      if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
        stopArrowHold()
      }
    }

    const focusPlayer = () => {
      playerEl?.focus({ preventScroll: true })
    }
    // video.js 会用 .vjs-tech 接管媒体元素，尺寸必须走 player API。
    // 同时监听 resize：HLS 等流在 loadedmetadata 时可能还拿不到分辨率，稍后会再触发。
    const handleDimensions = () => {
      const width = player.videoWidth()
      const height = player.videoHeight()
      if (width > 0 && height > 0) {
        setVideoSize({ width, height })
      }
    }
    const applyStartTime = () => {
      const resume = resumePositionRef.current
      const fromProp = Number(startTime)
      const nextStartTime = resume > 0.5 ? resume : fromProp
      if (!Number.isFinite(nextStartTime) || nextStartTime <= 0) return
      applySeek(nextStartTime)
    }

    if (playerEl && !playerEl.hasAttribute('tabindex')) {
      playerEl.setAttribute('tabindex', '-1')
    }

    const keyWindow = documentPipWindowRef.current || window
    keyWindow.addEventListener('keydown', handleKeyDown, true)
    keyWindow.addEventListener('keyup', handleKeyUp, true)

    const handleVolumeChange = () => {
      try {
        localStorage.setItem(VOLUME_STORAGE_KEY, String(player.volume()))
      } catch {
        return
      }
    }

    const handleRateChange = () => setPlaybackRate(player.playbackRate())
    const handleLeaveNativePip = () => {
      if (pipKindRef.current !== 'video') return
      setIsPiP(false)
      setPipKind('inline')
      setPipPosition(null)
    }

    player.ready(() => {
      applyStartTime()
      syncTime()
      syncDuration()
      syncBuffered()
      syncVolumeState()
      // 画中画时页面要继续点选其它卡片，不要把焦点抢回播放器
      if (!isPiPRef.current) focusPlayer()
      const techEl = player.tech(true)?.el()
      if (techEl) {
        const allowNative = pipKindRef.current === 'video'
        techEl.disablePictureInPicture = !allowNative
        techEl.addEventListener('leavepictureinpicture', handleLeaveNativePip)
        if (
          allowNative &&
          isVideoPictureInPictureSupported(techEl) &&
          !document.pictureInPictureElement
        ) {
          techEl.requestPictureInPicture().catch(() => {})
        }
      }
    })
    player.on('play', handlePlay)
    player.on('pause', handlePause)
    player.on('ended', handleEnded)
    player.on('waiting', handleWaiting)
    player.on('playing', handleCanPlay)
    player.on('canplay', handleCanPlay)
    const handleTimeUpdate = () => {
      syncTime()
      // 播放器时间追平目标位置后清除乐观状态，让 UI 跟随真实播放位置
      setPendingSeekTime((pending) => {
        if (pending == null) return null
        const current = player.currentTime() || 0
        return Math.abs(current - pending) < 1 ? null : pending
      })
    }
    const handleSeeked = () => {
      syncTime()
      if (pendingSeekTimerRef.current) {
        window.clearTimeout(pendingSeekTimerRef.current)
        pendingSeekTimerRef.current = null
      }
      setPendingSeekTime(null)
    }
    player.on('timeupdate', handleTimeUpdate)
    player.on('seeked', handleSeeked)
    player.on('durationchange', syncDuration)
    player.on('progress', syncBuffered)
    player.on('loadedmetadata', handleLoadedMetadata)
    player.on('volumechange', syncVolumeState)
    player.on('volumechange', handleVolumeChange)
    player.on('ratechange', handleRateChange)
    player.on('fullscreenchange', focusPlayer)
    player.on('resize', handleDimensions)

    return () => {
      keyWindow.removeEventListener('keydown', handleKeyDown, true)
      keyWindow.removeEventListener('keyup', handleKeyUp, true)
      stopArrowHold()
      player.off('play', handlePlay)
      player.off('pause', handlePause)
      player.off('ended', handleEnded)
      player.off('waiting', handleWaiting)
      player.off('playing', handleCanPlay)
      player.off('canplay', handleCanPlay)
      player.off('timeupdate', handleTimeUpdate)
      player.off('seeked', handleSeeked)
      player.off('durationchange', syncDuration)
      player.off('progress', syncBuffered)
      player.off('loadedmetadata', handleLoadedMetadata)
      player.off('volumechange', syncVolumeState)
      player.off('volumechange', handleVolumeChange)
      player.off('ratechange', handleRateChange)
      player.off('fullscreenchange', focusPlayer)
      player.off('resize', handleDimensions)
      player.tech(true)?.el()?.removeEventListener('leavepictureinpicture', handleLeaveNativePip)
      setPendingSeekTime(null)
      // 清理悬停预览：取消在途请求、释放抽帧缓存
      clearFrameCache()
      stopPlayback()
      playerRef.current?.dispose()
      playerRef.current = null
      if (host.isConnected) host.replaceChildren()
    }
  }, [
    video,
    startTime,
    selectedSource,
    playbackInfo,
    playbackKey,
    applySeek,
    handleClose,
    clearFrameCache,
    pipPortalEl,
  ])

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
    const time = seekTimeFromEvent(event)
    setDragTime(time)
    setSeekHoverTime(null)
    requestFramePreview(time)
    showControls()
    try {
      seekBarRef.current?.setPointerCapture?.(event.pointerId)
    } catch {
      // 忽略捕获失败
    }
    event.preventDefault()
    event.stopPropagation()
  }

  const handleSeekPointerMove = (event) => {
    if (!duration) return
    const time = seekTimeFromEvent(event)
    if (dragRef.current.active) {
      setDragTime(time)
    } else {
      setSeekHoverTime(time)
    }
    requestFramePreview(time)
  }

  const handleSeekPointerUp = (event) => {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    const time = dragTime ?? seekTimeFromEvent(event)
    setDragTime(null)
    setSeekHoverTime(null)
    cancelFrameHover()
    applySeek(time)
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
    applySeek(Math.min(Math.max(0, next), duration))
  }

  const handlePipPointerDown = (event) => {
    if (!isPiP || pipKind !== 'inline') return
    if (event.button != null && event.button !== 0) return
    if (
      event.target instanceof Element &&
      event.target.closest('button, input, [role="slider"], a')
    ) {
      return
    }
    const card = pipCardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    pipDragRef.current = {
      active: true,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    setPipPosition(
      clampPipPosition(
        rect.left,
        rect.top,
        rect.width,
        rect.height,
        window.innerWidth,
        window.innerHeight
      )
    )
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      // 忽略捕获失败
    }
    event.preventDefault()
  }

  const handlePipPointerMove = (event) => {
    if (!pipDragRef.current.active) return
    const card = pipCardRef.current
    const width = card?.offsetWidth || 420
    const height = card?.offsetHeight || 236
    setPipPosition(
      clampPipPosition(
        event.clientX - pipDragRef.current.offsetX,
        event.clientY - pipDragRef.current.offsetY,
        width,
        height,
        window.innerWidth,
        window.innerHeight
      )
    )
  }

  const handlePipPointerUp = (event) => {
    if (!pipDragRef.current.active) return
    pipDragRef.current.active = false
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    } catch {
      // 忽略释放失败
    }
  }

  const applyPipResizeFromDelta = (event, persist) => {
    const drag = pipResizeRef.current
    if (!drag.active) return null
    const aspect = videoSize && videoSize.height > 0 ? videoSize.width / videoSize.height : 16 / 9
    const maxWidth = pipResizeMaxWidth(
      pipKind,
      window.innerWidth,
      typeof screen !== 'undefined' ? screen.availWidth : undefined
    )
    const nextWidth = clampPipWidth(drag.startWidth + (event.clientX - drag.startX), maxWidth)
    const size = getDocumentPipWindowSize(aspect, nextWidth)
    if (pipKind === 'document') {
      resizeDocumentPipWindow(documentPipWindowRef.current, size.width, size.height)
    } else {
      setPipSize({ width: size.width })
      setPipPosition((prev) => {
        const card = pipCardRef.current
        const rect = card?.getBoundingClientRect()
        return clampPipPosition(
          prev?.left ?? rect?.left ?? PIP_MARGIN,
          prev?.top ?? rect?.top ?? PIP_MARGIN,
          size.width,
          Math.round(size.width / aspect),
          window.innerWidth,
          window.innerHeight
        )
      })
    }
    if (persist) saveStoredPipSize(size)
    return size
  }

  const handlePipResizePointerDown = (event) => {
    if (!isPiP || (pipKind !== 'inline' && pipKind !== 'document')) return
    if (event.button != null && event.button !== 0) return
    const pipWindow = documentPipWindowRef.current
    const card = pipCardRef.current
    pipResizeRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      startWidth:
        pipKind === 'document'
          ? pipWindow?.innerWidth || card?.offsetWidth || PIP_DEFAULT_WIDTH
          : card?.offsetWidth || pipSize?.width || PIP_DEFAULT_WIDTH,
      startHeight:
        pipKind === 'document'
          ? pipWindow?.innerHeight || card?.offsetHeight || 236
          : card?.offsetHeight || 236,
    }
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      // 忽略捕获失败
    }
    event.preventDefault()
    event.stopPropagation()
  }

  const handlePipResizePointerMove = (event) => {
    if (!pipResizeRef.current.active) return
    event.preventDefault()
    event.stopPropagation()
    applyPipResizeFromDelta(event, false)
  }

  const handlePipResizePointerUp = (event) => {
    if (!pipResizeRef.current.active) return
    applyPipResizeFromDelta(event, true)
    pipResizeRef.current.active = false
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    } catch {
      // 忽略释放失败
    }
    event.preventDefault()
    event.stopPropagation()
  }

  useEffect(() => {
    if (!isPiP || pipKind !== 'inline' || !pipPosition) return undefined
    const onResize = () => {
      const card = pipCardRef.current
      if (!card) return
      setPipPosition((prev) =>
        clampPipPosition(
          prev?.left ?? 0,
          prev?.top ?? 0,
          card.offsetWidth,
          card.offsetHeight,
          window.innerWidth,
          window.innerHeight
        )
      )
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [isPiP, pipKind, pipPosition])

  useEffect(() => {
    if (!isPiP || pipKind !== 'document') return undefined
    const pipWindow = documentPipWindowRef.current
    if (!pipWindow) return undefined
    const onResize = () => {
      saveStoredPipSize({ width: pipWindow.innerWidth })
      setPipSize({ width: clampPipWidth(pipWindow.innerWidth) })
      try {
        playerRef.current?.trigger('resize')
      } catch {
        // 忽略 video.js 未就绪
      }
    }
    pipWindow.addEventListener('resize', onResize)
    return () => pipWindow.removeEventListener('resize', onResize)
  }, [isPiP, pipKind, pipPortalEl])

  useEffect(() => {
    if (isPiP || !video) return undefined
    const overlay = overlayRef.current
    if (!overlay) return undefined
    const handleWheel = (event) => {
      event.preventDefault()
      event.stopPropagation()
    }
    overlay.addEventListener('wheel', handleWheel, { passive: false })
    return () => overlay.removeEventListener('wheel', handleWheel)
  }, [isPiP, video])

  if (!video) return null

  const displayName = getPlayerDisplayName(video, preferChineseTitle)
  const aspectRatio =
    videoSize && videoSize.height > 0 ? videoSize.width / videoSize.height : 16 / 9
  const displayTime = dragTime ?? pendingSeekTime ?? currentTime
  const playedPercent = duration > 0 ? clampPercent((displayTime / duration) * 100) : 0
  const bufferedPercent = duration > 0 ? clampPercent((bufferedEnd / duration) * 100) : 0
  const tooltipTime = dragTime ?? seekHoverTime
  const tooltipPercent =
    duration > 0 && tooltipTime != null ? clampPercent((tooltipTime / duration) * 100) : 0

  // 悬停位置用 clamp 后的 left 百分比显示：0%..100% 对应进度条左右两端，
  // 不让气泡超出进度条边界（此时元素实际中心与指针位置稍有偏差，属于预期取舍）
  const tooltipOffsetPercent = (() => {
    if (!tooltipBox) return tooltipPercent
    const maxPx = Math.max(0, tooltipBox.barW - tooltipBox.tooltipW)
    if (maxPx <= 0) return tooltipPercent
    const leftPx = (tooltipPercent / 100) * tooltipBox.barW - tooltipBox.tooltipW / 2
    return clampPercent((Math.min(Math.max(0, leftPx), maxPx) / tooltipBox.barW) * 100)
  })()

  const documentPip = isPiP && pipKind === 'document'
  const videoPip = isPiP && pipKind === 'video'
  const inlinePip = isPiP && pipKind === 'inline'
  const playerCardClass = videoPip
    ? 'player-card--native-pip-host'
    : documentPip
      ? 'player-card--document-pip pointer-events-auto'
      : inlinePip
        ? `player-card--pip pointer-events-auto${pipPosition ? ' is-dragged' : ''}`
        : 'player-card--viewport mx-0 rounded-none'

  const playerCard = (
    <div
      ref={pipCardRef}
      className={`player-card relative bg-black shadow-none ${playerCardClass}`}
      style={{
        '--player-ar': `${aspectRatio}`,
        ...(inlinePip && pipSize?.width ? { width: pipSize.width } : null),
        ...(inlinePip && pipPosition ? { left: pipPosition.left, top: pipPosition.top } : null),
      }}
    >
      <button
        data-player-chrome=""
        aria-label={zh('关闭', 'Close')}
        onClick={handleClose}
        className={`absolute right-3 top-3 z-20 rounded-full bg-black/60 px-2 py-1 text-sm text-white hover:bg-black/80 ${
          isPiP || controlsVisible ? '' : 'pointer-events-none opacity-0'
        }`}
      >
        ×
      </button>
      <div className="flex h-full flex-col gap-0 p-0">
        <h2
          data-player-chrome=""
          className={`absolute inset-x-0 top-0 z-10 truncate bg-gradient-to-b from-black/60 to-transparent pb-5 pl-3 pr-14 pt-4 text-sm font-medium text-white ${
            inlinePip ? 'cursor-move touch-none' : ''
          } ${isPiP || controlsVisible ? '' : 'pointer-events-none opacity-0'}`}
          title={displayName}
          onPointerDown={inlinePip ? handlePipPointerDown : undefined}
          onPointerMove={inlinePip ? handlePipPointerMove : undefined}
          onPointerUp={inlinePip ? handlePipPointerUp : undefined}
          onPointerCancel={inlinePip ? handlePipPointerUp : undefined}
        >
          {displayName}
        </h2>
        <div
          ref={shellRef}
          className={`player-shell relative w-full bg-black ${controlsVisible ? '' : 'cursor-none'} ${
            inlinePip ? '' : 'h-full'
          }`}
          style={{
            ...subtitleStyleCssVars(subtitleStyle),
          }}
        >
          {screenshotNotice || (hotkeyHintVisible && !isPiP) ? (
            <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2">
              {screenshotNotice ? (
                <div className="rounded bg-black/75 px-3 py-1.5 text-sm font-medium text-white shadow">
                  {zh('截图成功', 'Screenshot saved')}
                </div>
              ) : null}
              {hotkeyHintVisible && !isPiP ? (
                <div className="max-h-[calc(100vh-12rem)] overflow-hidden rounded bg-black/75 px-3 py-2 text-xs leading-5 text-white shadow">
                  {hotkeyHintLines.map((line, index) => (
                    <div key={`${index}-${line}`}>{line}</div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div ref={playerHostRef} className="h-full w-full" />
          {loadingPlayback ? (
            <div className="absolute inset-0 z-[5] flex items-center justify-center bg-black text-sm text-white">
              {zh('加载播放信息中…', 'Loading playback info...')}
            </div>
          ) : playbackError ? (
            <div className="absolute inset-0 z-[5] flex items-center justify-center bg-black px-6 text-center text-sm text-red-200">
              {playbackError}
            </div>
          ) : null}

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
              data-player-chrome=""
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
            data-player-chrome=""
            className={`player-controls absolute inset-x-0 bottom-0 z-20 select-none bg-gradient-to-t from-black/80 via-black/40 to-transparent pb-1 transition-opacity duration-200 ${
              controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            {/* 进度条：上方留出点击保护区，避免点在细条附近时落到视频上触发暂停 */}
            <div
              ref={seekBarRef}
              role="slider"
              tabIndex={0}
              aria-label={zh('播放进度', 'Seek')}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(displayTime)}
              className="player-seek group/seek relative cursor-pointer touch-none pt-4 pointer-coarse:pt-6"
              onPointerDown={handleSeekPointerDown}
              onPointerMove={handleSeekPointerMove}
              onPointerUp={handleSeekPointerUp}
              onPointerCancel={handleSeekPointerUp}
              onPointerLeave={() => {
                setSeekHoverTime(null)
                cancelFrameHover()
              }}
              onKeyDown={handleSeekBarKeyDown}
            >
              <div className="relative h-5 w-full">
                {tooltipTime != null && duration > 0 ? (
                  <div
                    ref={seekTooltipRef}
                    className="pointer-events-none absolute bottom-8 z-10 -translate-x-1/2 rounded-md bg-black/90 px-2 py-1 text-xs font-medium tabular-nums text-white shadow"
                    style={{ left: `${tooltipOffsetPercent}%` }}
                  >
                    {framePreview ? (
                      <div className="mb-1 overflow-hidden rounded border border-white/20">
                        <img
                          src={framePreview}
                          alt=""
                          draggable={false}
                          className="block max-h-[8vh] max-w-[13vw] object-contain"
                        />
                      </div>
                    ) : null}
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
                  className="player-seek-handle pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md"
                  style={{ left: `${playedPercent}%` }}
                />
              </div>
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
                  className={`${iconButtonClass} ${isPiP ? 'hidden' : 'pointer-coarse:hidden'}`}
                >
                  <Replay10Icon />
                </button>
                <button
                  type="button"
                  aria-label={zh('前进 10 秒', 'Forward 10 seconds')}
                  onClick={() => actionsRef.current?.seekBy(SEEK_STEP_SECONDS)}
                  className={`${iconButtonClass} ${isPiP ? 'hidden' : 'pointer-coarse:hidden'}`}
                >
                  <Forward10Icon />
                </button>

                {/* 音量：主播放器默认展开滑条，不依赖悬停 */}
                <div className="relative flex items-center">
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
                  <div
                    className={`flex items-center ${isPiP ? 'w-16' : 'w-24 pointer-coarse:w-16'}`}
                  >
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={muted ? 0 : volume}
                      onChange={(event) => actionsRef.current?.setVolumeLevel(event.target.value)}
                      aria-label={zh('音量', 'Volume')}
                      className="player-volume-slider w-16 pointer-coarse:w-12"
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
                  className={`${iconButtonClass} ${isPiP ? 'hidden' : ''}`}
                >
                  <PhotoCameraIcon />
                </button>

                {/* 选集：同番号多文件时在播放器内切换视频 */}
                {episodeList.length > 1 ? (
                  <div className="relative">
                    <button
                      type="button"
                      aria-label={zh('选集', 'Select episode')}
                      title={zh('选集', 'Select episode')}
                      onClick={() => {
                        setMenuOpen(menuOpen === 'episodes' ? null : 'episodes')
                        setSubMenu(null)
                        showControls()
                      }}
                      className={`hover:bg-app-hover/15 flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-white transition-colors pointer-coarse:h-8 ${
                        menuOpen === 'episodes' ? 'bg-app-surface/15 text-yellow-300' : ''
                      }`}
                    >
                      <PlaylistPlayIcon style={{ fontSize: 18 }} />
                      {isPiP ? null : <span>{zh('选集', 'Episodes')}</span>}
                      <span className="bg-app-surface/20 rounded-full px-1.5 text-[10px] font-semibold tabular-nums leading-4">
                        {episodeList.length}
                      </span>
                    </button>
                    {menuOpen === 'episodes' ? (
                      <div className="player-pip-menu absolute bottom-12 right-0 z-30 w-72 overflow-hidden rounded-xl border border-white/10 bg-black/90 shadow-2xl backdrop-blur-sm">
                        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
                            {zh('选集', 'Episodes')}
                          </span>
                          <button
                            type="button"
                            aria-label={zh('关闭选集菜单', 'Close episode menu')}
                            onClick={() => setMenuOpen(null)}
                            className="rounded px-1.5 text-sm text-white/60 hover:text-white"
                          >
                            ×
                          </button>
                        </div>
                        <div className="max-h-72 overflow-y-auto py-1">
                          {episodeList.map((ep, index) => {
                            const fullPath = buildVideoFullPath(ep)
                            const label =
                              fullPath ||
                              ep.filename ||
                              ep.path ||
                              zh('未命名文件', 'Untitled file')
                            const active = String(ep.location_id) === activeEpisodeKey
                            return (
                              <button
                                key={ep.location_id || `${ep.id}-${index}`}
                                type="button"
                                onClick={() => {
                                  setMenuOpen(null)
                                  scheduleHideControls()
                                  onSwitchVideo?.(ep)
                                }}
                                title={label}
                                className={`hover:bg-app-hover/10 flex w-full items-center gap-2 px-3.5 py-1.5 text-left text-xs transition-colors ${
                                  active ? 'font-semibold text-white' : 'text-white/80'
                                }`}
                              >
                                {active ? (
                                  <CheckIcon
                                    style={{ fontSize: 14 }}
                                    className="shrink-0 text-yellow-300"
                                  />
                                ) : (
                                  <span className="inline-block w-3.5 shrink-0" />
                                )}
                                <span className="min-w-0 flex-1 truncate">{label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* 字幕：关闭 / 本地字幕 / 在线搜索 / 预览 / 保存 */}
                <div className="relative">
                  <button
                    type="button"
                    aria-label={zh('字幕', 'Subtitles')}
                    onClick={() => {
                      setMenuOpen(null)
                      setSubMenu(subMenu === 'local' ? null : 'local')
                      showControls()
                    }}
                    className={`${iconButtonClass} ${activeSubtitle ? 'text-yellow-300' : ''}`}
                  >
                    <ClosedCaptionIcon />
                  </button>
                  {subMenu != null ? (
                    <div className="player-pip-menu absolute bottom-12 right-0 z-30 w-96 overflow-hidden rounded-xl border border-white/10 bg-black/90 shadow-2xl backdrop-blur-sm">
                      {/* 顶栏：本地 / 搜索 切换 */}
                      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5">
                        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => setSubMenu('local')}
                            className={`rounded px-2.5 py-1.5 text-sm transition-colors ${
                              subMenu === 'local'
                                ? 'bg-app-surface/15 font-semibold text-white'
                                : 'text-white/60 hover:text-white'
                            }`}
                          >
                            {zh('本地字幕', 'Local')}
                          </button>
                          <button
                            type="button"
                            onClick={() => openSubtitleSearch()}
                            className={`rounded px-2.5 py-1.5 text-sm transition-colors ${
                              subMenu === 'search'
                                ? 'bg-app-surface/15 font-semibold text-white'
                                : 'text-white/60 hover:text-white'
                            }`}
                          >
                            {zh('搜索字幕', 'Search')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSubMenu('style')}
                            className={`rounded px-2.5 py-1.5 text-sm transition-colors ${
                              subMenu === 'style'
                                ? 'bg-app-surface/15 font-semibold text-white'
                                : 'text-white/60 hover:text-white'
                            }`}
                          >
                            {zh('样式', 'Style')}
                          </button>
                        </div>
                        <button
                          type="button"
                          aria-label={zh('关闭字幕菜单', 'Close subtitle menu')}
                          onClick={() => setSubMenu(null)}
                          className="rounded px-2 py-0.5 text-lg text-white/60 hover:text-white"
                        >
                          ×
                        </button>
                      </div>

                      {subMenu === 'local' ? (
                        <div className="max-h-96 overflow-y-auto py-1.5">
                          <SubMenuItem
                            active={activeSubtitle == null}
                            label={zh('关闭字幕', 'Off')}
                            onClick={() => {
                              playSubtitle(null)
                            }}
                          />
                          {localSubtitles.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-white/50">
                              {zh(
                                '未找到本地字幕，可前往「搜索字幕」在线查找',
                                'No local subtitles found. Try the online search tab.'
                              )}
                            </div>
                          ) : (
                            localSubtitles.map((item) => (
                              <SubMenuItem
                                key={item.name}
                                active={
                                  activeSubtitle?.kind === 'local' &&
                                  activeSubtitle.name === item.name
                                }
                                label={item.label || item.name}
                                onClick={() => playSubtitle({ kind: 'local', name: item.name })}
                                onPreview={() =>
                                  previewSubtitle({ kind: 'local', name: item.name })
                                }
                              />
                            ))
                          )}
                        </div>
                      ) : subMenu === 'style' ? (
                        <SubtitleStylePanel
                          style={subtitleStyle}
                          onChange={updateSubtitleStyle}
                          onReset={resetSubtitleStyle}
                        />
                      ) : (
                        <div className="max-h-96 overflow-y-auto">
                          <div className="flex gap-2 p-2.5">
                            <input
                              value={subSearchQuery}
                              onChange={(event) => setSubSearchQuery(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  runSubtitleSearch()
                                }
                              }}
                              placeholder={zh('番号，如 SSIS-480', 'Movie code, e.g. SSIS-480')}
                              className="bg-app-surface/10 min-w-0 flex-1 rounded px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none"
                            />
                            <button
                              type="button"
                              disabled={subSearchBusy}
                              onClick={() => runSubtitleSearch()}
                              className="bg-app-surface/15 hover:bg-app-hover/25 rounded px-2.5 text-white transition-colors disabled:opacity-50"
                            >
                              <SearchIcon style={{ fontSize: 20 }} />
                            </button>
                          </div>
                          {subSearchBusy ? (
                            <div className="px-4 py-4 text-sm text-white/50">
                              {zh('搜索中…', 'Searching...')}
                            </div>
                          ) : null}
                          {!subSearchBusy && subSearchItems.length === 0 ? (
                            <div className="px-4 py-4 text-sm text-white/50">
                              {zh(
                                '输入番号搜索在线字幕；搜索结果可预览或保存到视频目录',
                                'Search online subtitles by movie code. Results can be previewed or saved next to the video.'
                              )}
                            </div>
                          ) : null}
                          {subSearchItems.map((item) => {
                            const detail = subDetailTracks[item.code]
                            const tracks = detail?.tracks || []
                            const versions = item.versions || []
                            const lookupCode =
                              detail?.lookupCode || item.canonical_code || item.code
                            return (
                              <div key={item.code} className="border-t border-white/5">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    openSubtitleDetail(item)
                                  }}
                                  className="hover:bg-app-hover/10 flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors"
                                >
                                  <span className="min-w-0 flex-1">
                                    <span className="block font-semibold text-white">
                                      {item.code}
                                    </span>
                                    {item.title ? (
                                      <span className="block truncate text-white/50">
                                        {item.title}
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="shrink-0 text-white/40">
                                    {versions.length > 0
                                      ? zh(
                                          `${versions.length} 个版本`,
                                          `${versions.length} versions`
                                        )
                                      : item.has_subtitles
                                        ? zh('有字幕', 'Has subs')
                                        : zh('无字幕', 'No subs')}
                                  </span>
                                </button>
                                {detail?.loading ? (
                                  <div className="px-4 pb-2.5 text-xs text-white/50">
                                    {zh('加载中…', 'Loading...')}
                                  </div>
                                ) : null}
                                {detail?.error ? (
                                  <div className="px-4 pb-2.5 text-xs text-red-300">
                                    {detail.error}
                                  </div>
                                ) : null}
                                {tracks.length > 0
                                  ? tracks.map((track) => (
                                      <div
                                        key={track.id}
                                        className="flex items-center gap-2 px-4 py-2 pl-10"
                                      >
                                        <span className="min-w-0 flex-1 truncate text-sm text-white/80">
                                          {track.label || track.lang || track.id}
                                        </span>
                                        <button
                                          type="button"
                                          aria-label={zh('预览', 'Preview')}
                                          onClick={() =>
                                            previewSubtitle({
                                              kind: 'online',
                                              code: lookupCode,
                                              id: track.id,
                                              label: track.label || track.lang,
                                            })
                                          }
                                          className="hover:bg-app-hover/15 rounded p-1.5 text-white/50 transition-colors hover:text-white"
                                        >
                                          <PreviewIcon style={{ fontSize: 18 }} />
                                        </button>
                                        <button
                                          type="button"
                                          aria-label={zh('保存', 'Save')}
                                          onClick={() =>
                                            saveSubtitle({
                                              kind: 'online',
                                              code: lookupCode,
                                              id: track.id,
                                              label: track.label || track.lang,
                                            })
                                          }
                                          className="hover:bg-app-hover/15 rounded p-1.5 text-white/50 transition-colors hover:text-white"
                                        >
                                          <DownloadIcon style={{ fontSize: 18 }} />
                                        </button>
                                      </div>
                                    ))
                                  : null}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}
                  {/* 字幕预览弹层 */}
                  {subPreview ? (
                    <div className="player-pip-menu absolute bottom-12 right-0 z-40 flex max-h-96 w-96 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/90 shadow-2xl backdrop-blur-sm">
                      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                          {subPreview.label}
                        </span>
                        <button
                          type="button"
                          aria-label={zh('关闭预览', 'Close preview')}
                          onClick={() => setSubPreview(null)}
                          className="rounded px-2 py-0.5 text-lg text-white/60 hover:text-white"
                        >
                          ×
                        </button>
                      </div>
                      <div className="max-h-80 overflow-y-auto whitespace-pre-wrap px-4 py-3 text-sm leading-6 text-white/80">
                        {subPreview.text}
                      </div>
                    </div>
                  ) : null}
                  {subNotice ? (
                    <div className="absolute bottom-14 right-0 z-40 rounded-md bg-black/85 px-2 py-1 text-xs text-white shadow">
                      {subNotice}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  aria-label={
                    isPiP
                      ? zh('退出画中画', 'Exit picture-in-picture')
                      : zh('画中画', 'Picture-in-picture')
                  }
                  title={zh('画中画', 'Picture-in-picture')}
                  onClick={() => {
                    void togglePip()
                  }}
                  className={iconButtonClass}
                >
                  {isPiP ? <PictureInPictureAltIcon /> : <PictureInPictureAltOutlinedIcon />}
                </button>

                {/* 播放速度菜单 */}
                <div className="relative">
                  <button
                    type="button"
                    aria-label={zh('播放速度', 'Playback speed')}
                    onClick={() => {
                      setSubMenu(null)
                      setMenuOpen(menuOpen === 'speed' ? null : 'speed')
                      showControls()
                    }}
                    className={iconButtonClass}
                  >
                    <SettingsIcon />
                  </button>
                  {menuOpen === 'speed' ? (
                    <div className="player-pip-menu absolute bottom-12 right-0 z-30 w-40 overflow-hidden rounded-xl border border-white/10 bg-black/90 py-1.5 shadow-2xl backdrop-blur-sm">
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
                            className={`hover:bg-app-hover/10 flex w-full items-center justify-between px-3.5 py-1.5 text-sm transition-colors ${
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
      {inlinePip || documentPip ? (
        <button
          type="button"
          aria-label={zh('调整画中画大小', 'Resize picture-in-picture')}
          className="player-pip-resize"
          onPointerDown={handlePipResizePointerDown}
          onPointerMove={handlePipResizePointerMove}
          onPointerUp={handlePipResizePointerUp}
          onPointerCancel={handlePipResizePointerUp}
          onClick={(event) => event.stopPropagation()}
        />
      ) : null}
    </div>
  )

  if (documentPip && pipPortalEl) {
    return createPortal(playerCard, pipPortalEl)
  }

  return (
    <div
      ref={overlayRef}
      className={
        isPiP
          ? 'pointer-events-none fixed inset-0 z-[1700]'
          : 'fixed inset-0 z-[1700] flex items-center justify-center bg-black'
      }
    >
      {playerCard}
    </div>
  )
}

// SubMenuItem is one row of the subtitle menu (off / a local subtitle / an
// online track). Optionally shows a preview button next to the label.
function SubMenuItem({ active, label, onClick, onPreview }) {
  return (
    <div className={`flex items-center gap-1.5 px-4 py-2 ${active ? 'bg-app-surface/10' : ''}`}>
      <button
        type="button"
        onClick={onClick}
        className={`flex min-w-0 flex-1 items-center gap-2 text-left text-sm transition-colors hover:text-white ${
          active ? 'font-semibold text-white' : 'text-white/80'
        }`}
      >
        {active ? (
          <CheckIcon style={{ fontSize: 16 }} className="shrink-0 text-yellow-300" />
        ) : (
          <span className="inline-block w-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
      {onPreview ? (
        <button
          type="button"
          aria-label={zh('预览', 'Preview')}
          onClick={onPreview}
          className="hover:bg-app-hover/15 rounded p-1.5 text-white/50 transition-colors hover:text-white"
        >
          <PreviewIcon style={{ fontSize: 18 }} />
        </button>
      ) : null}
    </div>
  )
}
