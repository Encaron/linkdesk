/**
 * 发行说明标签页的壳侧数据源——E6#57.13b/d（06-主软件更新 / 05-发行说明 §2.1-§2.6）。
 *
 * ## 一句话：**壳想、池画**
 *
 * 发行说明标签页是**壳内视图**（`SHELL_RENDERED_TYPES` 封闭集合成员，没有 plugin.json），
 * 它与第三方插件共用**同一个** `window.linkdesk`——所以「把取数口开给池」等价于「开给所有插件」，
 * 而契约的 update 面只有 `getState` 是**设计**（`linkdesk-api/update.ts` 的 🔴 段；05 §2.4
 * 「发行说明是壳自己的面，第三方插件没有读它的理由」）。
 * ⇒ 数据在**壳**这一侧取好（本模块），经 `pushLayout` 挂在标签页上推给池，池只画
 *   （`PoolTab.releaseNotes`，与 `detailPluginId` 同型的 per-tab 载荷，不是新范式）。
 * 同款先例：`#57.11` TitleBar 更新按钮（壳推 context key）、`#57.14` 关于页（`app:getProductInfo`）。
 *
 * ## 为什么是模块单例（而不是 React state）
 *
 * 数据有**三个发起方**：帮助菜单命令、通知面条目（`#57.13e`）、首启自动弹（`#57.13d`）——
 * 三者都在壳的**非组件**代码里（命令 handler / 启动序列），拿不到 React 上下文。
 * 模块单例 + 订阅（`useSyncExternalStore`）是唯一能让「命令改状态 → 组件重渲」成立又不违反
 * 硬约束 19（不做模块级 IPC 监听）的形状：本模块**不订阅任何 IPC**，只在被调用时取数。
 * 同款先例：`src/core/services/ui/toast.ts`（壳侧单例 + `_listeners` + StorageService）、
 * `src/hooks/useUpdateState.ts`（模块单例 + 引用计数）。
 *
 * ## 两处容易做错的地方（都已在实现里钉住）
 *
 * ① **缓存命中不经过加载态**（05 §2.4）——内存里已有内容时**不许**把态打回 `loading`，
 *    否则「本次会话第二次打开」「切换历史版本」都会闪一下骨架。骨架只留给真的一次冷拉取
 *    （mockup 03 Frame 3）。启动时的预热（`prewarmReleaseNotes`）就是为这条服务的：
 *    让「点菜单打开」这条最常见的路上，第一帧就有内容。
 * ② **竞态只认最后一次**（`_seq`）——快速连点两个历史版本时，先发的请求可能后回；
 *    没有序号守卫就会「选中的是 v0.1.0、正文是 v0.2.0」。同 `useUpdateState` 的约束 ③ 精神：
 *    取不可逆性小的那一侧。
 */

import { useSyncExternalStore } from "react";
import i18n from "../i18n";
import type { ReleaseNotes } from "../core/types/ipc/update";
import type { PoolReleaseNotesData, PoolReleaseNotesHistoryItem } from "../core/types/pool/poolLayout";
import { read, readSync, write } from "../core/services/configuration/StorageService";
import { getShellExposed } from "../core/api/linkdesk-api/surfaces";
import { pushToast } from "../core/services/ui/toast";
import { getShellUpdateApi } from "./useUpdateState";

/* ── 持久化：首启自动弹的「上次见过的版本」（#57.13d）── */

/** StorageService key——命名同 `toast-dismissed` / `workspace-folders` 的连字符惯例 */
const LAST_SEEN_KEY = "update-last-seen-version";

/**
 * 读「上次见过的版本」——`null` = 从没见过（首次安装）。
 *
 * ⚠️ 先 `readSync`（localStorage，同步、F5 安全）再回落到 `read`（文件，跨重启）——
 * `LayoutService` / `WorkspaceService` 的既有读法（`readSync(...) ?? await read(...)`），
 * 不是本模块自创。读失败一律当 `null`（「没见过」= 会弹一次，比「以为见过」= 永不弹安全）。
 */
