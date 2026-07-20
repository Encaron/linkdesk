/**
 * 布局持久化服务——Phase 5 盲区 11（P1）。
 * Phase 5 拆 PreferenceService：标签页布局 + 卡片布局独立管理。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §盲区11 + §4.1
 *
 * 硬约束（设计方案 §1.5）：workspace.json 禁止嵌套，必须是一层平铺数组。
 */

import type { LayoutData } from "../hooks/useTabManager";

/* ── 类型 ── */

export interface CardLayout {
  id: string;        // 卡片实例 ID
  cardId: string;    // 卡片类型 ID（如 "waveform" / "gauge"）
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

export interface WorkspaceLayout {
  tabs: LayoutData;
  cards: CardLayout[];
}

/* ── 文件系统依赖 ── */

let fsApi: typeof import("@tauri-apps/plugin-fs") | null = null;
let pathApi: typeof import("@tauri-apps/api/path") | null = null;

async function ensureTauri(): Promise<boolean> {
  if (!(window as any).__TAURI__) return false;
  if (fsApi && pathApi) return true;
  try {
    fsApi = await import("@tauri-apps/plugin-fs");
    pathApi = await import("@tauri-apps/api/path");
    return true;
  } catch {
    return false;
  }
}

/* ── 读写 ── */

let _layoutPath: string | null = null;
let _layoutCache: WorkspaceLayout = { tabs: { groups: [], activeGroupId: "" }, cards: [] };

async function layoutPath(): Promise<string> {
  if (!_layoutPath && pathApi) {
    _layoutPath = await pathApi.join(await pathApi.appDataDir(), "layout.json");
  }
  return _layoutPath || "layout.json";
}

/** 初始化——App 启动时调一次。Tauri 模式优先读 layout.json，不存在或损坏则读 localStorage 兜底 */
export async function initLayoutService(): Promise<void> {
  if (!(await ensureTauri())) {
    try {
      const raw = localStorage.getItem("v3_layout");
      if (raw) _layoutCache = JSON.parse(raw);
    } catch { /* ignore */ }
    return;
  }

  // Tauri 模式：优先读文件
  try {
    const path = await layoutPath();
    if (await fsApi!.exists(path)) {
      const raw = await fsApi!.readTextFile(path);
      _layoutCache = JSON.parse(raw);
      return;
    }
  } catch { /* 文件不存在或损坏 */ }

  // 文件不可用 → localStorage 兜底（Tauri 异步写盘未完成的竞态窗口）
  try {
    const raw = localStorage.getItem("v3_layout");
    if (raw) _layoutCache = JSON.parse(raw);
  } catch { /* ignore */ }
}

/** 读取标签页布局 */
export function getTabLayout(): LayoutData {
  return _layoutCache.tabs;
}

/** 读取卡片布局 */
export function getCardLayout(): CardLayout[] {
  return _layoutCache.cards;
}

/** 保存标签页布局 */
export async function saveTabLayout(tabs: LayoutData): Promise<void> {
  _layoutCache.tabs = tabs;
  await _persist();
}

/** 保存卡片布局 */
export async function saveCardLayout(cards: CardLayout[]): Promise<void> {
  _layoutCache.cards = cards;
  await _persist();
}

/** 保存工作区完整布局——Phase 7 workspace 导入导出用 */
export async function saveWorkspaceLayout(
  tabs: LayoutData,
  cards: CardLayout[]
): Promise<void> {
  _layoutCache = { tabs, cards };
  await _persist();
}

/** 加载工作区完整布局 */
export function getWorkspaceLayout(): WorkspaceLayout {
  return { ..._layoutCache, cards: [..._layoutCache.cards] };
}

/** Phase 7：按名称加载特定工作区布局——详见 memory workspace-import-export.md */
export async function loadNamedWorkspaceLayout(
  name: string
): Promise<WorkspaceLayout | null> {
  if (!(await ensureTauri()) || !pathApi || !fsApi) return null;
  try {
    const dir = await pathApi.join(await pathApi.appDataDir(), "workspaces");
    const path = await pathApi.join(dir, `${name}.json`);
    if (!(await fsApi.exists(path))) return null;
    const raw = await fsApi.readTextFile(path);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Phase 7：按名称保存工作区布局 */
export async function saveNamedWorkspaceLayout(
  name: string,
  layout: WorkspaceLayout
): Promise<void> {
  if (!(await ensureTauri()) || !pathApi || !fsApi) return;
  try {
    const dir = await pathApi.join(await pathApi.appDataDir(), "workspaces");
    if (!(await fsApi.exists(dir))) await fsApi.mkdir(dir, { recursive: true });
    const path = await pathApi.join(dir, `${name}.json`);
    await fsApi.writeTextFile(path, JSON.stringify(layout, null, 2));
  } catch { /* 静默 */ }
}

/* ── 持久化 ── */

async function _persist(): Promise<void> {
  // 始终写 localStorage
  try {
    localStorage.setItem("v3_layout", JSON.stringify(_layoutCache, null, 2));
  } catch { /* ignore */ }

  if (!(await ensureTauri()) || !fsApi) return;
  try {
    const path = await layoutPath();
    await fsApi.writeTextFile(path, JSON.stringify(_layoutCache, null, 2));
  } catch (e) {
    console.warn("[LayoutService] 写入 layout.json 失败:", e);
  }
}

/** 清空缓存（测试用） */
export function clearLayoutCache(): void {
  _layoutCache = { tabs: { groups: [], activeGroupId: "" }, cards: [] };
  _layoutPath = null;
}
