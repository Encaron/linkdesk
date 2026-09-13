/**
 * E4V#Test1: FileTreeModel 单元测试。
 * 数据模型核心——setRoots/findClosest/expand/collapse/getAncestors/排序。
 * getChildren 依赖 listDir IPC→需要 vi.mock。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { FileTreeModel } from "../services/FileTreeModel";
import { FileExcludeFilter } from "../services/FileExcludeFilter";
import type { ExplorerItem } from "../services/FileTreeModel";
// E5.8#20-c：契约化——FileEntry 走 @linkdesk/contracts（零 @src/core）
import type { FileEntry } from "@linkdesk/contracts";

/* ── 辅助工厂 ── */

function makeEntry(overrides: Partial<FileEntry> & { name: string; path: string; isDirectory: boolean }): FileEntry {
  return {
    isFile: !overrides.isDirectory,
    size: 0,
    modifiedAt: 0,
    ...overrides,
  };
}

/* ── listDir 桩（喂给 window.linkdesk.filesystem.listDir，见 beforeEach） ── */
// 🔴 E6#98b（L7 第 7.1 轮）：此处原有两条 `vi.mock("@src/core/...")`——`vi.mock` 的路径**必须能被解析**，
//   插件独立成仓后 `@src` 不存在（解析失败 = 红灯）。实测删掉后 `npx vitest run plugins/file-tree` 全绿，
//   证明它们是 E5#85 迁移后留下的**死 mock**（同文件原有注释亦自陈「FileTreeModel 用
//   lk.filesystem.listDir 而非 @src/core/FileService」「迁移后不再使用」）。
//   ⚠️ 判据是「测试真的过了」，不是注释说它不再使用——先删再真跑，删不掉才退回本地桩。

const { listDir } = vi.hoisted(() => ({ listDir: vi.fn() }));

/** E5#85 迁移后 FileTreeModel 通过 lk.configuration.get() 读配置——通过 __ldkConfigStore 设值 */
function setConfig(key: string, value: unknown) {
  (globalThis as { __ldkConfigStore?: Map<string, unknown> }).__ldkConfigStore?.set(key, value);
}