export async function readLastSeenVersion(): Promise<string | null> {
  try {
    return readSync<string>(LAST_SEEN_KEY) ?? (await read<string>(LAST_SEEN_KEY)) ?? null;
  } catch {
    return null;
  }
}

/** 写「上次见过的版本」——**在弹出决策之后立刻写**（写失败不重试：宁可下次再弹一次，也不卡启动） */
export async function writeLastSeenVersion(version: string): Promise<void> {
  try {
    await write(LAST_SEEN_KEY, version);
  } catch {
    /* StorageService 不可用时静默——启动路径不许因持久化失败而中断 */
  }
}

/* ── 模块单例：态 + 订阅 ── */

/**
 * 壳侧态比 DTO 多三件事：原始 `ReleaseNotes`（切换版本 / 重试都要它的 `version` 做基准）、
 * 横幅**要宣告的那一版**、以及「已请求横幅但版本还不知道」。
 *
 * 🔴 **为什么横幅要记版本号，而不是一个布尔**：横幅文案是「检测到新版本 {{version}}…」，
 * 而 `{{version}}` 画的是**当前显示的那一版**（`data.version`）。左窄栏就在旁边——用户完全可能
 * 先看横幅、再点 `v0.1.54` 看看上一版改了什么。此时若横幅还在，它就会写成
 * 「检测到新版本 0.1.54」——**同一句话从真话变成假话**。记下宣告的那一版，
 * `bannerVersion === data.version` 才算数，切走即自动消失。
 *
 * `bannerPending` 存在的原因：首启自动弹（`#57.13d`）在**开标签页那一刻**还不知道最新版号
 * （要等取数回来）——所以先记账「要挂横幅」，等 `content` 落地时把 `notes.version` 填进去。
 */
type Phase = {
  data: PoolReleaseNotesData;
  notes: ReleaseNotes | null;
  /** 横幅宣告的版本——`null` = 无横幅。**只有与 `data.version` 相等时才画** */
  bannerVersion: string | null;
  /** 已请求横幅、版本未知——`content` 落地时填进 `bannerVersion` */
  bannerPending: boolean;
};

/**
 * 初值 = 「加载中」——**不是**「空」。
 * 标签页在首次 `openReleaseNotesTab()` 之前根本不存在，此值只会被那一刻的加载路径覆盖；
 * 而 05 §2.4 的三态里没有第四种，池拿到 `loading` 就画骨架（Frame 3），语义正确。
 */
let _phase: Phase = { data: { state: "loading" }, notes: null, bannerVersion: null, bannerPending: false };

const _listeners = new Set<() => void>();
/** 请求序号——只认最后一次（见文件头 ②） */
let _seq = 0;
/** 「所有版本」页面 URL 的进程内缓存（取自 `product.updateUrl`，见 `listPageUrl`） */
let _listUrl: string | undefined;

function _emit(next: Phase): void {
  _phase = next;
  for (const l of _listeners) l();
}

function _subscribe(cb: () => void): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

function _getSnapshot(): PoolReleaseNotesData {
  return _phase.data;
}

/* ── 显示文本（壳侧组装——显示文本铁律：池拿到什么画什么）── */

/**
 * 「所有版本」/ 空态「在 GitHub 上查看」的目标 URL —— **从 `product.updateUrl` 推**，
 * 不写死仓库地址（仓库名改过一次：`serial-v3` → `linkdesk`）。
 *
 * 🔴 主进程侧的同源推导在 `electron/services/update-release-notes.ts` 的 `listUrl()`
 * （`updateUrl` 去掉 `/latest` = **API** 列表端点）；本函数再做一步 `api.github.com/repos/O/R`
 * → `github.com/O/R` 的**页面**端点转换——两者都只从 `product.json.updateUrl` 出发，
 * 没有第二处真值源。改仓库地址 = 改 `product.json` 一处。
 *
 * 拿不到 `updateUrl`（dev 无 `product.json` / 非壳环境）⇒ `undefined`，渲染侧**不画**这些链接
 * ——空链接比没有链接更糟。
 */
