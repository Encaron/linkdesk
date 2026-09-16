/**
 * check-css-namespace 腿·**本仓前缀判据**（E6#109h-b①）单测——插件 CSS 里给自有元素起的类名、以及
 * 自己的 `@keyframes` 名，必须以本仓 `pluginId` 加一个连字符开头。
 *
 * 为什么值得一条测试：这条腿的**两条失效方向都是静默的**——
 *   · 太松（放过一个裸名）⇒ 插件 ↔ 插件轴继续无保护，表现是「不报错、只是长得不对」（`.badge` 案同形）；
 *   · 太紧（误伤合法消费）⇒ 插件仓 CI 白红，作者学会「看到红就 disable」，门禁从此失效。
 * 故四条判据（①类名 ②关键帧 ③`ldk-` 边界 ④fail-closed）**正反两向都钉住**，另加两条元判据：
 *   · **同一份 CSS + 不同 pluginId ⇒ 不同裁决**（证明这条腿真的在读 manifest，不是恒红/恒绿）；
 *   · **豁免注释只盖 ①②，盖不住 ③④**（身份/清单问题不受样式表注释管辖）。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { runPluginPrefixCheck, resolvePluginIdForCss } from "./plugin-prefix.js";
import type { ReservedNames } from "./reserved-classes.js";

/** 保留名夹具（不依赖真实清单内容——真实清单会被后续轮次改动）；⚠️ 只剩 `keyframes`（`classes` 已随判据① 退役） */
const RESERVED: ReservedNames = {
  keyframes: [{ name: "drop-zone-in", why: "宿主拖放区入场动画" }],
};

/**
 * 造一个临时插件工程。
 * `manifest` 传对象 ⇒ 写成 JSONC（含注释与尾逗号，钉住「manifest 是 JSONC」这条）；传 null ⇒ 不写 plugin.json。
 */
function withPlugin(
  opts: { manifest?: Record<string, unknown> | null; css?: string; cssRel?: string; dirName?: string },
  fn: (root: string) => void,
): void {
  const base = mkdtempSync(join(tmpdir(), "css-prefix-"));
  const root = opts.dirName ? join(base, opts.dirName) : base;
  mkdirSync(join(root, "src", "styles"), { recursive: true });
  if (opts.manifest !== null) {
    // 🔴 写成**带注释与尾逗号**的 JSONC——作者面允许这么写，读 manifest 的代码必须容忍
    const raw = opts.manifest ?? { pluginId: "file-tree", name: "文件树", version: "1.0.0" };
    writeFileSync(
      join(root, "plugin.json"),
      `{\n  // 作者允许的注释\n  ${JSON.stringify(raw).slice(1, -1)},\n}\n`,
      "utf8",
    );
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

describe("判据① 裸定义类名必须带本仓前缀", () => {
  it("正控：带本仓前缀 / scoped 调优 / 复合状态类 ⇒ 零违规", () => {
    withPlugin(
      {
        css:
          ".file-tree-card { color: red; }\n" + // 带前缀
          ".control-bar .file-tree-thing { margin: 0; }\n" + // scoped 调优（无祖先才叫裸定义）
          ".file-tree-card.active { border: 0; }\n", // 复合状态类不占名
      },
      (root) => {
        const r = runPluginPrefixCheck(root, RESERVED);
        expect(r.violations).toHaveLength(0);
        expect(r.pluginId).toBe("file-tree");
        expect(r.pluginIdSource).toBe("plugin.json");
      },
    );
  });

  it("负控：新裸名 ⇒ 红，且报点含 文件 + 行 + 名字 + 应改成什么", () => {
    withPlugin({ css: ".file-tree-ok { color: red; }\n.notmine-panel { color: blue; }\n" }, (root) => {
      const r = runPluginPrefixCheck(root, RESERVED);
      expect(r.violations).toHaveLength(1);
      const v = r.violations[0];
      expect(v.file).toBe("src/styles/App.css");
      expect(v.line).toBe(2);
      expect(v.message).toContain(".notmine-panel");
      expect(v.message).toContain('应以 "file-tree-" 开头');
      expect(r.classes).toEqual([
        expect.objectContaining({ name: "notmine-panel", suggested: "file-tree-notmine-panel", reserved: false }),
      ]);
    });
  });

  it("负控：反向改名成 <pluginId>- 前缀 ⇒ 该点消失（不是「恒红」）", () => {
    withPlugin({ css: ".file-tree-notmine-panel { color: blue; }\n" }, (root) => {
      expect(runPluginPrefixCheck(root, RESERVED).violations).toHaveLength(0);
    });
  });

  it("🔴 分界：带连字符但不属于本仓也必红（`.toolbar-bar`）——规则不是「只要含连字符」", () => {
    withPlugin({ css: ".toolbar-bar { color: red; }\n" }, (root) => {
      const r = runPluginPrefixCheck(root, RESERVED);
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].message).toContain(".toolbar-bar");
    });
  });

  it("🔴 退役记录（E6#109p-b · 1.28）：`.badge` 只由本腿那条**结构性**判据报，不再补「宿主保留名」措辞", () => {
    withPlugin({ css: ".badge { background: var(--accent); }\n" }, (root) => {
      const r = runPluginPrefixCheck(root, RESERVED);
      expect(r.violations).toHaveLength(1); // 照旧只报一次（判据① 报点本就由本腿覆盖）
      // 判据①（裸定义宿主保留类名）已退役 ⇒ 类名侧的保留名补充措辞随之删除：
      // 「.badge 是保留名」这件事今天只由**本腿的前缀规则**兜（裸名必须以 <pluginId>- 开头）。
      expect(r.violations[0].message).not.toContain("宿主保留名");
      expect(r.classes[0].reserved).toBe(false);
    });
  });

  it("多文件：各自出点、行号按本文件算", () => {
    withPlugin({ css: ".notmine-a { color: red; }\n" }, (root) => {
      writeFileSync(join(root, "src", "styles", "Other.css"), "\n\n.notmine-b { color: blue; }\n", "utf8");
      const r = runPluginPrefixCheck(root, RESERVED);
      expect(r.violations.map((v) => `${v.file}:${v.line}`)).toEqual(["src/styles/App.css:1", "src/styles/Other.css:3"]);
    });
  });
});

