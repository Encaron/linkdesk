/**
 * check-menu-slot-case 腿·**菜单槽位 id 大小写判据**（文件树「打开文件夹入口」门禁件 · 2026-09-29）单测。
 *
 * ── 为什么这条判据的测试是**必需**的（不是礼貌性补测）──
 *   本腿要治的病是「**静默无输出**」：写错的键不报错、不抛异常，只是菜单项从此不出现——
 *   当年就是这样丢了两个多月。所以这条腿本身**两个失效方向也都是静默的**：
 *     · 太松（放过 `MenuBar`）⇒ 病原样复发，而且下次连「菜单项消失」这个现象都未必被认出来；
 *     · 太紧（把注释里的反面例子、`https://`、自造注册点判红）⇒ **假红**，假红让真红失效
 *       （作者学会「看到红就 disable」）。
 *   🔴 其中**注释剥离**这一条尤其关键：本腿自己的文件头注释里就写着 `"FileContext"` / `"MenuBar"`
 *   两个反面例子——不剥注释，这条腿会被自己的文档判红（负控②钉住）。
 *
 * ── 保底（fail-closed）──
 *   宿主名单读不到 ⇒ 报「未核验」并红（⛔ 不许静默当 0 处通过）。「0 处通过」在这里是假绿。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runMenuSlotCheck,
  loadHostMenuSlots,
  judgeMenuSlot,
  findMenuSlotSites,
  HOST_MENU_SLOTS_FILE,
  type HostMenuSlots,
} from "./menu-slots.js";

/** 桩宿主名单（单测不依赖随包 schema；真实名单的接线另有一条守卫测试钉住） */
const STUB_HOST: HostMenuSlots = {
  version: 1,
  generatedFrom: "stub",
  source: "stub",
  slotCount: 3,
  entries: [
    { key: "MenuBar", value: "menuBar" },
    { key: "FileContext", value: "fileContext" },
    { key: "CardContext", value: "cardContext" },
  ],
};

