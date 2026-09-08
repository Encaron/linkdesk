# Changelog

> 每版一条，对标 VS Code changelog。**历史真相源 = [E6 执行清单](docs/02-Electron架构/E6_插件生态与发布/E6-执行清单.md)**（E6 阶段每轮收束细节 + 实机证据全在清单 Batch 注里，此文件只记类别清单）。版本号唯一真值 = `package.json`（不手写第二份，见 [02-产品身份与版本.md](docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/02-产品身份与版本.md) §2.3）。
> 0.x 阶段（开发期）：一切向后兼容变更走 patch 位；破坏性变更走 minor 位。

## v0.1.18（2026-09-09）

- **fix:E6#30f 目录空态语义修复（官方仓库实装后实机发现的空态误报 bug）**——官方目录源从「404 无缓存」变「200 空目录」后，探索页把「市场连上了但还没插件」误显示成「无法加载市场，请检查网络后重试」
  - 根因：`loadCatalog` 判空态只看合并条数 `entries.length===0` → 连上空目录也整体降级 offline（与自身「ok = 至少一源交付目录」契约相悖）；探索页空态只有损坏/无法加载两分支，空-ok 状态无出口（「暂无插件」文案成死代码）
  - 修：空态判据改为交付源数 `sources.length===0` 才降级 corrupt/offline——官方仓库建好未上架（`{"plugins":[]}`）= 合法 ok 空态；探索页空态三分支——ok 空「市场暂无插件」（非故障，无重试）/ corrupt「目录损坏」+重试 / offline「无法加载」+重试
  - 官方仓库 `Encaron/linkdesk-marketplace` 公开直链（main + HEAD）均 HTTP 200 返回合法空清单
  - 实机 CDP 9222：池冷启动后市场→探索插件，真网络拉官方空目录 → 显「市场暂无插件」（修复前同况显「无法加载市场」）；单测 +2 钉空态语义
  - 版本 0.1.17→0.1.18（0.x 向后兼容修复走 patch 位）

## v0.1.17（2026-09-09）

- **fix:E6#64 L3.5.2 事件反馈归一（档案 13 §一 A1-A3，2026-09-09 定案 1-5）**——市场安装/启停/更新的「出事方式」统一成右下角小通知（toast=操作回执），去阻塞弹窗 + 行内长红字推 UI
  - A1 探索/搜索视图 4 处阻塞式 `dialog.alert` → 事件型 error toast（缺下载地址 / 无安装通道 / 本地目录安装失败 / 抛错）——`notifyError()` 统一入口（11-API §三 事件通道）
  - A2 详情页事件型失败（装门/升级/启用/禁用/卸载抛错）全走 error toast；离线/已装冲突类静默（按钮置灰 + title「联网后重试」/「已装」已表达）；`setError` 行内红字字段 + `.mpd-action-error` 独占行 CSS/JSX 整删
  - A3 装失败收敛成一处重试口（mockup 02 帧 3）——toast [重试]（settle 既有）+ 详情页安装钮原位变红「↻ 重试安装」（danger + refresh，走 retryMarketInstall 同单活跃会话）；页中「失败+重试+✕」行删；`dismissMarketInstallError` 死导出连删
  - 定案 2 缺失件补上：主动点装即弹**角落常驻进度条**「正在安装 xxx…」（跨标签页仍挂角落；随进度更新百分比；成功终局 = lifecycle「已安装」toast 补句、进度条 cancel 收不双 toast；失败 = settle error toast 接续）——全走既有 #13.5 通知中心零新壳 API
  - i18n：en.json 补「正在安装 {{name}}…({{percent}}%)」两条进度键
  - 实机 CDP：详情页已装态零回归（禁用/卸载 render、无残留错误行）；壳 toast 宿主 progress 开/文案推进/cancel 收 + error 展示实证；残余 = 真装下载流程未实机（官方目录源 404 无缓存，既有 #30.5 残余）

## v0.1.16（2026-09-09）

- **fix:E6#63 L3.5.1 详情页版式对账（档案 13 B1-B5）**——插件详情页纯 CSS + DetailView 结构一次成型
  - B1 动作（安装/卸载/更新 + 自动更新勾）从 header 下方整行移入 header 右上动作列 `.mpd-acts`（mockup 01 竞标 A `.pdva` 三段一行）
  - B2 icon 位 96→52（内图 codicon/emoji 40、徽标 20）+ header 面板下加 `--separator` 分隔线
  - B3 右侧信息栏改 VS Code 式分组（顶部小段 + 市场/类别/资源/依赖·环境，空组隐藏）+ label 左｜value 右横排 + 项间细分隔 + 分类 chips 并排 + 作者行补齐（manifest 缺省回退目录 author，禁用态 header 副题/侧栏不塌）
  - B4 去 880 限宽全宽铺满 + 右侧信息栏定宽 220（`flex:none`）
  - B5 壳保底 PluginDetailView 同构对齐（头部钉顶 + body 独占滚动 + icon 52/40/20，CSS-only）；`.mpd-detail` 根 overflow hidden
  - 门禁同步：check-font-scale-audit 白名单随 icon 收敛值更新；en.json 补 市场/类别/资源/依赖·环境 4 组题键
  - 实机 CDP：1075 全宽 / icon 52 / acts 距右 20 / 侧栏 220 flex-none / 空组隐藏 / body 滚 2159 头钉 top65

