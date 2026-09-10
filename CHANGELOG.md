# Changelog

> 每版一条，对标 VS Code changelog。**历史真相源 = [E6 执行清单](docs/02-Electron架构/E6_插件生态与发布/E6-执行清单.md)**（E6 阶段每轮收束细节 + 实机证据全在清单 Batch 注里，此文件只记类别清单）。版本号唯一真值 = `package.json`（不手写第二份，见 [02-产品身份与版本.md](docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/02-产品身份与版本.md) §2.3）。
> 0.x 阶段（开发期）：一切向后兼容变更走 patch 位；破坏性变更走 minor 位。

## v0.1.29（2026-09-10）

- **fix:E6#73e 安装失败归因与超时——「一次慢网络 = 一次假失败」拆掉**
  - **下载有超时了**（`electron/services/plugin-download.ts`）：此前 `fetch` **零超时/零重试**——服务器半死不活（连上了、头也发了、就是不给字节）就**永远挂着**，用户既看不到失败也没有 [重试]。现加**空闲超时** 30s（判据是「还在动吗」，不是「够快吗」——总时长阈值会把慢网上的**健康下载**判死，那是把 10s 桥超时的老病换个门槛复活）+ **重试预算 2 次**（5xx / 408 / 429 / 网络中断 / 空闲超时可重试；**4xx 是确定性拒绝**——地址没了，重试只会同样失败，不消耗预算；用户取消恒不重试）+ `opts.signal` 外部取消（job 级 AbortController 的接入口，供 E6#73q 槽级看门狗与「取消安装」动作接）
  - **10s 桥超时不再打死安装**（`electron/ipc/ipc-bridge.ts`）：`plugins:call` 是单通道多方法，装/更新族一次调用要跑下载→解压→加载，**耗时时长由网络与包大小决定**，10 秒墙钟与它毫无关系——此前「装插件超 10 秒必判失败，而它其实还在装」。现立长任务方法名单（`install`/`installWithProgress`/`reinstall`/`update`）**不设请求超时**，兜底落回既有两处 `dispose()`；非安装方法仍 10s 兜底（豁免只在安装族，不整条通道开口子）
    - ⚠️ **主动偏离设计原话（理由留档）**：设计写「桥超时后取消安装」，改为「豁免 + 超时职责下沉到下载层」。保留一个有限阈值再在它上面挂取消只是把同一类误判换个门槛复活（E6#74 已立此论）；且真正的取消必须能命中**具体哪一个 job**，而这条计时器只知道 channel、不知道 job ⇒ **超时归下载层，取消归 job（E6#73q）**
  - **失败归因不再说谎**（`plugins/marketplace/src/services/marketplaceShared.ts`）：裸 `HTTP` 从网络正则里摘掉、**4xx / 5xx 单列两类**——此前一条 `HTTP` 子串吃掉所有 404/403/500，**下载链接失效被报成「网络连接不可用」**，用户于是反复查网络反复重试（真相 = 那个地址已经没了，而重试的其实是另一个插件）；`failText(t, labelKeyFn, reason, raw)` **参数化抽出共用组合规则**（可认 → 该域归因短语经 t / 认不出 → 引擎原文直显 / 原文为空 → 该域兜底），`updateFailText` 退成薄包装，**不得再落第二份同构拷贝**；失败通知**带插件名 + 引擎原文**；字典 default 撤「未知错误」谎
  - 新增单测 +16：下载空闲超时（挂死报超时 + 自清 `.part`）/ 5xx 自动重试至成功 / 4xx 只打一次不消耗预算 / 5xx 耗尽预算才认输 / 用户取消不重试；桥侧安装族半小时不超时 + 非安装方法仍 10s 超时；归因 http4xx/http5xx 单列 + 三位状态码判据 + 裸 `HTTP` 不再谎称网络 + 两域短语不串味 + `failText` 三支 + 薄包装等价。`npm run check` EXIT=0（133 文件 / 1768 测试）
  - **缺的一角（同批补，见 E6#73q/73d）**：**槽级看门狗**与**进行中行的「取消安装」动作**需要 job 句柄——随安装队列 job 表落地（§五 I.6① / §八⑤）

## v0.1.28（2026-09-10）