function listPageUrl(updateUrl: string | undefined): string | undefined {
  if (!updateUrl) return undefined;
  const api = updateUrl.replace(/\/latest\/?$/, "");
  if (!api.startsWith("https://api.github.com/repos/")) return undefined;
  return api.replace("https://api.github.com/repos/", "https://github.com/");
}

/** 取一次「所有版本」页面 URL 并缓存（`getProductInfo` 只调一次，之后走缓存） */
async function _ensureListUrl(): Promise<string | undefined> {
  if (_listUrl !== undefined) return _listUrl || undefined;
  try {
    // 🔴 `getProductInfo` 是**壳内私有扩展**（不在插件契约里，见 surfaces.ts `ShellExposed.app`）
    // ⇒ 必须经 `getShellExposed()` 取，不能直接 `window.linkdesk.app.getProductInfo()`
    // （那样写 tsc 会报「契约上没有这个方法」）。非壳环境返回 `undefined` ⇒ 落到下面的 catch。
    const info = await getShellExposed()?.app.getProductInfo();
    _listUrl = listPageUrl(info?.product?.updateUrl) ?? "";
  } catch {
    _listUrl = "";
  }
  return _listUrl || undefined;
}

/** `2026 年 8 月 30 日` —— 头部副标题的日期段（走 i18n 的 locale，跟随语言） */
function _longDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(i18n.language, { year: "numeric", month: "long", day: "numeric" });
}

