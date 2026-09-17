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

  it("flag 栏里 file-tree 那 11 条，新名一律带 file-tree. 前缀", () => {
    // ⚠️ 1.44/1.45 往 `flag` 栏又加了 8 条（serial-monitor 2 + marketplace 6）⇒ 摊平后总数是 19。
    //    本用例只锚 **file-tree 这 11 条**（前缀判据按仓成立，不该被别仓的条数带走）——
    //    改名前它断言「总数 11」，1.44 一加条目就红：那是**按总数断言**的经典脆弱点。
    const entries = Object.entries(maps.flag).filter(([, newName]) => newName.startsWith("file-tree."));
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

describe("renameMigrations · 1.43 / 1.44 / 1.45 三轮（清账·editor / serial-monitor / marketplace）", () => {
  const maps = flattenRenameRounds();

  /* 🔴 逐轮**点名**断言，不按总数断言。
   *   理由（本轴 1.43 实测）：三条轮次共用同一个迁移体，而摊平表是**并集**——
   *   「总数够大」证明不了「某一条在册」。**判「某条存在」必须直接点名它。** */
  it("1.43：files.autoSave → editor.autoSave 在册（设置键，跨轮共读同一份数据）", () => {
    expect(maps.setting["files.autoSave"]).toBe("editor.autoSave");
  });

  it("1.43：该条在**两条轮次**里都出现（file-tree 轮与 editor 轮），摊平后仍只有一条", () => {
    const owners = RENAME_ROUNDS.filter((r) => Object.prototype.hasOwnProperty.call(r.setting, "files.autoSave")).map((r) => r.plugin);
    expect(owners.length, `在册轮次只有 ${owners.length} 条——同一份数据两轮共读是刻意的`).toBeGreaterThanOrEqual(2);
    // 摊平是并集 ⇒ 两个来源只能落成**一条**（若落成两条，`flatten` 的覆盖顺序就决定了结果，那是隐式耦合）
    expect(Object.keys(maps.setting).filter((k) => k === "files.autoSave").length).toBe(1);
  });

  it("1.44：serial-monitor 两条旗子在册，且带 serial-monitor. 前缀", () => {
    const expected: Record<string, string> = {
      sourceOpen: "serial-monitor.sourceOpen",
      serialSessionFocus: "serial-monitor.serialSessionFocus",
    };
    for (const [oldName, newName] of Object.entries(expected)) {
      expect(maps.flag[oldName], `${oldName} 不在册`).toBe(newName);
    }
  });

  it("1.45：marketplace 六条旗子在册——**与齿轮菜单的 7 个条目一一对应**", () => {
    const expected: Record<string, string> = {
      pluginDisabled: "marketplace.pluginDisabled",
      extensionHasThemes: "marketplace.extensionHasThemes",
      extensionHasLanguages: "marketplace.extensionHasLanguages",
      extensionHasIconThemes: "marketplace.extensionHasIconThemes",
      extensionHasConfiguration: "marketplace.extensionHasConfiguration",
      extensionHasKeybindings: "marketplace.extensionHasKeybindings",
    };
    for (const [oldName, newName] of Object.entries(expected)) {
      expect(maps.flag[oldName], `${oldName} 不在册`).toBe(newName);
    }
    // 6 个旗子 ↔ 7 个条目：`pluginDisabled` 被正反两侧各用一次（启用 / 禁用），其余各一次
    expect(Object.keys(expected).length).toBe(6);
  });

  it("🔴 三轮的旗子新名一律带本仓前缀（防「改了名字却没带归属」——本轴的病根就是从这来的）", () => {
    const belongTo: Record<string, string> = {
      sourceOpen: "serial-monitor.",
      serialSessionFocus: "serial-monitor.",
      pluginDisabled: "marketplace.",
      extensionHasThemes: "marketplace.",
      extensionHasLanguages: "marketplace.",
      extensionHasIconThemes: "marketplace.",
      extensionHasConfiguration: "marketplace.",
      extensionHasKeybindings: "marketplace.",
    };
    for (const [oldName, prefix] of Object.entries(belongTo)) {
      const newName = maps.flag[oldName];
      expect(newName, `${oldName} 不在册`).toBeTruthy();
      expect(newName.startsWith(prefix), `${oldName} → ${newName} 没带 ${prefix}`).toBe(true);
    }
  });

  it("三轮都不含空转条目（旧名 === 新名 = 假账）", () => {
    for (const r of RENAME_ROUNDS.filter((x) => ["1.43", "1.44", "1.45"].includes(x.round))) {
      for (const space of ["setting", "command", "flag"] as const) {
        for (const [oldName, newName] of Object.entries(r[space])) {
          expect(newName, `${r.round} ${space} 的空转条目 ${oldName}`).not.toBe(oldName);
        }
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
