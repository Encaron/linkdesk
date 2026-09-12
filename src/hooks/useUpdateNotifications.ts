/**
 * 主软件更新的**通知面生产者**——E6#57.12（设计：06-主软件更新/04-更新通知与交互.md §二-§五 + 07 §4.3）。
 *
 * 通知面唯一（E6#72 归一，`ToastHost` 已整删）——本模块是 `app.update` 这个 source 的**唯一生产者**，
 * 全仓没有第二处 pushToast 更新条目。载体是状态栏铃铛宽面板，**零新 UI 表面**。
 *
 * ## 三条产出路径，各管自己那半（这是本格的核心设计）
 *
 * **① 迁移驱动**（`useUpdateNotifications()`，挂载在 App.tsx）——发现 / 进度 / 完成三格是
 * **状态的函数**：态一到就出条目，壳里没有任何一处「点一下才出」。`available` 无论来自后台定时器
 * 还是用户手点，都走同一个迁移，**不需要知道谁发起**。
 *
 * **② 发起方自消化**（`checkForUpdatesAndReport` / `downloadUpdateAndReport`）——失败 / 已最新
 * 两格**不能由态反推**：`idle + lastError` 在「后台定时器查失败」与「用户手点查失败」下**逐字节相同**
 * （`UpdateError` 只有 code+message 两槽，`update-source.ts` 实测 `context` 不分支），而规范要求
 * 前者静默、后者出声。解法 = **谁发起谁消化**：`checkForUpdates`/`downloadUpdate` 都把结果态
 * **返回**给调用方，调用方（命令 handler / 调度器 / [重试] 按钮）天然知道自己的身份。
 *
 * 🔴 **不许在壳侧用 ref 记「最近一次是谁发的」去猜**：后台定时器到期与用户手点撞在同一秒时，
 * 猜法必错，且错的正是「点了没反馈」那一侧——那是本仓反复吃过的亏。
 *
 * **③ 无发起方的那一格**（`install-interrupted`，2026-09-12 补）——启动复位（#57.7a）算出「上次更新
 * 没装完」，此时用户刚开机、什么都没点，两条路都够不到它：态是 `idle`（①② 都不管），而当班人
 * （`initUpdateService`）在**主进程**里、说不了话。故本模块**唯一点名认码**的例外就在这里，
 * 理由与处置见 `pushStartupInterrupted`。
 *
 * ## 条目生命周期（一条条目贯穿全程，不闪不换位）
 *
 * ```
 * available ──▶ [发现]  LinkDesk 有可用的更新 0.2.0     [立即更新]        ttl 0 · wake · × 可关
 * downloading ─▶ [进度]  正在下载更新 42%              [后台运行]        ttl 0 · wake:false · 4px 条
 *                        └ percent 到 100 ─▶ 正在校验…（不定态，percent 归 undefined）
 * downloaded ─▶ [完成]  更新已下载，重启后生效          [稍后][重启并更新]  ttl 0 · 不设 ×
 * ```
 *
 * 一路 `replaceToast` 复用同一个 id（E6#73f 的原子替换——dismiss+push 会让行闪、会换位）。
 * ⚠️ 「后台运行」按下后条目被 `notif:action` 分发器收掉（它**无条件** dismiss，见 useSubscriptions.ts），
 * 于是**完成那一步必须能自己重新长出来**（`ensureEntry`）——否则用户按下「后台运行」就再也等不到
 * 完成提示，而进度条又已经没了（`progress: true` 的条目在面板里连 × 都不画，`notif:clearAll` 也跳过）。
 *
 * ## 与状态机的边界（一条都不许越）
 *
 * - **不迁移状态**：通知面只说话，不替状态机做决定。「稍后」/「后台运行」都**只收条目**——
 *   安装器已在盘上，把态降回 `idle` 只会让用户重下一遍（2026-09-12 用户拍板）。
 * - **不判 `state.type` 来决定「该不该说话」**——那是发起方的事（见上）。
 * - **不把码翻成第二套文案**：六类检查错 + 五类下载错的人话由**腿**写（`update-source.ts` /
 *   `update-download.ts` 的中文常量），本模块只 `t()` 渲染它——两处各写一份文案 = 归一化违规，
 *   改一处漏一处时用户会看到互相矛盾的两句话。
 */
