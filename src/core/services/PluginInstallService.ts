/**
 * PluginInstallService——`installed-plugins.json` 唯一 owner（E6#12a 精确路径；设计决策#20：
 * 每个持久化文件只有一个 owner service）。
 *
 * 账本 = 「装了谁」的唯一记录：`{ [pluginId]: { version, installedAt, source } }`，落在
 * `{userData}/installed-plugins.json`（独立文件，不混入 settings.json；经 StorageService
 * 通用 key→`${key}.json` fallback 落盘——本文件是全 src/plugins 内唯一含该字面量的文件，
 * 审计规则 `grep installed-plugins` 只命中这里）。
 *
 * 谁写：boot reconcile（loader 启动对账：userData 家目录有 → 加）＋ 卸载真删（lifecycle-ops
 * 调 remove）＋ 未来市场安装流 add。谁读：市场「已安装」判断 isInstalled / 更新源对比。
 * 规则 3（关联桌子同步）：reconcile 差集——目录有则加记录、builtin/user 源且目录无则删记录，
 * 与实际文件系统保持一致（删文件=删记录，装文件=加记录）。
 *
 * 不变量/边界：
 *   - 只收 origin.home === "userData" 的插件（{userData}/plugins 家——.linkdesk-plugin 解压处）；
 *     dev 项目源码插件（app 根）永不入账本。
 *   - source 派生自磁盘位置事实 origin.subdir（builtin 子目录 → "builtin"，其余 → "user"）——
 *     磁盘格式/位置是事实，不替代插件身份（硬约束 11）。
 *   - marketplace 源（未来安装流写入）不在 reconcile 自动删除范围——只按目录事实增删 builtin/user。
 *   - 纯函数（selectUserDataPlugins / reconcileDiff）不碰 I/O——单测可证，不依赖 window.linkdesk。
 */

import { read as storageRead, write as storageWrite } from "./configuration/StorageService";
import type { PluginDiscoveryEntry } from "../api/linkdesk-api/types";

/** 账本文件名/StorageService key——本文件是全仓唯一字面量 owner（审计 grep 规则） */
const LEDGER_KEY = "installed-plugins";

/** 单条账本记录 */
export interface InstalledPluginEntry {
  /** 已安装版本——manifest.version（无则 "0.0.0" 占位） */
  version: string;
  /** 首次安装时间 ISO——重装/升级保留原值（安装日期语义） */
  installedAt: string;
  /** 来源：builtin=出厂内置目录 / user=用户安装目录 / marketplace=市场安装 */
  source: "builtin" | "user" | "marketplace";
}

/** 账本形状——pluginId → 记录 */
export type InstalledLedger = Record<string, InstalledPluginEntry>;

/* ── 磁盘位置 → 账本来源（纯映射） ── */

/** origin.subdir 位置事实 → source 语义：builtin 子目录 → "builtin"，其余（user/其他）→ "user" */
function sourceFromSubdir(subdir: string | null): "builtin" | "user" {
  return subdir === "builtin" ? "builtin" : "user";
}

/**
 * 纯函数：从发现条目里挑出应入账本的——只收 userData 家的 .linkdesk-plugin 解压插件
 * （origin.home === "userData"）。dev 项目源码插件（app 根）与浏览器 glob 种子（无 origin）恒滤除。
 */
export function selectUserDataPlugins(
  entries: readonly PluginDiscoveryEntry[],
): Array<{ pluginId: string; version: string; source: "builtin" | "user" }> {
  const out: Array<{ pluginId: string; version: string; source: "builtin" | "user" }> = [];
  for (const e of entries) {
    if (e.origin?.home !== "userData") continue;
    if (!e.pluginId) continue;
    out.push({
      pluginId: e.pluginId,
      version: e.manifest?.version ?? "0.0.0",
      source: sourceFromSubdir(e.origin.subdir ?? null),
    });
  }
  // 确定性顺序——回勾/测试可比
  out.sort((a, b) => (a.pluginId < b.pluginId ? -1 : a.pluginId > b.pluginId ? 1 : 0));
  return out;
}

