/**
 * usePoolSync 通知中心序列化——_seenIds / formatTimeAgo / getNotifIconClass / buildNotif。
 * E5.8#0d.10-5a：自 usePoolSync.ts 拆出——纯函数：壳 NotificationCenter 四件套 DTO。
 * 模块级 _seenIds 未读追踪跨渲染保留（useSyncSubscriptions 事件回传共享同一实例）。
 * 依赖方向：notif → toast（存储）；无反向。
 */

import type { TFunction } from "i18next";
import type { NotifLayout, NotifSection } from "../../core/types/pool/poolLayout";
import { getToasts, getFoldedCount, isNotifPanelOpen, isPending, OTHER_SOURCE_KEY, sourceKeyOf, type Toast } from "../../core/services/ui/toast";
import { listInstallJobs } from "../../pluginLoader/lifecycle/install-queue";
import { getManifestById } from "../../pluginLoader/resolution/state";
import { APP_PLUGIN_ID } from "../../core/services/plugins/PluginStateService";

/** 未读追踪——跨渲染保留，面板关闭期间到来的通知标记为未读 */
export const _seenIds = new Set<string>();

/** 把当前**全部**条目标已读（面板开着时新到的条目走这条，E6#73g B1） */
export function markAllSeen(): void {
  for (const n of getToasts()) _seenIds.add(n.id);
}

/**
 * 已读集合修剪（E6#73g）——`_seenIds` 此前是**只增不减**的模块级 Set：通知 TTL 到点、
 * 被 × 掉、被限额折叠收走之后，它们的 id 永远留在集合里，长跑会话（几百条通知）白占内存。
 * 条目的未读语义只对**还在面板里的条目**有意义 ⇒ 每次列表变化后按当前存活 id 收一遍。
 */
export function pruneSeen(): void {
  if (_seenIds.size === 0) return;
  const live = new Set(getToasts().map((n) => n.id));
  for (const id of [..._seenIds]) if (!live.has(id)) _seenIds.delete(id);
}

/**
 * 角标计数判据（18 档 §八㉙，2026-09-10 用户定案「只数有结果的」）——**已读**且**不是进行中**。
 *
 * 角标语义 = 「**有结果等着你**」（完成 / 失败）。进行中 / 排队中的条目照旧进面板、照旧可弹，
 * **只是不占铃铛数字**：还在跑的没有动作可做，数字亮着只会乱跳（18 档 B1 反面约束）。
 * ⚠️ 这条只改**计数**，不改唤醒——`autoOpen` 表达式归 73b，本函数不是它的判据。
 */
function isUnread(n: Toast): boolean {
  return !_seenIds.has(n.id) && !isPending(n);
}

/**
 * 壳域自带可读名（E6#73g / S5）——`app` 是**壳自己的域**（`APP_PLUGIN_ID`），不是插件：
 * 壳天然知道自己有哪些域，故这张表**不违反硬约束 10**（禁的是「插件 id → 名」映射表）。
 * ⚠️ 键只许是壳域 id（`app` / `app.<域>`）——**禁止**往这里塞插件 id。
 * 加新壳域在这里加一行；不加也不致命（回落「主软件」，见 resolveSourceName 的降级链）。
 */
function shellSourceName(t: TFunction, id: string): string | undefined {
  switch (id) {
    case APP_PLUGIN_ID: return t("主软件");
    case `${APP_PLUGIN_ID}.update`: return t("主软件更新");
    default: return undefined;
  }
}

/**
 * 来源 id → 人类可读名（E6#73g / 18 档 §五 E S5）——**组标题（首段）与条目来源行同一路径解析**，
 * 不拿内部 id 当标题 / 正文。降级链：
 *   ① 壳域（`app` 或 `app.*`）→ 壳域自带可读名；不认识的具体域回落「主软件」（它确实是壳）
 *   ② 已装插件 → `manifest.name`（**不查任何「插件 id → 名」映射表**，硬约束 10）
 *   ③ 查不到 → 回落**显示 id 本身**
 * 一路有输出：宁可显示 id（能拿去搜、能对上其他日志），也不能是空串（空标题最难排查）。
 */
