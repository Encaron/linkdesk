/**
 * `import-icon-theme` 单测（2026-10-06，随 D1-B 立项）。
 *
 * 为什么值得一条测试：这条命令的错法全是**静默**的——少拷一个 SVG（装上才发现图标空）、
 * 把上游没有的键当成有（清单写错却一声不响）、自绘资产缺失只写成 404、资产目录越界写到仓外。
 * 四种错都不会让别的门禁变红，所以只能在这里正反两向钉住。
 *
 * 另一半是**可复现**：某只图标集插件（theme-iconset-pastel）的 303 条清单必须能由本命令 ＋ 它本仓的
 * 清单文件一比一重生出来——那是「产物图纸住本仓」这件事的验收口径（案 00 §四 验收 2）。
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ICON_THEME_SCHEMA_REF,
  buildIconThemeMappings,
  importIconTheme,
  renderImportReport,
  type IconImportList,
} from "./import-icon-theme.js";

const ASSETS = "icons/material";

/** 上游夹具：五默认图标 ＋ 三枚真扩展名 ＋ 一枚只有 fontCharacter 的字形定义。 */
const upstream = {
  iconDefinitions: {
    file: { iconPath: "./../icons/file.svg" },
    folder: { iconPath: "./../icons/folder.svg" },
    folderExpanded: { iconPath: "./../icons/folder-open.svg" },
    rootFolder: { iconPath: "./../icons/root.svg" },
    rootFolderExpanded: { iconPath: "./../icons/root-open.svg" },
    typescript: { iconPath: "./../icons/typescript.svg" },
    python: { iconPath: "./../icons/python.svg" },
    wavefront: { iconPath: "./../icons/wavefront.svg" },
    unused: { iconPath: "./../icons/unused.svg" },
    glyphOnly: { fontCharacter: "\\e001" },
  },
  fileExtensions: { ts: "typescript", py: "python", o: "wavefront", glyph: "glyphOnly" },
  fileNames: { "package.json": "typescript" },
  folderNames: { src: "folder" },
  folderNamesExpanded: { src: "folderExpanded" },
  file: "file",
  folder: "folder",
  folderExpanded: "folderExpanded",
  rootFolder: "rootFolder",
  rootFolderExpanded: "rootFolderExpanded",
};

describe("buildIconThemeMappings —— 不传清单 = 导入上游全部", () => {
  const built = buildIconThemeMappings(upstream, null, ASSETS);

  it("扩展名键带上点、文件名/文件夹原样、五个默认图标全带过来", () => {
    expect(Object.keys(built.mappings.extensions).sort()).toEqual([".o", ".py", ".ts"]);
    expect(built.mappings.extensions[".ts"]).toEqual({ imagePath: `${ASSETS}/typescript.svg` });
    expect(Object.keys(built.mappings.files)).toEqual(["package.json"]);
    expect(Object.keys(built.mappings.folders)).toEqual(["src"]);
    expect(Object.keys(built.mappings.foldersExpanded)).toEqual(["src"]);
    for (const key of ["file", "folder", "folderExpanded", "rootFolder", "rootFolderExpanded"]) {
      expect(built.mappings).toHaveProperty(key);
    }
    expect(built.mappings.$schema).toBe(ICON_THEME_SCHEMA_REF);
  });

  it("🔴 只有 fontCharacter 的定义跳过（本命令不做字体→SVG 的转换），且如实报出", () => {
    expect(built.mappings.extensions[".glyph"]).toBeUndefined();
    expect(built.skippedKeys).toContain("glyph");
  });

  it("待拷资产 = 被引用的那些；上游声明了但没人引用的（unused）不拷", () => {
    expect(built.upstreamAssetFiles).toContain("typescript.svg");
    expect(built.upstreamAssetFiles).toContain("root-open.svg");
    expect(built.upstreamAssetFiles).toContain("wavefront.svg"); // `.o` 映射到它 ⇒ 算被引用
    expect(built.upstreamAssetFiles).not.toContain("unused.svg"); // 没有任何表指向它
  });
});

describe("buildIconThemeMappings —— 传清单 = 按作者的编辑决定筛", () => {
  const list: IconImportList = {
    extensions: ["ts"],
    fileNames: ["package.json", "missing.md"],
    folders: [],
    overrides: { ts: "python" },
    localIcons: { uvprojx: "uvprojx" },
  };
  const built = buildIconThemeMappings(upstream, list, ASSETS);

  it("只留清单点名的键；清单里上游没有的键进 skippedKeys（写错了要看得见）", () => {
    expect(Object.keys(built.mappings.extensions).sort()).toEqual([".ts", ".uvprojx"]);
    expect(Object.keys(built.mappings.folders)).toEqual([]);
    expect(built.skippedKeys).toContain("missing.md");
  });

  it("overrides 改指生效（.ts 拿的是 python 那枚）", () => {
    expect(built.mappings.extensions[".ts"]).toEqual({ imagePath: `${ASSETS}/python.svg` });
  });

  it("🔴 自绘资产只写映射、不进待拷清单（它住作者本仓，上游没有）", () => {
    expect(built.mappings.extensions[".uvprojx"]).toEqual({ imagePath: `${ASSETS}/uvprojx.svg` });
    expect(built.upstreamAssetFiles).not.toContain("uvprojx.svg");
  });
});

