/**
 * check-css-namespace 腿·**插件域悬空名判据**（E6#119 · 2026-09-19）单测。
 *
 * 覆盖 06 号档 §二第四步：**正控 ＋ 负控 A/B/C ＋ 保底 ＋ 锚词**。
 *
 * 为什么值得一条测试（沿 `keyframe-refs.test.ts` 的理由）：这条判据的**两个失效方向都是静默的**——
 *   · 太松（放过一处悬空）⇒ 样式/动画**静默消失**：不报错、只是不对，作者在 DevTools 里翻半天；
 *   · 太紧（把动态拼接 / 第三方自带 / 字符串里的 `className=` 判红）⇒ **假红**，假红会让真红失效
 *     （作者学会「看到红就 disable」）。负控 B/C/D/E 就是误报控三件套的钉子（格 1 尺子同款）。
 *
 * 🔴 锚词断言（`锚⑩` 客居侧）：本文件同时断言壳尺子与本腿的**口径锚词逐字同源**——它挂在壳仓
 * `npm run check` 的 vitest（packages 下各 test 文件）里 ⇒ 锚词漂移在 check 链当场红，
 * ⛔ 不必等壳尺子的 `--self-test`（那条不在 check 链）才发现。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runDanglingNameCheck, loadHostCssNames, type HostCssNames } from "./dangling-names.js";
import { runRetiredNameHint, type RetiredLedger } from "./retired-names.js";

/** 桩宿主定义集（单测不依赖随包 schema；真实 schema 的接线另有一条守卫测试） */
const STUB_HOST: HostCssNames = {
  version: 1,
  generatedFrom: "stub",
  classes: ["ldk-input", "ldk-toggle", "ldk-badge", "codicon-check"],
  keyframes: ["ldk-selectbox-in", "ldk-notif-icon-spin"],
  reservedKeyframeCount: 2,
};

