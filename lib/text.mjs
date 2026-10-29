/**
 * lib/text.mjs —— HTML 搓成能读的纯文本。
 *
 * 不做完整解析（不肯为这个塞一个 DOM 库进 profile），只做够用的事：
 *   - 去掉 script/style/注释
 *   - 块级标签断行
 *   - 常见实体还原
 *   - 连续空行压成一个
 */

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', mdash: '—', ndash: '–',
  middot: '·', times: '×', copy: '©', reg: '®', deg: '°',
}

export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeChar(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
}

function safeChar(code) {
  try { return String.fromCodePoint(code) } catch { return '' }
}

export function htmlToText(html) {
  let s = String(html ?? '')
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, '')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\/(p|div|section|article|li|h[1-6]|blockquote|tr|figure|figcaption)>/gi, '\n')
  s = s.replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, (m, alt) => (alt ? `［图：${alt}］` : '［图］'))
  s = s.replace(/<[^>]+>/g, '')
  s = decodeEntities(s)
  s = s.replace(/[ \t\u00a0]+/g, ' ')
  s = s.replace(/\s*\n\s*/g, '\n')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

/** 截一段摘要，别把整篇塞回上下文 */
export function excerpt(text, max = 120) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}
