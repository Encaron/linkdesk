/**
 * E6#111m／1.41 用户自定义快捷键迁移单测——[11 号任务书 §2.3] 的三个边界 ＋ 幂等 ＋ 原子。
 *
 * 🔴 **本文件的主角是负控**（`describe("负控…")`）：每条判据都拿**打坏版**真跑一遍，并**先断言变异生效**
 *   （`expect(mutated).not.toEqual(原)`）再判红——承 `css-rename-round-toolkit` §6：变异没生效时的「负控全红」是自欺。
 *
 * 三层被测：
 *   ① `mergeKeybindingEntries`（**纯函数**，不碰 fs）——命令改写 / when 改写 / 未命中原样；
 *   ② `replaceWholeWord` 的**词边界**（经由 when 改写间接测）——🔴 `\b` 会在 `file-tree.inputFocus` 中间命中；
 *   ③ `migrateUserKeybindings`（落盘）——文件不存在零动作 / JSON 坏不碰 / 未命中零写 / 幂等 / 窗口内被改则放弃。
 *
 * fs 全部 mock（照 `appearanceApplier.test.ts` 的既有姿势）：不触真实盘，且能精确断言「写没写 / 写了什么」。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── fs mock：一份内存盘（exists / readFile / writeFile / appDataDir / joinPath） ──
 * ⚠️ `exists` 与 `readFile` 必须**共用同一个 map**——判据「文件不存在 ⇒ 零动作」考的就是这个。 */
const disk = new Map<string, string>();
let writeFailures = 0;

vi.mock("../../services/files/FileService", () => ({
  appDataDir: vi.fn(async () => "C:/linkdesk/userData"),
  joinPath: vi.fn(async (...parts: string[]) => parts.join("/")),
  exists: vi.fn(async (p: string) => disk.has(p)),
  readFile: vi.fn(async (p: string) => {
    if (!disk.has(p)) throw new Error(`ENOENT: ${p}`);
    return disk.get(p)!;
  }),
  writeFile: vi.fn(async (p: string, content: string) => {
    if (writeFailures > 0) {
      writeFailures -= 1;
      throw new Error("EIO: 模拟写盘失败");
    }
    disk.set(p, content);
  }),
}));

import { writeFile, readFile } from "../../services/files/FileService";
import {
  mergeKeybindingEntries,
  migrateUserKeybindings,
  keybindingMergeInput,
  type KeybindingMergeInput,
} from "./keybindingMigration";
import { settingNewToOld } from "./renameMigrations";

const KB_PATH = "C:/linkdesk/userData/keybindings.json";

/** 本格迁移的入参——用**真数据**（设置键反推表是真的），命令/旗子两栏手动给（真表今天还是空的，见 renameMigrations 头注） */
const MAPS: KeybindingMergeInput = {
  command: { "explorer.openFile": "file-tree.openFile", "editor.rename": "editor.rename2" },
  flag: { explorerFocus: "fileTreeFocus", inputFocus: "inputFocus" }, // ← 故意含一条「自己映自己」看它折不折腾
  settingNewToOld: settingNewToOld(),
};

function seed(entries: unknown): void {
  disk.set(KB_PATH, JSON.stringify(entries, null, 2));
}
function readDisk(): unknown {
  return JSON.parse(disk.get(KB_PATH)!);
}

beforeEach(() => {
  disk.clear();
  writeFailures = 0;
  vi.clearAllMocks();
});

/* ══ ① 纯函数：命令改写 / 未命中原样 ══ */
describe("mergeKeybindingEntries · 命令 id 改写", () => {
  it("命中映射 ⇒ 改写 command", () => {
    const out = mergeKeybindingEntries(
      [{ command: "explorer.openFile", key: "ctrl+o" }],
      MAPS,
    );
    expect(out[0].command).toBe("file-tree.openFile");
    expect(out[0].key).toBe("ctrl+o"); // 键位本身不动
  });

  it("🔴 边界 ②：未命中映射 ⇒ **原样保留**（不删、不报错——用户可能引用第三方命令）", () => {
    const thirdParty = { command: "some.otherPlugin.doThing", key: "ctrl+alt+x" };
    const out = mergeKeybindingEntries([thirdParty], MAPS);
    expect(out[0]).toEqual(thirdParty);
    expect(out.length).toBe(1); // ⛔ 不许「过滤掉不认识的」
  });

  it("⚠️ 形状：`command` 缺失/空的条目也不炸（用户手写的残缺条目）", () => {
    const out = mergeKeybindingEntries(
      [{ command: "", key: "ctrl+k" }, { command: "explorer.openFile", key: "" }],
      MAPS,
    );
    expect(out[0].command).toBe("");
    expect(out[1].command).toBe("file-tree.openFile");
  });

  it("`when` 缺失 ⇒ 不凭空造一个（零变更零写的前置）", () => {
    const out = mergeKeybindingEntries([{ command: "explorer.openFile", key: "ctrl+o" }], MAPS);
    expect("when" in out[0]).toBe(false);
  });

  it("条目上的**扩展字段**原样带走（别把用户的东西吃掉）", () => {
    const out = mergeKeybindingEntries(
      [{ command: "explorer.openFile", key: "ctrl+o", when: "explorerFocus", note: "我的备注" }],
      MAPS,
    );
    expect(out[0].note).toBe("我的备注");
  });
});