import { useEffect, useRef } from "react";
import i18n from "../i18n";
import { APP_PLUGIN_ID } from "../core/services/plugins/PluginStateService";
import { reportError } from "../core/services/bootstrap/ErrorService";
import {
  TOAST_TTL_ERROR, TOAST_TTL_SUCCESS, pushToast, replaceToast, type Toast,
} from "../core/services/ui/toast";
import type { UpdateError, UpdateState } from "../core/types/ipc/update";
import { getShellUpdateApi, useUpdateProgress, useUpdateState } from "./useUpdateState";

/**
 * 条目来源 id——**生产者身份**，不是人类可读名。
 * 「主软件更新」这个显示名由通知面的来源名机制解析（E6#73g S5，`usePoolSync/notif.ts` 的
 * `shellSourceName` 已有 `app.update` 一行）——**不许**把中文名写进 source（那会让来源行、
 * 分组键、持久化键三处各有一套命名）。
 */
const SOURCE = `${APP_PLUGIN_ID}.update`;

/* ── 模块级生产者状态（随壳渲染进程存活；不是渲染输出，故用模块级而非 state）── */

/** 「更新生命周期条目」的 id——发现 → 进度 → 完成 一路复用同一条 */
let _entryId: string | null = null;
/** 这条条目属于哪个版本——版本变了必须另起一条（不许把 0.2.0 的进度写到 0.3.0 的条目上） */
let _entryVersion: string | null = null;
/**
 * 已为哪个版本出过「发现」条目——**同版本不重复弹**。
 * 为什么必须有：后台每 4h 查一次，`available` 会一次次回到同一格（设计如此——用户把更新晾着时，
 * 更晚的版本发布了就该重新发现）；没有这道去重就是每 4h 凭空多一条一模一样的「有可用更新」。
 */
let _announcedVersion: string | null = null;
/**
 * 已经报过账的降级放行项（`${version}::${code}`）——防**重挂载**重复弹。
 * 跨进程重启会重来一条，这是**有意**的：`ready` 是启动时从盘上读回来的，那一刻确实是本次会话
 * 第一次得知这笔账，而它还没被解决（更新还没装）。同一会话内重挂载则不该再弹一遍。
 */
const _warnedKeys = new Set<string>();
/**
 * 「启动复位未完成」是否已经报过——**重挂载不许再报一遍**。
 * 与 `_warnedKeys` 同款理由：那个态是启动时从盘上读回来的**同一格**，重挂载（StrictMode 双跑 /
 * 第二个消费者）会让 `prevRef` 从 `uninitialized` 重新开始，从而把它当成一次新迁移。
 */
let _startupInterruptedReported = false;

/* ── 条目读写原语 ── */

/**
 * 复用或新建生命周期条目——**「完成」必须活过「后台运行」的那次关闭**（见文件头）。
 *
 * ⚠️ 三条边界：
 * ① 版本变了 ⇒ 丢掉旧 id 另起。旧条目**就地留着不删**（它记的是上一个版本的发布，用户看得懂
 *    「这条旧了」；而就地改写会让一条 2 小时前的条目突然宣布 0.3.0，时间标签开始说谎）。
 *    ⚠️ 不去 dismiss 它：`dismissToast` 对带 `isCloseAffordance` 的条目会**写「用户不要了」台账**，
 *    而这里根本没有用户动作——E6#73f 那个 bug 就是这么来的，不重蹈。
 * ② `pushToast` 因 `isCloseAffordance` 被抑制时**返回空串**（用户点过 × 的那个版本）——
 *    空串必须落成 `null`，否则下一句 `replaceToast("")` 会静默失败（`""` 永不存在）。
 * ③ 条目已被收掉（`replaceToast` 返回 false）⇒ 落 `null` 再新建，不反复对着一个死 id 写。
 */
function ensureEntry(version: string, patch: Omit<Toast, "id">): void {
  if (_entryVersion !== version) {
    _entryId = null;
    _entryVersion = version;
  }
  if (_entryId !== null && replaceToast(_entryId, patch)) return;
  _entryId = pushToast(patch) || null;
}

/**
 * 只改**已经活着**的条目，**不新建**——进度段专用。
 * 理由：用户在进度中点「后台运行」就是要它消失；500ms 后条目自己长回来等于那个按钮没用。
 * （完成那一步是另一回事——它必须重新长出来，见 `ensureEntry`。）
 */
function updateEntryIfLive(patch: Partial<Omit<Toast, "id">>): void {
  if (_entryId === null) return;
  if (!replaceToast(_entryId, patch)) _entryId = null;
}

