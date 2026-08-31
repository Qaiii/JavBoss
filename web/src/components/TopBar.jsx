import { useEffect, useMemo, useRef, useState } from 'react'
import BookmarksOutlinedIcon from '@mui/icons-material/BookmarksOutlined'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded'
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded'
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined'
import FolderRoundedIcon from '@mui/icons-material/FolderRounded'
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded'
import SearchIcon from '@mui/icons-material/Search'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import ShuffleOutlinedIcon from '@mui/icons-material/ShuffleOutlined'
import { Button, IconButton, Popper, Slider } from '@mui/material'
import { fetchDirectorySubdirectories } from '@/api'
import {
  formatIdolProfileFilterRange,
  IDOL_PROFILE_FILTER_DEFINITIONS,
  normalizeIdolProfileFilters,
} from '@/constants/jav'
import { displayHostPath } from '@/utils/hostPath'
import { zh } from '@/utils/i18n'

const FAVORITE_MENU_RIGHT_SHIFT = 32

function isModifiedClick(event) {
  return Boolean(
    event &&
      (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
  )
}

function FilterChip({ label, onRemove }) {
  return (
    <span className="filter-chip" title={label}>
      <span className="filter-chip__label">{label}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="filter-chip__remove"
          aria-label={zh(`删除筛选条件 ${label}`, `Remove filter ${label}`)}
        >
          <CloseRoundedIcon fontSize="inherit" />
        </button>
      ) : null}
    </span>
  )
}

function FavoriteRatingFilter({ enabled, min, max, onEnabledChange, onRangeChange }) {
  const normalizedMin = Number.isFinite(Number(min)) ? Number(min) : 0.5
  const normalizedMax = Number.isFinite(Number(max)) ? Number(max) : 5
  const range = normalizedMin <= normalizedMax ? [normalizedMin, normalizedMax] : [0.5, 5]
  const formatValue = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1))
  const toggleLabel = enabled
    ? zh('关闭喜爱度筛选', 'Disable favorite rating filter')
    : zh('启用喜爱度筛选', 'Enable favorite rating filter')

  return (
    <div className={`favorite-rating-filter ${enabled ? 'favorite-rating-filter--active' : ''}`}>
      <button
        type="button"
        className="favorite-rating-filter__toggle"
        onClick={() => onEnabledChange?.(!enabled)}
        title={toggleLabel}
        aria-label={toggleLabel}
        aria-pressed={Boolean(enabled)}
      >
        {enabled ? (
          <FavoriteRoundedIcon fontSize="inherit" />
        ) : (
          <FavoriteBorderRoundedIcon fontSize="inherit" />
        )}
      </button>
      <Slider
        value={range}
        onChange={(_, value) => {
          if (Array.isArray(value)) onRangeChange?.(value)
        }}
        min={0.5}
        max={5}
        step={0.5}
        disableSwap
        disabled={!enabled}
        getAriaLabel={(index) =>
          index === 0
            ? zh('最低喜爱度', 'Minimum favorite rating')
            : zh('最高喜爱度', 'Maximum favorite rating')
        }
        sx={{
          gridColumn: 3,
          width: '100%',
          minWidth: 0,
          alignSelf: 'center',
          transform: 'translateY(-1px)',
          p: 0,
          height: 3,
          '& .MuiSlider-rail, & .MuiSlider-track': { height: 3 },
          '& .MuiSlider-thumb': { width: 10, height: 10 },
          '& .MuiSlider-thumb::after': { width: 16, height: 16 },
        }}
      />
      <span className="favorite-rating-filter__value">
        {formatValue(range[0])}–{formatValue(range[1])}
      </span>
    </div>
  )
}

function TriStateCheckbox({ indeterminate = false, ...props }) {
  const inputRef = useRef(null)
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = Boolean(indeterminate)
    }
  }, [indeterminate])
  return <input ref={inputRef} type="checkbox" {...props} />
}

