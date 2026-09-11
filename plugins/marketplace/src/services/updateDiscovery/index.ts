/**
 * updateDiscovery — E6#33a 发现编排（2026-09-08 锚② 重裁：市场池首载调度；Batch F #33d 自动更新接入）
 * ——**夹内入口（聚合门面）**。E6#86（第 3.6.3 轮）feature-folder 化：原 519 行按职责拆进同名夹 `updateDiscovery/`，
 * 本文件纯再导出（marketplaceShared / DetailView / `__tests__/*` 的 import 一字不改）。
 * E6#86g（第 3.6.3b 轮）门面归位：`updateDiscovery.ts` → `updateDiscovery/index.ts`。
 *
 * 🔴 重裁依据（代码取证推翻「activationEvents:["*"] 池启动即加载」）：activationEvents 只让「壳」loader
 * 决定是否启动 import 插件 entry，对「池」零影响（池经 PluginComponent import.meta.glob + React.lazy，
 * 视图挂载才 import 插件代码）；而发现编排要推铃铛（notifications.show）与读作者源（configuration.get）——
 * 两者只在「池」preload（壳没有）。→ 发现必须落池，落点 = 市场插件池代码**首载**：任何市场池面（侧栏
 * 已装/禁用/内置、详情、主区 tab）首次挂载都经 marketplaceShared → 本模块 import →
 * scheduleStartupDiscovery()（延迟 ~10s，05 §一·四；**判不了会按梯子再试——E6#82，见 schedule.ts 头注**）。
 * 首载在「侧栏恢复上次选中（通常即市场）」或「用户
 * 首次打开市场」时到达——若本会话市场从未加载则顺延到下次加载（重裁拍板接受的代价，零壳零新面）。
 *
 * 幂等两道：本会话只调度一次（模块级 guard）；同版本铃铛只推一次（installedUpdateMeta.lastNotifiedVersion，
 * 跨会话持久——05 §二·一）。壳进程/预览也 import 本模块（marketplace entry 双进程执行）→ 无 notifications.show
 * → 不调度不跑（池门控，壳零改动）。
 *
 * 发现语义（05 §一/§二）：
 *   - 发现 = 拉目录 + 比版本，零下载零写文件（§一·五）
 *   - 本地现状 = pluginManager.list()(启用) ∪ getDisabled()(禁用) 两源合并（§一·二 owner 注）
 *   - remote 稳定版 = 条目 versions[] 首个非 prerelease（最新在前）；旧格式无 versions[] → 顶层 version 且非
 *     prerelease（§一·三/§二·四——beta 默认忽略，只看稳定版）
 *   - 唯一判定 = semver.gt(remote, local)；多源冲突已由 marketCatalog.mergeCatalogs 取高（§二·二，源变化回退
 *     按现目录比，不制造额外提示）
 *   - 无内置排除——core:true 不定义更新行为，覆盖全部已装插件（§二·三）
 *   - 有更新 → 通知中心铃铛推一条（每版本一次：lastNotifiedVersion === remote 不重推）+ 记 lastNotifiedVersion
 *   - 自愈清提醒：lastNotifiedVersion ≤ 本地 → 已追上（外部路径更新/重装的兜底），清标记（§二·一「更新成功清」）
 *   - 目录 offline/corrupt（entries 空）→ 本趟不铃不写，且**返回 null（判不了）由调度器换时间重试**（E6#82；
 *     合法空态 = 结论，返回空计划）；stale 缓存有数据照跑
 *
 * #33d 自动更新——**E6#79 恢复运转（2026-09-11 用户拍板）**：
 *   🔴 **推翻经过（动这里之前务必读完）**：#71k（2026-09-10）曾把自动更新**整体停摆**，理由写成「自动更新在你
 *     不在场时弹不出确认卡，与『每次都问』不可兼得」。**那条推论不是用户的意思**——用户 2026-09-11 当面更正：
 *     「暂时都问吧，我当时指的是那个确认安装的弹窗呀，和这个自动更新有半毛钱关系？」。
 *     确认卡管的是**手动路径**（用户点「安装」/「更新」时问一次）；自动更新是**另一条路**——勾选本身就是那次
 *     授权，不经确认卡。两条路各走各的，互不冲突。
 *     **教训：把一条规则从 A 外推到 B，不等于用户同意了 B。**（同类错误本项目已犯两次：铃铛开关、本次；两次都是
 *     AI 自洽性论证盖过用户原话。）停摆期间的产物（notifyAutoPaused + 勾选框「暂不生效」文案）已随本次删除。
 *   - auto 候选 = `selectAutoCandidates`（meta.autoUpdate===true 且未钉版本；§二·九 pinnedVersion 停旧版
 *     → 跳过，尊重手动意图）。**不推「有新版本」铃铛**——auto 已代劳，再推 = 同一件事说两遍。
 *     🔴 E6#83（2026-09-11 用户拍板）：**钉与开关互斥**——勾开关那一下先撤钉（`enableAutoUpdateAndRun`）。
 *     故本闸此后只拦「钉还在、开关从没勾过」这一类（= 用户就是要停在旧版，正确拦）；不会拦到刚勾完的插件。
 *   - 执行 = 串行跑引擎 update，url 走稳定版寻址（versionDownloadUrl——§二·四 auto 只看稳定版，beta 不自动装）。
 *   - **成功 → 发一条汇总通知**（E6#79 用户拍板「装完发一条通知告诉我」）：单个点名到版本，多个给条数 + 头几个
 *     名字（同 updateBellMessage 结构）。静默装完会让用户回来发现「版本变了、但不知道是谁动的手」。
 *   - **失败 → 候选保留**（「可更新」徽标仍在，下次发现 / 手动重试）+ 发一条汇总告知：失败比成功更需要用户知道。
 *   - 勾选开 = DetailView 立即 `enableAutoUpdateAndRun`（**先清钉、再跑**——E6#83，见该函数头注；其内部
 *     候选**就地现算，不读 store**——见 `runAutoUpdateIfDue` 头注 E6#81）。
 *   - G6：插件标签页开着也照常 stage + 替换 + 重启生效（引擎 needRestart 恒 true——原子替换已证开着也能成，§二·七）。
 *
 * 夹内布局（依赖单向：types → plan / snapshot / messages / apply → run → schedule）：
 *   types.ts     数据形状
 *   snapshot.ts  本地快照组装（纯）+ 读盘 IPC
 *   plan.ts      发现计划（纯，主测区——「算不算有更新」唯一一份逻辑）
 *   messages.ts  铃铛/汇总文案 + 推送
 *   apply.ts     单候选跑引擎 update
 *   run.ts       主编排 + 两个入口（发现代劳 / 勾选即跑）
 *   schedule.ts  启动调度 + 判不了时的重试梯子
 *
 * IO 注入沿用兄弟模块惯例（marketSources.__setCatalogIO / installedUpdateMeta.__setMetaStore）——纯计划
 * planDiscovery 可直测；主编排 runUpdateDiscovery 读 pluginManager/notifications/update 走 window.linkdesk
 * （jsdom 注入同 startMarketInstall 的测试约定），目录经 loadCatalog。
 */

export type { InstalledSnapshot, UpdateCandidate, DiscoveryPlan } from "./types";
export { assembleInstalled, readInstalledSnapshot } from "./snapshot";
export { planDiscovery, selectAutoCandidates, selectMetaEvictions } from "./plan";
export { runUpdateDiscovery, runAutoUpdateIfDue, enableAutoUpdateAndRun } from "./run";
export { scheduleStartupDiscovery, __resetUpdateDiscovery } from "./schedule";