/**
 * 进度条的**阶段**文案 + 百分比（两处调用点共用一份判据，不许各写一遍）。
 *
 * 🔴 `percent >= 100` 时**显式归 `undefined`**：字节收完后还有「校验 + 落盘」一段（大包上 sha256
 * 要读一整遍文件），这段没有百分比。留着 100% 不动会被读成**卡死**；传 `undefined` 落不定态扫动
 * （`StatusBarZone` 的 `typeof item.percent === "number"` 分支），才诚实地表达「还在跑，但这会儿
 * 算不出百分比」。
 */
function progressPatch(percent: number): { message: string; percent?: number } {
  return percent >= 100
    ? { message: i18n.t("正在校验…"), percent: undefined }
    : { message: i18n.t("正在下载更新 {{percent}}%", { percent }), percent };
}

/* ── 七类条目：① 迁移驱动（发现/进度/完成/降级记账）+ ② 发起方自消化（失败/已最新）+ ③ 启动复位 ── */

/** ① 发现 */
function pushDiscovery(version: string): void {
  _announcedVersion = version;
  ensureEntry(version, {
    // 🔴 消息里**必须带版本号**：`isCloseAffordance` 的持久化键是 `${source}::${message}`
    // （toast.ts 的 isDismissed）——消息里没有版本，关掉 0.2.0 会把 0.3.0 一起永久静音。
    message: i18n.t("LinkDesk 有可用的更新 {{version}}", { version }),
    source: SOURCE,
    isCloseAffordance: true,
    actions: [
      // ⚠️ 「查看更新内容」**本格不提供**：它要打开发行说明标签页，而那个标签页是 #57.13 的活、
      //    壳 API 里也还没有 openExternal。给一颗点了没反应的按钮比少一颗更糟 ⇒ 等 #57.13e 补上，
      //    届时在此加第二个 action（mockup 02 Frame 1 已按此登记为订正项）。
      { label: i18n.t("立即更新"), isPrimary: true, onClick: () => { void downloadUpdateAndReport(); } },
    ],
    ttl: 0,
    // 有更新要让面板自己冒出来。默认白名单（error ∨ 带按钮）虽然放行本条，仍**显式**写出来——
    // 它是这条通知的核心承诺（用户不点任何东西也该知道），不该随 `defaultWake` 的调整而漂移。
    wake: true,
  });
}

/** ② 进度——`progress: true` 才是那条 4px 条（E6#71i/E6#73k）。`percent` 有值画确定宽，无值扫动 */
function progressEntry(version: string, percent: number): void {
  ensureEntry(version, {
    ...progressPatch(percent),
    source: SOURCE,
    progress: true,
    // 🔴 `wake: false` **必须显式写**，不能吃缺省：本条带一个 action ⇒ `defaultWake` 会判 true ⇒
    //    这条未读的进行中条目会在**每一次 layout 重推**时命中 `autoOpen` 表达式（它只排除已读、
    //    不排除进行中）⇒ 用户每按一次「最小化」，下一帧进度就把它弹回来。R5-6「进度不弹」的
    //    机械保证就落在这个字段上。
    wake: false,
    // 显式归 false：从「发现」那条替换过来时会**继承**它的 `isCloseAffordance: true`，而
    // `persistDismiss` 是拿**当前** message 记账的 ⇒ 点「后台运行」会往「用户不要了」台账里
    // 写一条 `正在下载更新 42%` 的垃圾键。× 本来就被 `progress` 藏掉，这条只堵台账那个口子。
    isCloseAffordance: false,
    actions: [
      // 按钮真身 = **收掉这一条**（`notif:action` 分发器无条件 dismiss）。下载照跑——TitleBar
      // 仍显示「更新中」，完成时本模块把条目重新长出来（`ensureEntry`）。
      // ⚠️ **面板不会因此收起**：全仓没有壳→池的关面板通道（`notif:*` 全是池→壳），要做得新开
      //    一条通道 + 池侧接线，那是新能力，不在本格。mockup 该框注释里的「收起面板」是写错的
      //    （已登记为图的订正项）。
      { label: i18n.t("后台运行"), isPrimary: false, onClick: () => { /* 收掉本条即全部效果 */ } },
    ],
    ttl: 0,
  });
}

