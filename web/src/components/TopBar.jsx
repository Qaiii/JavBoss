import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, IconButton, Tooltip } from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined'
import NumbersRoundedIcon from '@mui/icons-material/NumbersRounded'
import ShuffleOutlinedIcon from '@mui/icons-material/ShuffleOutlined'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import BookmarksOutlinedIcon from '@mui/icons-material/BookmarksOutlined'
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined'
import DisplaySettingsIcon from '@mui/icons-material/DisplaySettings'
import FolderRoundedIcon from '@mui/icons-material/FolderRounded'
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined'
import { fetchDirectorySubdirectories, fetchJavPrefixes } from '@/api'
import JavPrefixModal from '@/components/JavPrefixModal'
import { displayHostPath } from '@/utils/hostPath'
import { zh } from '@/utils/i18n'
import { getErrorMessage } from '@/utils/errors'

function ButtonTooltip({ enabled = true, title, ...props }) {
  return <Tooltip {...props} title={enabled ? title : ''} />
}

// Checkbox that also renders the indeterminate (partial) state.
function TriStateCheckbox({ indeterminate = false, ...props }) {
  const inputRef = useRef(null)
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = Boolean(indeterminate)
    }
  }, [indeterminate])
  return <input ref={inputRef} type="checkbox" {...props} />
}