describe("FileTreeModel", () => {
  let model: FileTreeModel;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { __ldkConfigStore?: Map<string, unknown> }).__ldkConfigStore?.clear();
    setConfig("explorer.sortOrder", "default");
    // E5#85 迁移桥接——FileTreeModel 用 lk.filesystem.listDir 而非 @src/core/FileService
    window.linkdesk.filesystem.listDir = listDir;
    model = new FileTreeModel();
  });

  /* ── setRoots ── */

  it("setRoots→roots 正确创建", async () => {
    await model.setRoots(["/root/a"]);
    expect(model.roots).toHaveLength(1);
    expect(model.roots[0].uri).toBe("/root/a");
    expect(model.roots[0].name).toBe("a");
    expect(model.roots[0].isDirectory).toBe(true);
    expect(model.roots[0].children).toBeNull();
    expect(model.roots[0].parent).toBeNull();
  });

  it("setRoots 空数组不抛错", async () => {
    await model.setRoots([]);
    expect(model.roots).toEqual([]);
  });

  it("setRoots 多根正确创建", async () => {
    await model.setRoots(["/a", "/b"]);
    expect(model.roots).toHaveLength(2);
    expect(model.roots[0].uri).toBe("/a");
    expect(model.roots[1].uri).toBe("/b");
  });

  it("setRoots 去反斜杠——normalizePath 生效", async () => {
    await model.setRoots(["E:\\test\\sub"]);
    expect(model.roots[0].uri).toBe("E:/test/sub");
  });

  /* ── findClosestRoot ── */

  it("findClosestRoot——根下文件找到所属根", async () => {
    await model.setRoots(["/a", "/b"]);
    expect(model.findClosestRoot("/a/foo.ts")?.uri).toBe("/a");
    expect(model.findClosestRoot("/b/bar.ts")?.uri).toBe("/b");
  });

  it("findClosestRoot——根本身匹配", async () => {
    await model.setRoots(["/a"]);
    expect(model.findClosestRoot("/a")?.uri).toBe("/a");
  });

  it("findClosestRoot——未知 URI 返回 null", () => {
    expect(model.findClosestRoot("/unknown/file.ts")).toBeNull();
  });

  it("findClosestRoot——根前缀不匹配（/aa ≠ /a）", async () => {
    await model.setRoots(["/a"]);
    expect(model.findClosestRoot("/aa/file.ts")).toBeNull();
  });

  /* ── findClosest ── */

  it("findClosest——在已加载的 children 链中查找", async () => {
    await model.setRoots(["/root"]);
    const root = model.roots[0];
    // 手动构建已加载的树
    root.children = [
      { uri: "/root/src", name: "src", isDirectory: true, isSymlink: false, children: [
        { uri: "/root/src/app.ts", name: "app.ts", isDirectory: false, isSymlink: false, children: null, parent: null as unknown as ExplorerItem },
      ], parent: root },
    ];
    root.children[0].children![0].parent = root.children[0];

    const found = model.findClosest("/root/src/app.ts");
    expect(found?.name).toBe("app.ts");
    expect(found?.uri).toBe("/root/src/app.ts");
  });

  it("findClosest——目录未展开时返回最近已加载节点", async () => {
    await model.setRoots(["/root"]);
    const root = model.roots[0];
    root.children = null; // 未加载
    const found = model.findClosest("/root/src/app.ts");
    expect(found).toBe(root);
  });

  it("findClosest——根本身匹配", async () => {
    await model.setRoots(["/root"]);
    expect(model.findClosest("/root")?.uri).toBe("/root");
  });

  /* ── expand / collapse ── */

  it("expand→isExpanded=true", () => {
    model.expand("/root/src");
    expect(model.isExpanded("/root/src")).toBe(true);
  });

  it("collapse→isExpanded=false", () => {
    model.expand("/root/src");
    model.collapse("/root/src");
    expect(model.isExpanded("/root/src")).toBe(false);
  });

  it("collapseAll→所有展开项清空", () => {
    model.expand("/a");
    model.expand("/b");
    model.expand("/c");
    model.collapseAll();
    expect(model.isExpanded("/a")).toBe(false);
    expect(model.isExpanded("/b")).toBe(false);
    expect(model.isExpanded("/c")).toBe(false);
    expect(model.getExpandedUris()).toEqual([]);
  });

  it("getExpandedUris→返回所有已展开 URI", () => {
    model.expand("/a");
    model.expand("/b");
    expect(model.getExpandedUris().sort()).toEqual(["/a", "/b"]);
  });

  /* ── getAncestors ── */

  it("getAncestors——返回从根到父的展开链", async () => {
    await model.setRoots(["/root"]);
    const root = model.roots[0];
    root.children = [
      { uri: "/root/src", name: "src", isDirectory: true, isSymlink: false, children: [
        { uri: "/root/src/app.ts", name: "app.ts", isDirectory: false, isSymlink: false, children: null, parent: null as unknown as ExplorerItem },
      ], parent: root },
    ];
    const src = root.children[0];
    src.children![0].parent = src;
    model.expand("/root");
    model.expand("/root/src");

    const ancestors = model.getAncestors(src.children![0]);
    expect(ancestors.map((a) => a.name)).toEqual(["root", "src"]);
  });

  it("getAncestors——无父节点返回空", () => {
    const item: ExplorerItem = { uri: "/a", name: "a", isDirectory: false, isSymlink: false, children: null, parent: null };
    expect(model.getAncestors(item)).toEqual([]);
  });

  /* ── onDidChange ── */

  it("onDidChange——setRoots 触发变更事件", async () => {
    const fn = vi.fn();
    model.onDidChange.event(fn);
    await model.setRoots(["/root"]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("onDidChange——collapse 触发变更事件", () => {
    model.expand("/a");
    const fn = vi.fn();
    model.onDidChange.event(fn);
    model.collapse("/a");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  /* ── compactController ── */

  it("compactController——模型持有实例且 isIncompressible 对根返回 true", async () => {
    await model.setRoots(["/root"]);
    expect(model.compactController.isIncompressible(model.roots[0])).toBe(true);
  });

  /* ── setExcludeFilter / setDecorator ── */

  it("setExcludeFilter + setDecorator——可设置和清空", () => {
    const filter = new FileExcludeFilter();
    model.setExcludeFilter(filter);
    const fn = (_: ExplorerItem[]) => {};
    model.setDecorator(fn);
    model.setDecorator(null);
    model.setExcludeFilter(null);
    // 不抛错即为通过
  });

  /* ── sortOrder —— 6 种排序 ── */

  it("sortOrder default/foldersNestsFiles——目录优先", async () => {
    setConfig("explorer.sortOrder", "default");
    const m = new FileTreeModel();
    await m.init();
    await m.setRoots(["/root"]);
    listDir.mockResolvedValue([
      makeEntry({ name: "b.ts", path: "/root/b.ts", isDirectory: false }),
      makeEntry({ name: "a", path: "/root/a", isDirectory: true }),
      makeEntry({ name: "c.ts", path: "/root/c.ts", isDirectory: false }),
    ]);
    const children = await m.getChildren(m.roots[0]);
    expect(children.map((c) => c.name)).toEqual(["a", "b.ts", "c.ts"]);
  });

  it("sortOrder filesFirst——文件优先", async () => {
    setConfig("explorer.sortOrder", "filesFirst");
    const m = new FileTreeModel();
    await m.init();
    await m.setRoots(["/root"]);
    listDir.mockResolvedValue([
      makeEntry({ name: "a", path: "/root/a", isDirectory: true }),
      makeEntry({ name: "b.ts", path: "/root/b.ts", isDirectory: false }),
    ]);
    const children = await m.getChildren(m.roots[0]);
    expect(children.map((c) => c.name)).toEqual(["b.ts", "a"]);
  });

  it("sortOrder type——按扩展名排序", async () => {
    setConfig("explorer.sortOrder", "type");
    const m = new FileTreeModel();
    await m.init();
    await m.setRoots(["/root"]);
    listDir.mockResolvedValue([
      makeEntry({ name: "z.json", path: "/root/z.json", isDirectory: false }),
      makeEntry({ name: "a.ts", path: "/root/a.ts", isDirectory: false }),
      makeEntry({ name: "b.js", path: "/root/b.js", isDirectory: false }),
    ]);
    const children = await m.getChildren(m.roots[0]);
    // localeCompare: js < json < ts on this platform
    expect(children.map((c) => c.name)).toEqual(["b.js", "z.json", "a.ts"]);
  });

  it("sortOrder modified——按修改时间倒序", async () => {
    setConfig("explorer.sortOrder", "modified");
    const m = new FileTreeModel();
    await m.init();
    await m.setRoots(["/root"]);
    listDir.mockResolvedValue([
      makeEntry({ name: "old.ts", path: "/root/old.ts", isDirectory: false, modifiedAt: 100 }),
      makeEntry({ name: "new.ts", path: "/root/new.ts", isDirectory: false, modifiedAt: 200 }),
    ]);
    const children = await m.getChildren(m.roots[0]);
    expect(children.map((c) => c.name)).toEqual(["new.ts", "old.ts"]);
  });
});