/** ③ 完成 */
function pushDone(version: string): void {
  ensureEntry(version, {
    message: i18n.t("更新已下载，重启后生效"),
    source: SOURCE,
    // 🔴 **不设 `isCloseAffordance`**：这条消息里**没有版本号**，而抑制键是 `${source}::${message}`
    // ⇒ 设了它 = 「关一次，此后所有版本的完成提示全部静音」。带版本号的是「发现」那条。
    // 显式归 false 的另一半理由与进度条目同款：它多数时候是从「发现」那条替换过来的。
    isCloseAffordance: false,
    actions: [
      // 「稍后」= 只收条目，**状态原地不动**（2026-09-12 用户拍板）。点它之后 TitleBar 仍是
      // 「重新启动」，随时可再触发；态留在 `downloaded` 也意味着不会重下一遍。
      { label: i18n.t("稍后"), isPrimary: false, onClick: () => { /* 收掉本条即全部效果 */ } },
      { label: i18n.t("重启并更新"), isPrimary: true, onClick: () => { void restartToUpdate(); } },
    ],
    ttl: 0,
    // 进度段结束——把 4px 条和 `progress: true` 一起撤掉（撤了才不是「进行中」，`isPending` 才
    // 放行「清除已完成」与 ×）。
    progress: false,
    percent: undefined,
  });
}

/** ④ 降级放行的记账——「成了，但有一件发布侧该知道的事」，**与失败分开一条**（不许并进完成那条） */
function pushWarning(version: string, warning: UpdateError): void {
  const key = `${version}::${warning.code}`;
  if (_warnedKeys.has(key)) return;
  _warnedKeys.add(key);
  pushToast({
    // 腿写好的那句人话（`UpdateError.message` 是 i18n key 形态）；查不到译文时 `t()` 原样返回
    // 中文原文（i18n 的第 2 层退路），不会变成空串。带数值的词条由 `params` 填占位符。
    message: i18n.t(warning.message, warning.params),
    source: SOURCE,
    severity: "warning",
    // 常驻：它要能被读第二遍（用户看不懂「漏附校验值」时需要回头再看）。`severity: "warning"`
    // **不在唤醒白名单里**，`wake` 吃缺省即 false——它不该把面板弹开。
    ttl: 0,
  });
}

/** ⑤ 失败——**不是死路**：带 `[重试]`，且 `ttl` 用错误档（用户需要时间读） */
function pushFailure(
  prefix: "检查更新失败：{{error}}" | "下载更新失败：{{error}}",
  error: UpdateError,
  retry: () => void,
): void {
  pushToast({
    message: i18n.t(prefix, { error: i18n.t(error.message, error.params) }),
    source: SOURCE,
    severity: "error",
    actions: [{ label: i18n.t("重试"), isPrimary: false, onClick: retry }],
    ttl: TOAST_TTL_ERROR,
  });
}

/**
 * ⑥ 启动复位报出的「上次更新没装完」——**本模块里唯一不由发起方出品的一条**（`install-interrupted`）。
 *
 * 为什么必须有（#57.12 实测的真缺口，2026-09-12 修）：`resolveStartupInstall()` 算出这一格，
 * 但 `initUpdateService()` 只留 `resolution.resume`、**丢掉 `outcome`**，而「谁发起谁出声」那条路
 * 根本没有发起方（用户刚开机，什么都没点）⇒ 整改前的下场是**零通知**：用户上次更新被中断，
 * 下次启动只看到一个安静的界面，TitleBar 也没有按钮（态是 `idle`，不是 `available`）。
 *
 * 🔴 触发条件**只认码**（`install-interrupted`），不认「`idle` 却带着 `update`」那种间接不变式——
 * 后者取决于 `fail()` 当下丢不丢 `update`（今天丢、明天可能为了 [重试] 而留），一旦漂移就会
 * 在普通下载失败上多出一条同款提示（重复出声）。码是腿/复位自己写死的，不随实现漂移。
 *
 * [重新下载] 的出口 = `retryDownload()`（先回头重查再重下）——与下载失败那条**共用同一个出口**，
 * 因为复位后的处境与它一样：知道有哪个版本，但盘上没有可装的东西。
 */
function pushStartupInterrupted(error: UpdateError): void {
  pushToast({
    message: i18n.t(error.message, error.params),
    source: SOURCE,
    severity: "error",
    actions: [{ label: i18n.t("重新下载"), isPrimary: false, onClick: () => { void retryDownload(); } }],
    ttl: TOAST_TTL_ERROR,
    // 显式打开（不靠 `defaultWake` 的 error 白名单）：**这条通知就是本次修复的全部产出**——
    // 不弹就等于没修。写死在这里，免得将来有人收窄 `shouldWake` 时把它一起收掉。
    wake: true,
  });
}

