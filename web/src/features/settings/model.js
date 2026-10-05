import { configFlag } from '@/utils/config'
import {
  CARD_WIDTH_DEFAULTS,
  allCardLayoutsFromConfig,
  normalizeCardWidth,
} from '@/utils/cardLayout'
import { normalizeJavTitleLanguage } from '@/utils/jav'
import { videoQuery } from '@/query/listQueries'

export const JAV_IDOL_REFRESH_DAYS_DEFAULT = 7
export const JAV_IDOL_REFRESH_DAYS_MAX = 365

export function normalizeJavIdolRefreshDays(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed < 1) return JAV_IDOL_REFRESH_DAYS_DEFAULT
  return Math.min(JAV_IDOL_REFRESH_DAYS_MAX, parsed)
}

// Mirrors the pre-merge App.jsx "current directory" hint: only shown when the list
// scope is narrowed down to exactly one directory.
export function currentDirectoryPathFromState(state) {
  const { directories, directorySubpaths } = state || {}
  const scopedIds = String(videoQuery(state || {}).directoryIds || '')
    .split(',')
    .map((value) => Number.parseInt(value, 10))
    .filter((id) => Number.isFinite(id) && id > 0)
  if (scopedIds.length !== 1) return ''
  const [directoryId] = scopedIds
  const directory = (directories || []).find((item) => Number(item?.id) === directoryId)
  const rootPath = String(directory?.path || '').trim()
  if (!rootPath) return ''
  const subpath = (directorySubpaths || []).find(
    (item) => Number(item?.directoryId) === directoryId
  )
  const relative = String(subpath?.path || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
  return relative ? `${rootPath.replace(/\/+$/, '')}/${relative}` : rootPath
}

export function createVideoSettingsDraft(state) {
  const { pageSize, sortOrder, videoHideJav, config } = state
  return {
    videoPageSizeInput: pageSize,
    videoSortInput: sortOrder,
    videoHideJavInput: videoHideJav,
    videoWaterfallDefaultInput: configFlag(config?.video_waterfall_default),
    videoCardWidthInput: normalizeCardWidth(
      config?.video_card_min_width,
      CARD_WIDTH_DEFAULTS.video.landscape
    ),
    videoDirectoryPath: currentDirectoryPathFromState(state),
  }
}

export function createJavSettingsDraft(state) {
  const {
    javPageSize,
    javGridColumns,
    javTitleMaxRows,
    javIdolTagMaxRows,
    javTagMaxRows,
    config,
    idolPageSize,
    studioPageSize,
    seriesPageSize,
    javSort,
    javSortRules,
    idolSort,
  } = state
  return {
    javPageSizeInput: javPageSize,
    javGridColumnsInput: javGridColumns,
    javTitleMaxRowsInput: javTitleMaxRows,
    javIdolTagMaxRowsInput: javIdolTagMaxRows,
    javTagMaxRowsInput: javTagMaxRows,
    javHideSeriesInput: configFlag(config?.jav_hide_series),
    javHideIdolsInput: configFlag(config?.jav_hide_idols),
    javHideTagsInput: configFlag(config?.jav_hide_tags),
    javHideActionsInput: configFlag(config?.jav_hide_actions),
    javHideTitleInput: configFlag(config?.jav_hide_title),
    javHideMetaInput: configFlag(config?.jav_hide_meta),
    javFavoriteRatingShowFullInput: configFlag(config?.jav_favorite_rating_show_full, false),
    cardLayoutInput: allCardLayoutsFromConfig(config),
    javWaterfallDefaultInput: configFlag(config?.jav_waterfall_default),
    idolPageSizeInput: idolPageSize,
    idolWaterfallDefaultInput: configFlag(config?.idol_waterfall_default),
    studioPageSizeInput: studioPageSize,
    studioWaterfallDefaultInput: configFlag(config?.studio_waterfall_default),
    seriesPageSizeInput: seriesPageSize,
    seriesWaterfallDefaultInput: configFlag(config?.series_waterfall_default),
    javSortInput: javSort,
    javSortRulesInput: javSortRules,
    idolSortInput: idolSort,
    javIdolPreferChineseNameInput: configFlag(config?.jav_idol_prefer_chinese_name),
    javTagShowSimplifiedInput: configFlag(config?.jav_tag_show_simplified),
    javTitleLanguageInput: normalizeJavTitleLanguage(config?.jav_title_language),
    javIdolRefreshDaysInput: normalizeJavIdolRefreshDays(config?.jav_idol_refresh_days),
  }
}