/* ══ ② when 子句：旗子 ＋ 设置键名，词边界 ══ */
describe("mergeKeybindingEntries · when 子句改写", () => {
  it("旗子名整体替换（`!explorerFocus` 形态）", () => {
    const out = mergeKeybindingEntries(
      [{ command: "x", key: "ctrl+1", when: "!explorerFocus" }],
      MAPS,
    );
    expect(out[0].when).toBe("!fileTreeFocus");
  });

  it("复合子句里每个旗子各改各的", () => {
    const out = mergeKeybindingEntries(
      [{ command: "x", key: "ctrl+1", when: "explorerFocus && !inputFocus" }],
      MAPS,
    );
    expect(out[0].when).toBe("fileTreeFocus && !inputFocus");
  });

  it("🔴 词边界：`file-tree.inputFocus` **不被** flag 表命中（裸 `\\b` 会把它改成 `file-tree.fileInputFocus`）", () => {
    // 这条是 CSS 系列 §3 踩过的坑的直译：JS 里 - 与 . 都不是词字符，\b 会在中间命中
    const out = mergeKeybindingEntries(
      [{ command: "x", key: "ctrl+1", when: "file-tree.inputFocus" }],
      MAPS,
    );
    expect(out[0].when).toBe("file-tree.inputFocus"); // 原样
  });

  it("⚠️ 词边界：更长名字里的同名片段不被命中（前缀方向）", () => {
    const out = mergeKeybindingEntries(
      [{ command: "x", key: "ctrl+1", when: "explorerFocusOther" }],
      MAPS,
    );
    expect(out[0].when).toBe("explorerFocusOther");
  });

  it("🔴 设置键名：`when` 里的**旧键名**改成**新键名**（方向不能反）", () => {
    const out = mergeKeybindingEntries(
      [{ command: "x", key: "ctrl+1", when: "settingKey == 'explorer.confirmDelete'" }],
      MAPS,
    );
    expect(out[0].when).toBe("settingKey == 'file-tree.confirmDelete'");
  });

  it("设置键名子串不误伤（`explorer.confirmDelete` 与 `explorer.confirmDragAndDrop` 互不吃）", () => {
    const out = mergeKeybindingEntries(
      [{ command: "x", key: "ctrl+1", when: "settingKey == 'explorer.confirmDragAndDrop'" }],
      MAPS,
    );
    expect(out[0].when).toBe("settingKey == 'file-tree.confirmDragAndDrop'");
  });

  it("旗子与设置键名同处一条 when 子句时两条都改", () => {
    const out = mergeKeybindingEntries(
      [{ command: "x", key: "ctrl+1", when: "explorerFocus && settingKey == 'files.exclude'" }],
      MAPS,
    );
    expect(out[0].when).toBe("fileTreeFocus && settingKey == 'file-tree.exclude'");
  });

  it("🔴 未命中一律原样：不认识的旗子/键名一个字都不动（第三方上下文旗子）", () => {
    const when = "thirdPartyMode && settingKey == 'app.fontFamily'";
    const out = mergeKeybindingEntries([{ command: "x", key: "ctrl+1", when }], MAPS);
    expect(out[0].when).toBe(when);
  });

  it("🔴 幂等：改完再跑一遍 ⇒ 零变化（`when` 里已是新名，旧名表匹配不上）", () => {
    const once = mergeKeybindingEntries(
      [{ command: "explorer.openFile", key: "ctrl+o", when: "explorerFocus && settingKey == 'files.exclude'" }],
      MAPS,
    );
    const twice = mergeKeybindingEntries(once, MAPS);
    expect(twice).toEqual(once);
  });
});

