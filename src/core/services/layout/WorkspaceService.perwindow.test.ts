/**
 * WorkspaceService 每窗维度单测（E6#47e）。
 *
 * 钉住三条"写反了也照样能跑"的判据：
 * ① 本窗 key 优先：带维度的 `workspace-folders:<id>` 有数据就直接用，不碰旧全局 key；
 * ② 迁移回落一次性：本窗 key 空 + 迁移标记未设 → 从旧全局 key 恢复，并写迁移标记；
 * ③ 迁移标记已设 → 即使本窗 key 仍为空也不再回落（旧值不得被多窗时代的其他窗再次读入）。
 *
 * StorageService / PluginStateService / ConfigurationService 全 mock——被测逻辑只有
 * key 派生与迁移控制流。窗 id 取自 location.search（jsdom 默认空 ⇒ ws-1，硬约束 21 虚构值口径）。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const storageFiles = new Map<string, unknown>();
const pluginStates = new Map<string, unknown>();

vi.mock("../configuration/StorageService", () => ({
  read: vi.fn(async (key: string) => storageFiles.get(key) ?? null),
  readSync: vi.fn((key: string) => storageFiles.get(key) ?? null),
  write: vi.fn(async (key: string, value: unknown) => { storageFiles.set(key, value); }),
  writeSync: vi.fn((key: string, value: unknown) => { storageFiles.set(key, value); }),
}));

vi.mock("../plugins/PluginStateService", () => ({
  APP_PLUGIN_ID: "app",
  getPluginStateValue: vi.fn((_pluginId: string, key: string) => pluginStates.get(key)),
  setPluginStateValue: vi.fn(async (_pluginId: string, key: string, value: unknown) => {
    pluginStates.set(key, value);
  }),
  setPluginStateValueSync: vi.fn(),
}));

vi.mock("../configuration/ConfigurationService", () => ({
  setWorkspaceRoot: vi.fn(),
}));

type Mod = typeof import("./WorkspaceService");

/** 干净的模块实例（模块级 _folders/_activeWorkspaceUri 随 import 重来） */
let mod: Mod;

beforeEach(async () => {
  vi.resetModules();
  storageFiles.clear();
  pluginStates.clear();
  // vitest.setup.ts 的最小 linkdesk 桩 exists 恒 false——会把恢复的文件夹全判「已不存在」丢掉。
  // 本测试要验证的是 key 派生与迁移控制流 ⇒ 置空对象走「信任持久化数据」分支（非 Electron 环境）。
  (window as unknown as { linkdesk?: object }).linkdesk = {};
  mod = await import("./WorkspaceService");
});

afterEach(() => {
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
  vi.restoreAllMocks();
});

const FOLDERS = [
  { uri: "C:/demo-project-a", name: "demo-project-a", index: 0 },
];

describe("WorkspaceService 每窗维度（E6#47e）", () => {
  it("① 本窗 key 有数据 → 直接恢复，且不读旧全局 key", async () => {
    storageFiles.set("workspace-folders:ws-1", FOLDERS);
    await mod.initWorkspaceService();
    expect(mod.getWorkspaceFolders()).toEqual(FOLDERS);
    const { readSync } = await import("../configuration/StorageService");
    expect(readSync).toHaveBeenCalledWith("workspace-folders:ws-1");
    expect(readSync).not.toHaveBeenCalledWith("workspace-folders");
  });

  it("② 本窗 key 空 + 未迁移 → 从旧全局 key 恢复并写迁移标记", async () => {
    storageFiles.set("workspace-folders", FOLDERS); // 旧全局 key（无维度）
    pluginStates.set("activeWorkspace", "C:/demo-project-a"); // 旧 activeWorkspace
    await mod.initWorkspaceService();
    expect(mod.getWorkspaceFolders()).toEqual(FOLDERS);
    expect(pluginStates.get("workspace-migrated:ws-1")).toBe(true);
  });

  it("③ 迁移标记已设 + 本窗 key 空 → 不回落（旧值不得再进任何窗）", async () => {
    pluginStates.set("workspace-migrated:ws-1", true);
    storageFiles.set("workspace-folders", FOLDERS);
    await mod.initWorkspaceService();
    expect(mod.getWorkspaceFolders()).toEqual([]);
  });

  it("addFolder 持久化落到本窗 key", async () => {
    await mod.initWorkspaceService();
    mod.addFolder("C:/demo-project-b");
    expect(storageFiles.get("workspace-folders:ws-1")).toContainEqual({
      uri: "C:/demo-project-b", name: "demo-project-b", index: 0,
    });
  });

  it("🔴 仅首窗回落旧全局 key：ws-2 即使本窗空也不捡主窗遗留（真机实证：捡了会把 ?folder= 目标按包含关系挡掉）", async () => {
    window.history.replaceState(null, "", "/?wsWindow=ws-2&folder=C:/demo-project-x");
    storageFiles.set("workspace-folders", FOLDERS); // 主窗（ws-1）时代的旧全局 key
    try {
      vi.resetModules();
      mod = await import("./WorkspaceService");
      await mod.initWorkspaceService();
      const uris = mod.getWorkspaceFolders().map((f) => f.uri);
      expect(uris).toContain("C:/demo-project-x");
      expect(uris).not.toContain("C:/demo-project-a"); // 旧全局值不得进第二窗
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("E6#47b-2：带 ?folder= 参数启动 → 首帧载入该工程（恢复为空也载入）", async () => {
    window.history.replaceState(null, "", "/?folder=C:/demo-project-x");
    try {
      await mod.initWorkspaceService();
      expect(mod.getWorkspaceFolders()).toContainEqual({
        uri: "C:/demo-project-x", name: "demo-project-x", index: 0,
      });
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("🔴 参数优先：本窗有恢复项时，?folder= 仍生效且旧项不进（真机实证：叠加会撞包含关系把参数挡掉）", async () => {
    storageFiles.set("workspace-folders:ws-1", FOLDERS); // 有恢复项
    window.history.replaceState(null, "", "/?folder=C:/demo-project-x");
    try {
      await mod.initWorkspaceService();
      const uris = mod.getWorkspaceFolders().map((f) => f.uri);
      expect(uris).toEqual(["C:/demo-project-x"]); // 参数独享，恢复项不叠加
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("E6#47b-2：无参数时才恢复（D7）——恢复项原样进", async () => {
    storageFiles.set("workspace-folders:ws-1", FOLDERS);
    await mod.initWorkspaceService();
    expect(mod.getWorkspaceFolders().map((f) => f.uri)).toEqual(["C:/demo-project-a"]);
  });

  it("窗 id 格式校验——location 带 wsWindow=ws-2 → key 用 ws-2；脏值回落 ws-1", async () => {
    window.history.replaceState(null, "", "/?wsWindow=ws-2");
    try {
      await mod.initWorkspaceService();
      mod.addFolder("C:/demo-project-c");
      expect(storageFiles.has("workspace-folders:ws-2")).toBe(true);

      vi.resetModules();
      storageFiles.clear();
      pluginStates.clear();
      mod = await import("./WorkspaceService");
      window.history.replaceState(null, "", "/?wsWindow=evil");
      await mod.initWorkspaceService();
      mod.addFolder("C:/demo-project-d");
      expect(storageFiles.has("workspace-folders:ws-1")).toBe(true);
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });
});
