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

import type { LayoutData } from "../../../hooks/useTabManager";
import { read, readSync, write, writeSync } from "../configuration/StorageService";
import { getWorkspaceWindowId } from "./WorkspaceService"; // E6#47c：布局按窗隔离（key 加窗维度）
import { exists, readFile, writeFile, createDir, joinPath, appDataDir } from "../files/FileService";

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

/** E5.7#63.7：底部面板布局状态——高度 + 激活视图（views 列表来自 contributes 注册，不持久化）
 *  E5.8#31：加 visible——面板显隐持久化（Ctrl+J）。缺省（旧布局无此字段）→ 视为可见（?? true）
 *  E5.8#36.9：加 edge/align/width——面板位置/对齐持久化（#37.7 dockTo/setAlign 消费方）。旧状态仅 height → bottom+center 向后兼容 */
export interface PanelLayoutState {
  height: number;
  /** 🆕 E5.8#36.9：面板 dock 边——启动恢复 dockTo("panel", edge)。缺省 "bottom"。 */
  edge?: "bottom" | "top" | "left" | "right";
  /** 🆕 E5.8#36.9：面板横向对齐——启动恢复 setAlign("panel", align)。缺省 "center"。 */
  align?: "left" | "center" | "right" | "justify";
  /** 🆕 E5.8#36.9：面板宽——edge∈{left,right} 时（竖条宽，池 grid 消费）。缺省 300。 */
  width?: number;
  activeViewId?: string;
  visible?: boolean;
}

/** E5.8#36.9：侧栏布局状态——edge 持久化（#37.6 侧栏换边消费方）。旧布局无此字段 → 缺省 "left"。 */
export interface SidebarLayoutState {
  edge?: "left" | "right";
}

/** E5.8#43-3：脱出窗持久化状态——重启/F5 恢复浮窗（I9-15）。此刻浮窗无 tab（tab 归属随 #44 拖出后扩展），仅落盘窗口矩形。 */
export interface DetachedWindowState {
  /** 壳生成 id——主进程按 id 幂等建/复窗 */
  windowId: string;
  /** 上次落盘的窗口矩形——重启 createPoolWindow 用（越界钳制主进程做，I9-14） */
  bounds: { x: number; y: number; width: number; height: number };
}

export interface WorkspaceLayout {
  tabs: LayoutData;
  cards: CardLayout[];
  /** 底部面板状态——未启用过面板则缺省 */
  panel?: PanelLayoutState;
  /** 🆕 E5.8#36.9：侧栏状态——edge 持久化（#37.6 换边）。未设置过则缺省（不落盘） */
  sidebar?: SidebarLayoutState;
  /** 🆕 E5.8#43-3：脱出窗清单——bounds 落盘（A6/I9-14），重启恢复建窗源。未脱出过则缺省（不落盘） */
  detachedWindows?: DetachedWindowState[];
}

/* ── 缓存 ── */

/**
 * E6#47c：布局持久化 key 加窗维度——每窗一份 UI 布局（标签页/侧栏/面板），
 * 否则多窗共用 "layout"：后开窗的初始化会把先开窗的侧栏/面板状态覆盖掉
 * （2026-09-13 CDP 实证：首窗侧栏变空 placehold，罪魁 = 共享 key）。
 * 与 WorkspaceService 的 `workspace-folders:<wsId>` 同款；非窗环境回落 ws-1。
 */
function layoutStorageKey(): string {
  return `layout:${getWorkspaceWindowId()}`;
}

let _layoutCache: WorkspaceLayout = { tabs: { groups: [], activeGroupId: "" }, cards: [] };

/* ── 初始化 ── */

