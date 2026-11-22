# AI-执行清单 —— 进度唯一真相源

> **回勾纪律**：一格做完把 ⬜ 改 ✅（带日期）；⛔ 数字只写文末「总结」表；本清单**不写做法**（做法在 [14-任务档案/](14-任务档案/)，收口写 [交接.md](交接.md)）。
> 格总数：棒 0（T 系 T1–T12，见 Toast 任务档）＋ R4 五十五格（0.1–5.8＋2.8–2.9，其中 2.8–2.9 在棒 3b）＋ 验收 4 ＋ 发版 3＝62 格。

## 棒 0 · 前置 青 Toast（T 系——回勾在 [../../已落地/底部Toast轻提示/04-任务清单.md](../../已落地/底部Toast轻提示/04-任务清单.md)，此处只记状态）

- 详案 = [14-任务档案/R4-棒0-Toast.md](14-任务档案/R4-棒0-Toast.md)（正典引自 ../../已落地/底部Toast轻提示/）
- 状态：✅ **已收口 2026-11-20**（T1–T13 落码＋Q1–Q4/Q6 测试＋D1–D4 文档同笔；壳 0.2.55 攒批；git mv 已随收口执行。实机 Q4 手工/CDP 四条待真机——见交接.md 棒 0 段遗留）

## 棒 1 · 批0 地基（详案 = 14-任务档案/R4-批0-地基.md）

- R4-0.1 ✅ 2026-11-20 plugin.schema 分类字段（四份拷贝同笔同文）
- R4-0.2 ✅ 2026-11-20 marketplace.schema v2 全字段（含 publish 根级保全修复＋category/categories 透传）
- R4-0.3 ✅ 2026-11-20 目录仓 v2 骨架（真实三件过新 schema 实测）
- R4-0.4 ✅ 2026-11-20 三方对账测试（腿①③ SDK／腿② 插件仓版本感知）
- R4-0.5 ✅ 2026-11-20 向后兼容矩阵（「其他」桶分组判定随棒 3——数据前提已钉）

## 棒 2 · 批1 壳三刀（详案 = R4-批1-壳.md）

- R4-1.1 ✅ 2026-11-20 I14 图标键（#18）——`{pluginId}.openTabOnIcon` 读数进 icon:selected（默认关零行为差异）
- R4-1.2 ✅ 2026-11-20 I16 installFromDirectory（#20）——双腿（文件夹/离线包）五类回执，落 {userData}/plugins
- R4-1.3 ✅ 2026-11-20 I21 licenses API＋安装门（#24 壳侧）——主进程验签/权益存储/机器指纹＋licenseRequired 门

## 棒 3 · 批2a 解析层（详案 = R4-批2-服务层.md）

- R4-2.1 ✅ 2026-11-20 marketCatalog v2 解析——根级 sources/collections/categoryRail 进解析面 · 分类封闭名单在册校验（警告不吞）· vendors.json→vendorId 注入 · rail 顺序消费 · #10 源记录三形态读兼容 · K5 回落链（plugin.json 合成 1 条；⚠️ authors/ 解析延至棒 7）
- R4-2.2 ✅ 2026-11-20 三源合并序（官方→收录→用户；同 id 高版本胜、平手先到者胜）＋冲突回执 deduped＋单份状态（realmSlot 既有唯一属主，零第二份）
- R4-2.3 ✅ 2026-11-20 I5 对账测试扩 v2——解析/归桶/厂商/K5/合并回执/源记录/旧目录回落（新增 27 例）
## 棒 3b · 批2b 官方插件全量分类适配（详案 = R4-批2b-官方适配.md）

- R4-2.8 ✅ 2026-11-20 18 仓 plugin.json 补 category＋categories（04 §5.2 照抄；theme-terminal 表未列按桶语义补 themes/color-scheme）＋ schema description 写全名单（四份拷贝同笔）＋ marketplace 1.2.1 补 productivity
- R4-2.9 ✅ 2026-11-21 18 仓逐仓 PATCH 发版＋官方目录收录（8cf434d）＋种子追新 6/6 新鲜；**真机分类读数已由棒 6 收口**（开发 3/文档 2/硬件 1/网络 0/效率 2/主题 9/阅读 0/娱乐 1/其他 1——其他桶 1 条为第三方 `my-cool-plugin` 未声明 category，机制 4 诚实落位；18 官方全归位、warnings 0）。棒 3b 自有格，由棒 3b 执行者补勾（2026-11-21 调度台核对）。

## 棒 4 · 批2b 服务面（详案 = R4-批2-服务层.md）

