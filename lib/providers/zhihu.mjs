/**
 * lib/providers/zhihu.mjs —— 知乎（只读）
 *
 * 现状（2026-10-29 本机实测，结论写在 README 里）：
 *   主站 www.zhihu.com 的网页和搜索，裸 fetch 一律 403，回的是一个
 *   `zh-zse-ck` 挑战页 —— 要靠浏览器执行 JS 算出 cookie 才放行。
 *   所以这一版不硬刚主站，先走两条公开、不用登录的路：
 *
 *   ① 知乎日报 news-at.zhihu.com/api/4 —— 公开 JSON，无签名，
 *      给的是当天几条问题 + 正文 HTML，够「读」；
 *   ② 自建 RSSHub（配置里填 rsshubBase 才启用），走 RSS 拿列表。
 *
 * 留了 probeZhihu()，用来在挂上登录 cookie / 以后加浏览器兜底时，
 * 一眼看出主站现在到底是通还是又被拦了。
 */
import { getJson, getText } from '../http.mjs'
import { htmlToText, excerpt } from '../text.mjs'

export const site = 'zhihu'
export const meta = {
  name: '知乎',
  readOnly: true,
  strategies: ['daily', 'rsshub', 'html'],
}

const DAILY = 'https://news-at.zhihu.com/api/4/news'

function dailyItem(s) {
  return {
    site,
    id: String(s.id),
    title: s.title || '',
    /** 日报自己的阅读页，稳定、不用登录 */
    url: `https://daily.zhihu.com/story/${s.id}`,
    /** 对应的问题页（主站现在抓不动，留着重试时用） */
    questionUrl: s.url || '',
    excerpt: excerpt(htmlToText(s.hint || ''), 100),
    seen: false,
  }
}

/** 今日知乎日报（公开接口，不需要登录） */
export async function hot(cfg, { limit = 10 } = {}) {
  const r = await getJson(`${DAILY}/latest`, {
    timeoutMs: cfg.timeoutMs, minGapMs: cfg.minGapMs, cookie: cfg.zhihu?.cookie || '',
  })
  if (!r.ok) return { ok: false, site, strategy: 'daily', error: r.error || `HTTP ${r.status}` }
  const list = [...(r.json.top_stories || []), ...(r.json.stories || [])]
  const seenIds = new Set()
  const items = []
  for (const s of list) {
    if (!s?.id || seenIds.has(String(s.id))) continue
    seenIds.add(String(s.id))
    items.push(dailyItem(s))
    if (items.length >= Math.max(1, Math.min(Number(limit) || 10, 30))) break
  }
  return { ok: true, site, strategy: 'daily', date: r.json.date, items }
}

/** 一篇日报的正文 */
export async function story(cfg, id) {
  const key = String(id || '').trim()
  if (!/^\d+$/.test(key)) return { ok: false, site, error: 'id 应该是日报里的数字 id' }
  const r = await getJson(`${DAILY}/${key}`, {
    timeoutMs: cfg.timeoutMs, minGapMs: cfg.minGapMs, cookie: cfg.zhihu?.cookie || '',
  })
  if (!r.ok) return { ok: false, site, error: r.error || `HTTP ${r.status}` }
  const text = htmlToText(r.json.body || '')
  return {
    ok: true,
    site,
    strategy: 'daily',
    id: key,
    title: r.json.title || '',
    url: r.json.share_url || `https://daily.zhihu.com/story/${key}`,
    chars: text.length,
    text,
  }
}

/**
 * 主站还通不通？—— 只用来回答「现在能不能读知乎网页」，
 * 拿的是 challenge 页里的特征串，不做任何绕过。
 */
