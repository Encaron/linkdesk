/**
 * check 腿·`@linkdesk/ui` 消费 ⇒ `minAppVersion` 声明门禁（E6#129；「插件最低壳版本门禁」G2 改造）单测。
 *
 * 失效方向两头都要防：
 *   太松（漏掉一个没声明的消费仓 / 声明一个够不着的低版本却放行）⇒ 旧壳装上视图全崩且无提示；
 *   太紧（把 type-only import / 不消费 ui 的插件 / 命名空间取值判红）⇒ 假红——`import type` 编译期
 *   擦除，是零运行时依赖的合法形态；不消费 ui 的插件从来没有声明义务；命名空间拿不到的成员只是
 *   `undefined`，插件自己能降级，不该按最高的那个导出算地板。
 *
 * 🔴 本格新增的三条负控（05 §一 负控 1/2/3）就落在这里：全 since ≤ 声明 ⇒ 绿；非 ui 消费者 ⇒ 静默；
 *   type-only ⇒ 豁免。外加正控 2：导入一个 since 高的组件而声明低 ⇒ 红，**且报文四件齐**
 *   （地板值 / 越界导入名 / 它的 since / 修法二选一）。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeUiFloor,
  loadUiSurfaceLedger,
  collectUiImportNames,
  runUiMinAppVersionCheck,
} from "./ui-min-app-version.js";

function withPlugin(files: Record<string, string>, fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "ui-min-app-ver-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const RUNTIME_IMPORT = 'import { SelectBox } from "@linkdesk/ui";\n';

/** 夹具账本：三档 since，覆盖「基线 / 中间档 / 最高档」三件事（⛔ 不读仓里真账本，免测试随账本漂） */
const LEDGER: Record<string, string> = {
  Badge: "0.2.13",
  SelectBox: "0.2.13",
  inferSliderStep: "0.2.13",
  HintTip: "0.2.20",
  PluginCard: "0.2.48",
};