export default function TopBar({
  onHome,
  canGoBack,
  canGoForward,
  onBrowserBack,
  onBrowserForward,
  isJavMode,
  onToggleMode,
  videoSearchInput,
  onVideoSearchInputChange,
  onSubmitVideoSearch,
  videoSearchHref,
  randomHref,
  onRandomClick,
  onOpenTagModal,
  onOpenJavTagModal,
  onOpenVideoSettings,
  onOpenJavSettings,
  onOpenGlobalSettings,
  javSearchInput,
  onJavSearchInputChange,
  onSubmitJavSearch,
  javSearchHref,
  javRandomHref,
  javRandomMode,
  onJavRandomClick,
  onJavFilterRandomClick,
  onCancelJavFilterRandom,
  showJavFilterRandomButton,
  isModifiedClick,
  javTab,
  javPrefix = '',
  javPrefixDirectoryIds = [],
  buildJavPrefixUrl,
  onJavPrefixClick,
  onSwitchJavTab,
  favoriteEntityType = 'idol',
  favoriteGroups = [],
  favoriteGroupsLoading = false,
  favoriteGroupsError = null,
  selectedFavoriteGroupId = null,
  idolFavoriteEditorOpen = false,
  buildIdolFavoriteGroupUrl,
  onOpenIdolFavoriteGroups,
  onIdolFavoriteGroupSelect,
  onOpenIdolFavoriteManager,
  filterSummary,
  onOpenJavQueryEditor,
  showDirectorySetupHint,
  directories = [],
  enabledDirectoryIds = [],
  onEnabledDirectoryIdsChange,
  closedSubdirectories = {},
  onClosedSubdirectoriesChange,
  hostPathPrefixEnabled = false,
  selectedCount = 0,
  onOpenSelectionOps,
  onClearSelection,
  showButtonTooltips = true,
}) {
  const headerRef = useRef(null)
  const directoryMenuRef = useRef(null)
  const idolFavoriteMenuRef = useRef(null)
  const [directoryMenuOpen, setDirectoryMenuOpen] = useState(false)
  const [expandedDirectoryIds, setExpandedDirectoryIds] = useState(() => new Set())
  const [subdirsByDirectory, setSubdirsByDirectory] = useState({})
  const [subdirsLoading, setSubdirsLoading] = useState(false)
  const [idolFavoriteMenuOpen, setIdolFavoriteMenuOpen] = useState(false)
  const [prefixModalOpen, setPrefixModalOpen] = useState(false)
  const [prefixItems, setPrefixItems] = useState([])
  const [prefixLoading, setPrefixLoading] = useState(false)
  const [prefixError, setPrefixError] = useState('')
  const headerClassName = ['sticky top-0 z-40 border-b bg-white/80 backdrop-blur', 'relative']
    .filter(Boolean)
    .join(' ')
  const activeDirectories = useMemo(
    () =>
      Array.isArray(directories) ? directories.filter((directory) => !directory?.is_delete) : [],
    [directories]
  )
  const enabledDirectorySet = useMemo(
    () => new Set((enabledDirectoryIds || []).map((id) => Number(id))),
    [enabledDirectoryIds]
  )
  const activeDirectoryIds = useMemo(
    () =>
      activeDirectories
        .map((directory) => Number(directory.id))
        .filter((id) => Number.isFinite(id)),
    [activeDirectories]
  )
  const enabledDirectoryCount = activeDirectoryIds.filter((id) =>
    enabledDirectorySet.has(id)
  ).length
  const selectedVideoCount = Number(selectedCount)
  const hasVideoSelection =
    !isJavMode && Number.isFinite(selectedVideoCount) && selectedVideoCount > 0
  const headerBodyClassName = [
    'flex w-full flex-wrap items-start gap-3 py-2 pl-[6.5rem]',
    hasVideoSelection ? 'pr-[27rem]' : 'pr-[18rem]',
  ].join(' ')
  const idolSelectedFavoriteGroupName = useMemo(() => {
    const selectedId = Number(selectedFavoriteGroupId)
    if (!Number.isFinite(selectedId) || selectedId <= 0) return ''
    const group = (favoriteGroups || []).find((item) => Number(item?.id) === selectedId)
    return String(group?.name || '').trim()
  }, [favoriteGroups, selectedFavoriteGroupId])
  const favoriteLabel = useMemo(() => {
    switch (favoriteEntityType) {
      case 'jav':
        return zh('作品收藏夹', 'JAV favorites')
      case 'studio':
        return zh('片商收藏夹', 'Studio favorites')
      case 'series':
        return zh('系列收藏夹', 'Series favorites')
      case 'idol':
      default:
        return zh('女优收藏夹', 'Idol favorites')
    }
  }, [favoriteEntityType])
  const favoriteAllLabel = useMemo(() => {
    switch (favoriteEntityType) {
      case 'jav':
        return zh('全部作品', 'All JAV')
      case 'studio':
        return zh('全部片商', 'All studios')
      case 'series':
        return zh('全部系列', 'All series')
      case 'idol':
      default:
        return zh('全部女优', 'All idols')
    }
  }, [favoriteEntityType])
  const directorySummary =
    activeDirectories.length === 0
      ? zh('无目录', 'No directories')
      : enabledDirectoryCount === activeDirectories.length
        ? zh('全部目录', 'All directories')
        : enabledDirectoryCount === 0
          ? zh('未启用目录', 'No directories enabled')
          : zh(
              `启用 ${enabledDirectoryCount}/${activeDirectories.length}`,
              `${enabledDirectoryCount}/${activeDirectories.length} enabled`
            )

  const updateTopbarOffset = () => {
    const height = headerRef.current?.getBoundingClientRect().height || 0
    document.documentElement.style.setProperty('--topbar-height', `${Math.round(height)}px`)
  }

  useEffect(() => {
    updateTopbarOffset()
    window.addEventListener('resize', updateTopbarOffset)
    return () => window.removeEventListener('resize', updateTopbarOffset)
  }, [])

  useEffect(() => {
    updateTopbarOffset()
  }, [isJavMode, javTab, javRandomMode])

  useEffect(() => {
    if (!prefixModalOpen) return undefined
    let cancelled = false
    setPrefixLoading(true)
    setPrefixError('')
    fetchJavPrefixes({ directoryIds: javPrefixDirectoryIds })
      .then((items) => {
        if (cancelled) return
        setPrefixItems(Array.isArray(items) ? items : [])
      })
      .catch((error) => {
        if (cancelled) return
        setPrefixError(getErrorMessage(error))
      })
      .finally(() => {
        if (!cancelled) setPrefixLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [javPrefixDirectoryIds, prefixModalOpen])

  useEffect(() => {
    if (!directoryMenuOpen) return undefined
    let cancelled = false
    const ids = activeDirectories
      .map((directory) => Number(directory.id))
      .filter((id) => Number.isFinite(id) && id > 0)
    if (ids.length === 0) return undefined
    setSubdirsLoading(true)
    Promise.all(
      ids.map(async (id) => {
        try {
          const payload = await fetchDirectorySubdirectories(id)
          return [
            id,
            {
              rootVideoCount: Number(payload?.root_video_count) || 0,
              subdirectories: Array.isArray(payload?.subdirectories) ? payload.subdirectories : [],
            },
          ]
        } catch {
          return [id, null]
        }
      })
    ).then((results) => {
      if (cancelled) return
      const next = {}
      for (const [id, payload] of results) {
        if (payload) next[id] = payload
      }
      setSubdirsByDirectory(next)
    }).finally(() => {
      if (!cancelled) setSubdirsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [activeDirectories, directoryMenuOpen])

  useEffect(() => {
    if (!directoryMenuOpen) return

    const handlePointerDown = (event) => {
      if (directoryMenuRef.current?.contains(event.target)) return
      setDirectoryMenuOpen(false)
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setDirectoryMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [directoryMenuOpen])

  useEffect(() => {
    if (!idolFavoriteMenuOpen) return

    const handlePointerDown = (event) => {
      if (idolFavoriteEditorOpen) return
      if (idolFavoriteMenuRef.current?.contains(event.target)) return
      setIdolFavoriteMenuOpen(false)
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIdolFavoriteMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [idolFavoriteEditorOpen, idolFavoriteMenuOpen])

  const handleSettingsClick = () => {
    if (isJavMode) {
      onOpenJavSettings?.()
    } else {
      onOpenVideoSettings?.()
    }
  }

  const filterLabelPrefix = zh('筛选条件：', 'Filters:')

  const setDirectoryEnabled = (id, checked) => {
    const next = new Set(enabledDirectorySet)
    if (checked) {
      next.add(id)
    } else {
      next.delete(id)
    }
    // Toggling the master switch resets any per-subdirectory settings.
    if (closedSubdirectories?.[id]?.length) {
      onClosedSubdirectoriesChange?.(id, [])
    }
    onEnabledDirectoryIdsChange?.(Array.from(next))
  }

  const toggleDirectoryExpanded = (id, nodePath = '') => {
    const key = `${id}:${nodePath}`
    setExpandedDirectoryIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Returns true when the node itself or any of its ancestors is in the closed list.
  const nodeIsClosed = (closedList, nodePath) => {
    if (!nodePath) return false
    if (closedList.includes(nodePath)) return true
    return closedList.some((entry) => nodePath.startsWith(entry + '/'))
  }

  // Computes the checkbox display state of a tree node. A node whose every child
  // is hidden counts as hidden too (unless it has direct files of its own), so
  // parents can rely on these states instead of the raw closed list.
  const nodeDisplayState = (node, closedList) => {
    const selfClosed = nodeIsClosed(closedList, node.path)
    const children = node.subdirectories || []
    let checked
    let indeterminate
    if (selfClosed) {
      checked = false
      indeterminate = false
    } else if (children.length === 0) {
      checked = true
      indeterminate = false
    } else {
      const childStates = children.map((child) => nodeDisplayState(child, closedList))
      const hiddenCount = childStates.filter((state) => !state.checked).length
      if (hiddenCount === 0) {
        checked = true
        indeterminate = false
      } else if (hiddenCount === children.length) {
        const hasDirect = Number(node.direct_video_count) > 0
        checked = hasDirect
        indeterminate = hasDirect
      } else {
        checked = true
        indeterminate = true
      }
    }
    return { checked, indeterminate }
  }

  const findTreeNode = (nodes, targetPath) => {
    for (const node of nodes || []) {
      if (node.path === targetPath) return node
      const found = findTreeNode(node.subdirectories, targetPath)
      if (found) return found
    }
    return null
  }

  // Closes nodePath (already added to closed) and propagates upward: when every
  // direct child of the parent is closed and the parent has no direct files, the
  // parent closes too. Returns true when the whole directory was turned off.
  const propagateClose = (directoryId, nodePath, closed, enabled) => {
    const idx = nodePath.lastIndexOf('/')
    const parentPath = idx === -1 ? '' : nodePath.slice(0, idx)
    const layout = subdirsByDirectory[directoryId] || { rootVideoCount: 0, subdirectories: [] }
    // nodeDisplayState expects an array (uses .includes/.some), so convert the Set.
    const closedList = Array.from(closed)
    if (parentPath === '') {
      const topChildren = layout.subdirectories || []
      if (
        topChildren.length > 0 &&
        topChildren.every((child) => !nodeDisplayState(child, closedList).checked) &&
        Number(layout.rootVideoCount) === 0
      ) {
        enabled.delete(directoryId)
        closed.clear()
        return true
      }
      return false
    }
    const parent = findTreeNode(layout.subdirectories, parentPath)
    if (!parent) return false
    const children = parent.subdirectories || []
    if (
      children.length > 0 &&
      children.every((child) => !nodeDisplayState(child, closedList).checked) &&
      Number(parent.direct_video_count) === 0
    ) {
      closed.add(parentPath)
      return propagateClose(directoryId, parentPath, closed, enabled)
    }
    return false
  }

  const setSubdirectoryEnabled = (directoryId, nodePath, checked) => {
    const closed = new Set(closedSubdirectories?.[directoryId] || [])
    if (checked) {
      // Opening a node reveals its whole subtree: remove the node and all
      // descendant entries from the closed list.
      closed.delete(nodePath)
      for (const entry of Array.from(closed)) {
        if (entry.startsWith(nodePath + '/')) {
          closed.delete(entry)
        }
      }
    } else {
      closed.add(nodePath)
      for (const entry of Array.from(closed)) {
        if (entry !== nodePath && entry.startsWith(nodePath + '/')) {
          closed.delete(entry)
        }
      }
      const enabled = new Set(enabledDirectorySet)
      if (propagateClose(directoryId, nodePath, closed, enabled)) {
        onClosedSubdirectoriesChange?.(directoryId, [])
        onEnabledDirectoryIdsChange?.(Array.from(enabled))
        return
      }
    }
    onClosedSubdirectoriesChange?.(directoryId, Array.from(closed))
  }

  const clearAllClosedSubdirectories = () => {
    for (const id of activeDirectoryIds) {
      if (closedSubdirectories?.[id]?.length) {
        onClosedSubdirectoriesChange?.(id, [])
      }
    }
  }

  // Recursively renders one subdirectory row: checkbox, name, file count and an
  // expand/collapse arrow when the node has children of its own.
  const renderDirectoryBranch = (directoryId, node, ancestorsClosed, closedList) => {
    const nodePath = node.path
    const nodeClosed = nodeIsClosed(closedList, nodePath)
    const children = node.subdirectories || []
    const expanded = expandedDirectoryIds.has(`${directoryId}:${nodePath}`)
    // A node hidden by an ancestor cannot be re-enabled on its own, but a node
    // that is itself closed stays clickable so checking it restores its subtree.
    const disabled = ancestorsClosed
    const { checked, indeterminate } = nodeDisplayState(node, closedList)

    return (
      <div key={nodePath}>
        <div className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
          <TriStateCheckbox
            checked={checked}
            indeterminate={indeterminate}
            disabled={disabled}
            onChange={(event) =>
              setSubdirectoryEnabled(directoryId, nodePath, event.target.checked)
            }
            className="h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 disabled:opacity-40"
            aria-label={zh(
              `显示子目录 ${node.name} 的内容`,
              `Show contents of subdirectory ${node.name}`
            )}
          />
          <span className="min-w-0 flex-1 truncate text-gray-700">{node.name}</span>
          <span
            className="shrink-0 text-xs tabular-nums text-gray-400"
            title={zh(
              `目录内文件数 ${node.video_count}`,
              `Files in directory: ${node.video_count}`
            )}
          >
            {Number(node.video_count) || 0}
          </span>
          {children.length > 0 ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                toggleDirectoryExpanded(directoryId, nodePath)
              }}
              aria-label={
                expanded
                  ? zh(`收起子目录 ${node.name}`, `Collapse subdirectories of ${node.name}`)
                  : zh(`展开子目录 ${node.name}`, `Expand subdirectories of ${node.name}`)
              }
              aria-expanded={expanded}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              <KeyboardArrowRightRoundedIcon
                fontSize="small"
                className={
                  expanded ? 'rotate-90 transition-transform' : 'transition-transform'
                }
              />
            </button>
          ) : null}
        </div>
        {expanded && children.length > 0 ? (
          <div className="border-l border-gray-100 pb-1 pl-4">
            {children.map((child) =>
              renderDirectoryBranch(directoryId, child, ancestorsClosed || nodeClosed, closedList)
            )}
          </div>
        ) : null}
      </div>
    )
  }

  const handleIdolFavoriteMenuToggle = () => {
    setIdolFavoriteMenuOpen((open) => {
      const next = !open
      if (next) onOpenIdolFavoriteGroups?.()
      return next
    })
  }

  const searchForm = isJavMode ? (
    <form
      onSubmit={onSubmitJavSearch}
      className="flex items-center overflow-hidden rounded-full border border-gray-200 bg-white shadow-sm"
    >
      <input
        value={javSearchInput}
        onChange={(e) => onJavSearchInputChange(e.target.value)}
        placeholder={
          javTab === 'idol'
            ? zh('搜索女优名称', 'Search idol name')
            : javTab === 'studio'
              ? zh('搜索片商名称', 'Search studio name')
              : javTab === 'series'
                ? zh('搜索系列名称', 'Search series name')
                : zh('搜索番号或标题', 'Search code or title')
        }
        className="h-10 w-36 border-0 bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label={zh('搜索JAV', 'Search JAV')}
      />
      <ButtonTooltip enabled={showButtonTooltips} title={zh('搜索JAV', 'Search JAV')} arrow>
        <Button
          component="a"
          href={javSearchHref}
          aria-label={zh('搜索JAV', 'Search JAV')}
          variant="contained"
          size="medium"
          onClick={(e) => {
            if (isModifiedClick(e)) return
            onSubmitJavSearch(e)
          }}
          sx={{
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            minWidth: 40,
            minHeight: '40px',
            height: '40px',
            px: 1.25,
          }}
        >
          <SearchIcon fontSize="small" />
        </Button>
      </ButtonTooltip>
    </form>
  ) : (
    <form
      onSubmit={onSubmitVideoSearch}
      className="flex items-center overflow-hidden rounded-full border border-gray-200 bg-white shadow-sm"
    >
      <input
        value={videoSearchInput}
        onChange={(e) => onVideoSearchInputChange(e.target.value)}
        placeholder={zh('搜索文件名', 'Search filename')}
        className="h-10 w-36 border-0 bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label={zh('搜索视频', 'Search videos')}
      />
      <ButtonTooltip enabled={showButtonTooltips} title={zh('搜索视频', 'Search videos')} arrow>
        <Button
          component="a"
          href={videoSearchHref}
          aria-label={zh('搜索视频', 'Search videos')}
          variant="contained"
          size="medium"
          onClick={(e) => {
            if (isModifiedClick(e)) return
            onSubmitVideoSearch(e)
          }}
          sx={{
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            minWidth: 40,
            minHeight: '40px',
            height: '40px',
            px: 1.25,
          }}
        >
          <SearchIcon fontSize="small" />
        </Button>
      </ButtonTooltip>
    </form>
  )

  return (
    <header ref={headerRef} className={headerClassName}>
      <div className="absolute left-6 top-1/2 z-10 flex -translate-y-1/2 items-center overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
        <Button
          type="button"
          variant="text"
          onClick={onBrowserBack}
          disabled={!canGoBack}
          title={showButtonTooltips ? zh('浏览器后退', 'Browser back') : undefined}
          aria-label={zh('浏览器后退', 'Browser back')}
          sx={{
            minWidth: 30,
            width: 30,
            height: 30,
            p: 0,
            borderRadius: 0,
            color: 'text.secondary',
          }}
        >
          <ArrowBackRoundedIcon fontSize="small" />
        </Button>
        <span className="h-4 w-px bg-gray-200" aria-hidden="true" />
        <Button
          type="button"
          variant="text"
          onClick={onBrowserForward}
          disabled={!canGoForward}
          title={showButtonTooltips ? zh('浏览器前进', 'Browser forward') : undefined}
          aria-label={zh('浏览器前进', 'Browser forward')}
          sx={{
            minWidth: 30,
            width: 30,
            height: 30,
            p: 0,
            borderRadius: 0,
            color: 'text.secondary',
          }}
        >
          <ArrowForwardRoundedIcon fontSize="small" />
        </Button>
      </div>
      <div className={headerBodyClassName}>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="relative flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onHome}
              className="cursor-pointer select-none rounded text-left text-xl font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              JavBoss
            </button>
            {searchForm}
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {isJavMode ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant={javTab === 'list' ? 'contained' : 'outlined'}
                    onClick={() => onSwitchJavTab('list')}
                  >
                    {zh('作品', 'JAV')}
                  </Button>
                  <Button
                    variant={javTab === 'idol' ? 'contained' : 'outlined'}
                    onClick={() => onSwitchJavTab('idol')}
                  >
                    {zh('女优', 'Idol')}
                  </Button>
                  <Button
                    variant={javTab === 'studio' ? 'contained' : 'outlined'}
                    onClick={() => onSwitchJavTab('studio')}
                  >
                    {zh('片商', 'Studio')}
                  </Button>
                  <Button
                    variant={javTab === 'series' ? 'contained' : 'outlined'}
                    onClick={() => onSwitchJavTab('series')}
                  >
                    {zh('系列', 'Series')}
                  </Button>
                  <ButtonTooltip enabled={showButtonTooltips} title={zh('随机', 'Random')} arrow>
                    <Button
                      component="a"
                      href={javRandomHref}
                      variant="outlined"
                      aria-label={zh('随机', 'Random')}
                      onClick={(e) => {
                        if (isModifiedClick(e)) return
                        e.preventDefault()
                        onJavRandomClick?.()
                      }}
                      sx={{
                        minWidth: 36,
                        width: 36,
                        height: 36,
                        p: 0,
                      }}
                    >
                      <ShuffleOutlinedIcon fontSize="small" />
                    </Button>
                  </ButtonTooltip>
                  <ButtonTooltip
                    enabled={showButtonTooltips}
                    title={zh('标签管理', 'Tag management')}
                    arrow
                  >
                    <Button
                      variant="outlined"
                      onClick={onOpenJavTagModal}
                      aria-label={zh('标签管理', 'Tag management')}
                      sx={{
                        minWidth: 36,
                        width: 36,
                        height: 36,
                        p: 0,
                      }}
                    >
                      <LocalOfferOutlinedIcon fontSize="small" />
                    </Button>
                  </ButtonTooltip>
                  <ButtonTooltip enabled={showButtonTooltips} title={zh('番号', 'JAV codes')} arrow>
                    <Button
                      type="button"
                      variant="outlined"
                      onClick={() => setPrefixModalOpen(true)}
                      aria-label={zh('番号', 'JAV codes')}
                      sx={{
                        minWidth: 36,
                        width: 36,
                        height: 36,
                        p: 0,
                      }}
                    >
                      <NumbersRoundedIcon fontSize="small" />
                    </Button>
                  </ButtonTooltip>
                  {isJavMode ? (
                    <div ref={idolFavoriteMenuRef} className="relative">
                      <ButtonTooltip enabled={showButtonTooltips} title={favoriteLabel} arrow>
                        <Button
                          type="button"
                          variant="outlined"
                          onClick={handleIdolFavoriteMenuToggle}
                          aria-label={favoriteLabel}
                          aria-haspopup="dialog"
                          aria-expanded={idolFavoriteMenuOpen}
                          sx={{
                            minWidth: 36,
                            width: idolSelectedFavoriteGroupName ? 'auto' : 36,
                            maxWidth: 180,
                            height: 36,
                            px: idolSelectedFavoriteGroupName ? 1.25 : 0,
                            py: 0,
                            gap: 0.75,
                          }}
                        >
                          <BookmarksOutlinedIcon fontSize="small" />
                          {idolSelectedFavoriteGroupName ? (
                            <span className="min-w-0 truncate text-sm">
                              {idolSelectedFavoriteGroupName}
                            </span>
                          ) : null}
                        </Button>
                      </ButtonTooltip>
                      {idolFavoriteMenuOpen ? (
                        <IdolFavoriteGroupMenu
                          showButtonTooltips={showButtonTooltips}
                          title={favoriteLabel}
                          allLabel={favoriteAllLabel}
                          groups={favoriteGroups}
                          selectedGroupId={selectedFavoriteGroupId}
                          loading={favoriteGroupsLoading}
                          error={favoriteGroupsError}
                          buildGroupUrl={buildIdolFavoriteGroupUrl}
                          onSelect={(groupId) => {
                            onIdolFavoriteGroupSelect?.(groupId)
                            setIdolFavoriteMenuOpen(false)
                          }}
                          onOpenManager={(group) => {
                            onOpenIdolFavoriteManager?.(group)
                          }}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Button
                      component="a"
                      href={randomHref}
                      startIcon={<ShuffleOutlinedIcon fontSize="small" />}
                      variant="outlined"
                      onClick={(e) => {
                        if (isModifiedClick(e)) return
                        e.preventDefault()
                        onRandomClick()
                      }}
                    >
                      {zh('随机', 'Random')}
                    </Button>
                  </div>
                  <Button
                    startIcon={<LocalOfferOutlinedIcon fontSize="small" />}
                    variant="outlined"
                    onClick={onOpenTagModal}
                  >
                    {zh('标签', 'Tag')}
                  </Button>
                </>
              )}

              {isJavMode ? (
                <ButtonTooltip
                  enabled={showButtonTooltips}
                  title={zh('显示设置', 'Display settings')}
                  arrow
                >
                  <Button
                    variant="outlined"
                    onClick={handleSettingsClick}
                    aria-label={zh('显示设置', 'Display settings')}
                    sx={{
                      minWidth: 36,
                      width: 36,
                      height: 36,
                      p: 0,
                    }}
                  >
                    <DisplaySettingsIcon fontSize="small" />
                  </Button>
                </ButtonTooltip>
              ) : (
                <Button
                  startIcon={<DisplaySettingsIcon fontSize="small" />}
                  variant="outlined"
                  onClick={handleSettingsClick}
                  aria-label={zh('设置', 'Settings')}
                >
                  {zh('设置', 'Settings')}
                </Button>
              )}
            </div>

            {isJavMode && javTab === 'list' ? (
              <div className="flex min-w-0 flex-1 items-center gap-1">
                {filterSummary ? (
                  <Tooltip title={`${filterLabelPrefix}${filterSummary}`} arrow>
                    <span className="min-w-0 truncate whitespace-nowrap text-xs text-gray-500">
                      {filterLabelPrefix}
                      <span className="font-semibold text-gray-700">{filterSummary}</span>
                    </span>
                  </Tooltip>
                ) : null}
                <ButtonTooltip
                  enabled={showButtonTooltips}
                  title={zh('编辑 JAV 查询条件', 'Edit JAV filters')}
                  arrow
                >
                  <button
                    type="button"
                    onClick={onOpenJavQueryEditor}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    aria-label={zh('编辑 JAV 查询条件', 'Edit JAV filters')}
                  >
                    <TuneOutlinedIcon fontSize="inherit" className="text-[16px]" />
                  </button>
                </ButtonTooltip>
                {showJavFilterRandomButton ? (
                  <span className="inline-flex shrink-0 items-center">
                    <ButtonTooltip
                      enabled={showButtonTooltips}
                      title={zh('基于当前筛选条件随机', 'Random within current filters')}
                      arrow
                    >
                      <button
                        type="button"
                        onClick={onJavFilterRandomClick}
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          javRandomMode
                            ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                        }`}
                        aria-label={zh('基于当前筛选条件随机', 'Random within current filters')}
                      >
                        <ShuffleOutlinedIcon fontSize="inherit" className="text-[16px]" />
                      </button>
                    </ButtonTooltip>
                    {javRandomMode ? (
                      <ButtonTooltip
                        enabled={showButtonTooltips}
                        title={zh('取消筛选随机', 'Cancel filter random')}
                        arrow
                      >
                        <button
                          type="button"
                          onClick={onCancelJavFilterRandom}
                          className="-ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-sm text-amber-500 hover:bg-amber-100 hover:text-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          aria-label={zh('取消筛选随机', 'Cancel filter random')}
                        >
                          <CloseRoundedIcon fontSize="inherit" className="text-[14px]" />
                        </button>
                      </ButtonTooltip>
                    ) : null}
                  </span>
                ) : null}
              </div>
            ) : filterSummary ? (
              <div className="min-w-0 flex-1">
                <Tooltip title={`${filterLabelPrefix}${filterSummary}`} arrow>
                  <span className="inline-block max-w-full truncate whitespace-nowrap text-xs text-gray-500">
                    {filterLabelPrefix}
                    <span className="font-semibold text-gray-700">{filterSummary}</span>
                  </span>
                </Tooltip>
              </div>
            ) : null}
          </div>
        </div>
        <div className="absolute right-6 top-1/2 z-10 flex flex-shrink-0 -translate-y-1/2 flex-wrap items-center justify-end gap-2">
          {showDirectorySetupHint ? (
            <div
              className="directory-setup-hint flex max-w-full items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm"
              role="status"
            >
              <span className="min-w-0 truncate">
                {zh(
                  '您还没有添加目录，点击此处在目录管理内添加',
                  'No directories yet. Click here to add one in Directory Management'
                )}
              </span>
              <ArrowForwardRoundedIcon
                className="directory-setup-hint__arrow shrink-0"
                fontSize="small"
                aria-hidden="true"
              />
            </div>
          ) : null}
          <div ref={directoryMenuRef} className="relative inline-flex gap-2">
            {hasVideoSelection ? (
              <div className="inline-flex items-center gap-1 rounded-full border border-sky-100 bg-sky-50 px-1.5 py-1">
                <span className="whitespace-nowrap px-1.5 text-xs font-medium text-sky-700">
                  {zh(`已选 ${selectedVideoCount} 项`, `${selectedVideoCount} selected`)}
                </span>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={onOpenSelectionOps}
                  className="topbar-selection-action"
                >
                  {zh('操作', 'Actions')}
                </Button>
                <Button
                  variant="text"
                  size="small"
                  onClick={onClearSelection}
                  className="topbar-selection-action"
                >
                  {zh('清空', 'Clear')}
                </Button>
              </div>
            ) : null}
            <ButtonTooltip
              enabled={showButtonTooltips}
              title={zh('全局设置', 'Global settings')}
              arrow
            >
              <Button
                variant="outlined"
                onClick={onOpenGlobalSettings}
                aria-label={zh('全局设置', 'Global settings')}
                sx={{
                  minWidth: 36,
                  width: 36,
                  height: 36,
                  p: 0,
                }}
              >
                <SettingsOutlinedIcon fontSize="small" />
              </Button>
            </ButtonTooltip>
            <ButtonTooltip
              enabled={showButtonTooltips}
              title={zh('选择启用目录', 'Choose enabled directories')}
              arrow
            >
              <Button
                type="button"
                onClick={() => setDirectoryMenuOpen((open) => !open)}
                aria-label={zh('选择启用目录', 'Choose enabled directories')}
                aria-haspopup="menu"
                aria-expanded={directoryMenuOpen}
                variant="outlined"
                sx={{
                  minWidth: 54,
                  width: 54,
                  height: 36,
                  p: 0,
                  gap: 0.25,
                }}
              >
                <FolderOpenOutlinedIcon fontSize="small" />
                <KeyboardArrowDownRoundedIcon
                  fontSize="small"
                  className={
                    directoryMenuOpen ? 'rotate-180 transition-transform' : 'transition-transform'
                  }
                />
              </Button>
            </ButtonTooltip>

            {directoryMenuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded border border-gray-200 bg-white text-left shadow-lg"
              >
                <div className="flex items-center justify-between gap-2 border-b bg-gray-50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-700">
                      {zh('启用目录', 'Enabled directories')}
                    </div>
                    <div className="truncate text-xs text-gray-500">{directorySummary}</div>
                  </div>
                  {activeDirectories.length > 0 ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          onEnabledDirectoryIdsChange?.(activeDirectoryIds)
                          clearAllClosedSubdirectories()
                        }}
                        className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                      >
                        {zh('全选', 'All')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onEnabledDirectoryIdsChange?.([])
                          clearAllClosedSubdirectories()
                        }}
                        className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                      >
                        {zh('清空', 'None')}
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="max-h-[60vh] overflow-y-auto py-1">
                  {activeDirectories.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-gray-500">
                      {zh('还没有添加目录', 'No directories yet')}
                    </div>
                  ) : (
                    activeDirectories.map((directory) => {
                      const id = Number(directory.id)
                      const checked = enabledDirectorySet.has(id)
                      const directoryPath = displayHostPath(directory.path, hostPathPrefixEnabled)
                      const closedNames = new Set(closedSubdirectories?.[id] || [])
                      const directoryLayout = subdirsByDirectory[id] || {
                        rootVideoCount: 0,
                        subdirectories: [],
                      }
                      const subdirectories = directoryLayout.subdirectories || []
                      const hasRootFiles = Number(directoryLayout.rootVideoCount) > 0
                      const closedArray = Array.from(closedNames)
                      const expanded = expandedDirectoryIds.has(`${id}:`)
                      const hasSubdirectories = subdirectories.length > 0
                      const topStates = subdirectories.map((subdir) =>
                        nodeDisplayState(subdir, closedArray)
                      )
                      const topHiddenCount = topStates.filter((state) => !state.checked).length
                      // A directory is partially enabled when some of its
                      // subdirectories are hidden, or when every subdirectory is
                      // hidden but files directly at the root remain visible.
                      const partiallyEnabled =
                        checked &&
                        ((topHiddenCount > 0 && topHiddenCount < subdirectories.length) ||
                          (hasSubdirectories &&
                            topHiddenCount === subdirectories.length &&
                            hasRootFiles))
                      return (
                        <div key={directory.id}>
                          <div className="flex items-start gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                              <TriStateCheckbox
                                checked={checked}
                                indeterminate={partiallyEnabled}
                                onChange={(event) => setDirectoryEnabled(id, event.target.checked)}
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600"
                                aria-label={zh(
                                  `启用目录 ${directoryPath}`,
                                  `Enable directory ${directoryPath}`
                                )}
                              />
                              <span className="min-w-0 flex-1 text-gray-700">
                                <span className="break-all">{directoryPath}</span>
                                {closedArray.length > 0 ? (
                                  <span className="ml-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                                    {zh(
                                      `部分子目录已隐藏`,
                                      'Some subdirectories hidden'
                                    )}
                                  </span>
                                ) : null}
                                {directory.missing ? (
                                  <span className="ml-2 inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                                    {zh('目录缺失', 'Missing')}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                            {hasSubdirectories ? (
                              <div className="flex shrink-0 items-center gap-0.5">
                                <span
                                  className="text-xs tabular-nums text-gray-400"
                                  title={zh(
                                    `目录内文件数 ${directory.scanned_video_count}`,
                                    `Files in directory: ${directory.scanned_video_count}`
                                  )}
                                >
                                  {Number(directory.scanned_video_count) || 0}
                                </span>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    toggleDirectoryExpanded(id, '')
                                  }}
                                  aria-label={
                                    expanded
                                      ? zh(
                                          `收起子目录 ${directoryPath}`,
                                          `Collapse subdirectories of ${directoryPath}`
                                        )
                                      : zh(
                                          `展开子目录 ${directoryPath}`,
                                          `Expand subdirectories of ${directoryPath}`
                                        )
                                  }
                                  aria-expanded={expanded}
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                >
                                  <KeyboardArrowRightRoundedIcon
                                    fontSize="small"
                                    className={
                                      expanded
                                        ? 'rotate-90 transition-transform'
                                        : 'transition-transform'
                                    }
                                  />
                                </button>
                              </div>
                            ) : null}
                          </div>
                          {expanded ? (
                            <div className="border-l border-gray-100 pb-1 pl-4">
                              {subdirsLoading && subdirectories.length === 0 ? (
                                <div className="px-3 py-1.5 text-xs text-gray-400">
                                  {zh('加载子目录…', 'Loading subdirectories...')}
                                </div>
                              ) : (
                                <>
                                  {subdirectories.map((subdir) =>
                                    renderDirectoryBranch(id, subdir, !checked, closedArray)
                                  )}
                                  {hasRootFiles ? (
                                    <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500">
                                      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                        <FolderRoundedIcon fontSize="small" className="text-gray-400" />
                                      </span>
                                      <span className="min-w-0 flex-1 truncate">
                                        {zh('(根目录)', '(Root)')}
                                      </span>
                                      <span className="shrink-0 text-xs tabular-nums text-gray-400">
                                        {Number(directoryLayout.rootVideoCount) || 0}
                                      </span>
                                    </div>
                                  ) : null}
                                </>
                              )}
                            </div>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <ButtonTooltip
            enabled={showButtonTooltips}
            title={
              isJavMode ? zh('切换到视频', 'Switch to Video') : zh('切换到 JAV', 'Switch to JAV')
            }
            arrow
          >
            <Button
              variant="contained"
              color={isJavMode ? 'secondary' : 'primary'}
              startIcon={<SwapHorizOutlinedIcon fontSize="small" />}
              onClick={onToggleMode}
              aria-label={
                isJavMode ? zh('切换到视频', 'Switch to Video') : zh('切换到 JAV', 'Switch to JAV')
              }
            >
              {isJavMode ? zh('视频', 'Video') : 'JAV'}
            </Button>
          </ButtonTooltip>
        </div>
      </div>
      <JavPrefixModal
        open={prefixModalOpen}
        items={prefixItems}
        loading={prefixLoading}
        error={prefixError}
        activePrefix={javPrefix}
        buildPrefixUrl={buildJavPrefixUrl}
        onSelectPrefix={(item) => {
          setPrefixModalOpen(false)
          onJavPrefixClick?.(item)
        }}
        onClose={() => setPrefixModalOpen(false)}
      />
    </header>
  )
}

function IdolFavoriteGroupMenu({
  showButtonTooltips,
  title,
  allLabel,
  groups,
  selectedGroupId,
  loading,
  error,
  buildGroupUrl,
  onSelect,
  onOpenManager,
}) {
  const list = Array.isArray(groups) ? groups : []
  const selected = Number(selectedGroupId) || null

  return (
    <div
      role="dialog"
      aria-label={title || zh('女优收藏夹', 'Idol favorites')}
      className="absolute left-1/2 top-full z-50 mt-2.5 flex max-h-[70vh] w-[34rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col overflow-visible rounded border border-gray-200 bg-white text-left shadow-xl"
    >
      <span
        className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 -translate-y-full border-x-[10px] border-b-[10px] border-x-transparent border-b-gray-200"
        aria-hidden="true"
      />
      <span
        className="absolute left-1/2 top-px h-0 w-0 -translate-x-1/2 -translate-y-full border-x-[9px] border-b-[9px] border-x-transparent border-b-gray-50"
        aria-hidden="true"
      />
      <div className="flex items-center justify-between gap-2 border-b bg-gray-50 px-3 py-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-700">
            {title || zh('女优收藏夹', 'Idol favorites')}
          </div>
          <div className="truncate text-xs text-gray-500">
            {loading
              ? zh('加载中…', 'Loading...')
              : zh(`${list.length} 个收藏夹`, `${list.length} favorites`)}
          </div>
        </div>
        <ButtonTooltip
          enabled={showButtonTooltips}
          title={zh('管理收藏夹', 'Manage favorites')}
          arrow
        >
          <IconButton
            type="button"
            size="small"
            onClick={() => onOpenManager?.()}
            aria-label={zh('管理收藏夹', 'Manage favorites')}
            sx={{ width: 30, height: 30 }}
          >
            <SettingsOutlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </ButtonTooltip>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/80 p-2">
        {error ? (
          <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
            {String(error)}
          </div>
        ) : null}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(5.75rem,1fr))] gap-2">
          <FavoriteGroupTile
            active={!selected}
            href={buildGroupUrl?.(null)}
            label={allLabel || zh('全部女优', 'All idols')}
            onClick={() => onSelect?.(null)}
          />
          {list.map((group) => {
            const id = Number(group?.id)
            if (!Number.isFinite(id) || id <= 0) return null
            const count = Number(group?.count)
            return (
              <FavoriteGroupTile
                key={id}
                active={selected === id}
                href={buildGroupUrl?.(id)}
                group={group}
                label={group?.name || zh('未命名收藏夹', 'Untitled favorite group')}
                count={Number.isFinite(count) ? count : 0}
                onClick={() => onSelect?.(id)}
                onEdit={() => onOpenManager?.(group)}
              />
            )
          })}
        </div>
        {!loading && !error && list.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-gray-500">
            {zh('暂无收藏夹', 'No favorites')}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function FavoriteGroupTile({ active, href, group = null, label, count, onClick, onEdit }) {
  return (
    <div
      className={`group relative block aspect-square overflow-hidden rounded-lg border focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        active ? 'border-blue-300 shadow-md' : 'border-amber-200/80 shadow-sm'
      }`}
    >
      <a
        href={href || '#'}
        onClick={(event) => {
          if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.button !== 0
          ) {
            return
          }
          event.preventDefault()
          onClick?.()
        }}
        className="relative block h-full focus:outline-none"
      >
        <span
          className={`absolute left-2 top-1.5 h-3 w-10 rounded-t-md border border-b-0 ${
            active
              ? 'border-blue-300 bg-gradient-to-b from-blue-200 to-blue-300'
              : 'border-amber-200 bg-gradient-to-b from-amber-100 to-amber-200'
          }`}
          aria-hidden="true"
        />
        <span
          className={`absolute inset-x-1.5 bottom-1.5 top-3.5 rounded-md border shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_6px_10px_rgba(15,23,42,0.11)] ${
            active
              ? 'border-blue-300 bg-gradient-to-br from-blue-100 via-blue-200 to-blue-300'
              : 'border-amber-200 bg-gradient-to-br from-amber-50 via-amber-100 to-amber-200'
          }`}
          aria-hidden="true"
        />
        <span
          className={`absolute inset-x-2 bottom-0.5 h-1.5 rounded-b-md ${
            active ? 'bg-blue-400/40' : 'bg-amber-300/45'
          }`}
          aria-hidden="true"
        />
        <span className="relative flex h-full px-2 pt-5">
          <span className="flex items-start gap-1">
            <FolderRoundedIcon
              sx={{ fontSize: 14 }}
              className={active ? 'shrink-0 text-blue-700' : 'shrink-0 text-amber-700'}
            />
            <span
              className={`min-w-0 flex-1 truncate text-[11px] font-semibold leading-4 ${
                active ? 'text-blue-950' : 'text-amber-950'
              }`}
            >
              {label}
            </span>
          </span>
        </span>
      </a>
      {Number.isFinite(count) ? (
        <span
          className={`absolute right-1.5 top-1.5 rounded-full border px-1.5 text-[10px] leading-4 shadow-sm ${
            active
              ? 'border-blue-200 bg-white/80 text-blue-700'
              : 'border-amber-200 bg-white/80 text-amber-800'
          }`}
        >
          {count}
        </span>
      ) : null}
      {group ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onEdit?.()
          }}
          className={`absolute bottom-1.5 right-1.5 inline-flex h-5 w-5 items-center justify-center rounded border bg-white/85 shadow-sm backdrop-blur-sm transition-colors ${
            active
              ? 'border-blue-200 text-blue-700 hover:bg-blue-50'
              : 'border-amber-200 text-amber-800 hover:bg-amber-50'
          }`}
          aria-label={zh(`编辑收藏夹 ${label}`, `Edit favorite ${label}`)}
        >
          <EditRoundedIcon sx={{ fontSize: 14 }} />
        </button>
      ) : null}
    </div>
  )
}
