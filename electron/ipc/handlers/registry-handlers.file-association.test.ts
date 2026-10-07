/**
 * registry-handlers · fileAssociation.getPluginFor —— 兜底链修复（2026-10-07）处理器层判据 J2。
 *
 * 钉死：空扩展名（无后缀 / 点开头文件）**照样走宿主解析**——handler 不得对空串短路返回
 * undefined，必须落 `resolveOpenTarget("")`：跳过覆盖表 / 声明表、直落角色兜底（服务层用例 ⑥
 * 的处理器层同款）。旧行为 `if (!extension) return undefined` 已判死——谁把它写回去，这里就红。
 *
 * 纯 handler 组合测：vi.mock("electron") 捕 ipcMain.handle ＋ vi.mock file-service（DI 面，
 * settings.json 平键现读）；FileAssociationService 用真单例（fixture 挂牌者，intake 测试同款口径，
 * fixture id 故意不叫 editor——自证不写死插件 id）。
 */
import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));

vi.mock("../../services/file-service", () => ({
  fileService: {
    appDataDir: vi.fn(() => "C:/fake/userdata"),
    join: vi.fn((...parts: string[]) => parts.join("/")),
    readTextFile: vi.fn(async () => {
      throw new Error("no settings.json in test");
    }),
  },
}));

import { ipcMain } from "electron";
import { fileService } from "../../services/file-service";
import { registerRegistryHandlers } from "./registry-handlers";
import {
  clearFileAssociations,
  registerFileAssociation,
} from "../../../src/core/services/files/FileAssociationService.js";
import { IPC } from "../channels.js";

const handleMock = ipcMain.handle as unknown as ReturnType<typeof vi.fn>;
const readTextFileMock = (fileService as unknown as { readTextFile: ReturnType<typeof vi.fn> }).readTextFile;

/** fixture 挂牌者——故意不叫 editor（intake 测试同款：自证壳不写死该 id） */
const HOLDER = "demo-editor-a";

let getPluginFor: ((_e: unknown, ext: string) => Promise<string | undefined>) | null = null;

describe("registry-handlers · fileAssociation.getPluginFor（兜底链 J2）", () => {
  beforeAll(() => {
    handleMock.mockImplementation((channel: string, fn: unknown) => {
      if (channel === IPC.fileAssociation.getPluginFor) getPluginFor = fn as typeof getPluginFor;
    });
    clearFileAssociations();
    registerFileAssociation({ extension: "zzz", pluginId: HOLDER, role: "text-fallback" });
    registerRegistryHandlers();
  });

  it("🔴 空扩展名 → 照样走宿主解析，落角色兜底（不再 undefined）", async () => {
    await expect(getPluginFor!({}, "")).resolves.toBe(HOLDER);
  });

  it("🔴 空扩展名 ＋ 覆盖表里塞了空键 → 仍落角色兜底（覆盖/声明表对空扩展名不生效，服务层 ⑥ 同款）", async () => {
    readTextFileMock.mockImplementationOnce(async () =>
      JSON.stringify({ "workbench.fileAssociations": { "": "someone-else" } })
    );
    await expect(getPluginFor!({}, "")).resolves.toBe(HOLDER);
  });

  it("零回归：已声明类型走声明表、未声明类型走角色兜底", async () => {
    registerFileAssociation({ extension: "xyz", pluginId: "demo-plugin" });
    await expect(getPluginFor!({}, "xyz")).resolves.toBe("demo-plugin");
    await expect(getPluginFor!({}, "qqq")).resolves.toBe(HOLDER);
  });
});
