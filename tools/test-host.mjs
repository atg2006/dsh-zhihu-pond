/**
 * tools/test-host.mjs —— 用假 ctx 把 host 半端跑一遍，确认工具注册得进去、调得动。
 *
 *   node tools/test-host.mjs
 *
 * 注意：这里会真的写 $DSH_HOME/feed-pond/state.json（记一次额度），
 * 跟 DSH 里跑是一致的 —— 想干跑就先把 dailyCap 调成 0。
 */
const tools = []
const ctx = {
  tools: {
    register(t) { tools.push(t); return t },
  },
}

const mod = await import('../index.js')
console.log('插件名:', mod.name, '| inject:', mod.inject)
mod.apply(ctx)

console.log('\n注册到的工具:', tools.map((t) => t.name).join(', '))

const call = async (name, args = {}) => {
  const t = tools.find((x) => x.name === name)
  if (!t) return { ok: false, error: `没有这个工具: ${name}` }
  const out = await t.execute(args, {})
  const rendered = t.output?.render?.([], out)?.[0]?.text
  return { out, rendered }
}

const status = await call('feed_status')
console.log('\n── feed_status ──')
console.log(JSON.stringify(status.out, null, 2).slice(0, 1200))

const probe = await call('zhihu_probe')
console.log('\n── zhihu_probe ──')
console.log(JSON.stringify(probe.out))

const hot = await call('zhihu_hot', { limit: 2 })
console.log('\n── zhihu_hot(2) ──')
console.log(JSON.stringify({ ok: hot.out.ok, count: hot.out.items?.length, quota: hot.out.quota, items: hot.out.items?.map((i) => `${i.id} ${i.title}`) }, null, 2))

const bad = await call('zhihu_story', { id: 'abc' })
console.log('\n── zhihu_story(abc) ──')
console.log(JSON.stringify(bad.out))
