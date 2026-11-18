# 内置配置组图标声明（设置页导航本体组四枚图标：设计 → 声明 → 同笔透传）

> 立案：2026-11-07，拆自原「设置页入口图标」04 案——**用户二次拍板**：本体组图标需要设计、不配临时 codicon（「到时候专门开个任务设计，随着新版本发布顺便显示」；软件发版一次太慢，⛔ 不为它单独发版）。插件侧先行已拆 05。
> 用户口径「内置配置项的图标」＝本档「内置配置组」：设置页左侧导航**本体自注册四行**——通用 / 主题 / AI接入 / 默认打开方式。
> 状态：🟢 **已落码待攒批出货（2026-11-18）**——B 方案看稿拍板 · 壳侧全链落码 · `npm run check` 门禁逐腿收口中 · npm 五轴已发（contracts 0.1.45 / plugin-sdk 0.1.93 / ui 0.2.59 / plugin-docs 0.1.77）· settings **1.0.42** 已发＋**官方目录外科式收录**＋**出厂种子已追新**。归属：**04**（壳＋作者面 npm ＋ settings 消费端三面合案）。⛔ 待办 = dev 实机验收（四行亮/暗不破格）＋壳 0.2.53 攒批出货。

## 一、任务构成（三件同笔，缺一不全亮）

1. **前置 · 专项设计任务**：四枚图标定稿（用户看稿拍板）。判据：与插件组彩色 marketIcon 形成「本体/插件」天然区分；codicon 终稿或自制 SVG 由设计裁决——自制走 `getAssetPath`（硬约束 12），SVG 注意 XML 合法性（破图静默）。
2. **壳声明**：`src/App/startup.ts` 本体组声明补 `icon` 字段。三组 registerConfiguration 直加；**默认打开方式 = uiHint 伪组**（`SettingsView.tsx:106` 组身份按提示词认），声明位另核——四组逐一落实别漏。
3. **类型/序列化同笔**：宿主组声明类型补字段 ＋ IPC 序列化面确认 `icon` 透传（作者面 schema 无关——本体组不进作者 schema）。落位判据 A：消费代码在 05 案（空消费）、渲染能力在共享件 PluginIcon——本任务只出数据。

## 二、契约（与 05 案双向钉死）