function resolveSourceName(t: TFunction, id: string): string {
  if (id === OTHER_SOURCE_KEY) return t("其他");
  if (id === APP_PLUGIN_ID || id.startsWith(`${APP_PLUGIN_ID}.`)) {
    return shellSourceName(t, id) ?? t("主软件");
  }
  return getManifestById(id)?.name || id;
}

/** 时间格式化——中文友好，零外部依赖（壳 NotificationCenter 同款） */
function formatTimeAgo(t: TFunction, ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return t("刚刚");
  const min = Math.floor(diff / 60_000);
  if (min < 60) return t("{{min}} 分钟前", { min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("{{hr}} 小时前", { hr });
  const d = Math.floor(hr / 24);
  return t("{{d}} 天前", { d });
}

/** 通知图标类——按 severity（+ 进度类）定图标。
 *  E6#72c：进度类通知换 codicon-sync + spin 类——与下方进度条同源语义（「这件事正在跑」）。
 *  E6#73f：删掉「作者显式给 icon 则尊重作者」那条分支——插件面 `notifications.show` 的
 *  options 从来没有 icon 形参（契约只有 type/progress/persistent/actions），`Toast.icon`
 *  全员零生产者 ⇒ 该分支恒假。要开「作者自定义图标」是**新能力**，得走 8 维设计 + 契约生成，
 *  不在本行整肃范围内，故删分支而非补契约。 */
function getNotifIconClass(n: Toast): string {
  if (n.progress) return "codicon codicon-sync ldk-notif-icon-spin";
  switch (n.severity) {
    case "error": return "codicon codicon-error ldk-notif-severity-error";
    case "warning": return "codicon codicon-warning ldk-notif-severity-warning";
    case "info":
    default: return "codicon codicon-info";
  }
}

/**
 * 唤醒白名单（E6#73b，18 档 §五 B）——本文件里**唯一**决定「这条通知能不能把面板弹出来」的判据。
 *
 * 判据压到最短：**「新状态」= 一条新的通知诞生**（`pushToast`）——对已有通知的任何更新
 * （`updateToast`：百分比 / 阶段名 / 排队位次）永不唤醒，因为它不新建条目、拿不到新的 `wake` 值。
 * 于是 R5-6 的三条同时成立：点击弹 / 进度不弹 / 结果弹。
 *
 * 穷举四类（旗标由生产者置位，缺省见 `toast.ts` 的 `defaultWake`）：
 *   ① 用户点击发起安装建的 job 行 ② job 终态（成功 / 部分失败 / 失败）
 *   ③ 插件自己发出的非进度通知 ④ 壳自产「该弹」级条目（error ∨ 带按钮）
 *
 * ⚠️ **不得回退成 `isImportantNotif` 一把梭**（18 档 ㉓）——那个判据把 `progress` 与一切
 * warning/error 都算「重要」，面板会被每 30 秒一条的内存墙弹开，直接违反 R5-4。
 * **「最小化」不带静音权力**（18 档 §五 A 第 4 行 + §五 B 计数表）：本表达式**不得**再加
 * 「且未最小化」——加了等于终态唤不回，R5-5「成功和失败都要冒出来」当场失效。
 */
function shouldWake(n: Toast): boolean {
  return n.wake === true;
}

/** 每段明细上限——超出折成「另有 N 项」（18 档 §五 I.4：第 6 条起折） */
const SECTION_DETAIL_CAP = 5;

/**
 * 进行中行的状态短语（壳 t() 解析，池哑渲染）——**按阶段码派生**。
 *
 * ⚠️ **不用 job.message**：它是各段吐出的**原始串**——主进程那几条是开发者中文（「开始下载 https://…」
 * 「下载完成（1234 字节）」），壳侧那几条是未过 t() 的字面量。把它们直接画进面板 = 绕过 i18n 硬约束 2，
 * 换了语言也不变。面板文字的唯一来源是 t()（阶段码 + 百分比都是**值**，不是文案）。
 * 代价（诚实边界）：主进程的「下载失败，正在重试（1/2）」在行上不可见——重试期间表现为进度条停住。
 * 要让它可见得先给重试通知一条**已 t() 的结构化通道**，那属 73i/73n 的范围，不在本档硬塞。
 *
 * 只覆盖安装流真实会发的阶段码（`lifecycle-ops.ts` 的 jobProgress 六处 + 主进程 download/extract 段）。
 */
function installRowStatusLabel(t: TFunction, stage: string | undefined, percent: number | undefined): string {
  switch (stage) {
    case "downloading": return percent != null ? t("下载中 {{percent}}%", { percent }) : t("下载中...");
    case "extracting": return t("解压中...");
    case "copying": return t("复制中...");
    case "loading": return t("加载中...");
    case "validating": return t("校验中...");
    // E6#73m K1：卸载腿唯一阶段——没有可量化的段（不预扫文件数），故只有短语、不画进度条
    case "uninstalling": return t("卸载中...");
    default: return t("安装中...");
  }
}

/**
 * E6#73d：安装 job 两段（进行中 → 等待安装中）——数据源是**壳侧 job 表**（`install-queue.ts`），
 * 与本渲染进程同处一地，直接函数调用读取，不走 IPC 往返。
 *
 * **段序固定、段内按入队先后**（job 表本身是 Map 的插入序 = 入队序）——永不重排：
 * 排队位次跳变会让用户刚瞄到的行"跑"到别处，比不排序更糟。
 * **失败行不折叠**：失败行是**待办**（[重试] 必须始终可达），而它属终态、在结果区的 toast 里，
 * 本函数根本不碰——这里的折叠只作用于「还没有结果」的行。
 */
function buildInstallSections(
  t: TFunction,
): { sections: NotifSection[]; summaryLabel?: string; resultLabel?: string; resultSummary?: string } {
  // 行 = 一次**用户动作**（18 档 §五 I.4 / §七 73d 行）——插件自己拖来的依赖不单独占行。
  // ⚠️ 诚实边界：软件今天**没有**「装 A 自动装依赖」这条腿（唯一生产者在 marketplace，恒传 user），
  // 故本过滤零行为变化，只是把裁决写进代码。E6#73o 落 `⤷` 子行时，依赖 job 必须挂到父行下面 ——
  // 若那时忘了挂，它们会**整批隐形**（这条过滤是那个前提的配套，不是可选项）。
  const jobs = listInstallJobs().filter((j) => j.origin === "user");
  const rowsOf = (state: "running" | "queued") =>
    jobs
      .filter((j) => j.state === state)
      .map((j) => ({
        id: j.jobId,
        pluginId: j.pluginId,
        name: j.displayName || j.pluginId,
        iconClass:
          state === "running" ? "codicon codicon-sync ldk-notif-icon-spin" : "codicon codicon-circle-outline",
        statusLabel:
          state === "running" ? installRowStatusLabel(t, j.stage, j.percent) : t("等待安装中"),
        // 进度条只在**进行中**且有真值时才画：排队行没有在途工作，画条是撒谎
        ...(state === "running" && typeof j.percent === "number" ? { percent: j.percent } : {}),
        // E6#73m K1：能不能取消**问 job 表**，不在这里推——卸载腿没有真中止钩子（`fs` 停不下来），
        // 给它一颗 [取消安装] 就是「按钮一点行没了、活还在干」的假动作。
        cancellable: j.cancellable,
        cancelLabel: t("取消安装"),
      }));

  const running = rowsOf("running");
  const queued = rowsOf("queued");
  const sections: NotifSection[] = [];
  for (const [key, label, items] of [
    ["running", t("{{count}} 项进行中", { count: running.length }), running],
    ["queued", t("另有 {{count}} 项等待安装中", { count: queued.length }), queued],
  ] as const) {
    if (items.length === 0) continue;
    sections.push({
      key,
      label,
      items: items.slice(0, SECTION_DETAIL_CAP),
      ...(items.length > SECTION_DETAIL_CAP
        ? { foldedLabel: t("本段另有 {{count}} 项未列出", { count: items.length - SECTION_DETAIL_CAP }) }
        : {}),
    });
  }
  // 第三段固定标题「已有结果」——数**job 的终态**，不数面板上的行：行会被 TTL 收走、
  // 会被来源折叠，拿它计数摘要会随无关动作乱跳。结果**行**是下方按来源分组的 toast（见 NotifJobRow 注释）。
  // `success` 才行；`parked`（已装但缺依赖）单独一档，**不许并进「已完成」**（§五 I.6⑦）。
  // ⚠️ 在早退**之前**算：装完之后在途两段会消失，但结果区还在 —— 标题必须跟着结果区留下。
  const settled = jobs.filter((j) => j.state === "settled");
  const countOf = (terminal: string) => settled.filter((j) => j.terminal === terminal).length;
  const parts = [
    [countOf("failed"), "{{count}} 项失败"],
    [countOf("parked"), "{{count}} 项缺依赖"],
    [countOf("success"), "{{count}} 项已完成"],
  ] as const;
  const resultSummary = parts
    .filter(([n]) => n > 0)
    .map(([n, key]) => t(key, { count: n })) // 一次 t()：键是原文，别先 t() 再 t()（重复查表 + 复数解析打在插值串上）
    .join(" · ");
  // **固定三段**的第一层含义就是「第三段恒在」——在途但还没出结果时它写「0 项」而不是消失
  // （18 档 §五 I.4 样张同款）。有安装活动（在途或已出结果）才带，纯插件通知的面板不凭空多一行。
  const result = sections.length > 0 || settled.length > 0
    ? { resultLabel: t("已有结果"), resultSummary: resultSummary || t("0 项") }
    : {};

  if (sections.length === 0) return { sections: [], ...result };

  // 头部摘要——两个数合起来说一句话（只报在途的，见 NotifLayout.summaryLabel 注释）
  const summaryLabel =
    running.length > 0 && queued.length > 0
      ? t("{{running}} 项进行中 · 另有 {{queued}} 项等待安装中", { running: running.length, queued: queued.length })
      : running.length > 0
        ? t("{{count}} 项进行中", { count: running.length })
        : t("{{count}} 项等待安装中", { count: queued.length });

  return { sections, summaryLabel, ...result };
}

/** 通知面板数据——壳 NotificationCenter（source 分组/未读排序/时间文案）序列化为纯数据 */
export function buildNotif(t: TFunction): NotifLayout {
  const notifications = getToasts();
  const unread = notifications.filter(isUnread).length;

  // E3e #50：source 第一段归类（"terminal.portErrors" → "terminal"）。
  // E6#73f 归一：分桶键走 toast 的 sourceKeyOf——与常驻上限淘汰分桶**同一个键函数**，
  // 面板分组与淘汰分桶不会各算各的（此前两处各写一遍 split(".")[0] || "__other__"）。
  const map = new Map<string, Toast[]>();
  for (const n of notifications) {
    const key = sourceKeyOf(n.source);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(n);
  }
  const groups: NotifLayout["groups"] = [];
  for (const [key, items] of map) {
    items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const groupUnread = items.filter(isUnread).length;
    const folded = getFoldedCount(key);
    groups.push({
      key,
      // E6#73g（S5）：组标题与条目来源行走**同一个**解析函数——此前直接把首段 id 当标题，
      // 面板上顶着一行 `terminal` / `app` / `marketplace` 这种内部黑话。
      label: resolveSourceName(t, key),
      unread: groupUnread,
      // E6#73f（S3/A6）：本组被上限折叠掉的条数——只在 >0 时带字段（缺省不渲染汇总行）。
      // 文案壳侧解析（池哑渲染），与 timeLabel/sourceLabel 同一「显示文本铁律」。
      ...(folded > 0 ? { foldedLabel: t("本组另有 {{count}} 条较早的已折叠", { count: folded }) } : {}),
      items: items.map((n) => ({
        id: n.id,
        iconClass: getNotifIconClass(n),
        message: n.message,
        timeLabel: n.createdAt ? formatTimeAgo(t, n.createdAt) : "",
        // E6#73g（S5）：来源行给**人类可读名**（完整 id 走同一解析路径）——此前甩的是原始 id
        ...(n.source ? { sourceLabel: t("来源: {{source}}", { source: resolveSourceName(t, n.source) }) } : {}),
        actions: (n.actions ?? []).map((a) => ({ label: a.label, ...(a.isPrimary ? { isPrimary: true } : {}) })),
        // E6#72c：进度旗标 + 百分比透传（原 71i 画在窄卡上，窄卡删后落点改宽面板）。
        // 只在 true 时带字段——非进度通知 DTO 形状不变（省略即缺省，池按 undefined 处理）。
        ...(n.progress ? { progress: true } : {}),
        ...(typeof n.percent === "number" ? { percent: n.percent } : {}),
      })),
    });
  }
  // 有未读的组排前面
  groups.sort((a, b) => b.unread - a.unread);

  // E6#73d：在途安装两段——排在结果区之前（§五 I.4 固定序）
  const install = buildInstallSections(t);

  return {
    unread,
    bellTitle: unread > 0 ? t("{{count}} 条通知", { count: unread }) : t("通知"),
    panelTitle: t("通知"),
    // E6#73a：头部两钮分工——一个管**内容**（清消息，面板不关），一个管**面板**（收起）。
    // 原「全部清除」删所有通知（含进行中）⇒ 此后进度静默失效、永不再现（18 档 A2/M5）。
    clearLabel: t("清除已完成"),
    minimizeLabel: t("最小化"),
    emptyLabel: t("暂无通知"),
    dismissTitle: t("关闭"),
    ...(install.summaryLabel ? { summaryLabel: install.summaryLabel } : {}),
    ...(install.sections.length > 0 ? { sections: install.sections } : {}),
    // 第三段标题只随**安装活动**出现——纯插件通知的面板不该凭空多一行「已有结果」（那时下面
    // 根本没有安装 job，标题会指向一堆无关的插件消息）。在途两段或已有终态，二者居一即带标题。
    ...(install.resultLabel ? { resultLabel: install.resultLabel, resultSummary: install.resultSummary } : {}),
    groups,
    // E6#72d：该弹的未读通知 + 面板当前收着 → 请求池自动展开。
    // 「面板已开」时不再请求（不二次打扰正在看的人）；池打开面板会回传开合镜像 →
    // 本值回落 false，故不存在「关掉又被弹开」的反复。
    // E6#73a：回落**只**靠开合镜像，不再依赖 unread 归零——唤醒开面板不认账（§五 B），
    // 未读会照常留着。
    // E6#73b：判据换成唤醒白名单（`shouldWake`）。**门禁只有 `!isNotifPanelOpen()` 一项**——
    // 最小化态在镜像里同样「不是开着的」，于是白名单条目照常把它弹回来，这正是 R5-4/R5-5 要的
    // 「最小化不是永久静音、出结果必冒出来」；`!isNotifMinimized()` 这一项**故意不写**（见 shouldWake）。
    autoOpen:
      !isNotifPanelOpen() && notifications.some((n) => !_seenIds.has(n.id) && shouldWake(n)),
  };
}
