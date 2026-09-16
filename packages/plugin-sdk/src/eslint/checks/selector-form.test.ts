/**
 * check-css-namespace 腿·**选择器形态判据**（E6#109o-b · 1.26）单测。
 *
 * 覆盖 32 号档 §三.3 的插件侧那一表：负控①–⑦ ＋ 正控①–⑤（**正控条数 ≥ 负控条数**的纪律下面
 * 又补了三条，见文件末的「补充正控」）。
 *
 * 为什么值得一条测试（沿用 `token-scope.test.ts` 的理由）：这条腿**两条失效方向都是静默的**——
 *   · 太松（放过一条 `button { }`）⇒ 它改掉宿主与其他插件**所有**按钮，表现是「某个页面某个控件
 *     看着不对」，而**任何日志都不会响**（这就是本系列一句话根因：不是问题在长大，是尺子一直在漏）；
 *   · 太紧（把 `.my-root :focus-visible { }` 判成无锚）⇒ **假红**，而假红会让真红失效
 *     （22 号档 §10.3）：作者学会「看到红就 disable」，门禁失效。
 *     🔴 这条正是 1.25 实测的 **F3**：`hasAncestor()` / `subjectOf()` 会把 `.x :pseudo` 误判成
 *     `.x` 的一次**顶层定义** ⇒ 本轴自带 `formOf()`，下面「正控②」就是它的反面钉子。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSelectorFormCheck, judgeSelectorForm } from "./selector-form.js";
import { formOf } from "./css-selectors.js";

/** 造一个临时插件工程（`manifest` 传 null ⇒ 不写 plugin.json，用来钉 fail-closed） */
function withPlugin(
  opts: { manifest?: Record<string, unknown> | null; css?: string; cssRel?: string; dirName?: string },
  fn: (root: string) => void,
): void {
  const base = mkdtempSync(join(tmpdir(), "css-selector-form-"));
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

describe("判据 S2：插件禁无锚选择器（元素/通配/属性/伪类/伪元素/id 一视同仁）", () => {
  it("负控①：`* { margin: 0 }` ⇒ S2 红", () => {
    withPlugin({ css: "* { margin: 0; }\n" }, (root) => {
      const r = runSelectorFormCheck(root);
      expect(r.error).toBeNull();
      expect(r.violations).toHaveLength(1);
      expect(r.anchorless[0].code).toBe("S2");
      expect(r.violations[0].file).toBe("src/styles/App.css");
      expect(r.violations[0].line).toBe(1);
    });
  });

  it("负控②：`@media print { button { border: none } }` ⇒ S2 红（**@media 内同样是顶层**）", () => {
    withPlugin({ css: "@media print {\n  button { border: none; }\n}\n" }, (root) => {
      const r = runSelectorFormCheck(root);
      expect(r.anchorless).toHaveLength(1);
      expect(r.anchorless[0].selector).toBe("button");
      expect(r.violations[0].line).toBe(2);
    });
  });

  it("负控③：`#some-id { display: none }` ⇒ S2 红（**id 与元素同罪**）", () => {
    withPlugin({ css: "#some-id { display: none; }\n" }, (root) => {
      const r = runSelectorFormCheck(root);
      expect(r.anchorless).toHaveLength(1);
      expect(r.anchorless[0].code).toBe("S2");
      expect(r.anchorless[0].form.kind).toBe("anchored"); // id 是**名字锚** ⇒ 形态上是 anchored
    });
  });

  it("负控③b：限定形态 `html #some-id { }` 同样红（id 在复合里也算）", () => {
    withPlugin({ css: "html #some-id { display: none; }\n" }, (root) => {
      expect(runSelectorFormCheck(root).anchorless).toHaveLength(1);
    });
  });

  it("负控④：`:root { --x: 1 }` ⇒ S2 红（无锚；也命中 token 腿，允许双报）", () => {
    withPlugin({ css: ":root { --x: 1; }\n" }, (root) => {
      const r = runSelectorFormCheck(root);
      expect(r.anchorless).toHaveLength(1);
      expect(r.anchorless[0].selector).toBe(":root");
    });
  });

  it("负控④b：纯伪元素形态 `::-webkit-scrollbar { }` 也是站点（1.25 的 F1 钉子）", () => {
    withPlugin({ css: "::-webkit-scrollbar { width: 4px; }\n" }, (root) => {
      const r = runSelectorFormCheck(root);
      expect(r.anchorless).toHaveLength(1);
      expect(r.anchorless[0].form.purePseudo).toBe(true);
    });
  });

  it("负控⑦：拿不到 `pluginId`（无 plugin.json）⇒ fail-closed 红（与 `plugin-prefix.ts` 同款）", () => {
    withPlugin({ manifest: null, css: "* { margin: 0; }\n" }, (root) => {
      const r = runSelectorFormCheck(root);
      expect(r.error).not.toBeNull();
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].file).toBe("plugin.json");
    });
  });
});

