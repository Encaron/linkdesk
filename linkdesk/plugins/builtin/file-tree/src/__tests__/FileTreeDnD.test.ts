/**
 * E4V#Test3: executeSafeDrop 安全防线测试。
 * 数据安全防线——测错了用户丢数据。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
// E5.8#20-c：契约化——LinkDeskAPI 聚合类型走 @linkdesk/contracts（零 @src/core）
import type { LinkDeskAPI } from "@linkdesk/contracts";

// E5.6#11.5: executeSafeDrop 已迁移到 lk.filesystem.*——mock linkdesk 全局
const mockedCopy = vi.fn();
const mockedDelete = vi.fn();

// E5.7#98：配置改走 vitest.setup __ldkConfigStore（setup 的 configurationMock.get 读它）——
// 原自定义 get 返回 Promise<boolean> 与契约 get<T = unknown> 泛型签名不符。
// 语义不变：enableDragAndDrop → true (keep enabled); confirmDragAndDrop → false (skip dialog)
const ldkStore = () => (globalThis as { __ldkConfigStore?: Map<string, unknown> }).__ldkConfigStore;

// ESM import hoisting — 必须在 import 前设好全局 mock
window.linkdesk = {
  ...(window.linkdesk ?? {}),
  // 只覆盖被测路径用到的方法——cast 到契约面（最小 stub，非完整实现）
  filesystem: {
    copy: mockedCopy,
    rename: vi.fn(), // E5.8#25.2：契约必选面——测试路径未用到 rename，补最小 stub
    remove: mockedDelete,
  } as unknown as LinkDeskAPI["filesystem"],
};

// dynamic import——避 ESM hoisting，确保 lk 捕获已 mock 的 window.linkdesk
const { executeSafeDrop } = await import("../services/FileTreeDnD");

beforeEach(() => {
  mockedCopy.mockClear();
  mockedDelete.mockClear();
  ldkStore()?.set("explorer.enableDragAndDrop", true);
  ldkStore()?.set("explorer.confirmDragAndDrop", false);
});

describe("executeSafeDrop", () => {
  /* ── 拦截测试 ── */

  it("祖先→后代——拖根目录到子目录被拦截", async () => {
    await executeSafeDrop(
      [{ path: "/root", name: "root" }],
      "/root/sub",
      "copy",
    );
    expect(mockedCopy).not.toHaveBeenCalled();
  });

  it("自己→自己——拖目录到自身被拦截", async () => {
    await executeSafeDrop(
      [{ path: "/root/sub", name: "sub" }],
      "/root/sub",
      "copy",
    );
    expect(mockedCopy).not.toHaveBeenCalled();
  });

  it("同路径——源文件路径等于目标路径被拦截", async () => {
    await executeSafeDrop(
      [{ path: "/root/a.txt", name: "a.txt" }],
      "/root",
      "copy",
    );
    expect(mockedCopy).not.toHaveBeenCalled();
  });

  /* ── 放行测试 ── */

  it("合法路径——文件复制到不同目录放行", async () => {
    await executeSafeDrop(
      [{ path: "/other/b.txt", name: "b.txt" }],
      "/root",
      "copy",
    );
    expect(mockedCopy).toHaveBeenCalledTimes(1);
    expect(mockedCopy).toHaveBeenCalledWith("/other/b.txt", "/root/b.txt");
  });

  /* ── 多源混合 ── */

  it("多个源——部分拦截部分放行", async () => {
    await executeSafeDrop(
      [
        { path: "/root", name: "root" },          // 祖先→后代 → 拦截
        { path: "/other/c.txt", name: "c.txt" },   // 合法 → 放行
        { path: "/tmp/d.txt", name: "d.txt" },     // 合法 → 放行（不同目录）
      ],
      "/root/sub",
      "copy",
    );
    expect(mockedCopy).toHaveBeenCalledTimes(2);
    expect(mockedCopy).toHaveBeenCalledWith("/other/c.txt", "/root/sub/c.txt");
    expect(mockedCopy).toHaveBeenCalledWith("/tmp/d.txt", "/root/sub/d.txt");
  });

  /* ── 空源 ── */

  it("空源列表——不抛错", async () => {
    await expect(executeSafeDrop([], "/root", "copy")).resolves.toBeUndefined();
    expect(mockedCopy).not.toHaveBeenCalled();
  });

  /* ── 操作类型 ── */

  it("copy 操作——不调 remove", async () => {
    await executeSafeDrop(
      [{ path: "/other/e.txt", name: "e.txt" }],
      "/root",
      "copy",
    );
    expect(mockedCopy).toHaveBeenCalledTimes(1);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("move 操作——调 copy + remove", async () => {
    await executeSafeDrop(
      [{ path: "/other/f.txt", name: "f.txt" }],
      "/root",
      "move",
    );
    expect(mockedCopy).toHaveBeenCalledTimes(1);
    expect(mockedDelete).toHaveBeenCalledTimes(1);
    expect(mockedDelete).toHaveBeenCalledWith("/other/f.txt");
  });

  /* ── Windows 路径分隔符 ── */

  it("Windows 反斜杠——normalize 后再比较", async () => {
    // 拖 C:\root 到 C:\root\sub → 祖先→后代 → 拦截
    await executeSafeDrop(
      [{ path: "C:\\root", name: "root" }],
      "C:\\root\\sub",
      "copy",
    );
    expect(mockedCopy).not.toHaveBeenCalled();

    // 分隔符不一致（源用 \，目标用 /）→ normalize 后正确比较
    await executeSafeDrop(
      [{ path: "C:\\other\\g.txt", name: "g.txt" }],
      "C:/work",
      "copy",
    );
    expect(mockedCopy).toHaveBeenCalledWith("C:\\other\\g.txt", "C:/work/g.txt");
  });

  /* ── 路径含 .. ── */

  it("路径含双点——normalizePath 归一反斜杠但不解析 ..", async () => {
    // normalizePath 只归一化分隔符（\ → /），不解析 ..。
    // 因此含 .. 的路径走正常比较，不会被误判为同路径。
    await executeSafeDrop(
      [{ path: "/root/../other/h.txt", name: "h.txt" }],
      "/tmp",
      "copy",
    );
    // 不是同路径（s ≠ dest），合法放行
    expect(mockedCopy).toHaveBeenCalledTimes(1);
  });
});
