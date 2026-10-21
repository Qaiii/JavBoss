const STUDIO_LOGOS = [
  { file: 'attackers.png', plate: 'plain', keys: ['attackers', 'アタッカーズ'] },
  { file: 'befree.png', plate: 'plain', keys: ['befree'] },
  { file: 'bibian.png', plate: 'plain', keys: ['bibian', 'vivian', 'ビビアン'] },
  { file: 'das.png', plate: 'plain', keys: ['das', 'dasdas', 'ダスッ'] },
  { file: 'ebody.png', plate: 'plain', keys: ['ebody'] },
  { file: 'fitch.png', plate: 'plain', keys: ['fitch', 'フィッチ'] },
  { file: 'heyzo.png', plate: 'dark', keys: ['heyzo'] },
  { file: 'honnaka.png', plate: 'plain', keys: ['honnaka', '本中'] },
  {
    file: 'ideapocket.png',
    plate: 'plain',
    keys: ['ideapocket', 'アイデアポケット', 'アイディアポケット'],
  },
  { file: 'kawaii.png', plate: 'plain', keys: ['kawaii'] },
  { file: 'kirakira.png', plate: 'plain', keys: ['kirakira', 'kira☆kira'] },
  { file: 'madonna.png', plate: 'plain', keys: ['madonna', 'マドンナ'] },
  { file: 'moodyz.png', plate: 'plain', keys: ['moodyz'] },
  { file: 'mousouzoku.png', plate: 'plain', keys: ['mousouzoku', '妄想族'] },
  { file: 'muku.png', plate: 'plain', keys: ['muku', '無垢'] },
  { file: 'muteki.png', plate: 'plain', keys: ['muteki'] },
  { file: 'nanpa.png', plate: 'plain', keys: ['nanpajapan', 'ナンパjapan', 'ナンパジャパン'] },
  { file: 'opera.png', plate: 'plain', keys: ['opera'] },
  { file: 'oppai.png', plate: 'plain', keys: ['oppai', 'おっぱい'] },
  { file: 'premium.png', plate: 'plain', keys: ['premium', 'プレミアム'] },
  { file: 'rookie.png', plate: 'plain', keys: ['rookie'] },
  { file: 's1.png', plate: 'plain', keys: ['s1', 's1no1style', 'エスワン'] },
  {
    file: 'sod.png',
    plate: 'light',
    keys: ['sod', 'sodcreate', 'sodクリエイト', 'softondemand', 'ソフトオンデマンド'],
  },
  { file: 'tameikegoro.png', plate: 'plain', keys: ['tameikegoro', '溜池ゴロー'] },
  { file: 'wanz.png', plate: 'plain', keys: ['wanz', 'wanzfactory', 'ワンズファクトリー'] },
]

const STUDIO_LOGO_BY_KEY = new Map(
  STUDIO_LOGOS.flatMap((logo) => logo.keys.map((key) => [normalizeStudioLogoKey(key), logo]))
)

export function normalizeStudioLogoKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[*＊☆★・･.。、,，_+\-—'’"“”()（）/／!?！？\s]/g, '')
}

export function studioLogoFor(names) {
  const values = Array.isArray(names) ? names : [names]
  for (const value of values) {
    const logo = STUDIO_LOGO_BY_KEY.get(normalizeStudioLogoKey(value))
    if (!logo) continue
    return { src: `/studio-logos/${logo.file}`, plate: logo.plate }
  }
  return null
}