/** 造一个临时插件工程（`manifest` 传 null ⇒ 不写 plugin.json） */
function withPlugin(
  opts: { manifest?: Record<string, unknown> | null; files?: Record<string, string> },
  fn: (root: string) => void,
): void {
  const base = mkdtempSync(join(tmpdir(), "menu-slots-"));
  if (opts.manifest !== null) {
    const raw = opts.manifest ?? { pluginId: "demo-plugin", name: "夹具", version: "1.0.0" };
    writeFileSync(join(base, "plugin.json"), JSON.stringify(raw, null, 2), "utf8");
  }
  for (const [rel, text] of Object.entries(opts.files ?? {})) {
    mkdirSync(join(base, rel, ".."), { recursive: true });
    writeFileSync(join(base, rel), text, "utf8");
  }
  try {
    fn(base);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

describe("菜单槽位大小写判据（作者侧腿）", () => {
  // ────────────────────────── 判据本体 ──────────────────────────

  it("判据：与宿主值仅差大小写 ⇒ 命中（并回报成员名与值）；完全相等／与所有值都不同 ⇒ 不判", () => {
    const hit = judgeMenuSlot("MenuBar", STUB_HOST.entries);
    expect(hit).toEqual({ key: "MenuBar", value: "menuBar" });
    expect(judgeMenuSlot("menuBar", STUB_HOST.entries)).toBeNull(); // 正解
    expect(judgeMenuSlot("myOwnSlot", STUB_HOST.entries)).toBeNull(); // 自造注册点（开放字符串，合法）
    expect(judgeMenuSlot("menuBarExtra", STUB_HOST.entries)).toBeNull(); // 前缀撞名不是大小写事故
  });

  // ────────────────────────── 正控 ──────────────────────────

  it("正控①：`contributes.menus` 的键写成成员名 ⇒ 红（报点带文件:行 ＋ 该写的值）", () => {
    withPlugin(
      {
        manifest: {
          pluginId: "demo-plugin",
          contributes: { menus: { MenuBar: [{ command: "demo.x", label: "x" }], CardContext: [] } },
        },
      },
      (root) => {
        const report = runMenuSlotCheck(root, { host: STUB_HOST });
        expect(report.violations.map((v) => v.file)).toEqual(["plugin.json", "plugin.json"]);
        expect(report.violations[0].message).toContain("`MenuBar`");
        expect(report.violations[0].message).toContain("`menuBar`"); // 修法是报错内容的一部分
        expect(report.sites.filter((s) => s.via === "declarative").map((s) => s.slot).sort()).toEqual([
          "CardContext",
          "MenuBar",
        ]);
      },
    );
  });

  it("正控②：命令式 `menu.registerItems(\"MenuBar\", …)` ⇒ 红（可选链 `?.` 与解构后的裸调用都算）", () => {
    withPlugin(
      {
        files: {
          "src/a.ts": ['window.linkdesk?.menu?.registerItems("MenuBar", "demo", []);'].join("\n"),
          "src/b.ts": ['const { registerItems } = menu;\nregisterItems("FileContext", "demo", []);'].join("\n"),
        },
      },
      (root) => {
        const report = runMenuSlotCheck(root, { host: STUB_HOST });
        expect(report.violations.map((v) => `${v.file}:${v.line}`)).toEqual(["src/a.ts:1", "src/b.ts:2"]);
      },
    );
  });

  it('正控③：`menuId={"FileContext"}` 与 `menuId: "MenuBar"` ⇒ 红（`@linkdesk/ui` 的菜单 id prop）', () => {
    withPlugin(
      {
        files: {
          "src/Menu.tsx": ["export const A = () => <ContextMenu menuId={\"FileContext\"} />;"].join("\n"),
          "src/opts.ts": ['export const o = { menuId: "MenuBar" };'].join("\n"),
        },
      },
      (root) => {
        const report = runMenuSlotCheck(root, { host: STUB_HOST });
        expect(report.violations.map((v) => `${v.file}:${v.line}`)).toEqual(["src/Menu.tsx:1", "src/opts.ts:1"]);
      },
    );
  });

  // ────────────────────────── 负控（防假红）──────────────────────────

  it("负控①：正当写法一律不红——值形态 / 自造注册点 / 变量传参", () => {
    withPlugin(
      {
        manifest: {
          pluginId: "demo-plugin",
          contributes: { menus: { menuBar: [], fileContext: [], "demo-plugin-own": [] } },
        },
        files: {
          "src/ok.ts": [
            'menu.registerItems("menuBar", "demo", []);',
            'const id = "fileContext";',
            "menu.getItems(id);",
            'menu.getItems("cardContext");',
          ].join("\n"),
        },
      },
      (root) => {
        const report = runMenuSlotCheck(root, { host: STUB_HOST });
        expect(report.violations).toEqual([]);
        expect(report.sites.length).toBeGreaterThan(0); // 「看见了」与「判红」是两件事
      },
    );
  });

  it("负控②：**注释里的反面例子不判红**（本腿文件头就写着 `MenuBar`——不剥注释 = 自己被自己判红）", () => {
    withPlugin(
      {
        files: {
          "src/doc.ts": [
            "/** 反例：这条注释里写着 MenuBar / FileContext，还有 URL https://example.com/x */",
            '// 另一条行注释：registerItems("MenuBar", …) 是错的',
            'export const ok = "menuBar";',
          ].join("\n"),
        },
      },
      (root) => {
        const report = runMenuSlotCheck(root, { host: STUB_HOST });
        expect(report.violations).toEqual([]);
      },
    );
  });

  it("负控③：测试夹具（`*.test.tsx` / `*.mock.ts`）不判——与其余腿同口径", () => {
    withPlugin(
      {
        files: { "src/thing.test.tsx": ['const id = "MenuBar";'].join("\n") },
      },
      (root) => {
        const report = runMenuSlotCheck(root, { host: STUB_HOST });
        expect(report.violations).toEqual([]);
      },
    );
  });

  it("负控④：`// eslint-disable-next-line` 豁免行不亮灯（与其余腿同一个解析器）", () => {
    withPlugin(
      {
        files: {
          "src/waived.ts": [
            '// eslint-disable-next-line linkdesk/no-menu-slot-case -- 夹具：确有正当理由的形态',
            'menu.registerItems("MenuBar", "demo", []);',
          ].join("\n"),
        },
      },
      (root) => {
        const report = runMenuSlotCheck(root, { host: STUB_HOST });
        expect(report.violations).toEqual([]);
      },
    );
  });

  // ────────────────────────── 保底（fail-closed）──────────────────────────

  it("保底：宿主名单读不到 ⇒ 报「未核验」并红（⛔ 不许当 0 处通过 = 假绿）", () => {
    withPlugin({ files: { "src/a.ts": "export const a = 1;" } }, (root) => {
      const report = runMenuSlotCheck(root, { host: null });
      expect(report.error).not.toBeNull();
      expect(report.hostSlotCount).toBe(0);
      expect(report.violations).toHaveLength(1);
      expect(report.violations[0].message).toContain("未核验");
    });
  });

  // ────────────────────────── 随包名单接线守卫 ──────────────────────────

  it("随包名单：`schemas/host-menu-slots.json` 真在包里、真读得出、值全为小驼峰且互不重复", () => {
    const host = loadHostMenuSlots();
    expect(host, `读不到随包名单：${HOST_MENU_SLOTS_FILE}`).not.toBeNull();
    expect(host!.entries.length).toBeGreaterThanOrEqual(10);
    expect(host!.entries.every((e) => /^[a-z][A-Za-z0-9]*$/.test(e.value))).toBe(true);
    expect(new Set(host!.entries.map((e) => e.value)).size).toBe(host!.entries.length);
    // 🔴 不变量：值与成员名不自撞（否则「成员名 vs 值」这对概念在名单里失效，判据词根不成立）
    const keys = new Set(host!.entries.map((e) => e.key));
    expect(host!.entries.filter((e) => keys.has(e.value))).toEqual([]);
  });

  it("站点抽取：三个通道逐条可辨（declarative / menu-api / menu-id-prop）", () => {
    const src = [
      'menu.registerItems("MenuBar", "demo", []);',
      'const x = <C menuId={"FileContext"} />;',
    ].join("\n");
    expect(findMenuSlotSites(src).map((s) => `${s.via}:${s.slot}@${s.line}`)).toEqual([
      "menu-api:MenuBar@1",
      "menu-id-prop:FileContext@2",
    ]);
  });
});