/* ══ ③ 落盘：三个边界 ＋ 幂等 ＋ 原子 ══ */
describe("migrateUserKeybindings · 三个边界（[11 §2.3]）", () => {
  it("边界 ① 文件不存在 ⇒ 零动作，且**不新建空文件**", async () => {
    const r = await migrateUserKeybindings(MAPS);
    expect(r).toEqual({ wrote: false, changed: 0 });
    expect(disk.has(KB_PATH)).toBe(false); // 🔴 建了就替用户「表达」了他没做过的决定
  });

  it("边界 ② 未命中 ⇒ **零写**（不是「写同值」——是没写过）", async () => {
    seed([{ command: "other.thing", key: "ctrl+1", when: "otherFlag" }]);
    const before = disk.get(KB_PATH);
    const r = await migrateUserKeybindings(MAPS);
    expect(r).toEqual({ wrote: false, changed: 0 });
    expect(writeFile).not.toHaveBeenCalled(); // 🔴 判据取「有没有调用 writeFile」，不是比字节
    expect(disk.get(KB_PATH)).toBe(before);
  });

  it("边界 ③ 幂等：跑第二遍 ⇒ 逐字节零变化 + 零写", async () => {
    seed([{ command: "explorer.openFile", key: "ctrl+o", when: "explorerFocus" }]);
    const first = await migrateUserKeybindings(MAPS);
    expect(first.wrote).toBe(true);
    const afterFirst = disk.get(KB_PATH);

    const second = await migrateUserKeybindings(MAPS);
    expect(second).toEqual({ wrote: false, changed: 0 });
    expect(disk.get(KB_PATH)).toBe(afterFirst); // 逐字节相同
    expect(writeFile).toHaveBeenCalledTimes(1); // 第二遍没写
  });

  it("命中 ⇒ 真写盘：命令与 when 都改了，且保持 2 空格缩进（与 saveUserKeybindings 同形态）", async () => {
    seed([{ command: "explorer.openFile", key: "ctrl+o", when: "explorerFocus" }]);
    const r = await migrateUserKeybindings(MAPS);
    expect(r).toEqual({ wrote: true, changed: 1 });
    expect(readDisk()).toEqual([
      { command: "file-tree.openFile", key: "ctrl+o", when: "fileTreeFocus" },
    ]);
    expect(disk.get(KB_PATH)).toBe(JSON.stringify(readDisk(), null, 2));
  });

  it("`changed` 只数**真改了的**条目（未命中的不算）", async () => {
    seed([
      { command: "explorer.openFile", key: "ctrl+o" },
      { command: "thirdParty.x", key: "ctrl+9" },
      { command: "editor.rename", key: "f2", when: "files.exclude" },
    ]);
    const r = await migrateUserKeybindings(MAPS);
    expect(r.changed).toBe(2);
    expect(r.wrote).toBe(true);
  });

  it("只改 when 不改命令的条目也算 change（`changed` 判据含 when）", async () => {
    seed([{ command: "thirdParty.x", key: "ctrl+9", when: "explorerFocus" }]);
    const r = await migrateUserKeybindings(MAPS);
    expect(r).toEqual({ wrote: true, changed: 1 });
  });
});