describe("判据 S3：跨方命中必须自带自有命名空间", () => {
  it("负控⑤：`body .ldk-input { }` ⇒ S3 红（跨方命中 ＋ 无自有锚）", () => {
    withPlugin({ css: "body .ldk-input { height: 20px; }\n" }, (root) => {
      const r = runSelectorFormCheck(root);
      expect(r.anchorless).toHaveLength(0);
      expect(r.crossParty).toHaveLength(1);
      expect(r.crossParty[0].code).toBe("S3");
    });
  });

  it("负控⑥：`.ldk-side-panel :focus-visible { outline: none }` ⇒ S3 红（🔴 F3 的钉子）", () => {
    // 用 hasAncestor()/subjectOf() 判形态的实现会把这一条**漏掉**（它们剥掉伪类后只剩 `.ldk-side-panel`
    // ⇒ 看起来「有主体、无祖先」⇒ 被当成一次顶层定义）——`formOf()` 认它有两个 compound ⇒ 形态是
    // anchored ⇒ 交给 S3（跨方命中不带自有锚）来判。**这条就是本轴自带形态口径的理由。**
    withPlugin({ css: ".ldk-side-panel :focus-visible { outline: none; }\n" }, (root) => {
      const r = runSelectorFormCheck(root);
      expect(r.anchorless).toHaveLength(0);
      expect(r.crossParty).toHaveLength(1);
      expect(r.crossParty[0].code).toBe("S3");
    });
  });

  it("负控⑥b：`:has(.ldk-x)` 内的**提及**算提及；而**主体无锚**时归 S2（`(...)` 内不算锚）", () => {
    // ① `body:has(.ldk-badge)`：`.ldk-badge` 在**过滤器**里 ⇒ 主体是 `body` ⇒ **顶层无锚** ⇒ S2
    //    （这正是 R0 的口径：「`(...)` 内的内容不算锚——那是过滤器不是主体」。）
    withPlugin({ css: "body:has(.ldk-badge) { padding: 0; }\n" }, (root) => {
      const r = runSelectorFormCheck(root);
      expect(r.anchorless).toHaveLength(1);
      expect(r.anchorless[0].code).toBe("S2");
      expect(r.crossParty).toHaveLength(0);
    });
    // ② `main .other-root:has(.ldk-badge)`：有名字锚（`.other-root`）但**不是本仓前缀** ⇒ S3
    withPlugin({ css: "main .other-root:has(.ldk-badge) { padding: 0; }\n" }, (root) => {
      const r = runSelectorFormCheck(root);
      expect(r.anchorless).toHaveLength(0);
      expect(r.crossParty).toHaveLength(1);
      expect(r.crossParty[0].selector).toBe("main .other-root:has(.ldk-badge)");
    });
  });
});

