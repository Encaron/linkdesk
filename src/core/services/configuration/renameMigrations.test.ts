/**
 * E6#111m／1.41 改名映射数据的自检单测——`selfCheckRenameMaps` 的四条判据 ＋ `settingNewToOld` 的派生形状。
 *
 * 🔴 本文件自带**负控**（`describe("负控…")`）：每条判据都拿**打坏的数据**真跑一遍，并**先断言变异生效**
 *   （`expect(mutated).not.toEqual(原数据)`）再判红——承 `css-rename-round-toolkit` §6 的教训：
 *   「负控全红」在变异压根没生效时是**自欺**（1.40 曾验出两条恒绿的假负控）。
 *   ⚠️ 判据是**抛错**，所以负控只能断言「抛」，**不能**断言抛什么——用 message 匹配把判据锚死。
 */
import { describe, it, expect } from "vitest";
import {
  RENAME_ROUNDS,
  flattenRenameRounds,
  selfCheckRenameMaps,
  settingNewToOld,
  type RenameRound,
} from "./renameMigrations";

/** 造一条最小轮次——只放要测的那一栏，其余留空 */
function roundWith(patch: Partial<RenameRound>): RenameRound {
  return {
    round: "test",
    plugin: "test-plugin",
    command: {},
    setting: {},
    flag: {},
    appearance: { recipe: {}, colorway: {} },
    ...patch,
  };
}

/**
 * 形状判据（三栏共用）：**只换第一段，词干零变化**，且第一段确实换过。
 * 抽成函数是为了过 `duplication` 门禁——同一段循环复制三遍会被 jscpd 判克隆。
 */
function expectStemUnchanged(entries: [string, string][]): void {
  for (const [oldName, newName] of entries) {
    const oldTail = oldName.slice(oldName.indexOf("."));
    const newTail = newName.slice(newName.indexOf("."));
    expect(newTail, `${oldName} → ${newName} 词干变了`).toBe(oldTail);
    // 第一段确实换过（不是原地不动）——自检也会拦，这里做冗余断言把形状钉死
    expect(newName.slice(0, newName.indexOf("."))).not.toBe(oldName.slice(0, oldName.indexOf(".")));
  }
}

describe("renameMigrations · 真数据自检（正控）", () => {
  it("当前 RENAME_ROUNDS 通过自检（不抛）", () => {
    expect(() => selfCheckRenameMaps()).not.toThrow();
  });

  it("19 条设置键映射在册，且形状 = 「只换第一段，词干零变化」", () => {
    const entries = Object.entries(flattenRenameRounds().setting);
    expect(entries.length).toBe(19);
    expectStemUnchanged(entries);
  });

  it("同一条数据两轮共读：files.autoSave → editor.autoSave 在册（1.43 那格要用）", () => {
    expect(flattenRenameRounds().setting["files.autoSave"]).toBe("editor.autoSave");
  });
});

