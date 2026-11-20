/**
 * init 三形态测试——K 验收判据「三形态产物零改动可被市场读取（空集合法）」用同一套 schema/validate
 * 自证；🔴 L0 陷阱腿：L0 仓绝不能长出根 marketplace.json（会截断市场 K5 回落链 = 插件从商店消失）。
 * 目录一律 mkdtemp 现场（硬约束 21 精神——不留任何写入仓库的 fixture）。
 */
import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initMarketplace } from "./init.js";
import { validateAuthorFile, validateMarketplace } from "./validate.js";

const tmpRoots: string[] = [];
function tmpDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), `${prefix}-`));
  tmpRoots.push(d);
  return d;
}
afterAll(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true });
});

describe("init 三形态", () => {
  it("L0：根有 plugin.json → 零配置，不写任何文件，给指引", () => {
    const dir = tmpDir("kit-init-l0");
    writeFileSync(join(dir, "plugin.json"), JSON.stringify({ pluginId: "demo-plugin", name: "Demo", version: "1.0.0" }), "utf8");
    const r = initMarketplace({ dir });
    expect(r.form).toBe("L0");
    expect(r.written).toEqual([]);
    expect(existsSync(join(dir, "marketplace.json"))).toBe(false);
    expect(r.guidance.length).toBeGreaterThan(0);
  });

  it("🔴 L0 陷阱腿：L0 + --author 只补 authors/<id>.json，⛔ 不长出根 marketplace.json", () => {
    const dir = tmpDir("kit-init-l0-author");
    writeFileSync(join(dir, "plugin.json"), "{}", "utf8");
    const r = initMarketplace({ dir, author: "demo-author" });
    expect(r.form).toBe("L0");
    expect(r.written).toEqual([join("authors", "demo-author.json")]);
    expect(existsSync(join(dir, "marketplace.json"))).toBe(false);
    const block = JSON.parse(readFileSync(join(dir, "authors", "demo-author.json"), "utf8"));
    const rr = validateAuthorFile(block);
    expect(rr.errors).toEqual([]);
  });

  it("L1：空目录 → marketplace.json ＋ marketplace.config.json；产物零改动过 validate（空集合法）", () => {
    const dir = tmpDir("kit-init-l1");
    const r = initMarketplace({ dir });
    expect(r.form).toBe("L1");
    expect(r.written).toEqual(["marketplace.json", "marketplace.config.json"]);
    const mp = JSON.parse(readFileSync(join(dir, "marketplace.json"), "utf8"));
    expect(mp.$schema).toContain("marketplace.schema.json");
    const vr = validateMarketplace(mp);
    expect(vr.errors).toEqual([]); // ← K 验收：零改动可被市场读取（空集合法）
    expect(vr.warnings).toEqual([]);
    const config = JSON.parse(readFileSync(join(dir, "marketplace.config.json"), "utf8"));
    expect(config.authorId).toBe("your-github-username");
  });

  it("L2：--author → marketplace.json ＋ authors/<id>.json；作者块零改动过 validate", () => {
    const dir = tmpDir("kit-init-l2");
    const r = initMarketplace({ dir, author: "demo-author" });
    expect(r.form).toBe("L2");
    expect(r.written).toEqual(["marketplace.json", join("authors", "demo-author.json")]);
    const vr = validateMarketplace(JSON.parse(readFileSync(join(dir, "marketplace.json"), "utf8")));
    expect(vr.errors).toEqual([]);
    const ar = validateAuthorFile(JSON.parse(readFileSync(join(dir, "authors", "demo-author.json"), "utf8")));
    expect(ar.errors).toEqual([]);
    expect(ar.warnings).toEqual([]);
  });

  it("L2 作者块带 $schema（VS Code 补全）且 repos 段骨架齐三键", () => {
    const dir = tmpDir("kit-init-l2-schema");
    initMarketplace({ dir, author: "demo-author" });
    const block = JSON.parse(readFileSync(join(dir, "authors", "demo-author.json"), "utf8")) as { $schema?: string; repos: Array<Record<string, string>> };
    expect(block.$schema).toContain("authors.schema.json");
    expect(Object.keys(block.repos[0]!).sort()).toEqual(["id", "name", "sourceUrl"]);
  });

  it("已有 marketplace.json / authors/<id>.json → 拒绝且不覆盖", () => {
    const dir = tmpDir("kit-init-exist");
    writeFileSync(join(dir, "marketplace.json"), "{}", "utf8");
    expect(() => initMarketplace({ dir })).toThrow(/已存在/);
    const dir2 = tmpDir("kit-init-exist2");
    mkdirSync(join(dir2, "authors"), { recursive: true });
    writeFileSync(join(dir2, "authors", "demo-author.json"), "{}", "utf8");
    expect(() => initMarketplace({ dir: dir2, author: "demo-author" })).toThrow(/已存在/);
    expect(readFileSync(join(dir2, "authors", "demo-author.json"), "utf8")).toBe("{}");
  });
});