- **fix:E6#74 确认门 10s 桥超时——用户阻塞通道不再被超时打死**
  - **缺陷**：确认卡停留 **> 10s** 再点「确认安装」= **静默不装**（卡还在、点下去毫无反应、零提示零报错）；10s 以内点同一按钮正常。E6#71k 实机 CDP 验证时抓到并对照复现
  - **根因**：`electron/ipc/ipc-bridge.ts` 的统一 **10s 请求超时**打在 `dialog:confirmContent` 上——而该通道壳侧 handler 的语义就是「**等用户回答**」，天然无期。超时后池侧 Promise 已 reject，用户事后点按钮结算的是一个**死请求**（池侧 `Uncaught (in promise)`，用户侧全静默）
  - **修法**：`IpcBridge` 立「用户阻塞通道」名单（`dialog.confirm` / `dialog.alert` / `dialog.confirmContent`）→ **名单内不设请求超时**；未决请求兜底落回既有两处 `dispose()`（应用退出 / 壳崩重建），行为不变。**不选「把数字调大」**——任何有限阈值都会把同一类 bug 换个门槛复活
  - 新增单测 `ipc-bridge.test.ts`（5 例：confirmContent 60s 不结算 / 三成员半小时不结算且迟到回答照常结算 / 普通通道 10s 仍超时 / `dispose()` 仍拒绝 / 迟到回答不发二次结算）；**反证测试力**：临时关掉豁免 → 3 例立刻红
  - 实机 CDP 复验：富卡停 12s 再点确认 → **真装**（2.0.0）；纯文字 confirm 停 12s 再点确定 → **真卸载**；壳日志零 `请求超时`
  - ⚠️ **与 E6#71k「每次都问」无关**：该缺陷自 E6#71c 引入富内容确认（`dialog.confirmContent`）即存在，与 71k 的信任机制存废互不相关

## v0.1.27（2026-09-10）

- **feat:E6#72 通知面归一——删右下窄小卡，铃铛宽面板成唯一通知面并补齐三件事**
  - **72a 右下窄卡端到端删除**：池 `ToastHost.tsx/css/test` + `poolToast.ts` 类型整删、FloatingLayerHost 去 `#toast-root`；壳 `bridges.ts` #16 推流桥 + `toast.ts` 序列化面删；主进程链路删（channels 三通道 / plugin-view-handlers 两 handler / runtime-dto-registry / preload-pool `toast-dialog.ts`→`dialog-floating-panel.ts` 更名 / preload-shell poolApi / window-manager `pushToast`）；`linkdesk-api` 的 `toast` 宿主桥命名空间与 PoolExposed 面同步删。**通知数据一字未动**——两浮层本就同读一个 store，删的是窄卡那条渲染喂食链路
  - **72b 宽面板可复制 + 整句换行**：消息/来源去单行 ellipsis 截断改整句换行（`white-space:normal` + `overflow-wrap:anywhere` + `word-break:break-word` + `min-width:0` 四件套）；整条通知 `user-select:text` 可拖选复制（按钮排除），消息/来源给 `cursor:text` 视觉暗示
  - **72c 宽面板真进度条**：`NotifItem` DTO 加 `progress?/percent?` 透传 → 面板画 3px 进度行（确定态条宽 = 钳 0-100 的 percent，不定态强调色块扫动，复刻 E3e 原版 `ec88c40ec` 语义）；进度类通知图标换 `codicon-sync` + 转圈；`prefers-reduced-motion` 下停动画保静态呈现
  - **72d 重要通知自动展开**：壳 `buildNotif` 产 `autoOpen`（存在「重要（失败/警告/带按钮/长驻/进度）且未读」的通知，且面板当前关着）→ 池 `StatusBarZone` **false→true 边沿触发**开面板（持续 true 不反复、手动关掉不会被同一条弹回）；`setToastsSuppressed` 语义改「面板开合镜像」并更名 `setNotifPanelOpen`（原「隐藏窄卡」语义随小卡删除失效）；成功/普通 info 照旧安静自消
  - 新增单测 `notif.test.ts`（16 例：进度透传/percent:0 边界/图标替换/autoOpen 五类重要 + 已读 + 面板已开 + 回落）
  - 实机：CDP 验收（无小卡 / 无重叠 / 重要自动展开 / 可复制 / 进度真动）；`npm run check` EXIT=0

## v0.1.26（2026-09-10）

