/**
 * check-css-namespace 腿·**token（自定义属性）作用域判据**（E6#109n-b · 1.24）单测。
 *
 * 覆盖 31 号档 §3.3 负控表的插件侧六条（④–⑨）＋ 两条元判据：
 *   · **同一份 CSS + 不同 pluginId ⇒ 不同裁决**（证明这条腿在读 manifest，不是恒红/恒绿）；
 *   · **黄灯不进腿报点**（V6 的「只报不拦」是结构性的，不靠措辞）。
 *
 * 为什么值得一条测试（沿用 `plugin-prefix.test.ts` 的理由）：这条腿**两条失效方向都是静默的**——
 *   · 太松（放过一处 `:root` 覆写）⇒ 宿主 / 他方的颜色、圆角、z-index 被全局改写，
 *     表现是「切了主题才好、换个主题又坏」（1.23 实测：83/94 个契约名没有 inline 屏蔽）；
 *   · 太紧（把「自有类之下的裸名」判红）⇒ 插件仓 CI 白红，作者学会「看到红就 disable」，门禁失效。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTokenScopeCheck } from "./token-scope.js";

/** 造一个临时插件工程（`manifest` 传 null ⇒ 不写 plugin.json，用来钉 fail-closed） */
function withPlugin(
  opts: { manifest?: Record<string, unknown> | null; css?: string; cssRel?: string; dirName?: string },
  fn: (root: string) => void,
): void {
  const base = mkdtempSync(join(tmpdir(), "css-token-scope-"));
  const root = opts.dirName ? join(base, opts.dirName) : base;
  mkdirSync(join(root, "src", "styles"), { recursive: true });
  if (opts.manifest !== null) {
    // JSONC（带注释与尾逗号）——作者面允许这么写，读 manifest 的代码必须容忍
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

describe("判据 V1：插件在文档级定义「无主」名字 ⇒ 红", () => {
  it("负控④：`:root { --bg-card: red }`（`marketplace` 案复刻）⇒ V1 红 ＋ 进腿报点", () => {
    withPlugin({ css: ":root { --bg-card: red; }\n" }, (root) => {
      const r = runTokenScopeCheck(root);
      expect(r.error).toBeNull();
      expect(r.red).toHaveLength(1);
      expect(r.red[0].code).toBe("V1");
      expect(r.red[0].scope).toBe("doc");
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].file).toBe("src/styles/App.css");
      expect(r.violations[0].line).toBe(1);
    });
  });

  it("负控⑤：`:root { --other-plugin-ok: red }`（带前缀但**不是我的**前缀）⇒ V1 红", () => {
    withPlugin({ css: ":root { --other-plugin-ok: red; }\n" }, (root) => {
      const r = runTokenScopeCheck(root);
      expect(r.red).toHaveLength(1);
      expect(r.red[0].code).toBe("V1");
    });
  });

  it("文档级各形态都算文档级（`html` / `body` / `*` / `[data-theme=…]`）", () => {
    withPlugin(
      { css: "html { --a: 1; }\nbody { --b: 1; }\n* { --c: 1; }\n[data-theme=\"dark\"] { --d: 1; }\n" },
      (root) => {
        expect(runTokenScopeCheck(root).red).toHaveLength(4);
      },
    );
  });

  it("正控：按 `@media` 包裹不改变裁决（同一个文档级定义照样红）", () => {
    withPlugin({ css: "@media (min-width: 100px) {\n  :root { --a: 1; }\n}\n" }, (root) => {
      expect(runTokenScopeCheck(root).red).toHaveLength(1);
    });
  });
});

describe("判据 V6：插件在文档级定义「有主」名字 ⇒ 🟡 黄（只报不拦）", () => {
  it("负控⑥：`:root { --demo-plugin-ok: red }` ⇒ **不红**（黄，且**不进腿报点**）", () => {
    withPlugin({ css: ":root { --demo-plugin-ok: red; }\n" }, (root) => {
      const r = runTokenScopeCheck(root);
      expect(r.red).toHaveLength(0);
      expect(r.violations).toHaveLength(0); // 🔴 「只报不拦」是结构性的：黄不进 legs.violations
      expect(r.yellow).toHaveLength(1);
      expect(r.yellow[0].code).toBe("V6");
      expect(r.advisories).toHaveLength(1);
    });
  });

  it("正控：把同一个名字搬进自有根类 ⇒ 黄也没有（完全合规）", () => {
    withPlugin({ css: ".demo-plugin-root { --demo-plugin-ok: red; }\n" }, (root) => {
      const r = runTokenScopeCheck(root);
      expect(r.red).toHaveLength(0);
      expect(r.yellow).toHaveLength(0);
    });
  });
});

describe("判据 V2：定义 `ldk-*` 自定义属性 ⇒ 红（任何作用域）", () => {
  it("顶层 `.ldk-badge { --ldk-x: 1 }` ⇒ V2 红（名字层先出口）", () => {
    withPlugin({ css: ".ldk-badge { --ldk-x: 1; }\n" }, (root) => {
      const r = runTokenScopeCheck(root);
      expect(r.red).toHaveLength(1);
      expect(r.red[0].code).toBe("V2");
    });
  });

  it("`:root { --ldk-x: 1 }` ⇒ V2 红（同一站点同时命中 V2/V1 ⇒ 只报最具体的一条）", () => {
    withPlugin({ css: ":root { --ldk-x: 1; }\n" }, (root) => {
      const r = runTokenScopeCheck(root);
      expect(r.red).toHaveLength(1);
      expect(r.red[0].code).toBe("V2");
    });
  });

  it("自有类之下写 `--ldk-x` **照样红**（V2 与作用域无关）", () => {
    withPlugin({ css: ".demo-plugin-root { --ldk-x: 1; }\n" }, (root) => {
      expect(runTokenScopeCheck(root).red.some((s) => s.code === "V2")).toBe(true);
    });
  });
});

