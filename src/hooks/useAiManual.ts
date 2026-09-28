/**
 * useAiManual——M3 `AI#16` 壳侧取数：AI 操作手册标签页的数据源（**壳想、池画**的壳那一半）。
 *
 * ## 与 `useAbout` / `useReleaseNotes` 的关系：同一形的第三个实例，不是新范式
 *
 * 结构逐条对齐（模块单例 + `useSyncExternalStore` + `prime*` 由命令先调），**只有两处按本页实情不同**
 * （各在下面就近注明理由，免得后人当成不一致的疏漏）：
 *   ① 数据**一次拉全就够**——本机 IPC 读几十 KB 只读文本，无分页无重试 ⇒ 无 `_seq` 竞态守卫
 *      （那是 `useReleaseNotes` 为「切版本先发后回」设的）；
 *   ② **不组装文字**——手册正文与章标题都是**文档内容**（中文原文，随包发货），不像关于页那样
 *      有一堆要 `t()` 的字段名。所以本 hook 比 `useAbout` 薄：只做「三态判定 + 原样搬运」，
 *      视图文案（版本标签、空态句）由池在渲染时 `t()`。
 *
 * ## `app:getAiManual` 经 `getShellExposed()` 取，不直接 `window.linkdesk.app.…`
 *
 * 它在**插件契约上没有这个成员**（只有 `getVersion`），直接写会「运行时调得到、tsc 说没有」。
 * `getShellExposed()` 是壳侧私有面的**唯一运行时转型点**（`surfaces.ts` 明文）。
 * 非壳环境（vitest / 纯 Vite 预览）返回 `undefined` ⇒ 落 `empty` 态，不抛。
 *
 * ## 快照 = **DTO 本身**（不是「态 + 值」）

 * 🔴 **引用稳定性是硬要求**：本 hook 的返回值进 `usePoolSync` 主推送 effect 的 deps
 * （`useAbout` / `useReleaseNotes` 同款）。若 `getSnapshot` 每次**现算**一个新对象，
 * `useSyncExternalStore` 的 `Object.is` 恒假 ⇒ 无限重渲染（并连带推送风暴）。
 * 所以 DTO 在**态真变化时**整体替换、稳态下引用恒等（`useReleaseNotes` 的 `_getSnapshot`
 * 直接返回 `_phase.data` 是同一条取舍）。
 * 同族教训见 memory `snapshot-shadows-truth-bug-class`（快照遮蔽真值）。
 */

import { useSyncExternalStore } from "react";
import type { PoolAiManualChapter, PoolAiManualData } from "../core/types/pool/poolLayout";
import { getShellExposed } from "../core/api/linkdesk-api/surfaces";

/** 主进程 `app:getAiManual` 回包——与 `electron/services/ai-manual.ts` 的 `AiManualPayload` 同形。
 *  ⚠️ 按**结构**声明（不 import `types/ipc/aiManual`）：那一份是**跨堆 wire 契约**
 *  （主进程 ↔ 壳 preload），而这里要的是「壳转手给池」的中间形状——两岸各一份，
 *  同 `windowLayout.ts` 对 `PoolAiManualChapter` 的取舍。字段名三者对齐，改名时三处同改。 */
interface AiManualPayload {
  version: string;
  chapters: Array<{ id: string; title: string; markdown: string }>;
  dir: string;
}

/* M3 `AI#16` EXEMPT：下面这段（单例槽 + 订阅三件）与 `useAbout.ts` / `useReleaseNotes.ts` 的
   结构性重复是**「模块单例 + useSyncExternalStore」这个模具本身**——三个 hook 各是一份独立单例
   （拆成共享工厂会把「各自单例边界在哪」这件最该一眼看清的事藏进泛型参数里，且要同笔改两个
   已发版行为的 hook）。同型先例：`useAbout`/`useReleaseNotes` 本就同形，本文件是第三个实例。 */