- **feat:E6#71g-j 安装失败反馈收尾——toast 主动作真触发 + 恒全显 + 真进度条 + 失败通知长驻**
  - **71g [重试]不再失效**：marketplace 命令组（enable/disable/uninstall/retryInstall + gear 菜单）注册自 index.tsx 模块顶迁 **marketplaceShared 模块底 `ensureMarketplaceCommands()`**（幂等 guard）——本模块被全部市场池面 import（侧栏已装/禁用/内置、探索、详情、落地页）+ 壳 glob loader 执行 marketplace entry 时也 import → 注册随**任一市场视图激活**即生效，安装失败 toast [重试] 落点自给自足，不再依赖落地页标签打开（此前详情页触发失败时壳 CommandRegistry 占位缺失 → console.warn no-op → 点 [重试] 无反应——实机 bug 根因）
  - **71h toast 恒全显 + 可复制**：删除折叠两态（chevron/expanded）——详情行（来源 + 动作钮）有内容即渲染；消息/来源 `user-select: text` 可拖选复制；长诊断整句换行全可见（`.toast-message` white-space:normal + overflow-wrap:break-word，单行截断拆除——长错误原文不再吞字）
  - **71i 安装进度条成真**：进度 toast 更新携 0-100 **真百分比**驱动确定进度条（下载段 Content-Length 真值）——percent 链 `pool preload update(msg, percent)` → `updateNotification` 第三参 → `toast.percent` → 池 fill 宽（钳 0-100）；不传 percent = 回不定态扫动动画（校验/解压段），数字仍在消息文案；update/cancel/finish 三方法 handle 契约
  - **71j 安装失败通知长驻**：toast `persistent` 旗标 → ttl:0 不自动消失（等用户决定/手动 ×），仅市场安装失败 error 落 persistent；常驻上限 `TOAST_PERSISTENT_CAP=5` 顶掉最老常驻（不碰自动消失 toast）；成功/info 自动消失不变
  - 实机：CDP 32/32 DOM 断言全绿（确定条 62% style+实际宽、去 percent 回扫动画名、越界钳 100、详情行动作钮恒显无 chevron、长文换行无溢出可选中、error 8s 自消 vs persistent 长驻、info 6s 自消、6 推只留 5 顶 #0 保 #5 含淘汰旧长驻）+ 5 张截图存档；`npm run check` EXIT=0（132 文件/1737 测试）

## v0.1.25（2026-09-09）

- **feat:E6#71c 安装确认弹窗归位壳 Dialog + 富内容槽 + 三确认归一**（0.1.24 实机 bug：市场自绘安装确认卡左上角贴墙、无全屏遮罩）
  - 🔥 壳 DialogHost 加可选 `content:{pluginId, renderPath, payload}` 富内容槽（[poolDialog.ts](src/core/types/pool/poolDialog.ts)）——present 时替代 title/message/默认按钮渲染，弹窗机制（居中/遮罩/Esc/Tab 焦点锁/点遮罩取消）不变；内容 = 插件视图经 `PluginComponent` 挂载（仿 FloatingPanel 声明寻址范式，壳零新增基建、核心无知）；payload 不透明序列化载荷随打开参数过壳→回池结构克隆，无跨 bundle 会话 store
  - 新 API（向后兼容可选）：`linkdesk.dialog.confirmContent({title, message, pluginId, viewId, payload})`（[DialogService.ts](src/core/services/ui/DialogService.ts) 内部走既有 renderer 结算回路，渲染器未注册兜底 window.confirm）`+ dialogHost.current()` 取数口；一条 IPC 通道 `dialog:confirmContent`（channels + PROXY + preload 双侧 + IpcBridgeHandler）
  - 市场迁移（plugin 1.0.3→1.0.4）：DetailView 自画 OverlayPortal mpd-confirm 整删 → `confirmContent` 富确认；ConfirmInstall.tsx 新视图迁入 content 槽（卡片排版/按钮仍市场自画，对标 VS Code「对话框壳、内容插件定」）；卸载/降级维持纯文字壳 confirm——装/卸/降级三确认共用同一 DialogHost 容器
  - 实机：CDP 富确认卡居中（`.dialog-host-panel` rect 居中）+ 全屏遮罩 + Tab 循环 + Esc/点遮罩关不误装 + 确认安装真装闭环；`npm run check` EXIT=0（132 文件/1730 测试）

## v0.1.24（2026-09-09）