/** `08-30` —— 左窄栏每行的短日期。**不走 locale**（mockup 03 就是 `MM-DD`，切语言不该改它） */
function _shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}-${m[3]}` : iso;
}

/* ── 取数（三个入口都走这里）── */

/**
 * 拉一版发行说明并更新单例态。`version` 省略 = 最近一版。
 *
 * `opts.force`（04「发行说明刷新按钮」）＝ 绕过 24h 缓存现拉（主进程侧跳过命中短路）；
 * `opts.latestBefore` = 刷新发起前列表头那版的版本号——落地时比对出「有无新版」，成 `refreshNote`。
 *
 * 三条出口（05 §2.4 三态，"态由拉取结果唯一决定"）：
 *   成功            → `content`
 *   失败但有内存缓存 → **原地不动**（缓存兜底——设计写的是「有缓存直接渲染缓存版本说明」）
 *   失败且无缓存     → `empty`
 */
export async function loadReleaseNotes(
  version?: string,
  opts?: { force?: boolean; latestBefore?: string },
): Promise<void> {
  const api = getShellUpdateApi();
  if (!api) return; // 非壳环境（vitest / 预览页）——保持现状，不抛
  const seq = ++_seq;
  // 🔴 已有内容 ⇒ 不打回 loading（文件头 ①）。切换版本时正文**保持旧的那版**直到新的回来
  // ——不闪、也不撒谎（`version` 字段没变，池高亮的还是当前真正显示的那版）。
  // 刷新（force）同理不打回 loading，但要把 `refreshing` 相位置位——按钮转圈、正文保持（04 设计 §六②）。
  if (_phase.data.state !== "content") {
    _emit({ ..._phase, data: { state: "loading" } });
  } else if (opts?.force) {
    _emit({ ..._phase, data: { ..._phase.data, refreshing: true } });
  }
  try {
    const notes = await api.getReleaseNotes(version, opts?.force === true);
    if (seq !== _seq) return; // 竞态：已被更晚的请求取代
    const listUrl = await _ensureListUrl();
    if (seq !== _seq) return;
    // 首启自动弹：此刻才知道那版的说明拿到了没有——填进 bannerVersion（见 Phase 的 🔴 段）。
    //
    // 🔴 **两条同时成立才画横幅**（`#57.13h` 收尾时订正，2026-09-13）：
    //   ① `bannerPending`——这次取数是「宣告」，不是用户自己点开看（`primeReleaseNotes({banner:true})`
    //      是唯一的上闩点；左窄栏点某一版走 `selectReleaseNotesVersion`，那条路会先把它清掉）。
    //   ② `notes.version === announced`——**取数真把要宣告的那一版拿回来了**。
    //
    // ⚠️ ② 原来是写成 `version === undefined` 的（「只有取最新一版才配叫新版本」）。那个写法挡得住
    // 「用户点历史版本」，却挡不住真正会出事的另一路：**首启自动弹点名的就是你刚装上的那版**，
    // 而取数**可能回落**——缓存里没有它（升级前拉的，见主进程那条失效判据）、或离线走了缓存兜底时，
    // `notes.version` 是**列表头那版**（多半正是你刚替换掉的那版）⇒ 横幅会写
    // 「检测到新版本 0.1.54」，**同一句话从真话变成假话**（与 Phase 段说的那件事同型，只是换了个入口）。
    // 记下"要宣告的那一版"再比对，两种入口一并挡住：拿不回来就不画。
    const announced = version ?? notes.version;
    const bannerVersion =
      _phase.bannerPending && notes.version === announced ? notes.version : _phase.bannerVersion;
    // 刷新结果注记（04 设计 §六③）——只在 force 那一趟组装；普通取数不带该键（注记不残留）。
    // 主进程「失败走缓存兜底」**不抛** ⇒ hook 侧只能从 `source === "cache"` 识别「这次没拉到新数据」
    // ——刷新时它就是「刷新失败」，页内如实注记 + 通知面一条（设计：详情落回唯一通知面）。
    let refreshNote: string | undefined;
    if (opts?.force) {
      const latestAfter = notes.historical[0]?.version;
      if (notes.source === "cache") {
        refreshNote = i18n.t("刷新失败 · 正在显示本地缓存");
        pushToast({ source: "update", severity: "warning", ttl: 0, message: refreshNote });
      } else if (latestAfter !== undefined && latestAfter !== opts.latestBefore) {
        // 有新版（列表头变了）——正文保持用户正看的那版（不搬视线），指路左窄栏
        refreshNote =
          opts.latestBefore !== undefined
            ? i18n.t("已发现新版本 {{version}}——在左侧选择查看", { version: latestAfter })
            : i18n.t("已是最新"); // 空态刷新成功（无旧列表可比）——拿到列表本身就是「是最新」
      } else if (latestAfter !== undefined) {
        refreshNote = i18n.t("已是最新");
      }
    }
    _emit({
      notes,
      bannerVersion,
      bannerPending: false,
      data: {
        state: "content",
        version: notes.version,
        subtitle: i18n.t("{{date}} · 稳定通道", { date: _longDate(notes.publishedAt) }),
        // ⚠️ 数据源是 `/releases/latest`，该端点**按 GitHub 定义不含预发布** ⇒ 恒稳定通道。
        //    将来真加预览通道（换端点）时这里必须跟着变，否则徽标开始撒谎。
        channelLabel: i18n.t("稳定版"),
        body: notes.body,
        historical: notes.historical.map((h): PoolReleaseNotesHistoryItem => ({
          version: h.version,
          dateLabel: _shortDate(h.publishedAt),
        })),
        // 横幅只在「宣告的那一版正显示着」时才画（用户点到历史版本上就该消失，见 Phase 的 🔴 段）。
        // 句子在壳侧成完再推（池零自产文本——`poolLayout.ts` 该字段的注释有理由）。
        ...(bannerVersion !== null && bannerVersion === notes.version
          ? { banner: i18n.t("检测到新版本 {{version}}，已自动打开本页。这是本次更新的内容。", { version: notes.version }) }
          : {}),
        ...(refreshNote !== undefined ? { refreshNote } : {}),
        ...(listUrl ? { listUrl } : {}),
      },
    });
  } catch {
    if (seq !== _seq) return;
    // 有内存缓存 ⇒ 静默保持（缓存兜底）。**注意这里不报错、不出声**——05 §2.4 定的：
    // 「更新检查失败」才落通知面，发行说明拉不到只在本页内降级，二者各管各的。
    // 🔴 唯一例外：**刷新**必须如实反馈（04 设计 §六③「所有失败面」）——走到这 = 主进程抛错
    //    （磁盘缓存也没了），正文是内存里那份旧内容，跟兜底一回事 ⇒ 注记 + 铃铛都不能少。
    //    普通取数（切版本/重试）失败仍静默保持——refreshing 只在 force 那一趟置位，天然分流。
    if (_phase.data.state === "content") {
      if (_phase.data.refreshing) {
        const note = i18n.t("刷新失败 · 正在显示本地缓存");
        _emit({ ..._phase, data: { ..._phase.data, refreshing: false, refreshNote: note } });
        pushToast({ source: "update", severity: "warning", ttl: 0, message: note });
      }
      return;
    }
    const listUrl = await _ensureListUrl();
    if (seq !== _seq) return;
    // 空态：**一个字都不传**（所有字都是池侧静态文案，见 PoolReleaseNotesData 的 🔴 段）。
    // 横幅记账一并作废——拉不到就没有「新版本」可宣告。
    _emit({
      notes: null,
      bannerVersion: null,
      bannerPending: false,
      data: { state: "empty", ...(listUrl ? { listUrl } : {}) },
    });
  }
}

