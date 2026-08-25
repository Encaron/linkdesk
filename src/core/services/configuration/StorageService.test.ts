/**
 * StorageService 单元测试——E5.8#71 读取源优先序归一。
 * #71：read() 文件优先（文件 = 真相）——修 localStorage 陈旧快照盖掉 settings.json 的启动主题错乱 bug。
 * 纯函数 pickReadSource 测优先序；read() 测 I/O 分支（mock FileService + window.linkdesk）。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const fileProbe = vi.hoisted(() => ({
  exists: vi.fn(async (): Promise<boolean> => false),
  readFile: vi.fn(async (): Promise<string> => ""),
  writeFile: vi.fn(async (): Promise<void> => {}),
  appDataDir: vi.fn(async (): Promise<string> => "C:/linkdesk"),
  joinPath: vi.fn(async (_dir: string, file: string): Promise<string> => `C:/linkdesk/${file}`),
}));

vi.mock("../files/FileService", () => ({
  exists: fileProbe.exists,
  readFile: fileProbe.readFile,
  writeFile: fileProbe.writeFile,
  joinPath: fileProbe.joinPath,
  appDataDir: fileProbe.appDataDir,
}));

import { read, pickReadSource } from "./StorageService";

describe("pickReadSource 读取源优先序（纯函数）", () => {
  it("文件存在 → 文件优先（即使 localStorage 有陈旧值——#71 分叉 bug 核心）", () => {
    expect(pickReadSource("file-json", "stale-ls")).toBe("file");
  });
  it("仅文件存在 → 文件", () => {
    expect(pickReadSource("file-json", null)).toBe("file");
  });
  it("仅 localStorage 存在 → 兜底 localStorage", () => {
    expect(pickReadSource(null, "ls-json")).toBe("ls");
  });
  it("两源皆空 → null", () => {
    expect(pickReadSource(null, null)).toBeNull();
  });
});

describe("StorageService.read 文件优先归一", () => {
  beforeEach(() => {
    localStorage.clear();
    fileProbe.exists.mockResolvedValue(false);
    fileProbe.readFile.mockResolvedValue("");
    // 模拟 Electron 渲染器——window.linkdesk.filesystem 存在才走文件分支
    (window as unknown as Record<string, unknown>).linkdesk = { filesystem: {} };
  });

  it("文件 vs localStorage 分叉 → 文件胜（dark 盖过陈旧 panorama）+ localStorage 缓存刷新", async () => {
    const lsStale = JSON.stringify({ "app.theme": "panorama" });
    const fileDark = JSON.stringify({ "app.theme": "dark" });
    localStorage.setItem("settings", lsStale);
    fileProbe.exists.mockResolvedValue(true);
    fileProbe.readFile.mockResolvedValue(fileDark);

    const got = await read<Record<string, unknown>>("settings");
    expect(got?.["app.theme"]).toBe("dark");
    // 缓存刷新——陈旧 localStorage 被文件值覆盖（下次非文件路径读取同源）
    expect(localStorage.getItem("settings")).toBe(fileDark);
  });

  it("文件缺失 → localStorage 兜底", async () => {
    localStorage.setItem("settings", JSON.stringify({ "app.theme": "panorama" }));
    fileProbe.exists.mockResolvedValue(false);

    const got = await read<Record<string, unknown>>("settings");
    expect(got?.["app.theme"]).toBe("panorama");
  });

  it("文件损坏（非法 JSON）→ 不污染缓存，落 localStorage 兜底", async () => {
    localStorage.setItem("settings", JSON.stringify({ "app.theme": "panorama" }));
    fileProbe.exists.mockResolvedValue(true);
    fileProbe.readFile.mockResolvedValue("not json{{{");

    const got = await read<Record<string, unknown>>("settings");
    expect(got?.["app.theme"]).toBe("panorama");
    expect(localStorage.getItem("settings")).not.toBe("not json{{{");
  });

  it("文件与 localStorage 一致 → 返回文件，不重写缓存（幂等）", async () => {
    const same = JSON.stringify({ "app.theme": "dark" });
    localStorage.setItem("settings", same);
    fileProbe.exists.mockResolvedValue(true);
    fileProbe.readFile.mockResolvedValue(same);

    const got = await read<Record<string, unknown>>("settings");
    expect(got?.["app.theme"]).toBe("dark");
    expect(localStorage.getItem("settings")).toBe(same);
  });

  it("非 Electron（无 linkdesk）→ 仅 localStorage 路径", async () => {
    (window as unknown as Record<string, unknown>).linkdesk = undefined;
    localStorage.setItem("settings", JSON.stringify({ "app.theme": "dark" }));

    const got = await read<Record<string, unknown>>("settings");
    expect(got?.["app.theme"]).toBe("dark");
  });
});
