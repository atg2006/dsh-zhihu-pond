/**
 * lib/state.mjs —— 今日用量 + 读过什么。
 *
 *   $DSH_HOME/zhihu-pond/state.json
 *   { day: '2026-10-29', count: 3, seen: [{ site, id, title, at }] }
 *
 * 为什么要有：
 *   只读插件也该有刹车 —— 一天读多少条、这条是不是已经读过了。
 *   免得模型自己刷得停不下来，也免得同一篇反复占上下文。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DIR } from './config.mjs'

const FILE = join(DIR, 'state.json')
const SEEN_KEEP = 200

export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function load() {
  try {
    if (!existsSync(FILE)) return { day: dayKey(), count: 0, seen: [] }
    const s = JSON.parse(readFileSync(FILE, 'utf8')) || {}
    if (s.day !== dayKey()) return { day: dayKey(), count: 0, seen: Array.isArray(s.seen) ? s.seen : [] }
    return { day: s.day, count: Number(s.count) || 0, seen: Array.isArray(s.seen) ? s.seen : [] }
  } catch {
    return { day: dayKey(), count: 0, seen: [] }
  }
}

/**
 * 写盘失败**不抛**：额度记不下就算了，别让一次抓取因为一个计数文件崩掉。
 * 失败原因留在 lastError 里，feed_status 会带出去。
 */
let lastError = ''
function save(s) {
  try {
    mkdirSync(DIR, { recursive: true })
    writeFileSync(FILE, JSON.stringify(s, null, 2), 'utf8')
    lastError = ''
  } catch (e) {
    lastError = String(e?.message || e)
  }
}

export function stateError() {
  return lastError
}

/** 今天还剩几次额度 */
export function quota(cfg) {
  const s = load()
  const cap = Number(cfg?.dailyCap) || 20
  const q = { day: s.day, used: s.count, cap, left: Math.max(0, cap - s.count) }
  if (lastError) q.warning = `额度文件写不进去（${lastError}），这次计不了数`
  return q
}

/** 记一次抓取；额度用尽时返回 false（调用方据此拒绝） */
export function consume(cfg) {
  const s = load()
  const cap = Number(cfg?.dailyCap) || 20
  if (s.count >= cap) return { ok: false, ...quota(cfg) }
  s.count += 1
  save(s)
  return { ok: true, used: s.count, cap, left: Math.max(0, cap - s.count) }
}

export function hasSeen(site, id) {
  return load().seen.some((x) => x.site === site && String(x.id) === String(id))
}

export function markSeen(site, id, title) {
  const s = load()
  if (s.seen.some((x) => x.site === site && String(x.id) === String(id))) return
  s.seen.push({ site, id: String(id), title: String(title || '').slice(0, 80), at: Date.now() })
  if (s.seen.length > SEEN_KEEP) s.seen = s.seen.slice(-SEEN_KEEP)
  save(s)
}