describe("正控：合规形态必须绿（正控条数 ≥ 负控条数）", () => {
  it("正控①：`.serial-monitor-root input { }` ⇒ 绿（**限定有锚**——R2 的正确解法）", () => {
    withPlugin({ manifest: { pluginId: "serial-monitor", name: "夹具", version: "1.0.0" }, css: ".serial-monitor-root input { height: 20px; }\n" }, (root) => {
      expect(runSelectorFormCheck(root).violations).toHaveLength(0);
    });
  });

  it("正控②：`.my-root :focus-visible { }` ⇒ 绿（🔴 **F3 反面钉子**：形态谓词必须认它有祖先）", () => {
    withPlugin({ css: ".my-root :focus-visible { outline: 1px solid red; }\n" }, (root) => {
      const r = runSelectorFormCheck(root);
      expect(formOf(".my-root :focus-visible").kind).toBe("anchored");
      expect(r.violations).toHaveLength(0);
    });
  });

  it("正控③：`.settings-slider-control .ldk-slider { }` ⇒ 绿（R3 合规形态：跨方命中 ＋ 自有前缀）", () => {
    withPlugin({ manifest: { pluginId: "settings", name: "夹具", version: "1.0.0" }, css: ".settings-slider-control .ldk-slider { width: 100%; }\n" }, (root) => {
      expect(runSelectorFormCheck(root).violations).toHaveLength(0);
    });
  });

  it("正控④：`.marketplace-mpd-title-row .ldk-badge .codicon { }` ⇒ 绿（主体是三方类，仍带自有锚）", () => {
    withPlugin(
      { manifest: { pluginId: "marketplace", name: "夹具", version: "1.0.0" }, css: ".marketplace-mpd-title-row .ldk-badge .codicon { font-size: 12px; }\n" },
      (root) => {
        expect(runSelectorFormCheck(root).violations).toHaveLength(0);
      },
    );
  });

  it("正控⑤：`.settings-row:has(.ldk-theme-picker) { }` ⇒ 绿（`:has()` 内的提及算提及、自有锚在主体上）", () => {
    withPlugin(
      { manifest: { pluginId: "settings", name: "夹具", version: "1.0.0" }, css: ".settings-row:has(.ldk-theme-picker) { flex-direction: column; }\n" },
      (root) => {
        expect(runSelectorFormCheck(root).violations).toHaveLength(0);
      },
    );
  });

  it("正控⑥：`@keyframes` 体内的 `from` / `to` **不是选择器** ⇒ 绿", () => {
    withPlugin({ css: ".demo-plugin-root { animation: demo-plugin-in 1s; }\n@keyframes demo-plugin-in {\n  from { opacity: 0; }\n  to { opacity: 1; }\n}\n" }, (root) => {
      expect(runSelectorFormCheck(root).violations).toHaveLength(0);
    });
  });

  it("正控⑦：多选择器列表里**只报坏的那一份**（`button, .demo-plugin-root { }` ⇒ 1 处）", () => {
    withPlugin({ css: "button,\n.demo-plugin-root { margin: 0; }\n" }, (root) => {
      const r = runSelectorFormCheck(root);
      expect(r.violations).toHaveLength(1);
      expect(r.anchorless[0].selector).toBe("button");
    });
  });

  it("正控⑧：同一份 CSS ＋ 不同 `pluginId` ⇒ 不同裁决（证明这条腿在读 manifest，不是恒红/恒绿）", () => {
    const css = ".other-ns-root .ldk-badge { color: red; }\n";
    withPlugin({ manifest: { pluginId: "demo-plugin", name: "夹具", version: "1.0.0" }, css }, (root) => {
      expect(runSelectorFormCheck(root).crossParty).toHaveLength(1); // `.other-ns-root` 不是我的前缀 ⇒ 红
    });
    withPlugin({ manifest: { pluginId: "other", name: "夹具", version: "1.0.0" }, css }, (root) => {
      expect(runSelectorFormCheck(root).violations).toHaveLength(0); // `.other-` 就是本仓前缀 ⇒ 绿
    });
  });

  it("正控⑨：`animation` 声明不是选择器（`animation: button 1s` 不该被当成元素选择器）", () => {
    withPlugin({ css: ".demo-plugin-root { animation: demo-plugin-in 1s; }\n@keyframes demo-plugin-in { to { opacity: 1; } }\n" }, (root) => {
      expect(runSelectorFormCheck(root).violations).toHaveLength(0);
    });
  });
});

describe("判定体 `judgeSelectorForm()` 与形态谓词 `formOf()`", () => {
  it("判定体逐条符合预期（六形态 × 两判据）", () => {
    const id = "demo-plugin";
    // 绿：有锚、无 ldk 提及
    expect(judgeSelectorForm({ selector: ".demo-plugin-root .a", pluginId: id })).toBeNull();
    // S2：顶层无锚
    expect(judgeSelectorForm({ selector: "select", pluginId: id })?.code).toBe("S2");
    expect(judgeSelectorForm({ selector: ":focus-visible", pluginId: id })?.code).toBe("S2");
    expect(judgeSelectorForm({ selector: "::-webkit-scrollbar", pluginId: id })?.code).toBe("S2");
    // S2：限定无锚（B 段）
    expect(judgeSelectorForm({ selector: "html body", pluginId: id })?.code).toBe("S2");
    // S3：有锚但跨方命中不带自有锚
    expect(judgeSelectorForm({ selector: ".a .ldk-badge", pluginId: id })?.code).toBe("S3");
  });

  it("`formOf()`：纯伪类/纯伪元素主体 ⇒ 无锚（不是无主体）；`.a :focus-visible` 不是顶层无锚（F3 反面）", () => {
    expect(formOf("::-webkit-scrollbar")).toEqual({ kind: "anchorless", top: true, purePseudo: true });
    expect(formOf(":root")).toEqual({ kind: "anchorless", top: true, purePseudo: false });
    expect(formOf("html body")).toEqual({ kind: "anchorless", top: false, purePseudo: false });
    expect(formOf(".a :focus-visible").kind).toBe("anchored");
    expect(formOf("#a").kind).toBe("anchored");
    expect(formOf("div:has(.a)").kind).toBe("anchorless"); // `(...)` 内不算锚（过滤器不是主体）
  });
});