describe("判据 V5：类限定定义不含自有类 ⇒ 红", () => {
  it("负控⑦：顶层 `.ldk-badge { --my-x: 1 }`（借宿主类当自己的地盘）⇒ V5 红", () => {
    withPlugin({ css: ".ldk-badge { --my-x: 1; }\n" }, (root) => {
      const r = runTokenScopeCheck(root);
      expect(r.red).toHaveLength(1);
      expect(r.red[0].code).toBe("V5");
    });
  });

  it("正控：`.demo-plugin-root .ldk-badge { --my-x: 1 }` ⇒ 绿（scoped 调优合法）", () => {
    withPlugin({ css: ".demo-plugin-root .ldk-badge { --my-x: 1; }\n" }, (root) => {
      const r = runTokenScopeCheck(root);
      expect(r.red).toHaveLength(0);
      expect(r.yellow).toHaveLength(0);
    });
  });

  it("正控⑨：自有根类下的**裸名** ⇒ 绿（名字无前缀不构成违规——只有「文档级 ＋ 无主」才红）", () => {
    withPlugin({ css: ".demo-plugin-root { --ok-color: 1; }\n" }, (root) => {
      expect(runTokenScopeCheck(root).red).toHaveLength(0);
    });
  });

  it("正控：自有类**在祖先位**也满足（`.demo-plugin-a .demo-plugin-b { --x: 1 }`）⇒ 绿", () => {
    withPlugin({ css: ".demo-plugin-a .demo-plugin-b { --x: 1; }\n" }, (root) => {
      expect(runTokenScopeCheck(root).red).toHaveLength(0);
    });
  });

  it("正控：`id` 与元素/属性形态不在本轴射程（`#demo-plugin-root` / `div` / `[data-x]`）", () => {
    withPlugin({ css: "#demo-plugin-root { --a: 1; }\ndiv { --b: 1; }\n[data-x] { --c: 1; }\n" }, (root) => {
      const r = runTokenScopeCheck(root);
      expect(r.red).toHaveLength(0);
      expect(r.yellow).toHaveLength(0);
    });
  });
});

describe("元判据：读 manifest（不是恒红/恒绿）＋ fail-closed ＋ 口径", () => {
  it("同一份 CSS + 不同 pluginId ⇒ 不同裁决（证明这条腿真在读本仓 manifest）", () => {
    const css = ":root { --alpha-ok: 1; }\n";
    withPlugin({ manifest: { pluginId: "alpha", name: "a", version: "1.0.0" }, css }, (root) => {
      expect(runTokenScopeCheck(root).yellow.map((s) => s.code)).toEqual(["V6"]);
    });
    withPlugin({ manifest: { pluginId: "beta", name: "b", version: "1.0.0" }, css }, (root) => {
      expect(runTokenScopeCheck(root).red.map((s) => s.code)).toEqual(["V1"]);
    });
  });

  it("fail-closed：没有 plugin.json ⇒ 红（拿不到前缀就判不了「有主 / 无主」）", () => {
    withPlugin({ manifest: null, css: ".demo-plugin-root { --a: 1; }\n" }, (root) => {
      const r = runTokenScopeCheck(root);
      expect(r.error).not.toBeNull();
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].file).toBe("plugin.json");
    });
  });

  it("知情绕行：disable 注释盖得住红与黄（同一个 `check-css-namespace` id）", () => {
    withPlugin(
      {
        css:
          "/* eslint-disable linkdesk/no-reserved-class-name -- 内容画布 */\n:root { --bg-card: red; }\n" +
          ":root { --demo-plugin-x: 1; }\n",
      },
      (root) => {
        const r = runTokenScopeCheck(root);
        expect(r.red).toHaveLength(0);
        expect(r.yellow).toHaveLength(0);
      },
    );
  });

  it("口径：`var(--x)` 用法不算定义（没有冒号）；多选择器规则逐 compound 判", () => {
    withPlugin(
      { css: ".demo-plugin-root { color: var(--text-primary); }\n:root, .demo-plugin-root { --a: 1; }\n" },
      (root) => {
        const r = runTokenScopeCheck(root);
        // 第一行没有定义；第二行 = 两个 compound，`:root` 那半红（V1）、自有类那半绿
        expect(r.red).toHaveLength(1);
        expect(r.red[0].selector).toBe(":root");
        expect(r.red[0].line).toBe(2);
      },
    );
  });

  it("口径：注释里的 `--x:` 不算定义（`stripComments` 等长替换）", () => {
    withPlugin({ css: "/* :root { --bg-card: red; } 这是注释里的示例 */\n.demo-plugin-root { --a: 1; }\n" }, (root) => {
      expect(runTokenScopeCheck(root).red).toHaveLength(0);
    });
  });
});