function IdolProfileFilter({ definition, value, onChange }) {
  const anchorRef = useRef(null)
  const closeTimerRef = useRef(null)
  const draggingRef = useRef(false)
  const pointerInsideRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [draftEnabled, setDraftEnabled] = useState(value.enabled)
  const [draftRange, setDraftRange] = useState([value.min, value.max])
  const label = zh(definition.label[0], definition.label[1])
  const rangeLabel = formatIdolProfileFilterRange(
    definition,
    { enabled: draftEnabled, min: draftRange[0], max: draftRange[1] },
    zh
  )

  const cancelClose = () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
    setOpen(true)
  }
  const scheduleClose = () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      if (draggingRef.current || pointerInsideRef.current) return
      setOpen(false)
    }, 0)
  }
  const handleMouseEnter = () => {
    pointerInsideRef.current = true
    cancelClose()
  }
  const handleMouseLeave = () => {
    pointerInsideRef.current = false
    scheduleClose()
  }

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    },
    []
  )

  useEffect(() => {
    if (draggingRef.current) return
    setDraftEnabled(value.enabled)
    setDraftRange([value.min, value.max])
  }, [value.enabled, value.max, value.min])

  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !draggingRef.current) setOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  return (
    <div
      className="idol-profile-filter"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocusCapture={cancelClose}
      onBlurCapture={scheduleClose}
    >
      <button
        ref={anchorRef}
        type="button"
        className={`filter-action-button ${draftEnabled ? 'filter-action-button--active' : ''}`}
        onClick={cancelClose}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="idol-profile-filter__label">{label}</span>
        {draftEnabled ? <span className="idol-profile-filter__range">{rangeLabel}</span> : null}
      </button>
      <Popper
        open={open}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        modifiers={[{ name: 'offset', options: { offset: [0, 0] } }]}
        sx={{ zIndex: 60 }}
      >
        <div
          className="idol-profile-filter__popover-hitbox"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onFocusCapture={cancelClose}
          onBlurCapture={scheduleClose}
        >
          <div
            className="idol-profile-filter__popover"
            role="dialog"
            aria-label={zh(`${label}筛选`, `${label} filter`)}
          >
            <div className="idol-profile-filter__popover-header">
              <span>{rangeLabel}</span>
              {draftEnabled ? (
                <button
                  type="button"
                  className="idol-profile-filter__clear"
                  onClick={() => {
                    draggingRef.current = false
                    setDraftEnabled(false)
                    setDraftRange([definition.min, definition.max])
                    setOpen(false)
                    onChange?.(definition.key, {
                      enabled: false,
                      min: definition.min,
                      max: definition.max,
                    })
                  }}
                >
                  {zh('清除', 'Clear')}
                </button>
              ) : null}
            </div>
            <Slider
              value={draftRange}
              onPointerDown={() => {
                draggingRef.current = true
                setDraftEnabled(true)
              }}
              onChange={(_, range) => {
                if (Array.isArray(range)) {
                  setDraftEnabled(true)
                  setDraftRange(range)
                }
              }}
              onChangeCommitted={(_, range) => {
                const wasDragging = draggingRef.current
                draggingRef.current = false
                if (Array.isArray(range)) {
                  setDraftEnabled(true)
                  setDraftRange(range)
                  onChange?.(definition.key, {
                    enabled: true,
                    min: range[0],
                    max: range[1],
                  })
                }
                if (wasDragging && !pointerInsideRef.current) scheduleClose()
              }}
              min={definition.min}
              max={definition.max}
              step={definition.step}
              disableSwap
              getAriaLabel={(index) =>
                index === 0
                  ? zh(`最低${label}`, `Minimum ${label}`)
                  : zh(`最高${label}`, `Maximum ${label}`)
              }
              sx={{
                width: '100%',
                color: draftEnabled ? 'primary.main' : 'var(--c-ink-faint)',
                p: 0,
                height: 4,
                '& .MuiSlider-rail, & .MuiSlider-track': { height: 4 },
                '& .MuiSlider-thumb': { width: 12, height: 12 },
                '& .MuiSlider-thumb::after': { width: 20, height: 20 },
              }}
            />
          </div>
        </div>
      </Popper>
    </div>
  )
}

function IdolProfileFilters({ filters, onChange, showClear, onClear }) {
  const normalized = useMemo(() => normalizeIdolProfileFilters(filters), [filters])

  return (
    <div className="idol-profile-filters" aria-label={zh('女优资料筛选', 'Idol profile filters')}>
      {IDOL_PROFILE_FILTER_DEFINITIONS.map((definition) => (
        <IdolProfileFilter
          key={definition.key}
          definition={definition}
          value={normalized[definition.key]}
          onChange={onChange}
        />
      ))}
      {showClear ? (
        <button
          type="button"
          className="filter-clear-button idol-profile-filters__clear"
          onClick={onClear}
        >
          {zh('清空', 'Clear')}
        </button>
      ) : null}
    </div>
  )
}

