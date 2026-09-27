/**
 * validate 墓碑提示测试（E6#91d，L3.7 第 3.7.2 轮）+ pluginId 显式声明提醒（E6#98g，L7 第 7.1 轮）。
 *
 * 钉死两件事：
 *   ① 旧写法（`plugin.json` 里还有 `changelog` / `readme`）→ **有警告、仍 `valid`**（警告不是错误——
 *      判错会让存量第三方插件的 `npm run build` 突然炸，为一个从无读取方的字段破坏构建不值）。
 *   ② 新写法（干净 manifest）→ **无警告**（墓碑不能变成噪音——那会让人习惯性忽略它）。
 *   `pluginId` 提醒同款哲学（E6#98g）：不声明 → 一条警告、`valid` 不变（兜底路径不删）。
 *
 * fixture 一律用明显虚构值（硬约束 21：测试桩不指向真实插件）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validatePluginJson } from "./validate.js";

const dirs: string[] = [];

/**
 * 造一个临时插件工程（写到盘上——validatePluginJson 是路径入口，含真实文件 IO）。
 * `pluginId` 默认写入：E6#98g 之后「干净 manifest」的定义包含显式身份——想测缺声明请
 * 显式传 `{ pluginId: undefined }`（见下方 pluginId 提醒那组）。
 */
function fixture(manifest: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "linkdesk-fixture-"));
  dirs.push(dir);
  writeFileSync(
    join(dir, "plugin.json"),
    JSON.stringify({ name: "Demo Fixture", version: "1.0.0", pluginId: "demo-fixture", ...manifest }, null, 2),
    "utf8",
  );
  return join(dir, "plugin.json");
}

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

/**
 * `contributes.floatingPanel` 首开形态（defaultForm / formKey）——**作者面机械门禁**。
 *
 * 为什么值得单列一组：这两个字段的**互斥**是纯 schema 语义（`"not": { "required": [...] }`），
 * 壳侧代码里**没有任何分支**会因此报错——删掉 schema 里那个 `"not"` 之后，壳的自然测试全绿，
 * 两个字段并存只会「formKey 优先」静默通过作者校验。故此处把契约钉在 schema 上：改 schema
 * 若破了互斥/词汇表，这里是第一道出声的地方。
 */
describe("validatePluginJson——floatingPanel 首开形态（defaultForm / formKey）", () => {
  it("不声明两者 → valid（原行为，存量作者零回归）", () => {
    const res = validatePluginJson(fixture({ contributes: { floatingPanel: { viewId: "demo-panel" } } }));
    expect(res.valid).toBe(true);
  });

  it("defaultForm 取词汇表内值 → valid（作者定死形态）", () => {
    const res = validatePluginJson(
      fixture({ contributes: { floatingPanel: { viewId: "demo-panel", defaultForm: "tab" } } }),
    );
    expect(res.valid).toBe(true);
  });

  it("formKey 是字符串 → valid（用户可配形态）", () => {
    const res = validatePluginJson(
      fixture({ contributes: { floatingPanel: { viewId: "demo-panel", formKey: "demo.openForm" } } }),
    );
    expect(res.valid).toBe(true);
  });

  it("词汇表外的 defaultForm → invalid（形态词汇表是闭集，拼错不许静默）", () => {
    const res = validatePluginJson(
      fixture({ contributes: { floatingPanel: { viewId: "demo-panel", defaultForm: "panel" } } }),
    );
    expect(res.valid).toBe(false);
    // 报错落到出错字段上（ajv 只报失败的那个关键字：enum = 闭集违规）
    expect(res.errors.join("\n")).toContain("contributes.floatingPanel.defaultForm");
    expect(res.errors.join("\n")).toContain("enum");
  });

  it("🔴 两者并存 → invalid（互斥红线；壳侧无分支可拦，只有 schema 拦得住）", () => {
    const res = validatePluginJson(
      fixture({
        contributes: { floatingPanel: { viewId: "demo-panel", defaultForm: "tab", formKey: "demo.openForm" } },
      }),
    );
    expect(res.valid).toBe(false);
    // 报错落在 floatingPanel 本身（失败关键字 = not，即 "not: { required: [...] }" 这条互斥约束）
    expect(res.errors.join("\n")).toContain("contributes.floatingPanel:");
    expect(res.errors.join("\n")).toContain("not");
  });

  it("formKey 非字符串 → invalid", () => {
    const res = validatePluginJson(
      fixture({ contributes: { floatingPanel: { viewId: "demo-panel", formKey: 123 } } }),
    );
    expect(res.valid).toBe(false);
  });

  it("缺 viewId → invalid（viewId 仍是唯一必填）", () => {
    const res = validatePluginJson(fixture({ contributes: { floatingPanel: { defaultForm: "tab" } } }));
    expect(res.valid).toBe(false);
  });
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

describe("validatePluginJson——pluginId 显式声明提醒（E6#98g）", () => {
  it("不声明 pluginId → 一条警告、valid 仍为 true（兜底路径不删，只是必须被告知）", () => {
    const res = validatePluginJson(fixture({ pluginId: undefined }));
    expect(res.valid).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings?.[0]).toContain("pluginId");
    // 警告必须说清**后果**（五条全不报错）与**怎么做**
    expect(res.warnings?.[0]).toContain("目录名");
  });

  it("显式声明 pluginId → 该提醒不出现（干净 manifest 不产噪音）", () => {
    const res = validatePluginJson(fixture({}));
    expect(res.valid).toBe(true);
    expect(res.warnings).toBeUndefined();
  });

  it("pluginId 为空白串 → schema 判错（不是「声明过了」，也不是静默警告）", () => {
    // 空白串不合 SAFE_PLUGIN_ID 形状 ⇒ schema 的 pattern 直接拦下（比「警告」更早、更硬）
    const res = validatePluginJson(fixture({ pluginId: "   " }));
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("pluginId"))).toBe(true);
    expect(res.warnings).toBeUndefined();
  });

  it("pluginId 形状非法 → schema 判错、无警告（错误优先，先修错）", () => {
    const res = validatePluginJson(fixture({ pluginId: "../escape" }));
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("pluginId"))).toBe(true);
    expect(res.warnings).toBeUndefined();
  });
});
