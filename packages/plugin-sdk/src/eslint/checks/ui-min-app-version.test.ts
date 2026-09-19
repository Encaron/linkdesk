/**
 * check 腿·`@linkdesk/ui` 消费 ⇒ `minAppVersion` 声明门禁（E6#129）单测。
 *
 * 失效方向两头都要防：太松（漏掉一个没声明的消费仓）⇒ 旧壳装上视图全崩且无提示；
 * 太紧（把 type-only import / 不消费 ui 的插件判红）⇒ 假红——`import type` 编译期擦除，
 * 是零运行时依赖的合法形态；不消费 ui 的插件从来没有声明义务。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUiMinAppVersionCheck, UI_REANCHOR_APP_VERSION } from "./ui-min-app-version.js";

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

describe("runUiMinAppVersionCheck", () => {
  it("锚：重锚号常量 = 0.2.13（E6#124 锁步起点；误改此值 = 供给下限漂移）", () => {
    expect(UI_REANCHOR_APP_VERSION).toBe("0.2.13");
  });

  it("正控：消费 ui ＋ 未声明 minAppVersion ⇒ plugin.json:1 报红", () => {
    withPlugin({ "plugin.json": '{"name":"Demo","version":"1.0.0"}', "src/index.tsx": RUNTIME_IMPORT }, (root) => {
      const v = runUiMinAppVersionCheck(root);
      expect(v).toHaveLength(1);
      expect(v[0].file).toBe("plugin.json");
      expect(v[0].line).toBe(1);
      expect(v[0].message).toContain("未声明");
    });
  });

  it("正控：声明低于重锚号 / 非 x.y.z 形态 / plugin.json 语法坏，全红", () => {
    withPlugin(
      {
        "plugin.json": '{"name":"Demo","version":"1.0.0","minAppVersion":"0.2.0"}',
        "src/index.tsx": RUNTIME_IMPORT,
      },
      (root) => {
        expect(runUiMinAppVersionCheck(root)[0]?.message).toContain("低于重锚号");
      },
    );
    withPlugin(
      {
        "plugin.json": '{"name":"Demo","version":"1.0.0","minAppVersion":"latest"}',
        "src/index.tsx": RUNTIME_IMPORT,
      },
      (root) => {
        expect(runUiMinAppVersionCheck(root)[0]?.message).toContain("x.y.z");
      },
    );
    withPlugin({ "plugin.json": '{"name":"Demo", bad', "src/index.tsx": RUNTIME_IMPORT }, (root) => {
      expect(runUiMinAppVersionCheck(root)[0]?.message).toContain("fail-closed");
    });
  });

  it("正控：plugin.json 缺失 ＋ 消费 ui ⇒ fail-closed（不消费则静默）", () => {
    withPlugin({ "src/index.tsx": RUNTIME_IMPORT }, (root) => {
      expect(runUiMinAppVersionCheck(root)).toHaveLength(1);
    });
    withPlugin({ "src/index.tsx": 'import { something } from "./local.js";\n' }, (root) => {
      expect(runUiMinAppVersionCheck(root)).toHaveLength(0);
    });
  });

  it("负控：消费 ui ＋ 声明 ≥ 重锚号（含恰好等于 / 高于）不红", () => {
    for (const ver of ["0.2.13", "1.0.0"]) {
      withPlugin(
        {
          "plugin.json": `{"name":"Demo","version":"1.0.0","minAppVersion":"${ver}"}`,
          "src/index.tsx": RUNTIME_IMPORT,
        },
        (root) => {
          expect(runUiMinAppVersionCheck(root), ver).toHaveLength(0);
        },
      );
    }
  });

  it("负控：type-only import（单行 / 多行 / export type）不算消费——编译期擦除", () => {
    withPlugin(
      {
        "plugin.json": '{"name":"Demo","version":"1.0.0"}',
        "src/a.ts": 'import type { SelectBoxProps } from "@linkdesk/ui";\n',
        "src/b.ts": 'import type {\n  ContextMenuProps,\n  HintCardProps,\n} from "@linkdesk/ui";\n',
        "src/c.ts": 'export type { SelectBox } from "@linkdesk/ui";\n',
      },
      (root) => {
        expect(runUiMinAppVersionCheck(root)).toHaveLength(0);
      },
    );
  });

  it("负控：同语句混排（import { type X, 真值 }）⇒ 有运行时绑定，照算", () => {
    withPlugin(
      { "plugin.json": '{"name":"Demo","version":"1.0.0"}', "src/index.tsx": 'import { type SelectBoxProps, inferSliderStep } from "@linkdesk/ui";\n' },
      (root) => {
        expect(runUiMinAppVersionCheck(root)).toHaveLength(1);
      },
    );
  });

  it("负控：动态 import / require / side-effect / 子路径都算消费", () => {
    withPlugin(
      {
        "plugin.json": '{"name":"Demo","version":"1.0.0"}',
        "src/a.ts": 'const m = await import("@linkdesk/ui");\n',
        "src/b.js": 'const { x } = require("@linkdesk/ui");\n',
        "src/c.ts": 'import "@linkdesk/ui";\n',
        "src/d.ts": 'import { css } from "@linkdesk/ui/dist/index.css";\n',
      },
      (root) => {
        const v = runUiMinAppVersionCheck(root);
        expect(v).toHaveLength(1); // 声明侧事实只报一条
        expect(v[0]?.message).toContain("4 处");
      },
    );
  });

  it("负控：同名前缀包（@linkdesk/ui-utils）不误伤；注释提及不算；测试夹具跳过", () => {
    withPlugin(
      {
        "plugin.json": '{"name":"Demo","version":"1.0.0"}',
        "src/a.ts": 'import { x } from "@linkdesk/ui-utils";\n// import { y } from "@linkdesk/ui"; —— 已删\n',
        "src/lint.test.ts": 'const s = "from \\"@linkdesk/ui\\"";\n',
      },
      (root) => {
        expect(runUiMinAppVersionCheck(root)).toHaveLength(0);
      },
    );
  });
});
