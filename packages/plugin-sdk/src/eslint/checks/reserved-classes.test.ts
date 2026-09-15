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
  it("包内 schemas/reserved-class-names.json 能被读到（关键帧有位；classes 已进清账终态空集）", () => {
    const names = loadReservedNames();
    // 🔴 不钉「classes 非空」：E6#109g（四批共享组件改名，classes.shared 摘空）＋ E6#109j-b
    //    （最后一条宿主工具类 `.input` 也前缀化，classes.host 摘空）⇒ 两组**双双进清账终态 = []**。
    //    这是**设计要的终态**、不是缺数据：裸名一律前缀化后规规矩矩「带前缀 = 自带命名空间、
    //    不需登记」⇒ 本表不再需要 entries。合并语义（两组都并进来）由下方夹具测试覆盖。
    //    ⚠️ 反向断言仍是有意为之：谁再登记一个**裸名** ⇒ 这条当场红，逼一次知情决策。
    expect(names.classes).toEqual([]);
    expect(names.keyframes.map((k) => k.name)).toContain("selectbox-in");
  });

  it("classes 两组都并进来（shared 带 owner / host 不带）——夹具，不依赖真实表非空", () => {
    // 🔴 为什么用夹具：classes.shared 在 E6#109g 收尾后**恒为空数组** ⇒ 真实包里那一组「并进来」
    //    这件事已不可观测。若只断言「有带 owner 的条目」，一旦 shared 摘空就是必红的假判据；
    //    删掉又会让 loadReservedNames 的合并语义彻底失去覆盖。夹具把语义钉住，与真实表是否为空解耦。
    const root = mkdtempSync(join(tmpdir(), "ldk-reserved-"));
    const file = join(root, "reserved-class-names.json");
    writeFileSync(
      file,
      JSON.stringify({
        classes: {
          shared: [{ name: "demo-shared", owner: "demo-component", why: "夹具——共享组件组" }],
          host: [{ name: "demo-host", why: "夹具——宿主工具类组" }],
        },
        keyframes: [{ name: "demo-keyframe", why: "夹具" }],
      }),
      "utf8"
    );
    try {
      const names = loadReservedNames(file);
      expect(names.classes.map((c) => c.name)).toEqual(["demo-shared", "demo-host"]); // 两组、shared 在前
      expect(names.classes.find((c) => c.name === "demo-shared")?.owner).toBe("demo-component");
      expect(names.classes.find((c) => c.name === "demo-host")?.owner).toBeUndefined();
      expect(names.keyframes.map((k) => k.name)).toEqual(["demo-keyframe"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
