/**
 * lib/hostdeps.mjs —— 从宿主那棵树里取 `@deepseek-ai/dsh-tools` 的 defineTool。
 *
 * 为什么要绕这一下：
 *   插件是被装进 profile 的 node_modules 里的第三方包，那里**不一定**有
 *   `@deepseek-ai/dsh-tools`（桌面版 profile 是 autoInstallPeers: false，
 *   永远不装 optional peer）。一句裸 import 失败，整条插件就不会激活，
 *   日志里只剩一行 "1 entry did not activate"。
 *
 * 策略：
 *   ① 先按可能的宿主位置去找，找到就用宿主那一份（行为跟宿主一致）；
 *   ② 找不到就用本地等价实现（把 spec 原样交回去，工具照常注册）；
 *   ③ 全程不抛错 —— 宁可少一个能力，也不能让插件不激活。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SELF_MODULES = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '@deepseek-ai')

function candidateRoots() {
  const out = []
  const push = (p) => { if (p && !out.includes(p)) out.push(p) }
  push(process.env.DSH_HOST_MODULES)

  const appdata = process.env.APPDATA
  if (appdata) {
    const npm = join(appdata, 'npm', 'node_modules')
    push(join(npm, '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'))
    push(join(npm, '@deepseek-ai'))
    try {
      for (const n of readdirSync(join(npm, '@deepseek-ai'))) {
        push(join(npm, '@deepseek-ai', n, 'node_modules', '@deepseek-ai'))
      }
    } catch { /* 没有就算了 */ }
  }
  push('/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai')
  push('/usr/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai')

  try {
    const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
    for (const p of readdirSync(join(dshHome, 'profiles'))) {
      push(join(dshHome, 'profiles', p, 'node_modules', '@deepseek-ai'))
    }
  } catch { /* 没有就算了 */ }

  push(SELF_MODULES)
  return out
}

function entryUrlFor(root, name) {
  try {
    const dir = join(root, name)
    const pkgFile = join(dir, 'package.json')
    if (!existsSync(pkgFile)) return null
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
    const dot = pkg.exports?.['.']
    const rel = typeof dot === 'string' ? dot : (dot?.import || dot?.default || pkg.module || pkg.main)
    if (!rel) return null
    const file = join(dir, String(rel).replace(/^\.\//, ''))
    return existsSync(file) ? pathToFileURL(file).href : null
  } catch { return null }
}

/** 本地等价实现：spec 本来就是标准 JSON Schema，原样返回即可。 */
function localDefineTool(options, log) {
  const check = (schema, where) => {
    if (!schema || typeof schema !== 'object') return
    if (schema.type === 'object' && schema.additionalProperties === undefined) {
      throw new Error(`defineTool(${options.name}): ${where} 是 object 却没写 additionalProperties`)
    }
    for (const [k, v] of Object.entries(schema.properties || {})) check(v, `${where}.properties.${k}`)
  }
  check(options.parameters, 'parameters')
  check(options.output?.schema, 'output.schema')
  log?.(`dsh-tools 拿不到，用本地等价实现顶上了（工具 ${options.name}）`)
  return options
}

export async function loadHostDeps() {
  const notes = []
  const log = (m) => notes.push(m)

  let defineTool = null
  for (const root of candidateRoots()) {
    if (root === SELF_MODULES) continue
    const url = entryUrlFor(root, 'dsh-tools')
    if (!url) continue
    try {
      const mod = await import(url)
      if (mod?.defineTool) { defineTool = mod.defineTool; log(`dsh-tools：从宿主树取到（${url}）`); break }
    } catch (e) { log(`dsh-tools：${root} 里 import 失败（${e?.code || e?.message || '?'}）`) }
  }
  if (!defineTool) {
    try {
      const mod = await import('@deepseek-ai/dsh-tools')
      if (mod?.defineTool) { defineTool = mod.defineTool; log('dsh-tools：用自己依赖里那份') }
    } catch { /* 兜底走下面 */ }
  }
  defineTool = defineTool || ((options) => localDefineTool(options, log))

  return { defineTool, notes }
}