- R4-2.4 ✅ 2026-11-20 I9 偏好持久化——`marketplaceShared/uiPrefs.ts`：pluginState `ui.prefs` 六键＋坏值逐键回落＋合并写幂等；⛔ 不进 contributes.configuration
- R4-2.5 ✅ 2026-11-20 I15 命令面 13 条（#19）——照 09 §三·补（既有 addSource 共 14 行）；storeNav 跨进程意图信箱＋openPlugin pinned/label＋回执边界如实（见交接）
- R4-2.6 ✅ 2026-11-20 I7 探索双击固定——ExploreView/CatalogRow（照已装列表同款；catalogRowSmoke 补双击断言）
- R4-2.7 ✅ 2026-11-20 I8 删死声明——plugin.json `tabBehavior:{singleton:true}` 整块删（grep 0 命中）

## 棒 5 · 批3a UI 原语件（详案 = R4-批3-UI.md）

- R4-3.1 ✅ 2026-11-20 src/ui/ ViewSeg/SortChips/EmptyState（I10）
- R4-3.2 ✅ 2026-11-20 Badge/statusTag/AvatarHue
- R4-3.3 ✅ 2026-11-20 CornerTag/moreMenu/动作钮收编

## 棒 6 · 批3b 浏览面（详案 = R4-批3-UI.md）

- R4-3.4 ✅ 2026-11-20 商店骨架＋rail＋tabbar（#4/#5）
- R4-3.5 ✅ 2026-11-20 首页七板块＋目录三态
- R4-3.6 ✅ 2026-11-20 分类页/搜索/榜单
- R4-3.7 ✅ 2026-11-20 内容热更新 UI 壳（#12 桩）

## 棒 7 · 批3c 作者域（详案 = R4-批3-UI.md）

- R4-3.8 ✅ 2026-11-20 作者卡三边界（`authors/AuthorCard.tsx`；`services/authors.ts` 白名单解析＋authorId 聚合）
- R4-3.9 ✅ 2026-11-20 作者店声明驱动＋门店卡（hero 置顶/inlineHero/sections/scope:self/glow:false/按分类浏览硬保留）
- R4-3.10 ✅ 2026-11-20 作者列表＋跳转字（排序/平铺⇄详细/记忆；分类页 authorId 预过滤＋显示全部）
- R4-3.11 ✅ 2026-11-20 声明提示＋vendors 官方✓接入（重复大屏/未知板块/缺合集→来源页计数；vendorId 徽标）

## 棒 8 · 批3d 库＋来源（详案 = R4-批3-UI.md）

- R4-3.12 ✅ 2026-11-20 库视图＋记忆（统计/搜索/四筛选/排序分组/可更新置顶/已购未安装/全部已读）
- R4-3.13 ✅ 2026-11-20 编辑模式批量（复选框默认隐藏/全选当前筛选/批量停用卸载/退出清空）
- R4-3.14 ✅ 2026-11-20 来源管理页（官方锁定/作者分组折叠/↑↓限同作者/刷新/停用/移除确认/本地组）
- R4-3.15 ✅ 2026-11-20 I17 加源弹窗＋本地安装流程（网络先拉后入＋K5 模板链接；本地 plugin.json 预览→installFromDirectory＋localInstalls）

## 棒 9 · 批3e 详情页（详案 = R4-批3-UI.md，棒 5–10 共档）

- R4-3.16 ✅ 2026-11-20 详情标签 pinned+label 全调用点（`services/openDetailTab` 唯一入口；依赖跳转同一条）
- R4-3.17 ✅ 2026-11-20 三页签（概览/功能/更改日志；日志 5 版裁口＋已装版本转绿）
- R4-3.18 ✅ 2026-11-20 右栏四类字段（本机事实/抓取型/声明型/兼容性唯一占位；没有不画行·不够标黄+安装置灰；来源页目录警告）
- R4-3.19 ✅ 2026-11-20 I13 文字溢出（标题/副标题 2 行·说明 3 行·按钮单行；DetailHeader＋detail-header.css）

## 棒 10 · 批3f 付费流（详案 = R4-批3-UI.md）

- R4-3.20 ✅ 2026-11-20 付费六态（DetailActionBar 付费分支＋试用说明行＋许可徽标上标题行；判定与卡片 resolveAction 同构）
- R4-3.21 ✅ 2026-11-20 许可弹窗（粘贴即时验签 licenses.verify，公钥取作者块 publicKey）＋buyPage（openExternal；无 licenseUrl 不渲染外跳钮）
- R4-3.22 ✅ 2026-11-20 I12 画廊视频渲染（controls/preload=metadata/无 autoplay）＋库「已购未安装」分区随验签收敛