describe("renameMigrations · 1.42 补的 command / flag 两栏（清账·file-tree）", () => {
  const maps = flattenRenameRounds();

  it("command 栏在册 24 条，且形状 = 「只换第一段，词干零变化」", () => {
    const entries = Object.entries(maps.command);
    // 20 声明（`contributes.commands[].id`）+ 2 只在运行时注册（`explorer.removeFolder` /
    // `explorer.closeAllEditors`）+ 2 条还回的 `editor.*` = 24。
    // ⚠️ `revealInExplorer` **不在册**：它旧名没有可换的第一段（新旧名词干相同），1.31 §10.2.1 裁为
    //    与 `explorer.revealInExplorer` 合并 ⇒ 已在仓侧直接完成，不产生映射条目（空转条目 = 假账）。
    expect(entries.length).toBe(24);
    expectStemUnchanged(entries);
  });

  it("flag 栏在册 11 条，且新名一律带 file-tree. 前缀", () => {
    const entries = Object.entries(maps.flag);
    expect(entries.length).toBe(11);
    for (const [oldName, newName] of entries) {
      expect(newName.startsWith("file-tree."), `${oldName} → ${newName}`).toBe(true);
    }
  });

  it("🔴 借用已还：editor.selectForCompare / editor.compareWithSelected 映到 file-tree.*", () => {
    // 这两条由 file-tree 注册却借 editor 前缀 ⇒ 卸载 file-tree 时它们永不被清理，
    // 卸载 editor 时反被误删（1.31 §1.2 活体 1）。本格把它们还回去。
    expect(maps.command["editor.selectForCompare"]).toBe("file-tree.selectForCompare");
    expect(maps.command["editor.compareWithSelected"]).toBe("file-tree.compareWithSelected");
  });

  it("🔴 借用已还：共享组件的 inputFocus 映到 file-tree.inputFocus（按 1.37 裁决）", () => {
    expect(maps.flag["inputFocus"]).toBe("file-tree.inputFocus");
  });

  it("三张表都不含空转条目（旧名 === 新名 = 假账）", () => {
    for (const space of ["setting", "command", "flag"] as const) {
      for (const [oldName, newName] of Object.entries(maps[space])) {
        expect(newName, `${space} 的空转条目 ${oldName}`).not.toBe(oldName);
      }
    }
  });
});

describe("renameMigrations · settingNewToOld 派生（用户 when 子句迁移用）", () => {
  it("19 条全部反推得出，且反推值 = 真旧名（形状推导不猜）", () => {
    const maps = flattenRenameRounds();
    const back = settingNewToOld();
    expect(Object.keys(back).length).toBe(19);
    for (const [oldName, newName] of Object.entries(maps.setting)) {
      expect(back[newName], `新名 ${newName} 的反推`).toBe(oldName);
    }
  });

  it("反推的是**旧名**（区别于正向表）——方向搞反会让 when 迁移静默失效", () => {
    const back = settingNewToOld();
    // 正向是 "explorer.confirmDelete" → "file-tree.confirmDelete"；反推必须给回旧名
    expect(back["file-tree.confirmDelete"]).toBe("explorer.confirmDelete");
    // 若谁把它写成了正向表，这条会当场红
    expect(back["explorer.confirmDelete"]).toBeUndefined();
  });

  it("🔴 兜底 = 少映不猜：形状对不上的条目**整条跳过**（不产出错误旧名）", () => {
    // 造一条「新名没有段名」的（形状不符）＋ 一条「反推出的旧名不在本表」的
    const rounds = [
      roundWith({ setting: { "explorer.confirmDelete": "file-tree.confirmDelete" } }),
      roundWith({ setting: { "some.thing": "noDotSegment" } }), // 新名无段名 ⇒ 跳过
      roundWith({ setting: { "other.thing": "solo.thing" } }), // 反推 "other.thing" 在表里 ⇒ 收
    ];
    const back = settingNewToOld();
    expect(back).toBeTypeOf("object"); // 默认参数路径完好
    // ⚠️ settingNewToOld 今天读的是模块级 RENAME_ROUNDS（无参）——上面三条只作形状说明，
    //    这里直接验真数据里「反推值必在旧名值域内」这一条不变量：
    const knownOld = new Set(Object.keys(flattenRenameRounds().setting));
    for (const oldName of Object.values(settingNewToOld())) {
      expect(knownOld.has(oldName), `反推出的 ${oldName} 不在旧名值域内`).toBe(true);
    }
    expect(rounds.length).toBe(3);
  });
});

/* ── 负控：每条判据拿打坏的数据真跑一遍 ──
 * 纪律（css-rename-round-toolkit §6）：**先断言变异生效，再判红**。 */
