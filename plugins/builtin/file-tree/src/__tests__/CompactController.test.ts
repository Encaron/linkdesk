/**
 * E4V#Test2: CompactController 单元测试。
 * 压缩逻辑独立可测——不依赖视图层。
 */

import { describe, it, expect } from "vitest";
import { CompactController } from "../services/CompactController";
import type { ExplorerItem } from "../services/FileTreeModel";

/** 构造 ExplorerItem 的工厂辅助 */
function dir(
  uri: string,
  name: string,
  parent: ExplorerItem | null,
  children: ExplorerItem[] | null = null,
): ExplorerItem {
  return { uri, name, isDirectory: true, isSymlink: false, children, parent };
}

function file(
  uri: string,
  name: string,
  parent: ExplorerItem | null,
): ExplorerItem {
  return { uri, name, isDirectory: false, isSymlink: false, children: null, parent };
}

describe("CompactController", () => {
  /* ── isCompacted ── */

  it("单子目录链——isCompacted 返回 true", () => {
    const ctrl = new CompactController();
    const root = dir("/root", "root", null);
    const sub1 = dir("/root/sub1", "sub1", root);
    const sub2 = dir("/root/sub1/sub2", "sub2", sub1, []);
    sub1.children = [sub2];
    // sub2 是空目录→getCompactedPath(sub1) = ["sub1", "sub2"]
    // sub1 的 parent 是 root (parent.parent === null) → isIncompressible → false
    // isIncompressible 对根直子返回 true!
    // 所以 sub1 不可压缩
    expect(ctrl.isIncompressible(sub1)).toBe(true);
    expect(ctrl.isCompacted(sub1)).toBe(false);
  });

  it("二级单子目录链——isCompacted 返回 true（非根直子）", () => {
    const ctrl = new CompactController();
    // root → a → b → c（单链）
    const root = dir("/root", "root", null);
    const a = dir("/root/a", "a", root);
    const b = dir("/root/a/b", "b", a);
    const c = dir("/root/a/b/c", "c", b, []);
    root.children = [a];
    a.children = [b];
    b.children = [c];
    // a 是根直子→isIncompressible=true
    expect(ctrl.isIncompressible(a)).toBe(true);
    // b 的 parent 是 a, a.parent 是 root, b.parent.parent = a !== null → isIncompressible=false
    expect(ctrl.isIncompressible(b)).toBe(false);
    // b 有且仅有 1 个子目录 c→压缩
    expect(ctrl.isCompacted(b)).toBe(true);
  });

  it("多子目录——isCompacted 返回 false", () => {
    const ctrl = new CompactController();
    const root = dir("/root", "root", null);
    const a = dir("/root/a", "a", root);
    const child1 = dir("/root/a/x", "x", a, []);
    const child2 = dir("/root/a/y", "y", a, []);
    root.children = [a];
    a.children = [child1, child2];
    // a 是根直子→不可压缩
    expect(ctrl.isIncompressible(a)).toBe(true);
    // 但如果不是根直子，多子目录也不压缩
    const grand = dir("/root/b", "b", a);
    const g1 = dir("/root/b/g1", "g1", grand, []);
    const g2 = dir("/root/b/g2", "g2", grand, []);
    a.children = [child1, child2, grand];
    grand.children = [g1, g2];
    expect(ctrl.isIncompressible(grand)).toBe(false);
    expect(ctrl.isCompacted(grand)).toBe(false); // 2 children
  });

  it("空目录——isCompacted 返回 false", () => {
    const ctrl = new CompactController();
    const root = dir("/root", "root", null);
    const a = dir("/root/a", "a", root);
    const empty = dir("/root/a/empty", "empty", a, []); // children = []
    root.children = [a];
    a.children = [empty];
    // empty 的 parent=a, a.parent=root → not root direct child
    expect(ctrl.isIncompressible(empty)).toBe(false);
    // getCompactedPath(empty): children.length = 0 → return null
    expect(ctrl.isCompacted(empty)).toBe(false);
  });

  it("children=null（未加载）——isCompacted 返回 false", () => {
    const ctrl = new CompactController();
    const root = dir("/root", "root", null);
    const a = dir("/root/a", "a", root);
    const unloaded = dir("/root/a/b", "b", a, null); // children = null
    root.children = [a];
    a.children = [unloaded];
    expect(ctrl.isIncompressible(unloaded)).toBe(false);
    expect(ctrl.isCompacted(unloaded)).toBe(false);
  });

  /* ── isIncompressible ── */

  it("文件——isIncompressible 返回 true", () => {
    const ctrl = new CompactController();
    const root = dir("/root", "root", null);
    const f = file("/root/a.txt", "a.txt", root);
    expect(ctrl.isIncompressible(f)).toBe(true);
    expect(ctrl.isCompacted(f)).toBe(false);
  });

  it("根节点——isIncompressible 返回 true", () => {
    const ctrl = new CompactController();
    const root = dir("/root", "root", null);
    expect(ctrl.isIncompressible(root)).toBe(true);
    expect(ctrl.isCompacted(root)).toBe(false);
  });

  it("根直子——isIncompressible 返回 true", () => {
    const ctrl = new CompactController();
    const root = dir("/root", "root", null);
    const child = dir("/root/a", "a", root);
    expect(child.parent?.parent).toBe(null); // parent is root
    expect(ctrl.isIncompressible(child)).toBe(true);
  });

  /* ── expandCompact / collapseCompact ── */

  it("expandCompact→isCompacted 变为 false（_uncompacted 生效）", () => {
    const ctrl = new CompactController();
    const root = dir("/root", "root", null);
    const a = dir("/root/a", "a", root);
    const b = dir("/root/a/b", "b", a);
    const c = dir("/root/a/b/c", "c", b, []);
    root.children = [a];
    a.children = [b];
    b.children = [c];
    // b 可压缩（单子目录链，非根直子）
    expect(ctrl.isCompacted(b)).toBe(true);
    // 展开 b 的压缩链
    ctrl.expandCompact(b.uri);
    expect(ctrl.isUncompacted(b.uri)).toBe(true);
    expect(ctrl.isCompacted(b)).toBe(false);
  });

  it("collapseCompact→isCompacted 恢复", () => {
    const ctrl = new CompactController();
    const root = dir("/root", "root", null);
    const a = dir("/root/a", "a", root);
    const b = dir("/root/a/b", "b", a);
    const c = dir("/root/a/b/c", "c", b, []);
    root.children = [a];
    a.children = [b];
    b.children = [c];
    // 展开后再折叠
    ctrl.expandCompact(b.uri);
    expect(ctrl.isCompacted(b)).toBe(false);
    ctrl.collapseCompact(b.uri);
    expect(ctrl.isUncompacted(b.uri)).toBe(false);
    expect(ctrl.isCompacted(b)).toBe(true);
  });

  /* ── getCompactedSegments ── */

  it("getCompactedSegments——单子目录链返回路径段", () => {
    const ctrl = new CompactController();
    const root = dir("/root", "root", null);
    const a = dir("/root/a", "a", root);
    const b = dir("/root/a/b", "b", a);
    const c = dir("/root/a/b/c", "c", b, []);
    root.children = [a];
    a.children = [b];
    b.children = [c];
    const segments = ctrl.getCompactedSegments(b);
    expect(segments).toEqual(["b", "c"]);
  });

  it("getCompactedSegments——多子目录返回 null", () => {
    const ctrl = new CompactController();
    const root = dir("/root", "root", null);
    const a = dir("/root/a", "a", root);
    const b = dir("/root/a/b", "b", a);
    const c1 = dir("/root/a/b/c1", "c1", b, []);
    const c2 = dir("/root/a/b/c2", "c2", b, []);
    root.children = [a];
    a.children = [b];
    b.children = [c1, c2];
    const segments = ctrl.getCompactedSegments(b);
    expect(segments).toBeNull();
  });

  it("getCompactedSegments——文件返回 null", () => {
    const ctrl = new CompactController();
    const root = dir("/root", "root", null);
    const f = file("/root/a.txt", "a.txt", root);
    expect(ctrl.getCompactedSegments(f)).toBeNull();
  });
});