/** 左窄栏点某一版 / 通知面条目定位到某一版（`#57.13e`）——都是「换一版重新取数」 */
export function selectReleaseNotesVersion(version: string): void {
  // 🔴 **用户自己点开的不算「宣告」**——先撤掉横幅待办再取数。
  // 横幅判据的①（`bannerPending`）必须确实等于「这次取数是自动弹那一次」；本函数不走
  // `primeReleaseNotes`（它是「换一版」不是「开页」），不清的话，一旦与首启自动弹抢在同一拍上，
  // 被点的那一版就会顶着「检测到新版本」画出来（正是那条判据要挡的事）。
  _phase = { ..._phase, bannerPending: false };
  void loadReleaseNotes(version);
}

/** 空态「重试」 */
export function retryReleaseNotes(): void {
  void loadReleaseNotes(_phase.notes?.version);
}

/**
 * 「刷新」——绕过 24h 缓存现拉最新列表（04「发行说明刷新按钮」，池经 `update.releaseNotesRefresh` 到这）。
 *
 * 🔴 语义与「重试」不合并（04 设计 §三）：重试 = 「刚才那一版再来一次」，刷新 = 「现在有没有新的」。
 * 🔴 刷新**不搬走视线**（04 设计 §五待拍板①，按推荐拍板 2026-09-26）：保持当前所选版本重新取数；
 * 有新版时正文不变、`refreshNote` 指路左窄栏——正在读旧版的人不被打断。
 */
export function refreshReleaseNotes(): void {
  const current = _phase.data.state === "content" ? _phase.data.version : _phase.notes?.version;
  void loadReleaseNotes(current, { force: true, latestBefore: _phase.notes?.historical[0]?.version });
}

/**
 * 收起横幅 = **删掉 `banner` 键**（`PoolReleaseNotesData` 里没有布尔位，`undefined` 才是「不画」）。
 *
 * 写成一个具名函数而不是就地解构丢弃：`const { banner, ...rest }` 那个 `banner` 绑定**只为被丢掉而存在**，
 * 白占一行还撞 `noUnusedLocals`；浅拷贝 + `delete` 无此问题（`banner` 是可选键，`delete` 合法）。
 */
function _hideBanner(data: PoolReleaseNotesData): PoolReleaseNotesData {
  if (data.state !== "content" || data.banner === undefined) return data;
  const next = { ...data };
  delete next.banner;
  return next;
}

/** 横幅「知道了」——收起横幅，**不**动 `lastSeenVersion`（那是「已弹过」的账，`#57.13d` 写的） */
export function dismissReleaseNotesBanner(): void {
  if (_phase.bannerVersion === null && !_phase.bannerPending) return;
  // `bannerPending` 也要清：还没取到版本就点了「知道了」，说明用户不想看——取数回来不该又冒出来
  _emit({
    ..._phase,
    bannerVersion: null,
    bannerPending: false,
    data: _hideBanner(_phase.data),
  });
}