## v0.1.15（2026-09-09）

- **feat:E6#62e 纯贡献插件激活机制裁决三件落地**（承接 #579 ③ / #9g——用户三裁决：整体退役 + 建池侧 on-command + boot 自动清）
  - 壳侧 deferred 激活轨**整体退役删除**——`activationEvents` schema 属性删（×3，`additionalProperties:true` 兜底旧 manifest）+ activation.ts/preActivateHook/defer 接线全撤（零插件声明过，潜伏态无消费方）
  - 纯命令/纯贡献插件按需激活 = **池侧 on-command**——命令 miss → 池 `resolvePluginViewLoader` 按 URL import 属主入口（underscore 内部面，作者面零新 API；author 契约 = 命令注册在入口顶层）
  - `plugin.json` 生命周期/contributes 规范文档同步（activationEvents 退役记 + 池按需激活模型）
- **fix:E6#11e-342 旧 `.disabled/` 坟场引导 = boot 自动清**——跨重启孤儿逐条真删 + 幽灵 uninstalled 缓存清（loader 启动 Step-8；取代「从市场重装」提示引导）
- 连带死代码清理：write-only bundle 标记集整删（`isBundlePlugin`/`markBundlePlugin`/`syncBundlePluginIds`）

## v0.1.14（2026-09-09）

- **feat:E6#62d statusBar 池侧 glob 最后退役 + dist export 约定**
  - `appearsIn.statusBar` bool → 相对路径字符串（存在 + 文件二合一声明，对标 view render；schema 三副本同步 + contracts 重生成）——serial-monitor 状态栏组件随包自声明，不再编入壳/池 bundle（硬约束 11）
  - loader 注册时归一 `statusBarRenderPath`（dev `/@fs` 源码 / prod `linkdesk://` dist）→ 池 `PoolStatusBarComponent` 整删构建期 `import.meta.glob` → 按 URL 直动态 import + bundleCss 引用计数
  - SDK 收 statusBar 面——zip 根 `statusBar.bundle.js` + dist manifest 字段改写；serial-monitor 1.0.2 随批重建进 bundled-plugins

## v0.1.13（2026-09-08）

- **feat:E6#62a/#62b/#62f dev 源码 glob 快轨退役 + 协议收单根**（#62 家族同批拆）
  - E6#62a state.ts 拆双 glob——`pluginModules` 入口 glob + `usesSourceGlobTrack` 整删；`pluginManifestRaw` 收单职（浏览器预览种子，Electron 零消费）；源码树成员判据 → IPC 直查（readManifest/resolvePath）
  - E6#62b glob 内 dev 快轨退役——runtime.ts Step1/3/4 glob 分支 + contributions `loadPluginComponent` + PluginComponent mis-root 恒空双 glob 表整删；全插件收单 URL 轨（dev /@fs 源码 | prod linkdesk:// dist）
  - E6#62f `linkdesk://` 协议收单一 userData 根——prod（app.isPackaged）单根；dev 保 [app, userData] 双根

## v0.1.12（2026-09-08）

- **feat:E6#33 更新与版本**（第 3.3.2 轮整轮收束，实机 CDP 全链验收）
  - E6#33a 插件更新发现编排——市场池首载调度，每版本一次幂等铃铛通知 + 常驻可更新候选
  - E6#33b 升级入口 UI——详情页更新块/更新按钮 + 侧栏「可更新」行徽标 + 双版 changelog 并排
  - E6#33c 版本下拉 + 手动降级——selectableVersions 版本选择 + F2 降级确认 + `pinnedVersion` 记账（engine `allowOlder` 显式放行）
  - E6#33d 自动更新勾选——插件级 Opt-IN 默认关，静默自动编排，选旧版记 pin 暂停 auto
  - E6#33e 原子切换更新执行（引擎已收于 E6#13c）——失败旧版保留
  - 收 #30.9a M6 版本下拉/autoUpdate 置灰；#30.8e 更新权限重审批随 E6#49
