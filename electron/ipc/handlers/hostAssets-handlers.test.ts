/**
 * hostAssets-handlers 行为测试（2026-11-24 语义归属，替代 appearance-handlers.test.ts）。
 *
 * 覆盖：
 *   · reveal-storage：目录缺省也建 + openPath 开目录内容 / 失败 fail-loud（E5.8#153 行为不变）；
 *   · pick-image：起始目录/过滤器来自宿主 defaults；选中 → 入库 → 受控 URL；取消 → {picked:false}；
 *   · 未注册域 → fail-loud（插件传错声明不能静默落到别的域）。
 */

import path from "node:path";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
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

vi.mock("../../services/asset-dedup", () => ({
  resolveAssetDestination: vi.fn(async () => "wallpaper.png"),
}));

import { dialog, ipcMain, shell } from "electron";
import { fileService } from "../../services/file-service";
import { registerHostAssetsHandlers } from "./hostAssets-handlers";

type Handler = (event: unknown, payload?: unknown) => Promise<unknown>;

const handleMock = ipcMain.handle as unknown as ReturnType<typeof vi.fn>;
const openPathMock = shell.openPath as unknown as ReturnType<typeof vi.fn>;
const showOpenDialogMock = dialog.showOpenDialog as unknown as ReturnType<typeof vi.fn>;
const fileServiceMock = fileService as unknown as {
  appDataDir: ReturnType<typeof vi.fn>;
  createDir: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
  copy: ReturnType<typeof vi.fn>;
};

const handlers = new Map<string, Handler>();
const APPEARANCE_DIR = path.join("C:/fake/userdata", "appearance");

describe("hostAssets-handlers", () => {
  beforeAll(() => {
    handleMock.mockImplementation((channel: string, fn: unknown) => {
      handlers.set(channel, fn as Handler);
    });
    registerHostAssetsHandlers(); // _registered guard——只注册一次，全 describe 复用捕获的 handler
  });

  beforeEach(() => {
    vi.clearAllMocks();
    openPathMock.mockResolvedValue("");
  });

  it("reveal-storage：目录缺省 → 建目录 + openPath 开目录内容", async () => {
    await handlers.get("appearance:reveal-storage")!({});
    expect(fileServiceMock.createDir).toHaveBeenCalledWith(APPEARANCE_DIR);
    expect(openPathMock).toHaveBeenCalledWith(APPEARANCE_DIR);
  });

  it("reveal-storage：openPath 返回错误串 → fail-loud", async () => {
    openPathMock.mockResolvedValue("系统找不到指定的路径");
    await expect(handlers.get("appearance:reveal-storage")!({})).rejects.toThrow(/打开存储位置失败/);
  });

  it("pick-image：起始目录/过滤器来自宿主 defaults，选中后返回受控 URL", async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ["C:/tmp/pic.png"] });
    const result = await handlers.get("appearance:pick-image")!(
      { sender: {} },
      { domain: "appearance", target: "app" },
    );
    expect(showOpenDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: APPEARANCE_DIR,
        filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp"] }],
        properties: ["openFile"],
      }),
    );
    expect(result).toEqual({
      picked: true,
      url: "linkdesk-userdata://appearance/wallpaper.png",
      name: "wallpaper.png",
    });
  });

  it("pick-image：取消 → {picked:false}（不是错误，不落文件）", async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(
      handlers.get("appearance:pick-image")!({ sender: {} }, { domain: "appearance", target: "zone" }),
    ).resolves.toEqual({ picked: false });
    expect(fileServiceMock.copy).not.toHaveBeenCalled();
  });

  it("pick-image：未注册域 → fail-loud（不静默落到 appearance）", async () => {
    await expect(
      handlers.get("appearance:pick-image")!({ sender: {} }, { domain: "nope", target: "app" }),
    ).rejects.toThrow(/未注册的资产域/);
    expect(showOpenDialogMock).not.toHaveBeenCalled();
  });

  it("importImage：空源路径 → fail-loud", async () => {
    await expect(handlers.get("appearance:importImage")!({}, "")).rejects.toThrow(/源路径为空/);
  });

  it("importImage：合法源 → 拷贝入库并返回受控 URL（通道名不变）", async () => {
    await expect(handlers.get("appearance:importImage")!({}, "C:/tmp/pic.png")).resolves.toBe(
      "linkdesk-userdata://appearance/wallpaper.png",
    );
    expect(fileServiceMock.stat).toHaveBeenCalledWith("C:/tmp/pic.png");
    expect(fileServiceMock.copy).not.toHaveBeenCalled(); // 已存在（exists=true）= 去重零拷贝
  });
});
