/**
 * dsh-feed-pond —— host 半端
 * ============================================================================
 * 一个**只读**信息流插件：把知乎的公开内容读成文本交给 DSH。
 * 只读、不评论、不点赞、不发布、不改账号。
 *
 * 工具：
 *   feed_status    看配置、今日额度、各站状态
 *   feed_config    改配置（可选 cookie / 每日上限 / 间隔）
 *   zhihu_hot      今日知乎日报（公开接口）
 *   zhihu_hotlist  知乎热榜（公开 RSSHub 镜像）
 *   zhihu_story    一篇日报的正文
 *   zhihu_probe    知乎主站现在通不通（被 zse 拦就直说）
 *
 * 装法：
 *   dsh plugin --profile desktop add link:<本目录>
 *   装完从托盘彻底退出 DSH 再开。
 *
 * 家里（$DSH_HOME/feed-pond/）落什么：
 *   config.json   配置（cookie 存这里，不进日志）
 *   state.json    今日用量 + 读过哪些，读满就拒绝
 * ============================================================================
 */
import { loadHostDeps } from './lib/hostdeps.mjs'

const hostDeps = await loadHostDeps()
const defineTool = hostDeps.defineTool

import { readConfig, writeConfig, describeConfig } from './lib/config.mjs'
import { quota, consume, markSeen, stateError } from './lib/state.mjs'
import { load as loadProvider, catalog } from './lib/providers/index.mjs'

export const name = 'feed-pond'

/** 只要工具注册表 */
export const inject = ['tools']

/** 返回值一律无损 JSON：塞函数/循环引用宿主会报错 */
const textOutput = {
  schema: { type: 'object', properties: {}, additionalProperties: true },
  render: (_args, value) => [{
    type: 'text',
    text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
  }],
}

