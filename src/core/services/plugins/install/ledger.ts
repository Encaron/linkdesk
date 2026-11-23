/**
 * 来源身份账本——「这个插件是从哪个源、哪个仓库、哪个发布者装来的」的唯一记录（spec §3.4/§3.8）。
 *
 * 🔴 与 `PluginInstallService` 的分工（两个事实，两个 owner）：
 *    · `installed-plugins.json`（PluginInstallService）= **装了谁**（版本/安装日/出身 user|marketplace/墓碑）
 *    · `plugin-source-ledger.json`（本文件）= **从哪装的**（sourceUrl/repo/publisher/sha256/首落地时间）
 *    两者都以 pluginId 为键，但生命周期不同（出身不随来源变更而变，来源身份每次安装都刷新），
 *    合成一个文件会让「来源变更检测」与「墓碑对账」互相踩——所以分开。
 *
 * 落点（硬约束 27）：userData 根 `plugin-source-ledger.json`——被《用户机落点规范》§二 A#1 的
 *   `%APPDATA%\linkdesk\` 覆盖，**不新增落点**；卸载不清除（同 licenses.json：用户资产，
 *   重装时来源比对仍需要它；随 userData 目录一并清）。
 *
 * 写纪律：读-改-写串行化（照 PluginInstallService 先例）——批量更新 20 项并发落盘时，
 * 不串行就一定丢条目（后写覆盖前写）。
 */

import { read as storageRead, write as storageWrite } from "../../configuration/StorageService";
import type { KnownSource, SourceLedger, SourceLedgerEntry } from "./types";

/** 落盘 key——本文件是全仓唯一字面量 owner（审计 grep 只命中这里） */
const LEDGER_KEY = "plugin-source-ledger";

let _writeChain: Promise<unknown> = Promise.resolve();

function serialized<T>(op: () => Promise<T>): Promise<T> {
  const run = _writeChain.then(op, op);
  _writeChain = run.catch(() => {
    /* 单次失败不阻塞后续写 */
  });
  return run;
}

async function readLedger(): Promise<SourceLedger> {
  try {
    const data = await storageRead<SourceLedger>(LEDGER_KEY);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/** 取某插件的来源身份——无记录返回 null（= 首装语义，policy 据此出 first-install） */
export async function getSourceIdentity(pluginId: string): Promise<SourceLedgerEntry | null> {
  const entry = (await readLedger())[pluginId];
  return entry && typeof entry === "object" ? entry : null;
}

/**
 * 记一条来源身份——安装/更新**成功之后**调（失败不记：账本记的是「盘上这一版的来源」）。
 * `installedAt` 保留首次值（安装日期语义，同 PluginInstallService.add）。
 */
export async function recordSourceIdentity(
  pluginId: string,
  entry: {
    sourceId: string;
    sourceUrl: string;
    repo?: string;
    publisher?: string;
    version: string;
    sha256?: string;
  },
): Promise<void> {
  await serialized(async () => {
    const ledger = await readLedger();
    const now = new Date().toISOString();
    ledger[pluginId] = {
      sourceId: entry.sourceId,
      sourceUrl: entry.sourceUrl,
      repo: entry.repo,
      publisher: entry.publisher,
      version: entry.version,
      sha256: entry.sha256,
      installedAt: ledger[pluginId]?.installedAt ?? now,
      seenAt: now,
    };
    await storageWrite(LEDGER_KEY, ledger);
  });
}

/** 按 sourceId 聚合的已知来源——信任清单的行数据（唯一来源；设置页/确认卡都读它） */
export async function listKnownSources(): Promise<KnownSource[]> {
  const ledger = await readLedger();
  const byId = new Map<string, KnownSource>();
  for (const [pluginId, entry] of Object.entries(ledger)) {
    if (!entry || typeof entry !== "object" || !entry.sourceId) continue;
    const prev = byId.get(entry.sourceId);
    if (!prev) {
      byId.set(entry.sourceId, {
        sourceId: entry.sourceId,
        url: entry.sourceUrl,
        repo: entry.repo,
        publisher: entry.publisher,
        pluginIds: [pluginId],
        lastSeenAt: entry.seenAt,
      });
      continue;
    }
    prev.pluginIds.push(pluginId);
    if (entry.seenAt > prev.lastSeenAt) {
      prev.lastSeenAt = entry.seenAt;
      prev.url = entry.sourceUrl;
      prev.repo = entry.repo;
      prev.publisher = entry.publisher;
    }
  }
  // 确定性顺序（设置页/测试可比）
  return [...byId.values()].sort((a, b) => (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0));
}