/**
 * 打开标签页时调用——**先设态再开 tab**，顺序不能反（同 `usePoolSync` 的「先 setValue 再组装推送」）：
 * 反过来则池渲染第一帧读到的是上一次的态。
 *
 * #57.13 的三个发起方**都走这一个入口**（`releaseNotesCommands` 的菜单命令 / 通知面 `#57.13e` /
 * 首启自动弹 `#57.13d`），差别只在参数——这样「打开标签页」这件事全仓只有一处写法。
 *
 * 🔴 **返回取数 Promise，且调用方必须在 `openTab` 之后才 await 它**（`#57.13d` 加的）：
 * 本函数**不是 `async`**——函数体（设态 + 发 `loading`）是**同步跑完**的，返回的只是那次取数的
 * 尾巴。这条形状是为了让「设态」与「开 tab」之间**一个 await 都没有**：一旦写成 `async`，
 * 第一句 `_phase = …` 会落在微任务里，`openTab` 就有可能先跑 ⇒ 池第一帧读到旧态（正是上面那条
 * 要防的）。`loadReleaseNotes` 内部自吞异常、**永不 reject**，所以调用方忽略返回值（浮动
 * Promise）也安全。
 *
 * 尾部为什么要能 await：`#57.13d` 的「失败（离线）→ 不打扰，下次启动再试」（05 §2.5）需要一个
 * 「取数结束了没」的时刻——只有它落地后才知道该不该记 `lastSeenVersion`，见 `releaseNotesOnLaunch.ts`。
 *
 * @param opts.banner 首启自动弹的那一次传 `true`（横幅 + `lastSeenVersion` 由调用方负责）
 * @param opts.version 通知面条目定位到某一版
 */
export function primeReleaseNotes(opts?: { banner?: boolean; version?: string }): Promise<void> {
  _phase = { ..._phase, bannerVersion: null, bannerPending: opts?.banner === true };
  return loadReleaseNotes(opts?.version);
}

/**
 * 读一次当前态——**给非组件代码的唯一出口**（`useReleaseNotes()` 是给 React 组件的：订阅 + 重渲）。
 *
 * 目前唯一消费者 = `src/App/releaseNotesOnLaunch.ts`（`#57.13d` 判「这次首启的内容真拿到了吗」）。
 * 不给池、不进 DTO——池拿的是 `pushLayout` 推过去的那份快照。
 */
export function getReleaseNotesState(): PoolReleaseNotesData {
  return _phase.data;
}

/**
 * 启动时预热（`#57.13d` 接线调用，**不阻塞启动**）——让「点菜单打开」这条最常见的路上
 * 第一帧就有内容（05 §2.4「缓存命中不经过加载态」的落地手段）。
 * 主进程侧 24h 内命中磁盘缓存时**不出网**，所以这不是「每次启动都联网」。
 */
export function prewarmReleaseNotes(): void {
  if (_phase.notes || _phase.data.state === "empty") return; // 已有数据，不重复
  void loadReleaseNotes();
}

/* ── 池侧消费 ── */

/** 壳组件订阅发行说明态——目前**没有**壳组件消费它（数据经 `usePoolSync` 推给池），
 *  保留给 `#57.13e` 的通知面判定与后续壳侧消费方；`useSyncExternalStore` 保证
 *  「命令改态 → 壳重渲 → 重推布局」这条链成立。 */
export function useReleaseNotes(): PoolReleaseNotesData {
  return useSyncExternalStore(_subscribe, _getSnapshot);
}

/** 测试用：复位单例（模块级状态，`beforeEach` 必须清——同 `toast.ts` 的 clear 先例） */
export function resetReleaseNotesForTest(): void {
  _phase = { data: { state: "loading" }, notes: null, bannerVersion: null, bannerPending: false };
  _listUrl = undefined;
  _seq = 0;
  _listeners.clear();
}
