/**
 * check-css-namespace 腿（E6#109e）单测——**插件 CSS 不得裸定义宿主保留名**。
 *
 * 为什么值得一条测试：这条腿的错法同样是**静默**的——真案（主题卡片徽标 `.badge`）在界面上只表现成
 * 「一块纯色」，不报错；而不查/误报又会让插件仓 CI 白红。故正反两向都钉住：
 *   ① 正控：带前缀 + scoped 调优 ⇒ 零违规（不许误伤合法消费）
 *   ② 负控：裸定义保留名 / 关键帧撞名 ⇒ 必红
 *   ③ 豁免：标准 disable 注释 ⇒ 知情绕行生效
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runReservedClassCheck, loadReservedNames } from "./reserved-classes.js";

const RESERVED = {
  classes: [
    { name: "badge", owner: "badge", why: "壳基础件小圆角徽标" },
    { name: "input", why: "宿主输入框工具类" },
  ],
  keyframes: [{ name: "selectbox-in", why: "共享组件下拉入场" }],
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

  it("🔴 scoped 调优是合法消费（.control-bar .combobox）⇒ 零违规", () => {
    withFixture(".my-bar .badge { margin-left: 4px; }\n", (root) => {
      expect(runReservedClassCheck(root, RESERVED)).toHaveLength(0);
    });
  });

  it("复合状态类不占名（.my-card.active）⇒ 零违规", () => {
    withFixture(".my-card.active { border-color: var(--accent); }\n", (root) => {
      expect(runReservedClassCheck(root, RESERVED)).toHaveLength(0);
    });
  });

  it("保留名清单为空 ⇒ 不产生任何违规（文件缺失时不假装有判据）", () => {
    withFixture(".badge { color: red; }\n", (root) => {
      expect(runReservedClassCheck(root, { classes: [], keyframes: [] })).toHaveLength(0);
    });
  });
});

describe("runReservedClassCheck —— 负控（必红）", () => {
  it("裸定义宿主保留类名 .badge ⇒ 1 条违规、且报出文件名", () => {
    withFixture(".badge { background: var(--accent); }\n", (root) => {
      const v = runReservedClassCheck(root, RESERVED);
      expect(v).toHaveLength(1);
      expect(v[0].file).toBe("src/style.css");
      expect(v[0].message).toContain(".badge");
    });
  });

  it("裸定义 .input（宿主工具类）⇒ 红", () => {
    withFixture(".input { padding: 2px; }\n", (root) => {
      expect(runReservedClassCheck(root, RESERVED)).toHaveLength(1);
    });
  });

  it("@keyframes 撞宿主关键帧名 ⇒ 红", () => {
    withFixture("@keyframes selectbox-in { from { opacity: 0 } }\n", (root) => {
      const v = runReservedClassCheck(root, RESERVED);
      expect(v).toHaveLength(1);
      expect(v[0].message).toContain("selectbox-in");
    });
  });

  it("注释里的保留名不算违规（判据只看真实规则）", () => {
    withFixture("/* 注意：别写 .badge */\n.my-card { color: red; }\n", (root) => {
      expect(runReservedClassCheck(root, RESERVED)).toHaveLength(0);
    });
  });
});

describe("runReservedClassCheck —— 知情绕行", () => {
  it("标准 disable 注释 ⇒ 该行豁免", () => {
    withFixture(
      "/* eslint-disable-next-line linkdesk/no-reserved-class-name -- 内容画布：随宿主主题走 */\n" +
        ".badge { background: var(--accent); }\n",
      (root) => {
        expect(runReservedClassCheck(root, RESERVED)).toHaveLength(0);
      }
    );
  });
});

describe("loadReservedNames —— 随包清单可读", () => {
  it("包内 schemas/reserved-class-names.json 能被读到，且 classes 两组都并进来", () => {
    const names = loadReservedNames();
    expect(names.classes.length).toBeGreaterThan(0);
    // 不钉具体名字：E6#109g 的四批改名会陆续把 classes.shared 摘空，钉名字的断言会跟着批次变红
    expect(names.classes.some((c) => c.owner)).toBe(true); // 共享组件组（带 owner）
    expect(names.classes.some((c) => !c.owner)).toBe(true); // 宿主工具类组（无 owner）
    expect(names.keyframes.map((k) => k.name)).toContain("selectbox-in");
  });
});
