/**
 * FileIconResolver 单测——E6#69g 上移共享后补测（此前 file-tree 私有版零测试）。
 * 覆盖：默认映射（保底 codicon）→ 文件/文件夹/根/展开 + 图标主题 customMappings 覆盖/缺省。
 * 消费方（file-tree 行 / 壳文件标签 / 未来编辑类插件）共享本解析器——测试锁其契约不漂移。
 * fixture 用虚构主题 id/映射名，禁真实插件名/UI 文案（硬约束 21）。
 */

import { describe, expect, it } from "vitest";
import { FileIconResolver } from "./FileIconResolver";
import type { IconThemeMappings } from "@linkdesk/contracts";

/** 虚构图标主题映射——default 未命中处回退 codicon 保底语义验证 */
const DEMO_THEME: IconThemeMappings = {
  file: { class: "demo-glyph-file" },
  folder: { class: "demo-glyph-folder" },
  folderExpanded: { class: "demo-glyph-folder-open" },
  rootFolder: { class: "demo-glyph-root" },
  extensions: { ".ts": { class: "demo-glyph-ts" }, ".zz": { imagePath: "linkdesk://demo-theme/zz.svg" } },
  files: { "README.md": { class: "demo-glyph-readme" } },
  folders: { "src": { class: "demo-glyph-src" } },
  foldersExpanded: { "src": { class: "demo-glyph-src-open" } },
};

describe("FileIconResolver 默认映射（codicon 保底）", () => {
  it("无主题 customMappings → 全部走内置默认表 + codicon 保底", () => {
    const r = new FileIconResolver();
    // ext 命中
    expect(r.getFileIcon("main.ts")).toEqual({ kind: "class", className: "codicon-symbol-namespace" });
    // 文件名精确命中优先于 ext
    expect(r.getFileIcon("package.json")).toEqual({ kind: "class", className: "codicon-package" });
    // 无映射 ext → 默认文件图标
    expect(r.getFileIcon("main.py")).toEqual({ kind: "class", className: "codicon-file" });
    // 普通文件夹 → 默认文件夹图标
    expect(r.getFolderIcon("anything", false)).toEqual({ kind: "class", className: "codicon-folder" });
    // 特殊文件夹名
    expect(r.getFolderIcon("node_modules", false)).toEqual({ kind: "class", className: "codicon-archive" });
    // 根目录 → 根图标（未指定根 → 默认根保底）
    expect(r.getFolderIcon("workspace", true)).toEqual({ kind: "class", className: "codicon-root-folder" });
    // 展开无 foldersExpanded → 回退 folders
    expect(r.getFolderIconOpened("node_modules", false)).toEqual({ kind: "class", className: "codicon-archive" });
  });
});

describe("FileIconResolver 主题 customMappings", () => {
  const r = new FileIconResolver(DEMO_THEME);

  it("主题顶层默认图标 + ext/files 覆盖默认映射", () => {
    expect(r.getFileIcon("main.py")).toEqual({ kind: "class", className: "demo-glyph-file" }); // ext 未配.py → 主题顶层 file
    expect(r.getFileIcon("main.ts")).toEqual({ kind: "class", className: "demo-glyph-ts" }); // ext 命中主题
    expect(r.getFileIcon("README.md")).toEqual({ kind: "class", className: "demo-glyph-readme" }); // files 精确命中
    expect(r.getFileIcon("unknown.xyz")).toEqual({ kind: "class", className: "demo-glyph-file" }); // 兜底主题 file 而非 codicon
  });

  it("imagePath 映射 → image 描述符（linkdesk:// 壳已解析 URL 直渲）", () => {
    expect(r.getFileIcon("sample.zz")).toEqual({ kind: "image", url: "linkdesk://demo-theme/zz.svg" });
  });

  it("文件夹/根走主题（展开优先 foldersExpanded）", () => {
    expect(r.getFolderIcon("src", false)).toEqual({ kind: "class", className: "demo-glyph-src" });
    expect(r.getFolderIconOpened("src", false)).toEqual({ kind: "class", className: "demo-glyph-src-open" });
    expect(r.getFolderIconOpened("src", false)).not.toEqual(r.getFolderIcon("src", false));
    expect(r.getFolderIcon("anything", true)).toEqual({ kind: "class", className: "demo-glyph-root" });
    expect(r.getFolderIconOpened("anything", true)).toEqual({ kind: "class", className: "demo-glyph-root" }); // 根展开未指定 → 复用根
  });

  it("未覆盖的 key 仍回退内置默认（主题只替换声明部分，不整体清空）", () => {
    // 顶层默认被主题 file/folder 顶替：未命中任意映射 → 主题顶层默认（而非 codicon）
    expect(r.getFolderIcon("misc", false)).toEqual({ kind: "class", className: "demo-glyph-folder" });
    // 名称/ext 精确表是「默认表 + 主题表」合并——主题未声明的内置条目仍生效（codicon 保底保留）
    expect(r.getFolderIcon("node_modules", false)).toEqual({ kind: "class", className: "codicon-archive" });
    expect(r.getFileIcon("demo.json")).toEqual({ kind: "class", className: "codicon-json" });
  });
});