export async function probe(cfg) {
  const url = 'https://www.zhihu.com/hot'
  const r = await getText(url, {
    timeoutMs: cfg.timeoutMs, minGapMs: cfg.minGapMs, retries: 0,
    extraHeaders: { accept: 'text/html,application/xhtml+xml' },
    cookie: cfg.zhihu?.cookie || '',
  })
  if (!r.ok && !r.text) return { ok: false, site, reachable: false, error: r.error || `HTTP ${r.status}` }
  const blocked = /zh-zse-ck|zse_ck/.test(r.text || '')
  return {
    ok: true,
    site,
    status: r.status,
    reachable: r.status === 200 && !blocked,
    blocked,
    verdict: blocked
      ? '被 zse 挑战页拦着：主站网页这条路要浏览器执行 JS 才通，纯 fetch 不行'
      : (r.status === 200 ? '主站通' : `状态 ${r.status}`),
  }
}

/** 预留：自建 RSSHub 的知乎路由（填了 rsshubBase 才有意义） */
export const HUB_MIRRORS = [
  'https://rsshub.ktachibana.party',
  'https://rsshub.rssforever.com',
]

function parseRssItems(xml) {
  const out = []
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const chunk = m[1]
    const pick = (tag) => {
      const mm = chunk.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`))
      return mm ? htmlToText(mm[1]).trim() : ''
    }
    const title = pick('title')
    if (!title) continue
    const link = pick('link')
    out.push({
      site,
      id: (link.match(/question\/(\d+)/) || [])[1] || link || title,
      title,
      url: link,
      excerpt: excerpt(pick('description'), 110),
    })
  }
  return out
}

/**
 * 知乎热榜（走公开 RSSHub 镜像）。
 *
 * 为什么不用主站：主站网页要浏览器算 zse 指纹，纯 HTTP 一律 403 —— 挂了登录 cookie 也一样
 * （实测：带 z_c0 仍然 403）。所以热榜这块换成 RSS 镜像，公开数据，不需要登录。
 * 代价：数据经过第三方镜像，可能延迟；镜像会挂，所以按顺序试几个。
 */
export async function hotlist(cfg, { limit = 15 } = {}) {
  const mirrors = [String(cfg.zhihu?.rsshubBase || '').replace(/\/+$/, ''), ...HUB_MIRRORS].filter(Boolean)
  const errors = []
  const max = Math.max(1, Math.min(Number(limit) || 15, 50))
  for (const base of mirrors) {
    const r = await getText(`${base}/zhihu/hot/list`, {
      timeoutMs: cfg.timeoutMs, minGapMs: cfg.minGapMs, retries: 0,
      extraHeaders: { accept: 'application/rss+xml,application/xml,text/xml,*/*' },
    })
    if (!r.ok) { errors.push(`${base} → ${r.error || `HTTP ${r.status}`}`); continue }
    const items = parseRssItems(r.text).slice(0, max)
    if (!items.length) { errors.push(`${base} → 解析不出条目`); continue }
    return { ok: true, site, strategy: 'rsshub', mirror: base, items }
  }
  return { ok: false, site, strategy: 'rsshub', error: `镜像都没成：${errors.join('；')}` }
}

/** 预留：自建 RSSHub 的知乎路由（填了 rsshubBase 才有意义） */export async function rsshub(cfg, route = 'zhihu/hot/list') {
  const base = String(cfg.zhihu?.rsshubBase || '').replace(/\/+$/, '')
  if (!base) return { ok: false, site, strategy: 'rsshub', error: '配置里没填 rsshubBase，这条路没开' }
  const r = await getText(`${base}/${route}`, { timeoutMs: cfg.timeoutMs, minGapMs: cfg.minGapMs })
  if (!r.ok) return { ok: false, site, strategy: 'rsshub', error: r.error || `HTTP ${r.status}` }
  const items = [...String(r.text).matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const chunk = m[1]
    const pick = (tag) => {
      const mm = chunk.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`))
      return mm ? htmlToText(mm[1]) : ''
    }
    return { site, title: pick('title'), url: pick('link'), id: pick('guid') || pick('link'), excerpt: excerpt(pick('description'), 100) }
  }).filter((x) => x.title)
  return { ok: true, site, strategy: 'rsshub', items }
}