/** ⑦ 手动检查无更新——即查即答，短提示 */
function pushUpToDate(): void {
  pushToast({
    message: i18n.t("当前已是最新版本"),
    source: SOURCE,
    ttl: TOAST_TTL_SUCCESS,
    // 🔴 **显式 `wake: true`**（2026-09-12 用户拍板）——默认白名单只认 error ∨ 带按钮，本条两者
    // 都不是 ⇒ 不显式打开就只会让铃铛数字悄悄 +1（而且它 5 秒就没了），用户点了「检查更新…」
    // 却像什么都没发生。这是对白名单的**窄口径覆盖**：只此一条，不动 `shouldWake` 表达式本身
    // （动表达式会把内存墙、一切 warning 一起算重要）。
    wake: true,
  });
}

/* ── 发起方自消化（调用方 = 命令 handler / 调度器 / [重试]） ── */

/**
 * 检查更新并**就地消化结果**——四个入口（帮助菜单 / 齿轮菜单 / 命令面板 / [重试]）与后台调度器共用。
 *
 * `context` 同时决定两件事，且**必须一致**：① 透传给检查腿；② 本函数说不说话。
 * 后台（`false`）**静默**——只记账（`idle.lastError` 照写），下周期自己再试。
 * 手动（`true`）才出声，「已最新」与「失败」两条各出一条。
 *
 * 返回结果态给调用方（`UpdateState | null`，非壳环境为 `null`）——调度器不消费，但命令 handler
 * 与测试要能拿到，别让它变成「只有副作用、无法断言」的黑洞。
 */
export async function checkForUpdatesAndReport(context: boolean): Promise<UpdateState | null> {
  const api = getShellUpdateApi();
  if (!api) return null; // 非壳环境（vitest / 纯 Vite 预览）——静默 no-op，不抛
  const next = await api.checkForUpdates(context);
  if (!context) return next;
  if (next.type === "idle") {
    if (next.lastError) {
      // [重试] = 重走检查全流程。不带断点续传语义——那是下载腿的事。
      pushFailure("检查更新失败：{{error}}", next.lastError, () => { void checkForUpdatesAndReport(true); });
    } else {
      pushUpToDate();
    }
  }
  // `available` 不出声：发现条目由**迁移驱动**那条路出（同一个 `available`，两条路都出就是两条）。
  // 被 × 关过的版本也不会因此复活（`isCloseAffordance` 抑制在 toast store 里）。
  return next;
}

/**
 * 开始下载并**就地消化结果**。下载**永远是用户发起的**（只有 `available` 态能下载，而 `available`
 * 只可能来自一次检查，后台检查不会自己开下载）⇒ 不存在「后台下载」，无需 context 参数。
 */
export async function downloadUpdateAndReport(): Promise<UpdateState | null> {
  const api = getShellUpdateApi();
  if (!api) return null;
  const next = await api.downloadUpdate();
  // `idle + lastError` = 这次没下成（校验不符 / 落盘失败 / 半路断）。
  if (next.type === "idle" && next.lastError) {
    pushFailure("下载更新失败：{{error}}", next.lastError, () => { void retryDownload(); });
  }
  return next;
}

/**
 * 下载失败的 [重试]——**必须先回头重查一遍**再重下。
 * 失败落账时服务的 `fail()` 只带 `lastError`、**把 `update` 丢了** ⇒ `idle` 态直接调
 * `downloadUpdate()` 会被重入守卫判「当前没有可下载的更新」。先查再下才接得回去。
 */
async function retryDownload(): Promise<void> {
  const after = await checkForUpdatesAndReport(true);
  if (after?.type === "available") await downloadUpdateAndReport();
}

/**
 * 「重启并更新」——`quitAndInstall` 正常路径**不返回**（进程退出），返回或抛出 = 装不上。
 *
 * ⚠️ 这里**必须**自己收住异常：`notif:action` 的分发器是 `action.onClick(); dismissToast(id);`
 * 的同步调用，onClick 返回的 promise **无人 await** ⇒ 漏出去就是一条 unhandled rejection，
 * 用户侧则是「点了没反应」。（走命令那条路（TitleBar / 菜单）不经手本函数——`executeCommand`
 * 的 catch 会兜。）
 *
 * ⚠️ **只给一句通用话，不复刻腿的归因句**：腿抛的是 `UpdateLegError`（结构化 `detail`），但它
 * 过 IPC 之后被 Electron 重包成普通 Error——`detail` 没了，message 被套上
 * `Error invoking remote method '…': UpdateLegError: …` 的外壳。为了把那句话抠出来去正则解析
 * Electron 的内部格式不值得（格式一变就静默失灵）。**诊断不丢**：`reportError` 的第一个动作就是
 * `console.error(message, error)`，腿的原话在控制台/日志里一字不少；用户拿到的是准确的一句话
 * （安装程序确实没启动起来），不是「未知错误」。
 */
