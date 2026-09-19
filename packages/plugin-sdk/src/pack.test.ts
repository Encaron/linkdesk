/**
 * `pack` 通道的**排除表**单测（2026-09-15 补）。
 *
 * 为什么值得一条测试：这张表的错法是**静默**的——多排一个真内容 = 装上少文件（用户那边才现形）；
 * 少排一个仓面文件 = 出厂件与仓内重建不一致（内容指纹漂移，而两道门禁都看不见）。
 * 两种错都不会让任何东西变红，所以只能靠这里的**正反两向**钉住。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { isPackableRelPath, packPluginData, pinDirectoryEntryDates, zipTree, ZIP_ENTRY_DATE } from "./pack.js";

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

/**
 * E6#15o（2026-09-19）——**产物可复现**回归。
 *
 * 失效方向两头都是静默：目录条目日期漂移 ⇒ 连打两次字节必变（`git status` 恒脏、无法用
 * 「重打一遍」验证），而内容指纹门禁比文件条目（`entry.dir` 跳过）**抓不到它**——所以只能
 * 靠这里字节级钉住。目录条目必须真实存在（`themes/`、`themes/sub/`），日期必须等于
 * `ZIP_ENTRY_DATE`（jszip 隐式建目录吃 `new Date()` 的病根，见 `pinDirectoryEntryDates` 注）。
 */
describe("packPluginData —— 产物可复现（E6#15o）", () => {
  it("带子目录的插件连打两次逐字节一致；文件与目录条目日期全固定", async () => {
    const base = mkdtempSync(join(tmpdir(), "pack-repro-"));
    const root = join(base, "demo-repro-pack"); // 固定小写目录名——pluginId 由目录名兜底派生
    mkdirSync(root);
    writeFileSync(join(root, "plugin.json"), JSON.stringify({ name: "Demo Repro", version: "1.0.0" }));
    mkdirSync(join(root, "themes", "sub"), { recursive: true });
    writeFileSync(join(root, "themes", "a.json"), '{"a":1}\n');
    writeFileSync(join(root, "themes", "sub", "b.json"), '{"b":2}\n');
    try {
      const r1 = await packPluginData({ root, outFile: join(root, "p1.linkdesk-plugin") });
      const r2 = await packPluginData({ root, outFile: join(root, "p2.linkdesk-plugin") });
      expect(r1.entryCount, "plugin.json + 2 数据文件").toBe(3);
      expect(readFileSync(r1.outPath).equals(readFileSync(r2.outPath))).toBe(true);

      const zip = await JSZip.loadAsync(readFileSync(r1.outPath));
      for (const dirRel of ["themes/", "themes/sub/"]) {
        expect(zip.files[dirRel]?.dir, `${dirRel} 是目录条目`).toBe(true);
        expect(zip.files[dirRel]?.date.getTime(), `${dirRel} 日期固定`).toBe(ZIP_ENTRY_DATE.getTime());
      }
      expect(zip.files["themes/a.json"]?.date.getTime()).toBe(ZIP_ENTRY_DATE.getTime());
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

/**
 * build 通道（vite-config 调用的 `zipTree`，本体住在本模块）确定性——E6#15o（2026-09-19）。
 * build 通道此前**连文件条目都没钉日期**，且 `readdirSync` 不排序（NTFS 恰好按名返回、
 * ext4 不然）⇒ 条目顺序与时间戳双漂移。这里钉住：条目顺序确定（排序 DFS）、文件条目日期固定、
 * 目录条目 pin 后两次 generate 逐字节一致。测试不 import vite-config（其 vite 依赖链在
 * workspaces 嵌套安装下会把测试图拖进 esbuild 二进制不匹配）。
 */
describe("zipTree —— build 通道确定性（E6#15o）", () => {
  function withTree(files: string[], fn: (root: string) => void): void {
    const base = mkdtempSync(join(tmpdir(), "ziptree-"));
    const root = join(base, "demo-tree");
    mkdirSync(root);
    for (const rel of files) {
      const abs = join(root, rel);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, rel, "utf8");
    }
    try {
      fn(root);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }

  it("条目按名排序（DFS）；文件条目日期固定；隐式目录条目 pin 后日期固定", () => {
    withTree(["b.json", "a.txt", "themes/z.json", "themes/sub/deep.json"], (root) => {
      const zip = new JSZip();
      zipTree(zip, root, "");
      // 排序 DFS：a.txt < b.json < themes/{sub/deep.json < z.json}；隐式目录条目在首个孩子前出现
      expect(Object.keys(zip.files)).toEqual([
        "a.txt",
        "b.json",
        "themes/",
        "themes/sub/",
        "themes/sub/deep.json",
        "themes/z.json",
      ]);
      expect(zip.files["a.txt"]?.date.getTime()).toBe(ZIP_ENTRY_DATE.getTime());
      pinDirectoryEntryDates(zip);
      for (const dirRel of ["themes/", "themes/sub/"]) {
        expect(zip.files[dirRel]?.date.getTime(), dirRel).toBe(ZIP_ENTRY_DATE.getTime());
      }
    });
  });

  it("同一棵树连打两次，pin 后 generateAsync 逐字节一致", async () => {
    const files = ["plugin.json", "assets/logo.svg", "assets/icons/pastel.json", "i18n/en.json"];
    const build = async (): Promise<Buffer> => {
      const base = mkdtempSync(join(tmpdir(), "ziptree-"));
      const root = join(base, "demo-tree");
      mkdirSync(root);
      try {
        for (const rel of files) {
          const abs = join(root, rel);
          mkdirSync(join(abs, ".."), { recursive: true });
          writeFileSync(abs, rel, "utf8");
        }
        const zip = new JSZip();
        zipTree(zip, root, "");
        pinDirectoryEntryDates(zip);
        return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    };
    const b1 = await build();
    const b2 = await build();
    expect(b1.equals(b2)).toBe(true);
  });
});