export default function TopBar({
  favoriteEntityType = 'idol',
  favoriteGroups = [],
  favoriteGroupsError = null,
  favoriteGroupsLoading = false,
  favoriteManagerOpen = false,
  favoriteRatingEnabled = false,
  favoriteRatingMin = 0.5,
  favoriteRatingMax = 5,
  idolProfileFilters = {},
  buildFavoriteGroupUrl,
  filterItems = [],
  hasActiveControlFilter = false,
  isJavMode,
  javSearchHref,
  javSearchInput,
  javTab,
  onClearFilters,
  onFavoriteGroupSelect,
  onFavoriteRatingEnabledChange,
  onFavoriteRatingRangeChange,
  onIdolProfileFilterChange,
  onHome,
  onRandomClick,
  onOpenFavoriteGroups,
  onOpenFilterEditor,
  onOpenFavoriteManager,
  onSearchInputChange,
  onSubmitSearch,
  onOpenSelectionOps,
  onClearSelection,
  searchHref,
  searchInput,
  selectedCount = 0,
  selectedFavoriteGroupId = null,
  directories = [],
  enabledDirectoryIds = [],
  directorySubpaths = [],
  onEnabledDirectoryIdsChange,
  closedSubdirectories = {},
  onClosedSubdirectoriesChange,
  hostPathPrefixEnabled = false,
}) {
  const headerRef = useRef(null)
  const directoryMenuRef = useRef(null)
  const favoriteMenuRef = useRef(null)
  const [directoryMenuOpen, setDirectoryMenuOpen] = useState(false)
  const [expandedDirectoryIds, setExpandedDirectoryIds] = useState(() => new Set())
  const [subdirsByDirectory, setSubdirsByDirectory] = useState({})
  const [subdirsLoading, setSubdirsLoading] = useState(false)
  const [favoriteMenuOpen, setFavoriteMenuOpen] = useState(false)

  const activeDirectories = useMemo(
    () =>
      Array.isArray(directories) ? directories.filter((directory) => !directory?.is_delete) : [],
    [directories]
  )
  const focusedSubpath = useMemo(() => {
    const first = Array.isArray(directorySubpaths) ? directorySubpaths[0] : null
    if (!first) return ''
    const dir = activeDirectories.find((d) => Number(d?.id) === Number(first.directoryId))
    if (!dir) return ''
    const root = displayHostPath(dir.path, hostPathPrefixEnabled).replace(/[\\/]+$/, '')
    const rel = String(first?.path || '').replace(/^[\\/]+|[\\/]+$/g, '')
    return rel ? `${root}/${rel}` : root
  }, [directorySubpaths, activeDirectories, hostPathPrefixEnabled])
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
  const selectedFavoriteGroup = useMemo(() => {
    const selectedId = Number(selectedFavoriteGroupId)
    if (!Number.isFinite(selectedId) || selectedId <= 0) return null
    return favoriteGroups.find((group) => Number(group?.id) === selectedId) || null
  }, [favoriteGroups, selectedFavoriteGroupId])

  const favoriteLabel = useMemo(() => {
    switch (favoriteEntityType) {
      case 'jav':
        return zh('作品收藏夹', 'Work favorites')
      case 'studio':
        return zh('片商收藏夹', 'Studio favorites')
      case 'series':
        return zh('系列收藏夹', 'Series favorites')
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
      default:
        return zh('全部女优', 'All idols')
    }
  }, [favoriteEntityType])

  useEffect(() => {
    const updateHeight = () => {
      const height = headerRef.current?.getBoundingClientRect().height || 0
      document.documentElement.style.setProperty('--topbar-height', `${Math.round(height)}px`)
    }
    updateHeight()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updateHeight) : null
    if (headerRef.current) observer?.observe(headerRef.current)
    window.addEventListener('resize', updateHeight)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateHeight)
    }
  }, [])

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
    )
      .then((results) => {
        if (cancelled) return
        const next = {}
        for (const [id, payload] of results) {
          if (payload) next[id] = payload
        }
        setSubdirsByDirectory(next)
      })
      .finally(() => {
        if (!cancelled) setSubdirsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeDirectories, directoryMenuOpen])

  useEffect(() => {
    const directoryOpen = directoryMenuOpen
    const favoriteOpen = favoriteMenuOpen && !favoriteManagerOpen
    if (!directoryOpen && !favoriteOpen) return undefined
    const handlePointerDown = (event) => {
      if (directoryMenuRef.current?.contains(event.target)) return
      if (favoriteMenuRef.current?.contains(event.target)) return
      setDirectoryMenuOpen(false)
      setFavoriteMenuOpen(false)
    }
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      setDirectoryMenuOpen(false)
      setFavoriteMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [directoryMenuOpen, favoriteMenuOpen, favoriteManagerOpen])

  const activeSearchInput = isJavMode ? javSearchInput : searchInput
  const activeSearchHref = isJavMode ? javSearchHref : searchHref
  const selectedVideoCount = Number(selectedCount)
  const hasVideoSelection =
    !isJavMode && Number.isFinite(selectedVideoCount) && selectedVideoCount > 0
  const placeholder = isJavMode
    ? javTab === 'idol'
      ? zh('搜索女优名称', 'Search idol name')
      : javTab === 'studio'
        ? zh('搜索片商名称', 'Search studio name')
        : javTab === 'series'
          ? zh('搜索系列名称', 'Search series name')
          : zh('搜索番号或标题', 'Search code or title')
    : zh('搜索文件名', 'Search filename')
  const showFilterCluster =
    filterItems.length > 0 ||
    Boolean(onOpenFilterEditor) ||
    ((!isJavMode || javTab !== 'idol') && hasActiveControlFilter)

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

  // Directory checkbox is a three-state cycle: unchecked (empty) or partially
  // enabled (special mark, some subdirectories hidden) toggles to fully
  // enabled; fully enabled toggles the directory off.
  const toggleDirectoryEnabled = (id) => {
    const fullyEnabled =
      enabledDirectorySet.has(id) && (closedSubdirectories?.[id] || []).length === 0
    setDirectoryEnabled(id, !fullyEnabled)
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
      if (!enabledDirectorySet.has(directoryId)) {
        // The parent directory is disabled: checking any subdirectory enables
        // the directory and shows only that subdirectory's contents (every
        // other top-level subdirectory and any sibling under the checked
        // node's top-level ancestor is closed). Direct files of the ancestor
        // cannot be hidden by a path prefix, so they remain visible.
        const enabled = new Set(enabledDirectorySet)
        enabled.add(directoryId)
        const layout = subdirsByDirectory[directoryId]
        const topNodes = layout?.subdirectories || []
        if (topNodes.length > 0) {
          let topAncestor = nodePath
          while (topAncestor.includes('/')) {
            topAncestor = topAncestor.slice(0, topAncestor.lastIndexOf('/'))
          }
          const nextClosed = new Set()
          for (const top of topNodes) {
            if (top.path !== topAncestor) {
              nextClosed.add(top.path)
            }
          }
          const collectNodePaths = (node, out) => {
            out.push(node.path)
            for (const child of node.subdirectories || []) {
              collectNodePaths(child, out)
            }
            return out
          }
          const topNode = topNodes.find((top) => top.path === topAncestor)
          for (const path of collectNodePaths(topNode, [])) {
            if (
              path !== nodePath &&
              path !== topAncestor &&
              !path.startsWith(nodePath + '/') &&
              !nodePath.startsWith(path + '/')
            ) {
              nextClosed.add(path)
            }
          }
          closed.clear()
          for (const path of nextClosed) {
            closed.add(path)
          }
        } else {
          closed.clear()
        }
        onEnabledDirectoryIdsChange?.(Array.from(enabled))
        onClosedSubdirectoriesChange?.(directoryId, Array.from(closed))
        return
      }
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
  const renderDirectoryBranch = (directoryId, node, parentEnabled, ancestorsClosed, closedList) => {
    const nodePath = node.path
    const nodeClosed = nodeIsClosed(closedList, nodePath)
    const children = node.subdirectories || []
    const expanded = expandedDirectoryIds.has(`${directoryId}:${nodePath}`)
    // A node hidden by a closed ancestor cannot be re-enabled on its own, but a
    // node that is itself closed stays clickable so checking it restores its
    // subtree. When the parent directory is disabled, subdirectories render as
    // unchecked but stay clickable so checking one enables only its contents.
    const disabled = ancestorsClosed
    const { checked, indeterminate } = parentEnabled
      ? nodeDisplayState(node, closedList)
      : { checked: false, indeterminate: false }

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
                className={expanded ? 'rotate-90 transition-transform' : 'transition-transform'}
              />
            </button>
          ) : null}
        </div>
        {expanded && children.length > 0 ? (
          <div className="border-l border-gray-100 pb-1 pl-4">
            {children.map((child) =>
              renderDirectoryBranch(
                directoryId,
                child,
                parentEnabled,
                ancestorsClosed || nodeClosed,
                closedList
              )
            )}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <header ref={headerRef} className="filter-topbar">
      <div className="filter-topbar__body">
        <button
          type="button"
          onClick={onHome}
          className="filter-topbar__brand"
          aria-label={zh('返回当前页面首页', 'Return to current section home')}
        >
          JavBoss
        </button>
        <div className="filter-topbar__controls">
          <form onSubmit={onSubmitSearch} className="filter-search">
            <input
              value={activeSearchInput}
              onChange={(event) => onSearchInputChange?.(event.target.value)}
              placeholder={placeholder}
              aria-label={placeholder}
            />
            <Button
              component="a"
              href={activeSearchHref}
              type="submit"
              variant="contained"
              size="small"
              onClick={(event) => {
                if (isModifiedClick(event)) return
                event.preventDefault()
                onSubmitSearch?.(event)
              }}
              sx={{ minWidth: 34, width: 34, height: 30, p: 0, borderRadius: '8px' }}
              aria-label={zh('应用搜索', 'Apply search')}
            >
              <SearchIcon sx={{ fontSize: 17 }} />
            </Button>
          </form>

          {isJavMode && javTab === 'list' ? (
            <FavoriteRatingFilter
              enabled={favoriteRatingEnabled}
              min={favoriteRatingMin}
              max={favoriteRatingMax}
              onEnabledChange={onFavoriteRatingEnabledChange}
              onRangeChange={onFavoriteRatingRangeChange}
            />
          ) : null}

          {isJavMode && javTab === 'idol' ? (
            <IdolProfileFilters
              filters={idolProfileFilters}
              onChange={onIdolProfileFilterChange}
              showClear={hasActiveControlFilter}
              onClear={onClearFilters}
            />
          ) : null}

          {onRandomClick ? (
            <button type="button" className="filter-action-button" onClick={onRandomClick}>
              <ShuffleOutlinedIcon fontSize="small" />
              <span>{zh('随机', 'Random')}</span>
            </button>
          ) : null}

          {showFilterCluster ? (
            <div className="filter-topbar__filter-cluster">
              {filterItems.length > 0 ? (
                <div
                  className="filter-topbar__conditions"
                  aria-label={zh('当前筛选条件', 'Active filters')}
                >
                  {filterItems.map((item) => (
                    <FilterChip key={item.key} label={item.label} onRemove={item.onRemove} />
                  ))}
                </div>
              ) : null}

              {onOpenFilterEditor ? (
                <button
                  type="button"
                  className="filter-clear-button"
                  onClick={onOpenFilterEditor}
                  title={zh('编辑筛选条件', 'Edit filters')}
                  aria-label={zh('编辑筛选条件', 'Edit filters')}
                >
                  {zh('编辑', 'Edit')}
                </button>
              ) : null}

              {hasActiveControlFilter || filterItems.length > 0 ? (
                <button type="button" className="filter-clear-button" onClick={onClearFilters}>
                  {zh('清空', 'Clear')}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="filter-topbar__actions">
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

            {focusedSubpath ? (
              <span
                className="filter-location-path"
                title={zh(`当前目录：${focusedSubpath}`, `Current directory: ${focusedSubpath}`)}
              >
                <FolderRoundedIcon fontSize="small" className="shrink-0 text-gray-400" />
                <span className="min-w-0 truncate">{focusedSubpath}</span>
              </span>
            ) : null}

            <div ref={directoryMenuRef} className="relative">
              <button
                type="button"
                className={`filter-action-button ${directoryMenuOpen ? 'filter-action-button--active' : ''}`}
                onClick={() => setDirectoryMenuOpen((open) => !open)}
                aria-label={zh('选择启用目录', 'Choose enabled directories')}
                aria-haspopup="menu"
                aria-expanded={directoryMenuOpen}
              >
                <FolderOpenOutlinedIcon fontSize="small" />
                <span>{directorySummary}</span>
                <KeyboardArrowDownRoundedIcon
                  fontSize="small"
                  className={
                    directoryMenuOpen ? 'rotate-180 transition-transform' : 'transition-transform'
                  }
                />
              </button>
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
                      <div className="truncate text-xs text-gray-500">
                        {directorySummary}
                        {focusedSubpath ? ` · ${focusedSubpath}` : ''}
                      </div>
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
                        // A directory is partially enabled (special mark) when it
                        // is enabled but any subdirectory at any level is hidden.
                        const partiallyEnabled = checked && closedArray.length > 0
                        return (
                          <div key={directory.id}>
                            <div className="flex items-start gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                                <TriStateCheckbox
                                  checked={checked}
                                  indeterminate={partiallyEnabled}
                                  onChange={() => toggleDirectoryEnabled(id)}
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
                                      {zh(`部分子目录已隐藏`, 'Some subdirectories hidden')}
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
                                      renderDirectoryBranch(id, subdir, checked, false, closedArray)
                                    )}
                                    {hasRootFiles ? (
                                      <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500">
                                        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                          <FolderRoundedIcon
                                            fontSize="small"
                                            className="text-gray-400"
                                          />
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
            {isJavMode ? (
              <div ref={favoriteMenuRef} className="relative">
                <button
                  type="button"
                  className={`filter-action-button ${selectedFavoriteGroup ? 'filter-action-button--active' : ''}`}
                  onClick={() => {
                    setFavoriteMenuOpen((open) => !open)
                    if (!favoriteMenuOpen) onOpenFavoriteGroups?.()
                  }}
                  aria-label={favoriteLabel}
                  aria-haspopup="dialog"
                  aria-expanded={favoriteMenuOpen}
                >
                  <BookmarksOutlinedIcon fontSize="small" />
                  <span className="max-w-28 truncate">
                    {selectedFavoriteGroup?.name || zh('收藏夹', 'Favorites')}
                  </span>
                </button>
                {favoriteMenuOpen ? (
                  <FavoriteGroupMenu
                    title={favoriteLabel}
                    allLabel={favoriteAllLabel}
                    groups={favoriteGroups}
                    selectedGroupId={selectedFavoriteGroupId}
                    loading={favoriteGroupsLoading}
                    error={favoriteGroupsError}
                    buildGroupUrl={buildFavoriteGroupUrl}
                    onSelect={(groupId) => {
                      onFavoriteGroupSelect?.(groupId)
                      setFavoriteMenuOpen(false)
                    }}
                    onOpenManager={(group) => onOpenFavoriteManager?.(group)}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}

function FavoriteGroupMenu({
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
      className="absolute top-full z-50 mt-2.5 flex max-h-[70vh] w-[34rem] max-w-[calc(100vw-2rem)] flex-col overflow-visible rounded border border-gray-200 bg-white text-left shadow-xl"
      style={{ right: `${-FAVORITE_MENU_RIGHT_SHIFT}px` }}
    >
      <span
        className="absolute top-0 h-0 w-0 -translate-y-full border-x-[10px] border-b-[10px] border-x-transparent border-b-gray-200"
        style={{ right: `${16 + FAVORITE_MENU_RIGHT_SHIFT}px` }}
        aria-hidden="true"
      />
      <span
        className="absolute top-px h-0 w-0 -translate-y-full border-x-[9px] border-b-[9px] border-x-transparent border-b-gray-50"
        style={{ right: `${17 + FAVORITE_MENU_RIGHT_SHIFT}px` }}
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
        <IconButton
          type="button"
          size="small"
          onClick={() => onOpenManager?.()}
          title={zh('管理收藏夹', 'Manage favorites')}
          aria-label={zh('管理收藏夹', 'Manage favorites')}
          sx={{ width: 30, height: 30 }}
        >
          <SettingsOutlinedIcon sx={{ fontSize: 18 }} />
        </IconButton>
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
          if (isModifiedClick(event)) return
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
