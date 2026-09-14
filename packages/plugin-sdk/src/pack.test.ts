/**
 * `pack` 通道的**排除表**单测（2026-09-15 补）。
 *
 * 为什么值得一条测试：这张表的错法是**静默**的——多排一个真内容 = 装上少文件（用户那边才现形）；
 * 少排一个仓面文件 = 出厂件与仓内重建不一致（内容指纹漂移，而两道门禁都看不见）。
 * 两种错都不会让任何东西变红，所以只能靠这里的**正反两向**钉住。
 */
import { describe, expect, it } from "vitest";
import { isPackableRelPath } from "./pack.js";

describe("isPackableRelPath —— 进包的（正例）", () => {
  it("插件本体：清单 / 数据文件 / 资源 / 源码 / 词典", () => {
    for (const rel of [
      "plugin.json",
      "themes/my-glass.json",
      "icons/pastel.json",
      "resources/cover.svg",
      "src/index.tsx",
      "i18n/en.json",
      "en.json",
      "CHANGELOG.md",
      "scripts/author-tool.mjs",
    ]) {
      expect(isPackableRelPath(rel), rel).toBe(true);
    }
  });

  it("🔴 LICENSE 必须随包（MIT 要求副本里带声明；zip 才是用户拿到的那份）", () => {
    for (const rel of ["LICENSE", "LICENSE.md", "LICENSE.txt"]) {
      expect(isPackableRelPath(rel), rel).toBe(true);
    }
  });

  it("同名但不同路径的工具文件不误伤（只精确排 scripts/ci-verify.mjs 这一条）", () => {
    expect(isPackableRelPath("vendor/ci-verify.mjs")).toBe(true);
  });
});

describe("isPackableRelPath —— 不进包的（负控）", () => {
  it("构建产物 / npm 元数据 / 隐藏项", () => {
    for (const rel of [
      "node_modules/foo/index.js",
      "dist/plugin.json",
      "demo.linkdesk-plugin",
      "pkg.tgz",
      "package.json",
      "package-lock.json",
      ".gitignore",
      ".github/workflows/ci.yml",
      ".vscode/settings.json",
      "sub/.npmrc",
    ]) {
      expect(isPackableRelPath(rel), rel).toBe(false);
    }
  });

  it("🔴 仓库面工具文件：AGENTS.md / marketplace.json / scripts/ci-verify.mjs", () => {
    for (const rel of ["AGENTS.md", "marketplace.json", "scripts/ci-verify.mjs"]) {
      expect(isPackableRelPath(rel), rel).toBe(false);
    }
  });
});
