/**
 * 跨表面共享 chunk 判据（E6#159）单测——**纯函数**，不 import vite-config（其 vite 依赖链在 workspaces
 * 嵌套安装下会把测试图拖进 esbuild 二进制不匹配，见 pack.test.ts 注）。
 *
 * 为什么值得一条测试：两条判据的失效方向都是**静默**——判据太松 ⇒ 产物悄悄退回「每表面各一份实例」
 * （marketplace 1.1.4 事故形态，用户那边才现形）；判据太紧 ⇒ 每次构建都红，作者被假警报逼着绕路。
 * 所以正控（单次多入口的真实形状）与负控（逐表面独立构建的真实形状）两头都要钉。
 */
import { describe, expect, it } from "vitest";
import { findDuplicatedEntryModules, missingEntries, type EmittedChunk } from "./surface-chunk-guard.js";

const chunk = (fileName: string, isEntry: boolean, moduleIds: string[]): EmittedChunk => ({ fileName, isEntry, moduleIds });

describe("findDuplicatedEntryModules —— 正控（E6#159 单次多入口的真实形状）", () => {
  it("共享模块只在自己那一份 chunk 里：各入口只带自己的模块 ⇒ 绿", () => {
    const chunks = [
      chunk("index.bundle.js", true, ["/p/entry.tsx"]),
      chunk("views/A.bundle.js", true, ["/p/views/A.tsx"]),
      chunk("views/B.bundle.js", true, ["/p/views/B.tsx"]),
      chunk("shared-CSPQND2M.js", false, ["/p/src/services/store.ts"]),
      chunk("big-DYM6gbzV.js", false, ["/p/resources/big.svg"]),
    ];
    expect(findDuplicatedEntryModules(chunks)).toEqual([]);
  });

  it("非入口 chunk（worker asset 等）即使被多入口引用也不算重复", () => {
    const chunks = [
      chunk("index.bundle.js", true, ["/p/entry.tsx"]),
      chunk("views/A.bundle.js", true, ["/p/views/A.tsx"]),
      chunk("views/B.bundle.js", true, ["/p/views/B.tsx"]),
    ];
    expect(findDuplicatedEntryModules(chunks)).toEqual([]);
  });
});

describe("findDuplicatedEntryModules —— 负控（逐表面独立 build 的真实形状）", () => {
  it("同一 store 模块被三个表面各内联一份 ⇒ 点名模块与三个入口", () => {
    const chunks = [
      chunk("index.bundle.js", true, ["/p/entry.tsx", "/p/src/services/store.ts"]),
      chunk("views/A.bundle.js", true, ["/p/views/A.tsx", "/p/src/services/store.ts"]),
      chunk("views/B.bundle.js", true, ["/p/views/B.tsx", "/p/src/services/store.ts"]),
    ];
    expect(findDuplicatedEntryModules(chunks)).toEqual([
      { moduleId: "/p/src/services/store.ts", fileNames: ["index.bundle.js", "views/A.bundle.js", "views/B.bundle.js"] },
    ]);
  });

  it("只是两个表面共享同一模块（其余干净）也要报——两份即两实例，一个多一个少都是缺陷", () => {
    const chunks = [
      chunk("index.bundle.js", true, ["/p/entry.tsx"]),
      chunk("views/A.bundle.js", true, ["/p/views/A.tsx", "/p/src/services/realmSlot.ts"]),
      chunk("views/B.bundle.js", true, ["/p/views/B.tsx", "/p/src/services/realmSlot.ts"]),
    ];
    expect(findDuplicatedEntryModules(chunks).map((d) => d.moduleId)).toEqual(["/p/src/services/realmSlot.ts"]);
  });
});

describe("missingEntries —— G1 入口齐备（SDK 与壳 loader 的路径契约）", () => {
  it("每个声明路径都有产物 ⇒ 空数组", () => {
    const chunks = [
      chunk("index.bundle.js", true, ["/p/entry.tsx"]),
      chunk("views/A.bundle.js", true, ["/p/views/A.tsx"]),
      chunk("statusBar.bundle.js", true, ["/p/src/statusBar.tsx"]),
      chunk("shared-CSPQND2M.js", false, ["/p/src/services/store.ts"]),
    ];
    expect(missingEntries(["index.bundle.js", "views/A.bundle.js", "statusBar.bundle.js"], chunks)).toEqual([]);
  });

  it("产物路径漂了（vite 版本行为变化等）⇒ 点名缺席项，不静默出包", () => {
    const chunks = [chunk("index.bundle.js", true, ["/p/entry.tsx"]), chunk("views/A.js", true, ["/p/views/A.tsx"])];
    expect(missingEntries(["index.bundle.js", "views/A.bundle.js"], chunks)).toEqual(["views/A.bundle.js"]);
  });

  it("非入口 chunk 同名不算数——只有入口才算产出", () => {
    const chunks = [chunk("index.bundle.js", true, ["/p/entry.tsx"]), chunk("views/A.bundle.js", false, ["/p/views/A.tsx"])];
    expect(missingEntries(["views/A.bundle.js"], chunks)).toEqual(["views/A.bundle.js"]);
  });
});
