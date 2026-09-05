/**
 * E4V#Test4: FileExcludeFilter 单元测试。
 * glob 模式匹配 / .gitignore 解析合并 / 配置更新。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { FileExcludeFilter } from "../services/FileExcludeFilter";
// E5.8#20-c：契约化——FileEntry 走 @linkdesk/contracts（零 @src/core）
import type { FileEntry } from "@linkdesk/contracts";

describe("FileExcludeFilter", () => {
  let filter: FileExcludeFilter;

  beforeEach(() => {
    filter = new FileExcludeFilter();
  });

  /* ── matches ── */

  it("*.log 匹配——任意路径的 .log 文件被排除", () => {
    filter.configure({ "*.log": true });
    expect(filter.matches("app.log")).toBe(true);
    expect(filter.matches("sub/app.log")).toBe(true);
    expect(filter.matches("app.ts")).toBe(false);
  });

  it("**/.git/** 匹配——任意 .git 目录下内容被排除", () => {
    filter.configure({ "**/.git/**": true });
    expect(filter.matches(".git/HEAD")).toBe(true);
    expect(filter.matches("sub/.git/config")).toBe(true);
    expect(filter.matches(".gitignore")).toBe(false);
  });

  it("node_modules 匹配——**/ 前缀匹配任意路径中该段", () => {
    filter.configure({ "**/node_modules": true });
    expect(filter.matches("node_modules")).toBe(true);
    expect(filter.matches("node_modules/package.json")).toBe(true);
    expect(filter.matches("src/node_modules/lib.ts")).toBe(true);
    expect(filter.matches("src/app.ts")).toBe(false);
  });

  it("多个模式并集——任一匹配即排除", () => {
    filter.configure({ "*.log": true, "*.tmp": true, "**/dist": true });
    expect(filter.matches("app.log")).toBe(true);
    expect(filter.matches("app.tmp")).toBe(true);
    expect(filter.matches("dist/bundle.js")).toBe(true);
    expect(filter.matches("app.ts")).toBe(false);
  });

  it("空模式——全部放行", () => {
    filter.configure({});
    expect(filter.matches("anything.txt")).toBe(false);
    expect(filter.matches("node_modules/secret.js")).toBe(false);
  });

  it("false 值模式——不参与排除", () => {
    filter.configure({ "*.log": true, "*.tmp": false });
    expect(filter.matches("app.log")).toBe(true);
    expect(filter.matches("app.tmp")).toBe(false);
  });

  /* ── .gitignore ── */

  it("setGitignore——解析 .gitignore 内容并合并到 matches", () => {
    filter.configure({ "*.log": true });
    // dist/ → strip / → "dist" → 默认分支: 精确路径或后缀匹配
    // .env → 默认分支: 精确或后缀匹配
    filter.setGitignore("dist/\n.env\n# comment\n!.keep\n");
    // files.exclude + gitignore 并集
    expect(filter.matches("app.log")).toBe(true);       // files.exclude
    expect(filter.matches("dist")).toBe(true);           // gitignore: 精确匹配
    expect(filter.matches("sub/dist")).toBe(true);      // gitignore: 后缀匹配
    expect(filter.matches(".env")).toBe(true);           // gitignore: 精确匹配
    expect(filter.matches("app.ts")).toBe(false);        // neither
  });

  it("clearGitignore——清空 gitignore 规则但保留 files.exclude", () => {
    filter.configure({ "*.log": true });
    filter.setGitignore("dist/");
    expect(filter.matches("dist")).toBe(true);

    filter.clearGitignore();
    expect(filter.matches("dist")).toBe(false);
    expect(filter.matches("app.log")).toBe(true); // files.exclude 仍在
  });

  /* ── 配置更新 ── */

  it("重新 configure——旧模式被替换", () => {
    filter.configure({ "*.log": true });
    expect(filter.matches("app.log")).toBe(true);

    filter.configure({ "*.tmp": true });
    expect(filter.matches("app.log")).toBe(false); // 旧模式已清
    expect(filter.matches("app.tmp")).toBe(true);  // 新模式生效
  });

  /* ── clear ── */

  it("clear——清空所有模式和 gitignore", () => {
    filter.configure({ "*.log": true });
    filter.setGitignore("dist/");
    filter.clear();
    expect(filter.matches("app.log")).toBe(false);
    expect(filter.matches("dist/bundle.js")).toBe(false);
  });

  /* ── buildNestingMap ── */

  it("buildNestingMap——app.ts 嵌套 app.js + app.js.map + app.d.ts", () => {
    const entries: FileEntry[] = [
      { name: "app.ts", path: "src/app.ts", isDirectory: false, isFile: true },
      { name: "app.js", path: "src/app.js", isDirectory: false, isFile: true },
      { name: "app.js.map", path: "src/app.js.map", isDirectory: false, isFile: true },
    ];
    const map = filter.buildNestingMap(entries);
    expect(map.has("src/app.ts")).toBe(true);
    expect(map.get("src/app.ts")!.map((e) => e.name)).toEqual(["app.js", "app.js.map"]);
  });

  it("buildNestingMap——无匹配时不生成嵌套", () => {
    const entries: FileEntry[] = [
      { name: "readme.md", path: "readme.md", isDirectory: false, isFile: true },
      { name: "app.txt", path: "app.txt", isDirectory: false, isFile: true },
    ];
    const map = filter.buildNestingMap(entries);
    expect(map.size).toBe(0);
  });
});