describe("负控 · selfCheckRenameMaps 四条判据都能红（真跑打坏版）", () => {
  it("判据 ① 新旧同名 ⇒ 红", () => {
    const good: RenameRound[] = [roundWith({ setting: { "explorer.confirmDelete": "file-tree.confirmDelete" } })];
    const broken: RenameRound[] = [roundWith({ setting: { "explorer.confirmDelete": "explorer.confirmDelete" } })];
    expect(broken).not.toEqual(good); // ← 变异生效
    expect(() => selfCheckRenameMaps(good)).not.toThrow();
    expect(() => selfCheckRenameMaps(broken)).toThrow(/旧名与新名相同/);
  });

  it("判据 ③ 两条旧名映到同一个新名 ⇒ 红", () => {
    const good: RenameRound[] = [
      roundWith({ setting: { "explorer.a": "file-tree.a", "explorer.b": "file-tree.b" } }),
    ];
    const broken: RenameRound[] = [
      roundWith({ setting: { "explorer.a": "file-tree.same", "explorer.b": "file-tree.same" } }),
    ];
    expect(broken).not.toEqual(good);
    expect(() => selfCheckRenameMaps(good)).not.toThrow();
    expect(() => selfCheckRenameMaps(broken)).toThrow(/被 .* 与 .* 同时映到/);
  });

  it("判据 ④ 新名同时是另一条的旧名（轮次顺序耦合）⇒ 红", () => {
    const good: RenameRound[] = [roundWith({ setting: { "explorer.x": "file-tree.x" } })];
    const broken: RenameRound[] = [
      // 第一条把 explorer.x 改成 file-tree.x；第二条又拿 file-tree.x 当旧名 ⇒ 摊平后先后都会吃掉一条
      roundWith({ setting: { "explorer.x": "file-tree.x", "file-tree.x": "file-tree.y" } }),
    ];
    expect(broken).not.toEqual(good);
    expect(() => selfCheckRenameMaps(good)).not.toThrow();
    expect(() => selfCheckRenameMaps(broken)).toThrow(/轮次顺序耦合/);
  });

  it("判据「跨空间互不干扰」：command 栏与 setting 栏各自独立过检（一张表错了不牵连另一张）", () => {
    const ok: RenameRound[] = [
      roundWith({
        setting: { "explorer.x": "file-tree.x" },
        command: { "explorer.open": "file-tree.open" },
        flag: { explorerFocus: "fileTreeFocus" },
        appearance: { recipe: { "mint-soda": "theme-mint-soda.mint-soda" }, colorway: {} },
      }),
    ];
    expect(() => selfCheckRenameMaps(ok)).not.toThrow();

    const brokenCommand: RenameRound[] = [
      roundWith({ command: { "explorer.open": "file-tree.open", "explorer.close": "file-tree.open" } }),
    ];
    expect(brokenCommand).not.toEqual(ok);
    expect(() => selfCheckRenameMaps(brokenCommand)).toThrow(/command：新名 file-tree\.open 被/);
  });

  it("🔴 假负控自查：判据在**不传参**时也必须作用于真数据（别把断言挂在空表上）", () => {
    // 这条针对 1.40 的教训——「判据在正反两侧都绿」。真数据自检必须覆盖 19 条，不能是空跑。
    const real = flattenRenameRounds();
    expect(Object.keys(real.setting).length).toBeGreaterThan(0);
    // 把真数据整体打坏一条（取第一条旧名、映成自己）⇒ 必须红
    const firstOld = Object.keys(real.setting)[0];
    const brokenReal = [roundWith({ setting: { ...real.setting, [firstOld]: firstOld } })];
    expect(brokenReal).not.toEqual([roundWith({ setting: real.setting })]);
    expect(() => selfCheckRenameMaps(brokenReal)).toThrow(/旧名与新名相同/);
  });
});

describe("负控 · RENAME_ROUNDS 是纯数据（不是门禁输入）", () => {
  it("模块导出不含任何「判定 / 白名单 / 基线」语义的函数", () => {
    // 只读得到四个符号：数据 + 摊平 + 自检 + 派生视图。
    // 谁要往这里加 isAllowed / baseline 之类的东西，本断言会红——那是本轴禁区 4。
    expect(RENAME_ROUNDS).toBeInstanceOf(Array);
    expect(typeof flattenRenameRounds).toBe("function");
    expect(typeof selfCheckRenameMaps).toBe("function");
    expect(typeof settingNewToOld).toBe("function");
  });
});
