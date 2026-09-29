/**
 * shellTabPriming——壳直渲染**数据标签页**的恢复期补数（prime）。
 *
 * ## 病根（2026-09-30 用户实机报）
 *
 * 「关于 LinkDesk」/「AI 操作手册」是壳直渲染的数据标签页：正常路径 = 命令 handler 先
 * `primeAbout()` / `primeAiManual()` 把数据取进壳侧 store、再开标签页（`aboutCommands.ts` /
 * `manualCommands.ts` 里「① 先设态 ② 再开 tab ③ await 放最后」那条铁律）。池只画载荷
 * （`usePoolSync` 经 `useAbout()` / `useAiManual()` 订阅盖章进 layout）。
 *
 * 而**两条恢复路径都只重建标签页列表、没人 prime**：
 *   ① 启动恢复（`tabActions.ts` 的 `restoreLayout`）；
 *   ② 导入工作区（`lifecycle.ts` 的 `workspace:restore` → `restoreTabLayout`）。
 * ⇒ 壳侧快照恒 `{ ready: false }` ⇒ 推给池的载荷恒 loading ⇒ **标签页永远停在骨架**
 * （使用者的原话「一直是等待状态」）。⭐ 同族的发行说明标签没这毛病，唯一原因是它有
 * `releaseNotesOnLaunch` 在启动期无条件预热——本件就是把同样的待遇补给另外两兄弟。
 *
 * ## 修法：恢复后按恢复出的标签页类型补 prime
 *
 * 两个恢复调用点（①②）各插一行 `primeRestoredShellDataTabs(恢复出的 tabs)`。要点：
 * - **幂等且便宜**：`primeAbout` / `primeAiManual` 本身会话内只成功取一次（`_raw` 到手直接返回），
 *   且取数失败也会落 `ready`（不许池停在骨架）——重复调用无副作用，所以这里**不判「是否已 prime」**
 *   （判了反而造第二份真相源）。
 * - **fire-and-forget**：store 落地后 `useSyncExternalStore` 自己触发重渲染与重推流，这里不 await、
 *   也不许阻塞恢复流程（同 `releaseNotesOnLaunch`「绝不阻塞启动」②）。动态 import 同命令层的取舍：
 *   不给 `src/App/` 的静态依赖图加指向 `src/hooks/`（React 模块）的新边。
 * - **只管 about / ai-manual 两种**：发行说明已由 `releaseNotesOnLaunch` 启动预热覆盖（含导入工作区
 *   的会话中途场景——预热在启动必跑）；别把三个类型都搬进来，那会让「发行说明为什么不用 prime」
 *   变成一个查不到答案的问题。
 */

import { ABOUT_TAB_TYPE, AI_MANUAL_TAB_TYPE } from "../core/utils/tabIdentity";

/** 恢复出（或导入进）的标签页里有壳数据标签页 ⇒ 补 prime，让载荷从 loading 走到 content */
export function primeRestoredShellDataTabs(tabs: ReadonlyArray<{ type?: string }>): void {
  const types = new Set(tabs.map((t) => t.type));
  if (types.has(ABOUT_TAB_TYPE)) {
    void import("../hooks/useAbout")
      .then((m) => m.primeAbout())
      .catch(() => { /* 非壳环境拿不到模块——池侧本就画兜底，不再抛 */ });
  }
  if (types.has(AI_MANUAL_TAB_TYPE)) {
    void import("../hooks/useAiManual")
      .then((m) => m.primeAiManual())
      .catch(() => { /* 同上 */ });
  }
}