const safe = (v) => {
  if (v === undefined || v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  try { return JSON.parse(JSON.stringify(v)) } catch { return String(v) }
}

/** 额度用完了就返回一句人话，别再往下抓 */
function needQuota(cfg) {
  const q = quota(cfg)
  if (q.left <= 0) {
    return { ok: false, blocked: true, hint: `今天的额度用完了（${q.used}/${q.cap}）。要放开就调 feed_config 把 dailyCap 改大一点。`, ...q }
  }
  return null
}

export function apply(ctx) {
  const tool = (spec) => ctx.tools.register(defineTool({
    ...spec,
    output: textOutput,
    async execute(args) { return safe(await spec.execute(args || {})) },
  }))

  /* ───────────────────────── 状态 / 配置 ───────────────────────── */

  tool({
    name: 'feed_status',
    description: '看「信息流」插件现在的状态：配置、今天读了几次、各站能不能用。先问能不能读，再动手。',
    parameters: {},
    async execute() {
      const cfg = readConfig()
      return {
        ok: true,
        enabled: cfg.enabled,
        quota: quota(cfg),
        state: stateError() ? { writeError: stateError() } : 'ok',
        config: describeConfig(cfg),
        sites: catalog(),
        notes: hostDeps.notes,
      }
    },
  })

  tool({
    name: 'feed_config',
    description: '读写插件配置。不传任何字段 = 只看；传了就写（只动插件自己家目录里的 config.json）。'
      + 'cookie 可选填；填了也不代表主站能抓 —— 知乎主站要浏览器指纹，见 README。',
    parameters: {
      cookie: { type: 'string', description: '知乎 cookie（不填就不改；传空串 = 清空）' },
      dailyCap: { type: 'number', description: '一天最多读几次（1~200）' },
      minGapMs: { type: 'number', description: '两次抓取至少隔多少毫秒（500~60000）' },
      rsshubBase: { type: 'string', description: '自建 RSSHub 地址，留空 = 只用内置镜像' },
      enabled: { type: 'boolean', description: '总开关' },
    },
    async execute(args) {
      const patch = {}
      if (typeof args.cookie === 'string') patch.zhihu = { cookie: args.cookie.trim() }
      if (args.rsshubBase !== undefined) patch.zhihu = { ...(patch.zhihu || {}), rsshubBase: String(args.rsshubBase).trim() }
      if (args.dailyCap !== undefined) patch.dailyCap = args.dailyCap
      if (args.minGapMs !== undefined) patch.minGapMs = args.minGapMs
      if (args.enabled !== undefined) patch.enabled = Boolean(args.enabled)

      if (!Object.keys(patch).length) {
        const now = readConfig()
        return { ok: true, config: describeConfig(now), quota: quota(now) }
      }
      let cfg = null
      try { cfg = writeConfig(patch) } catch { cfg = null }
      if (!cfg) return { ok: false, error: '配置写不进去（目录权限？）。这次改动没保存。' }
      return { ok: true, changed: Object.keys(patch), config: describeConfig(cfg), quota: quota(cfg) }
    },
  })

  /* ───────────────────────── 知乎 ───────────────────────── */

  tool({
    name: 'zhihu_hot',
    description: '今天知乎日报推了哪几条（公开接口，不用登录）。给标题 + 摘要 + id；'
      + '要看正文再用 zhihu_story。只读，不评论不点赞。',
    parameters: {
      limit: { type: 'number', description: '要几条，默认 10，最多 30' },
    },
    async execute(args) {
      const cfg = readConfig()
      if (!cfg.enabled) return { ok: false, disabled: true, hint: '插件总开关关着，先在 feed_config 里开' }
      const blocked = needQuota(cfg)
      if (blocked) return blocked
      const p = await loadProvider('zhihu')
      const r = await p.hot(cfg, { limit: args.limit })
      if (r.ok) {
        consume(cfg)
        for (const it of r.items) markSeen('zhihu', it.id, it.title)
      }
      return { ...r, quota: quota(cfg) }
    },
  })

  tool({
    name: 'zhihu_hotlist',
    description: '知乎热榜（公开 RSS 镜像，不用登录）。返回标题 + 链接 + 摘要。'
      + '主站网页纯 HTTP 抓不动（要浏览器算指纹，挂登录也一样），所以热榜走镜像。',
    parameters: {
      limit: { type: 'number', description: '要几条，默认 15，最多 50' },
    },
    async execute(args) {
      const cfg = readConfig()
      if (!cfg.enabled) return { ok: false, disabled: true, hint: '插件总开关关着，先在 feed_config 里开' }
      const blocked = needQuota(cfg)
      if (blocked) return blocked
      const p = await loadProvider('zhihu')
      const r = await p.hotlist(cfg, { limit: args.limit })
      if (r.ok) {
        consume(cfg)
        for (const it of r.items) markSeen('zhihu', it.id, it.title)
      }
      return { ...r, quota: quota(cfg) }
    },
  })

  tool({
    name: 'zhihu_story',
    description: '读一篇知乎日报的正文（给 zhihu_hot 里那个数字 id）。返回纯文本，HTML 已经搓干净了。',
    parameters: {
      id: { type: 'string', description: '日报 id（zhihu_hot 返回的那个数字）' },
      maxChars: { type: 'number', description: '正文最多回多少字，默认 6000' },
    },
    async execute(args) {
      const cfg = readConfig()
      if (!cfg.enabled) return { ok: false, disabled: true, hint: '插件总开关关着' }
      const blocked = needQuota(cfg)
      if (blocked) return blocked
      const p = await loadProvider('zhihu')
      const r = await p.story(cfg, args.id)
      if (!r.ok) return { ...r, quota: quota(cfg) }
      consume(cfg)
      const max = Math.max(500, Math.min(Number(args.maxChars) || 6000, 20000))
      const cut = r.text.length > max
      return { ...r, text: cut ? `${r.text.slice(0, max)}…` : r.text, truncated: cut, quota: quota(cfg) }
    },
  })

  tool({
    name: 'zhihu_probe',
    description: '探一下知乎主站现在通不通。被拦就直说被拦（zse 挑战页），不要假装读到了。',
    parameters: {},
    async execute() {
      const cfg = readConfig()
      const p = await loadProvider('zhihu')
      return { ...(await p.probe(cfg)), quota: quota(cfg) }
    },
  })
}
