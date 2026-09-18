/**
 * check-css-namespace 腿·**插件域关键帧引用判据**（E6#112 · 2026-09-18）单测。
 *
 * 覆盖 08 号档 §三那一表：**正控①–④ ＋ 负控①–⑥ ＋ 补充负控**。
 *
 * 为什么值得一条测试（沿用 `selector-form.test.ts` 的理由）：这条判据的**两个失效方向都是静默的**——
 *   · 太松（放过一条悬空引用）⇒ 动画**静默消失**：不报错、不抛异常、只是不动，作者只会觉得
 *     「我的动画怎么没生效」，然后在 DevTools 里翻半天；
 *   · 太紧（把 `animation: 1.2s linear infinite` 的 `linear` 当成关键帧名）⇒ **假红**，而假红会让
 *     真红失效（22 号档 §10.3）：作者学会「看到红就 disable」，门禁失效。
 *     本档把 `ANIMATION_KEYWORDS`（关键字表）与 `--*` 跳过两条口径**各钉一条负控**，就是防这个。
 *
 * ── 为什么正控里要有「宿主保留账」那一条 ──
 * 判据⑧ 在壳侧是**宿主域 ＋ 共享组件域**；本判据在插件侧，允许集必须**多一条**：宿主保留账
 * （`reserved-class-names.json#keyframes`，8 条）。插件 `animation: ldk-notif-icon-spin 1s` 是
 * **合法消费**，判红就是假红——这条负控④ 就是它的钉子。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runKeyframeRefCheck, KEYFRAME_REF_WHY } from "./keyframe-refs.js";
import { animationRefs } from "./css-selectors.js";

/** 造一个临时插件工程（`manifest` 传 null ⇒ 不写 plugin.json，用来钉 fail-closed） */
function withPlugin(
  opts: { manifest?: Record<string, unknown> | null; css?: string; cssRel?: string; dirName?: string },
  fn: (root: string) => void,
): void {
  const base = mkdtempSync(join(tmpdir(), "keyframe-refs-"));
  const root = opts.dirName ? join(base, opts.dirName) : base;
  mkdirSync(join(root, "src", "styles"), { recursive: true });
  if (opts.manifest !== null) {
    const raw = opts.manifest ?? { pluginId: "demo-plugin", name: "夹具", version: "1.0.0" };
    writeFileSync(join(root, "plugin.json"), `{\n  // 注释\n  ${JSON.stringify(raw).slice(1, -1)},\n}\n`, "utf8");
  }
  if (opts.css !== undefined) {
    writeFileSync(join(root, opts.cssRel ?? join("src", "styles", "App.css")), opts.css, "utf8");
  }
  try {
    fn(root);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

/** 期望行号由夹具自己算——写死数字会在夹具微调时变成「测试在骗自己」 */
const lineOf = (css: string, needle: string): number => css.split("\n").findIndex((l) => l.includes(needle)) + 1;

describe("判据⑨：插件域关键帧引用悬空（E6#112）", () => {
  // ────────────────────────── 正控 ──────────────────────────

  it("正控①：同文件 `@keyframes` 定义 ＋ 引用 ⇒ 绿（1.3 那三对的缩微夹具）", () => {
    const css = [
      "@keyframes demo-plugin-in {",
      "  from { opacity: 0; }",
      "  to { opacity: 1; }",
      "}",
      "",
      ".demo-plugin-card {",
      "  animation: demo-plugin-in 1s ease-out;",
      "}",
      "",
    ].join("\n");
    withPlugin({ css }, (root) => {
      const r = runKeyframeRefCheck(root);
      expect(r.error).toBeNull();
      expect(r.violations).toHaveLength(0);
      expect(r.dangling).toHaveLength(0);
      expect(r.refs).toBe(1); // 引用点**照样计数**（审计读数：合规引用不是「没看见」）
      expect(r.allowed).toContain("demo-plugin-in");
    });
  });

  it("正控②：定义写在**另一个**被扫描的 CSS 单元里 ⇒ 绿（定义先全量收齐再判引用，与文件顺序无关）", () => {
    const refsCss = ["@import './keyframes.css';", "", ".demo-plugin-card {", "  animation: demo-plugin-in 1s;", "}"].join(
      "\n",
    );
    withPlugin({ css: refsCss }, (root) => {
      // 引用文件在前、定义文件在后（顺序故意反过来，钉「先收定义」这条实现选择）
      writeFileSync(join(root, "src", "styles", "keyframes.css"), "@keyframes demo-plugin-in { to { opacity: 1; } }\n", "utf8");
      const r = runKeyframeRefCheck(root);
      expect(r.violations).toHaveLength(0);
      expect(r.allowed).toContain("demo-plugin-in");
    });
  });

  it("负控④（按档的编号）：引用**宿主保留账**里的关键帧 ⇒ 绿——合法消费，判红就是假红", () => {
    const css = [".demo-plugin-notif {", "  animation: ldk-notif-icon-spin 1s linear infinite;", "}"].join("\n");
    withPlugin({ css: `${css}\n` }, (root) => {
      const r = runKeyframeRefCheck(root);
      expect(r.violations).toHaveLength(0);
      expect(r.allowed).toContain("ldk-notif-icon-spin");
      // 账是**整本**进的允许集（8 条），不是只进被引用的那一条
      expect(r.allowed).toContain("ldk-selectbox-in");
      expect(r.dangling).toHaveLength(0);
    });
  });

  it("正控④：知情绕行（标准 disable 注释，与类名／关键帧同 id）⇒ 悬空也被豁免", () => {
    const css = [
      "/* eslint-disable linkdesk/no-reserved-class-name -- 关键帧由运行时注入，门禁看不到 */",
      ".demo-plugin-card {",
      "  animation: demo-plugin-injected 1s;",
      "}",
      "",
    ].join("\n");
    withPlugin({ css }, (root) => {
      const r = runKeyframeRefCheck(root);
      expect(r.violations).toHaveLength(0);
      expect(r.refs).toBe(1); // 点还在（豁免 ≠ 没看见），只是不进报点
      expect(r.dangling).toHaveLength(0);
    });
  });

  // ────────────────────────── 负控 ──────────────────────────

  it("负控①：删掉定义 ⇒ 红，且报点含**名字 ＋ 行号**（引用的那一行，不是文件头）", () => {
    const css = [
      "@keyframes demo-plugin-other {",
      "  to { opacity: 1; }",
      "}",
      "",
      ".demo-plugin-card {",
      "  animation: demo-plugin-fadeIn 1s;",
      "}",
      "",
    ].join("\n");
    withPlugin({ css }, (root) => {
      const r = runKeyframeRefCheck(root);
      expect(r.violations).toHaveLength(1);
      const v = r.violations[0];
      expect(v.file).toBe("src/styles/App.css");
      expect(v.line).toBe(lineOf(css, "animation: demo-plugin-fadeIn"));
      expect(v.message).toContain("demo-plugin-fadeIn"); // 名字
      expect(v.message).toContain("没有 `@keyframes` 定义"); // 判级文案
      expect(v.message).toContain(KEYFRAME_REF_WHY.dangling.slice(0, 20));
      expect(r.dangling[0]).toMatchObject({ name: "demo-plugin-fadeIn", decl: "animation" });
    });
  });

  it("负控②：`animation: none;` ／ `animation: 1.2s linear infinite;` ⇒ 不报（时长/缓动/方向不是名字）", () => {
    const css = [
      ".demo-plugin-card {",
      "  animation: none;",
      "}",
      "",
      ".demo-plugin-spin {",
      "  animation: 1.2s linear infinite;",
      "}",
      "",
    ].join("\n");
    withPlugin({ css }, (root) => {
      const r = runKeyframeRefCheck(root);
      expect(r.refs).toBe(0);
      expect(r.violations).toHaveLength(0);
    });
  });

  it("负控③：`--my-animation: foo;` ⇒ 不报（自定义属性名里含 animation 的一大把，跳过 `--*`）", () => {
    const css = [":root {", "  --my-animation: foo;", "  --ldk-animation-name: bar;", "}", ""].join("\n");
    withPlugin({ css }, (root) => {
      const r = runKeyframeRefCheck(root);
      expect(r.refs).toBe(0);
      expect(r.violations).toHaveLength(0);
    });
    // 口径钉子：直接钉 `animationRefs` 本身（报点为空可能是别的原因，这里要的是抽取器不认它们）
    expect(animationRefs(":root { --my-animation: foo; }")).toHaveLength(0);
  });

  it("负控⑤：`-webkit-animation: …` ⇒ 与标准属性**同判**（厂商前缀不放过）", () => {
    const css = [".demo-plugin-card {", "  -webkit-animation: demo-plugin-gone 1s;", "}"].join("\n");
    withPlugin({ css: `${css}\n` }, (root) => {
      const r = runKeyframeRefCheck(root);
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].line).toBe(lineOf(css, "-webkit-animation"));
      expect(r.dangling[0].decl).toBe("-webkit-animation"); // 报点回显原文，作者一眼看到是哪条
    });
  });

  it("负控⑥：拿不到 `pluginId`（无 plugin.json）⇒ fail-closed 红（不许静默放过）", () => {
    withPlugin({ manifest: null, css: ".demo-plugin-card { animation: demo-plugin-in 1s; }\n" }, (root) => {
      const r = runKeyframeRefCheck(root);
      expect(r.error).not.toBeNull();
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].file).toBe("plugin.json");
      expect(r.violations[0].line).toBe(1);
      expect(r.violations[0].message).toContain("不许静默放过");
      expect(r.allowed).toHaveLength(0); // fail-closed ⇒ 扫都不扫（不许拿「空允许集」去批量报红）
      expect(r.refs).toBe(0);
    });
  });

  // ────────────────────────── 补充负控（档里没写、但本轮实现时踩过的形态） ──────────────────────────

  it("补充①：逗号多值 ⇒ 只报找不到的那一个（合规的那个不许连带报）", () => {
    const css = [
      "@keyframes demo-plugin-in {",
      "  to { opacity: 1; }",
      "}",
      "",
      ".demo-plugin-card {",
      "  animation: demo-plugin-in 1s, demo-plugin-gone 2s;",
      "}",
      "",
    ].join("\n");
    withPlugin({ css }, (root) => {
      const r = runKeyframeRefCheck(root);
      expect(r.refs).toBe(2);
      expect(r.dangling.map((d) => d.name)).toEqual(["demo-plugin-gone"]);
    });
  });

  it("补充②：`animation-timing-function` / `animation-duration` 这类**不是引用**的属性 ⇒ 不认（正则只放行 `animation` / `animation-name`）", () => {
    const css = [
      ".demo-plugin-card {",
      "  animation-timing-function: demo-plugin-ease;",
      "  animation-duration: 1s;",
      "  animation-fill-mode: both;",
      "}",
      "",
    ].join("\n");
    withPlugin({ css }, (root) => {
      const r = runKeyframeRefCheck(root);
      expect(r.refs).toBe(0);
      expect(r.violations).toHaveLength(0);
    });
  });

  it("补充③：`var(--x)` 函数形态 ⇒ 不算名字（值里带 `(` ⇒ 不是标识符，避免把 token 名当关键帧名）", () => {
    const css = [".demo-plugin-card {", "  animation: var(--ldk-card-anim);", "}"].join("\n");
    withPlugin({ css: `${css}\n` }, (root) => {
      const r = runKeyframeRefCheck(root);
      expect(r.refs).toBe(0);
      expect(r.violations).toHaveLength(0);
    });
  });

  it("补充④：关键字**大小写不敏感**（`NONE` / `LINEAR`）⇒ 不报（表按小写比，防 CSS 里的大写写法造假红）", () => {
    const css = [".demo-plugin-card {", "  animation: NONE;", "}", "", ".demo-plugin-x {", "  animation: 1s LINEAR both;", "}", ""].join(
      "\n",
    );
    withPlugin({ css }, (root) => {
      const r = runKeyframeRefCheck(root);
      expect(r.refs).toBe(0);
      expect(r.violations).toHaveLength(0);
    });
  });

  it("补充⑤：允许集与报点是**同一遍扫描**的两个方向——注释里的 `animation: x;` 不算引用", () => {
    const css = [
      "/* 旧名字（1.21 前）：animation: demo-plugin-legacy 1s; */",
      "@keyframes demo-plugin-in {",
      "  to { opacity: 1; }",
      "}",
      "",
      ".demo-plugin-card {",
      "  animation: demo-plugin-in 1s;",
      "}",
      "",
    ].join("\n");
    withPlugin({ css }, (root) => {
      const r = runKeyframeRefCheck(root);
      expect(r.refs).toBe(1); // 注释已被 stripComments 剥掉（入参是 cleaned）
      expect(r.violations).toHaveLength(0);
    });
  });
});
