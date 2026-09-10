/**
 * PluginInstallService——`installed-plugins.json` 唯一 owner（E6#12a 精确路径；设计决策#20：
 * 每个持久化文件只有一个 owner service）。
 *
 * 账本 = 「装了谁」的唯一记录：`{ [pluginId]: { version, installedAt, source, removed? } }`，落在
 * `{userData}/installed-plugins.json`（独立文件，不混入 settings.json；经 StorageService
 * 通用 key→`${key}.json` fallback 落盘——本文件是全 src/plugins 内唯一含该字面量的文件，
 * 审计规则 `grep installed-plugins` 只命中这里）。
 *
 * 谁写：boot reconcile（loader 启动对账：userData 家目录有 → 加）+ 卸载墓碑化（lifecycle-ops
 * 调 markRemoved）+ 未来市场安装流 add。谁读：市场「已安装」判断 isInstalled / 更新源对比。
 *
 * E6#18 removed 墓碑模型（2026-09-07 四连拍 ③）：卸载任意来源插件 = 目录真删 + 账本保留条目
 * 置 removed:true（markRemoved，零来源分支）——**永不整条删账本条目**；对账（reconcileDiff）：
 * 目录在 + removed → 清章（重现=装回）；目录缺 + !removed → 置章（消失=尊重）；任何装回 add 清章；
 * isInstalled = 在账本 && !removed。墓碑防「种子腿把卸载过的发货插件当从未装过重铺」的复活缝。
 *
 * 不变量/边界：
 *   - 只收 origin.home === "userData" 的插件（{userData}/plugins 家——.linkdesk-plugin 解压处）；
 *     dev 项目源码插件（app 根）永不入账本。
 *   - source 派生自磁盘位置事实 origin.subdir——2026-09-05 塌平单根后 subdir 恒 null → 磁盘事实全映射
 *     "user"；"builtin" 仅保留为联合成员兼容旧账本条目（不再从磁盘派生）。磁盘位置是事实，不替代插件身份（硬约束 11）。
 *   - source 是出身记录非行为开关（getSource 读墓碑也返回出身）；removed 才定义「现在装没装」。
 *   - 纯函数（selectUserDataPlugins / reconcileDiff）不碰 I/O——单测可证，不依赖 window.linkdesk。
 */

import { read as storageRead, write as storageWrite } from "./configuration/StorageService";
import type { PluginDiscoveryEntry } from "../api/linkdesk-api/types";

/** 账本文件名/StorageService key——本文件是全仓唯一字面量 owner（审计 grep 规则） */
const LEDGER_KEY = "installed-plugins";

/** 单条账本记录 */
export interface InstalledPluginEntry {
  /** 已安装版本——manifest.version（无则 "0.0.0" 占位）；墓碑后 = 历史值（不再随盘） */
  version: string;
  /** 首次安装时间 ISO——重装/升级保留原值（安装日期语义） */
  installedAt: string;
  /** 来源：user=用户安装（塌平后磁盘事实全落此）/ marketplace=市场安装（add 显式写）/ builtin=旧版账本兼容（不再派生，保留成员） */
  source: "builtin" | "user" | "marketplace";
  /** removed 墓碑（E6#18③）——卸载（任意来源）置 true，条目保留成历史；目录重现/装回清章。
   *  undefined = 活跃（语义同 false；不写 false 保持落盘最小）。 */
  removed?: boolean;
}

/** 账本形状——pluginId → 记录 */
export type InstalledLedger = Record<string, InstalledPluginEntry>;

/* ── 磁盘位置 → 账本来源（纯映射） ── */

/** origin.subdir 位置事实 → source 语义。2026-09-05 塌平单根：subdir 恒 null → 全落 "user"；
 *  "builtin" 分支保留仅为旧账本兼容（若现存量 subdir 意外非 null 仍按旧规则兜底）。 */
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
 * 纯函数：reconcile 差集（E6#18③ 墓碑语义）——current 账本 × discovered userData 插件（磁盘事实）。
 *   - 目录有 + 无记录 → 加（added，新装账）。
 *   - 目录有 + removed 墓碑 → 清章（restored——重现=装回，解除豁免；新对象不带 removed 即清）。
 *   - 目录有 + 同 id 记录版本不同 → 更新 version/source（updated，keep 原 installedAt）。
 *   - 目录缺 + !removed（活性）→ 置章（removed[]——消失=尊重）；**永不整条删账本条目**——
 *     墓碑若被洗掉，种子腿把卸载过的发货插件当「从未装过」重铺 = 二启复活缝（E6#18d）。
 *   - 目录缺 + removed → 墓碑保留（不重计）。零来源分支——marketplace 记录同样置章（source 是出身不是行为）。
 * 不 mutate 入参——返回 { next（新账本）, added[], updated[], restored[], removed[] }。
 * removed[] = 本轮新置章（目录消失的活性条目）；restored[] = 本轮清章（目录重现的墓碑）。
 */