async function restartToUpdate(): Promise<void> {
  const api = getShellUpdateApi();
  if (!api) return;
  try {
    await api.quitAndInstall();
  } catch (err) {
    reportError({
      message: i18n.t("重启更新失败——安装程序没能启动，请重启 LinkDesk 后重试"),
      source: SOURCE,
      error: err,
    });
  }
}

/* ── 迁移驱动（① 那条路） ── */

/** 一次状态观察 → 该出什么条目。**只处理「发现 / 进度 / 完成」三格**，其余静默（见文件头） */
function onState(next: UpdateState): void {
  switch (next.type) {
    case "available":
      // 同版本不重复弹（后台每 4h 一次会反复回到这一格）；版本变了则另起一条（见 ensureEntry ①）。
      if (_announcedVersion !== next.update.version) pushDiscovery(next.update.version);
      return;
    case "downloading":
      // 这一帧状态里带的就是**已知最新**进度（服务在 reportProgress 里原地刷过 `this.state`），
      // 用它垫底：进度通道没有重放，晚挂载的场景只能靠这里补上当前值。
      progressEntry(next.update.version, next.progress.percent);
      return;
    case "downloaded":
    case "ready":
      // `ready` = 跨重启复原的待装态（#57.7a）——用户重启后再打开，完成条目必须还在（能再点一次
      // 「重启并更新」），故与 `downloaded` 同款处理。
      pushDone(next.update.version);
      // 降级放行的账随成功态一路传下来（`warning` 槽）——在这里落成独立一条。
      if (next.warning) pushWarning(next.update.version, next.warning);
      return;
    case "idle":
      // 🔴 `idle` 是唯一一格要**逐案看**的：普通失败/已最新都归发起方自消化（下面 default 的理由），
      // 但**启动复位**那一格没有发起方（见 `pushStartupInterrupted`）⇒ 只认它的码，别的一律闭嘴。
      if (next.lastError?.code === "install-interrupted" && !_startupInterruptedReported) {
        _startupInterruptedReported = true;
        pushStartupInterrupted(next.lastError);
      }
      return;
    default:
      // checking / updating / uninitialized / disabled —— 本模块**不出声**：
      //   · `idle` 的其余情形（已最新、后台/手动失败的普通态）：**谁发起谁说话**（发起方自消化那条路），
      //     迁移驱动这条路分不出后台与手动 ⇒ 一律闭嘴，宁可少说不可乱说；
      //   · `updating`：安装腿在跑，成功路径直接进程退出，此时说什么都是多余的；
      //   · `checking`：一次迁移而已，「正在检查…」不在任何一帧设计里，不新造。
      return;
  }
}

/**
 * 生产更新通知条目。**挂载一次**（App.tsx，与 useUpdateScheduler 同处）。
 *
 * 采用「观察迁移」而不是「监听事件」：`useUpdateState` 的状态**只在迁移时变**（进度是原地刷
 * `this.state`、走另一条通道，不触发 stateChanged）⇒ 对象引用相等即可判「是不是新的一格」，
 * 不需要第二个真值源。首次观察（含挂载时已有态）**按一次迁移处理**——这正是跨重启复原
 * （`ready`）能在启动后立刻长出完成条目的原因。
 */
export function useUpdateNotifications(): void {
  const state = useUpdateState();
  const progress = useUpdateProgress();
  /** 上一次观察到的态——**前值对比，不参与渲染**（硬约束 17 允许的用途） */
  const prevRef = useRef<UpdateState>({ type: "uninitialized" });

  useEffect(() => {
    // 引用相等 ⇒ 同一格，跳过（迁移才会换对象）。StrictMode 的双跑 effect 也由此天然去重。
    if (prevRef.current === state) return;
    prevRef.current = state;
    onState(state);
  }, [state]);

  useEffect(() => {
    if (!progress) return;
    updateEntryIfLive(progressPatch(progress.percent));
  }, [progress]);
}