/**
 * 纯函数：reconcile 差集（规则 3）——current 账本 × discovered userData 插件（磁盘事实）：
 *   - 目录有：无记录 → 加（added）；有记录版本不同 → 更新 version（keep 原 installedAt）。
 *   - 目录无（builtin/user 源）→ 删记录（removed）——对应目录被真删。
 *   - marketplace 源记录保留（不受目录事实自动删）——市场记录语义独立。
 * 不 mutate 入参——返回 { next（新账本）, added[], removed[], updated[] }。
 */
export function reconcileDiff(
  current: InstalledLedger,
  discovered: Array<{ pluginId: string; version: string; source: "builtin" | "user" }>,
): {
  next: InstalledLedger;
  added: string[];
  updated: string[];
  removed: string[];
} {
  const next: InstalledLedger = { ...current };
  const added: string[] = [];
  const updated: string[] = [];

  for (const d of discovered) {
    const existing = next[d.pluginId];
    if (!existing) {
      next[d.pluginId] = { version: d.version, installedAt: new Date().toISOString(), source: d.source };
      added.push(d.pluginId);
    } else if (existing.version !== d.version) {
      next[d.pluginId] = { ...existing, version: d.version, source: d.source };
      updated.push(d.pluginId);
    } else if (existing.source !== d.source) {
      // 源迁移（builtin↔user 目录搬动）——同版本也刷新 source
      next[d.pluginId] = { ...existing, source: d.source };
    }
  }

  const removed: string[] = [];
  for (const [id, entry] of Object.entries(next)) {
    if (entry.source === "marketplace") continue; // 市场记录不被目录差集自动删
    const stillThere = discovered.some((d) => d.pluginId === id);
    if (!stillThere) {
      delete next[id];
      removed.push(id);
    }
  }

  return { next, added, updated, removed };
}

/* ── I/O 面（owner 唯一读写；走 StorageService 通用 key→${key}.json fallback 落 {userData}） ── */

async function readLedger(): Promise<InstalledLedger> {
  try {
    const data = await storageRead<InstalledLedger>(LEDGER_KEY);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/** 全量读账本 */
export async function getInstalled(): Promise<InstalledLedger> {
  return readLedger();
}

/** 写账本（仅本文件调——owner 唯一入口） */
async function writeLedger(ledger: InstalledLedger): Promise<void> {
  await storageWrite(LEDGER_KEY, ledger);
}

/** 加/更新记录——首次装记录 installedAt，重装/升级保原值（安装日期语义） */
export async function add(
  pluginId: string,
  version: string,
  source: InstalledPluginEntry["source"],
): Promise<InstalledLedger> {
  const ledger = await readLedger();
  const existing = ledger[pluginId];
  ledger[pluginId] = {
    version,
    installedAt: existing?.installedAt ?? new Date().toISOString(),
    source,
  };
  await writeLedger(ledger);
  return ledger;
}

/** 删记录——卸载真删后销账 */
export async function remove(pluginId: string): Promise<InstalledLedger> {
  const ledger = await readLedger();
  if (!(pluginId in ledger)) return ledger;
  delete ledger[pluginId];
  await writeLedger(ledger);
  return ledger;
}

/** 市场「已安装」判断（吸收 E6#10c） */
export async function isInstalled(pluginId: string): Promise<boolean> {
  return pluginId in (await readLedger());
}

/** 取某插件来源——无记录返回 null */
export async function getSource(pluginId: string): Promise<InstalledPluginEntry["source"] | null> {
  return (await readLedger())[pluginId]?.source ?? null;
}

/**
 * 启动 reconcile（loader 调）：发现条目（含 origin）→ 账本与实际文件系统对齐。
 * 只处理 userData 家插件；dev 源码插件不进账本。无变化不写盘（幂等）。
 */
export async function reconcileInstalledLedger(
  entries: readonly PluginDiscoveryEntry[],
): Promise<{ added: string[]; updated: string[]; removed: string[] }> {
  const current = await readLedger();
  const discovered = selectUserDataPlugins(entries);
  const { next, added, updated, removed } = reconcileDiff(current, discovered);
  if (added.length > 0 || updated.length > 0 || removed.length > 0) {
    await writeLedger(next);
  }
  return { added, updated, removed };
}