- **fix:E6#70d 说明区页内 `<video>` 全屏修复**（0.1.23 回归——点全屏首点无效需二次点、全屏态困死退不出）
  - 🔥 根因两层：① MarkdownView 把 components override（video/img/source）字面量写组件体内 → 窗口一变尺寸重渲染即换函数引用 → react-markdown 元素 type 变 → `<video>` 被 React **重挂** → Chromium 即时终结元素全屏 → 首点全屏被踢出（「整窗先全屏、视频没变」）；② 池 WebContentsView 是全屏桥盲区——Electron 默认把宿主窗拉进原生全屏但池 bounds 不随动（视频只盖旧视口）+ 帧窗自绘标题栏只懂最大化、□ 对全屏态是 maximize() no-op → 用户被困
  - 修复：MarkdownView components 提模块层 `makeComponents(assetBase)` + `useMemo` + 整组件 `memo`（窗口 resize 不再重挂视频，首点即稳定提交全屏——[MarkdownView.tsx](src/components/shared/markdown-view/MarkdownView.tsx)）；window-manager 全屏桥四条监听（enter/leave-full-screen × enter/leave-html-full-screen）——进全屏即时重铺池 bounds + 450ms settle 兜底过渡竞态，元素退出强制还原宿主窗（防被困——[window-manager.ts](electron/windows/window-manager.ts)）；main.ts 逃生口——全屏态点 □ = `setFullScreen(false)` 还原窗口（[main.ts](electron/main.ts)）
  - 实机：CDP 首点 round-trip fs:true 池铺 1920×1080、退出还原 1400×900；用户手测「一次点铺满 + 退出一次还原 + 有声音」确认无误；`npm run check` EXIT=0（128 文件/1692 测试）

## v0.1.23（2026-09-09）

- **feat:E6#70c + E6#70d 详情页说明区媒体画布·封面外链视频 + 页内真播视频**（README 外链转系统浏览器、`<video>`/mp4 页内可播）
  - #70c 外链 window-open 路由：新建 `setupExternalLinkRouting`（electron/windows/external-links.ts）全局 `web-contents-created` 挂 `setWindowOpenHandler`——https?/mailto → `shell.openExternal` 交系统默认浏览器并 deny、其余协议一律 deny（消灭 Electron 默认「裸 BrowserWindow 载外部页」）；30.6a 既有 `<a target=_blank>`（GitLens 式封面外链）天然吃到此路由，零额外消费点
  - #70d MarkdownView 页内媒体：消毒 schema 扩 `video/figure/figcaption` + `source`（defaultSchema 加白名单，script/事件属性/javascript: 剥除不受影响）+ video/source override——src/poster 相对路径经 `assetBase` 落「被查看插件包内」、`controls` 强制给、`preload` 顶格 metadata、**`autoplay` 消毒层剥 + 组件双保险**（打开说明绝不自动播）
  - #70d 协议层 🔥 Range/206 根因修复（electron/plugins/protocol.ts）：Chromium 媒体加载器以 `Range: bytes=0-` 探测，原 handler 忽略 Range 回 200 全长且无 Content-Length/Accept-Ranges → `MEDIA_ERR_SRC_NOT_SUPPORTED` → 补单段 Range 解析 + `206` + Content-Range/Content-Length/Accept-Ranges；非媒体不带 Range 走 200 全长补齐头部（图/脚本零回归）；mime 补 `.mp4/.webm/.m4v`
  - 实机 CDP：serial-monitor 详情说明区 `<video controls>`（用户临时 mp4 素材）readyState=4、play() 后 currentTime 走 = 页内真播；window.open file:/data:/about:blank 全 deny、无裸 Electron 新窗；验完临时素材撤净

## v0.1.22（2026-09-09）

- **feat:E6#70a 详情页说明区媒体画布·静态图链路打通（README 相对图显形）**
  - MarkdownView 加 `assetBase?` prop：说明渲染注入「当前被查看插件」→ README 里裸/相对路径图解析成 `linkdesk://{插件}/…` 包内资产并真加载（纯数据注入零插件名；仅 https:/linkdesk: 放行、无 assetBase 保旧行为零回归）
  - DetailView 仅已装读包 README 注入 assetBase；远端 readmeUrl 不带（诚实不显）
  - SDK 打包器自动扫 README 引用的包内资产随包（`![]()`/`<img>/<video>`，copyFileInto isWithinRoot 守卫）
  - 6 只已嵌封面插件 bump + 随包 zip 重建（editor 1.0.4 / file-tree 1.0.3 / python 1.0.3 / settings 1.0.3 / serial-monitor 1.0.6 / marketplace 1.0.2）
  - 实机 CDP：设置 + 串口监视器 详情说明区封面真显（linkdesk://…/cover.svg naturalWidth=640）

## v0.1.21（2026-09-09）