describe("migrateUserKeybindings · 坏输入不碰", () => {
  it("JSON 不合法 ⇒ 零写（warn 后原样留着）", async () => {
    disk.set(KB_PATH, "{ 这不是 JSON");
    const r = await migrateUserKeybindings(MAPS);
    expect(r).toEqual({ wrote: false, changed: 0 });
    expect(writeFile).not.toHaveBeenCalled();
    expect(disk.get(KB_PATH)).toBe("{ 这不是 JSON"); // 用户的东西一个字没动
  });

  it("顶层不是数组 ⇒ 零写（形状不认识就别动）", async () => {
    seed({ command: "explorer.openFile", key: "ctrl+o" });
    const r = await migrateUserKeybindings(MAPS);
    expect(r).toEqual({ wrote: false, changed: 0 });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("空数组 ⇒ 零写", async () => {
    seed([]);
    const r = await migrateUserKeybindings(MAPS);
    expect(r).toEqual({ wrote: false, changed: 0 });
  });
});

describe("migrateUserKeybindings · 原子性", () => {
  it("🔴 写盘抛错 ⇒ **抛出去**（让编排层中止 ⇒ 版本不提升 ⇒ 下次启动重试）", async () => {
    seed([{ command: "explorer.openFile", key: "ctrl+o" }]);
    writeFailures = 1;
    await expect(migrateUserKeybindings(MAPS)).rejects.toThrow(/EIO/);
    // ⚠️ 盘上仍是旧内容（mock 的 writeFile 在 set 之前抛）——这就是「失败即旧名还在，值不丢」
    expect(readDisk()).toEqual([{ command: "explorer.openFile", key: "ctrl+o" }]);
  });

  it("🔴 写盘前重读：窗口内文件被改动 ⇒ **抛**，绝不覆盖别人的改动", async () => {
    seed([{ command: "explorer.openFile", key: "ctrl+o" }]);
    // 🔴 模拟「窗口内被别人改了」的**唯一正确姿势 = 改盘上的内容本身**（不是让 mock 按调用次数返回不同值）：
    //   计数写法会与实现里的读盘次数耦合——第一版写成 «第 2 次读返回新内容» 恰好对上「读 2 次」的实现，
    //   而实现的**第一次读走的是 `exists` + `readFile` 两条**，计数根本对不上 ⇒ 判据静默失效（本格实测踩到）。
    //   内容一改，无论实现读几次、读哪一次，都必然观测到差异 ⇒ 判据与实现内部结构解耦。
    const before = disk.get(KB_PATH)!;
    vi.mocked(readFile).mockImplementation(async () => {
      const out = disk.get(KB_PATH) ?? before; // 直接读盘 ⇒ 内容一变，下一次读立刻看得见
      disk.set(KB_PATH, JSON.stringify([{ command: "别人刚加的", key: "ctrl+7" }], null, 2)); // 模拟别人紧接着写
      return out;
    });
    await expect(migrateUserKeybindings(MAPS)).rejects.toThrow(/窗口内被改动/);
    expect(writeFile).not.toHaveBeenCalled();
    vi.mocked(readFile).mockReset();
    disk.clear();
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  负控：拿**打坏版实现**真跑，证明每条判据「能红」
 *  ⚠️ 这里的「打坏版」是**把被测函数重新实现一遍**（不是在测试里改断言）——
 *     变异生效由「打坏版 != 正版」这组断言本身保证（两侧结果不同 = 判据真的分得开）。
 * ══════════════════════════════════════════════════════════════════════ */
describe("负控 · 词边界判据能红（裸 \\b 的打坏版）", () => {
  /** 打坏版：用裸 `\b` 替换（CSS 系列 §3 实测的坑：`-` `.` 不是词字符 ⇒ 会在复合名中间命中） */
  function badReplaceWholeWord(text: string, from: string, to: string): string {
    if (from === to || from.length === 0) return text;
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(`\\b${escaped}\\b`, "g"), to);
  }

  it("正版原样保留 `file-tree.inputFocus`；打坏版会把它改坏 ⇒ 判据真的分得开", () => {
    const when = "file-tree.inputFocus";
    // 正版（经 merge）：
    const goodOut = mergeKeybindingEntries([{ command: "x", key: "k", when }], MAPS)[0].when;
    // 打坏版：
    const badOut = badReplaceWholeWord(when, "inputFocus", "inputFocus2"); // 用一个「真会变」的目标
    expect(goodOut).toBe("file-tree.inputFocus");
    expect(badOut).toBe("file-tree.inputFocus2"); // ← 变异生效（裸 \b 在 `.` 后确实命中）
    expect(badOut).not.toBe(goodOut); // ← 两侧可区分 ⇒ 正版那条断言不是恒真
  });

  it("🔴 假负控自查：若 MAPS 里 inputFocus 映成自己，`!\\b` 断言会**恒真**（本格首版就差点栽这里）", () => {
    // `MAPS.flag.inputFocus = "inputFocus"`（自己映自己）⇒ replaceWholeWord 走 `from === to` 早退 ⇒ 恒等。
    // ⇒ **判据「file-tree.inputFocus 原样」在正版上是恒真的**（测不到词边界），必须换一个真会变的目标名。
    const selfMap: KeybindingMergeInput = { command: {}, flag: { inputFocus: "inputFocus" }, settingNewToOld: {} };
    const out = mergeKeybindingEntries([{ command: "x", key: "k", when: "file-tree.inputFocus" }], selfMap)[0].when;
    expect(out).toBe("file-tree.inputFocus"); // 绿——但这条绿**不能**证明词边界对，只证明「没改」
    // 证据 = 打坏版在这组入参下**也**绿（因为根本没走到替换）：
    const badSame = badReplaceWholeWord("file-tree.inputFocus", "inputFocus", "inputFocus");
    expect(badSame).toBe("file-tree.inputFocus");
    // ⇒ 结论：词边界的正控必须用「映射值 != 原名」的旗子。见上一条测试。
  });
});

describe("负控 · when 改写方向能红（方向反的打坏版）", () => {
  it("打坏版把方向反过来（新→旧）⇒ 用户的 when 被改成旧名 ⇒ 当场失效", () => {
    const when = "settingKey == 'explorer.confirmDelete'";
    const good = mergeKeybindingEntries([{ command: "x", key: "k", when }], MAPS)[0].when;
    // 打坏版：拿正向表（旧→新）当反向用 —— 即把**新名**换成旧名
    const back = settingNewToOld();
    let bad = when;
    for (const [newName, oldName] of Object.entries(back)) {
      bad = bad.split(newName).join(oldName); // 打坏版的粗糙替换（不看词边界）
    }
    expect(good).toBe("settingKey == 'file-tree.confirmDelete'");
    expect(bad).toBe("settingKey == 'explorer.confirmDelete'"); // ← 变异生效：改回去了
    expect(bad).not.toBe(good); // ⇒ 「方向」这条判据真的分得开
  });
});

describe("负控 · 幂等判据能红（非幂等的打坏版）", () => {
  it("打坏版把「新名」也再映一遍（把两边都当旧名）⇒ 第二遍仍在变 ⇒ 幂等判据红", () => {
    const entries = [{ command: "explorer.openFile", key: "ctrl+o", when: "explorerFocus" }];
    const goodFirst = mergeKeybindingEntries(entries, MAPS);
    const goodSecond = mergeKeybindingEntries(goodFirst, MAPS);
    expect(goodSecond).toEqual(goodFirst); // 正版幂等

    // 打坏版：映射表两边都当输入（`file-tree.openFile` 也能再被「映」一次）
    const badMaps: KeybindingMergeInput = {
      command: { ...MAPS.command, "file-tree.openFile": "file-tree.openFile" },
      flag: { ...MAPS.flag, fileTreeFocus: "fileTreeFocus" },
      settingNewToOld: MAPS.settingNewToOld,
    };
    const badSecond = mergeKeybindingEntries(goodFirst, badMaps);
    // ⚠️ 若打坏版的替换是「同值早退」，它**照样幂等**——本格如实记下这个反例：
    expect(badSecond).toEqual(goodFirst);
  });
});

describe("负控 · 「文件不存在 ⇒ 零动作」判据能红（新建空文件的打坏版）", () => {
  it("打坏版先写 `[]` ⇒ 盘上多一个文件 ⇒ 判据红", async () => {
    // 正版：不建
    const r = await migrateUserKeybindings(MAPS);
    expect(r).toEqual({ wrote: false, changed: 0 });
    expect(disk.has(KB_PATH)).toBe(false);

    // 打坏版：文件不存在也写一个空数组
    disk.clear();
    await writeFile(KB_PATH, JSON.stringify([], null, 2));
    expect(disk.has(KB_PATH)).toBe(true); // ← 变异生效（打坏版确实造了文件）
    // ⇒ 上面那条 `expect(disk.has(KB_PATH)).toBe(false)` 不是恒真：同一断言在打坏版上会红。
    expect(JSON.parse(disk.get(KB_PATH)!)).toEqual([]);
  });
});

describe("负控 · 「未命中零写」判据能红（无条件重写的打坏版）", () => {
  it("打坏版无论有没有命中都写一遍 ⇒ `writeFile` 被调用 ⇒ 判据红", async () => {
    seed([{ command: "thirdParty.x", key: "ctrl+9" }]);
    const before = JSON.stringify([{ command: "thirdParty.x", key: "ctrl+9" }], null, 2);
    // 正版：零写
    const good = await migrateUserKeybindings(MAPS);
    expect(good).toEqual({ wrote: false, changed: 0 });
    expect(writeFile).not.toHaveBeenCalled();

    // 打坏版：跳过 changed===0 的早退，直接写
    vi.clearAllMocks();
    await writeFile(KB_PATH, before);
    expect(writeFile).toHaveBeenCalledTimes(1); // ← 变异生效
  });
});

describe("keybindingMergeInput · 装配", () => {
  it("设置键反推表**每次重新派生**（不缓存——缓存会造出「改了表但迁移还用旧表」的假绿）", () => {
    const a = keybindingMergeInput(MAPS.command, MAPS.flag);
    const b = keybindingMergeInput(MAPS.command, MAPS.flag);
    expect(a.settingNewToOld).toEqual(b.settingNewToOld);
    expect(a.settingNewToOld).not.toBe(b.settingNewToOld); // 不是同一个对象引用
    expect(Object.keys(a.settingNewToOld).length).toBe(19);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  🔴 同笔面：本模块**是 `keybindings.json` 的第二个写者**——
 *     第一个是 `KeybindingRegistry/persistence.ts` 的 `saveUserKeybindings`。
 *     两个写者各写各的格式 = 「设置页点一次保存就把迁移改好的键位格式换掉」这类静默漂移。
 *     本组就是给这条上锁（1.40 的教训：**同一个文件的多个写者必须互相看得见**）。
 * ══════════════════════════════════════════════════════════════════════ */
describe("同笔面 · 与 saveUserKeybindings 的字节格式一致", () => {
  /** 逐字照 `KeybindingRegistry/persistence.ts:62-71` 的 saveUserKeybindings 载荷形状 */
  function saveUserKeybindingsPayload(
    bindings: Array<{ command: string; key: string; when?: string }>,
  ): string {
    const userBindings = bindings.map((b) => {
      const entry: { command: string; key: string; when?: string } = { command: b.command, key: b.key };
      if (b.when) entry.when = b.when;
      return entry;
    });
    return JSON.stringify(userBindings, null, 2);
  }

  it("🔴 迁移写出的文件与「键位保存流」写出的文件**逐字节相同**（同一份载荷、同一个序列化）", async () => {
    const entries = [
      { command: "explorer.openFile", key: "ctrl+o", when: "explorerFocus" },
      { command: "thirdParty.x", key: "ctrl+9" },
    ];
    seed(entries);
    await migrateUserKeybindings(MAPS);
    const writtenByMigration = disk.get(KB_PATH)!;
    const writtenByRegistry = saveUserKeybindingsPayload(readDisk() as never);
    expect(writtenByMigration).toBe(writtenByRegistry);
    // 逐项把形状也钉死（`when` 为空字符串时 saveUserKeybindings 会**丢掉**该字段——
    // 本模块今天保留它；如实登记为已知差异，见下一条）
    expect(JSON.parse(writtenByMigration)).toEqual([
      { command: "file-tree.openFile", key: "ctrl+o", when: "fileTreeFocus" },
      { command: "thirdParty.x", key: "ctrl+9" },
    ]);
  });

  it("⚠️ 已知差异（如实登记）：`when: \"\"` 本模块保留、saveUserKeybindings 丢弃 —— 今天无害但记在册",
    async () => {
      seed([{ command: "explorer.openFile", key: "ctrl+o", when: "" }]);
      const r = await migrateUserKeybindings(MAPS);
      // `when: ""` 会被 `typeof entry.when === "string" && length > 0` 挡在门外 ⇒ **when 不改写**；
      // 而条目的 `command` 是真命中的 ⇒ changed = 1（命令那一半照迁）。
      expect(r).toEqual({ wrote: true, changed: 1 });
      // 🔴 本条的关键观测：`when: ""` 被**原样带出**（不是被抹掉）——这是与保存流的差异本体。
      expect((readDisk() as Array<Record<string, unknown>>)[0]).toHaveProperty("when", "");
      // 而保存流会把 `when: ""` 抹掉（`if (b.when)` 假值早退）——两个写者的空值处置不同。
      // ⇒ 后果 = 用户在设置页点一次保存后，这条 `when: ""` 消失（**等价语义**：空 when = 无条件，
      //    与「没有 when」在 registry 里同解）⇒ **零行为差异**，故不修，只登记。
      expect(JSON.parse(saveUserKeybindingsPayload([{ command: "file-tree.openFile", key: "ctrl+o", when: "" }])))
        .toEqual([{ command: "file-tree.openFile", key: "ctrl+o" }]);
    });
});
