/**
 * lib/providers/index.mjs —— 站点适配器注册表。
 *
 * 加一个新站 = 在 lib/providers/ 里加一个文件，然后在这里挂一行。
 * 每个适配器至少要导出：
 *   site    站点的短 id（'zhihu' / 'wechat' / 'xhs'）
 *   meta    给人看的说明（名字、是否只读、有哪几条策略）
 *   hot     列表：hot(cfg, {limit}) -> { ok, items[] }
 *   story   正文：story(cfg, id) -> { ok, title, url, text }
 * 「搜」不是每个站都有，谁有谁再导一个 search。
 */

const LOADERS = {
  zhihu: () => import('./zhihu.mjs'),
}

export const SITE_IDS = Object.keys(LOADERS)

export async function load(site) {
  const fn = LOADERS[String(site || '').toLowerCase()]
  if (!fn) return null
  return fn()
}

/** 给状态工具用：所有站的说明，不加载代码（只有名字和策略） */
export function catalog() {
  return [
    { site: 'zhihu', name: '知乎', status: 'read-only', strategies: ['daily（公开接口，可用）', 'rsshub（要自建实例）', 'html（主站，被 zse 拦着）'] },
    { site: 'wechat', name: '微信公众号', status: 'planned', note: '单篇文章能抓正文，信息流要 RSS 源，二期' },
    { site: 'xhs', name: '小红书', status: 'planned', note: '首页可抓，搜索/详情要登录 cookie + 签名，三期' },
  ]
}
