import { useCallback, useEffect, useRef, useState } from 'react'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DisplaySettingsOutlinedIcon from '@mui/icons-material/DisplaySettingsOutlined'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import NumbersRoundedIcon from '@mui/icons-material/NumbersRounded'
import SearchIcon from '@mui/icons-material/Search'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import SwapVertRoundedIcon from '@mui/icons-material/SwapVertRounded'
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import VideoLibraryOutlinedIcon from '@mui/icons-material/VideoLibraryOutlined'
import { Button } from '@mui/material'
import { fetchJavPrefixes } from '@/features/jav/api'
import JavPrefixModal from '@/features/jav/components/JavPrefixModal'
import { getErrorMessage } from '@/utils/errors'
import { zh } from '@/utils/i18n'

const NAV_TABS = [
  { id: 'video', label: zh('视频', 'Video') },
  { id: 'list', label: 'JAV' },
  { id: 'idol', label: zh('女优', 'Idols') },
  { id: 'studio', label: zh('片商', 'Studios') },
  { id: 'series', label: zh('系列', 'Series') },
]

// Grace period that lets the pointer travel from the "更多" trigger into its menu.
const MORE_MENU_CLOSE_DELAY = 140

function isModifiedClick(event) {
  return Boolean(
    event &&
      (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
  )
}

function MenuItem({ nav, icon: Icon, label, note = '', badge = 0, active = false, onClick }) {
  return (
    <button
      type="button"
      role="menuitem"
      data-nav={nav}
      className={`app-topnav__menu-item ${active ? 'is-active' : ''}`}
      onClick={onClick}
    >
      <Icon className="shrink-0" fontSize="small" />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {note ? <span className="app-topnav__menu-note">{note}</span> : null}
      {badge > 0 ? <span className="app-topnav__menu-badge">{badge}</span> : null}
    </button>
  )
}

/**
 * Persistent top navigation bar: brand on the left, section links on the right.
 * The search icon collapses the links and reveals a centered search field, and
 * "更多" is a hover dropdown holding 番号 / 显示 / 下载 / 设置 and the works-list
 * controls 入库 / 排序 / 筛选, each expanding its own anchored panel.
 */
export default function TopNav({
  activeTab,
  isJavMode,
  javPrefix = '',
  buildJavPrefixUrl,
  displaySettingsOpen = false,
  downloadOpen = false,
  globalSettingsOpen = false,
  tagManagerOpen = false,
  filterActive = false,
  selectionCount = 0,
  javSearchHref,
  javSearchInput,
  javTab,
  onHome,
  onJavPrefixClick,
  onOpenDownload,
  onOpenGlobalSettings,
  onOpenJavSettings,
  onOpenJavTagModal,
  onOpenTagModal,
  onOpenVideoSettings,
  onSearchInputChange,
  onSelectTab,
  onSubmitSearch,
  renderFilterPanel,
  renderLibraryScopePanel,
  renderSortPanel,
  searchHref,
  searchInput,
  showDirectorySetupHint = false,
}) {
  const headerRef = useRef(null)
  const moreCloseTimerRef = useRef(null)
  const moreHoverRef = useRef(false)
  const searchInputRef = useRef(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  // One anchored panel at a time: '' | 'filters' | 'library-scope' | 'sort'.
  const [panel, setPanel] = useState('')
  const filterOpen = panel === 'filters'
  const [prefixModalOpen, setPrefixModalOpen] = useState(false)
  const [prefixItems, setPrefixItems] = useState([])
  const [prefixLoading, setPrefixLoading] = useState(false)
  const [prefixError, setPrefixError] = useState('')

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
    // Focus is moved programmatically instead of via autoFocus so the collapsed
    // bar never steals focus on page load.
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    if (!prefixModalOpen) return undefined
    let cancelled = false
    setPrefixLoading(true)
    setPrefixError('')
    fetchJavPrefixes()
      .then((items) => {
        if (!cancelled) setPrefixItems(Array.isArray(items) ? items : [])
      })
      .catch((error) => {
        if (!cancelled) setPrefixError(getErrorMessage(error))
      })
      .finally(() => {
        if (!cancelled) setPrefixLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [prefixModalOpen])

  const cancelMoreClose = useCallback(() => {
    if (moreCloseTimerRef.current !== null) {
      window.clearTimeout(moreCloseTimerRef.current)
      moreCloseTimerRef.current = null
    }
  }, [])

  const openMore = useCallback(() => {
    cancelMoreClose()
    setMoreOpen(true)
  }, [cancelMoreClose])

  const scheduleMoreClose = useCallback(() => {
    cancelMoreClose()
    moreCloseTimerRef.current = window.setTimeout(() => {
      moreCloseTimerRef.current = null
      if (moreHoverRef.current) return
      setMoreOpen(false)
    }, MORE_MENU_CLOSE_DELAY)
  }, [cancelMoreClose])

  useEffect(() => () => cancelMoreClose(), [cancelMoreClose])

  useEffect(() => {
    if (!moreOpen && !panel && !searchOpen) return undefined
    const handlePointerDown = (event) => {
      if (headerRef.current?.contains(event.target)) return
      // Poppers and modals live in portals outside the header; interacting with
      // them (for example dragging a filter slider) must not dismiss the bar.
      if (event.target?.closest?.('.MuiPopper-root, .MuiModal-root, .MuiPopover-root')) return
      setMoreOpen(false)
      setPanel('')
      setSearchOpen(false)
    }
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      setMoreOpen(false)
      setPanel('')
      setSearchOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [moreOpen, panel, searchOpen])

  const activeSearchInput = isJavMode ? javSearchInput : searchInput
  const activeSearchHref = isJavMode ? javSearchHref : searchHref
  const placeholder = isJavMode
    ? javTab === 'idol'
      ? zh('搜索女优名称', 'Search idol name')
      : javTab === 'studio'
        ? zh('搜索片商名称', 'Search studio name')
        : javTab === 'series'
          ? zh('搜索系列名称', 'Search series name')
          : zh('搜索番号或标题', 'Search code or title')
    : zh('搜索文件名', 'Search filename')

  const runMoreAction = (action) => {
    setMoreOpen(false)
    action?.()
  }

  const submitSearch = (event) => {
    event.preventDefault()
    onSubmitSearch?.(event)
    setSearchOpen(false)
  }

  const openSearch = () => {
    setPanel('')
    setSearchOpen(true)
  }

  const togglePanel = (name) => {
    setPanel((current) => (current === name ? '' : name))
  }

  const toggleMore = () => {
    const next = !moreOpen
    setMoreOpen(next)
    // The menu and the panels share the same anchor, so only one is shown.
    if (next) setPanel('')
  }

  const selectTab = (tab) => {
    setPanel('')
    onSelectTab?.(tab)
  }

  const openTagManager = () => {
    setPanel('')
    if (isJavMode) {
      onOpenJavTagModal?.()
    } else {
      onOpenTagModal?.()
    }
  }

  const closeSearch = () => {
    setSearchOpen(false)
  }

  const moreHighlighted =
    displaySettingsOpen || downloadOpen || globalSettingsOpen || prefixModalOpen || Boolean(panel)

  // 入库 / 排序 belong to the JAV works list, whose controls now live in "更多".
  const showWorksListControls = Boolean(isJavMode) && (javTab || 'list') === 'list'

  return (
    <header
      ref={headerRef}
      className={`app-topnav ${moreOpen || panel || searchOpen ? 'app-topnav--layer-open' : ''}`}
    >
      <div className="app-topnav__bar">
        <button
          type="button"
          onClick={onHome}
          className="app-topnav__brand"
          aria-label={zh('返回当前页面首页', 'Return to current section home')}
        >
          JavBoss
        </button>

        {searchOpen ? (
          <div className="app-topnav__search">
            <form className="app-topnav__search-form" onSubmit={submitSearch} role="search">
              <SearchIcon className="app-topnav__search-icon" fontSize="small" aria-hidden="true" />
              <input
                ref={searchInputRef}
                value={activeSearchInput ?? ''}
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
                  if (isModifiedClick(event)) {
                    closeSearch()
                    return
                  }
                  event.preventDefault()
                  onSubmitSearch?.(event)
                  closeSearch()
                }}
                sx={{ minWidth: 32, width: 32, height: 30, p: 0, borderRadius: '999px' }}
                aria-label={zh('应用搜索', 'Apply search')}
              >
                <SearchIcon sx={{ fontSize: 17 }} />
              </Button>
            </form>
            <button
              type="button"
              className="app-topnav__search-close"
              onClick={closeSearch}
              aria-label={zh('关闭搜索', 'Close search')}
            >
              <CloseRoundedIcon fontSize="small" />
            </button>
          </div>
        ) : (
          <nav className="app-topnav__links" aria-label={zh('主导航', 'Primary navigation')}>
            <button
              type="button"
              data-nav="search"
              className="app-topnav__item app-topnav__item--icon"
              onClick={openSearch}
              aria-label={zh('搜索', 'Search')}
              title={zh('搜索', 'Search')}
            >
              <SearchIcon fontSize="small" />
            </button>
            {NAV_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-nav={tab.id}
                className={`app-topnav__item ${activeTab === tab.id ? 'is-active' : ''}`}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                onClick={() => selectTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
            <button
              type="button"
              data-nav="tags"
              className={`app-topnav__item ${tagManagerOpen ? 'is-active' : ''}`}
              aria-current={tagManagerOpen ? 'page' : undefined}
              onClick={openTagManager}
            >
              {zh('标签', 'Tags')}
            </button>
            <div
              className="app-topnav__more"
              onMouseEnter={() => {
                moreHoverRef.current = true
                openMore()
              }}
              onMouseLeave={() => {
                moreHoverRef.current = false
                scheduleMoreClose()
              }}
              onFocusCapture={openMore}
              onBlurCapture={(event) => {
                if (event.currentTarget.contains(event.relatedTarget)) return
                scheduleMoreClose()
              }}
            >
              <button
                type="button"
                data-nav="more"
                className={`app-topnav__item app-topnav__more-trigger ${
                  moreOpen || moreHighlighted ? 'is-active' : ''
                }`}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                aria-label={zh('更多', 'More')}
                onClick={toggleMore}
              >
                {zh('更多', 'More')}
                <KeyboardArrowDownRoundedIcon fontSize="small" />
                {filterActive || selectionCount > 0 ? (
                  <span className="app-topnav__dot" aria-hidden="true" />
                ) : null}
              </button>
              {moreOpen ? (
                <div
                  data-nav="menu"
                  className="app-topnav__menu"
                  role="menu"
                  aria-label={zh('更多', 'More')}
                >
                  <MenuItem
                    nav="codes"
                    icon={NumbersRoundedIcon}
                    label={zh('番号', 'JAV codes')}
                    onClick={() => runMoreAction(() => setPrefixModalOpen(true))}
                  />
                  <MenuItem
                    nav="display"
                    icon={DisplaySettingsOutlinedIcon}
                    label={zh('显示', 'Display')}
                    active={displaySettingsOpen}
                    onClick={() =>
                      runMoreAction(isJavMode ? onOpenJavSettings : onOpenVideoSettings)
                    }
                  />
                  <MenuItem
                    nav="download"
                    icon={DownloadOutlinedIcon}
                    label={zh('下载', 'Downloads')}
                    active={downloadOpen}
                    onClick={() => runMoreAction(onOpenDownload)}
                  />
                  <MenuItem
                    nav="settings"
                    icon={SettingsOutlinedIcon}
                    label={zh('设置', 'Settings')}
                    active={globalSettingsOpen}
                    onClick={() => runMoreAction(onOpenGlobalSettings)}
                  />
                  <span className="app-topnav__menu-separator" aria-hidden="true" />
                  {showWorksListControls ? (
                    <>
                      <MenuItem
                        nav="library-scope"
                        icon={VideoLibraryOutlinedIcon}
                        label={zh('入库', 'Library scope')}
                        active={panel === 'library-scope'}
                        onClick={() => runMoreAction(() => togglePanel('library-scope'))}
                      />
                      <MenuItem
                        nav="sort"
                        icon={SwapVertRoundedIcon}
                        label={zh('排序', 'Sort')}
                        active={panel === 'sort'}
                        onClick={() => runMoreAction(() => togglePanel('sort'))}
                      />
                    </>
                  ) : null}
                  <MenuItem
                    nav="filters"
                    icon={TuneRoundedIcon}
                    label={zh('筛选', 'Filters')}
                    active={filterOpen}
                    note={filterActive ? zh('已启用', 'Active') : ''}
                    badge={selectionCount}
                    onClick={() => runMoreAction(() => togglePanel('filters'))}
                  />
                </div>
              ) : null}
              {showDirectorySetupHint && !moreOpen ? (
                <div
                  className="directory-setup-hint app-topnav__directory-setup-hint"
                  role="status"
                >
                  <span className="app-topnav__directory-setup-arrow" aria-hidden="true">
                    <ArrowBackRoundedIcon
                      className="directory-setup-hint__arrow shrink-0"
                      fontSize="small"
                    />
                  </span>
                  <span>
                    {zh(
                      '您还没有添加目录，点击 “更多 → 设置” 在 “目录管理” 内添加。',
                      'No directories yet. Click “More → Settings” to add one in Directory Management'
                    )}
                  </span>
                </div>
              ) : null}
            </div>
          </nav>
        )}
      </div>
      {panel ? (
        <div
          className={`app-topnav__panel ${panel === 'filters' ? '' : 'app-topnav__panel--compact'}`}
        >
          {panel === 'filters' ? renderFilterPanel?.({ onClose: () => setPanel('') }) : null}
          {panel === 'library-scope'
            ? renderLibraryScopePanel?.({ onClose: () => setPanel('') })
            : null}
          {panel === 'sort' ? renderSortPanel?.({ onClose: () => setPanel('') }) : null}
        </div>
      ) : null}
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