const makeFixture = (list?: IconImportList) => {
  const dir = mkdtempSync(join(tmpdir(), "ldk-icon-import-"));
  const upstreamRoot = join(dir, "upstream");
  mkdirSync(join(upstreamRoot, "dist"), { recursive: true });
  mkdirSync(join(upstreamRoot, "icons"), { recursive: true });
  writeFileSync(join(upstreamRoot, "dist", "material-icons.json"), JSON.stringify(upstream, null, 2));
  // 上游有三枚资产故意缺席，用来验「缺资产要报出来、但保留映射」
  for (const name of ["typescript.svg", "python.svg", "file.svg", "folder.svg", "folder-open.svg"]) {
    writeFileSync(join(upstreamRoot, "icons", name), `<svg xmlns="http://www.w3.org/2000/svg"/>`);
  }
  const root = join(dir, "plug");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "plugin.json"), JSON.stringify({ pluginId: "demo-iconset", version: "1.0.0" }));
  if (list) writeFileSync(join(root, "icon-import.json"), JSON.stringify(list, null, 2));
  return { dir, root, source: join(upstreamRoot, "dist", "material-icons.json") };
};

describe("importIconTheme —— 落盘", () => {
  it("写出映射文件、只拷被引用的 SVG、缺的资产如实报出（不静默、也不抛）", () => {
    const fx = makeFixture({ extensions: ["ts", "py"], fileNames: ["package.json"] });
    try {
      const r = importIconTheme({
        root: fx.root,
        source: fx.source,
        name: "material",
        out: "icons/pastel.json",
        list: "icon-import.json",
      });
      const written = JSON.parse(readFileSync(join(fx.root, "icons", "pastel.json"), "utf8"));
      expect(written.$schema).toBe(ICON_THEME_SCHEMA_REF);
      expect(Object.keys(written.extensions).sort()).toEqual([".py", ".ts"]);
      expect(existsSync(join(fx.root, "icons", "material", "typescript.svg"))).toBe(true);
      // 夹具只给了 5 枚资产，其余被映射引用的（root-open.svg / wavefront.svg / …）缺席 ⇒
      // 进 missingAssetFiles 如实报出，但映射保留（运行时走保底图标），不抛
      expect(r.missingAssetFiles).toContain("root-open.svg");
      expect(r.missingAssetFiles).not.toContain("typescript.svg");
      expect(r.pluginId).toBe("demo-iconset");
      expect(r.counts.extensions).toBe(2);
      expect(r.counts.defaults).toBe(5);
      // 报告里要给出可粘贴的贡献点片段（作者下一步干什么，别让他去翻文档）
      const report = renderImportReport(r, fx.root);
      expect(report).toContain("demo-iconset.ld-iconset-material");
      expect(report).toContain("icons/pastel.json");
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });

  it("🔴 清单点名了自绘资产但仓里没有 ⇒ 抛错（映射指着它，装上也只会 404）", () => {
    const fx = makeFixture({ extensions: ["ts"], localIcons: { uvprojx: "uvprojx" } });
    try {
      expect(() =>
        importIconTheme({ root: fx.root, source: fx.source, name: "material", list: "icon-import.json" }),
      ).toThrow(/自绘资产/);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });

  it("🔴 资产目录不许越出插件工程（写到仓外的资产不会被 pack，装上也缺图）", () => {
    const fx = makeFixture();
    try {
      expect(() =>
        importIconTheme({ root: fx.root, source: fx.source, name: "material", assets: "../outside" }),
      ).toThrow(/必须落在插件工程内/);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });

  it("不是 VS Code iconTheme（无 iconDefinitions）⇒ 抛错，别把空表当成功", () => {
    const fx = makeFixture();
    try {
      writeFileSync(join(fx.root, "not-a-theme.json"), JSON.stringify({ hello: "world" }));
      expect(() => importIconTheme({ root: fx.root, source: "not-a-theme.json" })).toThrow(/iconDefinitions/);
    } finally {
      rmSync(fx.dir, { recursive: true, force: true });
    }
  });
});