describe("判据② 关键帧名必须带本仓前缀", () => {
  it("正控：带前缀的关键帧 ⇒ 零违规", () => {
    withPlugin({ css: "@keyframes file-tree-fadeIn { from { opacity: 0 } }\n" }, (root) => {
      expect(runPluginPrefixCheck(root, RESERVED).violations).toHaveLength(0);
    });
  });

  it("负控：无前缀关键帧 ⇒ 红，且提醒同笔改 animation: 引用", () => {
    withPlugin({ css: "@keyframes fadeIn { from { opacity: 0 } }\n" }, (root) => {
      const r = runPluginPrefixCheck(root, RESERVED);
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].message).toContain("@keyframes fadeIn");
      expect(r.violations[0].message).toContain("animation: 引用处");
      expect(r.keyframes[0]).toEqual(
        expect.objectContaining({ name: "fadeIn", suggested: "file-tree-fadeIn", line: 1 }),
      );
    });
  });

  it("负控：撞宿主登记关键帧名 ⇒ 红 + 措辞里点出「与宿主关键帧同名」", () => {
    withPlugin({ css: "@keyframes drop-zone-in { from { opacity: 0 } }\n" }, (root) => {
      const r = runPluginPrefixCheck(root, RESERVED);
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].message).toContain("宿主关键帧");
      expect(r.keyframes[0].reserved).toBe(true);
    });
  });
});

describe("判据③ pluginId 不得以 ldk- 开头", () => {
  it("负控：pluginId: \"ldk-tools\" ⇒ 红（借宿主命名空间）", () => {
    withPlugin({ manifest: { pluginId: "ldk-tools" }, css: ".ldk-tools-panel { color: red; }\n" }, (root) => {
      const r = runPluginPrefixCheck(root, RESERVED);
      expect(r.boundary).toBe("ldk-tools");
      expect(r.violations).toHaveLength(1); // 类名本身合规 ⇒ 只有边界这一条
      expect(r.violations[0].message).toContain("ldk-");
      expect(r.classes).toHaveLength(0);
    });
  });

  it("正控：`ldk` 前缀但不是 `ldk-`（如 `ldkfoo`）⇒ 不误伤", () => {
    withPlugin({ manifest: { pluginId: "ldkfoo" }, css: ".ldkfoo-panel { color: red; }\n" }, (root) => {
      expect(runPluginPrefixCheck(root, RESERVED).violations).toHaveLength(0);
    });
  });

  it("🔴 目录名兜底同样受管辖：无 pluginId + 目录名 `ldk-*` ⇒ 仍红（不是「声明了才管」）", () => {
    // 实测发现：本单测的临时目录前缀原本叫 `ldk-prefix-*`，于是**判据④的兜底路径**直接把 ③ 撞出来了
    // ——这条判据连「没声明 pluginId、按目录名兜底」的那条路也管得住，故留成常驻用例。
    withPlugin({ manifest: { name: "x" }, dirName: "ldk-tools" }, (root) => {
      const r = runPluginPrefixCheck(root, RESERVED);
      expect(r.pluginId).toBe("ldk-tools");
      expect(r.pluginIdSource).toBe("dir-name");
      expect(r.boundary).toBe("ldk-tools");
      expect(r.violations).toHaveLength(1);
    });
  });
});