## 棒 11 · 批4a kit（详案 = R4-批4-作者侧.md）

- R4-4.1 ✅ 2026-11-21 K1 包骨架 `packages/marketplace-kit/`（四命令 CLI；第六根作者轴进 check-npm-release＋root check typecheck 腿）——**接棒 8 交办：SDK collectionDecl 补 glow/more → SDK 0.1.95 随本棒 publish**
- R4-4.2 ✅ 2026-11-21 K2/K3 对账＋错误码——schema 字节同源＋类型 key-diff＋市场警告码六套同码＋可用清单进报错；⚠️ 市场仓第三腿挂棒 12（红线「市场插件仓本棒不碰」报备，见交接）
- R4-4.3 ✅ 2026-11-21 K4 init 三形态（L0 零配置不写 marketplace.json／L1+config／L2+authors）——产物零改动过 validate（空集合法）；L0 陷阱腿钉死
- R4-4.4 ✅ 2026-11-21 K12 keygen/sign-license——Ed25519 照壳 license-verify-service 契约；与壳 verifyLicenseKey 真实联测 5 例

## 棒 12 · 批4b 发布轴（详案 = R4-批4-作者侧.md）

- R4-4.5 ✅ 2026-11-21 I18/K8 publish v2——SDK 读 marketplace.config.json 写 authors/＋collections/（config 为准）；市场侧同笔 collections **两读**（根级对象=inline／字符串=文件夹引用，有引用才拉文件、v1 零探针）；同版本重跑由既有 tag 断言罩住
- R4-4.6 ✅ 2026-11-21 K6 作者文档第 23 章中文（分类封闭名单全表四项必含＋菜谱＋kit 使用＋付费＋收录）
- R4-4.7 ✅ 2026-11-21 K10/K10b 第 23 章英文镜像＋FILENAME_MAP/双 README 索引＋plugin-docs 0.1.78 重生成（三道文档门禁绿）
- R4-4.8 ✅ 2026-11-21 #7 AI 面——sync-plugin-agents 市场仓注记＋重生成；目录仓 AGENTS.md 新建（收录规程指针，正文随棒 13）
- 交办 ✅ 2026-11-21 K2 第三腿落市场仓（kit 白名单↔categories.ts 对账，kit devDep 版本感知）；versions[] 裁决＝目录全史合法不裁（09 §五回笔）

## 棒 13 · 批5a 收录（详案 = R4-批5-收尾.md）

- R4-5.1 ✅ 2026-11-21 I19/K9/#22 收录 PR 模板双表单＋CI 五腿（scope/URL/schema/id/vendors）＋每周复验 schedule——脚本本地可跑（目录仓 c645a02 未推送；本地 8 场景取证全绿）
- R4-5.2 ✅ 2026-11-21 K11/I23 AI 认证审查规程——目录仓 AGENTS.md §5 落正文（待审清单命令／四要素报告／代批边界 ⛔ 自行合并；规程每步带命令行）

## 棒 14 · 批5b 质量轴（详案 = R4-批5-收尾.md）

- R4-5.3 ✅ 2026-11-21 I2 性能——`ui/ChunkedReveal` 分块渐进（OrderedCards/LibraryView 三视图接线；命中链 useMemo 化）＋六卡 memo＋封面 lazy 既有核实；CDP 计帧真机归棒 16
- R4-5.4 ✅ 2026-11-21 I3 i18n——zh 值表 56 键真值（7 主桶 zh 占位实修）＋localizeCategory 三级回退（category→tag→slug）＋字典↔名单对账门（4 例）
- R4-5.5 ✅ 2026-11-21 I4 兼容——未知根键容忍腿（旧读者读新目录机械锚）；三形态读侧既有测试核实；双向实机归棒 16

## 棒 15 · 批5c 反馈轴（详案 = R4-批5-收尾.md）

- R4-5.6 ✅ 2026-11-21 #12 内容热更新——contentWatch 重校验层（触发面全表/退避＋限流顶档/contentHash）＋提示分层（在场 Toast 带动作/面板记录/不可见到达下次打开直接应用）＋逐键签名点集
- R4-5.7 ✅ 2026-11-21 #11 Toast 接入——「检查完成」轻反馈收进 updateCheck 服务单入口（按钮＋命令面共用）
- R4-5.8 ✅ 2026-11-21 I11/#16 SDK `<source src>` 收集＋readme-media 纯 fs 域拆分＋4 例测试；SDK 未 bump 攒棒 17

## 棒 16 · 验收棒