/** 初始化——App 启动时调一次。StorageService 统一读写，优先 localStorage，文件兜底。 */
export async function initLayoutService(): Promise<void> {
  // E5.8#71：read() 已归一为文件优先（文件 = 真相）。布局的 beforeunload 保底
  // （syncWriteLayout 写 localStorage-only，beforeunload 无法异步 I/O）是「关窗瞬间最后状态」通道，
  // 在此显式 readSync 优先——仅当 localStorage 无数据才落 read() 文件兜底。
  // E6#47c：本窗 key 优先；**仅首窗**（隐式 ws-1）回落旧全局 key——单窗时代布局零迁移沿用，
  // 第二窗起绝不捡别人的布局（那是共享 key 的老 bug 换壳复活）。
  const saved = readSync<WorkspaceLayout>(layoutStorageKey())
    ?? (await read<WorkspaceLayout>(layoutStorageKey()))
    ?? (getWorkspaceWindowId() === "ws-1"
      ? (readSync<WorkspaceLayout>("layout") ?? (await read<WorkspaceLayout>("layout")))
      : null);
  if (saved) {
    _layoutCache = saved;
  }
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

/** E5.7#63.7：读取底部面板布局状态 */
export function getPanelLayout(): PanelLayoutState | undefined {
  return _layoutCache.panel;
}

/** E5.8#36.9：读取侧栏布局状态 */
export function getSidebarLayout(): SidebarLayoutState | undefined {
  return _layoutCache.sidebar;
}

/** E5.8#43-3：读取脱出窗清单——重启恢复建窗源（I9-15）。无则空数组 */
export function getDetachedWindows(): DetachedWindowState[] {
  return _layoutCache.detachedWindows ?? [];
}

/* ── 保存 ── */

/** 保存标签页布局 */
export async function saveTabLayout(tabs: LayoutData): Promise<void> {
  _layoutCache.tabs = tabs;
  await write(layoutStorageKey(), _layoutCache);
}

/** 保存卡片布局 */
export async function saveCardLayout(cards: CardLayout[]): Promise<void> {
  _layoutCache.cards = cards;
  await write(layoutStorageKey(), _layoutCache);
}

/** 保存工作区完整布局——Phase 7 workspace 导入导出用（panel 状态保留，不被整体替换冲掉） */
export async function saveWorkspaceLayout(
  tabs: LayoutData,
  cards: CardLayout[]
): Promise<void> {
  _layoutCache = { tabs, cards, ...(_layoutCache.panel ? { panel: _layoutCache.panel } : {}) };
  await write(layoutStorageKey(), _layoutCache);
}

/** E5.7#63.7：保存底部面板布局状态 */
export async function savePanelLayout(panel: PanelLayoutState): Promise<void> {
  _layoutCache.panel = panel;
  await write(layoutStorageKey(), _layoutCache);
}

/** E5.8#36.9：保存侧栏布局状态 */
export async function saveSidebarLayout(sidebar: SidebarLayoutState): Promise<void> {
  _layoutCache.sidebar = sidebar;
  await write(layoutStorageKey(), _layoutCache);
}

/** E5.8#43-3：保存脱出窗清单——bounds 落盘（A6/I9-14），整表替换（壳注册表是脱出窗唯一真相源） */
export async function saveDetachedWindows(windows: DetachedWindowState[]): Promise<void> {
  _layoutCache.detachedWindows = windows;
  await write(layoutStorageKey(), _layoutCache);
}

/**
 * Phase 5f：同步写入——beforeunload 专用。
 * beforeunload 期间不能做异步 I/O，用 writeSync 写 localStorage 保底。
 * E5.8#71：read() 已文件优先归一——保底在 initLayoutService 显式 readSync 优先读回
 * （仅 localStorage 无数据才落文件），此处写入的 localStorage 即「关窗瞬间最后状态」。
 */
export function syncWriteLayout(layout: WorkspaceLayout): void {
  _layoutCache = layout;
  writeSync(layoutStorageKey(), _layoutCache);
}

/* ── 具名工作区（Phase 7） ── */

/** Phase 7：按名称加载特定工作区布局——详见 memory workspace-import-export.md */
export async function loadNamedWorkspaceLayout(
  name: string
): Promise<WorkspaceLayout | null> {
  // E2c #19c：统一走 FileService
  try {
    const dir = await joinPath(await appDataDir(), "workspaces");
    const filePath = await joinPath(dir, `${name}.json`);
    if (!(await exists(filePath))) return null;
    const raw = await readFile(filePath);
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
  // E2c #19c：统一走 FileService
  try {
    const dir = await joinPath(await appDataDir(), "workspaces");
    if (!(await exists(dir))) await createDir(dir);
    const filePath = await joinPath(dir, `${name}.json`);
    await writeFile(filePath, JSON.stringify(layout, null, 2));
  } catch { /* 静默 */ }
}

/** 清空缓存（测试用） */
export function clearLayoutCache(): void {
  _layoutCache = { tabs: { groups: [], activeGroupId: "" }, cards: [] };
}
