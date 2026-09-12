/**
 * useAbout——E6#57.14 壳侧取数：关于标签页的数据源（**壳想、池画**的壳那一半）。
 * 设计：`docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/06-关于标签页.md` §4.2-§4.4。
 *
 * ## 为什么取数必须在这里（而不是池里）
 *
 * 🔴 **任务书 §4.2 原写「AboutView mount → `invoke(app:getProductInfo)`」——那句已作废**
 * （本格订正，同步改了设计文档）：`app:getProductInfo` 是**壳内私有扩展**，
 * `electron/preload-pool/namespaces-data.ts` 明文**池侧不暴露**（E6#27：池侧与契约零漂移）
 * ⇒ 池**根本调不到**这条路。正解是既有规矩：**壳取好 → 挂 `PoolTab.about` → 池只画**
 * （同 `#57.13` 发行说明；`preload-shell.ts:145` 的注释当年就写了「关于标签页 E6#57.14 数据源」）。
 *
 * ## 与 `useReleaseNotes` 的关系：同一形的第二个实例，不是新范式
 *
 * 结构逐条对齐（模块单例 + `useSyncExternalStore` + 命令驱动），**只有三处按本页的实情不同**
 * （每条都在下面就近注释了理由，免得后人以为是不一致的疏漏）：
 *   ① 数据**一次拉全就够**——本机 IPC 读 `product.json` + `process.versions`，无分页无重试
 *      ⇒ 没有 `_seq` 竞态守卫（`useReleaseNotes` 那个是为「切版本时先发后回」设的）；
 *   ② 值文本**原样透传**（版本号/提交哈希/版本字符串都是机器产出的标识符，不过 locale）；
 *   ③ 字段名**也归壳 `t()`**——见 `PoolAboutField.label` 的 🔴 段。
 *
 * ## `app:getProductInfo` 经 `getShellExposed()` 取，不直接 `window.linkdesk.app.…`
 *
 * 它在**插件契约上没有这个成员**（只有 `getVersion`），直接写会「运行时调得到、tsc 说没有」。
 * `getShellExposed()` 是壳侧私有面的**唯一运行时转型点**（`surfaces.ts` 明文）。
 * 非壳环境（vitest / 纯 Vite 预览）它返回 `undefined` ⇒ 走兜底分支，不抛。
 */

import { useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import type { ProductInfo } from "../core/types/ipc/product";
import type { PoolAboutData, PoolAboutField } from "../core/types/pool/poolLayout";
import { getShellExposed } from "../core/api/linkdesk-api/surfaces";
import { getAssetPath } from "../core/utils/path/assetPath";

/** 缺失值的显示占位——与 `electron/product.ts` 的 `PLACEHOLDER` 同字（07 §四.1「'—' 不崩」） */
const PLACEHOLDER = "—";

/**
 * 快照——**必须是「一个会被整体换掉的不可变对象」**，不能只存 `_raw`。
 *
 * 🔴 这里差点踩的坑（记下来，别改回去）：若 `getSnapshot` 返回 `_raw` 本身，则**取数失败**
 * 那条路上 `_raw` 恒为 `null` ⇒ `useSyncExternalStore` 的 `Object.is` 比较**看不到任何变化**
 * ⇒ 组件不重渲染 ⇒ 池**永远停在骨架**（态明明已经从 loading 变成 ready 了）。
 * 把「态」与「值」封成一个每次真变化就整体替换的对象，变化才是可见的。
 * 同族教训见 memory `snapshot-shadows-truth-bug-class`（快照遮蔽真值）。
 */
interface AboutSnap {
  /** 取数是否已落地（成功**或**失败——两种情况都不许让池停在骨架） */
  ready: boolean;
  /** 产品身份全量；`null` = 拿不到（非壳环境 / IPC 失败） */
  raw: ProductInfo | null;
}

let _snap: AboutSnap = { ready: false, raw: null };
/** 取数结果（`_load` 写、`primeAbout` 读）——与快照分开只为让「要不要再试一次」有判据 */
let _raw: ProductInfo | null = null;
const _listeners = new Set<() => void>();
/** 进行中的取数（硬约束 13 精神：第二次调用必须拿到**同一个** Promise，不能返回 undefined 另起一条） */
let _inflight: Promise<void> | null = null;

function _emit(): void {
  for (const l of _listeners) l();
}

function _subscribe(cb: () => void): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

function _getSnap(): AboutSnap {
  return _snap;
}

/**
 * 取一次产品身份——**会话内只成功拉一次**（`_raw` 到手后 `primeAbout` 直接返回）。
 *
 * ⚠️ 失败**不缓存失败态**：`_raw` 保持 `null` 而 `ready` 转 true，于是下一次开关于页
 * （`primeAbout` 见 `raw === null`）会再试一次。理由：这是本机 IPC，失败只可能是瞬时
 * （主进程还没注册 handler / 窗口刚起），**没有理由把一个瞬时故障固化成「本次会话永远看不到身份」**。
 */
async function _load(): Promise<void> {
  try {
    _raw = (await getShellExposed()?.app.getProductInfo()) ?? null;
  } catch {
    _raw = null;
  }
  _snap = { ready: true, raw: _raw };
  _inflight = null;
  _emit();
}

/**
 * 打开关于页**之前**先调它——壳侧取数（同 `primeReleaseNotes` 的角色）。
 *
 * ⚠️ **不 await 也能用**：`openAboutTab` 先调本函数（同步进入 `_load` 的第一段）、再同步开 tab、
 * **最后**才 await 返回的 Promise（`releaseNotesCommands.openReleaseNotesTab` 定下的顺序铁律：
 * 反过来会让池第一帧读旧载荷）。这里返回 Promise 只是为了给「开完要不要等」留口子。
 */
export function primeAbout(): Promise<void> {
  if (_snap.ready && _raw !== null) return Promise.resolve();
  if (_inflight) return _inflight; // 并发第二次调用：复用进行中的那条，不另起
  _inflight = _load();
  return _inflight;
}

/**
 * 组 DTO——**壳侧唯一的组装点**（池一个字都不拼）。
 *
 * 纯函数（入参 + `t` 决定输出，不读模块态）——所以 `useAbout` 能在语言切换时重算，
 * 而 `getAboutCopyText` 能拿到**与屏幕上一模一样**的那份标签（复制出去的中文/英文跟着界面走）。
 */
function buildAboutData(snap: AboutSnap, t: (key: string) => string): PoolAboutData {
  if (!snap.ready) return { state: "loading" };

  const product = snap.raw?.product;
  const runtime = snap.raw?.runtime;

  // 顺序 = 06 §4.2 的字段表顺序（版本/提交/日期/Electron/Chromium/Node.js/V8/OS）。
  // 值缺失一律落 PLACEHOLDER —— 先 `??` 再 `||`：空串也是「没有」，不能画成空白行。
  const fields: PoolAboutField[] = [
    { label: t("版本"), value: product?.version || PLACEHOLDER },
    { label: t("提交"), value: product?.commit || PLACEHOLDER },
    { label: t("日期"), value: product?.date || PLACEHOLDER },
    { label: t("Electron"), value: runtime?.electron || PLACEHOLDER },
    { label: t("Chromium"), value: runtime?.chromium || PLACEHOLDER },
    { label: t("Node.js"), value: runtime?.node || PLACEHOLDER },
    { label: t("V8"), value: runtime?.v8 || PLACEHOLDER },
    { label: t("OS"), value: runtime?.os || PLACEHOLDER },
  ];

  return {
    state: "content",
    // 「主软件」是**既有 i18n 键**（`usePoolSync/notif.ts` 的 `shellSourceName` 用同一个，
    // en = "LinkDesk"）。拿不到 `nameLong` 时用它兜底，而不是在代码里写死品牌名——
    // 品牌名的唯一真相源是 `electron/product.json`（`DEFAULT_PRODUCT.nameLong` 是它缺席时的兜底）。
    name: product?.nameLong || t("主软件"),
    // 品牌标——与 `usePoolSync` 推 `titleBar.logoUrl` 是**同一句 `getAssetPath("assets/logo.svg")`**
    // （唯一真相源 = `public/assets/logo.svg`；硬约束 12：资产路径一律走 `getAssetPath`）。
    logoUrl: getAssetPath("assets/logo.svg"),
    fields,
  };
}

/**
 * 非 React 读口——按**当前语言**现算一份 DTO（`getReleaseNotesState` 同款角色）。
 *
 * 两个消费者都不是组件：`getAboutCopyText`（下面那个）与测试。
 * ⚠️ 它**不订阅**——读的是此刻的快照，态变了不会通知你（那是 `useAbout` 的事）。
 */
export function getAboutState(): PoolAboutData {
  return buildAboutData(_snap, (k) => i18n.t(k));
}

/**
 * 「复制」要写进剪贴板的那串文本——**`key: value` 每行一条、`\n` 连接**（06 §4.3，对标 VS Code）。
 *
 * 🔴 在**壳侧**现算，不往池推：① 写剪贴板的是壳（`ClipboardService` 在 core，池够不着）；
 * ② 标签必须是**屏幕上那一份**（随语言变），而池只在渲染时 `t()`——把拼好的串推下去，
 * 语言一切换就与按钮下的字段表对不上了。现算 = 永远同源。
 *
 * `null` = 还没取到数（理论上点不到——按钮在 `content` 态才画；真出现就当无事发生，不写空串进剪贴板）。
 */
export function getAboutCopyText(): string | null {
  const data = getAboutState();
  if (data.state !== "content") return null;
  return data.fields.map((f) => `${f.label}: ${f.value}`).join("\n");
}

/**
 * 壳侧订阅口——`usePoolSync` 在组装推送载荷时调它（**不是**池里调的）。
 *
 * `useMemo` 的依赖里**必须带 `t`**：语言切换时 `t` 换引用 ⇒ 重新组装 ⇒ 「版本/提交/日期」
 * 跟着变语言。少了它，界面切英文而关于页字段名还是中文（同理 `usePoolSync` 的推送 effect
 * 也把 `t` 放进了 deps，两处一环扣一环，缺一处都漏）。
 */
export function useAbout(): PoolAboutData {
  const { t } = useTranslation();
  const snap = useSyncExternalStore(_subscribe, _getSnap);
  return useMemo(() => buildAboutData(snap, t), [snap, t]);
}

/** 测试辅助：清模块单例（`useReleaseNotes.resetReleaseNotesForTest` 同款） */
export function resetAboutForTest(): void {
  _snap = { ready: false, raw: null };
  _raw = null;
  _inflight = null;
  _listeners.clear();
}
