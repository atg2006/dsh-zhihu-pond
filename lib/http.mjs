/**
 * lib/http.mjs —— 统一出口：UA、超时、重试、限速、cookie。
 *
 * 三条规矩（只读插件就该这样）：
 *   ① 每次请求之间隔 minGapMs，不连发；
 *   ② 请求一律带超时，别把整条会话挂死；
 *   ③ 失败不抛到工具层，返回 {ok:false, error}，让模型自己决定要不要换路。
 */

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let lastAt = 0
/** 全进程共享的节流：不管哪个工具调的，两次抓取之间都拉开间隔 */
export async function throttle(minGapMs = 3000) {
  const gap = Math.max(0, minGapMs)
  const wait = lastAt + gap - Date.now()
  if (wait > 0) await sleep(wait)
  lastAt = Date.now()
}

function headers(extra = {}, cookie = '') {
  const h = {
    'user-agent': UA,
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
    accept: 'application/json, text/plain, */*',
    ...extra,
  }
  if (cookie) h.cookie = cookie
  return h
}

async function once(url, { extraHeaders, cookie, timeoutMs }) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: headers(extraHeaders, cookie), redirect: 'follow', signal: ac.signal })
    const text = await res.text()
    return { status: res.status, text, url: res.url }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 取文本。retries 只对网络错误和 5xx 生效 —— 4xx 是我们自己的问题，重试没意义。
 * @returns {Promise<{ok:boolean,status?:number,text?:string,error?:string,url?:string}>}
 */
export async function getText(url, opts = {}) {
  const { cookie = '', timeoutMs = 15000, minGapMs = 3000, retries = 1, extraHeaders = {} } = opts
  let lastError = ''
  for (let i = 0; i <= retries; i++) {
    await throttle(minGapMs)
    try {
      const r = await once(url, { extraHeaders, cookie, timeoutMs })
      if (r.status >= 500 && i < retries) { lastError = `HTTP ${r.status}`; continue }
      return { ok: r.status >= 200 && r.status < 300, status: r.status, text: r.text, url: r.url }
    } catch (e) {
      lastError = e?.name === 'AbortError' ? `超时（${timeoutMs}ms）` : String(e?.message || e)
      if (i < retries) continue
    }
  }
  return { ok: false, error: lastError || '请求失败' }
}

/** 取 JSON；非 JSON 就老实报错，别硬 parse */
export async function getJson(url, opts = {}) {
  const r = await getText(url, opts)
  if (!r.ok) return r
  try {
    return { ok: true, json: JSON.parse(r.text), status: r.status, url: r.url }
  } catch {
    return { ok: false, status: r.status, error: '返回的不是 JSON（大概被拦了）', sample: String(r.text || '').slice(0, 160) }
  }
}