describe("随包账本（schemas/ui-surface.json）", () => {
  it("正控：能读到**真**账本，且四栏都有带 since 的条目（本格起它随包下发，第三方离线可判）", () => {
    const ledger = loadUiSurfaceLedger();
    expect(ledger).not.toBeNull();
    const names = Object.keys(ledger!);
    expect(names.length).toBeGreaterThan(50);
    // 抽查三条承重名：32 个组件那批的起点、HintTip（模板消费的那个）、PluginCard（本格事故形态）
    expect(ledger!.Badge).toBe("0.2.13");
    expect(ledger!.HintTip).toBe("0.2.20");
    expect(ledger!.PluginCard).toBe("0.2.48");
    for (const [name, since] of Object.entries(ledger!)) {
      expect(since, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("负控：账本里每一条 since 都不为空 —— 半份账本比没有账本更坏（它会算出偏低的假地板）", () => {
    const ledger = loadUiSurfaceLedger()!;
    expect(Object.values(ledger).every((s) => typeof s === "string" && s.trim() !== "")).toBe(true);
  });
});

describe("computeUiFloor（纯函数：地板公式）", () => {
  it("正控：地板 = max(基线, 具名导入名的 since)——三档都验", () => {
    expect(computeUiFloor(LEDGER, []).floor).toBe("0.2.13"); // 无具名导入 ⇒ 基线
    expect(computeUiFloor(LEDGER, ["Badge"]).floor).toBe("0.2.13");
    expect(computeUiFloor(LEDGER, ["Badge", "HintTip"]).floor).toBe("0.2.20");
    expect(computeUiFloor(LEDGER, ["Badge", "PluginCard", "HintTip"]).floor).toBe("0.2.48"); // 取最大
  });

  it("正控：地板带上**出处**（哪个名字把它顶上去的、它自己的 since）", () => {
    const f = computeUiFloor(LEDGER, ["Badge", "PluginCard"]);
    expect(f.driver).toEqual({ name: "PluginCard", since: "0.2.48" });
    expect(f.baseline).toBe("0.2.13");
    // 名字都在基线档 ⇒ 地板 = 基线，没有「越界者」
    expect(computeUiFloor(LEDGER, ["Badge", "SelectBox"]).driver).toBeNull();
  });

  it("负控：账本里没有的名字 ⇒ 进 missing（fail-closed 的输入），⛔ 不当它存在", () => {
    const f = computeUiFloor(LEDGER, ["Badge", "PluginKard", "PluginKard"]);
    expect(f.missing).toEqual(["PluginKard"]); // 去重
    expect(f.floor).toBe("0.2.13"); // missing 不参与地板（它没有 since 可算）
  });

  it("负控：基线不是硬编码常量——账本换成更高起点，地板跟着走（改壳仓账本 ⇒ 本腿自动跟）", () => {
    const shifted = { A: "0.5.0", B: "0.6.0" };
    expect(computeUiFloor(shifted, []).floor).toBe("0.5.0");
    expect(computeUiFloor(shifted, ["A"]).floor).toBe("0.5.0");
    expect(computeUiFloor(shifted, ["B"]).floor).toBe("0.6.0");
  });
});

describe("collectUiImportNames（收名口径）", () => {
  it("正控：静态具名导入收名；`as` 取源名；条目级 type 剔除；跨文件去重", () => {
    withPlugin(
      {
        "src/a.ts": 'import { Badge, HintTip as Tip, type SelectBoxProps } from "@linkdesk/ui";\n',
        "src/b.tsx": 'import { Badge } from "@linkdesk/ui";\n',
      },
      (root) => {
        const got = collectUiImportNames(root);
        expect(got.map((n) => n.name)).toEqual(["Badge", "HintTip"]);
        expect(got[0]).toMatchObject({ file: "src/a.ts", line: 1 });
      },
    );
  });

  it("负控：非「静态具名导入裸包名」的形态**不贡献名字**（命名空间/动态/require/side-effect/子路径/默认导入）", () => {
    withPlugin(
      {
        "src/a.ts": 'import * as UI from "@linkdesk/ui";\n',
        "src/b.ts": 'const m = await import("@linkdesk/ui");\n',
        "src/c.js": 'const { x } = require("@linkdesk/ui");\n',
        "src/d.ts": 'import "@linkdesk/ui";\n',
        "src/e.ts": 'import { css } from "@linkdesk/ui/dist/index.css";\n',
        "src/f.ts": 'import Default from "@linkdesk/ui";\n',
      },
      (root) => {
        expect(collectUiImportNames(root)).toEqual([]);
      },
    );
  });

  it("负控：注释里的具名导入不算（清洗在先）", () => {
    withPlugin({ "src/a.ts": '// import { PluginCard } from "@linkdesk/ui";\nconst x = 1;\n' }, (root) => {
      expect(collectUiImportNames(root)).toEqual([]);
    });
  });
});

describe("runUiMinAppVersionCheck", () => {
  it("正控：消费 ui ＋ 未声明 minAppVersion ⇒ plugin.json:1 报红，报文带地板值", () => {
    withPlugin({ "plugin.json": '{"name":"Demo","version":"1.0.0"}', "src/index.tsx": RUNTIME_IMPORT }, (root) => {
      const v = runUiMinAppVersionCheck(root, { ledger: LEDGER });
      expect(v).toHaveLength(1);
      expect(v[0].file).toBe("plugin.json");
      expect(v[0].line).toBe(1);
      expect(v[0].message).toContain("未声明");
      expect(v[0].message).toContain("0.2.13"); // 地板值
    });
  });

  it("正控2（本格要害）：导入 since 高的组件而声明低 ⇒ 红，报文四件齐（地板／越界名／出处／修法）", () => {
    withPlugin(
      {
        "plugin.json": '{"name":"Demo","version":"1.0.0","minAppVersion":"0.2.20"}',
        "src/index.tsx": 'import { PluginCard } from "@linkdesk/ui";\n',
      },
      (root) => {
        const v = runUiMinAppVersionCheck(root, { ledger: LEDGER });
        expect(v).toHaveLength(1);
        const m = v[0].message;
        expect(m).toContain("0.2.48"); // ① 地板值
        expect(m).toContain("PluginCard"); // ② 越界导入名
        expect(m).toContain("src/index.tsx:1"); // ② 它在哪一行
        expect(m).toContain("自壳 0.2.48 起"); // ③ 来源版本
        expect(m).toContain("修法二选一"); // ④ 修法
        // ⛔ 不许把「改用动态 import()」写成修法（那是风格约束，违反插件独立化）
        expect(m).not.toContain("动态 import");
        expect(m).not.toContain("dynamic import");
      },
    );
  });

  it("正控：声明低于基线 / 非 x.y.z / plugin.json 语法坏，全红", () => {
    withPlugin(
      {
        "plugin.json": '{"name":"Demo","version":"1.0.0","minAppVersion":"0.2.0"}',
        "src/index.tsx": RUNTIME_IMPORT,
      },
      (root) => {
        expect(runUiMinAppVersionCheck(root, { ledger: LEDGER })[0]?.message).toContain("低于地板");
      },
    );
    withPlugin(
      {
        "plugin.json": '{"name":"Demo","version":"1.0.0","minAppVersion":"latest"}',
        "src/index.tsx": RUNTIME_IMPORT,
      },
      (root) => {
        expect(runUiMinAppVersionCheck(root, { ledger: LEDGER })[0]?.message).toContain("x.y.z");
      },
    );
    withPlugin({ "plugin.json": '{"name":"Demo", bad', "src/index.tsx": RUNTIME_IMPORT }, (root) => {
      expect(runUiMinAppVersionCheck(root, { ledger: LEDGER })[0]?.message).toContain("fail-closed");
    });
  });

  it("正控：导入名不在账本 ⇒ 红（fail-closed，点名那个名字）", () => {
    withPlugin(
      {
        "plugin.json": '{"name":"Demo","version":"1.0.0","minAppVersion":"0.2.48"}',
        "src/index.tsx": 'import { PluginKard } from "@linkdesk/ui";\n',
      },
      (root) => {
        const v = runUiMinAppVersionCheck(root, { ledger: LEDGER });
        expect(v).toHaveLength(1);
        expect(v[0].message).toContain("PluginKard");
        expect(v[0].message).toContain("不在 @linkdesk/ui 的导出面账本里");
      },
    );
  });

  it("正控：账本读不到 ⇒ **未核验**红（⛔ 不许当 0 处通过）", () => {
    withPlugin(
      { "plugin.json": '{"name":"Demo","version":"1.0.0","minAppVersion":"9.9.9"}', "src/index.tsx": RUNTIME_IMPORT },
      (root) => {
        const v = runUiMinAppVersionCheck(root, { ledger: null });
        expect(v).toHaveLength(1);
        expect(v[0].message).toContain("未核验");
      },
    );
  });

  it("正控：plugin.json 缺失 ＋ 消费 ui ⇒ fail-closed（不消费则静默）", () => {
    withPlugin({ "src/index.tsx": RUNTIME_IMPORT }, (root) => {
      expect(runUiMinAppVersionCheck(root, { ledger: LEDGER })).toHaveLength(1);
    });
    withPlugin({ "src/index.tsx": 'import { something } from "./local.js";\n' }, (root) => {
      expect(runUiMinAppVersionCheck(root, { ledger: LEDGER })).toHaveLength(0);
    });
  });

  it("负控1：所有导入名的 since ≤ 声明 ⇒ 绿（含恰好等于 / 高于）", () => {
    for (const ver of ["0.2.13", "1.0.0"]) {
      withPlugin(
        {
          "plugin.json": `{"name":"Demo","version":"1.0.0","minAppVersion":"${ver}"}`,
          "src/index.tsx": RUNTIME_IMPORT,
        },
        (root) => {
          expect(runUiMinAppVersionCheck(root, { ledger: LEDGER }), ver).toHaveLength(0);
        },
      );
    }
  });

  it("负控1b：声明刚好等于高 since 的地板 ⇒ 绿（0.2.20 用 HintTip 不该红）", () => {
    withPlugin(
      {
        "plugin.json": '{"name":"Demo","version":"1.0.0","minAppVersion":"0.2.20"}',
        "src/index.tsx": 'import { HintTip } from "@linkdesk/ui";\n',
      },
      (root) => {
        expect(runUiMinAppVersionCheck(root, { ledger: LEDGER })).toHaveLength(0);
      },
    );
  });

  it("负控2：非 ui 消费者静默（不碰 @linkdesk/ui / 同名前缀包 / 注释提及 / 测试夹具）", () => {
    withPlugin(
      {
        "plugin.json": '{"name":"Demo","version":"1.0.0"}',
        "src/a.ts": 'import { x } from "@linkdesk/ui-utils";\n// import { y } from "@linkdesk/ui"; —— 已删\n',
        "src/lint.test.ts": 'const s = "from \\"@linkdesk/ui\\"";\n',
      },
      (root) => {
        expect(runUiMinAppVersionCheck(root, { ledger: LEDGER })).toHaveLength(0);
      },
    );
  });

  it("负控3：type-only import（单行 / 多行 / export type）不算消费——编译期擦除", () => {
    withPlugin(
      {
        "plugin.json": '{"name":"Demo","version":"1.0.0"}',
        "src/a.ts": 'import type { SelectBoxProps } from "@linkdesk/ui";\n',
        "src/b.ts": 'import type {\n  ContextMenuProps,\n  HintCardProps,\n} from "@linkdesk/ui";\n',
        "src/c.ts": 'export type { SelectBox } from "@linkdesk/ui";\n',
      },
      (root) => {
        expect(runUiMinAppVersionCheck(root, { ledger: LEDGER })).toHaveLength(0);
      },
    );
  });

  it("负控3b：命名空间消费 = 有义务但**按基线**算地板（不拿最高的那个导出过度杀伤）", () => {
    withPlugin(
      {
        "plugin.json": '{"name":"Demo","version":"1.0.0","minAppVersion":"0.2.13"}',
        "src/index.tsx": 'import * as UI from "@linkdesk/ui";\n',
      },
      (root) => {
        expect(runUiMinAppVersionCheck(root, { ledger: LEDGER })).toHaveLength(0); // 声明 = 基线 ⇒ 绿
      },
    );
    withPlugin(
      {
        "plugin.json": '{"name":"Demo","version":"1.0.0","minAppVersion":"0.2.12"}',
        "src/index.tsx": 'import * as UI from "@linkdesk/ui";\n',
      },
      (root) => {
        expect(runUiMinAppVersionCheck(root, { ledger: LEDGER })[0]?.message).toContain("基线"); // 低于基线仍红
      },
    );
  });

  it("负控：同语句混排（import { type X, 真值 }）⇒ 有运行时绑定照算，且只按真值那个名字算地板", () => {
    withPlugin(
      {
        "plugin.json": '{"name":"Demo","version":"1.0.0","minAppVersion":"0.2.13"}',
        "src/index.tsx": 'import { type SelectBoxProps, inferSliderStep } from "@linkdesk/ui";\n',
      },
      (root) => {
        expect(runUiMinAppVersionCheck(root, { ledger: LEDGER })).toHaveLength(0); // inferSliderStep since 0.2.13
      },
    );
    withPlugin(
      { "plugin.json": '{"name":"Demo","version":"1.0.0"}', "src/index.tsx": 'import { type SelectBoxProps, inferSliderStep } from "@linkdesk/ui";\n' },
      (root) => {
        expect(runUiMinAppVersionCheck(root, { ledger: LEDGER })).toHaveLength(1);
      },
    );
  });

  it("负控：动态 import / require / side-effect / 子路径都算消费（4 处），但都不贡献名字", () => {
    withPlugin(
      {
        "plugin.json": '{"name":"Demo","version":"1.0.0"}',
        "src/a.ts": 'const m = await import("@linkdesk/ui");\n',
        "src/b.js": 'const { x } = require("@linkdesk/ui");\n',
        "src/c.ts": 'import "@linkdesk/ui";\n',
        "src/d.ts": 'import { css } from "@linkdesk/ui/dist/index.css";\n',
      },
      (root) => {
        const v = runUiMinAppVersionCheck(root, { ledger: LEDGER });
        expect(v).toHaveLength(1); // 声明侧事实只报一条
        expect(v[0]?.message).toContain("4 处");
        expect(v[0]?.message).not.toContain("不在"); // 子路径的 `css` 不当「账本里没有的名字」报
      },
    );
  });
});