- **值形态（2026-11-18 拍板）＝ IconRegistry 共享图标名**，不是直连地址——壳以宿主身份 `registerIcon` 把四枚「内置默认图标」登记为默认项（definition 指向盘上 SVG 资产，`getAssetPath` 可达）；本体组 `icon` 字段填**图标名**，消费端（`PluginIcon`）补一步「按名查 IconRegistry」（05 侧空消费只透传字段、不受影响）。三层替换口全占：**默认皮肤在盘上 ＋ 图标主题插件成套覆盖（IconRegistry 现成，`app.iconTheme` 已有）＋ 设置页本就可整套替换**。
- 🔴 codicon 全名／绝对 URL 是**默认项 definition 引用的资产形态**，不是字段值形态（原「codicon-xxx 或 linkdesk:// 地址」契约自此改写）。
- 「用户手改安装目录文件」＝**副产品，不当正式契约**（壳更新覆盖文件、改了白改）；契约级替换 = 图标主题插件 ＋ 换设置插件（2026-11-18 拍板）。
- 字段名 `icon`。消费方**已随 settings 1.0.41 上线等字段**：[05 settings-侧栏入口图标（已归还插件仓）](https://github.com/Encaron/linkdesk-plugin-settings/tree/main/docs/03-%E4%BE%A7%E6%A0%8F%E5%85%A5%E5%8F%A3%E5%9B%BE%E6%A0%87)。
- 改字段名/值形态 = 必须同笔改 05 案空消费（两处一起动）。

- **设计方向（2026-11-18 出稿，真源钉桩 settings 仓 `a489870`）**：区分轴＝**插件＝有块·彩色·不随主题；本体＝无块·墨线·随主题**——插件 marketIcon 是 48×48「渐变块＋白线符」货架语言（「X 的窗」品牌块）；本体消费位只有 **16×16**（`SettingsView.css:135` 图标位）且走 `--icon-ink` 墨色阶梯（mask＋currentColor，亮暗自动翻）。**语义定稿**：通用＝滑杆（⛔ 齿轮——会撞设置插件自己的齿轮身份图）、主题＝调色盘、AI 接入＝四角星芒＋伴星、默认打开方式＝文件夹＋外指箭头。**三方案**：A 墨线正典 / B 墨线＋实心点睛 / C 品牌六边形（呼应程序图标，16px 最挤）——待用户看稿拍板。设计图＝[mockups/01-设计图-本体组四枚图标.html](mockups/01-设计图-本体组四枚图标.html)（迷你导航窗照产品源 1:1 复刻：nav 200px／行 padding 6px 20px／图标 16px 圆角 4px／active 左 2px accent 条；调色板照 theme-defaults defaults.json）；SVG 资产 16 枚在 `mockups/svg-A|B|C|D/`；**生成器 `mockups/gen.py`＝几何单源**（改稿改它重跑，⛔ 别手改 SVG）；impeccable detect 三条意见已处置（网格底纹＝检视豁免场景；「贴边」warning＝产品真身如此，拟真优先）。

## 二bis、落码实录（2026-11-18 · B 方案拍板后）

**架构（按 2026-11-18 两拍板落地）**：值形态＝IconRegistry 共享图标名（`app.group-*`，`ldk-` 同族宿主命名空间）；壳启动期 `registerHostGroupIcons()` 以宿主身份（`pluginId undefined`——appearanceOwnership 裁决永放行、插件后到撞名走「宿主占位→host-reserved 拒」）登记四枚默认项（definition＝盘上 SVG 资产 URL）；四组配置贡献声明 `icon` 字段（startup/appearance/aiBridge/fileAssociations）；`iconSource` 契约枚举补 **`"shared"`**（schema 里早已承诺的作者引用契约本版补全）——settings 导航按名查快照（随 `iconTheme:changed` 广播进池、池 preload 回放缓存兜晚订阅）→ `PluginIcon`（@linkdesk/ui）按名查 `sharedIcons` 注入面渲染 **ink 剪影**（mask＋`--icon-ink`，VS Code product-icon 语义）。

**⚠️ 改判登记：「1.0.41 零再发版」承诺作废**——2026-11-07 立案时契约钉「codicon 名或 linkdesk:// 地址」，空消费按两态写死 ⇒ 「壳出货即自动亮、插件零再发版」；2026-11-18 D1 拍板改为**注册表图标名**（可被图标主题成套覆盖、替换口三层全占），解读新形态的代码必须落 settings ⇒ **settings 1.0.42 成为本拍板的必然代价**（一次性能力装进：此后任何插件声明共享图标名走同一段代码，不再随插件更新）。本条为与 settings 仓 CHANGELOG 1.0.42 同笔的改判记录。

**sharedIcon 保留面账家族（host-reserved.json）未扩列的判断**：这四个名字**恒被宿主启动期占用**——插件后到撞名走「occupied＋prevOwner=undefined→host-reserved 拒」，运行时保护密不透风；账家族防的是「**空位**被占」，对恒占位名字无增量 ⇒ 不扩列（如将来出现「宿主保留但暂不注册」的图标名，再扩列）。

**发版链读数（2026-11-18）**：npm 五轴同批——contracts **0.1.45**（`icon` 字段＋7 处 `iconSource` union ＋ `iconSource:"shared"`）· plugin-sdk **0.1.91→0.1.93**（⚠️ **0.1.91 schema JSON 有语法伤**：插字段漏逗号、`check-plugin-schema-sync` 只比拷贝不验语法＝假绿，0.1.92 当即重发订正；0.1.93 补 ui-surface 账本副本）· ui **0.2.57→0.2.59**（0.2.57 tarball 带坏括号测试件、0.2.58 带 barrel 计数注释——两次重发均非功能变化；⚠️ 固化动作：**发版前当场 `json.loads` schema**）· plugin-docs **0.1.77**（随作者文档四篇＋ui-surface since 表重生成）。settings **1.0.42**（plugin.json＋package.json＋地板 **0.2.53**＋CHANGELOG 五行）已 build→commit `41e2170`→push→**publish**（Release v1.0.42＋asset）→**官方目录外科式收录**（只动 version/downloadUrl/size/publishedAt/minAppVersion ＋ versions 头部插入 1.0.42，历史 35 条逐字段原样，回读 36 条/changelog 6604→7370 只增不减）→**种子追新**（settings 1.0.42 落箱）。

**CDP 实机诊断轮（2026-11-18 · 隔离实例＋LINKDESK_USER_PLUGINS_HOME）**：首验「四行不亮」抓出**两个真 bug**，均已修复——① **配置出口投影剥字段**：`getConfigurationContributions` 的 IPC 投影只显式带 title/subtitle/groupDescriptions/properties ⇒ `icon` 静默丢失（修＝投影补一行 `icon: contrib.icon`，IpcBridgeHandler/configuration.ts）；② **default 图标主题不广播**：`applyConfiguration("app.iconTheme", "default")` 不经 onApply ⇒ 启动广播缺失 ⇒ 池永远收不到 sharedIcons ⇒ 四行永不亮（修＝载荷拼装抽成 `IconRegistry.broadcastIconThemeChanged()`，onApply 与 AppInitializer 启动段同源无条件调用）。修后 CDP 复测：**四行全部渲染 ink 剪影**——`SPAN.plugin-icon--ink`、`mask=url(…/assets/icons/config-groups/*.svg)`、`backgroundColor=color(srgb 0.831…/0.78)`＝**--icon-ink 真值**、16×16；插件组 IMG 彩色图标不受影响。**环境附带发现（与本链无关，记备考）**：壳仓 vitest 在「被测文件位于本仓」时 worker 引导必炸（裸 minimal 复现；npm ci 干净树／版本降级／独立 cacheDir／npm env 全排除，settings 仓同栈全绿）——机器态残留嫌疑，重启机器为最后未试解。**顺手修**：settings 仓 `mapSegmentedOptions.ts` 存量类型隐患（依赖追新 TS 收紧后暴露——对象形态用数字下标索引本来就拿不到档，行为等价收窄到数组形态）。**机器环境**：壳仓 node_modules 树损坏（`npm ls` arborist 报 `edgesOut` 空、vitest 268 文件全量收集炸——与本案改动无关，疑似 C 盘清理波及），`npm ci` 整树重建中。

## 三、验收判据

1. 0.2.53 dev 实机：已装 settings 插件**零再发版**四行图标全亮；亮/暗＋ui-scale 不破格。
2. 声明缺 icon 的组（含未来新增）维持纯文字不空位（空消费兜底回归）。
3. `npm run check` 全绿（含 R2 宿主声明落位腿）。

## 四、待办

- [ ] ~~设计任务立项~~ ✅ **设计稿已出（2026-11-18）→ 四枚定稿待用户看稿拍板（挑 A/B/C/D）**
- [ ] 壳侧四枚内置默认图标 `IconRegistry.registerIcon` 登记（definition 指向盘上 SVG）＋ `startup.ts` 本体组 `icon` 字段填图标名 ＋ 类型/序列化同笔 ＋ `PluginIcon` 补按名解析
- [ ] 随 0.2.53 攒批出货 → 05 案实机复核自动亮
