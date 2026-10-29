# dsh-zhihu-pond

**只读**信息流插件：把知乎（以后还想接微信公众号、小红书）的公开内容读成文本交给 DSH。
不评论、不点赞、不发布、不改动账号。

照 `dsh-bili-pond` 的结构做的骨架版（0.1.0），目前只有知乎一个站。

## 能用什么

| 工具 | 干什么 |
| --- | --- |
| `feed_status` | 看配置、今天读了几次、各站状态 |
| `feed_config` | 读/写配置（每日上限、抓取间隔、可选 cookie） |
| `zhihu_hot` | 今天知乎日报推了哪几条（公开接口） |
| `zhihu_hotlist` | 知乎热榜（公开 RSSHub 镜像） |
| `zhihu_story` | 读一篇日报的正文（HTML 已搓成纯文本） |
| `zhihu_probe` | 探知乎主站通不通；被拦就直说被拦 |

## 说实话的部分（2026-10-29 本机实测）

- `www.zhihu.com` 的网页、热榜、搜索，裸 fetch 一律 **403**，回的是 `zh-zse-ck` 挑战页。
  要靠浏览器执行 JS 算出指纹才放行 —— 纯 HTTP 抓不动，这一版没硬刚，也没做绕过。
- **挂登录 cookie 也没用**：拿真实 `z_c0` 去打 /hot、/question、/search，照样 403。
  挡人的不是登录状态，是浏览器指纹。所以主站这条路暂时死着。
- 试过真浏览器（Playwright + 系统 Edge）：能起来，但知乎给它的是「安全验证」页，
  验证控件加载不出来，过不去。
- 现在能读的两条：知乎日报（公开接口）、知乎热榜（公开 RSSHub 镜像）。都不需要登录。

## 装法

```console
dsh plugin --profile desktop add link:<本目录>
```

装完从托盘**彻底退出** DSH 再开（只关窗口不算）。

桌面版自带的 CLI 在：

```console
"C:\Users\<你>\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd"
```

## 配置

落在 `$DSH_HOME/zhihu-pond/config.json`（默认 `C:\Users\<你>\.dsh\zhihu-pond\config.json`），
用 `feed_config` 改最省事。cookie 只存本地，不回显全文。

```json
{
  "enabled": true,
  "dailyCap": 20,
  "minGapMs": 3000,
  "timeoutMs": 15000,
  "zhihu": { "cookie": "", "rsshubBase": "" }
}
```

`dailyCap` 是刹车：一天读满就拒绝，要放开再改。`state.json` 记今天读了几次、读过哪些。

## 目录

```
index.js                  host 半端：注册工具
lib/config.mjs            配置读写
lib/state.mjs             今日额度 + 已读
lib/http.mjs              UA / 超时 / 重试 / 节流
lib/text.mjs              HTML → 纯文本
lib/hostdeps.mjs          从宿主树里取 defineTool（拿不到就用等价实现）
lib/providers/index.mjs   站点注册表
lib/providers/zhihu.mjs   知乎适配器
tools/smoke.mjs           不进 DSH 也能验：node tools/smoke.mjs
tools/test-host.mjs       用假 ctx 跑一遍工具注册
```

## 加下一个站

在 `lib/providers/` 加一个文件，导出 `site / meta / hot / story`（有搜索就再加 `search`），
到 `lib/providers/index.mjs` 的 `LOADERS` 里挂一行，再去 `index.js` 加对应工具。

二期打算：微信公众号（单篇能抓正文，信息流只能走 RSS 源）、小红书（要签名，得配浏览器兜底）。

## 红线

只读、低频、不自动评论。抓取间隔默认 3 秒，一天默认 20 次。
不存密码、不模拟登录、不改账号。