/** 造一个临时插件工程（`manifest` 传 null ⇒ 不写 plugin.json） */
function withPlugin(
  opts: { manifest?: Record<string, unknown> | null; files?: Record<string, string> },
  fn: (root: string) => void,
): void {
  const base = mkdtempSync(join(tmpdir(), "dangling-names-"));
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

/** 期望行号由夹具自己算——写死数字会在夹具微调时变成「测试在骗自己」 */
const lineOf = (text: string, needle: string): number => text.split("\n").findIndex((l) => l.includes(needle)) + 1;

describe("悬空名判据（E6#119 · 作者侧腿）", () => {
  // ────────────────────────── 正控 ──────────────────────────

  it("正控①：喊了宿主没有、自己也没有的 `ldk-*` 名 ⇒ 报（名字 ＋ 文件:行 ＋ 修法）", () => {
    const js = ['jsx("div",{className:"ldk-ghost-widget ldk-input"});'].join("\n");
    withPlugin({ files: { "src/App.tsx": js } }, (root) => {
      const r = runDanglingNameCheck(root, { host: STUB_HOST });
      expect(r.error).toBeNull();
      expect(r.ldkRefs).toBe(2); // 两个 ldk-* 站点都计数（合规的 ldk-input 不是「没看见」）
      expect(r.dangling).toHaveLength(1);
      expect(r.dangling[0]).toMatchObject({ name: "ldk-ghost-widget", via: "js-classname", file: "src/App.tsx" });
      expect(r.dangling[0].line).toBe(lineOf(js, "ldk-ghost-widget"));
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].message).toContain("ldk-ghost-widget");
      expect(r.violations[0].message).toContain("静默丢样式");
      expect(r.violations[0].message).toContain("重新打包发版"); // 两步修法
    });
  });

  it("正控②：CSS `animation:` 引了双方都没有的关键帧 ⇒ 报（css-animation 通道）", () => {
    const css = [".demo-plugin-card {", "  animation: demo-plugin-ghost-anim .2s;", "}", ""].join("\n");
    withPlugin({ files: { "src/styles/App.css": css } }, (root) => {
      const r = runDanglingNameCheck(root, { host: STUB_HOST });
      expect(r.dangling).toHaveLength(1);
      expect(r.dangling[0]).toMatchObject({
        name: "demo-plugin-ghost-anim",
        via: "css-animation",
        file: "src/styles/App.css",
      });
      expect(r.dangling[0].line).toBe(lineOf(css, "animation:"));
    });
  });

  it("正控③：知情绕行（标准 disable 注释，与命名空间腿同 id）⇒ 悬空被豁免", () => {
    const js = [
      "// eslint-disable-next-line linkdesk/no-reserved-class-name -- 名字由宿主下版本提供",
      'jsx("div",{className:"ldk-ghost-widget"});',
    ].join("\n");
    withPlugin({ files: { "src/App.tsx": js } }, (root) => {
      const r = runDanglingNameCheck(root, { host: STUB_HOST });
      expect(r.ldkRefs).toBe(1); // 点还在（豁免 ≠ 没看见）
      expect(r.dangling).toHaveLength(0);
      expect(r.violations).toHaveLength(0);
    });
  });

  // ────────────────────────── 负控（误报控三件套 ＋ 宿主兜底） ──────────────────────────

  it("负控 A：`ldk-*` 名只被包内自己满足 ⇒ 不报悬空，进 borrowedLdk（归前缀腿判红，本腿不抢）", () => {
    withPlugin(
      {
        files: {
          "src/App.tsx": 'jsx("div",{className:"ldk-self-def"});',
          "src/styles/App.css": ".ldk-self-def { color: red; }",
        },
      },
      (root) => {
        const r = runDanglingNameCheck(root, { host: STUB_HOST });
        expect(r.dangling).toHaveLength(0);
        expect(r.violations).toHaveLength(0);
        expect(r.borrowedLdk).toEqual(["ldk-self-def"]);
      },
    );
  });

  it("负控 B：含插值的动态拼接 ⇒ 跳过并计数（⛔ 不许报——格 1 的误报控口径）", () => {
    withPlugin({ files: { "src/App.tsx": 'jsx("div",{className:`ldk-badge ldk-badge--${kind}`});' } }, (root) => {
      const r = runDanglingNameCheck(root, { host: STUB_HOST });
      expect(r.dangling).toHaveLength(0);
      expect(r.skipped.interp).toBe(1);
    });
  });

  it("负控 C：第三方自带（名字在自己包 CSS 里有提及——Monaco 那一类的结构）⇒ 不报，只计数", () => {
    withPlugin(
      {
        files: {
          "src/App.tsx": 'jsx("div",{className:"monaco-workbench stub-hook"});',
          "src/styles/App.css": ".stub-root .monaco-workbench { color: red; }",
        },
      },
      (root) => {
        const r = runDanglingNameCheck(root, { host: STUB_HOST });
        expect(r.dangling).toHaveLength(0);
        expect(r.notJudgedCount).toBe(1); // stub-hook（DOM 钩子）计数；monaco-workbench 被 CSS 提及兜住
      },
    );
  });

  it("负控 D：宿主定义集能兜住 ⇒ 不报（合法消费）", () => {
    withPlugin({ files: { "src/App.tsx": 'jsx("div",{className:"ldk-input ldk-toggle"});' } }, (root) => {
      const r = runDanglingNameCheck(root, { host: STUB_HOST });
      expect(r.dangling).toHaveLength(0);
      expect(r.violations).toHaveLength(0);
      expect(r.ldkRefs).toBe(2);
    });
  });

  it("负控 E：字符串 / 注释里的 `className=`（生成式代码）⇒ 不是站点（JS 词法口径）", () => {
    const js = [
      "const html = '<div className=\"ldk-ghost-from-string\">';",
      '// jsx("div",{className:"ldk-ghost-from-comment"});',
    ].join("\n");
    withPlugin({ files: { "src/App.tsx": js } }, (root) => {
      const r = runDanglingNameCheck(root, { host: STUB_HOST });
      expect(r.ldkRefs).toBe(0);
      expect(r.dangling).toHaveLength(0);
    });
  });

  it("负控 F：测试 / mock 文件不进产物 ⇒ 不扫（夹具里的假名字不许假红）", () => {
    withPlugin(
      {
        files: {
          "src/App.tsx": 'jsx("div",{className:"ldk-input"});',
          "src/App.test.tsx": 'jsx("div",{className:"ldk-ghost-in-test"});',
          "src/Foo.fixture.ts": 'export const cls = "ldk-ghost-in-fixture";',
        },
      },
      (root) => {
        const r = runDanglingNameCheck(root, { host: STUB_HOST });
        expect(r.ldkRefs).toBe(1);
        expect(r.dangling).toHaveLength(0);
      },
    );
  });

  it("负控 G：动画关键字 / 时长 ⇒ 不是关键帧名（与关键帧腿同一把抽取器）", () => {
    const css = [".demo-plugin-card {", "  animation: 1.2s linear infinite;", "}"].join("\n");
    withPlugin({ files: { "src/styles/App.css": css } }, (root) => {
      const r = runDanglingNameCheck(root, { host: STUB_HOST });
      expect(r.kfRefs).toBe(0);
      expect(r.dangling).toHaveLength(0);
    });
  });

  // ────────────────────────── 保底（fail-closed） ──────────────────────────

  it("保底①：宿主定义集读不到 ⇒ 报「未核验」红（⛔ 假绿比假红更坏，不许当 0 处通过）", () => {
    withPlugin({ files: { "src/App.tsx": 'jsx("div",{className:"ldk-input"});' } }, (root) => {
      const r = runDanglingNameCheck(root, { host: null });
      expect(r.error).not.toBeNull();
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].file).toBe("plugin.json");
      expect(r.violations[0].line).toBe(1);
      expect(r.violations[0].message).toContain("未核验");
    });
  });

  it("守卫②：随包 schema 真读得到（生成器接线）——类名集非空、保留关键帧并入", () => {
    const host = loadHostCssNames();
    expect(host).not.toBeNull();
    expect(host!.classes.length).toBeGreaterThan(300); // 壳 348 裸定义 ＋ 提及集/codicon
    expect(host!.keyframes.length).toBeGreaterThanOrEqual(8);
    expect(host!.classes.some((n) => n.startsWith("codicon-"))).toBe(true);
  });

  // ────────────────────────── 锚⑩（口径同源，常驻 check） ──────────────────────────

  it("锚⑩：悬空名口径壳尺子 / SDK 腿同源（6 句锚词两边都在 ⇒ 改一边不改另一边必红）", () => {
    // vitest 下 import.meta.url 未必是 file 协议 ⇒ 先按 cwd（壳根）找，找不到再试 URL 解析
    const candidates = [
      resolve(process.cwd(), "scripts/plugin-dangling-name-audit.mjs"),
      (() => {
        try {
          return fileURLToPath(new URL("../../../../../scripts/plugin-dangling-name-audit.mjs", import.meta.url));
        } catch {
          return "";
        }
      })(),
    ].filter(Boolean);
    const rulerPath = candidates.find((p) => existsSync(p)) ?? candidates[0];
    // 本文件与 SDK 腿同目录——vitest 下 import.meta.url 未必是 file 协议 ⇒ 同样先按 cwd 找
    const sdkCandidates = [
      resolve(process.cwd(), "packages/plugin-sdk/src/eslint/checks/dangling-names.ts"),
      (() => {
        try {
          return fileURLToPath(new URL("./dangling-names.ts", import.meta.url));
        } catch {
          return "";
        }
      })(),
    ].filter(Boolean);
    const sdkPath = sdkCandidates.find((p) => existsSync(p)) ?? sdkCandidates[0];
    expect(existsSync(rulerPath)).toBe(true);
    const anchors = [
      "只判「**不属于它自己**的名字」",
      "在「自身定义集 ∪ 当前宿主定义集」里都没有",
      "动态拼接一律**跳过并计数**",
      "（自有命名空间 / DOM 钩子 / 第三方内联）",
      "只被包内自己满足",
      "`animation:` / `animation-name:` 引用的**关键帧名**",
    ];
    const rulerSrc = readFileSync(rulerPath, "utf8");
    const sdkSrc = readFileSync(sdkPath, "utf8");
    for (const a of anchors) {
      expect(rulerSrc.includes(a), `壳尺子缺锚词：${a}`).toBe(true);
      expect(sdkSrc.includes(a), `SDK 腿缺锚词：${a}`).toBe(true);
    }
  });
});

