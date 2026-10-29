/**
 * tools/smoke.mjs —— 不进 DSH 也能验：直接调适配器，看内容是真是假。
 *
 *   node tools/smoke.mjs
 *
 * 不写任何状态文件（额度/已读是 index.js 那边的事），只读。
 */
import { readConfig } from '../lib/config.mjs'
import * as zhihu from '../lib/providers/zhihu.mjs'

const cfg = readConfig()

function line(t) { console.log(`\n──── ${t} ────`) }

line('配置')
console.log({ enabled: cfg.enabled, dailyCap: cfg.dailyCap, minGapMs: cfg.minGapMs, timeoutMs: cfg.timeoutMs, zhihuCookie: cfg.zhihu.cookie ? '已填' : '未填' })

line('知乎主站可达性')
const probe = await zhihu.probe(cfg)
console.log(probe)

line('知乎日报列表')
const hot = await zhihu.hot(cfg, { limit: 5 })
console.log({ ok: hot.ok, strategy: hot.strategy, date: hot.date, error: hot.error, count: hot.items?.length })
for (const it of hot.items || []) console.log(`  ${it.id}  ${it.title}`)

if (hot.ok && hot.items?.length) {
  const id = hot.items[0].id
  line(`正文 id=${id}`)
  const s = await zhihu.story(cfg, id)
  console.log({ ok: s.ok, title: s.title, url: s.url, chars: s.chars, error: s.error, truncated: s.truncated })
  console.log((s.text || '').slice(0, 300).replace(/\n+/g, ' '))
}

line('正文：错误 id 该怎么答')
console.log(await zhihu.story(cfg, 'not-a-number'))