- **feat:E6#69 图标身份分工·改向批——三图模型（Type-2 身份图 / Type-1 界面剪影 / 文件类型图）落地**
  - #69a/#69c 插件身份 Type-2 彩色图：editor/python/lang-defaults/theme-aurora-glass/theme-terminal 单 `icon`（回退自动）、serial-monitor/settings/file-tree/marketplace 双字段（Type-1 剪影 icon-bar.svg / Type-2 icon.svg）——市场侧栏行/详情头与标签栏视图标签同图；#68 封面 marketIcon 语义废止（cover 移 README，零市场消费）
  - #69d Type-1 剪影：图标栏插件 icon 字段 = 单色线稿（壳只读 icon 不变）
  - #69f/#69g 共享身份/文件类型裁决：`pickIdentityArt`（marketIcon ?? icon ?? 默认彩色块）+ 共享 `FileIconResolver` 上移 @linkdesk/ui 单源码——文件标签与文件树同源文件类型图、随 `app.iconTheme` 即时重算（config listener → layoutVersion）
  - 市场行≈32 / 详情 128px 双位同图；schema 三副本 icon/marketIcon 描述改向 + 图标文档 06-图标.md 重写（三图模型 + 第三方最小契约）
  - 9 只插件随包 zip 重建（SDK 6 + pack 3）+ 插件版本 bump；文件/标签/市场双位同图实机 CDP 验证


- **feat:E6#66 + E6#67 市场图标系统收尾——默认展示图规定 + 双图标字段**——市场展示位显「展示图/封面」大框、无配图插件落统一默认封面
  - #67 双图标字段：`PluginManifest` 顶层加可选 `marketIcon`/`marketIconSource`（形状照 icon/iconSource；值 = 包内 svg 资产相对路径、source 省略 → linkdesk:// 路径推断）——`icon` = 界面小图标（壳只读它，**零壳改动**）；`marketIcon` = 市场展示图 cover art（可复杂 640×640）。schema 三源副本 + contracts:gen additive 零漂移 + PluginListSubset/list() 投影带两字段
  - #66 默认展示图：市场无配图插件由 📄 emoji / codicon-symbol-misc 兜底 → 统一默认封面（A 家族「dock 装入」640×640 自含 SVG，data-URI 内置于市场插件，零构建耦合）——市场层唯一裁决 `display.ts`（展示位 = marketIcon ?? icon ?? 默认封面；行内位 = icon ?? marketIcon ?? 默认封面，28px 不硬压 640 封面；恒返有效 descriptor → 消费点零分支，ExtensionItem/ExploreView/DetailView/DisabledListView 全接）
  - 详情展示位 52 → 96px 方框（2026-09-09 用户拍板）；`.mpd-icon-codicon` 占位与 DetailView codicon-symbol-misc 分支删除
  - SDK 打包器随包拷 marketIcon 资产；serial-monitor 验证样本声明 marketIcon=resources/cover.svg + 1.0.2→1.0.3 + 单只 zip 重建（含 cover 落 bundled-plugins）
  - 实机 CDP 9222：串口监视器 图标栏/行 = icon.png 小图标、市场详情头 96px = cover.svg「串口的窗」——双图标各就各位；Python（无配图）详情头 96px + 列表行显默认封面（非 📄/几何）；theme-aurora-glass 行显 icon.svg；壳回归干净
  - 版本 0.1.19→0.1.20（0.x 向后兼容新增走 patch 位；#68 铺剩余封面仍暂停待用户点名）

## v0.1.19（2026-09-09）

- **fix:E6#65 市场图标系统批次一·数据通道修复（14 档案 A/B）**——市场拿到各插件现有图标（serial-monitor/settings 彩 PNG、marketplace/aurora/zones SVG、file-tree lucide 立显）
  - 根因：`list()` IPC 序列化子集（PluginListSubset）当初收窄为 8 字段时把 `icon`/`iconSource` 删了（types.ts 注释自认「与 list 7 字段对齐」）→ 行组件想传也没得传 → 市场恒 📄 emoji；详情页 `iconManifest` 又只读市场目录 `entry`，无目录条目即 `codicon-symbol-misc` 几何兜底
  - 修三处：① 数据通道——`PluginListSubset` + `IpcBridgeHandler/pluginManager.ts` list() 投影补 `icon?`/`iconSource?`（contracts 重生成）；② 行组件——ExtensionItem 把 `manifest` 传入 `PluginIcon`（此前恒无 manifest）；③ 详情回退链——DetailView `iconManifest` 补「已装 manifest.icon → 兜底」第二环
  - 实机 CDP 9222：list() 22 插件 icon/iconSource 随行实证（serial/settings/marketplace/aurora/zones/file-tree）；已装行 串口监视器→IMG、悬浮面板→codicon、极光玻璃/分区纹理→IMG（修复前全 📄）；详情头串口监视器走 manifest 回退显 IMG 而非几何符号
  - 版本 0.1.18→0.1.19（0.x 向后兼容修复走 patch 位）

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
