/**
 * validate 墓碑提示测试（E6#91d，L3.7 第 3.7.2 轮）。
 *
 * 钉死两件事：
 *   ① 旧写法（`plugin.json` 里还有 `changelog` / `readme`）→ **有警告、仍 `valid`**（警告不是错误——
 *      判错会让存量第三方插件的 `npm run build` 突然炸，为一个从无读取方的字段破坏构建不值）。
 *   ② 新写法（干净 manifest）→ **无警告**（墓碑不能变成噪音——那会让人习惯性忽略它）。
 *
 * fixture 一律用明显虚构值（硬约束 21：测试桩不指向真实插件）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validatePluginJson } from "./validate.js";

const dirs: string[] = [];

/** 造一个临时插件工程（写到盘上——validatePluginJson 是路径入口，含真实文件 IO） */
function fixture(manifest: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "linkdesk-fixture-"));
  dirs.push(dir);
  writeFileSync(join(dir, "plugin.json"), JSON.stringify({ name: "Demo Fixture", version: "1.0.0", ...manifest }, null, 2), "utf8");
  return join(dir, "plugin.json");
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("validatePluginJson——墓碑提示（E6#91d）", () => {
  it("干净 manifest → 无 warnings 键（墓碑不是噪音）", () => {
    const res = validatePluginJson(fixture({}));
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.warnings).toBeUndefined();
  });

  it("旧写法 changelog → 警告、valid 仍为 true（构建不炸）", () => {
    const res = validatePluginJson(
      fixture({ changelog: [{ version: "1.0.0", date: "2026-09-11", changes: ["一条"] }] }),
    );
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings?.[0]).toContain("changelog");
    expect(res.warnings?.[0]).toContain("CHANGELOG.md"); // 警告必须给出**去哪**
  });

  it("旧写法 readme → 警告、valid 仍为 true", () => {
    const res = validatePluginJson(fixture({ readme: "./README.md" }));
    expect(res.valid).toBe(true);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings?.[0]).toContain("readme");
    expect(res.warnings?.[0]).toContain("README.md");
  });

  it("两个都写 → 两条警告（各自指路，不合并成一条）", () => {
    const res = validatePluginJson(
      fixture({ readme: "./README.md", changelog: [{ version: "1.0.0", date: "2026-09-11" }] }),
    );
    expect(res.valid).toBe(true);
    expect(res.warnings).toHaveLength(2);
  });

  it("嵌套同名字段不算命中——只扫顶层（`cardDocMap` 里的键名 changelog 与墓碑无关）", () => {
    // `cardDocMap` 是合法的「任意键」顶层对象——用它的**键名**叫 changelog 来证明扫描只看顶层 key，
    // 不递归进子对象（递归 = 把用户数据当字段名，会误报）
    const res = validatePluginJson(fixture({ cardDocMap: { changelog: "resources/demo.md", readme: "resources/demo.md" } }));
    expect(res.valid).toBe(true);
    expect(res.warnings).toBeUndefined();
  });

  it("schema 已经拦下的 manifest → 提前返回，不产 warnings（先修错，别看噪音）", () => {
    // 缺 version（schema required）→ 走 valid:false 分支
    const dir = mkdtempSync(join(tmpdir(), "linkdesk-fixture-"));
    dirs.push(dir);
    const p = join(dir, "plugin.json");
    writeFileSync(p, JSON.stringify({ name: "Demo Fixture", changelog: [] }), "utf8");
    const res = validatePluginJson(p);
    expect(res.valid).toBe(false);
    expect(res.warnings).toBeUndefined();
  });
});
