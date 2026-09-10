/**
 * E6#80 回归——「启动快照」不得遮蔽「本次会话读到的」。
 *
 * 实机复现（用户 2026-09-11 亲口，本文件 1 号用例照抄该路径）：
 *   装 0.1.1 → 下拉降级到 0.1.0 点更新 → 卸载 → 重装（明确选最新 0.1.1）→
 *   详情页/徽标仍显示 0.1.0（盘上 plugin.json 已是 0.1.1）→ 点「升级到新版本」撞
 *   主进程「包内版本与当前版本相同 0.1.1——无需更新」。
 *
 * 病根：`manifestIndex` 只在启动期水合一次，装 / 卸 / 重装都不碰它（更新路径除外——G9 只补了那一条），
 * 而读取侧（getLoadedPluginManifests / getLoadedManifest）**先看快照、看到就跳过新鲜数据** ⇒ 旧快照遮蔽。
 *
 * 铁轨（本文件钉住的四条不变式）：
 *   ① 读取侧：「本次会话读到的」优先于「启动快照」；
 *   ② 写入侧：loadPlugin 读到盘上 manifest 即回写索引（装/卸/启/禁/更新都收敛到它）；
 *   ③ 销账侧：卸载把索引 + 住所一并划掉；
 *   ④ 三者共同保证：任何一条改盘的路走完，读取侧都不可能再按启动快照说话。
 *
 * fixture 全虚构（硬约束 21）：demo-plugin / Demo Plugin，版本用明显假号。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  discoverInstalled,
  getManifestById,
  getLoadedManifest,
  setManifestInIndex,
  forgetPluginIndex,
  setPluginResidence,
  isPluginUpdatable,
  loadedPluginIds,
  _pendingPlugins,
  _loadingPromises,
} from "./state";
import { loadPlugin } from "./runtime";
import { getLoadedPluginManifests, getListPluginManifests } from "../lifecycle/lifecycle-ops";
import { clearLoadStates } from "./loadState";
import { clearRegistrationLayers } from "../../core/registry/registrationTracker";
import { clearPluginStates } from "../../core/services/plugins/PluginStateService";
import type { PluginManifest } from "../../core/api/types";

const PLUGIN_ID = "demo-plugin";
const OLD_VERSION = "0.1.0";
const NEW_VERSION = "0.1.1";

const manifestOf = (version: string): PluginManifest =>
  ({ name: "Demo Plugin", version }) as PluginManifest;

const versionIn = (rows: Array<{ pluginId: string; manifest: PluginManifest }>): string | undefined =>
  rows.find((p) => p.pluginId === PLUGIN_ID)?.manifest.version;

describe("E6#80 索引/快照一致性", () => {
  const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;

  /** 启动那一刻盘上的内容（readAllManifests 的返回——索引快照的来源） */
  let bootSnapshot: Record<string, PluginManifest>;
  /** 此刻盘上的内容（readManifest 的返回——每次读都是最新的） */
  let disk: Map<string, PluginManifest>;
  /** listAll 载荷（住所水合来源） */
  let listAllEntries: Array<{ pluginId: string; entry?: string; manifest: PluginManifest; origin?: { home: "app" | "userData" } }>;

  function resetAll(): void {
    loadedPluginIds.clear();
    _pendingPlugins.clear();
    _loadingPromises.clear();
    clearLoadStates();
    clearRegistrationLayers();
    clearPluginStates(); // 元数据缓存落在 PluginStateService——不清会跨用例泄漏
    bootSnapshot = {};
    disk = new Map();
    listAllEntries = [];
  }

  function mockPlugins(): void {
    (window as unknown as { linkdesk: unknown }).linkdesk = {
      plugins: {
        resolvePath: async () => `/plugins/${PLUGIN_ID}`,
        listDirs: async () => [],
        listAll: async () => listAllEntries,
        listDisabledDirs: async () => [],
        readManifest: async (id: string) => JSON.stringify(disk.get(id) ?? {}),
        readAllManifests: async () => bootSnapshot,
      },
    };
  }

  beforeEach(() => {
    resetAll();
    mockPlugins();
  });

  afterEach(() => {
    (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
    resetAll();
  });

  it("实机复现：启动快照 0.1.0 → 盘上换 0.1.1 → 重装 → 列表报 0.1.1（不被快照遮蔽）", async () => {
    // ① 启动：盘上是 0.1.0，索引水合成快照
    bootSnapshot = { [PLUGIN_ID]: manifestOf(OLD_VERSION) };
    disk.set(PLUGIN_ID, manifestOf(OLD_VERSION));
    listAllEntries = [{ pluginId: PLUGIN_ID, manifest: manifestOf(OLD_VERSION), origin: { home: "userData" } }];
    await discoverInstalled();
    expect(getManifestById(PLUGIN_ID)?.version).toBe(OLD_VERSION);

    // ② 降级 → 卸载 → 重装（盘上 plugin.json 换成 0.1.1；快照仍是启动那一刻的 0.1.0）
    disk.set(PLUGIN_ID, manifestOf(NEW_VERSION));
    await loadPlugin(PLUGIN_ID, "install");

    // ③ 读取侧必须按「本次会话读到的」说话——旧快照不得遮蔽
    expect(versionIn(getListPluginManifests())).toBe(NEW_VERSION);
    expect(versionIn(getLoadedPluginManifests())).toBe(NEW_VERSION);
    expect(getLoadedManifest(PLUGIN_ID)?.version).toBe(NEW_VERSION);
  });

  it("loadPlugin 读到盘上 manifest 即回写索引（getManifestById 不再是启动快照）", async () => {
    bootSnapshot = { [PLUGIN_ID]: manifestOf(OLD_VERSION) };
    disk.set(PLUGIN_ID, manifestOf(NEW_VERSION));
    await discoverInstalled(); // 快照先水合 = 0.1.0

    await loadPlugin(PLUGIN_ID, "install");

    expect(getManifestById(PLUGIN_ID)?.version).toBe(NEW_VERSION);
  });

  it("读取侧次序：索引被手工改成旧值也压不过本次会话读到的（快照永在缓存之后）", async () => {
    disk.set(PLUGIN_ID, manifestOf(NEW_VERSION));
    await loadPlugin(PLUGIN_ID, "install");

    // 模拟「某条未来路径改了盘却没重载」留下的旧快照——缓存仍必须胜出
    setManifestInIndex(PLUGIN_ID, manifestOf(OLD_VERSION));

    expect(versionIn(getListPluginManifests())).toBe(NEW_VERSION);
    expect(getLoadedManifest(PLUGIN_ID)?.version).toBe(NEW_VERSION);
  });

  it("卸载销账：索引与住所一并划掉（不留鬼影 = 不再画更新钮）", () => {
    setManifestInIndex(PLUGIN_ID, manifestOf(NEW_VERSION));
    setPluginResidence(PLUGIN_ID, "userData");
    expect(getManifestById(PLUGIN_ID)?.version).toBe(NEW_VERSION);
    expect(isPluginUpdatable(PLUGIN_ID)).toBe(true);

    // 卸载路径（lifecycle-ops.uninstallPlugin 的销账调用，见该处注释）
    forgetPluginIndex(PLUGIN_ID);

    expect(getManifestById(PLUGIN_ID)).toBeUndefined();
    expect(isPluginUpdatable(PLUGIN_ID)).toBe(false);
  });
});
