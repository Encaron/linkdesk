/**
 * 布局持久化服务——Phase 5 盲区 11（P1）。
 * Phase 5 拆 PreferenceService：标签页布局 + 卡片布局独立管理。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §盲区11 + §4.1
 *
 * 硬约束（设计方案 §1.5）：workspace.json 禁止嵌套，必须是一层平铺数组。
 *
 * Phase 5f：持久化归一化到 StorageService（read/write/writeSync）。
 * beforeunload 调用 syncWrite()——同步写 localStorage，下次启动补齐文件。
 */

import type { LayoutData } from "../hooks/useTabManager";
import { read, write, writeSync } from "./StorageService";

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

/* ── 缓存 ── */

let _layoutCache: WorkspaceLayout = { tabs: { groups: [], activeGroupId: "" }, cards: [] };

/* ── 初始化 ── */

/** 初始化——App 启动时调一次。StorageService 统一读写，优先 localStorage，文件兜底 */
export async function initLayoutService(): Promise<void> {
  const saved = await read<WorkspaceLayout>("layout");
  if (saved) _layoutCache = saved;
}

/* ── 读取 ── */

/** 读取标签页布局 */
export function getTabLayout(): LayoutData {
  return _layoutCache.tabs;
}

/** 读取卡片布局 */
export function getCardLayout(): CardLayout[] {
  return _layoutCache.cards;
}

/** 加载工作区完整布局 */
export function getWorkspaceLayout(): WorkspaceLayout {
  return { ..._layoutCache, cards: [..._layoutCache.cards] };
}

/* ── 保存 ── */

/** 保存标签页布局 */
export async function saveTabLayout(tabs: LayoutData): Promise<void> {
  _layoutCache.tabs = tabs;
  await write("layout", _layoutCache);
}

/** 保存卡片布局 */
export async function saveCardLayout(cards: CardLayout[]): Promise<void> {
  _layoutCache.cards = cards;
  await write("layout", _layoutCache);
}

/** 保存工作区完整布局——Phase 7 workspace 导入导出用 */
export async function saveWorkspaceLayout(
  tabs: LayoutData,
  cards: CardLayout[]
): Promise<void> {
  _layoutCache = { tabs, cards };
  await write("layout", _layoutCache);
}

/**
 * Phase 5f：同步写入——beforeunload 专用。
 * beforeunload 期间不能做异步 I/O，用 writeSync 写 localStorage 保底。
 * 下次启动时 initLayoutService 从 localStorage 读回，再异步写文件补齐。
 */
export function syncWriteLayout(layout: WorkspaceLayout): void {
  _layoutCache = layout;
  writeSync("layout", _layoutCache);
}

/* ── 具名工作区（Phase 7） ── */

/** Phase 7：按名称加载特定工作区布局——详见 memory workspace-import-export.md */
export async function loadNamedWorkspaceLayout(
  name: string
): Promise<WorkspaceLayout | null> {
  // 具名工作区存在独立目录（workspaces/），不走 StorageService
  let fsApi: typeof import("@tauri-apps/plugin-fs") | null = null;
  let pathApi: typeof import("@tauri-apps/api/path") | null = null;
  if (!(window as any).__TAURI__) return null;
  try {
    fsApi = await import("@tauri-apps/plugin-fs");
    pathApi = await import("@tauri-apps/api/path");
  } catch {
    return null;
  }
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
  let fsApi: typeof import("@tauri-apps/plugin-fs") | null = null;
  let pathApi: typeof import("@tauri-apps/api/path") | null = null;
  if (!(window as any).__TAURI__) return;
  try {
    fsApi = await import("@tauri-apps/plugin-fs");
    pathApi = await import("@tauri-apps/api/path");
  } catch {
    return;
  }
  try {
    const dir = await pathApi.join(await pathApi.appDataDir(), "workspaces");
    if (!(await fsApi.exists(dir))) await fsApi.mkdir(dir, { recursive: true });
    const path = await pathApi.join(dir, `${name}.json`);
    await fsApi.writeTextFile(path, JSON.stringify(layout, null, 2));
  } catch { /* 静默 */ }
}

/** 清空缓存（测试用） */
export function clearLayoutCache(): void {
  _layoutCache = { tabs: { groups: [], activeGroupId: "" }, cards: [] };
}
