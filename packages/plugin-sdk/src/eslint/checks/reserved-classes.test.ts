/**
 * check-css-namespace 腿 单测——**@keyframes 名不得撞宿主保留关键帧名**。
 *
 * 为什么值得一条测试：这条腿的错法同样是**静默**的——关键帧撞名在界面上只表现成「动画不对」，
 * 不报错；而不查/误报又会让插件仓 CI 白红。故正反两向都钉住。
 *
 * ── 🔴 判据①「裸定义宿主保留类名」已退役（E6#109p-b · 轮次 1.28 · 2026-09-16）──
 *   退役记录写在这里（连同一条**退役钉子**测试：留 `classes` 字段也不再生效）：
 *   1.27 全量门禁体检实测（`docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/27-任务-门禁健康度体检.md` §十二.2(a)）：
 *     · 清单的 `classes` 段**已随 E6#109l-b（1.21b）整块删除** ⇒ `classMap` 恒空 ⇒ 判据想报也报不出来；
 *     · 同一轴上 `plugin-prefix.ts` 的「裸定义必须带 `<pluginId>-`」**完全覆盖**它；
 *     · `classes` 段是**终态删除**（类名规则已结构性化，登记表只剩 `keyframes`）⇒ 输入不会回来。
 *   ⇒ 代码路径 ＋ `ReservedNames.classes` 字段一并删除。**判据② 保留**：拿不到 pluginId 时前缀腿
 *     fail-closed，此时本腿是唯一能逐点报出「你占了宿主关键帧名」的腿（1.27 实验 (d) 实证）。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runReservedClassCheck, loadReservedNames } from "./reserved-classes.js";

const RESERVED = {
  keyframes: [{ name: "ldk-selectbox-in", why: "共享组件下拉入场" }],
};

function withFixture(css: string, fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "ldk-reserved-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "style.css"), css, "utf8");
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("runReservedClassCheck —— 正控（不许误伤）", () => {
  it("带插件前缀的类名 ⇒ 零违规", () => {
    withFixture(".my-plugin-card { color: red; }\n.my-plugin-title { color: blue; }\n", (root) => {
      expect(runReservedClassCheck(root, RESERVED)).toHaveLength(0);
    });
  });

  it("scoped 调优（.my-bar .badge）⇒ 零违规", () => {
    withFixture(".my-bar .badge { margin-left: 4px; }\n", (root) => {
      expect(runReservedClassCheck(root, RESERVED)).toHaveLength(0);
    });
  });

  it("复合状态类不占名（.my-card.active）⇒ 零违规", () => {
    withFixture(".my-card.active { border-color: var(--accent); }\n", (root) => {
      expect(runReservedClassCheck(root, RESERVED)).toHaveLength(0);
    });
  });

  it("带前缀的关键帧（本仓自己的）⇒ 零违规", () => {
    withFixture("@keyframes probe-demo-fadeIn { from { opacity: 0 } }\n", (root) => {
      expect(runReservedClassCheck(root, RESERVED)).toHaveLength(0);
    });
  });

  it("保留名清单为空 ⇒ 不产生任何违规（文件缺失时不假装有判据）", () => {
    withFixture("@keyframes ldk-selectbox-in { from { opacity: 0 } }\n", (root) => {
      expect(runReservedClassCheck(root, { keyframes: [] })).toHaveLength(0);
    });
  });
});

describe("runReservedClassCheck —— 负控（必红）", () => {
  it("@keyframes 撞宿主关键帧名 ⇒ 红，且报出文件名与名字", () => {
    withFixture("@keyframes ldk-selectbox-in { from { opacity: 0 } }\n", (root) => {
      const v = runReservedClassCheck(root, RESERVED);
      expect(v).toHaveLength(1);
      expect(v[0].file).toBe("src/style.css");
      expect(v[0].message).toContain("ldk-selectbox-in");
      expect(v[0].message).toContain("与宿主关键帧同名");
    });
  });

  it("注释里的关键帧名不算违规（判据只看真实规则）", () => {
    withFixture("/* 注意：别用 @keyframes ldk-selectbox-in */\n.my-card { color: red; }\n", (root) => {
      expect(runReservedClassCheck(root, RESERVED)).toHaveLength(0);
    });
  });
});

describe("🔴 判据① 退役钉子（E6#109p-b · 1.28）", () => {
  it("裸定义 `.badge` **不再**由本腿报（退役后它只由前缀腿那条结构性判据管）", () => {
    withFixture(".badge { color: red; }\n.input { padding: 2px; }\n", (root) => {
      // 退役前这两行各报 1 条（夹具清单里给过 badge/input）；退役后本腿一条都不报。
      expect(runReservedClassCheck(root, RESERVED)).toHaveLength(0);
    });
  });

  it("清单里就算还留着历史的 `classes` 键 ⇒ 也一律忽略（输入不会回来）", () => {
    const root = mkdtempSync(join(tmpdir(), "ldk-reserved-"));
    const file = join(root, "reserved-class-names.json");
    writeFileSync(
      file,
      JSON.stringify({
        classes: { shared: [{ name: "demo-shared", why: "夹具——历史遗留" }], host: [{ name: "demo-host", why: "夹具" }] },
        keyframes: [{ name: "demo-keyframe", why: "夹具" }],
      }),
      "utf8"
    );
    try {
      const names = loadReservedNames(file);
      expect("classes" in names).toBe(false); // 字段已删（不再读、不再暴露）
      expect(names.keyframes.map((k) => k.name)).toEqual(["demo-keyframe"]);
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(join(root, "src", "style.css"), ".demo-shared { color: red; }\n", "utf8");
      expect(runReservedClassCheck(root, names)).toHaveLength(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("runReservedClassCheck —— 知情绕行", () => {
  it("标准 disable 注释 ⇒ 该行豁免", () => {
    withFixture(
      "/* eslint-disable-next-line linkdesk/no-reserved-class-name -- 内容画布：随宿主动画走 */\n" +
        "@keyframes ldk-selectbox-in { from { opacity: 0 } }\n",
      (root) => {
        expect(runReservedClassCheck(root, RESERVED)).toHaveLength(0);
      }
    );
  });
});

describe("loadReservedNames —— 随包清单可读", () => {
  it("包内 schemas/reserved-class-names.json 能被读到（只剩 keyframes；classes 段是终态删除）", () => {
    const names = loadReservedNames();
    // 🔴 E6#109p-b（1.28）：`classes` 整块早在 E6#109l-b 就从清单删了 ⇒ 本轮连**读它的代码**一起退役。
    //    反向断言仍有意为之：谁把 `classes` 加回清单（或加回字段）⇒ 这条当场红，逼一次知情决策。
    expect(names.keyframes.map((k) => k.name)).toContain("ldk-selectbox-in");
    expect("classes" in names).toBe(false);
  });
});
