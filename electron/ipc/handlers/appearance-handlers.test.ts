/**
 * appearance-handlers reveal-storage 行为测试——E5.8#153。
 *
 * 纯 handler 组合测：vi.mock("electron") 捕 ipcMain.handle + 替 shell.openPath；
 * vi.mock file-service（DI 面）。仅调用 reveal-storage handler（importImage 未被调不触发其依赖）。
 * 覆盖：目录缺省也建 + openPath 开目录内容（不崩）/ openPath 失败 fail-loud 抛错（invoke 侧 catch）。
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn() },
}));

vi.mock("../../services/file-service", () => ({
  fileService: {
    appDataDir: vi.fn(() => "C:/fake/userdata"),
    join: vi.fn((...parts: string[]) => parts.join("/")),
    createDir: vi.fn(async () => {}),
    stat: vi.fn(async () => ({ isFile: true })),
    exists: vi.fn(() => true),
    copy: vi.fn(async () => {}),
  },
}));

import { ipcMain, shell } from "electron";
import { fileService } from "../../services/file-service";
import { registerAppearanceHandlers } from "./appearance-handlers";

const handleMock = ipcMain.handle as unknown as ReturnType<typeof vi.fn>;
const openPathMock = shell.openPath as unknown as ReturnType<typeof vi.fn>;
const fileServiceMock = fileService as unknown as {
  appDataDir: ReturnType<typeof vi.fn>;
  createDir: ReturnType<typeof vi.fn>;
};

let revealHandler: ((_e: unknown) => Promise<unknown>) | null = null;

describe("appearance-handlers reveal-storage（E5.8#153）", () => {
  beforeAll(() => {
    handleMock.mockImplementation((channel: string, fn: unknown) => {
      if (channel === "appearance:reveal-storage") revealHandler = fn as typeof revealHandler;
    });
    registerAppearanceHandlers(); // _registered guard——只注册一次，全 describe 复用捕获的 handler
  });

  beforeEach(() => {
    vi.clearAllMocks();
    openPathMock.mockResolvedValue("");
  });

  it("目录缺省 → 建目录 + openPath 开目录内容（不崩）", async () => {
    await revealHandler!({});
    // 目录路径 = 主进程 userData/appearance 派生（池内零路径知识）
    expect(fileServiceMock.createDir).toHaveBeenCalledWith("C:/fake/userdata/appearance");
    expect(openPathMock).toHaveBeenCalledWith("C:/fake/userdata/appearance");
  });

  it("openPath 返回错误串 → fail-loud 抛错（invoke 侧 catch，不崩）", async () => {
    openPathMock.mockResolvedValue("系统找不到指定的路径");
    await expect(revealHandler!({})).rejects.toThrow(/打开存储位置失败/);
  });

  it("openPath 异常 → fail-loud 抛错", async () => {
    openPathMock.mockRejectedValue(new Error("boom"));
    await expect(revealHandler!({})).rejects.toThrow("boom");
  });
});