describe("退役名提示（E6#119 · 🟡 只提示永不拒绝）", () => {
  const LEDGER: RetiredLedger = {
    file: "stub",
    found: true,
    retired: [
      {
        name: "app.themeColorMode",
        kind: "configKey",
        since: "2026-08-25",
        why: "并入 app.theme",
        replacedBy: "app.theme",
        landing: "src/App/startup.ts:246",
        approvedBy: "用户 · 2026-09-18",
      },
    ],
  };

  it("正控：源码里整词引用退役名 ⇒ 提示（名字 ＋ 哪天退役 ＋ 替身 ＋ 出处）", () => {
    const js = ['const mode = getConfigurationValue("app.themeColorMode");'].join("\n");
    withPlugin({ files: { "src/main.ts": js } }, (root) => {
      const r = runRetiredNameHint(root, LEDGER);
      expect(r.ledger.found).toBe(true);
      expect(r.hints).toHaveLength(1);
      expect(r.hints[0]).toMatchObject({
        name: "app.themeColorMode",
        since: "2026-08-25",
        replacedBy: "app.theme",
        file: "src/main.ts",
      });
      expect(r.hints[0].line).toBe(lineOf(js, "app.themeColorMode"));
    });
  });

  it("负控 A：引用的是**替身**（app.theme）⇒ 不提示（整词匹配，不得误中前缀超集）", () => {
    withPlugin({ files: { "src/main.ts": 'const t = getConfigurationValue("app.theme");' } }, (root) => {
      const r = runRetiredNameHint(root, LEDGER);
      expect(r.hints).toHaveLength(0);
    });
  });

  it("负控 B：账没读到 ⇒ 空转且能看出来（found=false，⛔ 不许静默装作查过）", () => {
    withPlugin({ files: { "src/main.ts": 'getConfigurationValue("app.themeColorMode");' } }, (root) => {
      const r = runRetiredNameHint(root, { file: "stub", found: false, retired: [] });
      expect(r.ledger.found).toBe(false);
      expect(r.hints).toHaveLength(0);
    });
  });

  it("边界：plugin.json 里的引用也在射程内（声明面也是引用面）", () => {
    const manifest = {
      pluginId: "demo-plugin",
      contributes: { configuration: { properties: { "app.themeColorMode": {} } } },
    };
    withPlugin({ manifest, files: {} }, (root) => {
      const r = runRetiredNameHint(root, LEDGER);
      expect(r.hints).toHaveLength(1);
      expect(r.hints[0].file).toBe("plugin.json");
    });
  });
});