export function reconcileDiff(
  current: InstalledLedger,
  discovered: Array<{ pluginId: string; version: string; source: "builtin" | "user" }>,
): {
  next: InstalledLedger;
  added: string[];
  updated: string[];
  restored: string[];
  removed: string[];
} {
  const next: InstalledLedger = { ...current };
  const added: string[] = [];
  const updated: string[] = [];
  const restored: string[] = [];

  for (const d of discovered) {
    const existing = next[d.pluginId];
    if (!existing) {
      next[d.pluginId] = { version: d.version, installedAt: new Date().toISOString(), source: d.source };
      added.push(d.pluginId);
    } else if (existing.removed) {
      // 目录重现 + 墓碑 → 清章（装回语义）——新对象刻意不带 removed
      next[d.pluginId] = { version: d.version, installedAt: existing.installedAt, source: d.source };
      restored.push(d.pluginId);
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
    if (entry.removed) continue; // 已是墓碑——保留，不重计
    const stillThere = discovered.some((d) => d.pluginId === id);
    if (!stillThere) {
      next[id] = { ...entry, removed: true };
      removed.push(id);
    }
  }

  return { next, added, updated, restored, removed };
}

/* ── I/O 面（owner 唯一读写；走 StorageService 通用 key→${key}.json fallback 落 {userData}） ── */

/**
 * 写串行化（E6#73q，18 档 §五 I.6⑥）——`add`/`markRemoved`/`reconcileInstalledLedger` 都是
 * **读-改-写**：7 路安装并发时各自读到同一份旧账本、各自写回，**后者覆盖前者 → 最多丢 6 条账本**。
 * 修法 = 一条 Promise 链：每次写操作挂在上一次之后，读-改-写三步入临界区，不再交错。
 *
 * 不加锁对象、不引依赖、不排队到下一 tick——链尾吞掉异常（前一次失败不能让后续写全部连坐）。
 * 单实例（壳渲染进程）内的串行化足够：账本 owner 只有本模块，主进程不碰。
 */
let _writeChain: Promise<unknown> = Promise.resolve();

function serialized<T>(op: () => Promise<T>): Promise<T> {
  const run = _writeChain.then(op, op);
  _writeChain = run.catch(() => { /* 单次失败不阻塞后续写 */ });
  return run;
}

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

/** 加/更新记录——首次装记录 installedAt，重装/升级保原值（安装日期语义）。
 *  E6#18e：装回销章——原条目若带 removed 墓碑，新对象刻意不带 removed（清章 = 用户改主意 = 解除豁免）；
 *  市场下载 / 手装 zip / update 同走本函数，市场层零额外代码。 */
export async function add(
  pluginId: string,
  version: string,
  source: InstalledPluginEntry["source"],
): Promise<InstalledLedger> {
  return serialized(async () => {
    const ledger = await readLedger();
    const existing = ledger[pluginId];
    ledger[pluginId] = {
      version,
      installedAt: existing?.installedAt ?? new Date().toISOString(),
      source,
    };
    await writeLedger(ledger);
    return ledger;
  });
}

/** 卸载墓碑化（E6#18c）——任意来源卸载：目录删由调用方做，账本保条目 + removed:true（历史不销）。
 *  无既有条目（极端：crash 窗口期未及 reconcile）→ upsert 占位墓碑（0.0.0 版）——否则种子腿
 *  把该 id 当「从未装过」首启重铺 = 复活缝。 */
export async function markRemoved(pluginId: string): Promise<InstalledLedger> {
  return serialized(async () => {
    const ledger = await readLedger();
    const existing = ledger[pluginId];
    ledger[pluginId] = {
      version: existing?.version ?? "0.0.0",
      installedAt: existing?.installedAt ?? new Date().toISOString(),
      source: existing?.source ?? "user",
      removed: true,
    };
    await writeLedger(ledger);
    return ledger;
  });
}

/** 市场「已安装」判断（吸收 E6#10c）——E6#18f：在账本 && !removed（墓碑不显「已装」） */
export async function isInstalled(pluginId: string): Promise<boolean> {
  const entry = (await readLedger())[pluginId];
  return !!entry && !entry.removed;
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
): Promise<{ added: string[]; updated: string[]; restored: string[]; removed: string[] }> {
  return serialized(async () => {
    const current = await readLedger();
    const discovered = selectUserDataPlugins(entries);
    const { next, added, updated, restored, removed } = reconcileDiff(current, discovered);
    if (added.length > 0 || updated.length > 0 || restored.length > 0 || removed.length > 0) {
      await writeLedger(next);
    }
    return { added, updated, restored, removed };
  });
}
