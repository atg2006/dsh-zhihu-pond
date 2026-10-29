/**
 * lib/config.mjs —— 插件自己的配置（落在插件家目录，不碰 profile）。
 *
 *   $DSH_HOME/feed-pond/config.json
 *
 * cookie 只存本地，不进日志、不回显全文（只给前 8 位 + 长度，够判断有没有填）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
export const DIR = join(HOME, 'feed-pond')
export const FILE = join(DIR, 'config.json')

export const DEFAULTS = {
  enabled: true,
  /** 一天最多读几次（含每次抓取），防止自己手滑把号刷没 */
  dailyCap: 20,
  /** 两次抓取之间至少隔多久，毫秒 */
  minGapMs: 3000,
  /** 单次请求超时 */
  timeoutMs: 15000,
  zhihu: {
    /** 知乎登录 cookie（z_c0 那一条就够；整串也可以） */
    cookie: '',
    /** 自建 RSSHub 的地址，留空 = 不用这条路 */
    rsshubBase: '',
  },
}

function merge(base, patch) {
  if (!patch || typeof patch !== 'object') return base
  const out = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object'
      ? merge(base[k], v)
      : v
  }
  return out
}

export function readConfig() {
  let raw = {}
  try {
    if (existsSync(FILE)) raw = JSON.parse(readFileSync(FILE, 'utf8')) || {}
  } catch { raw = {} }
  const cfg = merge(DEFAULTS, raw)
  cfg.dailyCap = Math.max(1, Math.min(Number(cfg.dailyCap) || DEFAULTS.dailyCap, 200))
  cfg.minGapMs = Math.max(500, Math.min(Number(cfg.minGapMs) || DEFAULTS.minGapMs, 60000))
  cfg.timeoutMs = Math.max(3000, Math.min(Number(cfg.timeoutMs) || DEFAULTS.timeoutMs, 60000))
  return cfg
}

export function writeConfig(patch) {
  const cfg = merge(readConfig(), patch)
  mkdirSync(DIR, { recursive: true })
  writeFileSync(FILE, JSON.stringify(cfg, null, 2), 'utf8')
  return cfg
}

/** 给界面/工具看的摘要，绝不回显 cookie 全文 */
export function describeConfig(cfg) {
  const c = String(cfg.zhihu?.cookie || '')
  return {
    file: FILE,
    enabled: cfg.enabled,
    dailyCap: cfg.dailyCap,
    minGapMs: cfg.minGapMs,
    zhihu: {
      cookie: c ? `已填（${c.length} 字符，开头 ${c.slice(0, 8)}…）` : '未填',
      rsshubBase: cfg.zhihu?.rsshubBase || '未填',
    },
  }
}
