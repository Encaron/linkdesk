/**
 * launch-args 解析单测——E6#46a intake 解析半判据钉住。
 * 纯函数零 Electron mock——过滤规则（flag/非绝对路径/不存在/去重/分类）逐条判。
 * 测试夹具用 os.tmpdir 真实存在的文件/目录（跨平台绝对路径），不指向任何真实用户资产（硬约束 21）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseLaunchPaths } from "./launch-args";

let tmpDir: string;
let tmpFile: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-launch-args-"));
  tmpFile = path.join(tmpDir, "sample.txt");
  fs.writeFileSync(tmpFile, "demo");
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("parseLaunchPaths —— E6#46a 启动参数解析", () => {
  it("绝对路径文件/文件夹 → 分类正确（resolve 归一）", () => {
    const result = parseLaunchPaths([tmpFile, tmpDir]);
    expect(result.files).toEqual([path.resolve(tmpFile)]);
    expect(result.folders).toEqual([path.resolve(tmpDir)]);
  });

  it("- 开头的 Electron 开关 → 丢弃", () => {
    const result = parseLaunchPaths([tmpDir, "--remote-debugging-port=9222", "--user-data-dir"]);
    expect(result.folders).toEqual([path.resolve(tmpDir)]);
    expect(result.files).toEqual([]);
  });

  it("非绝对路径（dev 噪声如 `.`）→ 丢弃不猜 cwd", () => {
    const result = parseLaunchPaths([".", "src", tmpDir]);
    expect(result.folders).toEqual([path.resolve(tmpDir)]);
  });

  it("不存在的路径 → 丢弃（console.warn，不进结果）", () => {
    const missing = path.join(tmpDir, "definitely-missing-xyz");
    const result = parseLaunchPaths([missing, tmpDir]);
    expect(result.folders).toEqual([path.resolve(tmpDir)]);
    expect(result.files).toEqual([]);
  });

  it("同一路径重复出现 → 只收一次", () => {
    const result = parseLaunchPaths([tmpDir, tmpDir]);
    expect(result.folders).toEqual([path.resolve(tmpDir)]);
  });

  it("全噪声输入 → 双空数组（不抛）", () => {
    expect(parseLaunchPaths([".", "-flag", "relative.txt"])).toEqual({ files: [], folders: [] });
  });
});