- R4-V.1 ✅ 2026-11-21 07 逐 data-spec 对账（12 锚点全落位；陈列板/#buyPage＝在案拍板演示物非缺项）
- R4-V.2 ✅ 2026-11-21 10 §8.1 十一条真机复验（rail 73/row/40 实测·作者店高亮清空·委托全链失败态实拍·`<source>` 机械 PASS）；真机缺陷 F3（openStore 裸 type 当插件 id）当场修——报告与登记＝16 号档
- R4-V.3 ✅ 2026-11-21 06 §七判据＋D2/D3 未退化＋K12 真机三腿（验签真入库）＋500 条目计帧 fps 60.3＋热更新真链路（常驻条在场·未静默换）
- R4-V.4 ✅ 2026-11-21 验收报告＋问题登记 F1–F8 落 **16 号档**（挂账分列：发版装机轴五腿归棒 17）

## 棒 17 · 发版棒

- R4-R.1 ✅ 2026-11-23 市场插件发版走到端（媒体丰富度，⛔ 不含作者身份）
  - 构建源 = **干净检出 `7a5d894`**（= 远端 main）；validate / verify 九段 / build（160.4 KB·10 表面）/ test 78 文件 772 例 **全绿**。
  - GitHub Release **`v1.3.0`**（tag → `7a5d894`，资产 `marketplace.linkdesk-plugin` 164273 B·`application/zip`·sha256 `397ff281…` 与本地构建逐字节一致）。
  - 官方目录 **`Encaron/linkdesk-marketplace@9323af5`**：version/downloadUrl/icon/marketIcon/readmeUrl 全升 v1.3.0，versions[] 头插 1.3.0 段；raw 读回 1.3.0。
  - `sync:bundled --latest`：marketplace **1.2.1 → 1.3.0**、theme-defaults **1.0.14 → 1.0.15**（箱内种子 sha256 = 发布资产）。
  - ⚠️ ④ 实机「检查更新真装上」：userData 里装的已是 **1.3.0 的开发构建**（与发布资产哈希不同）⇒ 目录同版、应用判定「已装无更新」，**过渡未观测**；需观测则先降回 1.2.1（安装要用户点头）。详见 `21-棒17发版交接单.md`。
- R4-R.2 ✅ 2026-11-23 npm 轴收口（⛔ 重发）
  - 六包货架 = 基线：contracts 0.1.48 / **plugin-sdk 0.1.100**（0.1.99→0.1.100：dev-host 补 4 个内容面 token，壳主题 token 加账后 npm 表面漂移，按「凡更新就发」补发）/ ui 0.2.66 / plugin-docs 0.1.84 / marketplace-kit 0.1.2 / create-linkdesk-plugin 0.1.26；`release:mark` 跑绿，基线随 v0.2.59 提交。
- R4-R.3 ✅ 2026-11-23 软件本体随批发版走到端（用户 2026-11-23 会话内授权）
  - `v0.2.59` tag **三次重打**：首轮 `da244cd76` CI 红（`--surface-ink` token 审计）→ 修 `scripts/check-token-audit.mjs` 插件面豁免；二轮 `ca2a3db34` CI 红（`packages/plugin-sdk/src/dev-host.test.ts`：壳 :root 4 个新 token 不在 dev-host 兜底集）→ dev-host 补 4 键 ＋ plugin-sdk 0.1.100 补发；三轮 `b67d0b243` **CI 全绿**。前两轮均未产出 Release。
  - Release **`v0.2.59`**（`https://github.com/Encaron/linkdesk/releases/tag/v0.2.59`）：`linkdesk-setup-0.2.59.exe` **107,733,455 B** ＋ `latest.yml`，发布时刻 `2026-11-22T17:21:59Z`。
  - **耗时实测**：第三轮从推 tag 到 Release 资产齐 **10 分 27 秒**；从首推（16:47:53Z）算总 **34 分 06 秒**（含两轮约 11 分钟的红灯返工 ＋ 本地全量门禁约 8 分钟 ＋ npm 传播等待）。
  - 旧版实机（`D:\01link\linkdesk` 0.2.57）`update.checkForUpdates` 已实机识别「有可用的更新 0.2.59」；安装动作待用户点「立即更新」/确认框。

---

## 总结（⛔ 数字只写这里）

| 段 | 格数 | 已交 |
|---|---|---|
| 棒 0 Toast | （Toast 档计数） | 0 |
| 棒 1–17 R4 | 55 ＋ 验收 4 ＋ 发版 3 | 62 / 62 |
| **总计** | — | **62 / 62 ＋ Toast** |
