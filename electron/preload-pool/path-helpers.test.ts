/**
 * 壳 path.* 行为对照用例（2026-11-24 F1）——file-tree 迁到宿主实现后必须逐条对齐的边界。
 *
 * 这些用例钉的是**宿主实现**（`buildPath`，electron/preload-pool/namespaces-data.ts）：
 *   · `\` 归一成 `/`（Windows listDir 返回反斜杠）；
 *   · `join` 折叠重复分隔符；
 *   · `extname` 对点开头文件（.gitignore）返回空；
 *   · `dirname` 无分隔符时返回 "."。
 * 插件侧（file-tree `utils/hostPath.ts`）只是转入口——行为差异在这里先红。
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), send: vi.fn() },
}));

import { buildPath } from "./namespaces-data";

const p = buildPath();

describe("壳 path.* 行为对照（file-tree F1 迁移基线）", () => {
  it("normalize：反斜杠归一成 /", () => {
    expect(p.normalize("C:\\Users\\a\\b.txt")).toBe("C:/Users/a/b.txt");
  });

  it("join：反斜杠归一 + 重复分隔符折叠", () => {
    expect(p.join("E:\\proj\\", "src", "a.ts")).toBe("E:/proj/src/a.ts");
    expect(p.join("E:/proj", "/src/", "a.ts")).toBe("E:/proj/src/a.ts");
  });

  it("basename：兼容 / 与 \\", () => {
    expect(p.basename("E:\\proj\\src\\a.ts")).toBe("a.ts");
    expect(p.basename("E:/proj/src/a.ts")).toBe("a.ts");
  });

  it("dirname：取父目录；无分隔符 → '.'", () => {
    expect(p.dirname("E:/proj/src/a.ts")).toBe("E:/proj/src");
    expect(p.dirname("a.ts")).toBe(".");
  });

  it("extname：普通/多点/点开头三种口径", () => {
    expect(p.extname("a.ts")).toBe(".ts");
    expect(p.extname("a.tar.gz")).toBe(".gz");
    expect(p.extname(".gitignore")).toBe(""); // dot 在首位 = 无扩展名（file-tree 旧实现同口径）
  });
});
