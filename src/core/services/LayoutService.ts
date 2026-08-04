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

import type { LayoutData } from "../../hooks/useTabManager";
import { read, write, writeSync } from "./StorageService";
import { exists, readFile, writeFile, mkdir, joinPath, appDataDir } from "./FileService";
import { FALLBACK_PLUGIN_ID } from "../../utils/fallbackPluginId";

/* ── 类型 ── */

/**
 * B78 归一化：旧 tab identity 硬编码 id 集合。
 * 这些类型在 2026-07-21 前 generateId 返回固定字符串（如 "settings"），
 * 归一化后改为 `autoId(prefix)` → `settings-1` / `settings-2` ...。
 * 启动时自动迁移——将布局中的旧 id 映射到新 id（idempotent）。
 *
 * @deprecated 2026-07-21 (B78)。当所有用户的布局 JSON 已自动迁移为新格式后，
 *   此迁移逻辑可安全删除。预计 2026-09 后新用户不再产生旧格式布局。
 */
const LEGACY_TAB_IDS = new Set(["settings", "marketplace", FALLBACK_PLUGIN_ID, "oled"]);

function migrateLegacyTabIds(layout: WorkspaceLayout): WorkspaceLayout {
  let migrated = false;
  const newGroups = layout.tabs.groups.map((group) => {
    let groupChanged = false;
    const newTabs = group.tabs.map((tab) => {
      if (LEGACY_TAB_IDS.has(tab.id)) {
        groupChanged = true;
        migrated = true;
        const newId = `${tab.id}-1`;
        return {
          ...tab,
          id: newId,
          // sourceId 默认等于 tab.id（createTabDefaults line 114），同步迁移
          sourceId: tab.sourceId === tab.id ? newId : tab.sourceId,
        };
      }
      return tab;
    });
    if (!groupChanged) return group;
    const newActiveId = LEGACY_TAB_IDS.has(group.activeTabId) ? `${group.activeTabId}-1` : group.activeTabId;
    return { ...group, tabs: newTabs, activeTabId: newActiveId };
  });
  if (!migrated) return layout;
  // 异步回写——下次 saveTabLayout/syncWriteLayout 也会覆盖，但先写一份确保 crash 安全
  const migratedLayout = { ...layout, tabs: { ...layout.tabs, groups: newGroups } };
  write("layout", migratedLayout).catch(() => {});
  return migratedLayout;
}

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

/* ── E3i #70：插件改名布局迁移 ── */

/**
 * 插件改名后自动迁移布局中的旧 tab id。
 * flag 保证幂等——迁移过一次后不再重复。
 *
 * @param layout  当前布局
 * @param oldId   旧插件 ID（如 "terminal"）
 * @param newId   新插件 ID（如 "serial-monitor"）
 * @param flag    幂等标志——写入 layout 对象的 property name
 */
function migratePluginIdRename(
  layout: WorkspaceLayout,
  oldId: string,
  newId: string,
  flag: string
): WorkspaceLayout {
  if ((layout as unknown as Record<string, unknown>)[flag]) return layout;

  const oldPrefix = `${oldId}-`;
  const newPrefix = `${newId}-`;
  let migrated = false;

  const newGroups = layout.tabs.groups.map((group) => {
    const newTabs = group.tabs.map((tab) => {
      if (tab.id.startsWith(oldPrefix)) {
        migrated = true;
        const suffix = tab.id.slice(oldPrefix.length);
        return {
          ...tab,
          id: `${newPrefix}${suffix}`,
          type: tab.type === oldId ? newId : tab.type,
        };
      }
      return tab;
    });
    return { ...group, tabs: newTabs };
  });

  if (!migrated) {
    // 无需迁移但标记 flag——避免后续启动重复检查
    return { ...layout, [flag]: true };
  }

  const result = { ...layout, tabs: { ...layout.tabs, groups: newGroups }, [flag]: true };
  write("layout", result).catch(() => {});
  return result;
}

/* ── 初始化 ── */

/** 初始化——App 启动时调一次。StorageService 统一读写，优先 localStorage，文件兜底。
 *  B78 归一化：自动迁移旧硬编码 tab id（"settings"→"settings-1"等），保证 F5 不丢布局。
 *  E3i #70：terminal → serial-monitor 自动迁移。 */
export async function initLayoutService(): Promise<void> {
  let saved = await read<WorkspaceLayout>("layout");
  if (saved) {
    saved = migrateLegacyTabIds(saved);
    saved = migratePluginIdRename(saved, "terminal", "serial-monitor", "_migrated_terminal_to_serial_monitor");
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
    if (!(await exists(dir))) await mkdir(dir);
    const filePath = await joinPath(dir, `${name}.json`);
    await writeFile(filePath, JSON.stringify(layout, null, 2));
  } catch { /* 静默 */ }
}

/** 清空缓存（测试用） */
export function clearLayoutCache(): void {
  _layoutCache = { tabs: { groups: [], activeGroupId: "" }, cards: [] };
}
