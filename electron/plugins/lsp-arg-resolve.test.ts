/**
 * E6#15e：lsp-arg-resolve 单测——注册处「插件根 → 绝对路径」换算的语义钉死。
 *
 * 路径换算（exists 可注入；不碰真实磁盘布局——hermetic）。基准语义单点权威（E6#15l）：
 * 相对路径**以插件根目录为基准解析**（锚词「插件根目录为基准」，门禁 scripts/check-lsp-args-base.mjs
 * 要求本文件同持该锚词——行为与 schema 描述机械对齐）：
 *   - 相对插件根的路径式 arg → 插件根绝对路径（demo-clang 虚构 fixture = 清单子-3
 *     「C 插件 clangd 验证」的壳侧语义；真实 C 插件不存在，映射规则以虚构 fixture 钉住）
 *   - python 真形：args 相对路径对 plugins/python 根换算 → 插件自带 node_modules/pyright
 *   - 绝对 arg → 原样（spawn 侧纯透传绝对 args——E5#114d ASAR 搬运已随 E6#15k 整删）
 *   - flag / 裸命令 arg（--stdio、node）→ 原样（不误伤命令行开关）
 *   - 无相对路径 → 原数组返回（不新分配）；args 缺失 → undefined
 *   - E6#16（workspaces hoist）：node_modules/ 前缀 arg 本地存在 → 本地；本地缺 → 向上找首个存在
 *     （父级/仓库根）；上下皆无 → 回落插件根基准位（ENOENT 指向期望路径，不静默换别处）
 */

import { describe, it, expect } from "vitest";
import * as path from "path";
import { isPathLikeArg, resolveLspArgsToPluginRoot } from "./lsp-arg-resolve.js";

const never = () => false;

describe("resolveLspArgsToPluginRoot（注册处插件根一次绝对化）", () => {
  it("相对插件根的路径式 arg → 插件根绝对路径（clangd 虚构 fixture，C 插件缺位语义）", () => {
    const pluginDir = path.resolve("plugins", "demo-clang");
    const out = resolveLspArgsToPluginRoot(
      ["node_modules/.bin/clangd", "--stdio"],
      pluginDir,
      never
    )!;
    expect(out).toEqual([
      path.resolve(pluginDir, "node_modules", ".bin", "clangd"),
      "--stdio",
    ]);
  });

  it("python 真形：pyright 相对路径 → 插件根 node_modules 绝对路径，--stdio 保留", () => {
    const pluginDir = path.resolve("plugins", "python");
    const out = resolveLspArgsToPluginRoot(
      ["node_modules/pyright/dist/pyright-langserver.js", "--stdio"],
      pluginDir,
      never
    )!;
    expect(out).toEqual([
      path.resolve(pluginDir, "node_modules", "pyright", "dist", "pyright-langserver.js"),
      "--stdio",
    ]);
  });

  it("绝对 arg 原样（spawn 侧纯透传绝对 args——ASAR 搬运已删）", () => {
    const pluginDir = path.resolve("plugins", "demo-clang");
    const abs = path.join(pluginDir, "bin", "clangd");
    const args = [abs, "--stdio"];
    expect(resolveLspArgsToPluginRoot(args, pluginDir)).toBe(args); // 全绝对 → 原数组
    expect(resolveLspArgsToPluginRoot(args, pluginDir)).toEqual([abs, "--stdio"]);
  });

  it("flag / 裸命令 arg 不动（非路径式，isPathLike false）", () => {
    const pluginDir = path.resolve("plugins", "demo-clang");
    const args = ["node", "--version"];
    expect(isPathLikeArg("node")).toBe(false);
    expect(isPathLikeArg("--stdio")).toBe(false);
    expect(resolveLspArgsToPluginRoot(args, pluginDir)).toBe(args);
  });

  it("路径式判定：分隔符 / 扩展名 / 绝对路径各命中一种即 true", () => {
    expect(isPathLikeArg("node_modules/.bin/clangd")).toBe(true); // 分隔符
    expect(isPathLikeArg("pyright-langserver.js")).toBe(true); // 扩展名
    expect(isPathLikeArg(path.join("a", "b"))).toBe(true); // 绝对或分隔符
    expect(isPathLikeArg("--stdio")).toBe(false);
    expect(isPathLikeArg("node")).toBe(false);
  });

  it("E6#16 本地 node_modules 存在 → 优先本地（不向上）", () => {
    const pluginDir = path.resolve("plugins", "python");
    const localAbs = path.resolve(
      pluginDir,
      "node_modules",
      "pyright",
      "dist",
      "pyright-langserver.js",
    );
    const out = resolveLspArgsToPluginRoot(
      ["node_modules/pyright/dist/pyright-langserver.js", "--stdio"],
      pluginDir,
      (p) => p === localAbs,
    )!;
    expect(out[0]).toBe(localAbs);
  });

  it("E6#16 hoist：本地缺 → 向上找父级 node_modules 首命中（插件根上一级）", () => {
    const pluginDir = path.resolve("plugins", "python");
    const parentHit = path.resolve("plugins", "node_modules", "pyright", "dist", "pyright-langserver.js");
    const out = resolveLspArgsToPluginRoot(
      ["node_modules/pyright/dist/pyright-langserver.js", "--stdio"],
      pluginDir,
      (p) => p === parentHit,
    )!;
    expect(out[0]).toBe(parentHit);
  });

  it("E6#16 hoist：本地与父级皆缺 → 仓库根 node_modules 命中（workspaces 提升实证）", () => {
    const pluginDir = path.resolve("plugins", "python");
    const rootHit = path.resolve("node_modules", "pyright", "dist", "pyright-langserver.js");
    const out = resolveLspArgsToPluginRoot(
      ["node_modules/pyright/dist/pyright-langserver.js", "--stdio"],
      pluginDir,
      (p) => p === rootHit,
    )!;
    expect(out[0]).toBe(rootHit);
  });

  it("E6#16 上下皆无 → 回落插件根基准位（ENOENT 指向期望路径，不静默换别处）", () => {
    const pluginDir = path.resolve("plugins", "python");
    const out = resolveLspArgsToPluginRoot(
      ["node_modules/pyright/dist/pyright-langserver.js", "--stdio"],
      pluginDir,
      never,
    )!;
    expect(out[0]).toBe(path.resolve(pluginDir, "node_modules", "pyright", "dist", "pyright-langserver.js"));
  });

  it("非 node_modules 前缀相对 arg 保持插件根基准（作者本地 bin/…，不走向上）", () => {
    const pluginDir = path.resolve("plugins", "demo-clang");
    const out = resolveLspArgsToPluginRoot(["bin/server.js", "--stdio"], pluginDir, never)!;
    expect(out[0]).toBe(path.resolve(pluginDir, "bin", "server.js"));
  });

  it("args 缺失 → undefined；空数组 → 原样（不新分配）", () => {
    expect(resolveLspArgsToPluginRoot(undefined, path.resolve("x"))).toBeUndefined();
    const empty: string[] = [];
    expect(resolveLspArgsToPluginRoot(empty, path.resolve("x"))).toBe(empty);
  });
});
