/**
 * windows-state 单测——E6#47f 冷启动恢复的落盘面。
 * 判据：① 写→读往返（含 wsWindowId 带回）；② 不存在/坏文件/字段非法 → 空态不抛（恢复失败静默空窗）。
 * 纯 fs + 注入目录（os.tmpdir 临时目录，硬约束 21：不指向任何真实用户资产）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readWindowsState, writeWindowsState } from "./windows-state";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lk-winstate-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("windows-state —— E6#47f", () => {
  it("写→读往返：工程 + 窗状态 key 都带回", () => {
    writeWindowsState(tmpDir, { lastActiveWindow: { workspaceFolder: "C:/demo-project-a", wsWindowId: "ws-2" } });
    expect(readWindowsState(tmpDir)).toEqual({
      lastActiveWindow: { workspaceFolder: "C:/demo-project-a", wsWindowId: "ws-2" },
    });
  });

  it("首窗（隐式 ws-1）：wsWindowId 记 null，读回仍 null", () => {
    writeWindowsState(tmpDir, { lastActiveWindow: { workspaceFolder: "C:/demo-project-b", wsWindowId: null } });
    expect(readWindowsState(tmpDir).lastActiveWindow).toEqual({ workspaceFolder: "C:/demo-project-b", wsWindowId: null });
  });

  it("空窗（无工程）：workspaceFolder null 原样带回", () => {
    writeWindowsState(tmpDir, { lastActiveWindow: { workspaceFolder: null, wsWindowId: null } });
    expect(readWindowsState(tmpDir).lastActiveWindow).toEqual({ workspaceFolder: null, wsWindowId: null });
  });

  it("🔴 负控：文件不存在 → 空态不抛（首次启动无记录）", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "lk-winstate-empty-"));
    try {
      expect(readWindowsState(empty)).toEqual({ lastActiveWindow: null });
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it("🔴 负控：坏 JSON / 脏 wsWindowId → 不抛且脏值被拒（回落 null）", () => {
    fs.writeFileSync(path.join(tmpDir, "windows-state.json"), "{ not json");
    expect(readWindowsState(tmpDir)).toEqual({ lastActiveWindow: null });

    fs.writeFileSync(path.join(tmpDir, "windows-state.json"), JSON.stringify({
      lastActiveWindow: { workspaceFolder: "C:/demo-project-c", wsWindowId: "evil;drop" },
    }));
    expect(readWindowsState(tmpDir).lastActiveWindow).toEqual({ workspaceFolder: "C:/demo-project-c", wsWindowId: null });
  });
});
