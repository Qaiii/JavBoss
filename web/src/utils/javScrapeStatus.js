export const JAV_SCRAPE_SOURCE_META = {
  javbus: { name: ['JavBus', 'JavBus'] },
  javdatabase: { name: ['JavDatabase', 'JavDatabase'] },
  javdb: { name: ['JavDB', 'JavDB'] },
  avmoo: { name: ['Avmoo', 'Avmoo'] },
  avsox: { name: ['AVSOX', 'AVSOX'] },
  javmenu: { name: ['JavMenu', 'JavMenu'] },
  missav: { name: ['MissAV', 'MissAV'] },
  minnanoav: { name: ['みんなのAV', 'Minnano AV'] },
  javmodel: { name: ['JavModel', 'JavModel'] },
  avdanyuwiki: { name: ['AV男优百科', 'AV Danyu Wiki'] },
  theporndb: { name: ['ThePornDB', 'ThePornDB'] },
  javsubtitle: { name: ['JavSubtitle', 'JavSubtitle'] },
}

export const JAV_SCRAPE_DATA_LABELS = {
  title: ['标题', 'Title'],
  title_zh: ['中文标题', 'Chinese title'],
  code: ['番号', 'Code'],
  studio: ['发行商', 'Studio'],
  series: ['系列', 'Series'],
  release: ['发行日期', 'Release date'],
  duration: ['时长', 'Duration'],
  tags: ['标签', 'Tags'],
  actors: ['女优', 'Actresses'],
  male_actors: ['男优', 'Male actors'],
  cover: ['封面', 'Cover'],
  samples: ['剧照', 'Samples'],
  uncensored: ['有码/无码', 'Censored state'],
  genres: ['类型分类', 'Genre categories'],
  actress_profile: ['女优资料', 'Actress profile'],
  idol_works: ['作品列表', 'Works list'],
  subtitles: ['字幕', 'Subtitles'],
}

export const JAV_SCRAPE_QUEUE_META = {
  covers: { name: ['封面下载', 'Cover downloads'] },
  metadata_repair: { name: ['缺失元数据补抓', 'Missing metadata repair'] },
  idol_works: { name: ['女优作品列表', 'Idol works lists'] },
  idol_work_metadata: { name: ['未入库作品元数据', 'Unimported work metadata'] },
}

export function javScrapeSourceName(source) {
  const id = String(source?.id || '')
  return JAV_SCRAPE_SOURCE_META[id]?.name || [id, id]
}

export function javScrapeDataLabels(keys) {
  const list = Array.isArray(keys) ? keys : []
  return list
    .map((key) => {
      const id = String(key || '')
      const label = JAV_SCRAPE_DATA_LABELS[id]
      return label ? { key: id, label } : null
    })
    .filter(Boolean)
}

export function javScrapeQueues(status) {
  const queues = Array.isArray(status?.queues) ? status.queues : []
  return queues.map((queue) => {
    const id = String(queue?.id || '')
    const meta = JAV_SCRAPE_QUEUE_META[id]
    return {
      id,
      pending: Math.max(0, Number(queue?.pending) || 0),
      name: meta?.name || [id, id],
    }
  })
}

export function javScrapePendingTotal(status) {
  return javScrapeQueues(status).reduce((sum, queue) => sum + queue.pending, 0)
}

export function formatScrapeIntervalMs(ms) {
  const n = Math.max(0, Number(ms) || 0)
  if (n >= 60_000 && n % 60_000 === 0) {
    return { value: n / 60_000, unit: 'minute' }
  }
  if (n >= 1000 && n % 1000 === 0) {
    return { value: n / 1000, unit: 'second' }
  }
  return { value: n, unit: 'ms' }
}