/* jscpd:ignore-start */
/** 唯一快照——**对象整体替换**（见文件头 🔴 段） */
let _data: PoolAiManualData = { state: "loading" };
/** 取数结果（`_load` 写、`primeAiManual` 读）——与快照分开只为让「要不要再试一次」有判据 */
let _raw: AiManualPayload | null = null;
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

function _getSnapshot(): PoolAiManualData {
  return _data;
}
/* jscpd:ignore-end */

/**
 * 回包 → 池 DTO（纯函数，入参决定输出，不读模块态——测试与 `useAiManual` 共用同一份判定）。
 *
 * `ready` 之前 = `loading`。`ready` 之后：回包缺席或**零章**都落 `empty`
 * （「这个构建没带手册」与「非壳环境取不到」对读者是同一件事，理由见 `PoolAiManualData` 的 ⚠️ 段）。
 */
export function toAiManualData(raw: AiManualPayload | null, ready: boolean): PoolAiManualData {
  if (!ready) return { state: "loading" };
  if (!raw || raw.chapters.length === 0) return { state: "empty", dir: raw?.dir ?? "" };
  return {
    state: "content",
    version: raw.version,
    // 逐章显式搬运（`useReleaseNotes.ts` 对 `historical` 的同款标注）。两岸同形 ⇒ 直传也过，
    // 写出来是为了让**边界的类型名**（`PoolAiManualChapter`）在壳侧有具名消费方：
    // 「壳的岸 → 池的岸」这一步在代码里看得见，而不是靠 reader 去比对两个结构。
    chapters: raw.chapters.map((c): PoolAiManualChapter => ({
      id: c.id,
      title: c.title,
      markdown: c.markdown,
    })),
  };
}

/**
 * 取一次手册——**会话内只成功拉一次**（`_raw` 到手后 `primeAiManual` 直接返回）。
 *
 * ⚠️ 失败**不缓存失败态**：`_raw` 保持 `null` 而态转 `empty` ⇒ 下一次开手册页再试一次
 * （同 `useAbout._load` 的理由：本机 IPC 的失败只可能是瞬时——主进程 handler 还没注册、
 * 窗口刚起——没有理由把瞬时故障固化成「本次会话永远看不到手册」）。
 */
async function _load(): Promise<void> {
  try {
    _raw = (await getShellExposed()?.app.getAiManual()) ?? null;
  } catch {
    _raw = null;
  }
  _data = toAiManualData(_raw, true);
  _inflight = null;
  _emit();
}

/**
 * 打开手册页**之前**先调它——壳侧取数（`primeAbout` / `primeReleaseNotes` 同角色）。
 *
 * ⚠️ **不 await 也能用**：`openAiManualTab` 先调本函数（同步进入 `_load` 第一段）、再同步开 tab、
 * **最后**才 await（`releaseNotesCommands.openReleaseNotesTab` 定下的顺序铁律：反过来会让池第一帧读旧载荷）。
 */
export function primeAiManual(): Promise<void> {
  if (_data.state !== "loading" && _raw !== null) return Promise.resolve();
  if (_inflight) return _inflight; // 并发第二次调用：复用进行中的那条，不另起
  _inflight = _load();
  return _inflight;
}

/**
 * 非 React 读口——读此刻快照（`getAboutState` 同款角色，消费者 = 测试）。
 * ⚠️ 它**不订阅**：态变了不会通知你（那是 `useAiManual` 的事）。
 */
export function getAiManualState(): PoolAiManualData {
  return _data;
}

/** 壳侧订阅口——`usePoolSync` 组装推送载荷时调它（**不是**池里调的）。 */
export function useAiManual(): PoolAiManualData {
  return useSyncExternalStore(_subscribe, _getSnapshot);
}

/** 测试辅助：清模块单例（`resetAboutForTest` 同款） */
export function resetAiManualForTest(): void {
  _data = { state: "loading" };
  _raw = null;
  _inflight = null;
  _listeners.clear();
}
