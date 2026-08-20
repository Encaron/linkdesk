/**
 * filesystem-guard 路径守卫单测——E5.8#30.20 关闭串口误弹窗修复的行为钉住。
 *
 * 分级行为验证（E5.8#30.20 修复后）：
 *   1. 非池来源（壳）直通
 *   2. 可信区直通——workspace 内 / 插件数据根（<userData>/linkdesk/plugins/，env.get 隐含授权）
 *   3. 其余工作区外确认一次——点「允许」落盘 guard-grants.json，重启（重 import）不再询问
 *   4. 危险目录无条件拒绝——弹窗都不给
 *
 * mock electron（app/dialog/BrowserWindow）；userData 指向真实临时目录，
 * guard-grants.json 与 workspace-folders.json 真读真写（集成式单测）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { normalizePath } from "../../src/core/utils/path/pathUtils.js";

const electronMock = vi.hoisted(() => {
  const app = { getPath: vi.fn(() => "") };
  const dialog = { showMessageBox: vi.fn(async () => ({ response: 0 })) };
  return { app, dialog, BrowserWindow: { fromWebContents: () => null } };
});
vi.mock("electron", () => electronMock);

import type { WebContents } from "electron";

let tempDir: string;
let guardModule: typeof import("./filesystem-guard");

const fakeSender = {} as unknown as WebContents;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ld-guard-"));
  electronMock.app.getPath.mockImplementation((name: string) => (name === "userData" ? tempDir : ""));
  electronMock.dialog.showMessageBox.mockClear();
  electronMock.dialog.showMessageBox.mockImplementation(async () => ({ response: 0 }));
  vi.resetModules();
  guardModule = await import("./filesystem-guard");
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("filesystem-guard——写操作分级", () => {
  it("非池来源直通（壳受信调用方）——任意路径不弹窗", async () => {
    await guardModule.guardPoolWrite(fakeSender, false, path.join(tempDir, "anywhere", "x.txt"), "writeTextFile");
    expect(electronMock.dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it("危险目录无条件拒绝——弹窗都不给", async () => {
    await expect(
      guardModule.guardPoolWrite(fakeSender, true, "C:/Windows/System32/drivers/etc/hosts", "writeTextFile"),
    ).rejects.toThrow(/禁止写入系统目录/);
    expect(electronMock.dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it("插件数据根内直通——不弹窗（env.get 暴露数据目录 = 壳隐含授权）", async () => {
    const dataFile = path.join(tempDir, "linkdesk", "plugins", "serial-monitor", "data", "receive-saves", "a.txt");
    await guardModule.guardPoolWrite(fakeSender, true, dataFile, "writeTextFile");
    expect(electronMock.dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it("workspace 内直通——不弹窗（workspace-folders.json 前缀匹配）", async () => {
    fs.writeFileSync(
      path.join(tempDir, "workspace-folders.json"),
      JSON.stringify([{ uri: "E:/proj", name: "proj" }]),
    );
    await guardModule.guardPoolWrite(fakeSender, true, "E:/proj/settings.json", "writeTextFile");
    expect(electronMock.dialog.showMessageBox).not.toHaveBeenCalled();
  });

  it("其余工作区外首次弹窗——允许后落盘 guard-grants.json", async () => {
    const settingsPath = path.join(tempDir, "settings.json");
    await guardModule.guardPoolWrite(fakeSender, true, settingsPath, "writeTextFile");
    expect(electronMock.dialog.showMessageBox).toHaveBeenCalledTimes(1);
    const grants = JSON.parse(fs.readFileSync(path.join(tempDir, "guard-grants.json"), "utf8")) as string[];
    expect(grants).toContain(normalizePath(tempDir));
  });

  it("拒绝弹窗——抛错且不落盘", async () => {
    electronMock.dialog.showMessageBox.mockImplementation(async () => ({ response: 1 }));
    await expect(
      guardModule.guardPoolWrite(fakeSender, true, path.join(tempDir, "denied", "x.txt"), "writeTextFile"),
    ).rejects.toThrow(/用户拒绝/);
    expect(fs.existsSync(path.join(tempDir, "guard-grants.json"))).toBe(false);
  });

  it("重启后命中持久化放行——同目录写不再弹窗", async () => {
    const settingsPath = path.join(tempDir, "settings.json");
    await guardModule.guardPoolWrite(fakeSender, true, settingsPath, "writeTextFile");
    expect(electronMock.dialog.showMessageBox).toHaveBeenCalledTimes(1);
    // 模拟应用重启：resetModules 重 import → _grants 从 guard-grants.json 读回
    vi.resetModules();
    guardModule = await import("./filesystem-guard");
    await guardModule.guardPoolWrite(fakeSender, true, settingsPath, "writeTextFile");
    expect(electronMock.dialog.showMessageBox).toHaveBeenCalledTimes(1); // 无新增调用
  });
});
