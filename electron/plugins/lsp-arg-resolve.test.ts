/**
 * E6#15e：lsp-arg-resolve 单测——注册处「插件根 → 绝对路径」换算的语义钉死。
 *
 * 纯路径换算（无 fs、无 electron import）——断言映射规则本身，不碰磁盘。
 * 基准语义单点权威（E6#15l）：相对路径**以插件根目录为基准解析**（锚词「插件根目录为基准」，
 * 门禁 scripts/check-lsp-args-base.mjs 要求本文件同持该锚词——行为与 schema 描述机械对齐）：
 *   - 相对插件根的路径式 arg → 插件根绝对路径（demo-clang 虚构 fixture = 清单子-3
 *     「C 插件 clangd 验证」的壳侧语义；真实 C 插件不存在，映射规则以虚构 fixture 钉住）
 *   - python 真形：args 相对路径对 plugins/python 根换算 → 插件自带 node_modules/pyright
 *   - 绝对 arg → 原样（spawn 侧纯透传绝对 args——E5#114d ASAR 搬运已随 E6#15k 整删）
 *   - flag / 裸命令 arg（--stdio、node）→ 原样（不误伤命令行开关）
 *   - 无相对路径 → 原数组返回（不新分配）；args 缺失 → undefined
 */

import { describe, it, expect } from "vitest";
import * as path from "path";
import { isPathLikeArg, resolveLspArgsToPluginRoot } from "./lsp-arg-resolve.js";

describe("resolveLspArgsToPluginRoot（注册处插件根一次绝对化）", () => {
  it("相对插件根的路径式 arg → 插件根绝对路径（clangd 虚构 fixture，C 插件缺位语义）", () => {
    const pluginDir = path.resolve("plugins", "demo-clang");
    const out = resolveLspArgsToPluginRoot(
      ["node_modules/.bin/clangd", "--stdio"],
      pluginDir
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
      pluginDir
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

  it("args 缺失 → undefined；空数组 → 原样（不新分配）", () => {
    expect(resolveLspArgsToPluginRoot(undefined, path.resolve("x"))).toBeUndefined();
    const empty: string[] = [];
    expect(resolveLspArgsToPluginRoot(empty, path.resolve("x"))).toBe(empty);
  });
});