describe("判据④ fail-closed（拿不到前缀 ⇒ 红，不许静默放过）", () => {
  it("负控：plugin.json 不存在 ⇒ 红（单点、指名 plugin.json）", () => {
    withPlugin({ manifest: null, css: ".anything { color: red; }\n" }, (root) => {
      const r = runPluginPrefixCheck(root, RESERVED);
      expect(r.error).toContain("plugin.json 不在工程根");
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].file).toBe("plugin.json");
      expect(r.classes).toHaveLength(0); // 判不了 ⇒ 不假装判过
    });
  });

  it("负控：plugin.json 语法错 ⇒ 红（报点带上 jsonc 的解析错误）", () => {
    withPlugin({ manifest: null }, (root) => {
      writeFileSync(join(root, "plugin.json"), "{ this is not json ", "utf8");
      const r = runPluginPrefixCheck(root, RESERVED);
      expect(r.error).toContain("plugin.json 读不出");
      expect(r.violations).toHaveLength(1);
    });
  });

  it("负控：无 pluginId 且目录名也不能兜底 ⇒ 红", () => {
    withPlugin({ manifest: { name: "x" }, css: ".x { color: red; }\n", dirName: "bad dir name" }, (root) => {
      const r = runPluginPrefixCheck(root, RESERVED);
      expect(r.error).toContain("也不能兜底");
      expect(r.violations).toHaveLength(1);
    });
  });

  it("正控：无 pluginId 但目录名可用 ⇒ 绿 + 打印「用了目录名」那一行（不静默）", () => {
    withPlugin({ manifest: { name: "x", version: "1.0.0" } }, (root) => {
      const cur = resolvePluginIdForCss(root);
      expect(cur.error).toBeNull();
      expect(cur.source).toBe("dir-name");
      expect(cur.pluginId).toBe(basename(root));
      expect(cur.note).toContain("兜底");
      // 前缀按目录名 ⇒ 用目录名带前缀的类名应当绿
      writeFileSync(join(root, "src", "styles", "App.css"), `.${cur.pluginId}-panel { color: red; }\n`, "utf8");
      const r = runPluginPrefixCheck(root, RESERVED);
      expect(r.violations).toHaveLength(0);
      expect(r.pluginIdNote).toContain("兜底");
    });
  });
});

describe("元判据（判据自身的正/负控）", () => {
  it("🔴 同一份 CSS + 两个不同 pluginId ⇒ 裁决不同（证明真在读 manifest，不是恒红/恒绿）", () => {
    const css = ".shared-name { color: red; }\n";
    withPlugin({ manifest: { pluginId: "alpha" }, css }, (rootA) => {
      withPlugin({ manifest: { pluginId: "beta" }, css }, (rootB) => {
        const a = runPluginPrefixCheck(rootA, RESERVED);
        const b = runPluginPrefixCheck(rootB, RESERVED);
        expect(a.violations).toHaveLength(1); // `.shared-name` 不带 `alpha-`
        expect(a.classes[0].suggested).toBe("alpha-shared-name");
        expect(b.violations).toHaveLength(1); // 也不带 `beta-`
        expect(b.classes[0].suggested).toBe("beta-shared-name");
        // 反向：各自带自己的前缀 ⇒ 都绿（同一份 CSS 换个 pluginId 就换了裁决）
        withPlugin({ manifest: { pluginId: "alpha" }, css: ".alpha-shared-name { color: red; }\n" }, (r2) => {
          withPlugin({ manifest: { pluginId: "beta" }, css: ".alpha-shared-name { color: red; }\n" }, (r3) => {
            expect(runPluginPrefixCheck(r2, RESERVED).violations).toHaveLength(0);
            expect(runPluginPrefixCheck(r3, RESERVED).violations).toHaveLength(1); // 对 beta 而言这是外来的名字
          });
        });
      });
    });
  });

  it("豁免注释只盖 ①②（样式选择），盖不住 ③④（身份/清单）", () => {
    // ① 被文件级 disable 盖住
    withPlugin(
      { css: "/* eslint-disable linkdesk/no-reserved-class-name -- 知情绕行 */\n.notmine-panel { color: red; }\n" },
      (root) => {
        const r = runPluginPrefixCheck(root, RESERVED);
        expect(r.violations).toHaveLength(0);
        expect(r.classes).toHaveLength(0); // 清单里也不出现（与腿同口径）
      },
    );
    // ④ 盖不住：plugin.json 缺失 = 工程根问题，样式表里写什么注释都没用
    withPlugin({ manifest: null }, (root) => {
      writeFileSync(
        join(root, "src", "styles", "App.css"),
        "/* eslint-disable linkdesk/no-reserved-class-name -- 想绕过去 */\n.x { color: red; }\n",
        "utf8",
      );
      const r = runPluginPrefixCheck(root, RESERVED);
      expect(r.violations).toHaveLength(1);
      expect(r.violations[0].file).toBe("plugin.json");
    });
  });
});
